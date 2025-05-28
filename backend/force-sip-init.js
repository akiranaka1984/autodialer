const sipService = require('./src/services/sipService');
const callService = require('./src/services/callService');

async function forceSipInit() {
  try {
    console.log('🔧 SIP強制初期化開始');
    
    // 1. 既存接続をクリア
    sipService.connected = false;
    
    // 2. SIP再接続
    const sipResult = await sipService.connect();
    console.log('SIP接続結果:', sipResult);
    console.log('SIP接続状態:', sipService.connected);
    console.log('アカウント数:', sipService.getAvailableSipAccountCount());
    
    // 3. CallService初期化
    const callResult = await callService.initialize();
    console.log('CallService初期化結果:', callResult);
    
    // 4. 状態確認
    console.log('📊 最終状態:');
    console.log('- SIP connected:', sipService.connected);
    console.log('- SIP accounts:', sipService.getAvailableSipAccountCount());
    console.log('- CallService providers:', callService.getProvidersStatus().length);
    
    return sipService.connected;
  } catch (error) {
    console.error('❌ 強制初期化エラー:', error);
    return false;
  }
}

forceSipInit().then(success => {
  if (success) {
    console.log('✅ SIP強制初期化成功');
    
    // バックエンドプロセスに反映させるため少し待機
    setTimeout(() => {
      console.log('🔄 設定完了 - バックエンド再起動してください');
      process.exit(0);
    }, 2000);
  } else {
    console.log('❌ SIP強制初期化失敗');
    process.exit(1);
  }
});
