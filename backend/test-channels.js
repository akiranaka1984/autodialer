const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 5002; // 通常のバックエンドとは別のポートを使用

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// チャンネル情報を返すテストエンドポイント
app.get('/api/caller-ids/:id/channels', (req, res) => {
  console.log(`発信者番号ID=${req.params.id}のチャンネル一覧を取得`);
  
  // テスト用データを返す
  const testChannels = [
    { 
      id: 1, 
      caller_id_id: req.params.id, 
      username: '03080001', 
      password: '********', 
      status: 'available', 
      channel_type: 'outbound',
      last_used: null 
    },
    { 
      id: 2, 
      caller_id_id: req.params.id, 
      username: '03080002', 
      password: '********', 
      status: 'available', 
      channel_type: 'transfer',
      last_used: null 
    },
    { 
      id: 3, 
      caller_id_id: req.params.id, 
      username: '03080003', 
      password: '********', 
      status: 'available', 
      channel_type: 'both',
      last_used: null 
    }
  ];
  
  res.json(testChannels);
});

app.listen(PORT, () => {
  console.log(`テストサーバーがポート${PORT}で起動しました`);
});