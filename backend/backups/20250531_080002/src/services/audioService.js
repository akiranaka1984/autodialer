// backend/src/services/audioService.js
const fs = require('fs').promises;
const path = require('path');
const uuid = require('uuid');
const db = require('./database');
const logger = require('./logger');

class AudioService {
  constructor() {
    // 音声ファイルの保存ディレクトリ
    this.audioDir = process.env.AUDIO_FILES_DIR || path.join(__dirname, '../../audio-files');
    this.initialize();
  }

  async initialize() {
    try {
      // 保存ディレクトリの存在確認、なければ作成
      await fs.mkdir(this.audioDir, { recursive: true });
      logger.info(`音声ファイルディレクトリを初期化しました: ${this.audioDir}`);
    } catch (error) {
      logger.error('音声ファイルディレクトリの初期化エラー:', error);
    }
  }

  // 音声ファイルをアップロード
  async uploadAudio(file, name, description) {
    try {
      const fileId = uuid.v4();
      const filename = `${fileId}-${file.originalname.replace(/\s+/g, '_')}`;
      const filePath = path.join(this.audioDir, filename);
      
      // ファイルを保存
      await fs.writeFile(filePath, file.buffer);
      
      // データベースに登録
      const result = await db.query(
        'INSERT INTO audio_files (id, name, filename, path, mimetype, size, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
        [fileId, name, filename, filePath, file.mimetype, file.size, description]
      );
      
      logger.info(`音声ファイルをアップロードしました: ${name}, ID=${fileId}`);
      
      return {
        id: fileId,
        name,
        filename,
        path: filePath,
        mimetype: file.mimetype,
        size: file.size,
        description
      };
    } catch (error) {
      logger.error('音声ファイルアップロードエラー:', error);
      throw error;
    }
  }

  // 音声ファイル一覧を取得
  async getAllAudioFiles() {
    try {
      const files = await db.query(
        'SELECT id, name, filename, mimetype, size, description, created_at FROM audio_files ORDER BY created_at DESC'
      );
      return files;
    } catch (error) {
      logger.error('音声ファイル一覧取得エラー:', error);
      throw error;
    }
  }

  // 特定の音声ファイルを取得
  async getAudioFile(id) {
    try {
      const [files] = await db.query(
        'SELECT id, name, filename, path, mimetype, size, description, created_at FROM audio_files WHERE id = ?',
        [id]
      );
      
      if (files.length === 0) {
        throw new Error('音声ファイルが見つかりません');
      }
      
      return files[0];
    } catch (error) {
      logger.error(`音声ファイル取得エラー: ${id}`, error);
      throw error;
    }
  }

  // 音声ファイルを削除
  async deleteAudioFile(id) {
    try {
      // ファイル情報を取得
      const file = await this.getAudioFile(id);
      
      // データベースから削除
      await db.query('DELETE FROM audio_files WHERE id = ?', [id]);
      
      // ファイルを削除
      await fs.unlink(file.path);
      
      logger.info(`音声ファイルを削除しました: ${id}`);
      return true;
    } catch (error) {
      logger.error(`音声ファイル削除エラー: ${id}`, error);
      throw error;
    }
  }

  // backend/src/services/audioService.js の音声割り当て機能
  async assignAudioToCampaign(campaignId, audioId, audioType) {
    try {
      logger.info(`キャンペーン音声を割り当て: Campaign=${campaignId}, Audio=${audioId}, Type=${audioType}`);
      
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
      } else {
        // 新規割り当て
        await db.query(
          'INSERT INTO campaign_audio (campaign_id, audio_file_id, audio_type, created_at) VALUES (?, ?, ?, NOW())',
          [campaignId, audioId, audioType]
        );
      }
      
      return true;
    } catch (error) {
      logger.error('キャンペーン音声割り当てエラー:', error);
      throw error;
    }
  }

  // キャンペーンの音声ファイル割り当てを取得
  async getCampaignAudio(campaignId) {
    try {
      logger.info(`キャンペーン音声取得開始: Campaign=${campaignId}`);
      
      const audioFiles = await db.query(`
        SELECT ca.audio_type, af.id, af.name, af.filename, af.mimetype, af.description, af.path
        FROM campaign_audio ca
        JOIN audio_files af ON ca.audio_file_id = af.id
        WHERE ca.campaign_id = ?
      `, [campaignId]);
      
      // MySQL2の戻り値を正しく処理
      let results;
      if (Array.isArray(audioFiles) && audioFiles.length === 2 && Array.isArray(audioFiles[0])) {
        results = audioFiles[0]; // MySQL2の場合は最初の要素が行データ
      } else {
        results = audioFiles || [];
      }
      
      logger.info(`キャンペーン音声取得結果: Campaign=${campaignId}, 件数=${results.length}`);
      
      // デバッグ用に詳細をログ出力
      if (results.length > 0) {
        results.forEach(audio => {
          logger.info(`音声ファイル詳細: タイプ=${audio.audio_type}, 名前=${audio.name}, ファイル名=${audio.filename}`);
        });
      } else {
        logger.warn(`キャンペーン ${campaignId} に音声ファイルが見つかりません`);
      }
      
      return results;
    } catch (error) {
      logger.error(`キャンペーン音声取得エラー: Campaign=${campaignId}`, error);
      return []; // エラー時は空配列を返す
    }
  }
}

module.exports = new AudioService();