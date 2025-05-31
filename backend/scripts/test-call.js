const dotenv = require('dotenv');
dotenv.config();

const asterisk = require('../src/services/asterisk');
const logger = require('../src/services/logger');

// コマンドライン引数から電話番号を取得
const phoneNumber = process.argv[2];
if (!phoneNumber) {
  console.error('使用方法: node test-call.js <電話番号>');
  process.exit(1);
}

async function makeTestCall() {
  try {
    console.log(`テスト発信を開始: 発信先=${phoneNumber}`);
    
    // Asteriskに接続
    await asterisk.connect();
    
    // 発信パラメータの設定
    const params = {
      phoneNumber: phoneNumber,
      context: 'autodialer',
      exten: 's',
      priority: 1,
      callerID: '"テスト発信" <0312345678>',
      variables: {
        CAMPAIGN_ID: 'TEST',
        CONTACT_ID: 'TEST',
        CONTACT_NAME: 'テストユーザー',
        COMPANY: 'テスト会社'
      }
    };
    
    // 発信実行
    const result = await asterisk.originate(params);
    console.log('テスト発信結果:', result);
    
    if (process.env.MOCK_ASTERISK === 'true') {
      console.log('※ この発信はモックモードでシミュレーションされました（実際の発信は行われていません）');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('テスト発信エラー:', error);
    process.exit(1);
  }
}

makeTestCall();