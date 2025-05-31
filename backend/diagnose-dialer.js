// diagnose-dialer.js - DialerService詳細診断
const dialerService = require('./src/services/dialerService');
const db = require('./src/services/database');
const sipService = require('./src/services/sipService');

async function diagnoseDalerService() {
  console.log('🔍 DialerService詳細診断開始...\n');
  
  try {
    // 1. システム状態の詳細確認
    console.log('📊 システム状態:');
    const status = dialerService.getSystemStatus();
    
    console.log(`  🔧 有効: ${status.enabled ? '✅' : '❌'}`);
    console.log(`  🚀 自動発信: ${status.autoDialerRunning ? '✅' : '❌'}`);
    console.log(`  👁️ キャンペーン監視: ${status.campaignWatcherRunning ? '✅' : '❌'}`);
    console.log(`  ⚡ 処理中: ${status.isProcessing ? '⏳' : '待機中'}`);
    console.log(`  📞 アクティブキャンペーン: ${status.activeCampaigns.count}件`);
    console.log(`  📞 アクティブコール: ${status.activeCalls.count}件`);
    console.log(`  ⏰ 発信間隔: ${status.intervals.dialInterval}ms`);
    console.log(`  ⏰ 監視間隔: ${status.intervals.campaignCheckInterval}ms`);
    
    // 2. 各アクティブキャンペーンの詳細
    if (status.activeCampaigns.count > 0) {
      console.log('\n📋 アクティブキャンペーン詳細:');
      status.activeCampaigns.details.forEach(campaign => {
        console.log(`  - ID ${campaign.id}: ${campaign.name}`);
        console.log(`    通話中: ${campaign.activeCalls}/${campaign.maxConcurrentCalls}`);
        console.log(`    最終発信: ${campaign.lastDialTime || 'なし'}`);
      });
    }
    
    // 3. データベース状態との整合性チェック
    console.log('\n🗄️ データベース整合性チェック:');
    const [dbCampaigns] = await db.query(`
      SELECT c.id, c.name, c.status,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'pending') as pending_count,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'called') as called_count
      FROM campaigns c
      WHERE c.status = 'active'
    `);
    
    console.log(`  📊 DB上のアクティブキャンペーン: ${dbCampaigns.length}件`);
    
    dbCampaigns.forEach(campaign => {
      const inMemory = status.activeCampaigns.details.find(c => c.id === campaign.id);
      console.log(`  - Campaign ${campaign.id}: ${campaign.name}`);
      console.log(`    DB状態: ${campaign.status}, 未処理: ${campaign.pending_count}件, 発信済み: ${campaign.called_count}件`);
      console.log(`    メモリ状態: ${inMemory ? '✅ 登録済み' : '❌ 未登録'}`);
      
      if (!inMemory && campaign.pending_count > 0) {
        console.log(`    🚨 問題: DBではアクティブだがメモリに登録されていない`);
      }
    });
    
    // 4. SIPサービス状態
    console.log('\n📡 SIPサービス状態:');
    console.log(`  接続: ${sipService.connected ? '✅' : '❌'}`);
    console.log(`  利用可能アカウント: ${sipService.getAvailableSipAccountCount()}個`);
    
    if (sipService.getAvailableSipAccountCount() === 0) {
      console.log(`  🚨 問題: 利用可能なSIPアカウントがない`);
    }
    
    // 5. 最近の通話ログ確認
    console.log('\n📞 最近の通話状況 (過去5分):');
    const [recentCalls] = await db.query(`
      SELECT call_id, phone_number, start_time, status, call_provider
      FROM call_logs
      WHERE start_time >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      ORDER BY start_time DESC
      LIMIT 10
    `);
    
    if (recentCalls.length > 0) {
      console.log(`  📊 過去5分の発信: ${recentCalls.length}件`);
      recentCalls.forEach(call => {
        console.log(`    - ${call.phone_number}: ${call.status} (${call.start_time})`);
      });
    } else {
      console.log(`  ⚠️ 過去5分間に発信履歴なし`);
    }
    
    // 6. 環境変数・設定確認
    console.log('\n🌍 設定確認:');
    console.log(`  DISABLE_AUTO_DIALER: ${process.env.DISABLE_AUTO_DIALER || '未設定'}`);
    console.log(`  NODE_ENV: ${process.env.NODE_ENV || '未設定'}`);
    
    // 7. 診断結果とレコメンデーション
    console.log('\n💡 診断結果:');
    
    let issues = [];
    let recommendations = [];
    
    if (!status.enabled) {
      issues.push('DialerServiceが無効化されている');
      recommendations.push('環境変数 DISABLE_AUTO_DIALER を確認');
    }
    
    if (!status.autoDialerRunning) {
      issues.push('自動発信システムが停止している');
      recommendations.push('システム再起動が必要');
    }
    
    if (!status.campaignWatcherRunning) {
      issues.push('キャンペーン監視が停止している');
      recommendations.push('システム再起動が必要');
    }
    
    if (sipService.getAvailableSipAccountCount() === 0) {
      issues.push('利用可能なSIPアカウントが不足');
      recommendations.push('SIPアカウント設定を確認');
    }
    
    const dbCampaignIds = new Set(dbCampaigns.filter(c => c.pending_count > 0).map(c => c.id));
    const memoryCampaignIds = new Set(status.activeCampaigns.details.map(c => c.id));
    const missingInMemory = [...dbCampaignIds].filter(id => !memoryCampaignIds.has(id));
    
    if (missingInMemory.length > 0) {
      issues.push('データベースとメモリの状態不整合');
      recommendations.push('システム再起動で同期を修復');
    }
    
    if (recentCalls.length === 0 && status.activeCampaigns.count > 0) {
      issues.push('キャンペーンはあるが発信履歴がない');
      recommendations.push('発信処理の詳細ログを確認');
    }
    
    if (issues.length === 0) {
      console.log('  ✅ 大きな問題は検出されませんでした');
      console.log('  💬 システムは正常に動作しているはずです');
      console.log('  💬 発信が開始されるまで少し時間がかかる場合があります');
    } else {
      console.log('  🚨 検出された問題:');
      issues.forEach(issue => console.log(`    - ${issue}`));
      
      console.log('  🔧 推奨解決策:');
      recommendations.forEach(rec => console.log(`    - ${rec}`));
    }
    
    return {
      issues,
      recommendations,
      needsRestart: issues.some(issue => 
        issue.includes('停止している') || 
        issue.includes('不整合')
      )
    };
    
  } catch (error) {
    console.error('❌ 診断エラー:', error);
    return {
      issues: ['診断処理でエラーが発生'],
      recommendations: ['システムログを確認して根本原因を特定'],
      needsRestart: true
    };
  }
}

// 実行
if (require.main === module) {
  diagnoseDalerService().then(result => {
    console.log('\n📋 診断完了');
    
    if (result.needsRestart) {
      console.log('\n🔄 システム再起動が推奨されます');
      console.log('   次のコマンドを実行してください:');
      console.log('   node restart-dialer.js');
    } else {
      console.log('\n⏰ 1-2分待ってから発信状況を再確認してください');
    }
    
    process.exit(0);
  });
}

module.exports = { diagnoseDalerService };
