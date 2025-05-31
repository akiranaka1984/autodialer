const express = require('express');
const app = express();
const PORT = 5000;

app.use((req, res, next) => {
  console.log('Request received:', req.method, req.url);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log();
});

process.on('SIGINT', () => {
  console.log('Shutting down server');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
