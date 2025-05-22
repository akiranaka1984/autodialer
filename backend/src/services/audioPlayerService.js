// backend/src/services/audioPlayerService.js - 新規作成
// シンプルで確実な音声再生サービス

const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class AudioPlayerService {
  constructor() {
    this.audioQueue = new Map(); // 通話ID -> 音声キュー
    this.playingCalls = new Set(); // 現在再生中の通話ID
    this.audioCommands = [
      'ffplay', 'aplay', 'paplay', 'play', 'mpg123', 'sox'
    ]; // 利用可能な音声コマンド
    this.availableCommand = null;
    
    this.initialize();
  }

  async initialize() {
    logger.info('音声プレイヤーサービスを初期化中...');
    
    // 利用可能な音声コマンドを検索
    for (const command of this.audioCommands) {
      if (await this.checkCommandAvailable(command)) {
        this.availableCommand = command;
        logger.info(`音声再生コマンド発見: ${command}`);
        break;
      }
    }
    
    if (!this.availableCommand) {
      logger.warn('音声再生コマンドが見つかりません。シミュレーションモードで動作します。');
    }
  }

  // コマンドが利用可能かチェック
  async checkCommandAvailable(command) {
    return new Promise((resolve) => {
      exec(`which ${command}`, (error, stdout, stderr) => {
        resolve(!error && stdout.trim().length > 0);
      });
    });
  }

  // 🎵 メイン音声再生メソッド
  async playAudioForCall(callId, audioFiles) {
    try {
      logger.info(`🎵 通話音声再生開始: callId=${callId}, 音声ファイル数=${audioFiles ? audioFiles.length : 0}`);
      
      if (!audioFiles || audioFiles.length === 0) {
        logger.warn(`音声ファイルがありません: callId=${callId}`);
        return false;
      }
      
      // 既に再生中の場合はスキップ
      if (this.playingCalls.has(callId)) {
        logger.warn(`既に再生中です: callId=${callId}`);
        return false;
      }
      
      this.playingCalls.add(callId);
      
      // 音声ファイルをタイプ別に分類
      const audioMap = this.organizeAudioFiles(audioFiles);
      
      // 音声再生シーケンスを実行
      await this.executeAudioSequence(callId, audioMap);
      
      return true;
    } catch (error) {
      logger.error('音声再生エラー:', error);
      return false;
    } finally {
      this.playingCalls.delete(callId);
    }
  }

  // 音声ファイルを整理
  organizeAudioFiles(audioFiles) {
    const audioMap = {};
    
    audioFiles.forEach(audio => {
      if (audio && audio.audio_type) {
        audioMap[audio.audio_type] = audio;
      }
    });
    
    logger.info(`音声ファイル整理完了: ${Object.keys(audioMap).join(', ')}`);
    return audioMap;
  }

  // 音声シーケンス実行
  async executeAudioSequence(callId, audioMap) {
    try {
      logger.info(`🎵 音声シーケンス開始: callId=${callId}`);
      
      // 再生順序を定義
      const playbackOrder = [
        { type: 'welcome', delay: 1000, name: 'ウェルカムメッセージ' },
        { type: 'menu', delay: 2000, name: 'メニュー案内' },
        { type: 'goodbye', delay: 15000, name: 'お別れメッセージ' }
      ];
      
      // 各音声を順次再生
      for (const step of playbackOrder) {
        if (audioMap[step.type]) {
          // 指定された遅延後に再生
          await new Promise(resolve => setTimeout(resolve, step.delay));
          
          // 通話がまだアクティブかチェック
          if (this.playingCalls.has(callId)) {
            await this.playAudioFile(callId, audioMap[step.type], step.name);
          } else {
            logger.info(`通話終了のため音声再生中止: callId=${callId}`);
            break;
          }
        } else {
          logger.info(`音声ファイル未設定: ${step.type} (${step.name})`);
        }
      }
      
      logger.info(`🎵 音声シーケンス完了: callId=${callId}`);
    } catch (error) {
      logger.error('音声シーケンス実行エラー:', error);
    }
  }

  // 個別音声ファイル再生
  async playAudioFile(callId, audioFile, description) {
    try {
      logger.info(`🔊 音声再生: ${description} (${audioFile.filename})`);
      
      // ファイルの存在確認
      const audioPath = audioFile.path || path.join(__dirname, '../../audio-files', audioFile.filename);
      
      try {
        await fs.access(audioPath);
        logger.info(`音声ファイル確認OK: ${audioPath}`);
      } catch (fileError) {
        logger.error(`音声ファイルアクセスエラー: ${audioPath}`, fileError);
        return false;
      }
      
      // 実際の音声再生を実行
      const success = await this.executeAudioPlayback(audioPath, description);
      
      if (success) {
        logger.info(`✅ 音声再生成功: ${description}`);
      } else {
        logger.warn(`⚠️ 音声再生失敗: ${description}`);
      }
      
      return success;
    } catch (error) {
      logger.error('音声ファイル再生エラー:', error);
      return false;
    }
  }

  // 実際の音声再生実行
  async executeAudioPlayback(audioPath, description) {
    // Method 1: 利用可能なコマンドで再生
    if (this.availableCommand) {
      const success = await this.playWithCommand(this.availableCommand, audioPath);
      if (success) {
        return true;
      }
    }
    
    // Method 2: ffplay で再生
    if (await this.playWithFFplay(audioPath)) {
      return true;
    }
    
    // Method 3: aplay で再生
    if (await this.playWithAplay(audioPath)) {
      return true;
    }
    
    // Method 4: Node.js built-in で再生
    if (await this.playWithNodeBuiltin(audioPath)) {
      return true;
    }
    
    // Method 5: システム音声テスト
    await this.playSystemTestSound(description);
    
    return false;
  }

  // 指定されたコマンドで音声再生
  async playWithCommand(command, audioPath) {
    return new Promise((resolve) => {
      logger.info(`🔊 ${command}で音声再生: ${audioPath}`);
      
      let args = [];
      
      switch (command) {
        case 'ffplay':
          args = ['-nodisp', '-autoexit', '-loglevel', 'quiet', audioPath];
          break;
        case 'aplay':
          args = [audioPath];
          break;
        case 'paplay':
          args = [audioPath];
          break;
        case 'play':
          args = [audioPath];
          break;
        case 'mpg123':
          args = ['-q', audioPath];
          break;
        default:
          args = [audioPath];
      }
      
      const process = spawn(command, args);
      let resolved = false;
      
      process.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          const success = code === 0;
          logger.info(`${command}再生結果: ${success ? '成功' : '失敗'} (code: ${code})`);
          resolve(success);
        }
      });
      
      process.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          logger.debug(`${command}エラー:`, error.message);
          resolve(false);
        }
      });
      
      // タイムアウト設定
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          process.kill();
          logger.warn(`${command}再生タイムアウト`);
          resolve(false);
        }
      }, 10000); // 10秒でタイムアウト
    });
  }

  // ffplay での再生
  async playWithFFplay(audioPath) {
    return this.playWithCommand('ffplay', audioPath);
  }

  // aplay での再生
  async playWithAplay(audioPath) {
    return this.playWithCommand('aplay', audioPath);
  }

  // Node.js built-in での音声再生
  async playWithNodeBuiltin(audioPath) {
    try {
      // Web Audio APIやNode.js音声ライブラリを使用する実装
      // 現在は実装スキップ
      logger.debug('Node.js built-in音声再生: 未実装');
      return false;
    } catch (error) {
      logger.debug('Node.js built-in音声エラー:', error.message);
      return false;
    }
  }

  // システム音声テスト（確実に何かの音を鳴らす）
  async playSystemTestSound(description) {
    try {
      logger.info(`🔔 システム音声テスト: ${description}`);
      
      // PC Speakerでビープ音を鳴らす
      const beepProcess = spawn('echo', ['\u0007']);  // Bell character
      
      // またはspeaker-testコマンドを使用
      exec('speaker-test -t sine -f 1000 -l 1 2>/dev/null &');
      
      logger.info(`🔔 システム音声テスト実行: ${description}`);
      return true;
    } catch (error) {
      logger.debug('システム音声テストエラー:', error.message);
      return false;
    }
  }

  // 通話終了時のクリーンアップ
  stopAudioForCall(callId) {
    try {
      if (this.playingCalls.has(callId)) {
        this.playingCalls.delete(callId);
        logger.info(`音声再生停止: callId=${callId}`);
      }
      
      if (this.audioQueue.has(callId)) {
        this.audioQueue.delete(callId);
      }
    } catch (error) {
      logger.error('音声停止エラー:', error);
    }
  }

  // サービス状態を取得
  getStatus() {
    return {
      availableCommand: this.availableCommand,
      playingCallsCount: this.playingCalls.size,
      queuedCallsCount: this.audioQueue.size,
      supportedCommands: this.audioCommands
    };
  }
}

// シングルトンインスタンス
const audioPlayerService = new AudioPlayerService();
module.exports = audioPlayerService;