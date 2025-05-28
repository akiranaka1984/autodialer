// backend/src/services/dialerService.js - 実際の発信処理版
const db = require('./database');
const logger = require('./logger');

class DialerService {
  constructor() {
    this.activeCampaigns = new Map();
    this.activeCalls = new Map();
    this.initialized = false;
    this.dialerIntervalId = null;
    this.isProcessing = false;
    this.errorCount = 0;
    this.maxErrors = 5;
    this.dialInterval = 15000; // 15秒間隔
    this.enabled = true;
  }

  async initialize() {
    if (this.initialized) {
      logger.info('DialerService は既に初期化されています');
      return true;
    }
    
    try {
      logger.info('🚀 DialerService 初期化開始（実発信モード）');
      
      // アクティブキャンペーンを取得
      const [activeCampaigns] = await db.query(`
        SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id, 
               ci.number as caller_id_number, ci.description
        FROM campaigns c
        JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.status = 'active' AND ci.active = true
        LIMIT 10
      `);
      
      logger.info(`📊 ${activeCampaigns.length}件のアクティブキャンペーンを検出`);
      
      // 発信対象があるキャンペーンのみ処理
      let validCampaigns = 0;
      for (const campaign of activeCampaigns) {
        const [contactCount] = await db.query(
          'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = "pending"',
          [campaign.id]
        );
        
        if (contactCount[0].count > 0) {
          this.activeCampaigns.set(campaign.id, {
            id: campaign.id,
            name: campaign.name,
            maxConcurrentCalls: Math.min(campaign.max_concurrent_calls || 1, 3),
            callerIdId: campaign.caller_id_id,
            callerIdNumber: campaign.caller_id_number,
            callerIdDescription: campaign.description || campaign.name,
            activeCalls: 0,
            status: 'active',
            lastDialTime: null,
            failCount: 0
          });
          validCampaigns++;
          logger.info(`✅ キャンペーン登録: ${campaign.name} (ID: ${campaign.id})`);
        }
      }
      
      // 自動発信開始
      if (validCampaigns > 0 && this.enabled) {
        this.startDialerJob();
        logger.info(`🔥 ${validCampaigns}件のキャンペーンで実際の自動発信開始`);
      } else {
        logger.info('ℹ️ 発信対象なし。自動発信は無効');
        this.enabled = false;
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      logger.error('❌ DialerService 初期化エラー:', error);
      this.enabled = false;
      this.initialized = false;
      return false;
    }
  }

  startDialerJob() {
    if (!this.enabled) {
      logger.info('🛑 DialerService無効のため発信ジョブは開始されません');
      return false;
    }
    
    if (this.dialerIntervalId) {
      clearInterval(this.dialerIntervalId);
      this.dialerIntervalId = null;
    }
    
    this.dialerIntervalId = setInterval(async () => {
      if (!this.enabled || this.activeCampaigns.size === 0) {
        logger.info('🛑 条件不備により発信ジョブ停止');
        this.stopDialerJob();
        return;
      }
      
      if (this.isProcessing) {
        logger.debug('⏭️ 処理中のためスキップ');
        return;
      }
      
      if (this.errorCount >= this.maxErrors) {
        logger.warn(`🛑 エラー上限(${this.maxErrors})に達したため停止`);
        this.stopDialerJob();
        return;
      }
      
      try {
        await this.processDialerQueue();
      } catch (error) {
        this.errorCount++;
        logger.error(`❌ 発信ジョブエラー (${this.errorCount}/${this.maxErrors}):`, error.message);
      }
    }, this.dialInterval);
    
    logger.info(`🔥 実際の自動発信ジョブ開始: 間隔=${this.dialInterval}ms`);
    return true;
  }

  async processDialerQueue() {
    this.isProcessing = true;
    
    try {
      let totalAttempts = 0;
      const maxAttempts = 2;
      
      logger.info(`🔄 発信キュー処理開始（最大${maxAttempts}件）`);
      
      for (const [campaignId, campaign] of this.activeCampaigns.entries()) {
        if (totalAttempts >= maxAttempts || !this.enabled) break;
        if (campaign.status !== 'active') continue;
        
        // 同時発信数チェック
        if (campaign.activeCalls >= campaign.maxConcurrentCalls) {
          logger.debug(`⏭️ キャンペーン ${campaign.name}: 同時発信上限に達成 (${campaign.activeCalls}/${campaign.maxConcurrentCalls})`);
          continue;
        }
        
        // 発信対象を取得
        const [contacts] = await db.query(`
          SELECT id, phone, name, company 
          FROM contacts 
          WHERE campaign_id = ? AND status = 'pending' 
          ORDER BY id ASC
          LIMIT 1
        `, [campaignId]);
        
        if (contacts.length === 0) {
          logger.info(`📋 キャンペーン ${campaign.name}: 発信対象なし`);
          await this.checkCampaignCompletion(campaignId);
          continue;
        }
        
        // 実際の発信実行
        const contact = contacts[0];
        logger.info(`📞 実際の発信実行: ${contact.phone} (キャンペーン: ${campaign.name})`);
        
        const result = await this.dialContactReal(campaign, contact);
        if (result.success) {
          campaign.activeCalls++;
          totalAttempts++;
          logger.info(`✅ 発信成功: ${contact.phone} → 実際に電話がかかります`);
        } else {
          logger.error(`❌ 発信失敗: ${contact.phone} - ${result.error}`);
        }
        
        // 発信間隔
        if (totalAttempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      logger.info(`📞 発信サイクル完了: ${totalAttempts}件実行`);
      this.errorCount = 0; // 成功時リセット
    } catch (error) {
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  // 🔥🔥🔥 実際の発信処理（シミュレーションではない）
  async dialContactReal(campaign, contact) {
    try {
      logger.info(`🔥 実際のSIP発信開始: ${contact.phone} (Campaign: ${campaign.name})`);
      
      // 実際の発信パラメータ
      const params = {
        phoneNumber: contact.phone,
        callerID: `"${campaign.callerIdDescription}" <${campaign.callerIdNumber}>`,
        context: 'autodialer',
        exten: 's',
        priority: 1,
        variables: {
          CAMPAIGN_ID: campaign.id,
          CONTACT_ID: contact.id,
          CONTACT_NAME: contact.name || 'Unknown',
          COMPANY: contact.company || '',
          AUTO_DIAL: 'true'
        },
        callerIdData: {
          id: campaign.callerIdId,
          number: campaign.callerIdNumber,
          description: campaign.callerIdDescription
        },
        mockMode: false, // 🔥 実発信モード（重要）
        provider: 'sip'
      };
      
      // 🚀🚀🚀 実際の発信処理を実行
      const callService = require('./callService');
      const result = await callService.originate(params);
      
      if (!result || !result.ActionID) {
        throw new Error('発信処理の結果が無効です');
      }
      
      logger.info(`🎯 SIP発信コマンド実行成功: ${contact.phone}, CallID: ${result.ActionID}`);
      
      // 連絡先ステータスを「発信済み」に更新
      await db.query(
        'UPDATE contacts SET status = ?, last_attempt = NOW(), attempt_count = attempt_count + 1 WHERE id = ?',
        ['called', contact.id]
      );
      
      // 通話ログに記録
      await db.query(`
        INSERT INTO call_logs 
        (contact_id, campaign_id, caller_id_id, call_id, phone_number, start_time, status, call_provider, test_call)
        VALUES (?, ?, ?, ?, ?, NOW(), 'ORIGINATING', ?, false)
      `, [
        contact.id, 
        campaign.id, 
        campaign.callerIdId, 
        result.ActionID, 
        contact.phone,
        result.provider || 'sip'
      ]);
      
      // アクティブコールとして管理
      this.activeCalls.set(result.ActionID, {
        id: result.ActionID,
        contactId: contact.id,
        campaignId: campaign.id,
        phoneNumber: contact.phone,
        startTime: new Date(),
        status: 'active'
      });
      
      logger.info(`🔥🔥🔥 実際の電話発信完了: ${contact.phone} → 今電話が鳴っているはずです！`);
      
      return {
        success: true,
        callId: result.ActionID,
        phone: contact.phone,
        provider: result.provider
      };
      
    } catch (error) {
      logger.error(`❌ 実発信エラー: ${contact.phone}`, error);
      
      // エラー時は失敗ステータスに更新
      try {
        await db.query(
          'UPDATE contacts SET status = ?, last_attempt = NOW() WHERE id = ?',
          ['failed', contact.id]
        );
      } catch (updateError) {
        logger.error('連絡先ステータス更新エラー:', updateError);
      }
      
      return {
        success: false,
        error: error.message,
        phone: contact.phone
      };
    }
  }

  stopDialerJob() {
    if (this.dialerIntervalId) {
      clearInterval(this.dialerIntervalId);
      this.dialerIntervalId = null;
      this.isProcessing = false;
      logger.info('🛑 自動発信ジョブを停止しました');
      return true;
    }
    return false;
  }

  async checkCampaignCompletion(campaignId) {
    try {
      const [pendingCount] = await db.query(
        'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = "pending"',
        [campaignId]
      );
      
      if (pendingCount[0].count === 0) {
        await this.completeCampaign(campaignId);
      }
    } catch (error) {
      logger.error(`キャンペーン完了チェックエラー: ${campaignId}`, error);
    }
  }

  async startCampaign(campaignId) {
    try {
      logger.info(`🚀 キャンペーン開始: ID=${campaignId}`);
      
      const [campaigns] = await db.query(`
        SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id, 
               ci.number as caller_id_number, ci.description
        FROM campaigns c
        JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.id = ? AND ci.active = true
      `, [campaignId]);
      
      if (campaigns.length === 0) {
        throw new Error('キャンペーンが見つかりません');
      }
      
      const campaign = campaigns[0];
      
      await db.query(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['active', campaignId]
      );
      
      this.activeCampaigns.set(campaignId, {
        id: campaign.id,
        name: campaign.name,
        maxConcurrentCalls: Math.min(campaign.max_concurrent_calls || 1, 3),
        callerIdId: campaign.caller_id_id,
        callerIdNumber: campaign.caller_id_number,
        callerIdDescription: campaign.description || campaign.name,
        activeCalls: 0,
        status: 'active',
        lastDialTime: new Date(),
        failCount: 0
      });
      
      // 発信ジョブが停止している場合は開始
      if (!this.dialerIntervalId && this.enabled) {
        this.startDialerJob();
      }
      
      logger.info(`✅ キャンペーン開始成功: ${campaign.name}`);
      return true;
    } catch (error) {
      logger.error(`❌ キャンペーン開始エラー: ${error.message}`);
      return false;
    }
  }

  async pauseCampaign(campaignId) {
    try {
      await db.query(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['paused', campaignId]
      );
      
      this.activeCampaigns.delete(campaignId);
      
      if (this.activeCampaigns.size === 0) {
        this.stopDialerJob();
      }
      
      logger.info(`🛑 キャンペーン停止: ID=${campaignId}`);
      return true;
    } catch (error) {
      logger.error(`キャンペーン停止エラー: ${campaignId}`, error);
      return false;
    }
  }

  async completeCampaign(campaignId) {
    try {
      await db.query(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['completed', campaignId]
      );
      
      this.activeCampaigns.delete(campaignId);
      
      if (this.activeCampaigns.size === 0) {
        this.stopDialerJob();
      }
      
      logger.info(`🏁 キャンペーン完了: ${campaignId}`);
      return true;
    } catch (error) {
      logger.error(`キャンペーン完了エラー: ${campaignId}`, error);
      return false;
    }
  }

  async handleCallEnd(callId, duration, disposition, keypress) {
    try {
      if (!this.activeCalls.has(callId)) {
        logger.debug(`未知の通話ID: ${callId}`);
        return false;
      }
      
      const call = this.activeCalls.get(callId);
      
      await db.query(`
        UPDATE call_logs
        SET end_time = NOW(), duration = ?, status = ?, keypress = ?
        WHERE call_id = ?
      `, [duration, disposition, keypress, callId]);
      
      let contactStatus = 'completed';
      if (keypress === '9') {
        contactStatus = 'dnc';
        // DNC登録処理
        const [contacts] = await db.query(
          'SELECT phone FROM contacts WHERE id = ?',
          [call.contactId]
        );
        if (contacts.length > 0) {
          await db.query(
            'INSERT IGNORE INTO dnc_list (phone, reason) VALUES (?, ?)',
            [contacts[0].phone, 'ユーザーリクエスト']
          );
        }
      }
      
      await db.query(
        'UPDATE contacts SET status = ? WHERE id = ?',
        [contactStatus, call.contactId]
      );
      
      // アクティブコール数を減らす
      if (this.activeCampaigns.has(call.campaignId)) {
        const campaign = this.activeCampaigns.get(call.campaignId);
        campaign.activeCalls = Math.max(0, campaign.activeCalls - 1);
      }
      
      this.activeCalls.delete(callId);
      
      logger.info(`✅ 通話終了処理完了: ${callId}`);
      return true;
    } catch (error) {
      logger.error(`❌ 通話終了処理エラー: ${callId}`, error);
      return false;
    }
  }

  getHealthStatus() {
    return {
      timestamp: new Date().toISOString(),
      initialized: this.initialized,
      enabled: this.enabled,
      dialerJobRunning: this.dialerIntervalId !== null,
      isProcessing: this.isProcessing,
      errorCount: this.errorCount,
      maxErrors: this.maxErrors,
      activeCampaigns: {
        count: this.activeCampaigns.size,
        details: Array.from(this.activeCampaigns.entries()).map(([id, campaign]) => ({
          id: id,
          name: campaign.name,
          status: campaign.status,
          activeCalls: campaign.activeCalls,
          maxConcurrentCalls: campaign.maxConcurrentCalls
        }))
      },
      activeCalls: {
        count: this.activeCalls.size
      }
    };
  }

  getCampaignStatus(campaignId) {
    if (this.activeCampaigns.has(campaignId)) {
      return this.activeCampaigns.get(campaignId);
    }
    return null;
  }

  get dialerJobRunning() {
    return this.dialerIntervalId !== null;
  }
}

const dialerService = new DialerService();
module.exports = dialerService;
