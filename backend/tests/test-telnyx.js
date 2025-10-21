// tests/test-telnyx.js
require('dotenv').config({ path: '../.env' });

const telnyxService = require('../src/services/telnyxService');

async function testTelnyxService() {
  console.log('='.repeat(50));
  console.log('🧪 Telnyxサービステスト開始');
  console.log('='.repeat(50));
  
  // 設定確認
  console.log('\n📋 設定確認:');
  console.log('  API Key:', process.env.TELNYX_API_KEY ? '✅ 設定済み' : '❌ 未設定');
  console.log('  Connection ID:', process.env.TELNYX_CONNECTION_ID || '❌ 未設定');
  console.log('  Phone Number:', process.env.TELNYX_PHONE_NUMBER || '❌ 未設定');
  console.log('  有効状態:', process.env.USE_TELNYX === 'true' ? '✅ 有効' : '⚠️ 無効');
  
  // 電話番号フォーマットテスト
  console.log('\n📞 電話番号フォーマットテスト:');
  const testNumbers = [
    '09012345678',      // 日本の携帯
    '0312345678',       // 日本の固定電話
    '9123456789',       // フィリピンの携帯
    '+819012345678'     // 国際形式
  ];
  
  testNumbers.forEach(num => {
    const formatted = telnyxService.formatPhoneNumber(num);
    console.log(`  ${num} → ${formatted}`);
  });
  
  // 実際の発信テストはコメントアウト（番号発番後に実行）
  console.log('\n⚠️ 実際の発信テストは番号発番後に実行してください');
  
  console.log('\n='.repeat(50));
  console.log('✅ テスト完了');
  console.log('='.repeat(50));
}

// テスト実行
testTelnyxService().catch(error => {
  console.error('\n❌ テストエラー:', error);
  process.exit(1);
});
