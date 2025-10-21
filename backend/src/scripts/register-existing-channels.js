// 既存チャンネルをAsterisk Realtimeに一括登録するスクリプト
const db = require('../services/database');
const logger = require('../services/logger');

async function registerAllChannels() {
  try {
    console.log('既存チャンネルの一括登録を開始します...');
    
    // すべてのアクティブなチャンネルを取得
    const [channels] = await db.query(`
      SELECT cc.*, ci.number, ci.domain 
      FROM caller_channels cc
      JOIN caller_ids ci ON cc.caller_id_id = ci.id
      WHERE ci.active = 1
    `);
    
    console.log(`${channels.length}件のチャンネルが見つかりました`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const channel of channels) {
      try {
        // ps_endpoints に登録
        await db.query(`
          INSERT INTO ps_endpoints (id, transport, aors, auth, context, allow, direct_media, callerid)
          VALUES (?, 'transport-udp', ?, ?, 'autodialer', 'ulaw,alaw', 'no', ?)
          ON DUPLICATE KEY UPDATE 
            callerid = VALUES(callerid),
            transport = VALUES(transport),
            context = VALUES(context),
            allow = VALUES(allow)
        `, [channel.username, channel.username, channel.username, `"${channel.number}" <${channel.number}>`]);
        
        // ps_auths に登録
        await db.query(`
          INSERT INTO ps_auths (id, auth_type, username, password)
          VALUES (?, 'userpass', ?, ?)
          ON DUPLICATE KEY UPDATE 
            password = VALUES(password),
            auth_type = VALUES(auth_type)
        `, [channel.username, channel.username, channel.password]);
        
        // ps_aors に登録
        await db.query(`
          INSERT INTO ps_aors (id, max_contacts, qualify_frequency)
          VALUES (?, 1, 60)
          ON DUPLICATE KEY UPDATE 
            max_contacts = VALUES(max_contacts),
            qualify_frequency = VALUES(qualify_frequency)
        `, [channel.username]);
        
        console.log(`✅ ${channel.username} を登録しました`);
        successCount++;
        
      } catch (error) {
        console.error(`❌ ${channel.username} の登録に失敗:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n完了: 成功 ${successCount}件、失敗 ${errorCount}件`);
    process.exit(0);
    
  } catch (error) {
    console.error('エラー:', error);
    process.exit(1);
  }
}

// スクリプトを実行
registerAllChannels();
