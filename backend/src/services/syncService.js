const logger = require('./logger');
const db = require('./database');

class SyncService {
  constructor() {
    this.lastSyncTime = null;
    this.syncInProgress = false;
  }

  // caller_channelsからPJSIPテーブルに同期
  async syncPjsipFromCallerChannels() {
    if (this.syncInProgress) {
      logger.warn('⚠️ 同期処理が既に実行中です');
      return false;
    }

    this.syncInProgress = true;
    const startTime = new Date();
    
    try {
      logger.info('🔄 PJSIP同期開始: caller_channels → ps_* テーブル');
      
      // 1. caller_channelsから03500%のアカウントを取得
      const [accounts] = await db.query(`
        SELECT cc.username, cc.password, ci.domain
        FROM caller_channels cc
        JOIN caller_ids ci ON cc.caller_id_id = ci.id
        WHERE cc.username LIKE '035000%' AND ci.active = true
        ORDER BY cc.username
      `);
      
      if (accounts.length === 0) {
        logger.warn('⚠️ 同期対象のSIPアカウントが見つかりません');
        return false;
      }
      
      logger.info(`📊 同期対象アカウント: ${accounts.length}個`);
      
      let syncedCount = 0;
      
      // 2. 各アカウントを3つのPJSIPテーブルに同期
      for (const account of accounts) {
        const { username, password } = account;
        
        try {
          // ps_endpoints
          await db.query(`
            INSERT INTO ps_endpoints (id, transport, aors, auth, outbound_auth, context, dtmf_mode, allow)
            VALUES (?, 'transport-udp', ?, ?, ?, 'autodialer', 'rfc4733', 'ulaw,alaw')
            ON DUPLICATE KEY UPDATE
            transport='transport-udp', aors=?, auth=?, outbound_auth=?, context='autodialer'
          `, [username, username, username, username, username, username, username]);
          
          // ps_auths
          await db.query(`
            INSERT INTO ps_auths (id, auth_type, password, username)
            VALUES (?, 'userpass', ?, ?)
            ON DUPLICATE KEY UPDATE
            password=?, username=?
          `, [username, password, username, password, username]);
          
          // ps_aors
          await db.query(`
            INSERT INTO ps_aors (id, max_contacts, qualify_frequency)
            VALUES (?, 1, 60)
            ON DUPLICATE KEY UPDATE
            max_contacts=1, qualify_frequency=60
          `, [username]);
          
          syncedCount++;
          
        } catch (accountError) {
          logger.error(`アカウント同期エラー: ${username}`, accountError);
        }
      }
      
      this.lastSyncTime = new Date();
      const duration = new Date() - startTime;
      
      logger.info(`✅ PJSIP同期完了: ${syncedCount}/${accounts.length}個 (処理時間: ${duration}ms)`);
      
      return {
        success: true,
        syncedCount,
        totalCount: accounts.length,
        duration,
        lastSyncTime: this.lastSyncTime
      };
      
    } catch (error) {
      logger.error('❌ PJSIP同期エラー:', error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  // 同期状態確認
  async checkSyncStatus() {
    try {
      // caller_channelsのアカウント数
      const [callerChannels] = await db.query(`
        SELECT COUNT(*) as count FROM caller_channels cc
        JOIN caller_ids ci ON cc.caller_id_id = ci.id
        WHERE cc.username LIKE '035000%' AND ci.active = true
      `);
      
      // ps_endpointsのアカウント数
      const [psEndpoints] = await db.query(`
        SELECT COUNT(*) as count FROM ps_endpoints
        WHERE id LIKE '035000%'
      `);
      
      return {
        callerChannelsCount: callerChannels[0].count,
        psEndpointsCount: psEndpoints[0].count,
        isInSync: callerChannels[0].count === psEndpoints[0].count,
        lastSyncTime: this.lastSyncTime,
        syncInProgress: this.syncInProgress
      };
      
    } catch (error) {
      logger.error('同期状態確認エラー:', error);
      throw error;
    }
  }
}

module.exports = new SyncService();
