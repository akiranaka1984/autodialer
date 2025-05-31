// 音声ストリーミングサーバー（Port 8000）
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// 音声ファイルストリーミング
app.get('/stream/:filename', (req, res) => {
  const filename = req.params.filename;
  const audioPath = path.join('/var/www/autodialer/backend/audio-files', filename);
  
  console.log(`🔊 音声ストリーミング: ${filename}`);
  
  if (!fs.existsSync(audioPath)) {
    return res.status(404).send('Audio file not found');
  }
  
  const stat = fs.statSync(audioPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize-1;
    const chunksize = (end-start)+1;
    
    const file = fs.createReadStream(audioPath, {start, end});
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'audio/mpeg',
    };
    
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mpeg',
    };
    res.writeHead(200, head);
    fs.createReadStream(audioPath).pipe(res);
  }
});

app.listen(8000, () => {
  console.log('🎵 音声ストリーミングサーバー開始: Port 8000');
});
