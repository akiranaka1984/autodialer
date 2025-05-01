const express = require('express');
const cors = require('cors');
const logger = require('./services/logger');
const db = require('./services/database');

// ルーターのインポート
const callerIdRoutes = require('./routes/callerIds');
const callRoutes = require('./routes/calls');  // callルーターを追加

// Express アプリケーションの初期化
const app = express();
const PORT = process.env.PORT || 5000;

// ミドルウェア
app.use(cors());
app.use(express.json());

// ルートエンドポイント
app.get('/', (req, res) => {
  res.json({ message: 'オートコールシステムAPI稼働中' });
});

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// APIルート
app.use('/api/caller-ids', callerIdRoutes);
app.use('/api/calls', callRoutes);  // callルートを使用

// サーバー起動
const startServer = async () => {
  try {
    // データベース接続確認
    await db.query('SELECT 1');
    logger.info('データベースに接続しました');
    
    // サーバー起動
    app.listen(PORT, () => {
      logger.info(`サーバーが起動しました: http://localhost:${PORT}`);
      logger.info(`発信者番号API: http://localhost:${PORT}/api/caller-ids`);
      logger.info(`テスト発信API: http://localhost:${PORT}/api/calls/test`);
    });
  } catch (error) {
    logger.error('サーバー起動エラー:', error);
    process.exit(1);
  }
};

startServer();
