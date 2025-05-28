// backend/src/services/dialerService.js - 恒久的修正版
const db = require('./database');
const logger = require('./logger');

class DialerService {
  constructor() {
    this.activeCampaigns = new Map();
    this.activeCalls = new Map();
    this.initialized = false;
    this.dialerJobRunning = false;
    this.intervalId = null; // ← 追加: interval管理
    this.lastJobExecution = null;
    this.jobExecutionCount = 0;
    this.jobErrors = [];
    this.maxConsecutiveErrors = 5; // ← 追加: エラー上限
    this.defaultDialInterval = 5000; // ← 修正: 5秒間隔（負荷軽減）
    this.maxRetryAttempts = 3;
    this.dialingInProgress = false;
  }

  // 🚀 修正版初期化
  async initialize() {
    if (this.initialized) {
      logger.info('発信サービスは既に初期化されています');
      return true;
    }
    
    try {
      logger.info('発信サービスの初期化を開始します');
      
      // ✅ 修正: タイムアウト付きクエリ
      const queryPromise = db.query(`
        SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id, 
               ci.number as caller_id_number
        FROM campaigns c
        JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.status = 'active' AND ci.active = true
        LIMIT 5
      `);
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('初期化クエリタイムアウト')), 10000)
      );
      
      const [activeCampaigns] = await Promise.race([queryPromise, timeoutPromise]);
      
      logger.info(`${activeCampaigns.length}件のアクティブキャンペーンを復元`);
      
      // キャンペーン復元
      for (const campaign of activeCampaigns) {
        this.activeCampaigns.set(campaign.id, {
          id: campaign.id,
          name: campaign.name,
          maxConcurrentCalls: campaign.max_concurrent_calls || 3, // ← 修正: デフォルト3に削減
          callerIdId: campaign.caller_id_id,
          callerIdNumber: campaign.caller_id_number,
          activeCalls: 0,
          status: 'active',
          lastDialTime: null,
          errorCount: 0 // ← 追加: エラーカウント
        });
      }
      
      // ✅ 修正: 条件付きで自動発信ジョブ開始
      if (this.activeCampaigns.size > 0) {
        this.startDialerJob();
      } else {
        logger.info('アクティブキャンペーンがないため、自動発信ジョブは開始しません');
      }
      
      this.initialized = true;
      logger.info('発信サービスの初期化が完了しました');
      return true;
    } catch (error) {
      logger.error('発信サービスの初期化エラー:', error);
      this.initialized = true; // エラーでも初期化完了として処理継続
      return false;
    }
  }

  // 🔄 修正版自動発信ジョブ開始
  startDialerJob() {
    if (this.dialerJobRunning) {
      logger.info('発信ジョブは既に実行中です');
      return;
    }
    
    this.dialerJobRunning = true;
    this.jobErrors = []; // エラーリセット
    
    // ✅ 修正: 管理可能なsetInterval
    this.intervalId = setInterval(async () => {
      // 条件チェック: アクティブキャンペーンがない場合は停止
      if (this.activeCampaigns.size === 0) {
        logger.info('アクティブキャンペーンがないため発信ジョブを停止します');
        this.stopDialerJob();
        return;
      }
      
      // 前回の処理が完了していない場合はスキップ
      if (this.dialingInProgress) {
        logger.debug('前回の発信処理が継続中のため、今回はスキップします');
        return;
      }
      
      try {
        this.dialingInProgress = true;
        await this.processDialerQueueSafe();
        this.lastJobExecution = new Date();
        this.jobExecutionCount++;
        
        // 連続エラーカウントをリセット
        this.jobErrors = this.jobErrors.filter(err => 
          (new Date() - err.timestamp) < 300000 // 5分以内のエラーのみ保持
        );
        
      } catch (error) {
        logger.error('発信ジョブエラー:', error);
        this.jobErrors.push({
          timestamp: new Date(),
          error: error.message
        });
        
        // ✅ 修正: 連続エラー時の自動停止
        if (this.jobErrors.length >= this.maxConsecutiveErrors) {
          logger.error(`連続エラー${this.maxConsecutiveErrors}回に達したため発信ジョブを停止します`);
          this.stopDialerJob();
        }
      } finally {
        this.dialingInProgress = false;
      }
    }, this.defaultDialInterval);
    
    logger.info(`🔥 自動発信ジョブを開始しました（間隔: ${this.defaultDialInterval}ms）`);
  }

  // 🛑 発信ジョブ停止
  stopDialerJob() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.dialerJobRunning = false;
    this.dialingInProgress = false;
    logger.info('🛑 自動発信ジョブを停止しました');
  }

  // 🔄 修正版発信キュー処理（安全版）
  async processDialerQueueSafe() {
    try {
      if (this.activeCampaigns.size === 0) {
        return;
      }
      
      let totalProcessed = 0;
      
      // 各アクティブキャンペーンを処理
      for (const [campaignId, campaign] of this.activeCampaigns.entries()) {
        if (campaign.status !== 'active') {
          continue;
        }
        
        // ✅ 修正: 最大同時発信数チェック
        const availableSlots = Math.max(0, campaign.maxConcurrentCalls - campaign.activeCalls);
        if (availableSlots <= 0) {
          logger.debug(`キャンペーン${campaignId}: 発信スロットなし（${campaign.activeCalls}/${campaign.maxConcurrentCalls}）`);
          continue;
        }
        
        try {
          // ✅ 修正: タイムアウト付きクエリ
          const contactsPromise = db.query(`
            SELECT id, phone, name, company 
            FROM contacts 
            WHERE campaign_id = ? AND status = 'pending' 
            LIMIT ?
          `, [campaignId, Math.min(availableSlots, 2)]); // ← 修正: 最大2件に制限
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('連絡先クエリタイムアウト')), 5000)
          );
          
          const [contacts] = await Promise.race([contactsPromise, timeoutPromise]);
          
          if (!contacts || contacts.length === 0) {
            logger.debug(`キャンペーン${campaignId}: 発信対象の連絡先なし`);
            
            // ✅ 修正: 連絡先がない場合の処理
            await this.checkCampaignCompletion(campaignId);
            continue;
          }
          
          logger.info(`キャンペーン${campaignId}: ${contacts.length}件の連絡先を処理開始`);
          
          // 各連絡先に発信
          for (const contact of contacts) {
            try {
              const result = await this.dialContactSafe(campaign, contact);
              if (result) {
                campaign.activeCalls++;
                totalProcessed++;
              }
              
              // ✅ 修正: 発信間隔を設ける
              await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
              
            } catch (contactError) {
              logger.warn(`連絡先${contact.phone}の発信エラー:`, contactError.message);
            }
          }
          
          // 進捗率を更新
          await this.updateCampaignProgressSafe(campaignId);
          
        } catch (campaignError) {
          logger.warn(`キャンペーン${campaignId}処理エラー:`, campaignError.message);
          campaign.errorCount = (campaign.errorCount || 0) + 1;
          
          // ✅ 修正: エラー多発時はキャンペーンを一時停止
          if (campaign.errorCount >= 5) {
            logger.error(`キャンペーン${campaignId}でエラー多発のため一時停止します`);
            await this.pauseCampaign(campaignId);
          }
        }
      }
      
      if (totalProcessed > 0) {
        logger.info(`発信処理完了: ${totalProcessed}件の発信を実行`);
      }
      
    } catch (error) {
      logger.error('発信キュー処理エラー:', error);
      throw error; // 上位でキャッチされ、エラーカウントが増加
    }
  }

  // 📞 修正版発信処理（安全版）
  async dialContactSafe(campaign, contact) {
    try {
      logger.info(`📞 発信準備: ${contact.phone}`);
      
      // 発信中ステータスに更新
      await db.query(
        'UPDATE contacts SET status = ?, last_attempt = NOW(), attempt_count = attempt_count + 1 WHERE id = ?',
        ['called', contact.id]
      );
      
      // ✅ 修正: 実際の発信処理は別サービスに委譲
      // 循環依存を避けるため、ここでは発信準備のみ実行
      
      // 通話ログを記録
      const callId = `dialer-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      await db.query(`
        INSERT INTO call_logs 
        (contact_id, campaign_id, caller_id_id, call_id, start_time, status, call_provider)
        VALUES (?, ?, ?, ?, NOW(), 'prepared', 'dialer')
      `, [
        contact.id, 
        campaign.id, 
        campaign.callerIdId, 
        callId
      ]);
      
      // アクティブコール管理
      this.activeCalls.set(callId, {
        id: callId,
        contactId: contact.id,
        campaignId: campaign.id,
        startTime: new Date(),
        status: 'prepared'
      });
      
      logger.info(`✅ 発信準備完了: ${contact.phone}, CallID=${callId}`);
      return true;
      
    } catch (error) {
      logger.error(`❌ 発信準備エラー: ${contact.phone}`, error);
      
      // エラー状態に更新
      try {
        await db.query(
          'UPDATE contacts SET status = ?, notes = ? WHERE id = ?',
          ['failed', `発信エラー: ${error.message}`, contact.id]
        );
      } catch (updateError) {
        logger.error('連絡先ステータス更新エラー:', updateError);
      }
      
      return false;
    }
  }

  // 📊 修正版進捗更新（安全版）
  async updateCampaignProgressSafe(campaignId) {
    try {
      const queryPromise = (async () => {
        const [totalResult] = await db.query(
          'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ?',
          [campaignId]
        );
        
        const [completedResult] = await db.query(
          'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status IN ("completed", "dnc", "failed")',
          [campaignId]
        );
        
        const total = totalResult[0].count;
        const completed = completedResult[0].count;
        const progress = total > 0 ? Math.floor((completed / total) * 100) : 0;
        
        await db.query(
          'UPDATE campaigns SET progress = ?, updated_at = NOW() WHERE id = ?',
          [progress, campaignId]
        );
        
        return { total, completed, progress };
      })();
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('進捗更新タイムアウト')), 3000)
      );
      
      const result = await Promise.race([queryPromise, timeoutPromise]);
      
      // キャンペーン完了チェック
      if (result.total > 0 && result.completed >= result.total) {
        await this.completeCampaign(campaignId);
      }
      
      return result.progress;
    } catch (error) {
      logger.warn(`キャンペーン進捗更新エラー: ${campaignId}`, error.message);
      return null;
    }
  }

  // 🔍 キャンペーン完了チェック
  async checkCampaignCompletion(campaignId) {
    try {
      const [pendingResult] = await db.query(
        'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = "pending"',
        [campaignId]
      );
      
      if (pendingResult[0].count === 0) {
        logger.info(`キャンペーン${campaignId}: 発信対象なし、完了チェック実行`);
        await this.completeCampaign(campaignId);
      }
    } catch (error) {
      logger.warn(`キャンペーン完了チェックエラー: ${campaignId}`, error.message);
    }
  }

  // 🏁 キャンペーン完了
  async completeCampaign(campaignId) {
    try {
      await db.query(
        'UPDATE campaigns SET status = ?, updated_at = NOW() WHERE id = ?',
        ['completed', campaignId]
      );
      
      // アクティブキャンペーンから削除
      this.activeCampaigns.delete(campaignId);
      
      logger.info(`🏁 キャンペーン完了: ${campaignId}`);
      
      // アクティブキャンペーンがなくなった場合はジョブ停止
      if (this.activeCampaigns.size === 0) {
        this.stopDialerJob();
      }
      
      return true;
    } catch (error) {
      logger.error(`キャンペーン完了エラー: ${campaignId}`, error);
      return false;
    }
  }

  // 🚀 キャンペーン開始
  async startCampaign(campaignId) {
    try {
      logger.info(`🚀 キャンペーン開始: ID=${campaignId}`);
      
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
        'UPDATE campaigns SET status = ?, updated_at = NOW() WHERE id = ?',
        ['active', campaignId]
      );
      
      // アクティブキャンペーンリストに追加
      this.activeCampaigns.set(campaignId, {
        id: campaign.id,
        name: campaign.name,
        maxConcurrentCalls: Math.min(campaign.max_concurrent_calls || 3, 5), // 最大5件に制限
        callerIdId: campaign.caller_id_id,
        callerIdNumber: campaign.caller_id_number,
        activeCalls: 0,
        status: 'active',
        lastDialTime: new Date(),
        errorCount: 0
      });
      
      // 発信ジョブが停止している場合は再開
      if (!this.dialerJobRunning) {
        this.startDialerJob();
      }
      
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
        'UPDATE campaigns SET status = ?, updated_at = NOW() WHERE id = ?',
        ['paused', campaignId]
      );
      
      if (this.activeCampaigns.has(campaignId)) {
        this.activeCampaigns.delete(campaignId);
      }
      
      // アクティブキャンペーンがなくなった場合はジョブ停止
      if (this.activeCampaigns.size === 0) {
        this.stopDialerJob();
      }
      
      logger.info(`🛑 キャンペーン停止: ID=${campaignId}`);
      return true;
    } catch (error) {
      logger.error(`キャンペーン停止エラー: ID=${campaignId}`, error);
      return false;
    }
  }

  // 📞 通話終了処理
  async handleCallEnd(callId, duration, disposition, keypress) {
    try {
      logger.info(`📞 通話終了: ${callId}, disposition=${disposition}, keypress=${keypress}`);
      
      // 通話ログの更新
      await db.query(`
        UPDATE call_logs
        SET end_time = NOW(), duration = ?, status = ?, keypress = ?
        WHERE call_id = ?
      `, [duration, disposition, keypress, callId]);
      
      // アクティブコールから削除
      if (this.activeCalls.has(callId)) {
        const call = this.activeCalls.get(callId);
        
        // キャンペーンの同時通話数を減らす
        if (this.activeCampaigns.has(call.campaignId)) {
          const campaign = this.activeCampaigns.get(call.campaignId);
          campaign.activeCalls = Math.max(0, campaign.activeCalls - 1);
        }
        
        this.activeCalls.delete(callId);
      }
      
      logger.info(`✅ 通話終了処理完了: ${callId}`);
      return true;
    } catch (error) {
      logger.error(`❌ 通話終了処理エラー: ${callId}`, error);
      return false;
    }
  }

  // 🔍 ヘルスステータス取得
  getHealthStatus() {
    return {
      timestamp: new Date().toISOString(),
      initialized: this.initialized,
      dialerJobRunning: this.dialerJobRunning,
      dialingInProgress: this.dialingInProgress,
      lastJobExecution: this.lastJobExecution,
      jobExecutionCount: this.jobExecutionCount,
      recentErrors: this.jobErrors.slice(-3), // 最新3件のエラー
      activeCampaigns: {
        count: this.activeCampaigns.size,
        details: Array.from(this.activeCampaigns.entries()).map(([id, campaign]) => ({
          id: id,
          name: campaign.name,
          status: campaign.status,
          activeCalls: campaign.activeCalls,
          maxConcurrentCalls: campaign.maxConcurrentCalls,
          errorCount: campaign.errorCount || 0
        }))
      },
      activeCalls: {
        count: this.activeCalls.size
      },
      settings: {
        dialInterval: this.defaultDialInterval,
        maxConsecutiveErrors: this.maxConsecutiveErrors,
        maxRetryAttempts: this.maxRetryAttempts
      }
    };
  }

  // 🚨 緊急停止
  async emergencyStopAll(reason = '手動停止') {
    logger.warn(`🚨 緊急停止実行: ${reason}`);
    
    try {
      // 発信ジョブ停止
      this.stopDialerJob();
      
      // 全キャンペーンを停止
      const stoppedCampaigns = [];
      for (const campaignId of this.activeCampaigns.keys()) {
        const success = await this.pauseCampaign(campaignId);
        if (success) {
          stoppedCampaigns.push(campaignId);
        }
      }
      
      logger.warn(`🚨 緊急停止完了: ${stoppedCampaigns.length}キャンペーン停止`);
      return {
        success: true,
        stoppedCampaigns: stoppedCampaigns.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('緊急停止処理エラー:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // デストラクタ
  destroy() {
    this.stopDialerJob();
    this.activeCampaigns.clear();
    this.activeCalls.clear();
    logger.info('DialerService destroyed');
  }
}

// シングルトンインスタンス
const dialerService = new DialerService();

// プロセス終了時のクリーンアップ
process.on('SIGINT', () => {
  dialerService.destroy();
});

process.on('SIGTERM', () => {
  dialerService.destroy();
});

module.exports = dialerService;
