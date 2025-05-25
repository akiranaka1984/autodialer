// 連絡先一覧を取得 - 修正版
router.get('/', async (req, res) => {
  try {
    const { campaignId } = req.params;
    console.log(`連絡先一覧取得: キャンペーンID=${campaignId}`);
    
    if (!campaignId) {
      return res.status(400).json({ message: 'キャンペーンIDが必要です' });
    }
    
    // データベースから連絡先を取得
    const [contacts] = await db.query(
      'SELECT * FROM contacts WHERE campaign_id = ? ORDER BY id DESC LIMIT 20',
      [campaignId]
    );
    
    console.log(`連絡先取得成功: ${contacts.length}件`);
    res.json({ contacts, total: contacts.length });
  } catch (error) {
    console.error('連絡先取得エラー:', error);
    res.status(500).json({ message: error.message });
  }
});
