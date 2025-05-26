// backend/src/routes/ivr.js - 修正版
const express = require('express');
const router = express.Router();

const ivrService = require('../services/ivrService');
const audioService = require('../services/audioService');
const db = require('../services/database');
const logger = require('../services/logger');
const multer = require('multer');
const callService = require('../services/callService');

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('サポートされていないファイル形式です。WAV, MP3, OGGのみ許可されています。'), false);
    }
  }
});

// キャンペーンの音声設定を取得
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    const audioFiles = await audioService.getCampaignAudio(campaignId);
    
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
    
    let ivrScript = '';
    try {
      const scriptResult = await ivrService.generateIvrScript(campaignId);
      ivrScript = scriptResult.content;
    } catch (error) {
      logger.warn(`IVRスクリプト生成エラー: ${error.message}`);
      ivrScript = '# IVRスクリプトの生成に失敗しました';
    }
    
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
    
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    if (config) {
      const [existingConfigs] = await db.query(
        'SELECT id FROM campaign_ivr_config WHERE campaign_id = ?',
        [campaignId]
      );
      
      if (existingConfigs.length > 0) {
        await db.query(
          'UPDATE campaign_ivr_config SET config = ?, updated_at = NOW() WHERE campaign_id = ?',
          [JSON.stringify(config), campaignId]
        );
      } else {
        await db.query(
          'INSERT INTO campaign_ivr_config (campaign_id, config, created_at) VALUES (?, ?, NOW())',
          [campaignId, JSON.stringify(config)]
        );
      }
    }
    
    if (script) {
      await ivrService.saveIvrScript(campaignId, script);
    }
    
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
    
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    if (config) {
      const [existingConfigs] = await db.query(
        'SELECT id FROM campaign_ivr_config WHERE campaign_id = ?',
        [campaignId]
      );
      
      if (existingConfigs.length > 0) {
        await db.query(
          'UPDATE campaign_ivr_config SET config = ?, updated_at = NOW() WHERE campaign_id = ?',
          [JSON.stringify(config), campaignId]
        );
      } else {
        await db.query(
          'INSERT INTO campaign_ivr_config (campaign_id, config, created_at) VALUES (?, ?, NOW())',
          [campaignId, JSON.stringify(config)]
        );
      }
    }
    
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
    
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
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

// ✅ 修正版: IVRテスト発信エンドポイント
router.post('/test-call', async (req, res) => {
  try {
    const { phoneNumber, campaignId, callerID } = req.body;
    
    logger.info(`🔥 IVRテスト発信開始: Campaign=${campaignId}, Phone=${phoneNumber}, CallerID=${callerID}`);
    
    // 必須パラメータ検証
    if (!phoneNumber) {
      logger.warn('IVRテスト発信: 電話番号が未指定');
      return res.status(400).json({ message: '発信先電話番号は必須です' });
    }
    
    if (!campaignId) {
      logger.warn('IVRテスト発信: キャンペーンIDが未指定');
      return res.status(400).json({ message: 'キャンペーンIDは必須です' });
    }
    
    // 電話番号の正規化
    const cleanPhoneNumber = phoneNumber.replace(/[^\d]/g, '');
    if (cleanPhoneNumber.length < 8) {
      return res.status(400).json({ message: '有効な電話番号を入力してください' });
    }
    
    // キャンペーンの存在確認と詳細取得
    const [campaigns] = await db.query(
      'SELECT * FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      logger.error(`IVRテスト発信: キャンペーンが見つかりません - ID: ${campaignId}`);
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    const campaign = campaigns[0];
    logger.info(`✅ キャンペーン確認: ${campaign.name} (ID: ${campaign.id})`);
    
    // 発信者番号の決定ロジック
    let callerIdData = null;
    let finalCallerID = callerID;
    
    // 1. 明示的に指定された発信者番号
    if (callerID) {
      const [specifiedCallerIds] = await db.query(
        'SELECT * FROM caller_ids WHERE id = ? AND active = true',
        [callerID]
      );
      
      if (specifiedCallerIds.length > 0) {
        callerIdData = specifiedCallerIds[0];
        logger.info(`✅ 指定発信者番号: ${callerIdData.number} (ID: ${callerIdData.id})`);
      } else {
        logger.warn(`⚠️ 指定発信者番号無効: ID=${callerID}`);
      }
    }
    
    // 2. キャンペーンに紐付いた発信者番号
    if (!callerIdData && campaign.caller_id_id) {
      const [campaignCallerIds] = await db.query(
        'SELECT * FROM caller_ids WHERE id = ? AND active = true',
        [campaign.caller_id_id]
      );
      
      if (campaignCallerIds.length > 0) {
        callerIdData = campaignCallerIds[0];
        finalCallerID = callerIdData.id;
        logger.info(`✅ キャンペーン発信者番号: ${callerIdData.number} (ID: ${callerIdData.id})`);
      }
    }
    
    // 3. デフォルト発信者番号（最新のアクティブなもの）
    if (!callerIdData) {
      const [defaultCallerIds] = await db.query(
        'SELECT * FROM caller_ids WHERE active = true ORDER BY created_at DESC LIMIT 1'
      );
      
      if (defaultCallerIds.length > 0) {
        callerIdData = defaultCallerIds[0];
        finalCallerID = callerIdData.id;
        logger.info(`✅ デフォルト発信者番号: ${callerIdData.number} (ID: ${callerIdData.id})`);
      } else {
        logger.error('❌ 有効な発信者番号が見つかりません');
        return res.status(400).json({ 
          message: '有効な発信者番号が見つかりません。発信者番号を登録してください。' 
        });
      }
    }
    
    // 音声ファイルの取得
    logger.info(`🎵 音声ファイル取得開始: campaignId=${campaignId}`);
    let campaignAudio = [];
    try {
      campaignAudio = await audioService.getCampaignAudio(campaignId);
      logger.info(`🎵 音声ファイル取得完了: ${campaignAudio ? campaignAudio.length : 0}件`);
      
      if (campaignAudio && campaignAudio.length > 0) {
        campaignAudio.forEach((audio, index) => {
          logger.info(`🎵 音声${index + 1}: ${audio.audio_type} - ${audio.name}`);
        });
      } else {
        logger.warn('⚠️ 音声ファイルが設定されていません');
      }
    } catch (audioError) {
      logger.error('音声ファイル取得エラー:', audioError);
      campaignAudio = [];
    }
    
    // IVR設定の取得
    let ivrConfig = null;
    try {
      const [ivrConfigs] = await db.query(
        'SELECT config FROM campaign_ivr_config WHERE campaign_id = ?',
        [campaignId]
      );
      
      if (ivrConfigs.length > 0) {
        ivrConfig = JSON.parse(ivrConfigs[0].config);
        logger.info('✅ IVR設定取得完了');
      } else {
        logger.info('ℹ️ IVR設定なし - デフォルト動作');
        ivrConfig = {
          welcomeMessage: '電話に出ていただきありがとうございます。',
          menuOptions: '詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。',
          goodbye: 'お電話ありがとうございました。',
          transferExtension: '1',
          dncOption: '9',
          maxRetries: 3,
          timeoutSeconds: 10
        };
      }
    } catch (ivrError) {
      logger.warn('IVR設定取得エラー（デフォルト使用）:', ivrError.message);
      ivrConfig = {
        welcomeMessage: '電話に出ていただきありがとうございます。',
        menuOptions: '詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。',
        goodbye: 'お電話ありがとうございました。'
      };
    }
    
    // 🚀 発信パラメータ構築（callController.testCallと同じ形式）
    const params = {
      phoneNumber: cleanPhoneNumber,
      callerID: callerIdData 
        ? `"${callerIdData.description || 'IVR Test'}" <${callerIdData.number}>` 
        : process.env.DEFAULT_CALLER_ID || '"IVR System" <03-5946-8520>',
      context: 'autodialer',
      exten: 's',
      priority: 1,
      variables: {
        CAMPAIGN_ID: campaignId,
        CONTACT_ID: 'IVR_TEST',
        CONTACT_NAME: 'IVRテストユーザー',
        COMPANY: 'IVRテスト発信',
        IVR_MODE: 'true',
        TEST_CALL: 'true'
      },
      callerIdData,
      mockMode: false, // IVRテストは常に実発信
      provider: 'sip', // SIP強制
      campaignAudio,
      ivrConfig
    };
    
    logger.info('🚀 発信パラメータ構築完了:', {
      phoneNumber: params.phoneNumber,
      callerID: params.callerID,
      provider: params.provider,
      audioCount: campaignAudio.length,
      hasIvrConfig: !!ivrConfig,
      mockMode: params.mockMode
    });
    
    // ✅ 修正: 切断防止版sipcmdを使用
    logger.info('📞 切断防止版sipcmd使用でcallService.originate() 実行中...');
    
    // 🚀 カスタム発信処理（切断防止版）
    const sipService = require('../services/sipService');
    
    // 利用可能なSIPアカウントを取得
    const sipAccount = await sipService.getAvailableSipAccount();
    if (!sipAccount) {
      throw new Error('利用可能なSIPアカウントが見つかりません');
    }
    
    // 切断防止版sipcmdで発信
    const callId = 'ivr-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    const { spawn } = require('child_process');
    
    // 音声ファイルパスを決定
    let audioPath = '';
    if (campaignAudio && campaignAudio.length > 0) {
      const welcomeAudio = campaignAudio.find(audio => audio.audio_type === 'welcome');
      if (welcomeAudio) {
        audioPath = welcomeAudio.path || `/var/www/autodialer/backend/audio-files/${welcomeAudio.filename}`;
      }
    }
    
    // 切断防止版sipcmdコマンドを実行
    const sipcmdArgs = [
      sipAccount.username,
      sipAccount.password,
      sipAccount.domain || 'ito258258.site',
      cleanPhoneNumber,
      audioPath
    ];
    
    logger.info('🚀 切断防止版sipcmd実行:', {
      command: '/usr/local/bin/sipcmd-no-hangup',
      args: sipcmdArgs.map((arg, i) => i === 1 ? '***' : arg) // パスワードを隠す
    });
    
    const sipcmdProcess = spawn('/usr/local/bin/sipcmd-no-hangup', sipcmdArgs);
    
    sipcmdProcess.stdout.on('data', (data) => {
      logger.info(`sipcmd出力: ${data.toString()}`);
    });
    
    sipcmdProcess.stderr.on('data', (data) => {
      logger.error(`sipcmdエラー: ${data.toString()}`);
    });
    
    sipcmdProcess.on('close', (code) => {
      logger.info(`sipcmdプロセス終了: code=${code}`);
    });
    
    // 通話ログに記録
    try {
      await db.query(`
        INSERT INTO call_logs 
        (call_id, campaign_id, caller_id_id, phone_number, start_time, status, test_call, call_provider, has_audio, audio_file_count)
        VALUES (?, ?, ?, ?, NOW(), 'ORIGINATING', 1, ?, ?, ?)
      `, [
        callId, 
        campaignId, 
        callerIdData.id, 
        cleanPhoneNumber, 
        'sip',
        campaignAudio.length > 0 ? 1 : 0,
        campaignAudio.length
      ]);
      
      logger.info(`✅ 通話ログ記録完了: ${callId}`);
    } catch (logError) {
      logger.error('通話ログ記録エラー（発信は継続）:', logError);
    }
    
    // レスポンス構築
    const responseData = {
      success: true,
      callId: callId,
      message: 'IVRテスト発信を開始しました（切断防止版）',
      data: {
        phoneNumber: cleanPhoneNumber,
        campaignId: parseInt(campaignId),
        campaignName: campaign.name,
        callerNumber: callerIdData.number,
        callerDescription: callerIdData.description,
        provider: 'sip',
        audioFilesCount: campaignAudio.length,
        hasIvrConfig: !!ivrConfig,
        ivrSettings: ivrConfig,
        timestamp: new Date().toISOString(),
        usedSipcmdNoHangup: true
      }
    };
    
    logger.info('✅ IVRテスト発信処理完了:', responseData);
    res.json(responseData);
    
  } catch (error) {
    logger.error('🔥 IVRテスト発信エラー:', error);
    res.status(500).json({ 
      success: false,
      message: 'IVRテスト発信に失敗しました', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// IVR設定画面から直接音声ファイルをアップロードするAPI
router.post('/upload-audio', upload.single('file'), async (req, res) => {
  try {
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
    
    const audioFile = await audioService.uploadAudio(req.file, name, description);
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

// 音声ファイル一覧を取得
router.get('/audio-files', async (req, res) => {
  try {
    const audioFiles = await audioService.getAllAudioFiles();
    
    if (Array.isArray(audioFiles) && audioFiles.length === 2 && Array.isArray(audioFiles[0])) {
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
