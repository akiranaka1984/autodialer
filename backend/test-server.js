const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000;

// CORS設定
app.use(cors());
app.use(express.json());

// ヘルスチェック
app.get('/health', (req, res) => {
  console.log('ヘルスチェック呼び出し');
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    server: 'test-server'
  });
});

// データベース接続テスト
app.get('/api/db-test', async (req, res) => {
  try {
    console.log('データベーステスト開始');
    const db = require('./src/services/database');
    const [result] = await db.query('SELECT 1 as test');
    console.log('データベース接続成功');
    res.json({ success: true, result });
  } catch (error) {
    console.error('データベース接続エラー:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 発信者番号API（認証なし）
app.get('/api/caller-ids', async (req, res) => {
  try {
    console.log('発信者番号API呼び出し - 認証なし');
    const db = require('./src/services/database');
    
    const [result] = await db.query('SELECT * FROM caller_ids ORDER BY created_at DESC');
    console.log('発信者番号取得成功:', result.length, '件');
    
    res.json(result);
  } catch (error) {
    console.error('発信者番号取得エラー:', error);
    res.status(500).json({ 
      message: '発信者番号の取得に失敗しました', 
      error: error.message 
    });
  }
});

// キャンペーンAPI（認証なし）
app.get('/api/campaigns', async (req, res) => {
  try {
    console.log('キャンペーンAPI呼び出し - 認証なし');
    const db = require('./src/services/database');
    
    const [result] = await db.query('SELECT * FROM campaigns ORDER BY created_at DESC');
    console.log('キャンペーン取得成功:', result.length, '件');
    
    res.json(result);
  } catch (error) {
    console.error('キャンペーン取得エラー:', error);
    res.status(500).json({ 
      message: 'キャンペーンの取得に失敗しました', 
      error: error.message 
    });
  }
});

// 404ハンドラー
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.url);
  res.status(404).json({ 
    message: 'リソースが見つかりません',
    method: req.method,
    url: req.url
  });
});

// エラーハンドラー
app.use((err, req, res, next) => {
  console.error('サーバーエラー:', err);
  res.status(500).json({ 
    message: '内部サーバーエラー', 
    error: err.message 
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 テストサーバー起動: http://0.0.0.0:${PORT}`);
  console.log('利用可能なエンドポイント:');
  console.log('  GET /health');
  console.log('  GET /api/db-test');
  console.log('  GET /api/caller-ids');
  console.log('  GET /api/campaigns');
});
