// backend/src/index.js - 修正版
const express = require('express');
const cors = require('cors');
const http = require('http');
const logger = require('./services/logger');
const db = require('./services/database');

// 環境変数の読み込み
require('dotenv').config();

// Express アプリケーションの初期化
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

// ルート登録（存在確認付き）
try {
  const campaignsRouter = require('./routes/campaigns');
  app.use('/api/campaigns', campaignsRouter);
} catch (error) {
  console.warn('campaigns router not found, using fallback');
  app.get('/api/campaigns', (req, res) => {
    res.json({ message: 'campaigns API準備中' });
  });
}

try {
  const callerIdsRouter = require('./routes/callerIds');
  app.use('/api/caller-ids', callerIdsRouter);
} catch (error) {
  console.warn('callerIds router not found, using fallback');
}

try {
  const callsRouter = require('./routes/calls');
  app.use('/api/calls', callsRouter);
} catch (error) {
  console.warn('calls router not found, using fallback');
  app.get('/api/calls', (req, res) => {
    res.json({ message: 'calls API準備中' });
  });
}

try {
  const contactsRouter = require('./routes/contacts');
  app.use('/api/contacts', contactsRouter);
} catch (error) {
  console.warn('contacts router not found, using fallback');
  app.get('/api/contacts', (req, res) => {
    res.json({ message: 'contacts API準備中' });
  });
}

try {
  const audioRouter = require('./routes/audio');
  app.use('/api/audio', audioRouter);
} catch (error) {
  console.warn('audio router not found, using fallback');
  app.get('/api/audio', (req, res) => {
    res.json({ message: 'audio API準備中' });
  });
}

try {
  const ivrRouter = require('./routes/ivr');
  app.use('/api/ivr', ivrRouter);
} catch (error) {
  console.warn('ivr router not found, using fallback');
  app.get('/api/ivr', (req, res) => {
    res.json({ message: 'ivr API準備中' });
  });
}

// === 基本エンドポイント ===
app.get('/', (req, res) => {
  res.json({ 
    message: 'オートコールシステムAPI稼働中',
    version: '1.2.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    server: 'main'
  });
});

// === 発信者番号管理API ===
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

// === チャンネル管理API ===
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
    
    // 重複チェック
    const [existing] = await db.query(
      'SELECT id FROM caller_channels WHERE username = ?', 
      [username]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ message: 'このユーザー名は既に使用されています' });
    }
    
    // チャンネル追加
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

// 404エラーハンドラー
app.use((req, res, next) => {
  res.status(404).json({ 
    message: '要求されたリソースが見つかりません',
    path: req.originalUrl,
    method: req.method
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
