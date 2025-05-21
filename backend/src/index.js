// backend/src/index.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const logger = require('./services/logger');
const db = require('./services/database');

// 環境変数の読み込み
require('dotenv').config();

// Express アプリケーションの初期化
const app = express();
// ポート設定
const PORT = parseInt(process.env.PORT || '5000', 10);

// HTTPサーバーの作成
const server = http.createServer(app);

// ★★★ 最優先: 統一されたCORS設定 (すべてのルーター登録前に配置) ★★★
app.use(cors({
  origin: ['http://152.42.200.112:3003', 'http://localhost:3003'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
  credentials: true,
  maxAge: 86400 // キャッシュ期間を設定 (1日)
}));

// OPTIONS リクエスト処理 (プリフライト)
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(200);
});

// リクエスト処理のミドルウェア
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// リクエストログ
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.url} - Origin: ${req.headers.origin || 'none'}`);
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    logger.debug('Request body:', req.body);
  }
  next();
});

// ★★★ この位置にルーターを登録 ★★★
const campaignsRouter = require('./routes/campaigns');
app.use('/api/campaigns', campaignsRouter);

const callerIdsRouter = require('./routes/callerIds');
app.use('/api/caller-ids', callerIdsRouter);

const callsRouter = require('./routes/calls');
app.use('/api/calls', callsRouter);

// contacts ルーターは routes/contacts.js 内で mergeParams: true と設定
const contactsRouter = require('./routes/contacts');
app.use('/api/campaigns/:campaignId/contacts', contactsRouter);

// 追加: 独立した contacts ルートパスを追加
app.use('/api/contacts', contactsRouter);

// ヘルスチェックエンドポイント
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

// CORS テスト用エンドポイント
app.get('/api/test-cors', (req, res) => {
  res.json({ 
    message: 'CORS設定テスト成功',
    origin: req.headers.origin || 'unknown',
    time: new Date().toISOString(),
    headers: {
      'access-control-allow-origin': res.getHeader('Access-Control-Allow-Origin'),
      'access-control-allow-methods': res.getHeader('Access-Control-Allow-Methods'),
      'access-control-allow-headers': res.getHeader('Access-Control-Allow-Headers')
    }
  });
});

// テスト用ルート
app.get('/api/test-caller-ids', (req, res) => {
  // 既存の発信者番号APIの結果と同じ形式で返す
  db.query('SELECT * FROM caller_ids ORDER BY created_at DESC')
    .then(result => {
      const callerIds = Array.isArray(result) && result.length === 2 ? result[0] : result;
      res.json(callerIds);
    })
    .catch(err => {
      console.error('発信者番号取得エラー:', err);
      res.status(500).json({ message: '発信者番号の取得に失敗しました' });
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

// すべてのルートをコンソールに出力（デバッグ用）
console.log('登録されたルートの一覧:');
app._router.stack.forEach(function(middleware){
  if(middleware.route){ // routes registered directly on the app
    console.log(`直接登録されたルート: ${middleware.route.path}, メソッド: ${Object.keys(middleware.route.methods)}`);
  } else if(middleware.name === 'router'){ // router middleware
    middleware.handle.stack.forEach(function(handler){
      if(handler.route){
        const path = handler.route.path;
        const methods = Object.keys(handler.route.methods);
        console.log(`ルーター内のルート: ${path}, メソッド: ${methods}`);
      }
    });
  }
});

// デバッグ用：すべてのリクエストをキャッチ
app.all('*', (req, res, next) => {
  console.log(`デバッグ: ${req.method} ${req.originalUrl}`, {
    headers: req.headers,
    body: req.body,
    query: req.query,
    params: req.params
  });
  next();
});

// DELETE エンドポイントを明示的にPreflight対応させる
app.options('/api/campaigns/:id', cors());

// より明確なエラーハンドリングと詳細なログを追加したDELETEエンドポイント
app.delete('/api/campaigns/:id', async (req, res) => {
  console.log(`キャンペーン削除リクエスト受信: ID=${req.params.id}, メソッド=${req.method}`);
  
  try {
    // キャンペーン存在確認
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [req.params.id]
    );
    
    if (campaigns.length === 0) {
      console.log(`キャンペーンが見つかりません: ID=${req.params.id}`);
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // キャンペーン削除
    const [result] = await db.query('DELETE FROM campaigns WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      console.log(`削除操作が影響行なし: ID=${req.params.id}`);
      return res.status(500).json({ message: 'キャンペーンの削除中にエラーが発生しました' });
    }
    
    console.log(`キャンペーン削除成功: ID=${req.params.id}, 影響行数=${result.affectedRows}`);
    res.json({ message: 'キャンペーンが削除されました', success: true });
  } catch (error) {
    console.error('キャンペーン削除エラー詳細:', error);
    res.status(500).json({ message: 'キャンペーンの削除に失敗しました', error: error.message });
  }
});

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

// サーバー起動 - 非同期処理の部分を修正
const startServer = async () => {
  try {
    // 開発環境のみ認証を簡略化する
    if (process.env.NODE_ENV === 'development' && process.env.USE_SIMPLE_AUTH === 'true') {
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

    // サーバー起動（HTTPサーバーインスタンスを使用）
    console.log(`サーバーをポート${PORT}で起動しています...`);
    
    // エラーイベントリスナーを先に追加
    server.on('error', (err) => {
      console.error('サーバーリッスンエラー:', err);
      logger.error('サーバーリッスンエラー:', err);
      
      // EADDRINUSE（アドレスが既に使用中）エラーの場合、別のポートを試す
      if (err.code === 'EADDRINUSE') {
        const alternativePort = parseInt(PORT) + 1000; // 別のポートを試す
        console.log(`ポート${PORT}は使用中です。ポート${alternativePort}を試します...`);
        logger.info(`ポート${PORT}は使用中です。ポート${alternativePort}を試します...`);
        
        server.listen(alternativePort, '0.0.0.0', () => {
          console.log(`代替ポート${alternativePort}でサーバーが起動しました`);
          logger.info(`代替ポート${alternativePort}でサーバーが起動しました`);
        });
      }
    });
    
    // サーバー起動
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`サーバーが起動しました: http://0.0.0.0:${PORT}`);
      logger.info(`サーバーが起動しました: http://0.0.0.0:${PORT}`);
      logger.info(`実行モード: ${process.env.NODE_ENV || 'development'}`);
    });
    
  } catch (error) {
    console.error('サーバー起動エラー:', error);
    logger.error('サーバー起動エラー:', error);
    
    // 重大なエラーが発生した場合でも、最低限のAPIは提供する
    console.log('重大なエラーが発生しましたが、基本的なAPIは提供します');
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
    
    // エラー発生後も起動を試みる
    try {
      console.log(`エラー復旧後、サーバーをポート${PORT}で起動を試みます...`);
      server.listen(PORT, '0.0.0.0', () => {
        console.log(`エラー復旧後、限定機能でサーバーが起動しました: http://0.0.0.0:${PORT}`);
        logger.info(`エラー復旧後、限定機能でサーバーが起動しました: http://0.0.0.0:${PORT}`);
      });
    } catch (finalError) {
      console.error('最終サーバー起動エラー:', finalError);
      logger.error('最終サーバー起動エラー:', finalError);
    }
  }
};

// 未処理のエラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  logger.error('Uncaught Exception:', error);
  // 本番環境では重大なエラー時にプロセスを終了する
  if (process.env.NODE_ENV === 'production') {
    logger.error('致命的なエラーにより、アプリケーションを終了します');
    process.exit(1);
  }
});

// アプリケーションの終了処理
process.on('SIGINT', async () => {
  console.log('アプリケーションを終了します...');
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
    
    // サーバーの終了
    if (server) {
      server.close(() => {
        console.log('サーバーを正常に終了しました');
        logger.info('サーバーを正常に終了しました');
        process.exit(0);
      });
    } else {
      console.log('正常に終了しました');
      logger.info('正常に終了しました');
      process.exit(0);
    }
  } catch (error) {
    console.error('終了処理中にエラーが発生しました:', error);
    logger.error('終了処理中にエラーが発生しました:', error);
    process.exit(1);
  }
});

// サーバー起動後に各サービスを初期化
server.on('listening', async () => {
  logger.info('サービスの初期化を開始します...');
  
  // SIPサービスの初期化
  try {
    const sipService = require('./services/sipService');
    await sipService.connect();
    logger.info('SIPサービスの初期化が完了しました');
  } catch (error) {
    logger.error('SIPサービス初期化エラー:', error);
  }
  
  // コールサービスの初期化
  try {
    const callService = require('./services/callService');
    await callService.initialize();
    logger.info('コールサービスの初期化が完了しました');
  } catch (error) {
    logger.error('コールサービス初期化エラー:', error);
  }
  
  // 発信サービスの初期化
  try {
    const dialerService = require('./services/dialerService');
    const result = await dialerService.initializeService();
    if (result) {
      logger.info('発信サービスの初期化が完了しました');
    } else {
      logger.warn('発信サービスの初期化が不完全です');
    }
  } catch (error) {
    logger.error('発信サービス初期化エラー:', error);
  }
  
  logger.info('全サービスの初期化が完了しました');
});

// サーバー起動
console.log('startServer関数を呼び出し中...');
startServer().catch(err => {
  console.error('startServer関数の実行中にエラーが発生しました:', err);
});