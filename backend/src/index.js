// backend/src/index.js の修正版
const express = require('express');
const cors = require('cors');
const http = require('http');
const logger = require('./services/logger');
const db = require('./services/database');
const callService = require('./services/callService');  // ここで一度だけ宣言
const websocketService = require('./services/websocketService');

// 環境変数の読み込み
require('dotenv').config();

// Express アプリケーションの初期化
const app = express();
const PORT = process.env.PORT || 5000;

// HTTPサーバーの作成
const server = http.createServer(app);

// WebSocketサービスの初期化
websocketService.initialize(server);

// CORS設定のカスタマイズ
app.use(cors({
  // すべてのオリジンを許可（本番環境では制限することをお勧めします）
  origin: ['http://localhost:3003', 'http://frontend:3000'],
  // 許可するHTTPメソッド
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  // リクエストヘッダーに認証情報を含める許可
  credentials: true,
  // 許可するヘッダー
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// リクエストロギングミドルウェア - デバッグ用に詳細なログを追加
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.url} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// ルートエンドポイント
app.get('/', (req, res) => {
  res.json({ 
    message: 'オートコールシステムAPI稼働中',
    version: '1.1.0',
    mode: process.env.MOCK_ASTERISK === 'true' ? 'モックモード' : '本番モード',
    defaultProvider: process.env.DEFAULT_CALL_PROVIDER || 'asterisk'
  });
});

// ヘルスチェックエンドポイント - CORSのテストにも使用可能
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date(), 
    cors: 'enabled',
    providers: {
      default: process.env.DEFAULT_CALL_PROVIDER,
      mockMode: process.env.MOCK_ASTERISK === 'true',
      fallbackEnabled: process.env.FALLBACK_ENABLED === 'true',
      loadBalancingEnabled: process.env.LOAD_BALANCING_ENABLED === 'true'
    }
  });
});

// 利用可能なルートを確認して使用
try {
  // 発信者番号ルート
  const callerIdRoutes = require('./routes/callerIds');
  app.use('/api/caller-ids', callerIdRoutes);
  logger.info('発信者番号APIを有効化しました');
} catch (error) {
  logger.warn('発信者番号APIの読み込みに失敗しました:', error.message);
}

try {
  // 通話ルート
  const callRoutes = require('./routes/calls');
  app.use('/api/calls', callRoutes);
  logger.info('通話APIを有効化しました');
} catch (error) {
  logger.warn('通話APIの読み込みに失敗しました:', error.message);
}

try {
  // 連絡先ルート
  const contactRoutes = require('./routes/contacts');
  app.use('/api/contacts', contactRoutes);
  logger.info('連絡先APIを有効化しました');
} catch (error) {
  logger.warn('連絡先APIの読み込みに失敗しました:', error.message);
}

try {
  // キャンペーンルート
  const campaignRoutes = require('./routes/campaigns');
  app.use('/api/campaigns', campaignRoutes);
  logger.info('キャンペーンAPIを有効化しました');
} catch (error) {
  logger.warn('キャンペーンAPIの読み込みに失敗しました:', error.message);
}

try {
  // 認証ルート
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  logger.info('認証APIを有効化しました');
} catch (error) {
  logger.warn('認証APIの読み込みに失敗しました:', error.message);
}

try {
  // コールバックルート
  const callbackRoutes = require('./routes/callback');
  app.use('/api/callback', callbackRoutes);
  logger.info('コールバックAPIを有効化しました');
} catch (error) {
  logger.warn('コールバックAPIの読み込みに失敗しました:', error.message);
}

try {
  // 統計ルート
  const statsRoutes = require('./routes/stats');
  app.use('/api/stats', statsRoutes);
  logger.info('統計APIを有効化しました');
} catch (error) {
  logger.warn('統計APIの読み込みに失敗しました:', error.message);
}

// レポートルートを追加
try {
  const reportRoutes = require('./routes/reports');
  app.use('/api/reports', reportRoutes);
  logger.info('レポートAPIを有効化しました');
} catch (error) {
  logger.warn('レポートAPIの読み込みに失敗しました:', error.message);
}

// 設定ルート
try {
  const settingsRoutes = require('./routes/settings');
  app.use('/api/settings', settingsRoutes);
  logger.info('設定APIを有効化しました');
} catch (error) {
  logger.warn('設定APIの読み込みに失敗しました:', error.message);
}

// オペレーター管理ルート
try {
  const operatorRoutes = require('./routes/operators');
  app.use('/api/operators', operatorRoutes);
  logger.info('オペレーター管理APIを有効化しました');
} catch (error) {
  logger.warn('オペレーター管理APIの読み込みに失敗しました:', error.message);
}

// DNCリストルート
try {
  const dncRoutes = require('./routes/dnc');
  app.use('/api/dnc', dncRoutes);
  logger.info('DNCリストAPIを有効化しました');
} catch (error) {
  logger.warn('DNCリストAPIの読み込みに失敗しました:', error.message);
}

// IVRおよび音声ファイル管理ルート
try {
  const audioRoutes = require('./routes/audio');
  app.use('/api/audio', audioRoutes);
  logger.info('音声ファイル管理APIを有効化しました');
} catch (error) {
  logger.warn('音声ファイル管理APIの読み込みに失敗しました:', error.message);
}

try {
  const ivrRoutes = require('./routes/ivr');
  app.use('/api/ivr', ivrRoutes);
  logger.info('IVR設定APIを有効化しました');
} catch (error) {
  logger.warn('IVR設定APIの読み込みに失敗しました:', error.message);
}

// 404エラーハンドリング - すべてのルートに一致しなかった場合
app.use((req, res, next) => {
  res.status(404).json({ message: '要求されたリソースが見つかりません' });
});

// エラーハンドリングミドルウェア
app.use((err, req, res, next) => {
  logger.error('アプリケーションエラー:', err);
  res.status(500).json({ message: '内部サーバーエラー', error: err.message });
});

// サーバー起動
const startServer = async () => {
  try {
    // データベース接続確認
    await db.query('SELECT 1');
    logger.info('データベースに接続しました');
    
    // 統合コールサービスを初期化
    await callService.initialize();
    logger.info('統合コールサービスを初期化しました');
    
    // サーバー起動（HTTPサーバーインスタンスを使用）
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`サーバーが起動しました: http://localhost:${PORT}`);
      logger.info(`実行モード: ${process.env.NODE_ENV}`);
      logger.info(`コールサービス: デフォルトプロバイダ=${process.env.DEFAULT_CALL_PROVIDER}, モックモード=${process.env.MOCK_ASTERISK === 'true'}`);
      logger.info(`フォールバック: ${process.env.FALLBACK_ENABLED === 'true' ? '有効' : '無効'}, ロードバランシング: ${process.env.LOAD_BALANCING_ENABLED === 'true' ? '有効' : '無効'}`);
    });
  } catch (error) {
    logger.error('サーバー起動エラー:', error);
    process.exit(1);
  }
};

// 未処理のエラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// アプリケーションの終了処理
process.on('SIGINT', async () => {
  logger.info('アプリケーションを終了します...');
  
  try {
    // コールサービスの終了処理
    if (callService.shutdown) {
      await callService.shutdown();
      logger.info('コールサービスを正常に終了しました');
    }
    
    // データベース接続のクローズ
    if (db.close) {
      await db.close();
      logger.info('データベース接続を閉じました');
    }
    
    logger.info('正常に終了しました');
    process.exit(0);
  } catch (error) {
    logger.error('終了処理中にエラーが発生しました:', error);
    process.exit(1);
  }
});

// サーバー起動
startServer();