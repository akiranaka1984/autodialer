const syncService = require('./src/services/syncService');

async function testSync() {
  try {
    console.log('🔄 PJSIP同期テスト開始...');
    
    // 同期前の状態確認
    const beforeStatus = await syncService.checkSyncStatus();
    console.log('📊 同期前の状態:', beforeStatus);
    
    // 同期実行
    const result = await syncService.syncPjsipFromCallerChannels();
    console.log('✅ 同期結果:', result);
    
    // 同期後の状態確認
    const afterStatus = await syncService.checkSyncStatus();
    console.log('📊 同期後の状態:', afterStatus);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 同期テストエラー:', error);
    process.exit(1);
  }
}

testSync();
