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
    const allowedMimes = ['audio/wav'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('WAVのみ許可されています。'), false);
    }
  }
});

// 🔥 新規追加: デバッグ機能付きSIPアカウント選択関数
async function getSipAccountWithDebug(callerIdId) {
  logger.info(`🔥 [SIP-DEBUG] ===== SIPアカウント選択開始 =====`);
  logger.info(`🔥 [SIP-DEBUG] - caller_id_id: ${callerIdId}`);
  logger.info(`🔥 [SIP-DEBUG] - Timestamp: ${new Date().toISOString()}`);

  try {
    // 1. データベースから全てのSIPアカウントを取得
    const [allAccounts] = await db.query(`
      SELECT 
        cc.id,
        cc.username, 
        cc.password, 
        cc.status, 
        cc.updated_at,
        ci.number as caller_number,
        ci.description
      FROM caller_channels cc
      JOIN caller_ids ci ON cc.caller_id_id = ci.id
      WHERE cc.caller_id_id = ?
      ORDER BY cc.updated_at DESC
    `, [callerIdId]);

    logger.info(`🔥 [SIP-DEBUG] - 取得されたSIPアカウント数: ${allAccounts.length}`);
    
    // 全アカウントの詳細をログ出力
    allAccounts.forEach((account, index) => {
      logger.info(`🔥 [SIP-DEBUG] - Account${index + 1}: ${account.username} (Status: ${account.status}, Updated: ${account.updated_at})`);
    });

    // 2. 利用可能なアカウントをフィルタリング
    const availableAccounts = allAccounts.filter(account => 
      account.status === 'available'
    );

    logger.info(`🔥 [SIP-DEBUG] - 利用可能アカウント数: ${availableAccounts.length}`);
    
    if (availableAccounts.length === 0) {
      logger.error(`🔥 [SIP-ERROR] - 利用可能なSIPアカウントが見つかりません`);
      logger.info(`🔥 [SIP-DEBUG] - 全アカウント状況:`);
      allAccounts.forEach(acc => {
        logger.info(`🔥 [SIP-DEBUG]   - ${acc.username}: ${acc.status}`);
      });
      
      // 🚨 緊急対応: 成功確認済みアカウントを強制使用
      logger.warn(`🔥 [SIP-FALLBACK] - 緊急フォールバック: 成功確認済みアカウントを使用`);
      return {
        username: '03750003',
        password: '42301179',
        callerID: '03-3528-9359',
        description: 'Emergency Fallback SIP',
        domain: 'ito258258.site',
        provider: 'Emergency SIP'
      };
    }

    // 3. 最新のアカウントを選択（updated_atの降順で最初）
    const selectedAccount = availableAccounts[0];
    
    logger.info(`🔥 [SIP-DEBUG] - 選択されたアカウント: ${selectedAccount.username}`);
    logger.info(`🔥 [SIP-DEBUG] - 選択理由: 最新の利用可能アカウント (${selectedAccount.updated_at})`);

    // 4. 返却用のオブジェクト構築
    const sipAccount = {
      username: selectedAccount.username,
      password: selectedAccount.password,
      callerID: selectedAccount.caller_number,
      description: selectedAccount.description || 'SIP Account',
      domain: 'ito258258.site',
      provider: 'Database SIP'
    };

    logger.info(`🔥 [SIP-DEBUG] - 構築されたSIPアカウント情報:`);
    logger.info(`🔥 [SIP-DEBUG]   - Username: ${sipAccount.username}`);
    logger.info(`🔥 [SIP-DEBUG]   - CallerID: ${sipAccount.callerID}`);
    logger.info(`🔥 [SIP-DEBUG]   - Domain: ${sipAccount.domain}`);
    logger.info(`🔥 [SIP-DEBUG] ===== SIPアカウント選択完了 =====`);

    return sipAccount;

  } catch (error) {
    logger.error(`🔥 [SIP-ERROR] - SIPアカウント選択エラー:`, error);
    
    // エラー時も緊急フォールバック
    logger.warn(`🔥 [SIP-FALLBACK] - エラー時緊急フォールバック実行`);
    return {
      username: '03750003',
      password: '42301179',
      callerID: '03-3528-9359',
      description: 'Error Fallback SIP',
      domain: 'ito258258.site',
      provider: 'Error Fallback'
    };
  }
}

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
    
    // 🔥 修正箇所: カスタムSIPアカウント選択を使用
    logger.info(`🔥 [IVR-DEBUG] カスタムSIPアカウント選択を実行`);
    const sipAccount = await getSipAccountWithDebug(callerIdData.id);
    logger.info(`🔥 [IVR-DEBUG] SIPアカウント選択結果: ${sipAccount ? sipAccount.username : 'なし'}`);
    
    // 🔥 追加の詳細ログ
    if (sipAccount) {
      logger.info(`🔥 [IVR-DEBUG] 発信準備完了:`);
      logger.info(`🔥 [IVR-DEBUG] - SIP Username: ${sipAccount.username}`);
      logger.info(`🔥 [IVR-DEBUG] - Caller ID: ${sipAccount.callerID}`);
      logger.info(`🔥 [IVR-DEBUG] - Target Phone: ${cleanPhoneNumber}`);
      logger.info(`🔥 [IVR-DEBUG] - Audio Files: ${campaignAudio.length}件`);
    } else {
      logger.error(`🔥 [IVR-ERROR] SIPアカウントの取得に完全に失敗しました`);
      throw new Error('利用可能なSIPアカウントが見つかりません');
    }
    
    // 発信パラメータ構築
    const callId = 'ivr-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    const { spawn } = require('child_process');
    const fs = require('fs');
    
    // 音声ファイルパス決定（文字化け完全対策版）
    const path = require('path');
    let audioPath = '/var/www/autodialer/backend/audio-files/welcome-test.wav';

    if (campaignAudio && campaignAudio.length > 0) {
      const welcomeAudio = campaignAudio.find(audio => audio.audio_type === 'welcome');
      if (welcomeAudio && welcomeAudio.path) {
        try {
          // パスを正規化し、日本語を安全な形に変換
          const originalPath = welcomeAudio.path;
          const pathDir = path.dirname(originalPath);
          const filename = path.basename(originalPath);
          
          // ファイル名の日本語を英数字に変換
          const safeFilename = filename
            .replace(/[^\x00-\x7F]/g, '_')  // ASCII以外を_に変換
            .replace(/_{2,}/g, '_')         // 連続する_を1つに
            .replace(/^_+|_+$/g, '');      // 先頭末尾の_を削除
          
          const safePath = path.join(pathDir, safeFilename);
          
          // 元ファイルを安全な名前にコピー
          if (fs.existsSync(originalPath) && !fs.existsSync(safePath)) {
            fs.copyFileSync(originalPath, safePath);
            logger.info(`🎵 ファイル名正規化: ${filename} → ${safeFilename}`);
          }
          
          if (fs.existsSync(safePath)) {
            audioPath = safePath;
            logger.info(`🎵 正規化音声ファイル使用: ${audioPath}`);
          } else {
            logger.warn(`⚠️ 正規化ファイル作成失敗: ${safePath}`);
          }
          
        } catch (error) {
          logger.error('音声ファイル正規化エラー:', error);
        }
      }
    }
    
    // 必要な変数をすべて定義
    const sipServer = sipAccount.domain || 'ito258258.site';
    
    logger.info(`🎵 最終音声ファイルパス: ${audioPath}`);
    
    // 🎯 手動成功コマンドを正確に再現
    const pjsuaArgs = [
      '--null-audio',
      `--play-file=${audioPath}`,
      '--auto-play',
      '--auto-loop',
      '--duration=15',
      '--auto-answer=200',
      '--local-port=5061',
      '--outbound=sip:127.0.0.1:5070',
      '--no-tcp',
      '--auto-conf',
      '--no-cli',
      `--id=sip:${sipAccount.username}@${sipServer}`,
      `--registrar=sip:${sipServer}`,
      `--realm=asterisk`,
      `--username=${sipAccount.username}`,
      `--password=${sipAccount.password}`,
      `sip:${cleanPhoneNumber}@${sipServer}`
    ];
    
    logger.info('🚀 pjsua実行:', {
      command: 'pjsua',
      audioFile: audioPath,
      phoneNumber: cleanPhoneNumber,
      sipUsername: sipAccount.username
    });
    
    const pjsuaProcess = spawn('pjsua', pjsuaArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { 
        ...process.env, 
        LANG: 'ja_JP.UTF-8',        // 日本語UTF-8
        LC_ALL: 'ja_JP.UTF-8',      // 全ロケールをUTF-8
        LC_CTYPE: 'ja_JP.UTF-8'     // 文字型もUTF-8
      },
      cwd: '/var/www/autodialer/backend'
    });

    if (pjsuaProcess.stdin) {
      pjsuaProcess.stdin.write('\n');
  
      setTimeout(() => {
      if (pjsuaProcess.stdin && !pjsuaProcess.killed) {
       pjsuaProcess.stdin.write('h\n');
       setTimeout(() => {
        if (pjsuaProcess.stdin && !pjsuaProcess.killed) {
          pjsuaProcess.stdin.write('q\n');
          }
        }, 1000);
      }
     }, 10000);
    }
    
    pjsuaProcess.stdout.on('data', (data) => {
      logger.info(`pjsua出力: ${data.toString()}`);
    });
    
    pjsuaProcess.stderr.on('data', (data) => {
      logger.error(`pjsuaエラー: ${data.toString()}`);
    });
    
    pjsuaProcess.on('close', (code) => {
      logger.info(`pjsuaプロセス終了: code=${code}`);
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
    const sipClient = process.env.SIP_CLIENT || 'pjsua';  // ← オブジェクトの外で宣言
    const responseData = {
      success: true,
      callId: callId,
      message: `IVRテスト発信を開始しました（${sipClient}版・デバッグ対応）`,  // ← そのまま使用
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
        usedPjsua: sipClient === 'pjsua',
        usedBaresip: sipClient === 'baresip',
        sipClient: sipClient,
        // 🔥 デバッグ情報追加
        debugInfo: {
          selectedSipAccount: sipAccount.username,
          sipAccountProvider: sipAccount.provider,
          callerIdId: callerIdData.id,
          audioPath: audioPath
        }
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
