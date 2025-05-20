// backend/src/routes/audio.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const audioService = require('../services/audioService');
const auth = require('../middleware/auth');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../services/logger');
const db = require('../services/database'); // dbを正しくインポート

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

// 音声ファイル一覧取得
router.get('/', async (req, res) => {
  try {
    const audioFiles = await audioService.getAllAudioFiles();
    
    // データベースからの返り値を確認し、統一した形式で返す
    if (Array.isArray(audioFiles) && audioFiles.length === 2 && Array.isArray(audioFiles[0])) {
      // MySQL2の場合は第一要素が結果の行
      res.json(audioFiles[0]);
    } else {
      res.json(audioFiles);
    }
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

// キャンペーンに音声ファイルを割り当て
router.post('/assign', async (req, res) => {
  try {
    const { campaignId, audioId, audioType } = req.body;
    
    if (!campaignId || !audioId || !audioType) {
      return res.status(400).json({ message: 'キャンペーンID、音声ファイルID、音声タイプは必須です' });
    }
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT id FROM campaigns WHERE id = ?', [campaignId]);
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // 音声ファイルの存在確認
    const [audioFiles] = await db.query('SELECT id FROM audio_files WHERE id = ?', [audioId]);
    if (audioFiles.length === 0) {
      return res.status(404).json({ message: '音声ファイルが見つかりません' });
    }
    
    // 既存の割り当てを確認
    const [existing] = await db.query(
      'SELECT id FROM campaign_audio WHERE campaign_id = ? AND audio_type = ?',
      [campaignId, audioType]
    );
    
    let result;
    if (existing.length > 0) {
      // 既存の割り当てを更新
      result = await db.query(
        'UPDATE campaign_audio SET audio_file_id = ? WHERE campaign_id = ? AND audio_type = ?',
        [audioId, campaignId, audioType]
      );
    } else {
      // 新規割り当て
      result = await db.query(
        'INSERT INTO campaign_audio (campaign_id, audio_file_id, audio_type, created_at) VALUES (?, ?, ?, NOW())',
        [campaignId, audioId, audioType]
      );
    }
    
    res.json({ 
      success: true, 
      message: '音声ファイルを割り当てました',
      data: {
        campaignId,
        audioId,
        audioType
      }
    });
  } catch (error) {
    logger.error('音声ファイル割り当てエラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
});

module.exports = router;