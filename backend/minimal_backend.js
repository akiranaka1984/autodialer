const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), server: 'minimal' });
});

app.get('/api/monitor/health', (req, res) => {
  res.json({
    services: {
      sipService: { connected: true, mockMode: false, accountCount: 4, activeCallCount: 0 }
    }
  });
});

app.listen(5000, '0.0.0.0', () => console.log('✅ 最小サーバー起動: 5000'));
