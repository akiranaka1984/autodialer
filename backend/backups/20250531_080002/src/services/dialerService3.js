// backend/src/services/dialerService.js - ホットフィックス版（既存機能保持）
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
    this.healthCheckIntervalId = null;
    
    // 🔧 安定化設定（既存のまま）
    this.dialInterval = 8000; // 8秒間隔（負荷軽減）
    this.campaignCheckInterval = 15000; // 15秒ごとにキャンペーン状態チェック
    this.healthCheckInterval = 30000; // 30秒ごとにヘルスチェック
    this.enabled = process.env.DISABLE_AUTO_DIALER !== 'true';
    this.initialized = false;
    this.initializationRetryCount = 0;
    this.maxInitializationRetries = 5;
    this.lastActivityTime = new Date();
    this.systemStatus = 'initializing';
    
    // 🆕 追加: 発信診断用の統計
    this.dialStats = {
      totalAttempts: 0,
      successfulCalls: 0,
      failedCalls: 0,
      lastError: null,
      lastSuccessTime: null,
      consecutiveFailures: 0
    };
    
    logger.info(`🚀 DialerService初期化: 自動連動システム=${this.enabled ? '有効' : '無効'}`);
    
    // 🔥 確実な自動開始（リトライ機能付き）
    if (this.enabled) {
      this.startAutoSystemWithRetry();
    }
  }

  // 🎯 リトライ機能付き自動システム開始（既存のまま）
  async startAutoSystemWithRetry() {
    try {
      logger.info(`🎯 自動システム開始試行 ${this.initializationRetryCount + 1}/${this.maxInitializationRetries}`);
      
      await this.startAutoSystem();
      this.initialized = true;
      this.systemStatus = 'running';
      this.initializationRetryCount = 0;
      
      logger.info('✅ DialerService自動システム起動完了 - 安定版');
      
    } catch (error) {
      this.initializationRetryCount++;
      this.systemStatus = 'error';
      
      logger.error(`❌ 自動システム開始エラー (試行${this.initializationRetryCount}/${this.maxInitializationRetries}):`, error);
      
      if (this.initializationRetryCount < this.maxInitializationRetries) {
        const retryDelay = Math.min(5000 * this.initializationRetryCount, 30000); // 指数バックオフ（最大30秒）
        
        logger.info(`🔄 ${retryDelay}ms後に自動システム再試行...`);
        
        setTimeout(() => {
          this.startAutoSystemWithRetry();
        }, retryDelay);
      } else {
        logger.error('❌ DialerService自動システム開始の最大試行回数に達しました');
        this.systemStatus = 'failed';
        
        // 緊急フォールバック: 基本機能のみ有効化
        this.enableEmergencyMode();
      }
    }
  }

  // 🚨 緊急モード（基本機能のみ）（既存のまま）
  enableEmergencyMode() {
    logger.warn('🚨 DialerService緊急モード開始');
    
    this.enabled = true;
    this.initialized = true;
    this.systemStatus = 'emergency';
    
    // 最小限の機能のみ開始
    this.startBasicDialer();
    this.startBasicHealthCheck();
    
    logger.warn('⚠️ 緊急モードで動作中 - 監視機能は制限されます');
  }

  // 🎯 完全自動システム開始（既存のまま）
  async startAutoSystem() {
    try {
      logger.info('🎯 完全自動連動システム開始...');
      
      // 1. データベース接続確認
      await this.verifyDatabaseConnection();
      
      // 2. 初期キャンペーンロード
      await this.loadActiveCampaigns();
      
      // 3. システムヘルスチェック開始
      this.startHealthCheck();
      
      // 4. キャンペーン監視開始（データベース変更を自動検知）
      this.startCampaignWatcher();
      
      // 5. 自動発信システム開始
      this.startAutoDialer();
      
      logger.info('✅ 完全自動連動システム起動完了');
      
    } catch (error) {
      logger.error('❌ 自動システム開始エラー:', error);
      throw error; // リトライ機能で処理
    }
  }

  // 🔍 データベース接続確認（既存のまま）
  async verifyDatabaseConnection() {
    try {
      await db.query('SELECT 1 as test');
      logger.info('✅ データベース接続確認完了');
      return true;
    } catch (error) {
      logger.error('❌ データベース接続エラー:', error);
      throw new Error('データベース接続に失敗しました');
    }
  }

  // 💗 システムヘルスチェック開始（既存のまま）
  startHealthCheck() {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
    }
    
    this.healthCheckIntervalId = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('ヘルスチェックエラー:', error);
        this.handleHealthCheckFailure();
      }
    }, this.healthCheckInterval);
    
    logger.info(`💗 ヘルスチェック開始: ${this.healthCheckInterval}ms間隔`);
  }

  // 🔍 ヘルスチェック実行（既存のまま）
  async performHealthCheck() {
    const now = new Date();
    
    // データベース接続確認
    try {
      await db.query('SELECT 1');
    } catch (dbError) {
      throw new Error('データベース接続失敗');
    }
    
    // アクティビティ確認（60秒以内に処理があったか）
    const timeSinceLastActivity = now - this.lastActivityTime;
    if (timeSinceLastActivity > 60000 && this.activeCampaigns.size > 0) {
      logger.warn(`⚠️ システムアクティビティなし: ${Math.round(timeSinceLastActivity / 1000)}秒`);
    }
    
    // システム状態ログ
    logger.debug(`💗 ヘルスチェック正常: Campaigns=${this.activeCampaigns.size}, Calls=${this.activeCalls.size}, Status=${this.systemStatus}`);
    
    this.lastActivityTime = now;
  }

  // 🚨 ヘルスチェック失敗時処理（既存のまま）
  handleHealthCheckFailure() {
    logger.error('🚨 ヘルスチェック失敗 - システム復旧試行');
    
    // 自動復旧試行
    setTimeout(() => {
      if (!this.initialized || this.systemStatus === 'error') {
        logger.info('🔄 システム自動復旧試行...');
        this.startAutoSystemWithRetry();
      }
    }, 5000);
  }

  // 👁️ キャンペーン監視開始（既存のまま）
  startCampaignWatcher() {
    if (this.campaignWatcherIntervalId) {
      clearInterval(this.campaignWatcherIntervalId);
    }
    
    this.campaignWatcherIntervalId = setInterval(async () => {
      try {
        await this.checkCampaignChanges();
        this.lastActivityTime = new Date(); // アクティビティ記録
      } catch (error) {
        logger.error('キャンペーン監視エラー:', error);
      }
    }, this.campaignCheckInterval);
    
    logger.info(`👁️ キャンペーン監視開始: ${this.campaignCheckInterval}ms間隔`);
  }

  // 🔍 キャンペーン変更チェック（既存のまま）
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
      throw error;
    }
  }

  // 📋 初期キャンペーンロード（既存のまま）
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
      
      logger.info(`✅ 初期キャンペーンロード完了: ${this.activeCampaigns.size}件をアクティブ化`);
      
    } catch (error) {
      logger.error('初期キャンペーンロードエラー:', error);
      throw error;
    }
  }

  // 🚀 自動発信システム開始（既存のまま）
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
        this.lastActivityTime = new Date(); // アクティビティ記録
      } catch (error) {
        logger.error('自動発信エラー:', error);
      }
    }, this.dialInterval);
    
    logger.info(`🚀 自動発信システム開始: ${this.dialInterval}ms間隔`);
  }

  // 📞 自動発信処理（🆕 診断ログ強化版）
  async processAutoDialing() {
    if (this.isProcessing) {
      logger.debug('📞 前回の発信処理がまだ実行中 - スキップ');
      return;
    }
    
    this.isProcessing = true;
    
    try {
      let totalProcessed = 0;
      
      // 🆕 SIPサービス状態確認
      await this.verifySipServiceStatus();
      
      for (const [campaignId, campaign] of this.activeCampaigns.entries()) {
        if (campaign.status !== 'active') {
          logger.debug(`⏭️ キャンペーン ${campaignId} はアクティブではありません: ${campaign.status}`);
          continue;
        }
        
        if (campaign.activeCalls >= campaign.maxConcurrentCalls) {
          logger.debug(`⏭️ キャンペーン ${campaignId} は最大同時通話数に達しています: ${campaign.activeCalls}/${campaign.maxConcurrentCalls}`);
          continue;
        }
        
        // 未処理連絡先を1件取得
        const [contacts] = await db.query(`
          SELECT id, phone, name, company, attempt_count
          FROM contacts 
          WHERE campaign_id = ? AND status = 'pending' 
          ORDER BY id ASC
          LIMIT 1
        `, [campaignId]);
        
        if (contacts.length === 0) {
          logger.debug(`📝 キャンペーン ${campaignId} "${campaign.name}" に未処理連絡先がありません`);
          // 未処理連絡先がない場合はキャンペーン完了チェック
          await this.checkCampaignCompletion(campaignId);
          continue;
        }
        
        const contact = contacts[0];
        
        // 🆕 発信前の詳細チェック
        logger.info(`📞 発信準備: ${contact.phone} (Campaign: ${campaign.name}, 試行回数: ${contact.attempt_count || 0})`);
        
        const success = await this.dialContactWithDiagnostics(campaign, contact);
        
        if (success) {
          campaign.activeCalls++;
          campaign.lastDialTime = new Date();
          totalProcessed++;
          
          // 🆕 成功統計更新
          this.dialStats.successfulCalls++;
          this.dialStats.lastSuccessTime = new Date();
          this.dialStats.consecutiveFailures = 0;
          
          // イベント発火
          this.emit('contactDialed', {
            campaignId,
            contactId: contact.id,
            phone: contact.phone
          });
        } else {
          // 🆕 失敗統計更新
          this.dialStats.failedCalls++;
          this.dialStats.consecutiveFailures++;
        }
        
        // 発信間隔（同一キャンペーン内）
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      if (totalProcessed > 0) {
        logger.info(`📞 自動発信処理完了: ${totalProcessed}件処理`);
      }
      
    } catch (error) {
      logger.error('自動発信処理エラー:', error);
      this.dialStats.lastError = error.message;
    } finally {
      this.isProcessing = false;
    }
  }

  // 🆕 SIPサービス状態確認
  async verifySipServiceStatus() {
    try {
      const callService = require('./callService');
      const sipService = require('./sipService');
      
      // SIPサービス接続状態確認
      if (!sipService.connected) {
        logger.warn('⚠️ SIPサービスが切断されています - 再接続試行');
        await sipService.connect();
      }
      
      // 利用可能なSIPアカウント数確認
      const availableAccounts = sipService.getAvailableSipAccountCount();
      if (availableAccounts === 0) {
        logger.error('❌ 利用可能なSIPアカウントがありません');
        throw new Error('SIPアカウントが利用できません');
      }
      
      logger.debug(`✅ SIP状態確認: 接続=${sipService.connected}, アカウント=${availableAccounts}個`);
      
    } catch (error) {
      logger.error('SIPサービス状態確認エラー:', error);
      throw error;
    }
  }

  // 🔥 修正版: 診断機能付き連絡先発信（手動発信と同じパラメータ構造）
  async dialContactWithDiagnostics(campaign, contact) {
    const startTime = new Date();
    this.dialStats.totalAttempts++;
    
    try {
      logger.info(`🔧 発信診断開始: ${contact.phone}`);
      
      // 1. 連絡先ステータス更新（発信前）
      logger.debug('📝 連絡先ステータス更新中...');
      await db.query(
        'UPDATE contacts SET status = ?, last_attempt = NOW(), attempt_count = attempt_count + 1 WHERE id = ?',
        ['called', contact.id]
      );
      logger.debug('✅ 連絡先ステータス更新完了');
      
      // 2. CallService取得と確認
      logger.debug('🔧 CallService取得中...');
      const callService = require('./callService');
      if (!callService) {
        throw new Error('CallServiceが利用できません');
      }
      logger.debug('✅ CallService取得完了');
      
      // 🔥 修正: 発信者番号データを取得（手動発信と同様）
      let callerIdData = null;
      try {
        const [callerIds] = await db.query(
          'SELECT * FROM caller_ids WHERE id = ? AND active = true',
          [campaign.callerIdId]
        );
        if (callerIds.length > 0) {
          callerIdData = callerIds[0];
          logger.debug(`✅ 発信者番号データ取得: ${callerIdData.number} (ID: ${callerIdData.id})`);
        }
      } catch (dbError) {
        logger.warn('発信者番号データ取得エラー:', dbError.message);
      }
      
      // 🔥 修正: 手動発信と同じパラメータ構造
      const originateParams = {
        phoneNumber: contact.phone,
        callerID: callerIdData 
          ? `"${callerIdData.description || campaign.name}" <${callerIdData.number}>` 
          : `"${campaign.name}" <${campaign.callerIdNumber}>`,
        context: 'autodialer',
        exten: 's',              // ✅ 追加 - 手動発信と同じ
        priority: 1,             // ✅ 追加 - 手動発信と同じ
        variables: {
          CAMPAIGN_ID: campaign.id,
          CONTACT_ID: contact.id,
          CONTACT_NAME: contact.name || '',
          COMPANY: contact.company || '',
          AUTO_DIAL: 'true',
          DIALER_VERSION: 'v2.0'
        },
        callerIdData,            // ✅ 追加 - 手動発信と同じ
        mockMode: false,         // ✅ 追加 - 手動発信と同じ
        provider: 'sip'          // ✅ 追加 - 明示的にSIP指定
      };
      
      logger.info(`🚀 発信実行（修正版パラメータ）: ${contact.phone}`, {
        campaignId: campaign.id,
        contactId: contact.id,
        callerID: originateParams.callerID,
        provider: originateParams.provider,
        hasCallerIdData: !!originateParams.callerIdData,
        exten: originateParams.exten,
        priority: originateParams.priority
      });
      
      // 4. 実際の発信実行
      const result = await callService.originate(originateParams);
      
      if (!result || !result.ActionID) {
        throw new Error('発信結果が無効です: ActionIDが取得できませんでした');
      }
      
      const callId = result.ActionID;
      logger.info(`✅ 自動発信成功（修正版）: ${contact.phone} → CallID: ${callId}, Provider: ${result.provider}`);
      
      // 5. 通話ログ記録
      logger.debug('📝 通話ログ記録中...');
      await db.query(`
        INSERT INTO call_logs 
        (contact_id, campaign_id, caller_id_id, call_id, phone_number, start_time, status, call_provider, test_call)
        VALUES (?, ?, ?, ?, ?, NOW(), 'ORIGINATING', ?, 0)
      `, [
        contact.id,
        campaign.id,
        campaign.callerIdId,
        callId,
        contact.phone,
        result.provider || 'sip'
      ]);
      logger.debug('✅ 通話ログ記録完了');
      
      // 6. アクティブコール記録
      this.activeCalls.set(callId, {
        id: callId,
        contactId: contact.id,
        campaignId: campaign.id,
        phone: contact.phone,
        startTime: startTime
      });
      
      const duration = new Date() - startTime;
      logger.info(`🎯 発信診断完了（修正版）: ${contact.phone} (処理時間: ${duration}ms)`);
      
      return true;
      
    } catch (error) {
      const duration = new Date() - startTime;
      
      logger.error(`❌ 発信診断失敗: ${contact.phone} (処理時間: ${duration}ms)`, {
        error: error.message,
        campaignId: campaign.id,
        contactId: contact.id,
        stack: error.stack
      });
      
      // エラー統計更新
      this.dialStats.lastError = error.message;
      
      // エラー時の連絡先ステータス更新
      try {
        // 試行回数に応じてステータス決定
        const maxRetries = 3;
        const currentAttempts = (contact.attempt_count || 0) + 1;
        const finalStatus = currentAttempts >= maxRetries ? 'failed' : 'pending';
        
        await db.query(
          'UPDATE contacts SET status = ? WHERE id = ?',
          [finalStatus, contact.id]
        );
        
        logger.info(`📝 エラー時ステータス更新: ${contact.phone} → ${finalStatus} (試行: ${currentAttempts}/${maxRetries})`);
        
      } catch (updateError) {
        logger.error('ステータス更新エラー:', updateError);
      }
      
      return false;
    }
  }

  // 🚀 基本自動発信（緊急モード用）（既存のまま）
  startBasicDialer() {
    if (this.dialerIntervalId) {
      clearInterval(this.dialerIntervalId);
    }
    
    this.dialerIntervalId = setInterval(async () => {
      if (!this.enabled || this.isProcessing) {
        return;
      }
      
      try {
        // 基本的な発信処理のみ
        await this.processBasicDialing();
      } catch (error) {
        logger.error('基本発信エラー:', error);
      }
    }, this.dialInterval * 2); // 緊急モードは間隔を2倍に
    
    logger.warn('🚨 基本自動発信開始（緊急モード）');
  }

  // 📞 基本発信処理（緊急モード用）（既存のまま）
  async processBasicDialing() {
    this.isProcessing = true;
    
    try {
      // アクティブキャンペーンを直接データベースから取得
      const [activeCampaigns] = await db.query(`
        SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id,
               ci.number as caller_id_number
        FROM campaigns c
        JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.status = 'active' AND ci.active = true
        LIMIT 1
      `);
      
      if (activeCampaigns.length === 0) {
        return;
      }
      
      const campaign = activeCampaigns[0];
      
      // 未処理連絡先を1件取得
      const [contacts] = await db.query(`
        SELECT id, phone, name, company 
        FROM contacts 
        WHERE campaign_id = ? AND status = 'pending' 
        LIMIT 1
      `, [campaign.id]);
      
      if (contacts.length > 0) {
        const contact = contacts[0];
        await this.dialContactWithDiagnostics(campaign, contact); // 🆕 診断機能使用
        logger.info(`🚨 緊急モード発信: ${contact.phone}`);
      }
      
    } catch (error) {
      logger.error('基本発信処理エラー:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // 💗 基本ヘルスチェック（緊急モード用）（既存のまま）
  startBasicHealthCheck() {
    this.healthCheckIntervalId = setInterval(async () => {
      try {
        await db.query('SELECT 1');
        logger.debug('💗 基本ヘルスチェック正常（緊急モード）');
      } catch (error) {
        logger.error('🚨 基本ヘルスチェック失敗:', error);
      }
    }, this.healthCheckInterval * 2); // 緊急モードは間隔を2倍に
  }

  // 🆕 キャンペーン自動追加（既存のまま）
  async autoAddCampaign(campaign) {
    try {
      this.activeCampaigns.set(campaign.id, {
        id: campaign.id,
        name: campaign.name,
        maxConcurrentCalls: Math.min(campaign.max_concurrent_calls || 1, 3), // 最大3並列
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

  // ❌ キャンペーン自動削除（既存のまま）
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

  // 🏁 キャンペーン完了チェック（既存のまま）
  async checkCampaignCompletion(campaignId) {
    try {
      const [result] = await db.query(
        'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = "pending"',
        [campaignId]
      );
      
      if (result[0].count === 0) {
        // キャンペーン完了
        await db.query(
          'UPDATE campaigns SET status = ?, updated_at = NOW() WHERE id = ?',
          ['completed', campaignId]
        );
        
        const campaign = this.activeCampaigns.get(campaignId);
        logger.info(`🏁 キャンペーン自動完了: "${campaign?.name}" (ID: ${campaignId})`);
        
        // アクティブキャンペーンから削除
        this.activeCampaigns.delete(campaignId);
        
        // イベント発火
        this.emit('campaignCompleted', { id: campaignId, name: campaign?.name });
      }
      
    } catch (error) {
      logger.error(`キャンペーン完了チェックエラー: ${campaignId}`, error);
    }
  }

  // 📞 通話終了処理（既存のまま）
  async handleCallEnd(callId, duration, status, keypress) {
    try {
      const call = this.activeCalls.get(callId);
      if (!call) {
        logger.warn(`通話終了処理: 不明な通話ID ${callId}`);
        return false;
      }
      
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

  // 🛑 自動発信システム停止（既存のまま）
  stopAutoDialer() {
    if (this.dialerIntervalId) {
      clearInterval(this.dialerIntervalId);
      this.dialerIntervalId = null;
      logger.info('🛑 自動発信システム停止');
    }
  }

  // 📊 システム状態取得（🆕 診断情報追加版）
  getSystemStatus() {
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      systemStatus: this.systemStatus,
      initializationRetryCount: this.initializationRetryCount,
      autoDialerRunning: this.dialerIntervalId !== null,
      campaignWatcherRunning: this.campaignWatcherIntervalId !== null,
      healthCheckRunning: this.healthCheckIntervalId !== null,
      activeCampaigns: {
        count: this.activeCampaigns.size,
        details: Array.from(this.activeCampaigns.values()).map(c => ({
          id: c.id,
          name: c.name,
          activeCalls: c.activeCalls,
          maxConcurrentCalls: c.maxConcurrentCalls,
          lastDialTime: c.lastDialTime,
          addedAt: c.addedAt
        }))
      },
      activeCalls: {
        count: this.activeCalls.size,
        details: Array.from(this.activeCalls.values()).map(c => ({
          id: c.id,
          campaignId: c.campaignId,
          contactId: c.contactId,
          phone: c.phone,
          startTime: c.startTime
        }))
      },
      // 🆕 発信診断統計
      dialStats: {
        ...this.dialStats,
        successRate: this.dialStats.totalAttempts > 0 
          ? Math.round((this.dialStats.successfulCalls / this.dialStats.totalAttempts) * 100) 
          : 0,
        failureRate: this.dialStats.totalAttempts > 0 
          ? Math.round((this.dialStats.failedCalls / this.dialStats.totalAttempts) * 100) 
          : 0
      },
      isProcessing: this.isProcessing,
      lastActivityTime: this.lastActivityTime,
      intervals: {
        dialInterval: this.dialInterval,
        campaignCheckInterval: this.campaignCheckInterval,
        healthCheckInterval: this.healthCheckInterval
      }
    };
  }

  // 🆕 診断レポート取得
  getDiagnosticReport() {
    return {
      timestamp: new Date().toISOString(),
      systemStatus: this.systemStatus,
      dialStats: this.dialStats,
      activeCampaignsCount: this.activeCampaigns.size,
      activeCallsCount: this.activeCalls.size,
      isProcessing: this.isProcessing,
      servicesStatus: {
        dialerRunning: this.dialerIntervalId !== null,
        watcherRunning: this.campaignWatcherIntervalId !== null,
        healthCheckRunning: this.healthCheckIntervalId !== null
      },
      lastActivity: this.lastActivityTime,
      timeSinceLastActivity: new Date() - this.lastActivityTime
    };
  }

  // 🚨 システム停止（既存のまま）
  async stopSystem() {
    logger.info('🚨 DialerService停止処理開始...');
    
    this.stopAutoDialer();
    
    if (this.campaignWatcherIntervalId) {
      clearInterval(this.campaignWatcherIntervalId);
      this.campaignWatcherIntervalId = null;
    }
    
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
    
    this.activeCampaigns.clear();
    this.activeCalls.clear();
    this.initialized = false;
    this.systemStatus = 'stopped';
    
    logger.info('✅ DialerService停止完了');
  }

  // 🔄 システム再起動（既存のまま）
  async restartSystem() {
    logger.info('🔄 DialerService再起動開始...');
    
    await this.stopSystem();
    
    // 3秒待機してから再開始
    setTimeout(() => {
      this.initializationRetryCount = 0;
      this.startAutoSystemWithRetry();
    }, 3000);
  }
}

// シングルトンインスタンス
const dialerService = new DialerService();

// グローバルイベントリスナー（既存のまま）
dialerService.on('campaignAdded', (campaign) => {
  logger.info(`🎉 イベント: キャンペーン追加 - ${campaign.name} (ID: ${campaign.id})`);
});

dialerService.on('campaignRemoved', (campaign) => {
  logger.info(`🗑️ イベント: キャンペーン削除 - ${campaign.name} (ID: ${campaign.id})`);
});

dialerService.on('contactDialed', (data) => {
  logger.debug(`📞 イベント: 発信完了 - ${data.phone} (Campaign: ${data.campaignId})`);
});

dialerService.on('callEnded', (data) => {
  logger.debug(`📞 イベント: 通話終了 - CallID: ${data.callId}, Status: ${data.status}`);
});

dialerService.on('campaignCompleted', (campaign) => {
  logger.info(`🏁 イベント: キャンペーン完了 - ${campaign.name} (ID: ${campaign.id})`);
});

// プロセス終了時の安全な停止（既存のまま）
process.on('SIGTERM', async () => {
  logger.info('SIGTERM受信 - DialerService安全停止');
  await dialerService.stopSystem();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT受信 - DialerService安全停止');
  await dialerService.stopSystem();
});

module.exports = dialerService;
