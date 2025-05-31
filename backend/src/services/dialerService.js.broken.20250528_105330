// backend/src/services/dialerService.js - 修正版
const db = require('./database');
const asterisk = require('./asterisk');
const logger = require('./logger');
const callService = require('./callService');
const audioService = require('./audioService');

class DialerService {
  constructor() {
    this.activeCampaigns = new Map();
    this.activeCalls = new Map();
    this.initialized = false;
    this.dialerJobRunning = false;
    this.lastJobExecution = null;
    this.jobExecutionCount = 0;
    this.jobErrors = [];
    this.defaultDialInterval = 3000; // 3秒間隔
    this.maxRetryAttempts = 3;
    this.dialingInProgress = false; // 発信処理の重複防止
  }

  // 🚀 初期化（自動発信開始）
  async initialize() {
    if (this.initialized) {
      logger.info('発信サービスは既に初期化されています');
      return;
    }
    
    try {
      logger.info('発信サービスの初期化を開始します');
      
      // アクティブなキャンペーンを復元
      const [activeCampaigns] = await db.query(`
        SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id, 
               ci.number as caller_id_number
        FROM campaigns c
        JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.status = 'active' AND ci.active = true
      `);
      
      logger.info(`${activeCampaigns.length}件のアクティブキャンペーンを復元`);
      
      for (const campaign of activeCampaigns) {
        this.activeCampaigns.set(campaign.id, {
          id: campaign.id,
          name: campaign.name,
          maxConcurrentCalls: campaign.max_concurrent_calls || 5,
          callerIdId: campaign.caller_id_id,
          callerIdNumber: campaign.caller_id_number,
          activeCalls: 0,
          status: 'active',
          lastDialTime: null
        });
      }
      
      // 🔥 自動発信ジョブを開始
      this.startDialerJob();
      
      this.initialized = true;
      logger.info('発信サービスの初期化が完了しました');
      return true;
    } catch (error) {
      logger.error('発信サービスの初期化エラー:', error);
      throw error;
    }
  }

  // 🔄 自動発信ジョブ開始
  startDialerJob() {
    if (this.dialerJobRunning) {
      logger.info('発信ジョブは既に実行中です');
      return;
    }
    
    this.dialerJobRunning = true;
    
    // 3秒ごとに発信処理を実行
    setInterval(() => {
      this.processDialerQueue();
    }, 3000);
    
    logger.info('🔥 自動発信ジョブを開始しました');
  }

  // 🚀 キャンペーン開始
  async startCampaign(campaignId) {
    try {
      logger.info(`🚀 キャンペーン開始: ID=${campaignId}`);
      
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
        maxConcurrentCalls: campaign.max_concurrent_calls || 5,
        callerIdId: campaign.caller_id_id,
        callerIdNumber: campaign.caller_id_number,
        activeCalls: 0,
        status: 'active',
        lastDialTime: new Date()
      });
      
      logger.info(`✅ キャンペーン開始成功: ${campaign.name}`);
      return true;
    } catch (error) {
      logger.error(`❌ キャンペーン開始エラー: ${error.message}`);
      return false;
    }
  }

  // 🛑 キャンペーン停止
  async pauseCampaign(campaignId) {
    try {
      await db.query(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['paused', campaignId]
      );
      
      if (this.activeCampaigns.has(campaignId)) {
        const campaign = this.activeCampaigns.get(campaignId);
        campaign.status = 'paused';
        this.activeCampaigns.set(campaignId, campaign);
      }
      
      logger.info(`🛑 キャンペーン停止: ID=${campaignId}`);
      return true;
    } catch (error) {
      logger.error(`キャンペーン停止エラー: ID=${campaignId}`, error);
      return false;
    }
  }

  // 🔄 発信キュー処理（改良版）
  async processDialerQueue() {
    try {
      if (this.activeCampaigns.size === 0) {
        return;
      }
      
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
        
        // 発信待ち連絡先を取得
        const [contacts] = await db.query(`
          SELECT id, phone, name, company 
          FROM contacts 
          WHERE campaign_id = ? AND status = 'pending' 
          LIMIT ?
        `, [campaignId, availableSlots]);
        
        // 各連絡先に発信
        for (const contact of contacts) {
          const result = await this.dialContact(campaign, contact);
          if (result) {
            campaign.activeCalls++;
          }
        }
        
        // 進捗率を更新
        await this.updateCampaignProgress(campaignId);
      }
    } catch (error) {
      logger.error('発信キュー処理エラー:', error);
    }
  }

  // 📞 連絡先への発信
  async dialContact(campaign, contact) {
    try {
      logger.info(`📞 発信開始: ${contact.phone}`);
      
      // 発信中ステータスに更新
      await db.query(
        'UPDATE contacts SET status = ? WHERE id = ?',
        ['called', contact.id]
      );
      
      // 🎵 キャンペーンの音声ファイルを取得
      let campaignAudio = null;
      try {
        campaignAudio = await audioService.getCampaignAudio(campaign.id);
        logger.info(`音声ファイル取得: ${campaignAudio ? campaignAudio.length : 0}件`);
      } catch (audioError) {
        logger.warn('音声ファイル取得エラー:', audioError.message);
      }
      
      // 発信パラメータの準備
      const params = {
        phoneNumber: contact.phone,
        context: 'autodialer',
        exten: 's',
        priority: 1,
        callerID: `"${campaign.name}" <${campaign.callerIdNumber}>`,
        callerIdData: { id: campaign.callerIdId },
        variables: {
          CAMPAIGN_ID: campaign.id,
          CONTACT_ID: contact.id,
          CONTACT_NAME: contact.name || '',
          COMPANY: contact.company || '',
          AUTO_DIAL: 'true'
        },
        campaignAudio: campaignAudio
      };
      
      // 発信実行
      const result = await callService.originate(params);
      
      // 通話ログを記録
      await db.query(`
        INSERT INTO call_logs 
        (contact_id, campaign_id, caller_id_id, call_id, start_time, status, call_provider, has_audio)
        VALUES (?, ?, ?, ?, NOW(), 'active', ?, ?)
      `, [
        contact.id, 
        campaign.id, 
        campaign.callerIdId, 
        result.ActionID, 
        result.provider || 'unknown',
        campaignAudio && campaignAudio.length > 0 ? 1 : 0
      ]);
      
      // アクティブコール管理
      const callId = result.ActionID;
      this.activeCalls.set(callId, {
        id: callId,
        contactId: contact.id,
        campaignId: campaign.id,
        startTime: new Date(),
        status: 'active'
      });
      
      logger.info(`✅ 発信成功: ${contact.phone}, CallID=${callId}`);
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

  // 📞 通話終了処理（強化版）
  async handleCallEnd(callId, duration, disposition, keypress) {
    try {
      logger.info(`📞 通話終了: ${callId}, disposition=${disposition}, keypress=${keypress}`);
      
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
      
      // 🎯 キー入力に応じた処理
      let contactStatus = 'completed';
      
      if (keypress === '1') {
        // オペレーター転送要求
        contactStatus = 'operator_requested';
        await this.handleOperatorTransfer(callId, call);
        logger.info(`🎯 オペレーター転送要求: ${callId}`);
      } else if (keypress === '9') {
        // DNC登録要求
        contactStatus = 'dnc';
        await this.handleDncRequest(callId, call);
        logger.info(`🚫 DNC登録要求: ${callId}`);
      }
      
      // 連絡先ステータス更新
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
      
      logger.info(`✅ 通話終了処理完了: ${callId}`);
      return true;
    } catch (error) {
      logger.error(`❌ 通話終了処理エラー: ${callId}`, error);
      return false;
    }
  }

  // 🎯 オペレーター転送処理
  async handleOperatorTransfer(callId, call) {
    try {
      // 連絡先情報を取得
      const [contact] = await db.query(
        'SELECT phone FROM contacts WHERE id = ?',
        [call.contactId]
      );
      
      if (contact && contact.length > 0) {
        logger.info(`🎯 オペレーター転送要求を記録: ${contact[0].phone}`);
        
        // 将来: オペレーターキューに追加、通知送信など
        // await operatorQueueService.addToQueue(call);
      }
      
      return true;
    } catch (error) {
      logger.error(`オペレーター転送処理エラー: ${callId}`, error);
      return false;
    }
  }

  // 🚫 DNC登録処理
  async handleDncRequest(callId, call) {
    try {
      // 連絡先の電話番号を取得
      const [contact] = await db.query(
        'SELECT phone FROM contacts WHERE id = ?',
        [call.contactId]
      );
      
      if (contact && contact.length > 0) {
        const phoneNumber = contact[0].phone;
        
        // DNCリストに追加
        await db.query(
          'INSERT IGNORE INTO dnc_list (phone, reason) VALUES (?, ?)',
          [phoneNumber, 'ユーザーリクエスト（キーパッド入力9）']
        );
        
        logger.info(`🚫 DNC登録完了: ${phoneNumber}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`DNC登録処理エラー: ${callId}`, error);
      return false;
    }
  }

  // 📊 キャンペーン進捗更新
  async updateCampaignProgress(campaignId) {
    try {
      // 全連絡先数
      const [totalResult] = await db.query(
        'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ?',
        [campaignId]
      );
      
      // 完了した連絡先数
      const [completedResult] = await db.query(
        'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status IN ("completed", "dnc", "operator_requested")',
        [campaignId]
      );
      
      const total = totalResult[0].count;
      const completed = completedResult[0].count;
      
      // 進捗率を計算
      const progress = total > 0 ? Math.floor((completed / total) * 100) : 0;
      
      // キャンペーン情報を更新
      await db.query(
        'UPDATE campaigns SET progress = ? WHERE id = ?',
        [progress, campaignId]
      );
      
      // キャンペーンが完了したかチェック
      if (total > 0 && completed >= total) {
        await this.completeCampaign(campaignId);
      }
      
      return progress;
    } catch (error) {
      logger.error(`キャンペーン進捗更新エラー: ${campaignId}`, error);
      return null;
    }
  }

  // 🏁 キャンペーン完了
  async completeCampaign(campaignId) {
    try {
      await db.query(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['completed', campaignId]
      );
      
      // アクティブキャンペーンから削除
      this.activeCampaigns.delete(campaignId);
      
      logger.info(`🏁 キャンペーン完了: ${campaignId}`);
      return true;
    } catch (error) {
      logger.error(`キャンペーン完了エラー: ${campaignId}`, error);
      return false;
    }
  }

  // 📊 キャンペーンステータス取得
  getCampaignStatus(campaignId) {
    const campaign = this.activeCampaigns.get(campaignId);
    if (!campaign) {
      return null;
    }
    
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      activeCalls: campaign.activeCalls,
      maxConcurrentCalls: campaign.maxConcurrentCalls,
      lastDialTime: campaign.lastDialTime
    };
  }

  // 🔍 ヘルスステータス取得
  getHealthStatus() {
    const now = new Date();
    
    const healthData = {
      timestamp: now.toISOString(),
      initialized: this.initialized,
      dialerJobRunning: this.dialerJobRunning,
      activeCampaigns: {
        count: this.activeCampaigns.size,
        details: Array.from(this.activeCampaigns.entries()).map(([id, campaign]) => ({
          id: id,
          name: campaign.name,
          status: campaign.status,
          activeCalls: campaign.activeCalls,
          maxConcurrentCalls: campaign.maxConcurrentCalls,
          lastDialTime: campaign.lastDialTime
        }))
      },
      activeCalls: {
        count: this.activeCalls.size,
        details: Array.from(this.activeCalls.entries()).map(([callId, call]) => ({
          callId: callId,
          contactId: call.contactId,
          campaignId: call.campaignId,
          startTime: call.startTime,
          status: call.status,
          duration: Math.floor((now - new Date(call.startTime)) / 1000)
        }))
      },
      systemHealth: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        nodeVersion: process.version
      }
    };

    return healthData;
  }

  // 🔧 自動発信ジョブの動作状況確認
  getDialerJobStatus() {
    const jobStatus = {
      isRunning: this.dialerJobRunning,
      lastExecutionTime: this.lastJobExecution || null,
      totalExecutions: this.jobExecutionCount || 0,
      errors: this.jobErrors || []
    };

    return jobStatus;
  }

  // 🔄 発信ジョブの強制実行（デバッグ用）
  async executeDialerJobManually() {
    logger.info('🔧 手動発信ジョブ実行開始');
    
    try {
      const startTime = new Date();
      await this.processDialerQueue();
      const endTime = new Date();
      const duration = endTime - startTime;
      
      logger.info(`✅ 手動発信ジョブ完了: 実行時間=${duration}ms`);
      
      return {
        success: true,
        executionTime: duration,
        timestamp: startTime.toISOString(),
        activeCampaigns: this.activeCampaigns.size,
        activeCalls: this.activeCalls.size
      };
    } catch (error) {
      logger.error('❌ 手動発信ジョブエラー:', error);
      throw error;
    }
  }

  // 🚨 緊急停止機能の強化
  async emergencyStopAll(reason = '手動停止') {
    logger.warn(`🚨 緊急停止実行: ${reason}`);
    
    const stopResults = {
      timestamp: new Date().toISOString(),
      reason: reason,
      stoppedCampaigns: [],
      terminatedCalls: [],
      errors: []
    };
    
    try {
      // 1. 全キャンペーンを停止
      for (const [campaignId, campaign] of this.activeCampaigns.entries()) {
        try {
          await this.pauseCampaign(campaignId);
          stopResults.stoppedCampaigns.push({
            id: campaignId,
            name: campaign.name,
            activeCalls: campaign.activeCalls
          });
        } catch (error) {
          stopResults.errors.push({
            type: 'campaign_stop',
            campaignId: campaignId,
            error: error.message
          });
        }
      }
      
      // 2. アクティブな通話を記録
      for (const [callId, call] of this.activeCalls.entries()) {
        stopResults.terminatedCalls.push({
          callId: callId,
          campaignId: call.campaignId,
          contactId: call.contactId,
          duration: Math.floor((new Date() - new Date(call.startTime)) / 1000)
        });
      }
      
      // 3. 発信ジョブ停止
      this.dialerJobRunning = false;
      
      logger.warn(`🚨 緊急停止完了: ${stopResults.stoppedCampaigns.length}キャンペーン, ${stopResults.terminatedCalls.length}通話`);
      
      return stopResults;
    } catch (error) {
      logger.error('緊急停止処理エラー:', error);
      stopResults.errors.push({
        type: 'system_error',
        error: error.message
      });
      return stopResults;
    }
  }
}

// シングルトンインスタンス
const dialerService = new DialerService();
module.exports = dialerService;
