// 既存チャンネルのアウトバウンド登録を一括設定
const db = require('../services/database');
const logger = require('../services/logger');

async function registerOutboundAll() {
  try {
    console.log('アウトバウンド登録を開始します...');
    
    // アクティブなチャンネルをすべて取得
    const [channels] = await db.query(`
      SELECT cc.username, cc.password, ci.domain 
      FROM caller_channels cc
      JOIN caller_ids ci ON cc.caller_id_id = ci.id
      WHERE ci.active = 1
    `);
    
    console.log(`${channels.length}件のチャンネルが見つかりました`);
    
    let successCount = 0;
    
    for (const channel of channels) {
      try {
        // ps_registrations または ps_outbound_registrations に登録
        await db.query(`
          INSERT INTO ps_outbound_registrations 
          (id, server_uri, client_uri, contact_user, transport, outbound_auth, expiration, retry_interval)
          VALUES (?, ?, ?, ?, 'transport-udp', ?, 3600, 60)
          ON DUPLICATE KEY UPDATE 
            server_uri = VALUES(server_uri),
            client_uri = VALUES(client_uri),
            outbound_auth = VALUES(outbound_auth)
        `, [
          channel.username,
          `sip:${channel.domain}`,
          `sip:${channel.username}@${channel.domain}`,
          channel.username,
          channel.username
        ]);
        
        console.log(`✅ ${channel.username} のアウトバウンド登録を設定しました`);
        successCount++;
        
      } catch (error) {
        console.error(`❌ ${channel.username} の登録に失敗:`, error.message);
      }
    }
    
    console.log(`\n完了: ${successCount}件を登録しました`);
    process.exit(0);
    
  } catch (error) {
    console.error('エラー:', error);
    process.exit(1);
  }
}

registerOutboundAll();
