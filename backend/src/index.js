// backend/src/index.js - ルーター登録修正版
const express = require('express');
const cors = require('cors');
const http = require('http');
const logger = require('./services/logger');
const db = require('./services/database');

require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const server = http.createServer(app);

const systemRouter = require('./routes/system');
app.use('/api/system', systemRouter);

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

// ✅ 修正版: 正しいルート登録順序
console.log('🚀 ルーター登録開始...');

// 1. 連絡先ルーター（最重要）
try {
  const contactsRouter = require('./routes/contacts');
  app.use('/api', contactsRouter);  // ← 重要：/api 直下に登録
  console.log('✅ contacts router 登録成功: /api/campaigns/:id/contacts/*');
} catch (error) {
  console.error('❌ contacts router 登録失敗:', error.message);
  
  // フォールバック用エンドポイント
  app.post('/api/campaigns/:campaignId/contacts/upload', async (req, res) => {
    console.log('🔄 フォールバック CSV アップロード:', req.params.campaignId);
    res.status(503).json({ 
      message: 'contacts router not loaded, using fallback',
      error: 'Service temporarily unavailable'
    });
  });
}

// 2. キャンペーンルーター
try {
  const campaignsRouter = require('./routes/campaigns');
  app.use('/api/campaigns', campaignsRouter);
  console.log('✅ campaigns router 登録成功');
} catch (error) {
  console.warn('⚠️ campaigns router not found, using fallback');
  app.get('/api/campaigns', async (req, res) => {
    try {
      const [campaigns] = await db.query(`
        SELECT c.id, c.name, c.description, c.status, c.created_at, c.updated_at, c.progress,
               ci.number as caller_id_number,
               (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as contact_count
        FROM campaigns c
        LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
        ORDER BY c.created_at DESC
      `);
      
      res.json({
        campaigns: campaigns || [],
        total: campaigns ? campaigns.length : 0,
        page: 1,
        limit: 50,
        totalPages: 1
      });
    } catch (dbError) {
      res.status(500).json({ message: 'キャンペーンの取得に失敗しました' });
    }
  });
}

// 3. 発信者番号ルーター
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

// 4. 通話ルーター
try {
  const callsRouter = require('./routes/calls');
  app.use('/api/calls', callsRouter);
  console.log('✅ calls router 登録成功');
} catch (error) {
  console.warn('⚠️ calls router not found, using fallback');
  app.post('/api/calls/test', async (req, res) => {
    try {
      const { phoneNumber, callerID, mockMode, provider } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ message: '発信先電話番号は必須です' });
      }
      
      const sipService = require('./services/sipService');
      
      const params = {
        phoneNumber,
        callerID: callerID || process.env.DEFAULT_CALLER_ID || '"Auto Dialer" <03-5946-8520>',
        context: 'autodialer',
        exten: 's',
        priority: 1,
        variables: {
          CAMPAIGN_ID: 'TEST',
          CONTACT_ID: 'TEST',
          CONTACT_NAME: 'テストユーザー',
          COMPANY: 'テスト会社'
        },
        mockMode,
        provider
      };
      
      const result = await sipService.originate(params);
      
      res.json({
        success: true,
        callId: result.ActionID,
        message: `テスト発信が開始されました（${result.provider}${mockMode ? 'モード' : ''}）`,
        data: result
      });
      
    } catch (error) {
      console.error('🔥 フォールバック テスト発信エラー:', error);
      res.status(500).json({ 
        message: 'テスト発信に失敗しました', 
        error: error.message
      });
    }
  });
}

// 5. 音声ルーター
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

// 6. IVRルーター
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

console.log('✅ 全ルーター登録完了');

// === 基本エンドポイント ===
app.get('/', (req, res) => {
  res.json({ 
    message: 'オートコールシステムAPI稼働中',
    version: '1.3.1',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/campaigns',
      '/api/campaigns/:id/contacts',
      '/api/campaigns/:id/contacts/upload',
      '/api/caller-ids', 
      '/api/calls',
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

// ✅ キャンペーン詳細API（フォールバック）
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

// ✅ キャンペーン統計API（フォールバック）
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

// ✅ キャンペーン管理API（フォールバック）
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

// キャンペーン開始・停止
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

// 404エラーハンドラー
app.use((req, res, next) => {
  console.log(`❌ 404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    message: '要求されたリソースが見つかりません',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      '/api/campaigns',
      '/api/campaigns/:id/contacts',
      '/api/campaigns/:id/contacts/upload',
      '/api/caller-ids', 
      '/api/calls/test',
      '/api/audio',
      '/api/ivr'
    ]
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

// サーバー起動（修正版）
const startServer = async () => {
  try {
    console.log('🚀 サーバー初期化開始...');
    
    // 1. データベース接続確認
    await db.query('SELECT 1');
    console.log('✅ データベース接続成功');

    // 2. SIPサービス初期化（最優先）
    console.log('🔧 SIPサービス初期化中...');
    const sipService = require('./services/sipService');
    const sipResult = await sipService.connect();
    console.log('📞 SIP初期化結果:', sipResult);
    console.log('📞 SIPアカウント数:', sipService.getAvailableSipAccountCount());

    // 3. CallService初期化
    console.log('🔧 CallService初期化中...');
    const callService = require('./services/callService');
    const callResult = await callService.initialize();
    console.log('📞 CallService初期化結果:', callResult);

    // 4. DialerService初期化
    console.log('🔧 DialerService初期化中...');
    const dialerService = require('./services/dialerService');
    const dialerResult = await dialerService.initialize();
    console.log('🚀 DialerService初期化結果:', dialerResult);
    
    // 5. 最終確認
    console.log('📊 初期化完了状態:');
    console.log('- SIP接続:', sipService.connected);
    console.log('- SIPアカウント:', sipService.getAvailableSipAccountCount());
    console.log('- Dialer初期化:', dialerService.initialized);
    console.log('- Dialerジョブ:', dialerService.dialerJobRunning);
    
    // 6. サーバー起動
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ サーバーが起動しました: http://0.0.0.0:${PORT}`);
      console.log('🎯 自動発信システム準備完了');
      console.log('🔗 利用可能なエンドポイント:');
      console.log('  - GET  /api/campaigns');
      console.log('  - GET  /api/campaigns/:id');
      console.log('  - GET  /api/campaigns/:id/contacts');
      console.log('  - POST /api/campaigns/:id/contacts/upload');
      console.log('  - GET  /api/caller-ids');
      console.log('  - POST /api/calls/test');
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

// サーバー起動実行
startServer().catch(err => {
  console.error('startServer実行エラー:', err);
  process.exit(1);
});
