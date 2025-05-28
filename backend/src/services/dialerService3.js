// backend/src/services/dialerService.js - エラー修正版
const db = require('./database');
const logger = require('./logger');

class DialerService {
  constructor() {
    this.activeCampaigns = new Map();
    this.activeCalls = new Map();
    this.initialized = false;
    this.dialerJobRunning = false;
    this.lastJobExecution = null;
    this.jobExecutionCount = 0;
    this.jobErrors = [];
    this.defaultDialInterval = 10000; // 10秒間隔
    this.maxRetryAttempts = 3;
    this.dialingInProgress = false;
    
    // 🔥 重要: 環境変数による自動発信制御
    this.autoDialerEnabled = process.env.DISABLE_AUTO_DIALER !== 'true';
    
    logger.info(`DialerService構築: 自動発信=${this.autoDialerEnabled ? '有効' : '無効'}`);
  }

  // 🚀 初期化（修正版）
  async initialize() {
    try {
      logger.info('DialerService初期化開始...');
      
      if (this.initialized) {
        logger.info('DialerServiceは既に初期化済みです');
        return true;
      }
      
      // 🔥 自動発信が無効な場合は初期化をスキップ
      if (!this.autoDialerEnabled) {
        logger.info('🛑 自動発信機能は無効化されています (DISABLE_AUTO_DIALER=true)');
        this.initialized = true;
        return true;
      }
      
      // データベース接続確認
      await db.query('SELECT 1');
      logger.info('✅ データベース接続確認成功');
      
      // アクティブなキャンペーンを復元
      const [activeCampaigns] = await db.query(`
        SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id, 
               ci.number as caller_id_number
        FROM campaigns c
        JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.status = 'active' AND ci.active = true
      `);
      
      logger.info(`アクティブキャンペーン復元: ${activeCampaigns.length}件`);
      
      for (const campaign of activeCampaigns) {
        this.activeCampaigns.set(campaign.id, {
          id: campaign.id,
          name: campaign.name,
          maxConcurrentCalls: campaign.max_concurrent_calls || 2,
          callerIdId: campaign.caller_id_id,
          callerIdNumber: campaign.caller_id_number,
          activeCalls: 0,
          status: 'active',
          lastDialTime: null
        });
      }
      
      // 🔥 自動発信ジョブを開始（条件付き）
      if (this.autoDialerEnabled && activeCampaigns.length > 0) {
        this.startDialerJob();
        logger.info('🚀 自動発信ジョブ開始');
      } else {
        logger.info('ℹ️ 自動発信ジョブはスキップされました');
      }
      
      this.initialized = true;
      logger.info('✅ DialerService初期化完了');
      return true;
      
    } catch (error) {
      logger.error('❌ DialerService初期化エラー:', error);
      this.initialized = false;
      return false;
    }
  }

  // 🔄 自動発信ジョブ開始（安全版）
  startDialerJob() {
    // 重複起動防止
    if (this.dialerJobRunning) {
      logger.warn('発信ジョブは既に実行中です');
      return;
    }
    
    // 環境変数再チェック
    if (process.env.DISABLE_AUTO_DIALER === 'true') {
      logger.info('🛑 自動発信は環境変数により無効化されています');
      return;
    }
    
    this.dialerJobRunning = true;
    
    // 10秒ごとに発信処理を実行
    const intervalId = setInterval(async () => {
      try {
        // 環境変数による緊急停止チェック
        if (process.env.DISABLE_AUTO_DIALER === 'true') {
          logger.info('🚨 緊急停止: 自動発信ジョブを停止します');
          clearInterval(intervalId);
          this.dialerJobRunning = false;
          return;
        }
        
        await this.processDialerQueue();
        this.lastJobExecution = new Date();
        this.jobExecutionCount++;
        
      } catch (error) {
        logger.error('発信ジョブエラー:', error);
        this.jobErrors.push({
          timestamp: new Date(),
          error: error.message
        });
        
        // エラーが多すぎる場合は自動停止
        if (this.jobErrors.length > 10) {
          logger.error('🚨 エラー多発により自動発信を停止します');
          clearInterval(intervalId);
          this.dialerJobRunning = false;
        }
      }
    }, this.defaultDialInterval);
    
    logger.info(`🔥 自動発信ジョブ開始: 間隔=${this.defaultDialInterval}ms`);
  }

  // 🚀 キャンペーン開始（安全版）
  async startCampaign(campaignId) {
    try {
      logger.info(`🚀 キャンペーン開始: ID=${campaignId}`);
      
      if (!campaignId || isNaN(parseInt(campaignId))) {
        throw new Error('無効なキャンペーンID');
      }
      
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
      this.activeCampaigns.set(parseInt(campaignId), {
        id: campaign.id,
        name: campaign.name,
        maxConcurrentCalls: campaign.max_concurrent_calls || 2,
        callerIdId: campaign.caller_id_id,
        callerIdNumber: campaign.caller_id_number,
        activeCalls: 0,
        status: 'active',
        lastDialTime: new Date()
      });
      
      // 自動発信ジョブが動いていない場合は開始
      if (this.autoDialerEnabled && !this.dialerJobRunning) {
        this.startDialerJob();
      }
      
      logger.info(`✅ キャンペーン開始成功: ${campaign.name}`);
      return true;
      
    } catch (error) {
      logger.error(`❌ キャンペーン開始エラー: ${error.message}`);
      return false;
    }
  }

  // 🛑 キャンペーン停止（安全版）
  async pauseCampaign(campaignId) {
    try {
      logger.info(`🛑 キャンペーン停止: ID=${campaignId}`);
      
      if (!campaignId || isNaN(parseInt(campaignId))) {
        throw new Error('無効なキャンペーンID');
      }
      
      await db.query(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['paused', campaignId]
      );
      
      // アクティブキャンペーンリストから削除
      if (this.activeCampaigns.has(parseInt(campaignId))) {
        this.activeCampaigns.delete(parseInt(campaignId));
      }
      
      logger.info(`✅ キャンペーン停止成功: ID=${campaignId}`);
      return true;
      
    } catch (error) {
      logger.error(`❌ キャンペーン停止エラー: ${error.message}`);
      return false;
    }
  }

  // 🔄 発信キュー処理（安全版）
  async processDialerQueue() {
    try {
      // 基本チェック
      if (!this.autoDialerEnabled) {
        return;
      }
      
      if (this.activeCampaigns.size === 0) {
        return;
      }
      
      if (this.dialingInProgress) {
        logger.debug('発信処理が既に実行中です');
        return;
      }
      
      this.dialingInProgress = true;
      
      logger.debug(`発信キュー処理開始: ${this.activeCampaigns.size}キャンペーン`);
      
      // 各アクティブキャンペーンを処理
      for (const [campaignId, campaign] of this.activeCampaigns.entries()) {
        if (campaign.status !== 'active') {
          continue;
        }
        
        // 最大同時発信数をチェック
        const availableSlots = campaign.maxConcurrentCalls - campaign.activeCalls;
        if (availableSlots <= 0) {
          continue;
        }
        
        // 発信待ち連絡先を取得（1件のみ）
        const [contacts] = await db.query(`
          SELECT id, phone, name, company 
          FROM contacts 
          WHERE campaign_id = ? AND status = 'pending' 
          LIMIT 1
        `, [campaignId]);
        
        // 連絡先がある場合のみ発信
        if (contacts.length > 0) {
          const contact = contacts[0];
          const result = await this.dialContact(campaign, contact);
          
          if (result) {
            campaign.activeCalls++;
            logger.info(`📞 発信成功: ${contact.phone} (Campaign: ${campaign.name})`);
          }
        }
      }
      
    } catch (error) {
      logger.error('発信キュー処理エラー:', error);
    } finally {
      this.dialingInProgress = false;
    }
  }

  // 📞 連絡先への発信（簡単版）
  async dialContact(campaign, contact) {
    try {
      logger.info(`📞 発信開始: ${contact.phone}`);
      
      // 発信中ステータスに更新
      await db.query(
        'UPDATE contacts SET status = ?, last_attempt = NOW() WHERE id = ?',
        ['called', contact.id]
      );
      
      // 通話ログを記録（発信開始）
      const callId = `dial-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      await db.query(`
        INSERT INTO call_logs 
        (contact_id, campaign_id, caller_id_id, call_id, phone_number, start_time, status, call_provider)
        VALUES (?, ?, ?, ?, ?, NOW(), 'ORIGINATING', 'sip')
      `, [
        contact.id, 
        campaign.id, 
        campaign.callerIdId, 
        callId,
        contact.phone
      ]);
      
      // 実際のSIP発信処理（今は省略してモックとして処理）
      logger.info(`📞 SIP発信シミュレーション: ${contact.phone}`);
      
      // 10秒後に通話終了シミュレーション
      setTimeout(async () => {
        await this.handleCallEnd(callId, 10, 'ANSWERED', null);
      }, 10000);
      
      return true;
      
    } catch (error) {
      logger.error(`❌ 発信エラー: ${contact.phone}`, error);
      
      // エラー状態に更新
      await db.query(
        'UPDATE contacts SET status = ? WHERE id = ?',
        ['failed', contact.id]
      );
      
      return false;
    }
  }

  // 📞 通話終了処理（簡易版）
  async handleCallEnd(callId, duration, disposition, keypress) {
    try {
      logger.info(`📞 通話終了: ${callId}, disposition=${disposition}`);
      
      // 通話ログの更新
      await db.query(`
        UPDATE call_logs
        SET end_time = NOW(), duration = ?, status = ?, keypress = ?
        WHERE call_id = ?
      `, [duration, disposition, keypress, callId]);
      
      // 連絡先ステータス更新
      const [callInfo] = await db.query(
        'SELECT contact_id, campaign_id FROM call_logs WHERE call_id = ?',
        [callId]
      );
      
      if (callInfo.length > 0) {
        const { contact_id, campaign_id } = callInfo[0];
        
        let contactStatus = 'completed';
        if (keypress === '9') {
          contactStatus = 'dnc';
        } else if (keypress === '1') {
          contactStatus = 'operator_requested';
        }
        
        await db.query(
          'UPDATE contacts SET status = ? WHERE id = ?',
          [contactStatus, contact_id]
        );
        
        // キャンペーンの同時通話数を減らす
        if (this.activeCampaigns.has(campaign_id)) {
          const campaign = this.activeCampaigns.get(campaign_id);
          campaign.activeCalls = Math.max(0, campaign.activeCalls - 1);
        }
      }
      
      return true;
      
    } catch (error) {
      logger.error(`❌ 通話終了処理エラー: ${callId}`, error);
      return false;
    }
  }

  // 📊 ヘルスステータス取得
  getHealthStatus() {
    return {
      initialized: this.initialized,
      autoDialerEnabled: this.autoDialerEnabled,
      dialerJobRunning: this.dialerJobRunning,
      activeCampaigns: this.activeCampaigns.size,
      activeCalls: this.activeCalls.size,
      lastJobExecution: this.lastJobExecution,
      jobExecutionCount: this.jobExecutionCount,
      errorCount: this.jobErrors.length
    };
  }

  // 🔧 緊急停止
  async emergencyStopAll(reason = '手動停止') {
    logger.warn(`🚨 緊急停止実行: ${reason}`);
    
    try {
      // 環境変数設定
      process.env.DISABLE_AUTO_DIALER = 'true';
      
      // ジョブ停止
      this.dialerJobRunning = false;
      this.autoDialerEnabled = false;
      
      // 全キャンペーンを停止
      for (const [campaignId] of this.activeCampaigns.entries()) {
        await this.pauseCampaign(campaignId);
      }
      
      logger.warn('🚨 緊急停止完了');
      return true;
      
    } catch (error) {
      logger.error('緊急停止エラー:', error);
      return false;
    }
  }
}

// シングルトンインスタンス
const dialerService = new DialerService();
module.exports = dialerService;
