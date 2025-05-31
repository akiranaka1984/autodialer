// restart-dialer-fixed.js - 現在のdialerServiceに対応した再起動
const dialerService = require('./src/services/dialerService');

async function restartDialer() {
  console.log('🔄 DialerService強制再起動開始...\n');
  
  try {
    // 1. 現在の状態確認
    console.log('📊 再起動前の状態:');
    console.log(`  - 有効: ${dialerService.enabled !== false}`);
    console.log(`  - 自動発信: ${dialerService.dialerIntervalId ? '動作中' : '停止'}`);
    console.log(`  - キャンペーン監視: ${dialerService.campaignWatcherIntervalId ? '動作中' : '停止'}`);
    console.log(`  - アクティブキャンペーン: ${dialerService.activeCampaigns ? dialerService.activeCampaigns.size : 0}件`);
    
    // 2. システム停止（利用可能なメソッドで）
    console.log('\n🛑 システム停止...');
    
    // 利用可能なメソッドを確認
    if (typeof dialerService.stopSystem === 'function') {
      await dialerService.stopSystem();
    } else {
      // 手動停止
      if (dialerService.dialerIntervalId) {
        clearInterval(dialerService.dialerIntervalId);
        dialerService.dialerIntervalId = null;
      }
      if (dialerService.campaignWatcherIntervalId) {
        clearInterval(dialerService.campaignWatcherIntervalId);
        dialerService.campaignWatcherIntervalId = null;
      }
      if (dialerService.activeCampaigns) {
        dialerService.activeCampaigns.clear();
      }
      if (dialerService.activeCalls) {
        dialerService.activeCalls.clear();
      }
    }
    
    // 3. 少し待機
    console.log('\n⏳ 3秒待機...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 4. SIPサービス再接続
    console.log('\n📞 SIPサービス再接続...');
    try {
      const sipService = require('./src/services/sipService');
      const sipResult = await sipService.connect();
      console.log(`  SIP再接続結果: ${sipResult}`);
      console.log(`  利用可能アカウント: ${sipService.getAvailableSipAccountCount()}個`);
    } catch (sipError) {
      console.log(`  SIP再接続エラー: ${sipError.message}`);
    }
    
    // 5. CallService再初期化
    console.log('\n🔧 CallService再初期化...');
    try {
      const callService = require('./src/services/callService');
      const callResult = await callService.initialize();
      console.log(`  CallService初期化結果: ${callResult}`);
    } catch (callError) {
      console.log(`  CallService初期化エラー: ${callError.message}`);
    }
    
    // 6. 強制的に自動システム再開
    console.log('\n🚀 自動システム強制再開...');
    
    // ダイアラーサービスの状態をリセット
    dialerService.enabled = true;
    dialerService.isProcessing = false;
    
    // 利用可能なメソッドで再開
    if (typeof dialerService.startAutoSystem === 'function') {
      await dialerService.startAutoSystem();
    } else if (typeof dialerService.startAutoSystemWithHealing === 'function') {
      await dialerService.startAutoSystemWithHealing();
    } else {
      // 手動で基本機能を再開
      console.log('  手動で基本機能を再開...');
      
      // キャンペーンを再読み込み
      try {
        const db = require('./src/services/database');
        const [campaigns] = await db.query(`
          SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id,
                 ci.number as caller_id_number
          FROM campaigns c
          JOIN caller_ids ci ON c.caller_id_id = ci.id
          WHERE c.status = 'active' AND ci.active = true
        `);
        
        // アクティブキャンペーンマップを再構築
        if (!dialerService.activeCampaigns) {
          dialerService.activeCampaigns = new Map();
        }
        
        for (const campaign of campaigns) {
          const [contactCount] = await db.query(
            'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = "pending"',
            [campaign.id]
          );
          
          if (contactCount[0].count > 0) {
            dialerService.activeCampaigns.set(campaign.id, {
              id: campaign.id,
              name: campaign.name,
              maxConcurrentCalls: Math.min(campaign.max_concurrent_calls || 1, 2),
              callerIdId: campaign.caller_id_id,
              callerIdNumber: campaign.caller_id_number,
              activeCalls: 0,
              status: 'active',
              lastDialTime: null,
              failCount: 0
            });
          }
        }
        
        console.log(`  キャンペーン再読み込み: ${dialerService.activeCampaigns.size}件`);
      } catch (error) {
        console.log(`  キャンペーン再読み込みエラー: ${error.message}`);
      }
    }
    
    // 7. 最終状態確認
    console.log('\n📊 再起動後の状態:');
    console.log(`  - 有効: ${dialerService.enabled ? '✅' : '❌'}`);
    console.log(`  - 自動発信: ${dialerService.dialerIntervalId ? '✅' : '❌'}`);
    console.log(`  - キャンペーン監視: ${dialerService.campaignWatcherIntervalId ? '✅' : '❌'}`);
    console.log(`  - アクティブキャンペーン: ${dialerService.activeCampaigns ? dialerService.activeCampaigns.size : 0}件`);
    
    const success = dialerService.enabled && 
                   (dialerService.dialerIntervalId || dialerService.campaignWatcherIntervalId);
    
    if (success) {
      console.log('\n🎉 DialerService再起動成功！');
      console.log('📞 自動発信システムが動作開始しました');
      
      // 15秒後に発信状況をチェック
      console.log('\n⏰ 15秒後に発信状況をチェックします...');
      setTimeout(async () => {
        try {
          const db = require('./src/services/database');
          const [callLogs] = await db.query(`
            SELECT call_id, phone_number, start_time, status 
            FROM call_logs 
            WHERE start_time >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
            ORDER BY start_time DESC 
            LIMIT 5
          `);
          
          if (callLogs.length > 0) {
            console.log('📞 最近の発信ログ:');
            callLogs.forEach(log => {
              console.log(`  - ${log.phone_number}: ${log.status} (${log.start_time})`);
            });
          } else {
            console.log('⚠️ まだ発信ログが確認できません');
            console.log('   自動発信は5秒間隔で動作します。もう少し待ってください。');
          }
        } catch (error) {
          console.error('発信ログ確認エラー:', error);
        }
      }, 15000);
      
      return true;
    } else {
      console.log('\n❌ DialerService再起動に問題があります');
      console.log('   詳細なシステムログを確認してください');
      return false;
    }
    
  } catch (error) {
    console.error('❌ 再起動エラー:', error);
    return false;
  }
}

// 実行
if (require.main === module) {
  restartDialer().then(success => {
    if (success) {
      console.log('\n✅ 再起動プロセス完了');
      console.log('🔥 自動発信システムが稼働中です');
    } else {
      console.log('\n❌ 再起動プロセス失敗');
    }
    // プロセスは終了させない（発信を継続するため）
  });
}

module.exports = { restartDialer };
