const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const logger = require('../services/logger');

// 音声ファイルの保存設定
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/audio');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB制限
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('対応していない音声形式です。WAVまたはMP3形式を使用してください。'));
    }
  }
}).single('audio');

// 音声ファイルのアップロード
exports.uploadAudio = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ message: '音声ファイルがアップロードされていません' });
    }
    
    try {
      const audioFile = {
        id: uuidv4(),
        name: req.body.name || req.file.originalname,
        filename: req.file.filename,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size,
        duration: null, // 音声解析ライブラリで取得する場合
        created_at: new Date()
      };
      
      // データベースに保存（音声ファイルテーブルが必要）
      res.status(201).json({
        message: '音声ファイルがアップロードされました',
        audio: audioFile
      });
    } catch (error) {
      logger.error('音声ファイル保存エラー:', error);
      res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
  });
};

// 音声ファイル一覧の取得
exports.getAudioFiles = async (req, res) => {
  try {
    // データベースから音声ファイル一覧を取得
    const audioFiles = []; // 実際はDBから取得
    
    res.json(audioFiles);
  } catch (error) {
    logger.error('音声ファイル一覧取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// 音声ファイルの削除
exports.deleteAudio = async (req, res) => {
  try {
    const { id } = req.params;
    
    // データベースから音声ファイル情報を取得
    // const audioFile = await db.query('SELECT * FROM audio_files WHERE id = ?', [id]);
    
    // ファイルシステムから削除
    // await fs.unlink(audioFile.path);
    
    // データベースから削除
    // await db.query('DELETE FROM audio_files WHERE id = ?', [id]);
    
    res.json({ message: '音声ファイルが削除されました' });
  } catch (error) {
    logger.error('音声ファイル削除エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};