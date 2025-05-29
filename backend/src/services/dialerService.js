// backend/src/services/dialerService.js - 完全自動連動版
const db = require('./database');
const logger = require('./logger');
const { EventEmitter } = require('events');

class DialerService extends EventEmitter {
  constructor() {
    super();
    this.activeCampaigns = new Map();
    this.activeCalls = new Map();
    this.isProcessing = false;
    this.dialerIntervalId = null;
    this.campaignWatcherIntervalId = null;
    
    // 設定
    this.dialInterval = 5000; // 5秒間隔
    this.campaignCheckInterval = 10000; // 10秒ごとにキャンペーン状態チェック
    this.enabled = process.env.DISABLE_AUTO_DIALER !== 'true';
    
    logger.info(`🚀 DialerService初期化: 自動連動システム=${this.enabled ? '有効' : '無効'}`);
    
    // 🔥 完全自動開始
    if (this.enabled) {
      this.startAutoSystem();
    }
  }

  // 🎯 完全自動システム開始
  async startAutoSystem() {
    try {
      logger.info('🎯 完全自動連動システム開始...');
      
      // 1. 初期キャンペーンロード
      await this.loadActiveCampaigns();
      
      // 2. キャンペーン監視開始（データベース変更を自動検知）
      this.startCampaignWatcher();
      
      // 3. 自動発信システム開始
      this.startAutoDialer();
      
      logger.info('✅ 完全自動連動システム起動完了');
      
    } catch (error) {
      logger.error('❌ 自動システム開始エラー:', error);
      
      // 5秒後に再試行
      setTimeout(() => {
        logger.info('🔄 自動システム再起動試行...');
        this.startAutoSystem();
      }, 5000);
    }
  }

  // 👁️ キャンペーン監視開始（データベース変更を自動検知）
  startCampaignWatcher() {
    if (this.campaignWatcherIntervalId) {
      clearInterval(this.campaignWatcherIntervalId);
    }
    
    this.campaignWatcherIntervalId = setInterval(async () => {
      try {
        await this.checkCampaignChanges();
      } catch (error) {
        logger.error('キャンペーン監視エラー:', error);
      }
    }, this.campaignCheckInterval);
    
    logger.info(`👁️ キャンペーン監視開始: ${this.campaignCheckInterval}ms間隔`);
  }

  // 🔍 キャンペーン変更チェック（自動検知）
  async checkCampaignChanges() {
    try {
      // データベースから現在のアクティブキャンペーンを取得
      const [currentActiveCampaigns] = await db.query(`
        SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id,
               ci.number as caller_id_number,
               c.updated_at,
               (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'pending') as pending_count
        FROM campaigns c
        JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.status = 'active' AND ci.active = true
        ORDER BY c.updated_at DESC
      `);
      
      const currentIds = new Set(currentActiveCampaigns.map(c => c.id));
      const existingIds = new Set(this.activeCampaigns.keys());
      
      // 🆕 新しいキャンペーンを自動検知
      const newCampaigns = currentActiveCampaigns.filter(c => !existingIds.has(c.id));
      for (const campaign of newCampaigns) {
        if (campaign.pending_count > 0) {
          await this.autoAddCampaign(campaign);
          logger.info(`🆕 新しいキャンペーンを自動検知: "${campaign.name}" (ID: ${campaign.id})`);
        }
      }
      
      // ❌ 停止されたキャンペーンを自動検知
      const removedIds = Array.from(existingIds).filter(id => !currentIds.has(id));
      for (const campaignId of removedIds) {
        await this.autoRemoveCampaign(campaignId);
        logger.info(`❌ 停止されたキャンペーンを自動検知: ID ${campaignId}`);
      }
      
      // 自動発信システムの状態調整
      if (this.activeCampaigns.size > 0 && !this.dialerIntervalId) {
        this.startAutoDialer();
        logger.info('🚀 アクティブキャンペーン検知により自動発信開始');
      } else if (this.activeCampaigns.size === 0 && this.dialerIntervalId) {
        this.stopAutoDialer();
        logger.info('🛑 アクティブキャンペーンなしにより自動発信停止');
      }
      
    } catch (error) {
      logger.error('キャンペーン変更チェックエラー:', error);
    }
  }

  // 🆕 キャンペーン自動追加
  async autoAddCampaign(campaign) {
    try {
      this.activeCampaigns.set(campaign.id, {
        id: campaign.id,
        name: campaign.name,
        maxConcurrentCalls: Math.min(campaign.max_concurrent_calls || 1, 2),
        callerIdId: campaign.caller_id_id,
        callerIdNumber: campaign.caller_id_number,
        activeCalls: 0,
        status: 'active',
        lastDialTime: null,
        failCount: 0,
        addedAt: new Date()
      });
      
      // イベント発火
      this.emit('campaignAdded', campaign);
      
      logger.info(`✅ キャンペーン自動追加: "${campaign.name}" (未処理: ${campaign.pending_count}件)`);
      
    } catch (error) {
      logger.error(`キャンペーン自動追加エラー: ${campaign.id}`, error);
    }
  }

  // ❌ キャンペーン自動削除
  async autoRemoveCampaign(campaignId) {
    try {
      const campaign = this.activeCampaigns.get(campaignId);
      
      if (campaign) {
        this.activeCampaigns.delete(campaignId);
        
        // イベント発火
        this.emit('campaignRemoved', { id: campaignId, name: campaign.name });
        
        logger.info(`🗑️ キャンペーン自動削除: "${campaign.name}" (ID: ${campaignId})`);
      }
      
    } catch (error) {
      logger.error(`キャンペーン自動削除エラー: ${campaignId}`, error);
    }
  }

  // 📋 初期キャンペーンロード
  async loadActiveCampaigns() {
    try {
      const [campaigns] = await db.query(`
        SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id,
               ci.number as caller_id_number,
               (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'pending') as pending_count
        FROM campaigns c
        JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.status = 'active' AND ci.active = true
      `);
      
      logger.info(`📋 初期キャンペーンロード: ${campaigns.length}件検出`);
      
      for (const campaign of campaigns) {
        if (campaign.pending_count > 0) {
          await this.autoAddCampaign(campaign);
        }
      }
      
    } catch (error) {
      logger.error('初期キャンペーンロードエラー:', error);
    }
  }

  // 🚀 自動発信システム開始
  startAutoDialer() {
    if (this.dialerIntervalId) {
      clearInterval(this.dialerIntervalId);
    }
    
    this.dialerIntervalId = setInterval(async () => {
      if (!this.enabled || this.isProcessing || this.activeCampaigns.size === 0) {
        return;
      }
      
      try {
        await this.processAutoDialing();
      } catch (error) {
        logger.error('自動発信エラー:', error);
      }
    }, this.dialInterval);
    
    logger.info(`🚀 自動発信システム開始: ${this.dialInterval}ms間隔`);
  }

  // 🛑 自動発信システム停止
  stopAutoDialer() {
    if (this.dialerIntervalId) {
      clearInterval(this.dialerIntervalId);
      this.dialerIntervalId = null;
      logger.info('🛑 自動発信システム停止');
    }
  }

  // 📞 自動発信処理
  async processAutoDialing() {
    this.isProcessing = true;
    
    try {
      for (const [campaignId, campaign] of this.activeCampaigns.entries()) {
        if (campaign.status !== 'active') continue;
        if (campaign.activeCalls >= campaign.maxConcurrentCalls) continue;
        
        // 未処理連絡先を1件取得
        const [contacts] = await db.query(`
          SELECT id, phone, name, company 
          FROM contacts 
          WHERE campaign_id = ? AND status = 'pending' 
          LIMIT 1
        `, [campaignId]);
        
        if (contacts.length === 0) {
          // 未処理連絡先がない場合はキャンペーン完了チェック
          await this.checkCampaignCompletion(campaignId);
          continue;
        }
        
        const contact = contacts[0];
        const success = await this.dialContact(campaign, contact);
        
        if (success) {
          campaign.activeCalls++;
          campaign.lastDialTime = new Date();
          
          // イベント発火
          this.emit('contactDialed', {
            campaignId,
            contactId: contact.id,
            phone: contact.phone
          });
        }
        
        // 発信間隔
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      logger.error('自動発信処理エラー:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // 📞 連絡先発信
  async dialContact(campaign, contact) {
    try {
      logger.info(`📞 自動発信: ${contact.phone} (Campaign: ${campaign.name})`);
      
      // ステータス更新
      await db.query(
        'UPDATE contacts SET status = ?, last_attempt = NOW() WHERE id = ?',
        ['called', contact.id]
      );
      
      // 発信実行
      const callService = require('./callService');
      const result = await callService.originate({
        phoneNumber: contact.phone,
        context: 'autodialer',
        callerID: `"${campaign.name}" <${campaign.callerIdNumber}>`,
        variables: {
          CAMPAIGN_ID: campaign.id,
          CONTACT_ID: contact.id,
          CONTACT_NAME: contact.name || '',
          AUTO_DIAL: 'true'
        }
      });
      
      // 通話ログ記録
      await db.query(`
        INSERT INTO call_logs 
        (contact_id, campaign_id, caller_id_id, call_id, phone_number, start_time, status, call_provider)
        VALUES (?, ?, ?, ?, ?, NOW(), 'ORIGINATING', ?)
      `, [
        contact.id,
        campaign.id,
        campaign.callerIdId,
        result.ActionID,
        contact.phone,
        result.provider || 'sip'
      ]);
      
      // アクティブコール記録
      this.activeCalls.set(result.ActionID, {
        id: result.ActionID,
        contactId: contact.id,
        campaignId: campaign.id,
        startTime: new Date()
      });
      
      logger.info(`✅ 自動発信成功: ${contact.phone} (CallID: ${result.ActionID})`);
      return true;
      
    } catch (error) {
      logger.error(`❌ 発信エラー: ${contact.phone}`, error);
      
      // エラー時のステータス更新
      await db.query(
        'UPDATE contacts SET status = ? WHERE id = ?',
        ['failed', contact.id]
      ).catch(() => {});
      
      return false;
    }
  }

  // 🏁 キャンペーン完了チェック
  async checkCampaignCompletion(campaignId) {
    try {
      const [result] = await db.query(
        'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = "pending"',
        [campaignId]
      );
      
      if (result[0].count === 0) {
        // キャンペーン完了
        await db.query(
          'UPDATE campaigns SET status = ? WHERE id = ?',
          ['completed', campaignId]
        );
        
        const campaign = this.activeCampaigns.get(campaignId);
        logger.info(`🏁 キャンペーン自動完了: "${campaign?.name}" (ID: ${campaignId})`);
        
        // イベント発火
        this.emit('campaignCompleted', { id: campaignId, name: campaign?.name });
      }
      
    } catch (error) {
      logger.error(`キャンペーン完了チェックエラー: ${campaignId}`, error);
    }
  }

  // 📞 通話終了処理
  async handleCallEnd(callId, duration, status, keypress) {
    try {
      const call = this.activeCalls.get(callId);
      if (!call) return false;
      
      // 通話ログ更新
      await db.query(`
        UPDATE call_logs
        SET end_time = NOW(), duration = ?, status = ?, keypress = ?
        WHERE call_id = ?
      `, [duration, status, keypress, callId]);
      
      // 連絡先ステータス更新
      let contactStatus = 'completed';
      if (keypress === '9') {
        contactStatus = 'dnc';
        
        // DNC登録
        const [contacts] = await db.query(
          'SELECT phone FROM contacts WHERE id = ?',
          [call.contactId]
        );
        
        if (contacts.length > 0) {
          await db.query(
            'INSERT IGNORE INTO dnc_list (phone, reason) VALUES (?, ?)',
            [contacts[0].phone, 'ユーザーリクエスト（9キー）']
          );
        }
      }
      
      await db.query(
        'UPDATE contacts SET status = ? WHERE id = ?',
        [contactStatus, call.contactId]
      );
      
      // アクティブコール数を減らす
      const campaign = this.activeCampaigns.get(call.campaignId);
      if (campaign) {
        campaign.activeCalls = Math.max(0, campaign.activeCalls - 1);
      }
      
      // アクティブコールから削除
      this.activeCalls.delete(callId);
      
      // イベント発火
      this.emit('callEnded', {
        callId,
        campaignId: call.campaignId,
        contactId: call.contactId,
        status,
        duration,
        keypress
      });
      
      logger.info(`📞 通話終了処理完了: ${callId} (Status: ${status})`);
      return true;
      
    } catch (error) {
      logger.error(`通話終了処理エラー: ${callId}`, error);
      return false;
    }
  }

  // 📊 システム状態取得
  getSystemStatus() {
    return {
      enabled: this.enabled,
      autoDialerRunning: this.dialerIntervalId !== null,
      campaignWatcherRunning: this.campaignWatcherIntervalId !== null,
      activeCampaigns: {
        count: this.activeCampaigns.size,
        details: Array.from(this.activeCampaigns.values()).map(c => ({
          id: c.id,
          name: c.name,
          activeCalls: c.activeCalls,
          maxConcurrentCalls: c.maxConcurrentCalls,
          lastDialTime: c.lastDialTime
        }))
      },
      activeCalls: {
        count: this.activeCalls.size
      },
      isProcessing: this.isProcessing,
      intervals: {
        dialInterval: this.dialInterval,
        campaignCheckInterval: this.campaignCheckInterval
      }
    };
  }

  // 🚨 システム停止
  async stopSystem() {
    logger.info('🚨 自動連動システム停止...');
    
    this.stopAutoDialer();
    
    if (this.campaignWatcherIntervalId) {
      clearInterval(this.campaignWatcherIntervalId);
      this.campaignWatcherIntervalId = null;
    }
    
    this.activeCampaigns.clear();
    this.activeCalls.clear();
    
    logger.info('✅ システム停止完了');
  }
}

// シングルトンインスタンス
const dialerService = new DialerService();

// グローバルイベントリスナー（デバッグ用）
dialerService.on('campaignAdded', (campaign) => {
  logger.info(`🎉 イベント: キャンペーン追加 - ${campaign.name}`);
});

dialerService.on('campaignRemoved', (campaign) => {
  logger.info(`🗑️ イベント: キャンペーン削除 - ${campaign.name}`);
});

dialerService.on('contactDialed', (data) => {
  logger.debug(`📞 イベント: 発信完了 - ${data.phone}`);
});

dialerService.on('callEnded', (data) => {
  logger.debug(`📞 イベント: 通話終了 - CallID: ${data.callId}`);
});

dialerService.on('campaignCompleted', (campaign) => {
  logger.info(`🏁 イベント: キャンペーン完了 - ${campaign.name}`);
});

module.exports = dialerService;
