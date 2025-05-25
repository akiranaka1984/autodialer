// backend/src/main-simple.js - シンプル版（認証なし）
const express = require('express');
const cors = require('cors');
const logger = require('./services/logger');
const db = require('./services/database');

require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// CORS設定
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "*");
  res.header("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ログミドルウェア
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cors: 'enabled',
    auth: 'disabled'
  });
});

// 発信者番号API
app.get('/api/caller-ids', async (req, res) => {
  try {
    console.log('発信者番号API呼び出し');
    const [rows] = await db.query('SELECT * FROM caller_ids ORDER BY created_at DESC');
    console.log('発信者番号取得成功:', rows.length, '件');
    res.json(rows);
  } catch (error) {
    console.error('発信者番号取得エラー:', error);
    res.status(500).json({ message: '発信者番号の取得に失敗しました', error: error.message });
  }
});

// キャンペーンAPI
app.get('/api/campaigns', async (req, res) => {
  try {
    console.log('キャンペーンAPI呼び出し');
    const [rows] = await db.query('SELECT * FROM campaigns ORDER BY created_at DESC');
    console.log('キャンペーン取得成功:', rows.length, '件');
    res.json(rows);
  } catch (error) {
    console.error('キャンペーン取得エラー:', error);
    res.status(500).json({ message: 'キャンペーンの取得に失敗しました', error: error.message });
  }
});

// キャンペーン作成API
app.post('/api/campaigns', async (req, res) => {
  try {
    console.log('キャンペーン作成API呼び出し', req.body);
    const { name, description, caller_id_id } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'キャンペーン名は必須です' });
    }
    
    const [result] = await db.query(
      'INSERT INTO campaigns (name, description, caller_id_id, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [name, description || '', caller_id_id || 1]
    );
    
    console.log('キャンペーン作成成功:', result.insertId);
    res.status(201).json({ 
      id: result.insertId, 
      name, 
      description, 
      caller_id_id,
      message: 'キャンペーンを作成しました' 
    });
  } catch (error) {
    console.error('キャンペーン作成エラー:', error);
    res.status(500).json({ message: 'キャンペーンの作成に失敗しました', error: error.message });
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

// サーバー起動
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 サーバー起動: http://0.0.0.0:${PORT}`);
  
  // データベース接続テスト
  try {
    await db.query('SELECT 1');
    console.log('✅ データベース接続成功');
  } catch (error) {
    console.error('❌ データベース接続エラー:', error);
  }
});
