// backend/src/index.js - 修正版
const express = require('express');
const cors = require('cors');
const http = require('http');
const logger = require('./services/logger');
const db = require('./services/database');

require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const server = http.createServer(app);

// CORS設定
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://localhost:3003',
    'http://127.0.0.1:3003',
    'http://143.198.209.38:3003'
  ];
  
  if (allowedOrigins.includes(origin) || !origin) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// ミドルウェア
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// リクエストログ
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// ✅ 修正版: ルート登録（存在確認付き）
try {
  const campaignsRouter = require('./routes/campaigns');
  app.use('/api/campaigns', campaignsRouter);
  console.log('✅ campaigns router 登録成功');
} catch (error) {
  console.warn('⚠️ campaigns router not found, using fallback');
  app.get('/api/campaigns', (req, res) => {
    res.json({ message: 'campaigns API準備中', status: 'fallback' });
  });
}

try {
  const callerIdsRouter = require('./routes/callerIds');
  app.use('/api/caller-ids', callerIdsRouter);
  console.log('✅ caller-ids router 登録成功');
} catch (error) {
  console.warn('⚠️ caller-ids router not found, using fallback');
  app.get('/api/caller-ids', async (req, res) => {
    try {
      const [callerIds] = await db.query('SELECT * FROM caller_ids WHERE active = 1 ORDER BY created_at DESC');
      res.json(callerIds);
    } catch (dbError) {
      res.status(500).json({ message: '発信者番号の取得に失敗しました' });
    }
  });
}

try {
  const callsRouter = require('./routes/calls');
  app.use('/api/calls', callsRouter);
  console.log('✅ calls router 登録成功');
} catch (error) {
  console.warn('⚠️ calls router not found, using fallback');
  app.get('/api/calls', (req, res) => {
    res.json({ message: 'calls API準備中', status: 'fallback' });
  });
}

// ✅ 新規追加: 連絡先ルーター
try {
  const contactsRouter = require('./routes/contacts');
  app.use('/api/contacts', contactsRouter);
  console.log('✅ contacts router 登録成功');
} catch (error) {
  console.warn('⚠️ contacts router not found, using fallback');
  app.get('/api/contacts', (req, res) => {
    res.json({ message: 'contacts API準備中', status: 'fallback' });
  });
}

try {
  const audioRouter = require('./routes/audio');
  app.use('/api/audio', audioRouter);
  console.log('✅ audio router 登録成功');
} catch (error) {
  console.warn('⚠️ audio router not found, using fallback');
  app.get('/api/audio', (req, res) => {
    res.json({ message: 'audio API準備中', status: 'fallback' });
  });
}

try {
  const ivrRouter = require('./routes/ivr');
  app.use('/api/ivr', ivrRouter);
  console.log('✅ ivr router 登録成功');
} catch (error) {
  console.warn('⚠️ ivr router not found, using fallback');
  app.get('/api/ivr', (req, res) => {
    res.json({ message: 'ivr API準備中', status: 'fallback' });
  });
}

// === 基本エンドポイント ===
app.get('/', (req, res) => {
  res.json({ 
    message: 'オートコールシステムAPI稼働中',
    version: '1.3.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/campaigns',
      '/api/caller-ids', 
      '/api/calls',
      '/api/contacts',
      '/api/audio',
      '/api/ivr'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    server: 'main'
  });
});

// === フォールバック用の基本API ===

// ✅ 新規追加: キャンペーン詳細API（フォールバック）
app.get('/api/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`フォールバック キャンペーン詳細API呼び出し: ID=${id}`);
    
    const [campaigns] = await db.query(`
      SELECT c.*, 
             ci.number as caller_id_number,
             ci.description as caller_id_description,
             ci.provider as caller_id_provider,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as contact_count,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'pending') as pending_count,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'completed') as completed_count,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'failed') as failed_count,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'dnc') as dnc_count
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ?
    `, [id]);
    
    if (campaigns.length === 0) {
      console.log(`フォールバック キャンペーンが見つかりません: ID=${id}`);
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    console.log('フォールバック キャンペーン詳細取得成功:', campaigns[0].name);
    res.json(campaigns[0]);
  } catch (error) {
    console.error(`フォールバック キャンペーン詳細エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// ✅ 新規追加: キャンペーン連絡先一覧API（フォールバック）
app.get('/api/campaigns/:id/contacts', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100, offset = 0, status, search } = req.query;
    
    console.log(`フォールバック キャンペーン連絡先API呼び出し: Campaign=${id}`);
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT id, name FROM campaigns WHERE id = ?', [id]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    let query = `
      SELECT c.*
      FROM contacts c
      WHERE c.campaign_id = ?
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM contacts c
      WHERE c.campaign_id = ?
    `;
    
    const params = [id];
    const countParams = [id];
    
    // ステータスでフィルタ
    if (status) {
      query += ' AND c.status = ?';
      countQuery += ' AND c.status = ?';
      params.push(status);
      countParams.push(status);
    }
    
    // 検索フィルタ
    if (search) {
      query += ' AND (c.phone LIKE ? OR c.name LIKE ? OR c.company LIKE ?)';
      countQuery += ' AND (c.phone LIKE ? OR c.name LIKE ? OR c.company LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
      countParams.push(searchParam, searchParam, searchParam);
    }
    
    const queryOffset = parseInt(offset);
    const queryLimit = parseInt(limit);
    query += ` ORDER BY c.created_at DESC LIMIT ${queryLimit} OFFSET ${queryOffset}`;
    
    // クエリ実行
    const [contacts] = await db.query(query, params);
    const [totalResults] = await db.query(countQuery, countParams);
    
    const total = totalResults[0].total;
    
    console.log(`フォールバック キャンペーン ${id} の連絡先: ${contacts.length}件 (全体: ${total}件)`);
    
    res.json({
      contacts: contacts || [],
      total,
      page: Math.floor(queryOffset / queryLimit) + 1,
      limit: queryLimit,
      totalPages: Math.ceil(total / queryLimit),
      campaign: campaigns[0]
    });
  } catch (error) {
    console.error(`フォールバック キャンペーン連絡先エラー: Campaign=${req.params.id}`, error);
    res.status(500).json({ 
      contacts: [],
      total: 0,
      message: 'データの取得に失敗しました' 
    });
  }
});

// ✅ 新規追加: キャンペーン統計API（フォールバック）
app.get('/api/campaigns/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`フォールバック キャンペーン統計API呼び出し: Campaign=${id}`);
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT * FROM campaigns WHERE id = ?', [id]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // 連絡先統計
    const [contactStats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'called' THEN 1 ELSE 0 END) as called,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'dnc' THEN 1 ELSE 0 END) as dnc
      FROM contacts 
      WHERE campaign_id = ?
    `, [id]);
    
    // 通話統計
    const [callStats] = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered_calls,
        SUM(CASE WHEN status = 'NO ANSWER' THEN 1 ELSE 0 END) as no_answer_calls,
        SUM(CASE WHEN status = 'BUSY' THEN 1 ELSE 0 END) as busy_calls,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_calls,
        AVG(duration) as avg_duration
      FROM call_logs 
      WHERE campaign_id = ?
    `, [id]);
    
    const contactStat = contactStats[0];
    const callStat = callStats[0];
    
    // 進捗率を計算
    const progress = contactStat.total > 0 
      ? Math.round(((contactStat.completed + contactStat.failed + contactStat.dnc) / contactStat.total) * 100) 
      : 0;
    
    // 成功率を計算
    const successRate = callStat.total_calls > 0 
      ? Math.round((callStat.answered_calls / callStat.total_calls) * 100) 
      : 0;
    
    console.log(`フォールバック キャンペーン統計取得: Campaign=${id}, Progress=${progress}%`);
    
    res.json({
      campaignId: parseInt(id),
      campaignName: campaigns[0].name,
      campaignStatus: campaigns[0].status,
      progress,
      successRate,
      contacts: {
        total: contactStat.total,
        pending: contactStat.pending,
        called: contactStat.called,
        completed: contactStat.completed,
        failed: contactStat.failed,
        dnc: contactStat.dnc
      },
      calls: {
        total: callStat.total_calls || 0,
        answered: callStat.answered_calls || 0,
        noAnswer: callStat.no_answer_calls || 0,
        busy: callStat.busy_calls || 0,
        failed: callStat.failed_calls || 0,
        avgDuration: callStat.avg_duration ? Math.round(callStat.avg_duration) : 0
      }
    });
  } catch (error) {
    console.error(`フォールバック キャンペーン統計エラー: Campaign=${req.params.id}`, error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// ✅ 新規追加: キャンペーン管理API（フォールバック）
app.get('/api/campaigns', async (req, res) => {
  try {
    console.log('フォールバック キャンペーン一覧API呼び出し');
    
    const [campaigns] = await db.query(`
      SELECT c.id, c.name, c.description, c.status, c.created_at, c.updated_at, c.progress,
             ci.number as caller_id_number,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as contact_count
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      ORDER BY c.created_at DESC
    `);
    
    console.log('フォールバック キャンペーン取得結果:', campaigns ? campaigns.length : 0, '件');
    
    // 修正: 必ず配列を返す
    const response = {
      campaigns: campaigns || [],
      total: campaigns ? campaigns.length : 0,
      page: 1,
      limit: 50,
      totalPages: 1
    };
    
    res.json(response);
  } catch (error) {
    console.error('フォールバック キャンペーン一覧エラー:', error);
    res.status(500).json({ 
      campaigns: [], 
      total: 0, 
      page: 1, 
      limit: 50, 
      totalPages: 0,
      error: 'キャンペーンの取得に失敗しました' 
    });
  }
});

app.post('/api/campaigns/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`フォールバック キャンペーン開始: ID=${id}`);
    
    const [result] = await db.query(
      'UPDATE campaigns SET status = "active", updated_at = NOW() WHERE id = ? AND status != "active"',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(400).json({ message: 'キャンペーンが見つからないか既にアクティブです' });
    }
    
    // 自動発信サービスを開始
    try {
      const autoDialer = require('./services/autoDialer');
      await autoDialer.startCampaign(id);
      console.log(`フォールバック 自動発信サービス開始: Campaign=${id}`);
    } catch (dialerError) {
      console.warn('フォールバック 自動発信サービス開始エラー:', dialerError.message);
    }
    
    res.json({
      success: true,
      message: 'キャンペーンを開始しました',
      campaignId: parseInt(id)
    });
  } catch (error) {
    console.error(`フォールバック キャンペーン開始エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'キャンペーンの開始に失敗しました' });
  }
});

app.post('/api/campaigns/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`フォールバック キャンペーン停止: ID=${id}`);
    
    const [result] = await db.query(
      'UPDATE campaigns SET status = "paused", updated_at = NOW() WHERE id = ? AND status = "active"',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(400).json({ message: 'キャンペーンが見つからないかアクティブではありません' });
    }
    
    // 自動発信サービスを停止
    try {
      const autoDialer = require('./services/autoDialer');
      autoDialer.stopCampaign(id);
      console.log(`フォールバック 自動発信サービス停止: Campaign=${id}`);
    } catch (dialerError) {
      console.warn('フォールバック 自動発信サービス停止エラー:', dialerError.message);
    }
    
    res.json({
      success: true,
      message: 'キャンペーンを停止しました',
      campaignId: parseInt(id)
    });
  } catch (error) {
    console.error(`フォールバック キャンペーン停止エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'キャンペーンの停止に失敗しました' });
  }
});

// 発信者番号管理API
app.get('/api/caller-ids', async (req, res) => {
  try {
    const [callerIds] = await db.query('SELECT * FROM caller_ids WHERE active = 1 ORDER BY created_at DESC');
    res.json(callerIds);
  } catch (error) {
    console.error('発信者番号取得エラー:', error);
    res.status(500).json({ message: '発信者番号の取得に失敗しました' });
  }
});

app.post('/api/caller-ids', async (req, res) => {
  try {
    const { number, description, provider, domain } = req.body;
    
    if (!number) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    const [result] = await db.query(
      'INSERT INTO caller_ids (number, description, provider, domain, active, created_at) VALUES (?, ?, ?, ?, 1, NOW())',
      [number, description, provider, domain]
    );
    
    res.status(201).json({
      id: result.insertId,
      number,
      description,
      provider,
      domain,
      active: 1,
      message: '発信者番号を追加しました'
    });
  } catch (error) {
    console.error('発信者番号追加エラー:', error);
    res.status(500).json({ message: '発信者番号の追加に失敗しました' });
  }
});

// チャンネル管理API
app.get('/api/caller-ids/:id/channels', async (req, res) => {
  try {
    const [channels] = await db.query(
      'SELECT * FROM caller_channels WHERE caller_id_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(channels);
  } catch (error) {
    console.error('チャンネル一覧取得エラー:', error);
    res.status(500).json({ message: 'チャンネルの取得に失敗しました' });
  }
});

app.post('/api/caller-ids/:id/channels', async (req, res) => {
  try {
    const { username, password, channel_type = 'both' } = req.body;
    const caller_id = req.params.id;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'ユーザー名とパスワードは必須です' });
    }
    
    const [existing] = await db.query(
      'SELECT id FROM caller_channels WHERE username = ?', 
      [username]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ message: 'このユーザー名は既に使用されています' });
    }
    
    const [result] = await db.query(
      'INSERT INTO caller_channels (caller_id_id, username, password, channel_type, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [caller_id, username, password, channel_type, 'available']
    );
    
    res.status(201).json({
      id: result.insertId,
      caller_id_id: parseInt(caller_id),
      username,
      channel_type,
      status: 'available',
      message: 'チャンネルを追加しました'
    });
  } catch (error) {
    console.error('チャンネル追加エラー:', error);
    res.status(500).json({ message: 'チャンネルの追加に失敗しました' });
  }
});

app.delete('/api/caller-ids/:callerId/channels/:channelId', async (req, res) => {
  try {
    const { callerId, channelId } = req.params;
    
    const [result] = await db.query(
      'DELETE FROM caller_channels WHERE id = ? AND caller_id_id = ?',
      [channelId, callerId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'チャンネルが見つかりません' });
    }
    
    res.json({ message: 'チャンネルを削除しました' });
  } catch (error) {
    console.error('チャンネル削除エラー:', error);
    res.status(500).json({ message: 'チャンネルの削除に失敗しました' });
  }
});

app.put('/api/caller-ids/:callerId/channels/:channelId', async (req, res) => {
  try {
    const { callerId, channelId } = req.params;
    const { status } = req.body;
    
    const [result] = await db.query(
      'UPDATE caller_channels SET status = ? WHERE id = ? AND caller_id_id = ?',
      [status, channelId, callerId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'チャンネルが見つかりません' });
    }
    
    res.json({ message: 'チャンネル状態を更新しました' });
  } catch (error) {
    console.error('チャンネル状態更新エラー:', error);
    res.status(500).json({ message: 'チャンネル状態の更新に失敗しました' });
  }
});

// ✅ 新規追加: テスト発信エンドポイント（フォールバック）
app.post('/api/calls/test', async (req, res) => {
  try {
    const { phoneNumber, callerID, mockMode, provider } = req.body;
    
    console.log('🔥 フォールバック テスト発信リクエスト受信:', {
      phoneNumber,
      callerID,
      mockMode,
      provider
    });
    
    if (!phoneNumber) {
      return res.status(400).json({ message: '発信先電話番号は必須です' });
    }
    
    // 発信者番号の検証
    let callerIdData = null;
    if (callerID) {
      const [callerIds] = await db.query('SELECT * FROM caller_ids WHERE id = ? AND active = true', [callerID]);
      
      if (callerIds.length === 0) {
        return res.status(400).json({ message: '選択された発信者番号が見つからないか無効です' });
      }
      
      callerIdData = callerIds[0];
    }
    
    // SIPサービスで発信
    const sipService = require('./services/sipService');
    
    const params = {
      phoneNumber,
      callerID: callerIdData 
        ? `"${callerIdData.description || ''}" <${callerIdData.number}>` 
        : process.env.DEFAULT_CALLER_ID || '"Auto Dialer" <03-5946-8520>',
      context: 'autodialer',
      exten: 's',
      priority: 1,
      variables: {
        CAMPAIGN_ID: 'TEST',
        CONTACT_ID: 'TEST',
        CONTACT_NAME: 'テストユーザー',
        COMPANY: 'テスト会社'
      },
      callerIdData,
      mockMode,
      provider
    };
    
    console.log('🚀 SIP発信パラメータ:', params);
    
    const result = await sipService.originate(params);
    
    // 通話ログに記録
    try {
      await db.query(`
        INSERT INTO call_logs 
        (call_id, caller_id_id, phone_number, start_time, status, test_call, call_provider)
        VALUES (?, ?, ?, NOW(), 'ORIGINATING', 1, ?)
      `, [result.ActionID, callerIdData ? callerIdData.id : null, phoneNumber, result.provider]);
    } catch (logError) {
      console.error('通話ログ記録エラー:', logError);
    }
    
    const responseData = {
      success: true,
      callId: result.ActionID,
      message: `テスト発信が開始されました（${result.provider}${mockMode ? 'モード' : ''}）`,
      data: result
    };
    
    if (result.SipAccount) {
      responseData.sipAccount = result.SipAccount;
    }
    
    res.json(responseData);
    
  } catch (error) {
    console.error('🔥 フォールバック テスト発信エラー:', error);
    res.status(500).json({ 
      message: 'テスト発信に失敗しました', 
      error: error.message
    });
  }
});

// 404エラーハンドラー
app.use((req, res, next) => {
  console.log(`❌ 404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    message: '要求されたリソースが見つかりません',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// エラーハンドリングミドルウェア
app.use((err, req, res, next) => {
  console.error('アプリケーションエラー:', err);
  res.status(500).json({ 
    message: '内部サーバーエラー', 
    error: err.message 
  });
});

// サーバー起動
const startServer = async () => {
  try {
    // データベース接続確認
    await db.query('SELECT 1');
    console.log('✅ データベース接続成功');
    
    // サーバー起動
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ サーバーが起動しました: http://0.0.0.0:${PORT}`);
      console.log('🔗 利用可能なエンドポイント:');
      console.log('  - GET  /api/campaigns');
      console.log('  - GET  /api/caller-ids');
      console.log('  - POST /api/calls/test');
      console.log('  - GET  /api/contacts');
      console.log('  - GET  /api/audio');
      console.log('  - POST /api/ivr/test-call');
    });
    
  } catch (error) {
    console.error('❌ サーバー起動エラー:', error);
    process.exit(1);
  }
};

// 未処理エラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// 終了処理
process.on('SIGINT', async () => {
  console.log('アプリケーションを終了します...');
  
  try {
    if (db.close) {
      await db.close();
    }
    
    server.close(() => {
      console.log('サーバーを正常に終了しました');
      process.exit(0);
    });
  } catch (error) {
    console.error('終了処理エラー:', error);
    process.exit(1);
  }
});

// サーバー起動後の初期化
server.on('listening', async () => {
  console.log('🚀 サーバー初期化完了');
  
  // SIPサービス初期化（エラー無視）
  try {
    const sipService = require('./services/sipService');
    await sipService.connect();
    console.log('✅ SIPサービス初期化完了');
  } catch (error) {
    console.warn('⚠️ SIPサービス初期化スキップ:', error.message);
  }
  
  // コールサービス初期化（エラー無視）
  try {
    const callService = require('./services/callService');
    await callService.initialize();
    console.log('✅ コールサービス初期化完了');
  } catch (error) {
    console.warn('⚠️ コールサービス初期化スキップ:', error.message);
  }
});

// サーバー起動実行
startServer().catch(err => {
  console.error('startServer実行エラー:', err);
  process.exit(1);
});
