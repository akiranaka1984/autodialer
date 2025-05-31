const db = require('../services/database');
const logger = require('../services/logger');

// キャンペーンのIVR設定を取得
exports.getCampaignIvr = async (req, res) => {
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
    
    // IVR設定を取得（DB定義など必要に応じて作成）
    let ivrConfig = {
      welcomeMessage: '電話に出ていただきありがとうございます。',
      menuOptions: '詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。',
      goodbye: 'お電話ありがとうございました。',
      transferExtension: '1',
      dncOption: '9',
      maxRetries: 3,
      timeoutSeconds: 10
    };
    
    res.json(ivrConfig);
  } catch (error) {
    logger.error('IVR設定取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// IVR設定を保存
exports.saveCampaignIvr = async (req, res) => {
  try {
    const campaignId = req.params.id;
    const config = req.body;
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // 設定を保存（実際のデータベース処理を実装）
    
    res.json({ message: 'IVR設定が保存されました', config });
  } catch (error) {
    logger.error('IVR設定保存エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

exports.getAudioFiles = async (req, res) => {
  try {
    // モックデータを返す
    const audioFiles = [
      { id: 1, name: 'ウェルカムメッセージ', filename: 'welcome.wav', type: 'welcome' },
      { id: 2, name: 'メニュー案内', filename: 'menu.wav', type: 'menu' },
      { id: 3, name: '終了メッセージ', filename: 'goodbye.wav', type: 'goodbye' }
    ];
    
    res.json(audioFiles);
  } catch (error) {
    logger.error('音声ファイル取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// backend/src/controllers/ivrController.js への追加
// 既存のコードの最後に以下のメソッドを追加してください

const callService = require('../services/callService');
const audioService = require('../services/audioService');

// 🚀 IVRテスト発信メソッド
exports.ivrTestCall = async (req, res) => {
  try {
    const { phoneNumber, campaignId, callerID } = req.body;
    
    logger.info(`🔥 IVRテスト発信開始 (Controller): Campaign=${campaignId}, Phone=${phoneNumber}, CallerID=${callerID}`);
    
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
        // デフォルトIVR設定
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
      context: 'autodialer', // 通常発信と同じ
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
    
    // callService.originate()で発信実行
    logger.info('📞 callService.originate() 実行中...');
    const result = await callService.originate(params);
    
    logger.info('📞 callService発信結果:', {
      callId: result.ActionID,
      provider: result.provider,
      message: result.Message,
      success: !!result.ActionID
    });
    
    // 通話ログに記録
    try {
      await db.query(`
        INSERT INTO call_logs 
        (call_id, campaign_id, caller_id_id, phone_number, start_time, status, test_call, call_provider, has_audio, audio_file_count)
        VALUES (?, ?, ?, ?, NOW(), 'ORIGINATING', 1, ?, ?, ?)
      `, [
        result.ActionID, 
        campaignId, 
        callerIdData.id, 
        cleanPhoneNumber, 
        result.provider || 'sip',
        campaignAudio.length > 0 ? 1 : 0,
        campaignAudio.length
      ]);
      
      logger.info(`✅ 通話ログ記録完了: ${result.ActionID}`);
    } catch (logError) {
      logger.error('通話ログ記録エラー（発信は継続）:', logError);
    }
    
    // レスポンス構築
    const responseData = {
      success: true,
      callId: result.ActionID,
      message: 'IVRテスト発信を開始しました',
      data: {
        phoneNumber: cleanPhoneNumber,
        campaignId: parseInt(campaignId),
        campaignName: campaign.name,
        callerNumber: callerIdData.number,
        callerDescription: callerIdData.description,
        provider: result.provider || 'sip',
        audioFilesCount: campaignAudio.length,
        hasIvrConfig: !!ivrConfig,
        ivrSettings: ivrConfig,
        timestamp: new Date().toISOString()
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
};