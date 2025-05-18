// backend/src/routes/ivr.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ivrService = require('../services/ivrService');
const audioService = require('../services/audioService');
const db = require('../services/database');
const logger = require('../services/logger');

// 認証を必須とする
router.use(auth);

// IVR設定の取得
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // キャンペーンの音声設定を取得
    const audioFiles = await audioService.getCampaignAudio(campaignId);
    
    // キャンペーンのIVR設定を取得（DB定義など必要に応じて作成）
    let ivrConfig = null;
    try {
      const [configs] = await db.query(
        'SELECT config FROM campaign_ivr_config WHERE campaign_id = ?',
        [campaignId]
      );
      
      if (configs.length > 0 && configs[0].config) {
        ivrConfig = JSON.parse(configs[0].config);
      }
    } catch (error) {
      logger.warn(`キャンペーンID ${campaignId} のIVR設定が見つかりませんでした:`, error);
    }
    
    // デフォルト設定
    if (!ivrConfig) {
      ivrConfig = {
        welcomeMessage: '電話に出ていただきありがとうございます。',
        menuOptions: '詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。',
        transferExtension: '1',
        dncOption: '9',
        maxRetries: 3,
        timeoutSeconds: 10,
        goodbyeMessage: 'お電話ありがとうございました。'
      };
    }
    
    // IVRスクリプトの取得または生成
    let ivrScript;
    try {
      const scriptResult = await ivrService.generateIvrScript(campaignId);
      ivrScript = scriptResult.content;
    } catch (error) {
      logger.warn(`IVRスクリプト生成エラー: ${error.message}`);
      ivrScript = '# IVRスクリプトの生成に失敗しました';
    }
    
    // 音声ファイルをタイプごとにマッピング
    const audioMap = {};
    audioFiles.forEach(audio => {
      audioMap[audio.audio_type] = audio.id;
    });
    
    res.json({
      config: ivrConfig,
      script: ivrScript,
      audio: audioMap
    });
  } catch (error) {
    logger.error('IVR設定取得エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
});

// IVR設定の保存
router.post('/campaigns/:id', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { config, script } = req.body;
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // 設定を保存
    if (config) {
      const [existingConfigs] = await db.query(
        'SELECT id FROM campaign_ivr_config WHERE campaign_id = ?',
        [campaignId]
      );
      
      if (existingConfigs.length > 0) {
        // 既存の設定を更新
        await db.query(
          'UPDATE campaign_ivr_config SET config = ?, updated_at = NOW() WHERE campaign_id = ?',
          [JSON.stringify(config), campaignId]
        );
      } else {
        // 新規設定を挿入
        await db.query(
          'INSERT INTO campaign_ivr_config (campaign_id, config, created_at) VALUES (?, ?, NOW())',
          [campaignId, JSON.stringify(config)]
        );
      }
    }
    
    // スクリプトが提供された場合はファイルに保存
    if (script) {
      await ivrService.saveIvrScript(campaignId, script);
    }
    
    // 更新されたIVRスクリプトを生成
    const scriptResult = await ivrService.generateIvrScript(campaignId);
    
    res.json({
      message: 'IVR設定が保存されました',
      config,
      script: scriptResult.content
    });
  } catch (error) {
    logger.error('IVR設定保存エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
});

// IVRスクリプトの生成
router.post('/campaigns/:id/generate', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { config } = req.body;
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // 新しい設定を保存（提供された場合）
    if (config) {
      const [existingConfigs] = await db.query(
        'SELECT id FROM campaign_ivr_config WHERE campaign_id = ?',
        [campaignId]
      );
      
      if (existingConfigs.length > 0) {
        // 既存の設定を更新
        await db.query(
          'UPDATE campaign_ivr_config SET config = ?, updated_at = NOW() WHERE campaign_id = ?',
          [JSON.stringify(config), campaignId]
        );
      } else {
        // 新規設定を挿入
        await db.query(
          'INSERT INTO campaign_ivr_config (campaign_id, config, created_at) VALUES (?, ?, NOW())',
          [campaignId, JSON.stringify(config)]
        );
      }
    }
    
    // IVRスクリプトを生成
    const scriptResult = await ivrService.generateIvrScript(campaignId);
    
    res.json({
      message: 'IVRスクリプトを生成しました',
      script: scriptResult.content,
      path: scriptResult.path
    });
  } catch (error) {
    logger.error('IVRスクリプト生成エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
});

// IVRスクリプトのデプロイ
router.post('/campaigns/:id/deploy', async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // IVRスクリプトをデプロイ
    const result = await ivrService.deployIvrScript(campaignId);
    
    if (!result) {
      return res.status(500).json({ message: 'IVRスクリプトのデプロイに失敗しました' });
    }
    
    res.json({
      message: 'IVRスクリプトがデプロイされました',
      campaignId
    });
  } catch (error) {
    logger.error('IVRスクリプトデプロイエラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
});

// IVRスクリプトのテスト
router.post('/test-call/:id', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query(`
      SELECT c.*, ci.id as caller_id_id, ci.number as caller_id_number 
      FROM campaigns c 
      JOIN caller_ids ci ON c.caller_id_id = ci.id 
      WHERE c.id = ?
    `, [campaignId]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    const campaign = campaigns[0];
    
    // IVRスクリプトをデプロイ（最新の状態を確保）
    await ivrService.deployIvrScript(campaignId);
    
    // コールサービスに発信リクエスト
    const callService = require('../services/callService');
    
    const callResult = await callService.originate({
      phoneNumber,
      callerID: `"${campaign.name}" <${campaign.caller_id_number}>`,
      context: `autodialer-campaign-${campaignId}`,
      exten: 's',
      priority: 1,
      variables: {
        CAMPAIGN_ID: campaignId,
        CONTACT_ID: 'test',
        CONTACT_NAME: 'テスト発信',
        TEST_CALL: true
      }
    });
    
    res.json({
      success: true,
      message: 'IVRテスト発信を開始しました',
      callId: callResult.ActionID,
      data: callResult
    });
  } catch (error) {
    logger.error('IVRテスト発信エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
});

module.exports = router;