// backend/src/services/ivrService.js - 転送対応完全版
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
      
      // 初期挨拶（welcome）- 統合音声
      if (audioMap.welcome) {
        scriptContent += `exten => s,1,Answer()\n`;
        scriptContent += `  same => n,Wait(1)\n`;
        scriptContent += `  same => n,Playback(${path.basename(audioMap.welcome.filename, path.extname(audioMap.welcome.filename))})\n`;
      } else {
        scriptContent += `exten => s,1,Answer()\n`;
        scriptContent += `  same => n,Wait(1)\n`;
        scriptContent += `  same => n,Playback(custom/default-welcome)\n`;
      }
      
      // キー入力待機
      scriptContent += `  same => n,WaitExten(10)\n\n`;
      
      // 1キー: オペレーター転送（統合音声で既に案内済み）
      scriptContent += `exten => 1,1,NoOp(Operator transfer requested)\n`;
      scriptContent += `  same => n,Set(CAMPAIGN_ID=${campaignId})\n`;
      scriptContent += `  same => n,Set(KEYPRESS=1)\n`;
      
      // 転送処理API呼び出し（即座に実行）
      scriptContent += `  same => n,System(curl -X POST http://localhost:5000/api/calls/callback/call-end -H "Content-Type: application/json" -d "{\\"callId\\":\\"${campaignId}-\${UNIQUEID}\\",\\"duration\\":\\"\\${ANSWEREDTIME}\\",\\"disposition\\":\\"\\${DIALSTATUS}\\",\\"keypress\\":\\"1\\"}")\n`;
      scriptContent += `  same => n,Hangup()\n\n`;
      
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
      scriptContent += `  same => n,WaitExten(10)\n\n`;
      
      // 1キー: オペレーター転送
      scriptContent += `exten => 1,1,NoOp(Operator transfer requested)\n`;
      scriptContent += `  same => n,Set(CAMPAIGN_ID=test)\n`;
      scriptContent += `  same => n,Set(KEYPRESS=1)\n`;
      scriptContent += `  same => n,System(curl -X POST http://localhost:5000/api/calls/callback/call-end -H "Content-Type: application/json" -d "{\\"callId\\":\\"test-\${UNIQUEID}\\",\\"duration\\":\\"\\${ANSWEREDTIME}\\",\\"disposition\\":\\"\\${DIALSTATUS}\\",\\"keypress\\":\\"1\\"}")\n`;
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

  async deployIvrScripts() {
    try {
      logger.info('全キャンペーンのIVRスクリプトをデプロイ中...');
      
      // アクティブなキャンペーンを取得
      const db = require('./database');
      const [campaigns] = await db.query(`
        SELECT id, name FROM campaigns 
        WHERE status IN ('active', 'paused') 
        ORDER BY id
      `);
      
      if (campaigns.length === 0) {
        logger.info('デプロイ対象のキャンペーンがありません');
        return true;
      }
      
      let successCount = 0;
      let errorCount = 0;
      
      // 各キャンペーンのIVRスクリプトをデプロイ
      for (const campaign of campaigns) {
        try {
          await this.deployIvrScript(campaign.id);
          successCount++;
          logger.info(`キャンペーン ${campaign.id} (${campaign.name}) デプロイ成功`);
        } catch (error) {
          errorCount++;
          logger.error(`キャンペーン ${campaign.id} (${campaign.name}) デプロイ失敗:`, error.message);
        }
      }
      
      logger.info(`IVRスクリプト一括デプロイ完了: 成功=${successCount}, 失敗=${errorCount}`);
      return true;
    } catch (error) {
      logger.error('IVRスクリプト一括デプロイエラー:', error);
      throw error;
    }
  }

  // 個別キャンペーン用のIVRスクリプトデプロイ
  async deployIvrScript(campaignId) {
    try {
      logger.info(`キャンペーン ${campaignId} のIVRスクリプトをデプロイ中...`);
      
      // IVRスクリプトを生成
      const scriptResult = await this.generateIvrScript(campaignId);
      
      if (!scriptResult || !scriptResult.path) {
        throw new Error('IVRスクリプトの生成に失敗しました');
      }
      
      // 現在のシステムではファイルベースでのデプロイをシミュレート
      // 実際のAsterisk環境では、dialplan.confにincludeを追加したり
      // Asterisk Manager Interface (AMI) でリロードを実行
      
      logger.info(`IVRスクリプトファイル作成完了: ${scriptResult.path}`);
      
      // デプロイ状態をデータベースに記録
      try {
        const db = require('./database');
        await db.query(
          'UPDATE campaigns SET ivr_deployed = true, ivr_deploy_time = NOW() WHERE id = ?',
          [campaignId]
        );
      } catch (dbError) {
        logger.warn('IVRデプロイ状態の記録エラー:', dbError.message);
        // 続行する（重要ではない）
      }
      
      logger.info(`キャンペーン ${campaignId} のIVRスクリプトデプロイ完了`);
      return {
        success: true,
        scriptPath: scriptResult.path,
        message: 'IVRスクリプトのデプロイが完了しました'
      };
    } catch (error) {
      logger.error(`IVRスクリプトデプロイエラー: Campaign=${campaignId}`, error);
      throw new Error(`IVRスクリプトのデプロイに失敗しました: ${error.message}`);
    }
  }
}

module.exports = new IvrService();
