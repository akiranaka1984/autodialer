// IVRテスト発信をメインAPIに統一
router.post('/test-call/:id', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { phoneNumber } = req.body;
    
    // メインのテスト発信APIにリダイレクト
    const callController = require('../controllers/callController');
    
    // パラメータを統一形式に変換
    req.body = {
      phoneNumber,
      callerID: undefined, // キャンペーンから取得
      mockMode: false,
      provider: 'sip',
      campaignId // 重要：キャンペーンIDを追加
    };
    
    // メインのテスト発信処理を呼び出し
    return await callController.testCall(req, res);
    
  } catch (error) {
    logger.error('IVRテスト発信エラー:', error);
    res.status(500).json({ 
      success: false,
      message: 'IVRテスト発信に失敗しました', 
      error: error.message 
    });
  }
});
