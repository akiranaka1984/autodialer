// backend/src/routes/ivr.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ivrService = require('../services/ivrService');
const audioService = require('../services/audioService');
const db = require('../services/database');
const logger = require('../services/logger');
const multer = require('multer');
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

// 認証を必須とする
router.use(auth);

// キャンペーンの音声設定を取得
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
    
    // キャンペーンのIVR設定を取得
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
    let ivrScript = '';
    try {
      const scriptResult = await ivrService.generateIvrScript(campaignId);
      ivrScript = scriptResult.content;
    } catch (error) {
      logger.warn(`IVRスクリプト生成エラー: ${error.message}`);
      ivrScript = '# IVRスクリプトの生成に失敗しました';
    }
    
    // 音声ファイルをタイプごとにマッピング
    const audioMap = {};
    if (Array.isArray(audioFiles)) {
      audioFiles.forEach(audio => {
        audioMap[audio.audio_type] = audio.id;
      });
    }
    
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

// backend/src/routes/ivr.js の test-call エンドポイントを修正

// IVRスクリプトのテスト（既存のtest-callエンドポイントを置き換え）
router.post('/test-call/:id', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { phoneNumber } = req.body;
    
    logger.info(`IVRテスト発信開始: Campaign=${campaignId}, Phone=${phoneNumber}`);
    
    if (!phoneNumber) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    // 電話番号の簡易検証
    const cleanPhoneNumber = phoneNumber.replace(/[^\d]/g, '');
    if (cleanPhoneNumber.length < 8) {
      return res.status(400).json({ message: '有効な電話番号を入力してください' });
    }
    
    // キャンペーンの存在確認と情報取得
    const [campaigns] = await db.query(`
      SELECT c.*, ci.id as caller_id_id, ci.number as caller_id_number, ci.description
      FROM campaigns c 
      JOIN caller_ids ci ON c.caller_id_id = ci.id 
      WHERE c.id = ? AND ci.active = true
    `, [campaignId]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つからないか、発信者番号が無効です' });
    }
    
    const campaign = campaigns[0];
    
    // IVRスクリプトの生成・デプロイ（最新状態を確保）
    try {
      const scriptResult = await ivrService.generateIvrScript(campaignId);
      logger.info(`IVRスクリプト生成完了: ${scriptResult.path}`);
    } catch (scriptError) {
      logger.warn(`IVRスクリプト生成警告: ${scriptError.message}`);
      // 続行する（既存スクリプトを使用）
    }
    
    // コールサービスで発信実行
    const callService = require('../services/callService');
    
    // 発信パラメータの設定
    const callParams = {
      phoneNumber: cleanPhoneNumber,
      callerID: `"${campaign.name}" <${campaign.caller_id_number}>`,
      context: 'autodialer', // 基本コンテキスト（IVR用に後で拡張）
      exten: 's',
      priority: 1,
      callerIdData: { 
        id: campaign.caller_id_id,
        number: campaign.caller_id_number,
        description: campaign.description 
      },
      variables: {
        CAMPAIGN_ID: campaignId,
        CONTACT_ID: 'ivr-test',
        CONTACT_NAME: 'IVRテスト',
        TEST_CALL: 'true',
        IVR_TEST: 'true'
      },
      mockMode: process.env.NODE_ENV === 'development' && process.env.MOCK_SIP === 'true'
    };
    
    logger.debug('IVRテスト発信パラメータ:', JSON.stringify(callParams, null, 2));
    
    // 発信実行
    const callResult = await callService.originate(callParams);
    
    // テスト発信ログを記録
    try {
      await db.query(`
        INSERT INTO call_logs 
        (campaign_id, caller_id_id, call_id, phone_number, start_time, status, test_call, call_provider)
        VALUES (?, ?, ?, ?, NOW(), 'ORIGINATING', 1, ?)
      `, [
        campaignId, 
        campaign.caller_id_id, 
        callResult.ActionID, 
        cleanPhoneNumber,
        callResult.provider || 'unknown'
      ]);
    } catch (logError) {
      logger.warn('テスト発信ログ記録エラー:', logError.message);
    }
    
    logger.info(`IVRテスト発信成功: CallID=${callResult.ActionID}, Provider=${callResult.provider}`);
    
    res.json({
      success: true,
      message: 'IVRテスト発信を開始しました',
      callId: callResult.ActionID,
      campaignId,
      phoneNumber: cleanPhoneNumber,
      callerIdNumber: campaign.caller_id_number,
      provider: callResult.provider,
      data: callResult
    });
    
  } catch (error) {
    logger.error('IVRテスト発信エラー:', error);
    res.status(500).json({ 
      message: 'IVRテスト発信に失敗しました', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// IVR設定画面から直接音声ファイルをアップロードするAPI
router.post('/upload-audio', upload.single('file'), async (req, res) => {
  try {
    // デバッグ用にリクエスト情報をログ出力
    console.log('アップロードリクエスト受信:', {
      file: req.file ? { 
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : 'なし',
      body: req.body
    });
    if (!req.file) {
      return res.status(400).json({ message: 'ファイルが見つかりません' });
    }
    
    const { name, description, audioType, campaignId } = req.body;
    
    if (!name || !audioType || !campaignId) {
      return res.status(400).json({ message: 'ファイル名、音声タイプ、キャンペーンIDは必須です' });
    }
    
    // 音声ファイルのアップロード
    const audioFile = await audioService.uploadAudio(req.file, name, description);
    
    // キャンペーンに音声ファイルを割り当て
    await audioService.assignAudioToCampaign(campaignId, audioFile.id, audioType);
    
    res.status(201).json({
      success: true,
      audioFile,
      message: '音声ファイルをアップロードし、キャンペーンに割り当てました'
    });
  } catch (error) {
    logger.error('IVR音声ファイルアップロードエラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
});

// 音声ファイル一覧を取得 (ivrコントローラーは使用せず)
router.get('/audio-files', async (req, res) => {
  try {
    const audioFiles = await audioService.getAllAudioFiles();
    
    // 結果形式を統一
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

module.exports = router;