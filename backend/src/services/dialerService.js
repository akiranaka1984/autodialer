const db = require('./database');
const asterisk = require('./asterisk');
const logger = require('./logger');

class DialerService {
  constructor() {
    this.activeCampaigns = new Map(); // キャンペーンIDごとの発信状態を管理
    this.activeCalls = new Map(); // 進行中の通話を管理
    this.initialized = false;
  }

  // サービスの初期化
  async initialize() {
    if (this.initialized) return;
    
    try {
      // アクティブなキャンペーンの復元
      const [activeCampaigns] = await db.query(`
        SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id, 
               ci.number as caller_id_number
        FROM campaigns c
        JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.status = 'active' AND ci.active = true
      `);
      
      for (const campaign of activeCampaigns) {
        this.activeCampaigns.set(campaign.id, {
          id: campaign.id,
          name: campaign.name,
          maxConcurrentCalls: campaign.max_concurrent_calls,
          callerIdId: campaign.caller_id_id,
          callerIdNumber: campaign.caller_id_number,
          activeCalls: 0,
          status: 'active',
          lastDialTime: null
        });
      }
      
      // 定期的な発信ジョブを開始
      this.startDialerJob();
      this.initialized = true;
      logger.info('発信サービスを初期化しました');
    } catch (error) {
      logger.error('発信サービスの初期化エラー:', error);
    }
  }

  // キャンペーンの開始
  async startCampaign(campaignId) {
    try {
      // キャンペーン情報を取得
      const [campaigns] = await db.query(`
        SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id, 
               ci.number as caller_id_number
        FROM campaigns c
        JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.id = ? AND ci.active = true
      `, [campaignId]);
      
      if (campaigns.length === 0) {
        throw new Error('キャンペーンが見つからないか、発信者番号が無効です');
      }
      
      const campaign = campaigns[0];
      
      // キャンペーンのステータスを更新
      await db.query(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['active', campaignId]
      );
      
      // アクティブキャンペーンリストに追加
      this.activeCampaigns.set(campaignId, {
        id: campaign.id,
        name: campaign.name,
        maxConcurrentCalls: campaign.max_concurrent_calls,
        callerIdId: campaign.caller_id_id,
        callerIdNumber: campaign.caller_id_number,
        activeCalls: 0,
        status: 'active',
        lastDialTime: null
      });
      
      logger.info(`キャンペーン開始: ID=${campaignId}, Name=${campaign.name}`);
      return true;
    } catch (error) {
      logger.error(`キャンペーン開始エラー: ID=${campaignId}`, error);
      return false;
    }
  }

  // キャンペーンの一時停止
  async pauseCampaign(campaignId) {
    try {
      // キャンペーンのステータスを更新
      await db.query(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['paused', campaignId]
      );
      
      // アクティブキャンペーンリストから削除または一時停止
      if (this.activeCampaigns.has(campaignId)) {
        const campaign = this.activeCampaigns.get(campaignId);
        campaign.status = 'paused';
        this.activeCampaigns.set(campaignId, campaign);
      }
      
      logger.info(`キャンペーン一時停止: ID=${campaignId}`);
      return true;
    } catch (error) {
      logger.error(`キャンペーン一時停止エラー: ID=${campaignId}`, error);
      return false;
    }
  }

  // キャンペーンの再開
  async resumeCampaign(campaignId) {
    try {
      // キャンペーンのステータスを更新
      await db.query(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['active', campaignId]
      );
      
      // アクティブキャンペーンリストでステータスを更新
      if (this.activeCampaigns.has(campaignId)) {
        const campaign = this.activeCampaigns.get(campaignId);
        campaign.status = 'active';
        this.activeCampaigns.set(campaignId, campaign);
      } else {
        // 存在しない場合は新規追加
        await this.startCampaign(campaignId);
      }
      
      logger.info(`キャンペーン再開: ID=${campaignId}`);
      return true;
    } catch (error) {
      logger.error(`キャンペーン再開エラー: ID=${campaignId}`, error);
      return false;
    }
  }

  // 発信ジョブの開始
  startDialerJob() {
    // 3秒ごとに発信処理を実行
    setInterval(() => this.processDialerQueue(), 3000);
    logger.info('発信ジョブを開始しました');
  }

  // 発信キューの処理
  async processDialerQueue() {
    try {
      // 現在の時間帯をチェック（発信可能時間内かどうか）
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinute;
      
      // 各アクティブキャンペーンを処理
      for (const [campaignId, campaign] of this.activeCampaigns.entries()) {
        if (campaign.status !== 'active') continue;
        
        // キャンペーン情報の最新化
        const [campaigns] = await db.query(`
          SELECT c.working_hours_start, c.working_hours_end, c.status
          FROM campaigns c
          WHERE c.id = ?
        `, [campaignId]);
        
        if (campaigns.length === 0 || campaigns[0].status !== 'active') {
          // キャンペーンが存在しないか、アクティブでなくなった場合
          this.activeCampaigns.delete(campaignId);
          continue;
        }
        
        // 発信時間のチェック
        const workingHoursStart = campaigns[0].working_hours_start.split(':');
        const workingHoursEnd = campaigns[0].working_hours_end.split(':');
        const startTime = parseInt(workingHoursStart[0]) * 60 + parseInt(workingHoursStart[1]);
        const endTime = parseInt(workingHoursEnd[0]) * 60 + parseInt(workingHoursEnd[1]);
        
        if (currentTime < startTime || currentTime > endTime) {
          logger.debug(`キャンペーン ${campaignId} は発信時間外です: ${currentHour}:${currentMinute}`);
          continue;
        }
        
        // 最大同時発信数をチェック
        const availableSlots = campaign.maxConcurrentCalls - campaign.activeCalls;
        if (availableSlots <= 0) {
          logger.debug(`キャンペーン ${campaignId} は最大同時発信数に達しています: ${campaign.activeCalls}/${campaign.maxConcurrentCalls}`);
          continue;
        }
        
        // 発信する連絡先を取得
        const [contacts] = await db.query(`
          SELECT id, phone, name, company
          FROM contacts
          WHERE campaign_id = ? AND status = 'pending'
          LIMIT ?
        `, [campaignId, availableSlots]);
        
        if (contacts.length === 0) {
          logger.debug(`キャンペーン ${campaignId} には発信待ちの連絡先がありません`);
          continue;
        }
        
        // 各連絡先に発信
        for (const contact of contacts) {
          await this.dialContact(campaign, contact);
        }
      }
    } catch (error) {
      logger.error('発信キュー処理エラー:', error);
    }
  }

  // 連絡先への発信
  async dialContact(campaign, contact) {
    try {
      // 発信中ステータスに更新
      await db.query(
        'UPDATE contacts SET status = ? WHERE id = ?',
        ['called', contact.id]
      );
      
      // 発信パラメータの準備
      const params = {
        phoneNumber: contact.phone,
        context: 'autodialer',
        exten: 's',
        priority: 1,
        callerID: `"${campaign.name}" <${campaign.callerIdNumber}>`,
        variables: {
          CAMPAIGN_ID: campaign.id,
          CONTACT_ID: contact.id,
          CONTACT_NAME: contact.name || '',
          COMPANY: contact.company || ''
        }
      };
      
      // Asteriskで発信実行
      const result = await asterisk.originate(params);
      
      // アクティブコール数を更新
      campaign.activeCalls++;
      campaign.lastDialTime = new Date();
      this.activeCampaigns.set(campaign.id, campaign);
      
      // 通話ログを記録
      const [logResult] = await db.query(`
        INSERT INTO call_logs 
        (contact_id, campaign_id, caller_id_id, call_id, start_time, status)
        VALUES (?, ?, ?, ?, NOW(), 'active')
      `, [contact.id, campaign.id, campaign.callerIdId, result.ActionID]);
      
      const callId = result.ActionID;
      this.activeCalls.set(callId, {
        id: callId,
        contactId: contact.id,
        campaignId: campaign.id,
        startTime: new Date(),
        status: 'active'
      });
      
      logger.info(`発信開始: Campaign=${campaign.id}, Contact=${contact.id}, Number=${contact.phone}, CallID=${callId}`);
      return true;
    } catch (error) {
      logger.error(`発信エラー: Campaign=${campaign.id}, Contact=${contact.id}`, error);
      
      // エラー状態に更新
      await db.query(
        'UPDATE contacts SET status = ? WHERE id = ?',
        ['failed', contact.id]
      );
      
      return false;
    }
  }

  // 通話の終了処理
  async handleCallEnd(callId, duration, disposition, keypress) {
    try {
      if (!this.activeCalls.has(callId)) {
        logger.warn(`未知の通話ID: ${callId}`);
        return false;
      }
      
      const call = this.activeCalls.get(callId);
      
      // 通話ログの更新
      await db.query(`
        UPDATE call_logs
        SET end_time = NOW(), duration = ?, status = ?, keypress = ?
        WHERE call_id = ?
      `, [duration, disposition, keypress, callId]);
      
      // 連絡先の状態を更新
      let contactStatus = 'completed';
      if (keypress === '9') {
        contactStatus = 'dnc';
        
        // DNCリストに追加
        const [contact] = await db.query(
          'SELECT phone FROM contacts WHERE id = ?',
          [call.contactId]
        );
        
        if (contact && contact.length > 0) {
          await db.query(
            'INSERT IGNORE INTO dnc_list (phone, reason) VALUES (?, ?)',
            [contact[0].phone, 'ユーザーリクエスト']
          );
        }
      }
      
      await db.query(
        'UPDATE contacts SET status = ? WHERE id = ?',
        [contactStatus, call.contactId]
      );
      
      // キャンペーンの同時通話数を減らす
      if (this.activeCampaigns.has(call.campaignId)) {
        const campaign = this.activeCampaigns.get(call.campaignId);
        campaign.activeCalls = Math.max(0, campaign.activeCalls - 1);
        this.activeCampaigns.set(call.campaignId, campaign);
      }
      
      // アクティブコールリストから削除
      this.activeCalls.delete(callId);
      
      logger.info(`通話終了: CallID=${callId}, Duration=${duration}, Disposition=${disposition}, Keypress=${keypress}`);
      return true;
    } catch (error) {
      logger.error(`通話終了処理エラー: CallID=${callId}`, error);
      return false;
    }
  }

  // キャンペーンのステータスを確認
  async checkCampaignCompletion(campaignId) {
    try {
      // 処理待ちの連絡先数を確認
      const [pendingCount] = await db.query(`
        SELECT COUNT(*) as count
        FROM contacts
        WHERE campaign_id = ? AND status IN ('pending', 'called')
      `, [campaignId]);
      
      if (pendingCount[0].count === 0) {
        // すべての連絡先が処理済み
        await db.query(
          'UPDATE campaigns SET status = ? WHERE id = ?',
          ['completed', campaignId]
        );
        
        // アクティブキャンペーンリストから削除
        this.activeCampaigns.delete(campaignId);
        
        logger.info(`キャンペーン完了: ID=${campaignId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`キャンペーン完了チェックエラー: ID=${campaignId}`, error);
      return false;
    }
  }
}

// シングルトンインスタンス
const dialerService = new DialerService();

module.exports = dialerService;