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