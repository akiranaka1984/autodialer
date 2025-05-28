// 自動発信システム検証スクリプト
// backend/verify-auto-dial.js

const db = require('./src/services/database');
const dialerService = require('./src/services/dialerService');
const sipService = require('./src/services/sipService');

async function verifyAutoDial() {
  console.log('🔍 自動発信システム検証開始');
  
  try {
    // 1. データベース接続確認
    await db.query('SELECT 1');
    console.log('✅ データベース接続OK');
    
    // 2. SIPサービス状態確認
    console.log('📞 SIPサービス状態:');
    console.log('- 接続状態:', sipService.connected);
    console.log('- アカウント数:', sipService.getAvailableSipAccountCount());
    
    // 3. DialerService状態確認
    const healthStatus = dialerService.getHealthStatus();
    console.log('🚀 DialerService状態:');
    console.log('- 初期化済み:', healthStatus.initialized);
    console.log('- ジョブ実行中:', healthStatus.dialerJobRunning);
    console.log('- アクティブキャンペーン:', healthStatus.activeCampaigns.count);
    
    // 4. テストキャンペーン作成
    const testCampaignId = await createTestCampaign();
    console.log('📋 テストキャンペーン作成:', testCampaignId);
    
    // 5. テスト連絡先追加
    await addTestContact(testCampaignId);
    console.log('👤 テスト連絡先追加完了');
    
    // 6. キャンペーン開始
    const startResult = await dialerService.startCampaign(testCampaignId);
    console.log('🚀 キャンペーン開始結果:', startResult);
    
    // 7. 30秒間監視
    console.log('⏳ 30秒間の動作監視開始...');
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const status = dialerService.getCampaignStatus(testCampaignId);
      console.log(`📊 [${i*5}秒] キャンペーン状態:`, status);
      
      // 通話ログをチェック
      const [callLogs] = await db.query(
        'SELECT * FROM call_logs WHERE campaign_id = ? ORDER BY start_time DESC LIMIT 3',
        [testCampaignId]
      );
      console.log(`📞 [${i*5}秒] 通話ログ:`, callLogs.length, '件');
    }
    
    // 8. 結果確認
    const [finalLogs] = await db.query(
      'SELECT COUNT(*) as count FROM call_logs WHERE campaign_id = ?',
      [testCampaignId]
    );
    console.log('📊 最終結果: 発信回数', finalLogs[0].count);
    
    return finalLogs[0].count > 0;
    
  } catch (error) {
    console.error('❌ 検証エラー:', error);
    return false;
  }
}

async function createTestCampaign() {
  // 発信者番号を取得
  const [callerIds] = await db.query(
    'SELECT id FROM caller_ids WHERE active = 1 LIMIT 1'
  );
  
  if (callerIds.length === 0) {
    throw new Error('有効な発信者番号がありません');
  }
  
  const [result] = await db.query(`
    INSERT INTO campaigns (name, description, caller_id_id, status, max_concurrent_calls)
    VALUES ('自動発信テスト', 'システム検証用', ?, 'draft', 1)
  `, [callerIds[0].id]);
  
  return result.insertId;
}

async function addTestContact(campaignId) {
  // テスト用の安全な番号（実際には発信されない番号）
  await db.query(`
    INSERT INTO contacts (campaign_id, phone, name, status)
    VALUES (?, '08000000000', 'テストユーザー', 'pending')
  `, [campaignId]);
}

// 実行
if (require.main === module) {
  verifyAutoDial().then(success => {
    console.log(success ? '✅ 自動発信システム正常' : '❌ 自動発信システム異常');
    process.exit(success ? 0 : 1);
  });
}

module.exports = { verifyAutoDial };
