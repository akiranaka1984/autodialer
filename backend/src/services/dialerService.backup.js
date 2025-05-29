// backend/src/services/dialerService-self-healing.js - 自己回復機能付き
const db = require('./database');
const logger = require('./logger');
const { EventEmitter } = require('events');

class SelfHealingDialerService extends EventEmitter {
  constructor() {
    super();
    this.activeCampaigns = new Map();
    this.activeCalls = new Map();
    this.isProcessing = false;
    this.dialerIntervalId = null;
    this.campaignWatcherIntervalId = null;
    this.healthCheckIntervalId = null;
    
    // 設定
    this.dialInterval = 5000; // 5秒間隔
    this.campaignCheckInterval = 10000; // 10秒ごとにキャンペーン状態チェック
    this.healthCheckInterval = 30000; // 30秒ごとに自己診断
    this.enabled = process.env.DISABLE_AUTO_DIALER !== 'true';
    
    // 自己回復統計
    this.healingStats = {
      totalHeals: 0,
      lastHealTime: null,
      consecutiveFailures: 0,
      maxConsecutiveFailures: 3
    };
    
    logger.info(`🚀 自己回復機能付きDialerService初期化: システム=${this.enabled ? '有効' : '無効'}`);
    
    // 🔥 完全自動開始 + 自己回復機能
    if (this.enabled) {
      this.startAutoSystemWithHealing();
    }
  }

  // 🎯 自己回復機能付き自動システム開始
  async startAutoSystemWithHealing() {
    try {
      logger.info('🎯 自己回復機能付き自動システム開始...');
      
      // 1. 基本システム開始
      await this.startAutoSystem();
      
      // 2. 自己診断・回復機能開始
      this.startHealthCheck();
      
      logger.info('✅ 自己回復機能付きシステム起動完了');
      
    } catch (error) {
      logger.error('❌ 自動システム開始エラー:', error);
      
      // 5秒後に再試行
      setTimeout(() => {
        logger.info('🔄 自動システム再起動試行...');
        this.startAutoSystemWithHealing();
      }, 5000);
    }
  }

  // 🏥 自己診断・回復機能開始
  startHealthCheck() {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
    }
    
    this.healthCheckIntervalId = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('自己診断エラー:', error);
        this.healingStats.consecutiveFailures++;
      }
    }, this.healthCheckInterval);
    
    logger.info(`🏥 自己診断機能開始: ${this.healthCheckInterval}ms間隔`);
  }

  // 🔍 自己診断実行
  async performHealthCheck() {
    try {
      let needsHealing = false;
      const issues = [];
      
      // 1. 基本システム状態チェック
      if (this.enabled && !this.dialerIntervalId) {
        issues.push('自動発信システム停止');
        needsHealing = true;
      }
      
      if (this.enabled && !this.campaignWatcherIntervalId) {
        issues.push('キャンペーン監視停止');
        needsHealing = true;
      }
      
      // 2. データベース整合性チェック
      const [dbCampaigns] = await db.query(`
        SELECT c.id, c.name,
               (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'pending') as pending_count
        FROM campaigns c
        WHERE c.status = 'active'
      `);
      
      const dbActiveIds = new Set(dbCampaigns.filter(c => c.pending_count > 0).map(c => c.id));
      const memoryActiveIds = new Set(this.activeCampaigns.keys());
      
      // DBにあるがメモリにないキャンペーン
      const missingInMemory = [...dbActiveIds].filter(id => !memoryActiveIds.has(id));
      if (missingInMemory.length > 0) {
        issues.push(`メモリ不整合: ${missingInMemory.length}キャンペーン`);
        needsHealing = true;
      }
      
      // 3. SIP接続チェック
      const sipService = require('./sipService');
      if (!sipService.connected || sipService.getAvailableSipAccountCount() === 0) {
        issues.push('SIP接続問題');
        needsHealing = true;
      }
      
      // 4. 発信活動チェック（過去2分間）
      if (this.activeCampaigns.size > 0) {
        const [recentCalls] = await db.query(`
          SELECT COUNT(*) as count
          FROM call_logs
          WHERE start_time >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
        `);
        
        if (recentCalls[0].count === 0) {
          // アクティブキャンペーンがあるのに発信がない
          issues.push('発信活動なし');
          needsHealing = true;
        }
      }
      
      // 5. 自己回復実行
      if (needsHealing) {
        await this.performSelfHealing(issues);
      } else {
        // 正常時は連続失敗回数をリセット
        this.healingStats.consecutiveFailures = 0;
        logger.debug('🏥 システム健全性確認: 正常');
      }
      
    } catch (error) {
      logger.error('自己診断実行エラー:', error);
      throw error;
    }
  }

  // 🔧 自己回復実行
  async performSelfHealing(issues) {
    try {
      logger.warn(`🔧 自己回復開始: 検出された問題 [${issues.join(', ')}]`);
      
      // 連続失敗回数チェック
      if (this.healingStats.consecutiveFailures >= this.healingStats.maxConsecutiveFailures) {
        logger.error(`🚨 連続失敗限界到達 (${this.healingStats.consecutiveFailures}回) - 緊急停止`);
        await this.emergencyStop();
        return;
      }
      
      // 1. システム停止
      await this.stopSystem();
      
      // 2. 少し待機
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 3. SIP再接続
      const sipService = require('./sipService');
      await sipService.connect();
      
      // 4. CallService再初期化
      const callService = require('./callService');
      await callService.initialize();
      
      // 5. システム再開
      await this.startAutoSystem();
      this.startHealthCheck();
      
      // 6. 統計更新
      this.healingStats.totalHeals++;
      this.healingStats.lastHealTime = new Date();
      this.healingStats.consecutiveFailures = 0;
      
      logger.info(`✅ 自己回復完了 (累計: ${this.healingStats.totalHeals}回)`);
      
      // 回復成功をイベントで通知
      this.emit('systemHealed', {
        issues,
        healCount: this.healingStats.totalHeals,
        timestamp: new Date()
      });
      
    } catch (error) {
      logger.error('❌ 自己回復失敗:', error);
      this.healingStats.consecutiveFailures++;
      
      // 回復失敗をイベントで通知
      this.emit('healingFailed', {
        error: error.message,
        consecutiveFailures: this.healingStats.consecutiveFailures,
        timestamp: new Date()
      });
    }
  }

  // 🚨 緊急停止
  async emergencyStop() {
    logger.error('🚨 緊急停止実行 - システムを安全に停止します');
    
    this.enabled = false;
    await this.stopSystem();
    
    // 緊急停止イベント
    this.emit('emergencyStop', {
      reason: '連続自己回復失敗',
      consecutiveFailures: this.healingStats.consecutiveFailures,
      timestamp: new Date()
    });
  }

  // 📊 拡張システム状態取得
  getSystemStatus() {
    const baseStatus = this.getBasicSystemStatus();
    
    return {
      ...baseStatus,
      healing: {
        enabled: true,
        totalHeals: this.healingStats.totalHeals,
        lastHealTime: this.healingStats.lastHealTime,
        consecutiveFailures: this.healingStats.consecutiveFailures,
        maxConsecutiveFailures: this.healingStats.maxConsecutiveFailures,
        healthCheckRunning: this.healthCheckIntervalId !== null
      }
    };
  }

  // 基本システム状態取得（既存メソッド）
  getBasicSystemStatus() {
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
        campaignCheckInterval: this.campaignCheckInterval,
        healthCheckInterval: this.healthCheckInterval
      }
    };
  }

  // 🔄 手動回復トリガー
  async manualHeal(reason = '手動実行') {
    logger.info(`🔧 手動回復トリガー: ${reason}`);
    await this.performSelfHealing([reason]);
  }

  // システム停止時に自己診断も停止
  async stopSystem() {
    logger.info('🚨 自己回復システム停止...');
    
    // 基本システム停止
    if (this.dialerIntervalId) {
      clearInterval(this.dialerIntervalId);
      this.dialerIntervalId = null;
    }
    
    if (this.campaignWatcherIntervalId) {
      clearInterval(this.campaignWatcherIntervalId);
      this.campaignWatcherIntervalId = null;
    }
    
    // 自己診断停止
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
    
    this.activeCampaigns.clear();
    this.activeCalls.clear();
    
    logger.info('✅ システム停止完了');
  }

  // 以下、既存のメソッドをそのまま継承
  // （startAutoSystem, loadActiveCampaigns, checkCampaignChanges, etc.）
  
  async startAutoSystem() {
    try {
      logger.info('🎯 基本自動システム開始...');
      
      await this.loadActiveCampaigns();
      this.startCampaignWatcher();
      this.startAutoDialer();
      
      logger.info('✅ 基本自動システム起動完了');
      
    } catch (error) {
      logger.error('❌ 基本システム開始エラー:', error);
      throw error;
    }
  }

  // ... 他の既存メソッドもここに含める
}

// 使用例：既存のdialerServiceを置き換える際の移行方法
/*
// 1. 既存ファイルをバックアップ
// cp src/services/dialerService.js src/services/dialerService.backup.js

// 2. 新しいサービスに置き換え
// cp src/services/dialerService-self-healing.js src/services/dialerService.js

// 3. システム再起動
// pm2 restart autodialer
*/

module.exports = SelfHealingDialerService;
