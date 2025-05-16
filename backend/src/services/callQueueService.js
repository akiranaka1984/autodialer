// backend/src/services/callQueueService.js
const asterisk = require('./asterisk');
const logger = require('./logger');
const db = require('./database');
const ivrService = require('./ivrService');

class CallQueueService {
  constructor() {
    this.queues = {
      operators: {
        name: 'operators',
        maxSize: 20,
        currentSize: 0,
        members: new Map(), // operatorId -> SIPアカウント
        activeCallCount: 0,
        strategy: 'ringall'
      }
    };
    
    this.transferRate = 0.1; // デフォルトの転送率: 10%
    this.maxTransfersPerOperator = 5; // オペレーター1人当たりの最大処理可能数
    this.outboundAdjustmentInterval = null;
    
    // サービス初期化時に既存オペレーターを読み込む
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      logger.info('コールキューサービスを初期化しています...');
      
      // 既存オペレーターの取得
      const [operators] = await db.query(`
        SELECT id, operator_id, status, sip_account
        FROM operators
        WHERE status = 'available'
      `);
      
      // オペレーターをキューに追加
      for (const operator of operators) {
        await this.addOperatorToQueue(operator.id, operator.sip_account);
      }
      
      // 発信率の定期調整を開始
      this.startOutboundAdjustment();
      
      this.initialized = true;
      logger.info('コールキューサービスの初期化が完了しました');
    } catch (error) {
      logger.error('コールキューサービスの初期化エラー:', error);
    }
  }

  // 発信率の定期調整を開始
  startOutboundAdjustment() {
    // 30秒ごとに発信率を調整
    this.outboundAdjustmentInterval = setInterval(() => {
      this.adjustOutboundCallRate()
        .catch(err => logger.error('発信率調整エラー:', err));
    }, 30000);
  }

  // 発信率調整を停止
  stopOutboundAdjustment() {
    if (this.outboundAdjustmentInterval) {
      clearInterval(this.outboundAdjustmentInterval);
      this.outboundAdjustmentInterval = null;
    }
  }

  // キューにオペレーターを追加
  async addOperatorToQueue(operatorId, sipAccount) {
    try {
      const queue = this.queues.operators;
      
      if (!queue) {
        throw new Error('指定されたキューが見つかりません');
      }
      
      if (queue.members.has(operatorId)) {
        logger.info(`オペレーター ${operatorId} は既にキューに存在します`);
        return true;
      }
      
      // Asteriskキューにメンバーを追加
      if (asterisk.connected) {
        await asterisk.action({
          Action: 'QueueAdd',
          Queue: 'operators',
          Interface: `SIP/${sipAccount}`,
          Penalty: '1',
          Paused: '0'
        });
      }
      
      // キューにオペレーターを追加
      queue.members.set(operatorId, sipAccount);
      
      logger.info(`オペレーター ${operatorId} (${sipAccount}) をキューに追加しました`);
      
      // 発信率を調整
      await this.adjustOutboundCallRate();
      
      return true;
    } catch (error) {
      logger.error(`オペレーターのキュー追加エラー: ${operatorId}`, error);
      return false;
    }
  }

  // キューからオペレーターを削除
  async removeOperatorFromQueue(operatorId) {
    try {
      const queue = this.queues.operators;
      
      if (!queue || !queue.members.has(operatorId)) {
        return false;
      }
      
      const sipAccount = queue.members.get(operatorId);
      
      // Asteriskキューからメンバーを削除
      if (asterisk.connected) {
        await asterisk.action({
          Action: 'QueueRemove',
          Queue: 'operators',
          Interface: `SIP/${sipAccount}`
        });
      }
      
      // キューからオペレーターを削除
      queue.members.delete(operatorId);
      
      logger.info(`オペレーター ${operatorId} (${sipAccount}) をキューから削除しました`);
      
      // 発信率を調整
      await this.adjustOutboundCallRate();
      
      return true;
    } catch (error) {
      logger.error(`オペレーターのキュー削除エラー: ${operatorId}`, error);
      return false;
    }
  }

  // オペレーターを一時停止
  async pauseOperator(operatorId) {
    try {
      const queue = this.queues.operators;
      
      if (!queue || !queue.members.has(operatorId)) {
        return false;
      }
      
      const sipAccount = queue.members.get(operatorId);
      
      // Asteriskキューでメンバーを一時停止
      if (asterisk.connected) {
        await asterisk.action({
          Action: 'QueuePause',
          Queue: 'operators',
          Interface: `SIP/${sipAccount}`,
          Paused: '1'
        });
      }
      
      logger.info(`オペレーター ${operatorId} (${sipAccount}) を一時停止しました`);
      
      // 発信率を調整
      await this.adjustOutboundCallRate();
      
      return true;
    } catch (error) {
      logger.error(`オペレーターの一時停止エラー: ${operatorId}`, error);
      return false;
    }
  }

  // 現在のキューサイズを取得
  async getQueueSize(queueName = 'operators') {
    try {
      if (!asterisk.connected) {
        return this.queues[queueName]?.currentSize || 0;
      }
      
      // AsteriskからキューのリアルタイムメトリクスをAMIで取得
      const queueStatus = await asterisk.action({
        Action: 'QueueStatus',
        Queue: queueName
      });
      
      // キューの長さを抽出（QueueStatusの解析が必要な場合は実装）
      // 簡易的な実装として現在のプロパティを返す
      return this.queues[queueName]?.currentSize || 0;
    } catch (error) {
      logger.error(`キューサイズ取得エラー: ${queueName}`, error);
      return 0;
    }
  }

  // 利用可能なオペレーター数を取得
  async getActiveOperatorCount() {
    return this.queues.operators?.members.size || 0;
  }

  // 発信率を調整
  async adjustOutboundCallRate() {
    try {
      // 利用可能なオペレーター数を取得
      const operatorCount = await this.getActiveOperatorCount();
      
      // オペレーターが処理できる最大転送数
      const maxPossibleTransfers = operatorCount * this.maxTransfersPerOperator;
      
      // 現在のキュー待ち数
      const currentQueueSize = await this.getQueueSize('operators');
      this.queues.operators.currentSize = currentQueueSize;
      
      // 残りの処理可能数
      const remainingCapacity = maxPossibleTransfers - currentQueueSize;
      
      // 同時発信数を調整（転送率を考慮）
      const adjustedDialerRate = Math.floor(remainingCapacity / this.transferRate);
      const newRate = Math.max(adjustedDialerRate, 0);
      
      logger.info(`発信率調整: オペレーター数=${operatorCount}, キューサイズ=${currentQueueSize}, 調整後発信率=${newRate}`);
      
      // dialerServiceに新しい発信率を設定
      const dialerService = require('./dialerService');
      if (dialerService && typeof dialerService.setMaxConcurrentCalls === 'function') {
        dialerService.setMaxConcurrentCalls(newRate);
      }
      
      return newRate;
    } catch (error) {
      logger.error('発信率調整エラー:', error);
      return 0;
    }
  }

  // 転送率の更新
  setTransferRate(rate) {
    if (rate > 0 && rate <= 1) {
      this.transferRate = rate;
      logger.info(`転送率を ${rate * 100}% に設定しました`);
      return true;
    }
    return false;
  }

  // オペレーター1人当たりの最大処理可能数を設定
  setMaxTransfersPerOperator(count) {
    if (count > 0) {
      this.maxTransfersPerOperator = count;
      logger.info(`オペレーター1人当たりの最大処理可能数を ${count} に設定しました`);
      return true;
    }
    return false;
  }

  // オペレーターへの転送処理
  async transferToOperator(callId, campaignId, transferOptions = {}) {
    try {
      logger.info(`オペレーター転送リクエスト: callId=${callId}`);
      
      // 利用可能なオペレーターを確認
      const operatorCount = await this.getActiveOperatorCount();
      
      if (operatorCount === 0) {
        logger.warn('利用可能なオペレーターがいません');
        return {
          success: false,
          reason: 'no_operators',
          message: 'オペレーターがオンラインではありません',
          action: 'voicemail'
        };
      }
      
      // キューサイズを確認
      const queueSize = await this.getQueueSize('operators');
      const maxQueueSize = this.queues.operators.maxSize;
      
      if (queueSize >= maxQueueSize) {
        logger.warn(`キューが満杯です: ${queueSize}/${maxQueueSize}`);
        return {
          success: false,
          reason: 'queue_full',
          message: 'オペレーターキューが満杯です',
          action: 'voicemail'
        };
      }
      
      // 現在のキュー待ち数を更新
      this.queues.operators.currentSize = queueSize + 1;
      
      // 通話ログに転送状態を記録
      await db.query(
        'UPDATE call_logs SET transfer_status = ?, transfer_time = NOW() WHERE call_id = ?',
        ['queued', callId]
      );
      
      // 顧客情報を取得（オプション）
      let customerInfo = null;
      if (transferOptions.includeCustomerInfo) {
        [customerInfo] = await db.query(`
          SELECT c.* 
          FROM call_logs cl
          JOIN contacts c ON cl.contact_id = c.id
          WHERE cl.call_id = ?
        `, [callId]);
      }
      
      logger.info(`オペレーター転送処理完了: callId=${callId}, キューサイズ=${queueSize+1}/${maxQueueSize}`);
      
      return {
        success: true,
        queuePosition: queueSize + 1,
        estimatedWaitTime: queueSize * 60, // 推定待ち時間（秒）
        customerInfo: customerInfo
      };
    } catch (error) {
      logger.error(`オペレーター転送エラー: ${callId}`, error);
      return {
        success: false,
        reason: 'error',
        message: error.message
      };
    }
  }

  // コールキューのステータスを取得
  async getQueueStatus() {
    try {
      const operatorQueue = this.queues.operators;
      const queueSize = await this.getQueueSize('operators');
      
      return {
        name: 'operators',
        currentSize: queueSize,
        maxSize: operatorQueue.maxSize,
        activeOperators: operatorQueue.members.size,
        strategy: operatorQueue.strategy,
        estimatedWaitTime: queueSize * 60 // 推定待ち時間（秒）
      };
    } catch (error) {
      logger.error('キューステータス取得エラー:', error);
      return null;
    }
  }
}

module.exports = new CallQueueService();