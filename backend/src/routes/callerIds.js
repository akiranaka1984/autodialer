// backend/src/routes/callerIds.js - 500エラー修正版
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const logger = require('../services/logger');

// 認証ミドルウェア（簡易版）
const auth = (req, res, next) => {
  // 開発環境では認証をスキップ
  if (process.env.NODE_ENV === 'development') {
    req.user = { id: 1, role: 'admin' };
    return next();
  }
  
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: '認証が必要です' });
  }
  
  req.user = { id: 1, role: 'admin' };
  next();
};

// 発信者番号の取得（エラーハンドリング強化）
router.get('/', auth, async (req, res) => {
  try {
    console.log('発信者番号一覧取得開始');
    
    // データベース接続確認
    const healthCheck = await db.healthCheck();
    if (!healthCheck.healthy) {
      console.error('データベースヘルスチェック失敗:', healthCheck);
      return res.status(500).json({ 
        message: 'データベース接続エラー',
        error: healthCheck.error 
      });
    }
    
    console.log('データベース接続確認完了');
    
    // 発信者番号とチャンネル統計を取得
    const query = `
      SELECT 
        ci.id,
        ci.number,
        ci.description,
        ci.provider,
        ci.domain,
        ci.active,
        ci.created_at,
        COUNT(cc.id) as channelCount,
        COUNT(CASE WHEN cc.status = 'available' THEN 1 END) as availableChannels
      FROM caller_ids ci
      LEFT JOIN caller_channels cc ON ci.id = cc.caller_id_id
      GROUP BY ci.id
      ORDER BY ci.created_at DESC
    `;
    
    console.log('クエリ実行開始');
    const [callerIds] = await db.query(query);
    console.log(`クエリ実行完了: ${callerIds.length}件取得`);
    
    // データの正規化
    const normalizedCallerIds = callerIds.map(callerId => ({
      id: callerId.id,
      number: callerId.number || '',
      description: callerId.description || '',
      provider: callerId.provider || '',
      domain: callerId.domain || '',
      active: Boolean(callerId.active),
      channelCount: parseInt(callerId.channelCount) || 0,
      availableChannels: parseInt(callerId.availableChannels) || 0,
      created_at: callerId.created_at
    }));
    
    console.log('発信者番号一覧取得成功:', normalizedCallerIds.length);
    res.json(normalizedCallerIds);
    
  } catch (error) {
    console.error('発信者番号取得エラー詳細:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      stack: error.stack
    });
    
    logger.error('発信者番号取得エラー:', error);
    
    res.status(500).json({ 
      message: '発信者番号の取得に失敗しました',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
    });
  }
});

// 発信者番号の詳細取得
router.get('/:id', auth, async (req, res) => {
  try {
    const callerId = req.params.id;
    console.log(`発信者番号詳細取得: ID=${callerId}`);
    
    const [callerIds] = await db.query(`
      SELECT 
        ci.*,
        COUNT(cc.id) as channelCount,
        COUNT(CASE WHEN cc.status = 'available' THEN 1 END) as availableChannels
      FROM caller_ids ci
      LEFT JOIN caller_channels cc ON ci.id = cc.caller_id_id
      WHERE ci.id = ?
      GROUP BY ci.id
    `, [callerId]);
    
    if (callerIds.length === 0) {
      return res.status(404).json({ message: '発信者番号が見つかりません' });
    }
    
    const normalizedCallerId = {
      ...callerIds[0],
      active: Boolean(callerIds[0].active),
      channelCount: parseInt(callerIds[0].channelCount) || 0,
      availableChannels: parseInt(callerIds[0].availableChannels) || 0
    };
    
    console.log('発信者番号詳細取得成功:', normalizedCallerId.id);
    res.json(normalizedCallerId);
    
  } catch (error) {
    console.error('発信者番号詳細取得エラー:', error);
    logger.error('発信者番号詳細取得エラー:', error);
    res.status(500).json({ 
      message: '発信者番号の取得に失敗しました',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
    });
  }
});

// 発信者番号の追加
router.post('/', auth, async (req, res) => {
  try {
    const { number, description, provider, domain, active } = req.body;
    
    console.log('発信者番号追加開始:', { number, description, provider });
    
    // 入力検証
    if (!number) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    // 重複チェック
    const [existing] = await db.query(
      'SELECT id FROM caller_ids WHERE number = ?',
      [number]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ message: 'この電話番号は既に登録されています' });
    }
    
    // 発信者番号を追加
    const [result] = await db.query(`
      INSERT INTO caller_ids (number, description, provider, domain, active, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `, [number, description || '', provider || '', domain || '', Boolean(active)]);
    
    // 追加された発信者番号を取得
    const [newCallerId] = await db.query(
      'SELECT * FROM caller_ids WHERE id = ?',
      [result.insertId]
    );
    
    const normalizedNewCallerId = {
      ...newCallerId[0],
      active: Boolean(newCallerId[0].active),
      channelCount: 0,
      availableChannels: 0
    };
    
    console.log('発信者番号追加成功:', normalizedNewCallerId.id);
    res.status(201).json(normalizedNewCallerId);
    
  } catch (error) {
    console.error('発信者番号追加エラー:', error);
    logger.error('発信者番号追加エラー:', error);
    res.status(500).json({ 
      message: '発信者番号の追加に失敗しました',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
    });
  }
});

// 発信者番号の更新
router.put('/:id', auth, async (req, res) => {
  try {
    const callerId = req.params.id;
    const { number, description, provider, domain, active } = req.body;
    
    console.log('発信者番号更新開始:', { id: callerId, number, description });
    
    // 入力検証
    if (!number) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    // 存在確認
    const [existing] = await db.query(
      'SELECT id FROM caller_ids WHERE id = ?',
      [callerId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ message: '発信者番号が見つかりません' });
    }
    
    // 重複チェック（自分以外）
    const [duplicate] = await db.query(
      'SELECT id FROM caller_ids WHERE number = ? AND id != ?',
      [number, callerId]
    );
    
    if (duplicate.length > 0) {
      return res.status(400).json({ message: 'この電話番号は既に登録されています' });
    }
    
    // 発信者番号を更新
    await db.query(`
      UPDATE caller_ids 
      SET number = ?, description = ?, provider = ?, domain = ?, active = ?
      WHERE id = ?
    `, [number, description || '', provider || '', domain || '', Boolean(active), callerId]);
    
    // 更新された発信者番号を取得
    const [updatedCallerId] = await db.query(`
      SELECT 
        ci.*,
        COUNT(cc.id) as channelCount,
        COUNT(CASE WHEN cc.status = 'available' THEN 1 END) as availableChannels
      FROM caller_ids ci
      LEFT JOIN caller_channels cc ON ci.id = cc.caller_id_id
      WHERE ci.id = ?
      GROUP BY ci.id
    `, [callerId]);
    
    const normalizedUpdatedCallerId = {
      ...updatedCallerId[0],
      active: Boolean(updatedCallerId[0].active),
      channelCount: parseInt(updatedCallerId[0].channelCount) || 0,
      availableChannels: parseInt(updatedCallerId[0].availableChannels) || 0
    };
    
    console.log('発信者番号更新成功:', normalizedUpdatedCallerId.id);
    res.json(normalizedUpdatedCallerId);
    
  } catch (error) {
    console.error('発信者番号更新エラー:', error);
    logger.error('発信者番号更新エラー:', error);
    res.status(500).json({ 
      message: '発信者番号の更新に失敗しました',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
    });
  }
});

// 発信者番号の削除
router.delete('/:id', auth, async (req, res) => {
  try {
    const callerId = req.params.id;
    console.log('発信者番号削除開始:', callerId);
    
    // 使用中かチェック
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE caller_id_id = ?',
      [callerId]
    );
    
    if (campaigns.length > 0) {
      return res.status(400).json({ 
        message: 'この発信者番号は現在キャンペーンで使用中のため削除できません'
      });
    }
    
    // チャンネル数を取得
    const [channels] = await db.query(
      'SELECT COUNT(*) as count FROM caller_channels WHERE caller_id_id = ?',
      [callerId]
    );
    
    const channelCount = channels[0].count;
    
    // 関連チャンネルを削除
    await db.query('DELETE FROM caller_channels WHERE caller_id_id = ?', [callerId]);
    
    // 発信者番号を削除
    const [result] = await db.query('DELETE FROM caller_ids WHERE id = ?', [callerId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '発信者番号が見つかりません' });
    }
    
    console.log('発信者番号削除成功:', callerId, `チャンネル${channelCount}件も削除`);
    res.json({ 
      message: '発信者番号を削除しました',
      deletedChannels: channelCount
    });
    
  } catch (error) {
    console.error('発信者番号削除エラー:', error);
    logger.error('発信者番号削除エラー:', error);
    res.status(500).json({ 
      message: '発信者番号の削除に失敗しました',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
    });
  }
});

// チャンネル管理関連のルート
router.get('/:id/channels', auth, async (req, res) => {
  try {
    const callerId = req.params.id;
    console.log('チャンネル一覧取得:', callerId);
    
    const [channels] = await db.query(`
      SELECT * FROM caller_channels 
      WHERE caller_id_id = ? 
      ORDER BY created_at DESC
    `, [callerId]);
    
    console.log('チャンネル一覧取得成功:', channels.length);
    res.json(channels);
    
  } catch (error) {
    console.error('チャンネル一覧取得エラー:', error);
    res.status(500).json({ message: 'チャンネルの取得に失敗しました' });
  }
});

router.post('/:id/channels', auth, async (req, res) => {
  try {
    const callerId = req.params.id;
    const { username, password, channel_type } = req.body;
    
    console.log('チャンネル追加開始:', { callerId, username, channel_type });
    
    if (!username || !password) {
      return res.status(400).json({ message: 'ユーザー名とパスワードは必須です' });
    }
    
    // 重複チェック
    const [existing] = await db.query(
      'SELECT id FROM caller_channels WHERE username = ?',
      [username]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ message: 'このユーザー名は既に登録されています' });
    }
    
    const [result] = await db.query(`
      INSERT INTO caller_channels (caller_id_id, username, password, channel_type, status, created_at)
      VALUES (?, ?, ?, ?, 'available', NOW())
    `, [callerId, username, password, channel_type || 'both']);
    
    const [newChannel] = await db.query(
      'SELECT * FROM caller_channels WHERE id = ?',
      [result.insertId]
    );
    
    console.log('チャンネル追加成功:', newChannel[0].id);
    res.status(201).json(newChannel[0]);
    
  } catch (error) {
    console.error('チャンネル追加エラー:', error);
    res.status(500).json({ message: 'チャンネルの追加に失敗しました' });
  }
});

// エラーハンドリング
router.use((error, req, res, next) => {
  console.error('ルートエラー:', error);
  logger.error('ルートエラー:', error);
  res.status(500).json({ 
    message: 'サーバーエラーが発生しました',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
  });
});

module.exports = router;