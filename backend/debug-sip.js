const sipService = require('./src/services/sipService');
const logger = require('./src/services/logger');

async function main() {
  try {
    console.log('SIPサービスの接続テスト開始');
    await sipService.connect();
    console.log('SIPサービス接続成功');
    
    console.log('チャンネル状態:');
    const status = sipService.getAccountStatus();
    console.log(JSON.stringify(status, null, 2));
    
    console.log('発信テスト開始...');
    const result = await sipService.originate({
      phoneNumber: '09012345678',
      callerID: '"Test Call" <03-5946-8520>',
      context: 'autodialer',
      exten: 's',
      priority: 1,
      variables: {
        CAMPAIGN_ID: 'TEST',
        CONTACT_ID: 'TEST',
        CONTACT_NAME: 'テストユーザー',
        COMPANY: 'テスト会社'
      }
    });
    
    console.log('発信結果:', JSON.stringify(result, null, 2));
    
    setTimeout(() => {
      process.exit(0);
    }, 30000);
  } catch (error) {
    console.error('テストエラー:', error);
    process.exit(1);
  }
}

main();
