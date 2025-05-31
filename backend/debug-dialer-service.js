// backend/debug-dialer-service.js - 発信機能のデバッグスクリプト

const mysql = require('mysql2/promise');
const path = require('path');

// 環境変数設定
process.env.NODE_ENV = 'development';
process.env.MYSQL_HOST = 'localhost';
process.env.MYSQL_PORT = '13306';
process.env.MYSQL_USER = 'root';
process.env.MYSQL_PASSWORD = 'password';
process.env.MYSQL_DATABASE = 'autodialer';

// データベース接続設定
const dbConfig = {
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE
};

async function debugDialerService() {
  console.log('🔍 発信サービスのデバッグを開始します...');
  
  let connection;
  try {
    // データベース接続
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ データベース接続成功');
    
    // ステップ1: データの存在確認
    console.log('\n📋 ステップ1: データの存在確認');
    
    // キャンペーン確認
    const [campaigns] = await connection.query(`
      SELECT c.id, c.name, c.status, c.max_concurrent_calls, c.caller_id_id,
             c.working_hours_start, c.working_hours_end,
             ci.number as caller_id_number
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      ORDER BY c.id
    `);
    
    console.log('\n🎯 キャンペーン一覧:');
    console.table(campaigns);
    
    if (campaigns.length === 0) {
      console.log('⚠️ キャンペーンが存在しません');
      return;
    }
    
    // 連絡先確認
    for (const campaign of campaigns) {
      const [contacts] = await connection.query(`
        SELECT id, phone, name, status
        FROM contacts
        WHERE campaign_id = ?
        ORDER BY id
      `, [campaign.id]);
      
      console.log(`\n📞 キャンペーン "${campaign.name}" (ID: ${campaign.id}) の連絡先:`);
      console.table(contacts);
      
      if (contacts.length === 0) {
        console.log('⚠️ 連絡先が存在しません');
        
        // テスト用連絡先を追加
        console.log('🔧 テスト用連絡先を追加します...');
        await connection.query(`
          INSERT INTO contacts (campaign_id, phone, name, status)
          VALUES (?, '09012345678', 'テスト連絡先1', 'pending'),
                 (?, '09012345679', 'テスト連絡先2', 'pending')
        `, [campaign.id, campaign.id]);
        
        console.log('✅ テスト用連絡先を追加しました');
      }
    }
    
    // 発信者番号とチャンネル確認
    const [callerIds] = await connection.query(`
      SELECT ci.id, ci.number, ci.description, ci.active,
             COUNT(cc.id) as channel_count
      FROM caller_ids ci
      LEFT JOIN caller_channels cc ON ci.id = cc.caller_id_id
      GROUP BY ci.id
      ORDER BY ci.id
    `);
    
    console.log('\n📱 発信者番号とチャンネル:');
    console.table(callerIds);
    
    // ステップ2: 発信サービスの初期化テスト
    console.log('\n📋 ステップ2: 発信サービスの初期化テスト');
    
    try {
      // 相対パスを使用してdialerServiceを読み込む
      const DialerService = require('./src/services/dialerService');
      
      console.log('✅ dialerService モジュール読み込み成功');
      
      // 初期化テスト
      console.log('🚀 発信サービス初期化中...');
      const initResult = await DialerService.initializeService();
      console.log('初期化結果:', initResult);
      
      // アクティブキャンペーンの確認
      console.log('\n📋 アクティブキャンペーン:');
      if (DialerService.activeCampaigns && DialerService.activeCampaigns.size > 0) {
        for (const [id, campaign] of DialerService.activeCampaigns.entries()) {
          console.log(`  - ID: ${id}, Name: ${campaign.name}, Status: ${campaign.status}`);
        }
      } else {
        console.log('⚠️ アクティブキャンペーンがありません');
      }
      
      // ステップ3: 手動発信テスト
      console.log('\n📋 ステップ3: 手動発信キュー処理テスト');
      
      // アクティブなキャンペーンがある場合のみ発信テスト
      const activeCampaign = campaigns.find(c => c.status === 'active');
      if (activeCampaign) {
        console.log(`🎯 アクティブキャンペーン発見: ${activeCampaign.name}`);
        
        // 発信キュー処理を実行
        console.log('🚀 発信キュー処理を実行中...');
        await DialerService.processDialerQueue();
        console.log('✅ 発信キュー処理完了');
        
        // 通話ログの確認
        setTimeout(async () => {
          const [callLogs] = await connection.query(`
            SELECT cl.*, c.phone, c.name as contact_name
            FROM call_logs cl
            LEFT JOIN contacts c ON cl.contact_id = c.id
            WHERE cl.campaign_id = ?
            ORDER BY cl.start_time DESC
            LIMIT 5
          `, [activeCampaign.id]);
          
          console.log('\n📞 最新の通話ログ:');
          console.table(callLogs);
        }, 2000);
        
      } else {
        console.log('⚠️ アクティブなキャンペーンがありません');
        
        // テスト用にキャンペーンをアクティブにする
        if (campaigns.length > 0) {
          const testCampaign = campaigns[0];
          console.log(`🔧 テスト用にキャンペーン "${testCampaign.name}" をアクティブにします...`);
          
          await connection.query(`
            UPDATE campaigns SET status = 'active' WHERE id = ?
          `, [testCampaign.id]);
          
          console.log('✅ キャンペーンをアクティブにしました');
          
          // 発信サービスにキャンペーン開始を通知
          const startResult = await DialerService.startCampaign(testCampaign.id);
          console.log('キャンペーン開始結果:', startResult);
          
          // 発信キュー処理を実行
          console.log('🚀 発信キュー処理を実行中...');
          await DialerService.processDialerQueue();
          console.log('✅ 発信キュー処理完了');
        }
      }
      
    } catch (serviceError) {
      console.error('❌ 発信サービスエラー:', serviceError);
      console.error('スタックトレース:', serviceError.stack);
    }
    
    // ステップ4: SIPサービスの確認
    console.log('\n📋 ステップ4: SIPサービスの確認');
    
    try {
      const SipService = require('./src/services/sipService');
      
      console.log('SIP接続状態:', SipService.connected);
      console.log('SIPアカウント数:', SipService.sipAccounts ? SipService.sipAccounts.length : 0);
      
      if (SipService.sipAccounts && SipService.sipAccounts.length > 0) {
        console.log('SIPアカウント詳細:');
        SipService.sipAccounts.slice(0, 5).forEach((account, i) => {
          console.log(`  ${i + 1}. ${account.username} - ${account.status} (${account.callerID})`);
        });
      }
      
      // SIPアカウントステータスの取得
      if (typeof SipService.getAccountStatus === 'function') {
        const accountStatus = SipService.getAccountStatus();
        console.log('SIPアカウントステータス:', accountStatus);
      }
      
    } catch (sipError) {
      console.error('❌ SIPサービスエラー:', sipError);
    }
    
    console.log('\n✅ デバッグ完了');
    
  } catch (error) {
    console.error('❌ デバッグスクリプトエラー:', error);
    console.error('スタックトレース:', error.stack);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 実行
debugDialerService().catch(console.error);

// 追加: 発信テスト用の個別関数
async function testSingleCall(campaignId, phoneNumber) {
  console.log(`\n🔍 個別発信テスト: Campaign=${campaignId}, Phone=${phoneNumber}`);
  
  try {
    const DialerService = require('./src/services/dialerService');
    
    // テスト用の連絡先データ
    const testContact = {
      id: 'test-' + Date.now(),
      phone: phoneNumber,
      name: 'テスト連絡先',
      company: 'テスト会社'
    };
    
    // テスト用のキャンペーンデータ
    const testCampaign = {
      id: campaignId,
      name: 'テストキャンペーン',
      maxConcurrentCalls: 5,
      callerIdId: 1,
      callerIdNumber: '03-5946-8520',
      activeCalls: 0,
      status: 'active',
      lastDialTime: null
    };
    
    // 発信テスト
    const result = await DialerService.dialContact(testCampaign, testContact);
    console.log('発信テスト結果:', result);
    
    return result;
  } catch (error) {
    console.error('❌ 個別発信テストエラー:', error);
    return false;
  }
}

// 使用方法の表示
console.log(`
🔧 デバッグ関数が利用可能です:

個別発信テスト:
node -e "require('./debug-dialer-service.js').testSingleCall(1, '09012345678')"

全体デバッグ:
node debug-dialer-service.js
`);

module.exports = { debugDialerService, testSingleCall };