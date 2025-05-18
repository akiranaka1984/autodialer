// backend/src/routes/audio.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const audioService = require('../services/audioService');
const auth = require('../middleware/auth');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../services/logger');

// 認証を必須とする
router.use(auth);

// ファイルアップロード用のストレージ設定
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB制限
  fileFilter: (req, file, cb) => {
    // 許可する音声ファイル形式
    const allowedMimes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('サポートされていないファイル形式です。WAV, MP3, OGGのみ許可されています。'), false);
    }
  }
});

// 音声ファイル一覧の取得
router.get('/', async (req, res) => {
  try {
    const audioFiles = await audioService.getAllAudioFiles();
    res.json(audioFiles);
  } catch (error) {
    logger.error('音声ファイル一覧取得エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
});

// 音声ファイルのアップロード
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'ファイルが見つかりません' });
    }
    
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'ファイル名は必須です' });
    }
    
    const audioFile = await audioService.uploadAudio(req.file, name, description);
    
    res.status(201).json(audioFile);
  } catch (error) {
    logger.error('音声ファイルアップロードエラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
});

// 特定の音声ファイルを取得
router.get('/:id', async (req, res) => {
  try {
    const audioFile = await audioService.getAudioFile(req.params.id);
    res.json(audioFile);
  } catch (error) {
    logger.error('音声ファイル取得エラー:', error);
    res.status(404).json({ message: `エラー: ${error.message}` });
  }
});

// 音声ファイルをストリーミング
router.get('/:id/stream', async (req, res) => {
  try {
    const audioFile = await audioService.getAudioFile(req.params.id);
    
    // ファイルの存在確認
    try {
      await fs.access(audioFile.path);
    } catch (err) {
      return res.status(404).json({ message: 'ファイルが見つかりません' });
    }
    
    // Content-Type設定
    res.setHeader('Content-Type', audioFile.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${audioFile.filename}"`);
    
    // ファイルをストリーミング
    const fileStream = fs.createReadStream(audioFile.path);
    fileStream.pipe(res);
  } catch (error) {
    logger.error('音声ファイルストリーミングエラー:', error);
    res.status(404).json({ message: `エラー: ${error.message}` });
  }
});

// 音声ファイルを削除
router.delete('/:id', async (req, res) => {
  try {
    await audioService.deleteAudioFile(req.params.id);
    res.json({ message: '音声ファイルを削除しました' });
  } catch (error) {
    logger.error('音声ファイル削除エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
});

module.exports = router;