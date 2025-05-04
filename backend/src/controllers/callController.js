const logger = require('../services/logger');
const asterisk = require('../services/asterisk');
const db = require('../services/database');

// テスト発信
exports.testCall = async (req, res) => {
  try {
    const { phoneNumber, callerID, mockMode } = req.body;
    
    // デバッグ情報を追加
    logger.info('テスト発信リクエスト受信:', {
      phoneNumber,
      callerID,
      mockMode,
      環境変数_MOCK_ASTERISK: process.env.MOCK_ASTERISK,
      環境変数_USE_TWILIO: process.env.USE_TWILIO
    });
    
    if (!phoneNumber) {
      return res.status(400).json({ message: '発信先電話番号は必須です' });
    }
    
    // テスト用の一時的なモック設定
    const originalMockMode = process.env.MOCK_ASTERISK;
    if (mockMode !== undefined) {
      process.env.MOCK_ASTERISK = mockMode ? 'true' : 'false';
      logger.info(`テスト用にMOCK_ASTERISKを${process.env.MOCK_ASTERISK}に変更`);
    }
    
    // 発信者番号の検証（指定された場合）
    let callerIdData = null;
    if (callerID) {
      const callerIds = await db.query('SELECT * FROM caller_ids WHERE id = ? AND active = true', [callerID]);
      
      if (callerIds.length === 0) {
        return res.status(400).json({ message: '選択された発信者番号が見つからないか無効です' });
      }
      
      callerIdData = callerIds[0];
    }
    
    // 発信パラメータの設定
    const params = {
      phoneNumber,
      callerID: callerIdData ? `"${callerIdData.description || ''}" <${callerIdData.number}>` : '0312345678',
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
    
    logger.info(`テスト発信実行: 発信先=${phoneNumber}, モード=${process.env.MOCK_ASTERISK}`);
    
    // 発信実行
    const result = await asterisk.originate(params);
    
    // 通話ログに記録
    const [logResult] = await db.query(`
      INSERT INTO call_logs 
      (call_id, caller_id_id, phone_number, start_time, status, test_call)
      VALUES (?, ?, ?, NOW(), 'ORIGINATING', 1)
    `, [result.ActionID, callerIdData ? callerIdData.id : null, phoneNumber]);
    
    // モック設定を元に戻す
    process.env.MOCK_ASTERISK = originalMockMode;
    
    // 発信結果を返す
    res.json({
      success: true,
      callId: result.ActionID,
      message: 'テスト発信が開始されました' + (mockMode ? '（モックモード）' : ''),
      data: result
    });
    
    // 通話終了のシミュレーション（モックモードの場合）
    if (mockMode) {
      setTimeout(() => {
        asterisk.simulateCallEnd(result.ActionID, 'ANSWERED', 10);
        
        // 通話ログを更新
        db.query(`
          UPDATE call_logs
          SET end_time = NOW(), duration = 10, status = 'ANSWERED'
          WHERE call_id = ?
        `, [result.ActionID]);
        
      }, 10000);
    }
    
  } catch (error) {
    logger.error('テスト発信エラー:', error);
    res.status(500).json({ message: 'テスト発信に失敗しました', error: error.message });
  }
};