// backend/src/index.js の修正版 - 本番環境対応
const express = require('express');
const cors = require('cors');
const http = require('http');
const logger = require('./services/logger');
const db = require('./services/database');

// 環境変数の読み込み
require('dotenv').config();

// Express アプリケーションの初期化
const app = express();
// ポート設定 - docker-compose.devのポートマッピングと合わせる
const PORT = process.env.PORT || 5000; // コンテナ内のポートは5000、外部からは5001でアクセス

// HTTPサーバーの作成
const server = http.createServer(app);

// CORSの設定を修正
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL || 'https://your-production-domain.com'] 
    : '*', // 開発環境では全てのオリジンを許可、本番環境では特定のドメインのみ
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
  credentials: true
}));

// プリフライトリクエストの処理を追加
app.options('*', cors());

// リクエストログ
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.url} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

app.use(express.json());

// ヘルスチェックエンドポイント - 最優先で定義
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cors: 'enabled',
    providers: {
      default: process.env.DEFAULT_CALL_PROVIDER,
      mockMode: process.env.MOCK_ASTERISK === 'true'
    }
  });
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

// サーバー起動 - 非同期処理の部分を修正
const startServer = async () => {
  try {
    // 開発環境のみ認証を簡略化する
    if (process.env.NODE_ENV === 'development') {
      try {
        const fs = require('fs');
        const path = require('path');
        const authPath = path.join(__dirname, 'middleware', 'auth.js');
        
        // 現在のファイルが存在するか確認
        try {
          await fs.promises.access(authPath);
          logger.info('認証ミドルウェアファイルが存在します');
          
          // 既存ファイルの内容を確認
          const currentContent = await fs.promises.readFile(authPath, 'utf8');
          
          // 既に開発用のシンプルな認証になっていない場合のみ変更
          if (!currentContent.includes('開発環境では常に認証を通す') || 
              !currentContent.includes('req.user = { id: 1, role: \'admin\'')) {
            
            // シンプルな認証に変更
            const simpleAuth = `
// backend/src/middleware/auth.js - 開発環境用
const jwt = require('jsonwebtoken');
const logger = require('../services/logger');

// 開発環境用の簡易認証ミドルウェア
const auth = async (req, res, next) => {
  // 開発環境では常に認証を通す
  req.user = { id: 1, role: 'admin', name: 'Development Admin' };
  logger.debug('開発環境: 認証をスキップしました');
  return next();
};

module.exports = auth;`;
            
            await fs.promises.writeFile(authPath, simpleAuth);
            logger.info('開発環境用に認証ミドルウェアを簡略化しました');
          } else {
            logger.info('認証ミドルウェアは既に開発環境用に簡略化されています');
          }
        } catch (accessErr) {
          logger.error('認証ミドルウェアファイルにアクセスできません:', accessErr);
        }
      } catch (authError) {
        logger.error('認証ミドルウェアの修正に失敗しました:', authError);
      }
    } else {
      logger.info('本番環境のため、認証ミドルウェアはそのまま使用します');
    }

    // データベース接続確認
    try {
      await db.query('SELECT 1');
      logger.info('データベースに接続しました');
    } catch (dbError) {
      logger.error('データベース接続エラー:', dbError);
      throw new Error('データベース接続に失敗しました: ' + dbError.message);
    }

    // 優先的に音声ファイル管理APIを初期化
    try {
      const audioRoutes = require('./routes/audio');
      app.use('/api/audio', audioRoutes);
      logger.info('音声ファイル管理APIを有効化しました（最優先）');
    } catch (error) {
      logger.error('音声ファイル管理API初期化エラー:', error);
      throw new Error('音声ファイル管理APIの初期化に失敗しました: ' + error.message);
    }

    // 発信者番号ルート
    try {
      const callerIdRoutes = require('./routes/callerIds');
      app.use('/api/caller-ids', callerIdRoutes);
      logger.info('発信者番号APIを有効化しました');
    } catch (error) {
      logger.error('発信者番号API初期化エラー:', error);
      throw new Error('発信者番号APIの初期化に失敗しました: ' + error.message);
    }

    // キャンペーンルート
    try {
      const campaignRoutes = require('./routes/campaigns');
      app.use('/api/campaigns', campaignRoutes);
      logger.info('キャンペーンAPIを有効化しました');
    } catch (error) {
      logger.error('キャンペーンAPI初期化エラー:', error);
      throw new Error('キャンペーンAPIの初期化に失敗しました: ' + error.message);
    }

    // 連絡先ルート
    try {
      const contactRoutes = require('./routes/contacts');
      app.use('/api/contacts', contactRoutes);
      logger.info('連絡先APIを有効化しました');
    } catch (error) {
      logger.error('連絡先API初期化エラー:', error);
      throw new Error('連絡先APIの初期化に失敗しました: ' + error.message);
    }

    // DNCリストルート
    try {
      const dncRoutes = require('./routes/dnc');
      app.use('/api/dnc', dncRoutes);
      logger.info('DNCリストAPIを有効化しました');
    } catch (error) {
      logger.error('DNCリストAPI初期化エラー:', error);
      throw new Error('DNCリストAPIの初期化に失敗しました: ' + error.message);
    }

    // 通話ルート
    try {
      const callRoutes = require('./routes/calls');
      app.use('/api/calls', callRoutes);
      logger.info('通話APIを有効化しました');
    } catch (error) {
      logger.error('通話API初期化エラー:', error);
      throw new Error('通話APIの初期化に失敗しました: ' + error.message);
    }

    // 認証ルート
    try {
      const authRoutes = require('./routes/auth');
      app.use('/api/auth', authRoutes);
      logger.info('認証APIを有効化しました');
    } catch (error) {
      logger.error('認証API初期化エラー:', error);
      throw new Error('認証APIの初期化に失敗しました: ' + error.message);
    }

    // コールバックルート
    try {
      const callbackRoutes = require('./routes/callback');
      app.use('/api/callback', callbackRoutes);
      logger.info('コールバックAPIを有効化しました');
    } catch (error) {
      logger.error('コールバックAPI初期化エラー:', error);
      throw new Error('コールバックAPIの初期化に失敗しました: ' + error.message);
    }

    // 統計ルート
    try {
      const statsRoutes = require('./routes/stats');
      app.use('/api/stats', statsRoutes);
      logger.info('統計APIを有効化しました');
    } catch (error) {
      logger.error('統計API初期化エラー:', error);
      throw new Error('統計APIの初期化に失敗しました: ' + error.message);
    }

    // 設定ルート
    try {
      const settingsRoutes = require('./routes/settings');
      app.use('/api/settings', settingsRoutes);
      logger.info('設定APIを有効化しました');
    } catch (error) {
      logger.error('設定API初期化エラー:', error);
      throw new Error('設定APIの初期化に失敗しました: ' + error.message);
    }

    // オペレーター管理ルート
    try {
      const operatorRoutes = require('./routes/operators');
      app.use('/api/operators', operatorRoutes);
      logger.info('オペレーター管理APIを有効化しました');
    } catch (error) {
      logger.error('オペレーター管理API初期化エラー:', error);
      throw new Error('オペレーター管理APIの初期化に失敗しました: ' + error.message);
    }

    // IVR設定ルート
    try {
      const ivrRoutes = require('./routes/ivr');
      app.use('/api/ivr', ivrRoutes);
      logger.info('IVR設定APIを有効化しました');
    } catch (error) {
      logger.error('IVR設定API初期化エラー:', error);
      throw new Error('IVR設定APIの初期化に失敗しました: ' + error.message);
    }

    // コールサービスの初期化
    try {
      const callService = require('./services/callService');
      await callService.initialize();
      logger.info('統合コールサービスを初期化しました');
    } catch (error) {
      logger.error('コールサービス初期化エラー:', error);
      // コールサービスは重要だが、エラーがあっても続行
      logger.warn('コールサービスの初期化に失敗しましたが、サーバーは続行します');
    }
    
    // WebSocketサービスの初期化
    try {
      const websocketService = require('./services/websocketService');
      websocketService.initialize(server);
      logger.info('WebSocketサービスを初期化しました');
    } catch (error) {
      logger.error('WebSocketサービス初期化エラー:', error);
      // WebSocketサービスは重要だが、エラーがあっても続行
      logger.warn('WebSocketサービスの初期化に失敗しましたが、サーバーは続行します');
    }

    // 全てのルート登録後、404エラーハンドラーをここに配置
    app.use((req, res, next) => {
      logger.warn(`404エラー: ${req.method} ${req.originalUrl} - 要求されたリソースが見つかりません`);
      // 常にJSONレスポンスを返すように設定
      res.status(404).json({ 
        message: '要求されたリソースが見つかりません',
        path: req.originalUrl,
        method: req.method
      });
    });

    // エラーハンドリングミドルウェア
    app.use((err, req, res, next) => {
      logger.error('アプリケーションエラー:', err);
      res.status(500).json({ 
        message: '内部サーバーエラー', 
        error: err.message 
      });
    });
    
    // サーバー起動（HTTPサーバーインスタンスを使用）
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`サーバーが起動しました: http://localhost:${PORT}`);
      logger.info(`実行モード: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('サーバー起動エラー:', error);
    
    // 重大なエラーが発生した場合でも、最低限のAPIは提供する
    logger.info('重大なエラーが発生しましたが、基本的なAPIは提供します');
    
    // 最低限のAPIを提供
    app.get('/api/caller-ids', (req, res) => {
      db.query('SELECT * FROM caller_ids ORDER BY created_at DESC')
        .then(result => {
          const callerIds = Array.isArray(result) && result.length === 2 ? result[0] : result;
          res.json(callerIds);
        })
        .catch(err => {
          logger.error('発信者番号取得エラー:', err);
          res.status(500).json({ message: '発信者番号の取得に失敗しました' });
        });
    });
    
    // サーバーを起動
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`エラー復旧後、限定機能でサーバーが起動しました: http://localhost:${PORT}`);
    });
  }
};

// 未処理のエラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // 本番環境では重大なエラー時にプロセスを終了する
  if (process.env.NODE_ENV === 'production') {
    logger.error('致命的なエラーにより、アプリケーションを終了します');
    process.exit(1);
  }
});

// アプリケーションの終了処理
process.on('SIGINT', async () => {
  logger.info('アプリケーションを終了します...');
  
  try {
    // コールサービスの終了処理
    try {
      const callService = require('./services/callService');
      if (callService && callService.shutdown) {
        await callService.shutdown();
        logger.info('コールサービスを正常に終了しました');
      }
    } catch (error) {
      logger.warn('コールサービス終了処理中のエラー:', error.message);
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