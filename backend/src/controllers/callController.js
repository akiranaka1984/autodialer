const logger = require('../services/logger');
const asteriskMock = require('../services/asteriskMock');

// テスト発信
exports.testCall = async (req, res) => {
  try {
    const { phoneNumber, callerID } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ message: '発信先電話番号は必須です' });
    }
    
    // 発信パラメータの設定
    const params = {
      phoneNumber,
      callerID: callerID || '0312345678',
      context: 'autodialer',
      exten: 's',
      priority: 1,
      variables: {
        CAMPAIGN_ID: 'TEST',
        CONTACT_ID: 'TEST',
        CONTACT_NAME: 'テストユーザー',
        COMPANY: 'テスト会社'
      }
    };
    
    // 発信実行
    const result = await asteriskMock.originate(params);
    
    // 発信結果を返す
    res.json({
      success: true,
      callId: result.ActionID,
      message: 'テスト発信が開始されました（モックモード）',
      data: result
    });
    
    // 通話終了のシミュレーション（10秒後）
    setTimeout(() => {
      asteriskMock.simulateCallEnd(result.ActionID, 'ANSWERED', 10);
    }, 10000);
    
  } catch (error) {
    logger.error('テスト発信エラー:', error);
    res.status(500).json({ message: 'テスト発信に失敗しました', error: error.message });
  }
};
