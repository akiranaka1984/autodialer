// SIPサービス強制再初期化スクリプト
const sipService = require('./src/services/sipService');
const callService = require('./src/services/callService');
const logger = require('./src/services/logger');

async function fixSipConnection() {
  try {
    console.log('🔧 SIPサービス強制再初期化開始');
    
    // 1. SIPサービス切断（既存接続をクリア）
    if (sipService.disconnect) {
      await sipService.disconnect();
      console.log('✅ SIP切断完了');
    }
    
    // 2. 少し待機
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. SIPサービス再接続
    console.log('🔄 SIP再接続開始...');
    const sipResult = await sipService.connect();
    console.log('SIP接続結果:', sipResult);
    
    // 4. CallService再初期化
    console.log('🔄 CallService再初期化...');
    const callResult = await callService.initialize();
    console.log('CallService初期化結果:', callResult);
    
    // 5. 接続状況確認
    console.log('📊 接続状況確認:');
    console.log('- SIP connected:', sipService.connected);
    console.log('- SIP accounts:', sipService.getAvailableSipAccountCount());
    console.log('- CallService providers:', callService.getProvidersStatus().length);
    
    return true;
  } catch (error) {
    console.error('❌ SIP接続修正エラー:', error);
    return false;
  }
}

// 実行
fixSipConnection().then(success => {
  console.log(success ? '✅ SIP修正成功' : '❌ SIP修正失敗');
  process.exit(success ? 0 : 1);
});
