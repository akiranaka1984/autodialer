const express = require('express');
const cors = require('cors');
const simpleAuth = require('./middleware/simple-auth');
const app = express();
const PORT = process.env.PORT || 5000;

// CORS設定
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ルート
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'サーバーは稼働中です' });
});

// 認証が必要なAPIには認証ミドルウェアを適用
app.get('/api/caller-ids', simpleAuth, (req, res) => {
  res.json([
    { id: 1, number: '03-5946-8520', description: '東京オフィス', provider: 'SIP Provider A', active: true },
    { id: 2, number: '03-3528-9538', description: '大阪オフィス', provider: 'SIP Provider A', active: true }
  ]);
});

app.get('/api/campaigns/:id/details', simpleAuth, (req, res) => {
  res.json({
    id: req.params.id,
    name: 'テストキャンペーン',
    status: 'active',
    progress: 50,
    stats: {
      totalContacts: 100,
      completedContacts: 50,
      totalCalls: 80,
      answeredCalls: 40,
      answerRate: 50
    }
  });
});

app.get('/api/audio', simpleAuth, (req, res) => {
  res.json([
    { id: '1', name: 'ウェルカムメッセージ', filename: 'welcome.wav', mimetype: 'audio/wav' },
    { id: '2', name: 'メニュー案内', filename: 'menu.wav', mimetype: 'audio/wav' }
  ]);
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
  console.log(`認証付きシンプルサーバーが起動しました: http://0.0.0.0:${PORT}`);
});
