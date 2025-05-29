// backend/src/index.js - SIP初期化修正版
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

// ✅ ルーター登録
console.log('🚀 ルーター登録開始...');

const routerStatus = {
  system: false,
  contacts: false,
  campaigns: false,
  callerIds: false,
  calls: false,
  audio: false,
  ivr: false
};

// 1. システムルーター
try {
  const systemRouter = require('./routes/system');
  app.use('/api/system', systemRouter);
  routerStatus.system = true;
  console.log('✅ system router 登録成功');
} catch (error) {
  console.error('❌ system router 登録失敗:', error.message);
}

// 2. 連絡先ルーター
try {
  const contactsRouter = require('./routes/contacts');
  app.use('/api', contactsRouter);
  routerStatus.contacts = true;
  console.log('✅ contacts router 登録成功');
} catch (error) {
  console.error('❌ contacts router 登録失敗:', error.message);
}

// 3. キャンペーンルーター
try {
  const campaignsRouter = require('./routes/campaigns');
  app.use('/api/campaigns', campaignsRouter);
  routerStatus.campaigns = true;
  console.log('✅ campaigns router 登録成功');
} catch (error) {
  console.error('❌ campaigns router 登録失敗:', error.message);
}

// 4. 発信者番号ルーター
try {
  const callerIdsRouter = require('./routes/callerIds');
  app.use('/api/caller-ids', callerIdsRouter);
  routerStatus.callerIds = true;
  console.log('✅ caller-ids router 登録成功');
} catch (error) {
  console.error('❌ caller-ids router 登録失敗:', error.message);
}

// 5. 通話ルーター
try {
  const callsRouter = require('./routes/calls');
  app.use('/api/calls', callsRouter);
  routerStatus.calls = true;
  console.log('✅ calls router 登録成功');
} catch (error) {
  console.error('❌ calls router 登録失敗:', error.message);
}

// 6. 音声ルーター
try {
  const audioRouter = require('./routes/audio');
  app.use('/api/audio', audioRouter);
  routerStatus.audio = true;
  console.log('✅ audio router 登録成功');
} catch (error) {
  console.error('❌ audio router 登録失敗:', error.message);
}

// 7. IVRルーター
try {
  const ivrRouter = require('./routes/ivr');
  app.use('/api/ivr', ivrRouter);
  routerStatus.ivr = true;
  console.log('✅ ivr router 登録成功');
} catch (error) {
  console.error('❌ ivr router 登録失敗:', error.message);
}

console.log('📊 ルーター登録状況:', routerStatus);

// === 基本エンドポイント ===
app.get('/', (req, res) => {
  res.json({ 
    message: 'オートコールシステムAPI稼働中',
    version: '1.4.0',
    timestamp: new Date().toISOString(),
    routerStatus: routerStatus,
    endpoints: [
      '/api/system/health',
      '/api/campaigns',
      '/api/campaigns/:id/contacts',
      '/api/campaigns/:id/contacts/upload',
      '/api/caller-ids', 
      '/api/calls/test',
      '/api/audio',
      '/api/ivr/test-call'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    server: 'main',
    routerStatus: routerStatus
  });
});

// === フォールバック用の基本API ===
if (!routerStatus.campaigns) {
  console.log('🔄 キャンペーンルーターフォールバック登録中...');
  
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
    } catch (error) {
      console.error('フォールバック キャンペーン一覧エラー:', error);
      res.status(500).json({ 
        campaigns: [], 
        total: 0, 
        message: 'キャンペーンの取得に失敗しました' 
      });
    }
  });

  app.get('/api/campaigns/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const [campaigns] = await db.query(`
        SELECT c.*, 
               ci.number as caller_id_number,
               ci.description as caller_id_description,
               (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as contact_count
        FROM campaigns c
        LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.id = ?
      `, [id]);
      
      if (campaigns.length === 0) {
        return res.status(404).json({ message: 'キャンペーンが見つかりません' });
      }
      
      res.json(campaigns[0]);
    } catch (error) {
      console.error(`フォールバック キャンペーン詳細エラー: ID=${req.params.id}`, error);
      res.status(500).json({ message: 'データの取得に失敗しました' });
    }
  });

  app.get('/api/campaigns/:id/stats', async (req, res) => {
    try {
      const { id } = req.params;
      
      const [campaigns] = await db.query('SELECT * FROM campaigns WHERE id = ?', [id]);
      
      if (campaigns.length === 0) {
        return res.status(404).json({ message: 'キャンペーンが見つかりません' });
      }
      
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
      
      const [callStats] = await db.query(`
        SELECT 
          COUNT(*) as total_calls,
          SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered_calls,
          AVG(duration) as avg_duration
        FROM call_logs 
        WHERE campaign_id = ?
      `, [id]);
      
      const contactStat = contactStats[0];
      const callStat = callStats[0];
      
      const progress = contactStat.total > 0 
        ? Math.round(((contactStat.completed + contactStat.failed + contactStat.dnc) / contactStat.total) * 100) 
        : 0;
      
      res.json({
        campaignId: parseInt(id),
        campaignName: campaigns[0].name,
        campaignStatus: campaigns[0].status,
        progress,
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
          avgDuration: callStat.avg_duration ? Math.round(callStat.avg_duration) : 0
        }
      });
    } catch (error) {
      console.error(`フォールバック キャンペーン統計エラー: Campaign=${req.params.id}`, error);
      res.status(500).json({ message: 'データの取得に失敗しました' });
    }
  });

  app.post('/api/campaigns/:id/start', async (req, res) => {
    try {
      const { id } = req.params;
      
      const [result] = await db.query(
        'UPDATE campaigns SET status = "active", updated_at = NOW() WHERE id = ?',
        [id]
      );
      
      if (result.affectedRows === 0) {
        return res.status(400).json({ message: 'キャンペーンが見つかりません' });
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
      
      const [result] = await db.query(
        'UPDATE campaigns SET status = "paused", updated_at = NOW() WHERE id = ?',
        [id]
      );
      
      if (result.affectedRows === 0) {
        return res.status(400).json({ message: 'キャンペーンが見つかりません' });
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
}

// 発信者番号フォールバック
if (!routerStatus.callerIds) {
  app.get('/api/caller-ids', async (req, res) => {
    try {
      const [callerIds] = await db.query('SELECT * FROM caller_ids WHERE active = 1 ORDER BY created_at DESC');
      res.json(callerIds);
    } catch (error) {
      console.error('発信者番号取得エラー:', error);
      res.status(500).json({ message: '発信者番号の取得に失敗しました' });
    }
  });
}

// テスト発信フォールバック
if (!routerStatus.calls) {
  app.post('/api/calls/test', async (req, res) => {
    try {
      const { phoneNumber, callerID, mockMode } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ message: '発信先電話番号は必須です' });
      }
      
      res.json({
        success: true,
        callId: `test-${Date.now()}`,
        message: 'テスト発信が開始されました（フォールバック）',
        mockMode: true
      });
    } catch (error) {
      console.error('テスト発信エラー:', error);
      res.status(500).json({ message: 'テスト発信に失敗しました' });
    }
  });
}

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

// 🔥 修正版: SIP初期化を含むサーバー起動
const startServer = async () => {
  try {
    console.log('🚀 サーバー初期化開始...');
    
    // 1. データベース接続確認
    await db.query('SELECT 1');
    console.log('✅ データベース接続成功');

    // 2. SIPサービス初期化（最重要！）
    console.log('🔧 SIPサービス初期化中...');
    try {
      const sipService = require('./services/sipService');
      const sipResult = await sipService.connect();
      console.log('📞 SIP初期化結果:', sipResult);
      console.log('📞 SIPアカウント数:', sipService.getAvailableSipAccountCount());
      
      if (sipResult) {
        console.log('✅ SIPサービス初期化成功');
      } else {
        console.log('⚠️ SIPサービス初期化失敗（続行）');
      }
    } catch (sipError) {
      console.error('❌ SIPサービス初期化エラー（続行）:', sipError.message);
    }

    // 3. CallService初期化
    console.log('🔧 CallService初期化中...');
    try {
      const callService = require('./services/callService');
      const callResult = await callService.initialize();
      console.log('📞 CallService初期化結果:', callResult);
      
      if (callResult) {
        console.log('✅ CallService初期化成功');
      } else {
        console.log('⚠️ CallService初期化失敗（続行）');
      }
    } catch (callError) {
      console.error('❌ CallService初期化エラー（続行）:', callError.message);
    }

    // 4. DialerService初期化
    console.log('🔧 DialerService初期化中...');
    try {
      const dialerService = require('./services/dialerService');
      const dialerResult = await dialerService.initialize();
      
      if (dialerResult) {
        console.log('✅ DialerService初期化成功');
      } else {
        console.log('⚠️ DialerService初期化失敗（続行）');
      }
      
    } catch (dialerError) {
      console.error('❌ DialerService初期化エラー（続行）:', dialerError.message);
    }
    
    // 5. 最終確認
    console.log('📊 初期化完了状態:');
    try {
      const sipService = require('./services/sipService');
      const callService = require('./services/callService');
      const dialerService = require('./services/dialerService');
      
      console.log('- SIP接続:', sipService.connected || false);
      console.log('- SIPアカウント:', sipService.getAvailableSipAccountCount ? sipService.getAvailableSipAccountCount() : 0);
      console.log('- Dialer初期化:', dialerService.initialized || false);
      console.log('- Dialerジョブ:', dialerService.dialerIntervalId ? 'active' : 'inactive');
    } catch (statusError) {
      console.warn('ステータス確認エラー:', statusError.message);
    }
    
    // 6. サーバー起動
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ サーバーが起動しました: http://0.0.0.0:${PORT}`);
      console.log('🎯 自動発信システム準備完了');
      console.log('🔗 利用可能なエンドポイント:');
      console.log('  - GET  /health');
      console.log('  - GET  /api/system/health');
      console.log('  - GET  /api/campaigns');
      console.log('  - POST /api/calls/test');
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
