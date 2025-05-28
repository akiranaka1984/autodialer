// backend/diagnose.js - システム診断スクリプト
const fs = require('fs');
const path = require('path');

console.log('🔍 システム診断開始...\n');

// 1. 重要ファイルの存在確認
const criticalFiles = [
  'src/services/database.js',
  'src/services/asterisk.js', 
  'src/services/sipService.js',
  'src/services/callService.js',
  'src/services/dialerService.js',
  'src/index.js'
];

console.log('📁 ファイル存在確認:');
criticalFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
});

// 2. データベース接続テスト
async function testDatabase() {
  try {
    console.log('\n🗄️ データベース接続テスト:');
    const db = require('./src/services/database');
    
    const healthCheck = await db.healthCheck();
    
    if (healthCheck.healthy) {
      console.log('  ✅ データベース接続: 正常');
      console.log(`  📊 ユーザー: ${healthCheck.user}`);
      console.log(`  📊 データベース: ${healthCheck.database}`);
      
      // 基本テーブル確認
      const tables = ['campaigns', 'contacts', 'caller_ids', 'call_logs'];
      for (const table of tables) {
        try {
          const [rows] = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
          console.log(`  📋 ${table}: ${rows[0].count}件`);
        } catch (error) {
          console.log(`  ⚠️ ${table}: エラー (${error.message})`);
        }
      }
      
    } else {
      console.log('  ❌ データベース接続: 失敗');
      console.log(`  🔥 エラー: ${healthCheck.error}`);
    }
  } catch (error) {
    console.log('  ❌ データベース接続: 致命的エラー');
    console.log(`  🔥 ${error.message}`);
  }
}

// 3. Asterisk問題の特定
async function testAsterisk() {
  try {
    console.log('\n📞 Asterisk診断:');
    
    // タイムアウト付きでAsterisk接続テスト
    const asterisk = require('./src/services/asterisk');
    
    console.log('  🔄 Asterisk接続テスト開始 (10秒タイムアウト)...');
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('接続タイムアウト')), 10000);
    });
    
    const connectPromise = asterisk.connect();
    
    const result = await Promise.race([connectPromise, timeoutPromise]);
    
    if (result) {
      console.log('  ✅ Asterisk接続: 成功');
      console.log(`  📊 接続状態: ${asterisk.connected}`);
    } else {
      console.log('  ❌ Asterisk接続: 失敗');
    }
    
  } catch (error) {
    console.log('  ❌ Asterisk接続: エラー');
    console.log(`  🔥 ${error.message}`);
    
    if (error.message.includes('タイムアウト')) {
      console.log('  🚨 無限ループの可能性が高い');
    }
  }
}

// 4. SIPサービス診断
async function testSipService() {
  try {
    console.log('\n📡 SIPサービス診断:');
    
    const sipService = require('./src/services/sipService');
    
    console.log('  🔄 SIP接続テスト...');
    const result = await sipService.connect();
    
    console.log(`  📊 SIP接続結果: ${result}`);
    console.log(`  📊 接続状態: ${sipService.connected}`);
    console.log(`  📊 アカウント数: ${sipService.getAvailableSipAccountCount()}`);
    
  } catch (error) {
    console.log('  ❌ SIPサービス: エラー');
    console.log(`  🔥 ${error.message}`);
  }
}

// 5. 環境変数確認
function checkEnvironment() {
  console.log('\n🌍 環境変数確認:');
  
  const envVars = [
    'NODE_ENV',
    'PORT',
    'DB_HOST',
    'DB_USER', 
    'DB_PASSWORD',
    'DB_NAME',
    'ASTERISK_HOST',
    'ASTERISK_PORT',
    'ASTERISK_USERNAME',
    'ASTERISK_SECRET'
  ];
  
  envVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      // パスワード系は隠す
      const displayValue = varName.includes('PASSWORD') || varName.includes('SECRET') 
        ? '***' 
        : value;
      console.log(`  ✅ ${varName}: ${displayValue}`);
    } else {
      console.log(`  ⚠️ ${varName}: 未設定`);
    }
  });
}

// 診断実行
async function runDiagnosis() {
  try {
    checkEnvironment();
    await testDatabase();
    await testSipService();
    await testAsterisk(); // 最後に実行（問題がある可能性が高い）
    
    console.log('\n🎯 診断完了');
    console.log('📋 次のステップの推奨:');
    console.log('  1. データベースが正常なら基本機能は動作可能');
    console.log('  2. Asteriskでタイムアウトが発生した場合は設定修正が必要');
    console.log('  3. SIPサービスが正常なら発信機能は利用可能');
    
  } catch (error) {
    console.error('🔥 診断中にエラーが発生:', error);
  } finally {
    process.exit(0);
  }
}

runDiagnosis();
