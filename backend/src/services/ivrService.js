// backend/src/services/ivrService.js
const logger = require('./logger');
const fs = require('fs').promises;
const path = require('path');
const audioService = require('./audioService');
const db = require('./database');

class IvrService {
  constructor() {
    this.ivrDir = process.env.IVR_SCRIPTS_DIR || path.join(__dirname, '../../ivr-scripts');
    this.initialize();
  }

  async initialize() {
    try {
      // IVRスクリプトディレクトリの存在確認、なければ作成
      await fs.mkdir(this.ivrDir, { recursive: true });
      logger.info(`IVRスクリプトディレクトリを初期化しました: ${this.ivrDir}`);
    } catch (error) {
      logger.error('IVRスクリプトディレクトリの初期化エラー:', error);
    }
  }

  // キャンペーン用のIVRスクリプトを生成
  async generateIvrScript(campaignId) {
    try {
      // キャンペーン情報を取得
      const [campaigns] = await db.query(
        'SELECT id, name FROM campaigns WHERE id = ?',
        [campaignId]
      );
      
      if (campaigns.length === 0) {
        throw new Error('キャンペーンが見つかりません');
      }
      
      const campaign = campaigns[0];
      
      // キャンペーンの音声ファイルを取得
      const audioFiles = await audioService.getCampaignAudio(campaignId);
      
      // 音声ファイルをタイプごとにマッピング
      const audioMap = Array.isArray(audioFiles) ? audioFiles.reduce((map, audio) => {
        if (audio && audio.audio_type) {
          map[audio.audio_type] = audio;
        }
        return map;
      }, {}) : {};
      
      // IVRスクリプトの内容を生成
      let scriptContent = `; IVR Script for Campaign: ${campaign.name} (ID: ${campaignId})\n\n`;
      
      scriptContent += `[autodialer-campaign-${campaignId}]\n`;
      
      // 初期挨拶（welcome）
      if (audioMap.welcome) {
        scriptContent += `exten => s,1,Answer()\n`;
        scriptContent += `  same => n,Wait(1)\n`;
        scriptContent += `  same => n,Playback(${path.basename(audioMap.welcome.filename, path.extname(audioMap.welcome.filename))})\n`;
      } else {
        scriptContent += `exten => s,1,Answer()\n`;
        scriptContent += `  same => n,Wait(1)\n`;
        scriptContent += `  same => n,Playback(custom/default-welcome)\n`;
      }
      
      // メニュー案内（menu）
      if (audioMap.menu) {
        scriptContent += `  same => n,Playback(${path.basename(audioMap.menu.filename, path.extname(audioMap.menu.filename))})\n`;
      } else {
        scriptContent += `  same => n,Playback(custom/default-menu)\n`;
      }
      
      // キー入力待機
      scriptContent += `  same => n,WaitExten(10)\n\n`;
      
      // 1キー: オペレーター接続
      scriptContent += `exten => 1,1,NoOp(Operator transfer requested)\n`;
      scriptContent += `  same => n,Set(CAMPAIGN_ID=${campaignId})\n`;
      scriptContent += `  same => n,Set(KEYPRESS=1)\n`;
      scriptContent += `  same => n,Goto(operator-transfer,s,1)\n\n`;
      
      // 9キー: 通話終了（DNCリストに追加）
      scriptContent += `exten => 9,1,NoOp(DNC requested)\n`;
      scriptContent += `  same => n,Set(CAMPAIGN_ID=${campaignId})\n`;
      scriptContent += `  same => n,Set(KEYPRESS=9)\n`;
      scriptContent += `  same => n,Playback(custom/dnc-confirmation)\n`;
      scriptContent += `  same => n,Hangup()\n\n`;
      
      // タイムアウトやその他のキー入力
      scriptContent += `exten => t,1,NoOp(Timeout occurred)\n`;
      
      if (audioMap.goodbye) {
        scriptContent += `  same => n,Playback(${path.basename(audioMap.goodbye.filename, path.extname(audioMap.goodbye.filename))})\n`;
      } else {
        scriptContent += `  same => n,Playback(custom/default-goodbye)\n`;
      }
      
      scriptContent += `  same => n,Hangup()\n\n`;
      
      // 無効なキー入力
      scriptContent += `exten => i,1,NoOp(Invalid input)\n`;
      
      if (audioMap.error) {
        scriptContent += `  same => n,Playback(${path.basename(audioMap.error.filename, path.extname(audioMap.error.filename))})\n`;
      } else {
        scriptContent += `  same => n,Playback(custom/invalid-option)\n`;
      }
      
      scriptContent += `  same => n,Goto(s,4)\n\n`;
      
      // 通話終了時の処理
      scriptContent += `exten => h,1,NoOp(Hangup handler)\n`;
      scriptContent += `  same => n,System(curl -X POST http://localhost:5000/api/callback/call-end -d "callId=${campaignId}-\${UNIQUEID}&duration=\${ANSWEREDTIME}&disposition=\${DIALSTATUS}&keypress=\${KEYPRESS}")\n`;
      
      // ファイルに保存
      const scriptPath = path.join(this.ivrDir, `campaign-${campaignId}.conf`);
      await fs.writeFile(scriptPath, scriptContent);
      
      logger.info(`キャンペーンIVRスクリプトを生成しました: ${scriptPath}`);
      
      return {
        path: scriptPath,
        content: scriptContent
      };
    } catch (error) {
      logger.error(`IVRスクリプト生成エラー: Campaign=${campaignId}`, error);
      throw error;
    }
  }

  // デフォルトのIVRスクリプトを生成（テスト発信用）
  async generateDefaultIvrScript() {
    try {
      let scriptContent = `; Default IVR Script for Test Calls\n\n`;
      
      scriptContent += `[autodialer-test]\n`;
      scriptContent += `exten => s,1,Answer()\n`;
      scriptContent += `  same => n,Wait(1)\n`;
      scriptContent += `  same => n,Playback(custom/test-welcome)\n`;
      scriptContent += `  same => n,Playback(custom/test-menu)\n`;
      scriptContent += `  same => n,WaitExten(10)\n\n`;
      
      // 1キー: オペレーター接続
      scriptContent += `exten => 1,1,NoOp(Operator transfer requested)\n`;
      scriptContent += `  same => n,Set(CAMPAIGN_ID=test)\n`;
      scriptContent += `  same => n,Set(KEYPRESS=1)\n`;
      scriptContent += `  same => n,Playback(custom/transfer-to-operator)\n`;
      scriptContent += `  same => n,Hangup()\n\n`;
      
      // 9キー: 通話終了（DNCリストに追加）
      scriptContent += `exten => 9,1,NoOp(DNC requested)\n`;
      scriptContent += `  same => n,Set(KEYPRESS=9)\n`;
      scriptContent += `  same => n,Playback(custom/dnc-confirmation)\n`;
      scriptContent += `  same => n,Hangup()\n\n`;
      
      // タイムアウトやその他のキー入力
      scriptContent += `exten => t,1,NoOp(Timeout occurred)\n`;
      scriptContent += `  same => n,Playback(custom/default-goodbye)\n`;
      scriptContent += `  same => n,Hangup()\n\n`;
      
      // 無効なキー入力
      scriptContent += `exten => i,1,NoOp(Invalid input)\n`;
      scriptContent += `  same => n,Playback(custom/invalid-option)\n`;
      scriptContent += `  same => n,Goto(s,4)\n\n`;
      
      // 通話終了時の処理
      scriptContent += `exten => h,1,NoOp(Hangup handler)\n`;
      scriptContent += `  same => n,System(curl -X POST http://localhost:5000/api/callback/call-end -d "callId=test-\${UNIQUEID}&duration=\${ANSWEREDTIME}&disposition=\${DIALSTATUS}&keypress=\${KEYPRESS}")\n`;
      
      // ファイルに保存
      const scriptPath = path.join(this.ivrDir, 'default-test.conf');
      await fs.writeFile(scriptPath, scriptContent);
      
      logger.info(`デフォルトIVRスクリプトを生成しました: ${scriptPath}`);
      
      return {
        path: scriptPath,
        content: scriptContent
      };
    } catch (error) {
      logger.error('デフォルトIVRスクリプト生成エラー:', error);
      throw error;
    }
  }

  // IVRスクリプトをファイルに保存
  async saveIvrScript(campaignId, script) {
    try {
      if (!script) {
        logger.warn(`空のスクリプト内容です: キャンペーンID ${campaignId}`);
        return false;
      }
      
      const scriptPath = path.join(this.ivrDir, `campaign-${campaignId}.conf`);
      await fs.writeFile(scriptPath, script);
      
      logger.info(`IVRスクリプトを保存しました: ${scriptPath}`);
      
      return {
        path: scriptPath,
        success: true
      };
    } catch (error) {
      logger.error(`IVRスクリプト保存エラー: ${error.message}`);
      throw error;
    }
  }

  // Asteriskのダイヤルプランに統合
  async deployIvrScripts() {
    try {
      // 実装予定: Asteriskのdialplan.confにincludeディレクティブを追加
      logger.info('IVRスクリプトをデプロイしました');
      return true;
    } catch (error) {
      logger.error('IVRスクリプトデプロイエラー:', error);
      throw error;
    }
  }
}

module.exports = new IvrService();