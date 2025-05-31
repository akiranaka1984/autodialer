// backend/src/services/rtpAudioService.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class RtpAudioService {
  constructor() {
    this.activeAudioStreams = new Map();
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  }

  // 通話確立後にRTPストリームで音声を送信
  async injectAudioToCall(callId, audioFiles, rtpTarget) {
    try {
      if (!audioFiles || audioFiles.length === 0) {
        logger.info(`音声ファイルなし: callId=${callId}`);
        return false;
      }

      logger.info(`🎵 RTP音声インジェクション開始: callId=${callId}`);

      // 音声ファイルをタイプ別に整理
      const audioMap = {};
      audioFiles.forEach(audio => {
        if (audio && audio.audio_type) {
          audioMap[audio.audio_type] = audio;
        }
      });

      // 音声シーケンスを実行
      await this.executeAudioSequence(callId, audioMap, rtpTarget);
      
      return true;
    } catch (error) {
      logger.error(`RTP音声インジェクションエラー: ${error.message}`);
      return false;
    }
  }

  // 音声シーケンスの実行
  async executeAudioSequence(callId, audioMap, rtpTarget) {
    const sequence = [
      { type: 'welcome', delay: 1000, name: 'ウェルカムメッセージ' },
      { type: 'menu', delay: 3000, name: 'メニュー案内' },
      { type: 'goodbye', delay: 15000, name: 'お別れメッセージ' }
    ];

    for (const step of sequence) {
      if (audioMap[step.type]) {
        // 指定時間待機
        await this.delay(step.delay);
        
        // 通話がまだアクティブかチェック
        if (this.activeAudioStreams.has(callId)) {
          await this.streamAudioFile(
            callId, 
            audioMap[step.type], 
            rtpTarget, 
            step.name
          );
        } else {
          logger.info(`通話終了により音声配信中止: callId=${callId}`);
          break;
        }
      }
    }
  }

  // 個別音声ファイルのRTPストリーミング
  async streamAudioFile(callId, audioFile, rtpTarget, description) {
    return new Promise((resolve, reject) => {
      try {
        const audioPath = audioFile.path || path.join(__dirname, '../../audio-files', audioFile.filename);
        
        // ファイル存在確認
        if (!fs.existsSync(audioPath)) {
          logger.error(`音声ファイルが見つかりません: ${audioPath}`);
          resolve(false);
          return;
        }

        logger.info(`🔊 RTP音声配信: ${description} (${audioFile.filename})`);

        // ffmpegでRTPストリーミング
        const ffmpegArgs = [
          '-re',                          // リアルタイム読み込み
          '-i', audioPath,                // 入力ファイル
          '-acodec', 'pcm_mulaw',         // μ-law コーデック（電話品質）
          '-ar', '8000',                  // サンプリングレート 8kHz
          '-ac', '1',                     // モノラル
          '-f', 'rtp',                    // RTP出力
          `rtp://${rtpTarget.ip}:${rtpTarget.port}`
        ];

        const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs);
        
        // プロセスを管理用Mapに追加
        this.activeAudioStreams.set(callId, ffmpegProcess);

        ffmpegProcess.stdout.on('data', (data) => {
          logger.debug(`ffmpeg stdout: ${data}`);
        });

        ffmpegProcess.stderr.on('data', (data) => {
          const output = data.toString();
          if (output.includes('time=')) {
            // 進行状況ログ（詳細すぎるので必要に応じて）
          } else if (output.includes('error') || output.includes('Error')) {
            logger.error(`ffmpeg error: ${output}`);
          }
        });

        ffmpegProcess.on('close', (code) => {
          this.activeAudioStreams.delete(callId);
          
          if (code === 0) {
            logger.info(`✅ RTP音声配信完了: ${description}`);
            resolve(true);
          } else {
            logger.warn(`⚠️ RTP音声配信終了: ${description}, code=${code}`);
            resolve(false);
          }
        });

        ffmpegProcess.on('error', (error) => {
          this.activeAudioStreams.delete(callId);
          logger.error(`ffmpegプロセスエラー: ${error.message}`);
          resolve(false);
        });

        // 10秒でタイムアウト
        setTimeout(() => {
          if (this.activeAudioStreams.has(callId)) {
            logger.warn(`RTP音声配信タイムアウト: ${description}`);
            ffmpegProcess.kill();
            this.activeAudioStreams.delete(callId);
            resolve(false);
          }
        }, 10000);

      } catch (error) {
        logger.error(`RTP音声配信エラー: ${error.message}`);
        resolve(false);
      }
    });
  }

  // 通話終了時のクリーンアップ
  stopAudioForCall(callId) {
    if (this.activeAudioStreams.has(callId)) {
      const process = this.activeAudioStreams.get(callId);
      try {
        process.kill();
        logger.info(`RTP音声配信停止: callId=${callId}`);
      } catch (error) {
        logger.warn(`RTP音声停止エラー: ${error.message}`);
      }
      this.activeAudioStreams.delete(callId);
    }
  }

  // ユーティリティ：遅延
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // サービス状態取得
  getStatus() {
    return {
      activeStreams: this.activeAudioStreams.size,
      ffmpegPath: this.ffmpegPath,
      streamsDetails: Array.from(this.activeAudioStreams.keys())
    };
  }
}

module.exports = new RtpAudioService();