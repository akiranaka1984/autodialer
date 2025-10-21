const mysql = require('mysql2/promise');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const dbConfig = {
  host: 'localhost',
  user: 'autodialer',
  password: 'TestPassword123!',
  database: 'autodialer'
};

async function syncRealtimeChannels() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // 新しいチャンネルを検出
    const [newChannels] = await connection.execute(`
      SELECT cc.username, cc.password, cc.caller_id_id, ci.domain
      FROM caller_channels cc
      JOIN caller_ids ci ON cc.caller_id_id = ci.id
      WHERE cc.status = 'available'
      AND cc.username NOT IN (SELECT id FROM ps_endpoints)
    `);
    
    if (newChannels.length > 0) {
      console.log(`新しいチャンネル検出: ${newChannels.length}件`);
      
      for (const channel of newChannels) {
        // ps_endpoints追加
        await connection.execute(`
          INSERT IGNORE INTO ps_endpoints 
          (id, transport, context, allow, dtmf_mode, aors, auth, outbound_auth, callerid, from_domain, from_user)
          VALUES (?, 'transport-udp', 'autodialer', 'ulaw,alaw', 'auto', ?, ?, ?, ?, ?, ?)
        `, [channel.username, channel.username, channel.username, channel.username,
            `"${channel.username}" <${channel.username}>`, channel.domain, channel.username]);
        
        // ps_auths追加
        await connection.execute(`
          INSERT IGNORE INTO ps_auths (id, auth_type, username, password)
          VALUES (?, 'userpass', ?, ?)
        `, [channel.username, channel.username, channel.password]);
        
        // ps_aors追加
        await connection.execute(`
          INSERT IGNORE INTO ps_aors (id, max_contacts, qualify_frequency, contact)
          VALUES (?, 1, 0, ?)
        `, [channel.username, `sip:${channel.domain}:5060`]);
      }
      
      // Asteriskリロード
      await execPromise('asterisk -rx "pjsip reload"');
      console.log('Asterisk Realtime更新完了');
    }
    
    // 削除されたチャンネルをクリーンアップ
    await connection.execute(`
      DELETE FROM ps_endpoints 
      WHERE id NOT IN (SELECT username FROM caller_channels WHERE status = 'available')
    `);
    
  } catch (error) {
    console.error('同期エラー:', error);
  } finally {
    await connection.end();
  }
}

// 60秒ごとに実行
setInterval(syncRealtimeChannels, 60000);
syncRealtimeChannels(); // 初回実行

console.log('Realtime自動同期サービス開始');
