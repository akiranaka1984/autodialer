// backend/src/routes/callerIds.js - Asterisk Realtime統合版
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const logger = require('../services/logger');

// ===== Asterisk Realtime 自動登録関数 =====
async function registerToAsteriskRealtime(channel, callerId) {
  const channelId = channel.username;
  
  try {
    // トランザクション開始
    await db.query('START TRANSACTION');
    
    try {
      // ps_endpoints に登録
      await db.query(`
        INSERT INTO ps_endpoints (id, transport, aors, auth, context, allow, direct_media, callerid)
        VALUES (?, 'transport-udp', ?, ?, 'autodialer', 'ulaw,alaw', 'no', ?)
        ON DUPLICATE KEY UPDATE 
          callerid = VALUES(callerid),
          transport = VALUES(transport),
          context = VALUES(context),
          allow = VALUES(allow)
      `, [channelId, channelId, channelId, `"${callerId.number}" <${callerId.number}>`]);
      
      // ps_auths に登録
      await db.query(`
        INSERT INTO ps_auths (id, auth_type, username, password)
        VALUES (?, 'userpass', ?, ?)
        ON DUPLICATE KEY UPDATE 
          password = VALUES(password),
          auth_type = VALUES(auth_type)
      `, [channelId, channelId, channel.password]);
      
      // ps_aors に登録
      await db.query(`
        INSERT INTO ps_aors (id, max_contacts, qualify_frequency)
        VALUES (?, 1, 60)
        ON DUPLICATE KEY UPDATE 
          max_contacts = VALUES(max_contacts),
          qualify_frequency = VALUES(qualify_frequency)
      `, [channelId]);
      
      // アウトバウンド登録を追加（新規追加部分）
      if (channel.domain || callerId.domain) {
        const domain = channel.domain || callerId.domain;
        await db.query(`
          INSERT INTO ps_outbound_registrations 
          (id, server_uri, client_uri, contact_user, transport, outbound_auth, expiration, retry_interval)
          VALUES (?, ?, ?, ?, 'transport-udp', ?, 3600, 60)
          ON DUPLICATE KEY UPDATE 
            server_uri = VALUES(server_uri),
            client_uri = VALUES(client_uri),
            outbound_auth = VALUES(outbound_auth)
        `, [
          channelId,
          `sip:${domain}`,
          `sip:${channelId}@${domain}`,
          channelId,
          channelId
        ]);
      }
      
      // コミット
      await db.query('COMMIT');
      
      logger.info(`✅ Asterisk Realtime登録完了（アウトバウンド含む）: ${channelId}`);
      return true;
      
    } catch (error) {
      // エラー時はロールバック
      await db.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    logger.error(`❌ Asterisk Realtime登録エラー: ${error.message}`);
    throw error;
  }
}

// 既存のチャンネルを削除する関数
async function removeFromAsteriskRealtime(channelId) {
  try {
    await db.query('DELETE FROM ps_endpoints WHERE id = ?', [channelId]);
    await db.query('DELETE FROM ps_auths WHERE id = ?', [channelId]);
    await db.query('DELETE FROM ps_aors WHERE id = ?', [channelId]);
    
    logger.info(`✅ Asterisk Realtimeから削除完了: ${channelId}`);
    return true;
  } catch (error) {
    logger.error(`❌ Asterisk Realtime削除エラー: ${error.message}`);
    throw error;
  }
}
// ===== ここまでが追加部分 =====

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
router.get('/', async (req, res) => {
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
router.get('/:id', async (req, res) => {
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
router.post('/', async (req, res) => {
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
router.put('/:id', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
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
router.get('/:id/channels', async (req, res) => {
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

// チャンネル追加（Asterisk Realtime統合）
router.post('/:id/channels', async (req, res) => {
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
    
    // 発信者番号情報を取得
    const [callerIdData] = await db.query(
      'SELECT * FROM caller_ids WHERE id = ?',
      [callerId]
    );
    
    if (callerIdData.length === 0) {
      return res.status(404).json({ message: '発信者番号が見つかりません' });
    }
    
    const callerInfo = callerIdData[0];
    
    // チャンネルを追加
    const [result] = await db.query(`
      INSERT INTO caller_channels (caller_id_id, username, password, channel_type, status, created_at)
      VALUES (?, ?, ?, ?, 'available', NOW())
    `, [callerId, username, password, channel_type || 'both']);
    
    // Asterisk Realtimeに自動登録
    try {
      await registerToAsteriskRealtime(
        { username, password, domain: callerInfo.domain },
        callerInfo
      );
      logger.info(`✅ チャンネル ${username} をAsterisk Realtimeに登録しました`);
    } catch (asteriskError) {
      logger.error('Asterisk Realtime登録エラー（チャンネルは追加済み）:', asteriskError);
      // Asterisk登録に失敗してもチャンネル追加は成功として扱う
    }
    
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

// チャンネル編集
router.put("/channels/:channelId", async (req, res) => {
  try {
    const channelId = req.params.channelId;
    const { username, password, channel_type } = req.body;
    
    console.log("チャンネル編集開始:", { channelId, username, channel_type });
    
    if (!username || !password) {
      return res.status(400).json({ message: "ユーザー名とパスワードは必須です" });
    }
    
    // 重複チェック（自分以外）
    const [existing] = await db.query(
      "SELECT id FROM caller_channels WHERE username = ? AND id != ?",
      [username, channelId]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ message: "このユーザー名は既に登録されています" });
    }
    
    const [result] = await db.query(`
      UPDATE caller_channels 
      SET username = ?, password = ?, channel_type = ?
      WHERE id = ?
    `, [username, password, channel_type || "both", channelId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "チャンネルが見つかりません" });
    }
    
    const [updatedChannel] = await db.query(
      "SELECT * FROM caller_channels WHERE id = ?",
      [channelId]
    );
    
    console.log("チャンネル編集成功:", channelId);
    res.json(updatedChannel[0]);
    
  } catch (error) {
    console.error("チャンネル編集エラー:", error);
    res.status(500).json({ message: "チャンネルの編集に失敗しました" });
  }
});

// チャンネル削除（Asterisk Realtime統合）
router.delete("/channels/:channelId", async (req, res) => {
  try {
    const channelId = req.params.channelId;
    
    console.log("チャンネル削除開始:", channelId);
    
    // 削除するチャンネルの情報を取得
    const [channels] = await db.query(
      'SELECT username FROM caller_channels WHERE id = ?',
      [channelId]
    );
    
    if (channels.length === 0) {
      return res.status(404).json({ message: 'チャンネルが見つかりません' });
    }
    
    const channel = channels[0];
    
    // データベースから削除
    const [result] = await db.query(
      "DELETE FROM caller_channels WHERE id = ?",
      [channelId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "チャンネルが見つかりません" });
    }
    
    // Asterisk Realtimeからも削除
    try {
      await removeFromAsteriskRealtime(channel.username);
      logger.info(`✅ チャンネル ${channel.username} をAsterisk Realtimeから削除しました`);
    } catch (asteriskError) {
      logger.error('Asterisk Realtime削除エラー:', asteriskError);
    }
    
    console.log("チャンネル削除成功:", channelId);
    res.json({ 
      success: true,
      message: "チャンネルを削除しました" 
    });
    
  } catch (error) {
    console.error("チャンネル削除エラー:", error);
    res.status(500).json({ message: "チャンネルの削除に失敗しました" });
  }
});

module.exports = router;
