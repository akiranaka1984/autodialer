// backend/src/routes/audio.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid'); // UUID生成用に追加
const path = require('path');
const fs = require('fs').promises;
const logger = require('../services/logger');
const db = require('../services/database');
const auth = require('../middleware/auth');

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

// 音声ファイル一覧を取得
router.get('/', async (req, res) => {
  try {
    logger.info('音声ファイル一覧を取得します');
    // データベースから直接クエリ
    const [rows] = await db.query('SELECT * FROM audio_files ORDER BY created_at DESC');
    
    logger.info(`${rows.length}件の音声ファイルを取得しました`);
    res.json(rows);
  } catch (error) {
    logger.error('音声ファイル一覧取得エラー:', error);
    res.status(500).json({ message: '音声ファイルの取得に失敗しました: ' + error.message });
  }
});

// アップロードハンドラー
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    logger.info('音声ファイルアップロードリクエスト受信');
    
    if (!req.file) {
      logger.warn('アップロードファイルがありません');
      return res.status(400).json({ message: 'ファイルが見つかりません' });
    }
    
    // リクエストパラメータのログ
    logger.debug('アップロードパラメータ:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      name: req.body.name,
      description: req.body.description
    });
    
    const { name = req.file.originalname, description = '' } = req.body;
    
    // UUIDを生成
    const fileId = uuidv4();
    
    // ファイルパスを確保
    const uploadDir = path.join(__dirname, '../../uploads/audio');
    await fs.mkdir(uploadDir, { recursive: true });
    
    const filename = Date.now() + '-' + req.file.originalname.replace(/\s+/g, '_');
    const filepath = path.join(uploadDir, filename);
    
    // ファイルを保存
    await fs.writeFile(filepath, req.file.buffer);
    logger.info(`ファイルを保存しました: ${filepath}`);
    
    // データベースに保存
    const [result] = await db.query(
      'INSERT INTO audio_files (id, name, filename, path, mimetype, size, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [fileId, name, filename, filepath, req.file.mimetype, req.file.size, description]
    );
    
    logger.info(`データベースに登録しました: ID=${fileId}`);
    
    res.status(201).json({
      id: fileId,
      name,
      filename,
      path: filepath,
      mimetype: req.file.mimetype,
      size: req.file.size,
      description,
      created_at: new Date()
    });
  } catch (error) {
    logger.error('音声ファイルアップロードエラー:', error);
    res.status(500).json({ message: '音声ファイルのアップロードに失敗しました: ' + error.message });
  }
});

// 特定の音声ファイルを取得
router.get('/:id', async (req, res) => {
  try {
    logger.info(`音声ファイル情報取得: ID=${req.params.id}`);
    
    // データベースから直接取得
    const [rows] = await db.query('SELECT * FROM audio_files WHERE id = ?', [req.params.id]);
    
    if (rows.length === 0) {
      logger.warn(`音声ファイルが見つかりません: ID=${req.params.id}`);
      return res.status(404).json({ message: '音声ファイルが見つかりません' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    logger.error(`音声ファイル取得エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: '音声ファイルの取得に失敗しました: ' + error.message });
  }
});

// 音声ファイルをストリーミング
router.get('/:id/stream', async (req, res) => {
  try {
    logger.info(`音声ファイルのストリーミング: ID=${req.params.id}`);
    
    // データベースから直接取得
    const [rows] = await db.query('SELECT * FROM audio_files WHERE id = ?', [req.params.id]);
    
    if (rows.length === 0) {
      logger.warn(`音声ファイルが見つかりません: ID=${req.params.id}`);
      return res.status(404).json({ message: '音声ファイルが見つかりません' });
    }
    
    const audioFile = rows[0];
    
    // ファイルの存在確認
    try {
      await fs.access(audioFile.path);
    } catch (err) {
      logger.error(`ファイルが見つかりません: ${audioFile.path}`, err);
      return res.status(404).json({ message: 'ファイルが物理的に見つかりません' });
    }
    
    // Content-Type設定
    res.setHeader('Content-Type', audioFile.mimetype || 'audio/mpeg');
    res.setHeader('Content-Disposition', `inline; filename="${audioFile.filename}"`);
    
    // ファイルをストリーミング（fs.promisesでは直接ストリーミングができないため標準fsを使用）
    const { createReadStream } = require('fs');
    const fileStream = createReadStream(audioFile.path);
    
    fileStream.on('error', (error) => {
      logger.error(`ストリーミングエラー: ${audioFile.path}`, error);
      res.status(500).end();
    });
    
    fileStream.pipe(res);
  } catch (error) {
    logger.error(`音声ファイルストリーミングエラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: '音声ファイルのストリーミングに失敗しました: ' + error.message });
  }
});

// キャンペーンに音声ファイルを割り当て
router.post('/assign', async (req, res) => {
  try {
    const { campaignId, audioId, audioType } = req.body;
    
    logger.info(`音声ファイル割り当て: キャンペーンID=${campaignId}, 音声ID=${audioId}, タイプ=${audioType}`);
    
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
      'SELECT * FROM campaign_audio WHERE campaign_id = ? AND audio_type = ?',
      [campaignId, audioType]
    );
    
    if (existing.length > 0) {
      // 既存の割り当てを更新
      await db.query(
        'UPDATE campaign_audio SET audio_file_id = ? WHERE campaign_id = ? AND audio_type = ?',
        [audioId, campaignId, audioType]
      );
      logger.info(`既存の割り当てを更新しました: キャンペーンID=${campaignId}, タイプ=${audioType}`);
    } else {
      // 新規割り当て
      await db.query(
        'INSERT INTO campaign_audio (campaign_id, audio_file_id, audio_type, created_at) VALUES (?, ?, ?, NOW())',
        [campaignId, audioId, audioType]
      );
      logger.info(`新規割り当てを作成しました: キャンペーンID=${campaignId}, タイプ=${audioType}`);
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
    res.status(500).json({ message: '音声ファイルの割り当てに失敗しました: ' + error.message });
  }
});

// 音声ファイルを削除
router.delete('/:id', async (req, res) => {
  try {
    logger.info(`音声ファイル削除: ID=${req.params.id}`);
    
    // ファイル情報を取得
    const [rows] = await db.query('SELECT * FROM audio_files WHERE id = ?', [req.params.id]);
    
    if (rows.length === 0) {
      logger.warn(`削除対象の音声ファイルが見つかりません: ID=${req.params.id}`);
      return res.status(404).json({ message: '音声ファイルが見つかりません' });
    }
    
    const audioFile = rows[0];
    
    // データベースから削除（関連付けは自動的に削除される）
    await db.query('DELETE FROM audio_files WHERE id = ?', [req.params.id]);
    
    // ファイルを削除
    try {
      await fs.unlink(audioFile.path);
      logger.info(`ファイルを削除しました: ${audioFile.path}`);
    } catch (err) {
      logger.warn(`ファイル削除エラー（レコードは削除済み）: ${audioFile.path}`, err);
    }
    
    res.json({ message: '音声ファイルを削除しました' });
  } catch (error) {
    logger.error(`音声ファイル削除エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: '音声ファイルの削除に失敗しました: ' + error.message });
  }
});

module.exports = router;