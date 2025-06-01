// backend/src/services/transferService.js - オペレーター転送機能完全版
const db = require('./database');
const logger = require('./logger');
const callService = require('./callService');
const { EventEmitter } = require('events');

class TransferService extends EventEmitter {
  constructor() {
    super();
    this.activeTransfers = new Map();
    this.transferTimeout = 180000; // 3分のタイムアウト
    this.operatorCallTimeout = 60000; // オペレーター発信1分タイムアウト
    
    logger.info('TransferService初期化完了');
  }

  // 🔄 メイン転送処理（1キー押下時）
  async initiateTransfer(originalCallId, customerPhone, campaignId, keypress = '1') {
    const transferId = this.generateTransferId();
    
    try {
      logger.info(`🔄 転送処理開始: TransferID=${transferId}, Customer=${customerPhone}, OriginalCallID=${originalCallId}`);
      
      // 1. キャンペーン情報とオペレーター番号を取得
      const campaignInfo = await this.getCampaignInfo(campaignId);
      if (!campaignInfo) {
        throw new Error(`キャンペーン情報が見つかりません: ID=${campaignId}`);
      }
      
      const operatorNumber = campaignInfo.caller_id_number;
      if (!operatorNumber) {
        throw new Error(`オペレーター番号が設定されていません: Campaign=${campaignId}`);
      }
      
      // 2. 転送ログを作成（初期状態）
      await this.createTransferLog(transferId, originalCallId, customerPhone, operatorNumber, campaignId);
      
      // 3. 顧客通話を即座終了
      logger.info(`📞 顧客通話終了: ${originalCallId}`);
      await this.endCustomerCall(originalCallId, transferId);
      
      // 4. 連絡先ステータスを「転送済み」に更新
      await this.updateContactStatus(customerPhone, campaignId, 'transferred');
      
      // 5. オペレーター発信を実行（非同期）
      setImmediate(async () => {
        try {
          await this.callOperator(transferId, operatorNumber, customerPhone, campaignInfo);
        } catch (operatorError) {
          logger.error(`オペレーター発信エラー: ${transferId}`, operatorError);
          await this.updateTransferStatus(transferId, 'failed');
        }
      });
      
      // 6. 転送状態を管理マップに追加
      this.activeTransfers.set(transferId, {
        transferId,
        originalCallId,
        customerPhone,
        operatorNumber,
        campaignId,
        startTime: new Date(),
        status: 'operator_calling'
      });
      
      // 7. タイムアウト処理設定
      this.setTransferTimeout(transferId);
      
      logger.info(`✅ 転送処理開始完了: ${transferId} - オペレーター${operatorNumber}へ発信中`);
      
      return {
        success: true,
        transferId,
        message: `オペレーター(${operatorNumber})への転送を開始しました`,
        operatorNumber,
        customerPhone
      };
      
    } catch (error) {
      logger.error(`❌ 転送処理エラー: ${transferId}`, error);
      
      // エラー時は転送状態を失敗に更新
      if (transferId) {
        await this.updateTransferStatus(transferId, 'failed');
      }
      
      throw error;
    }
  }

  // 📋 キャンペーン情報取得
  async getCampaignInfo(campaignId) {
    try {
      const [campaigns] = await db.query(`
        SELECT c.id, c.name, c.caller_id_number, c.transfer_enabled, c.transfer_message,
               ci.number as caller_number, ci.description as caller_description
        FROM campaigns c
        LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.id = ?
      `, [campaignId]);
      
      if (campaigns.length === 0) {
        return null;
      }
      
      const campaign = campaigns[0];
      logger.info(`📋 キャンペーン情報取得: ${campaign.name}, オペレーター番号: ${campaign.caller_id_number}`);
      
      return campaign;
      
    } catch (error) {
      logger.error(`キャンペーン情報取得エラー: ${campaignId}`, error);
      throw error;
    }
  }

  // 📝 転送ログ作成
  async createTransferLog(transferId, originalCallId, customerPhone, operatorNumber, campaignId) {
    try {
      await db.query(`
        INSERT INTO transfer_logs 
        (original_call_id, campaign_id, original_number, transfer_number, status, start_time, created_at)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())
      `, [originalCallId, campaignId, customerPhone, operatorNumber, 'initiated']);
      
      logger.info(`📝 転送ログ作成: ${transferId}`);
      
    } catch (error) {
      logger.error(`転送ログ作成エラー: ${transferId}`, error);
      throw error;
    }
  }

  // 📞 顧客通話終了処理
  async endCustomerCall(originalCallId, transferId) {
    try {
      // 1. 通話ログを更新（転送フラグ付き）
      await db.query(`
        UPDATE call_logs 
        SET status = 'TRANSFERRED', 
            end_time = NOW(), 
            is_transfer = true, 
            transfer_id = ?,
            keypress = '1'
        WHERE call_id = ?
      `, [transferId, originalCallId]);
      
      // 2. CallServiceのリソース解放
      try {
        await callService.handleCallEnd(originalCallId, null, 'TRANSFERRED', '1');
      } catch (callServiceError) {
        logger.warn(`CallService通話終了処理エラー: ${originalCallId}`, callServiceError);
      }
      
      logger.info(`📞 顧客通話終了処理完了: ${originalCallId} → ${transferId}`);
      
    } catch (error) {
      logger.error(`顧客通話終了処理エラー: ${originalCallId}`, error);
      throw error;
    }
  }

  // 📞 オペレーター発信
  async callOperator(transferId, operatorNumber, customerPhone, campaignInfo) {
    const operatorCallId = `transfer-op-${transferId}`;
    
    try {
      logger.info(`📞 オペレーター発信開始: ${operatorNumber} (Transfer: ${transferId})`);
      
      // 転送状態を「オペレーター発信中」に更新
      await this.updateTransferStatus(transferId, 'operator_calling');
      
      // 🎵 顧客情報音声メッセージ生成
      const customerInfoMessage = this.generateCustomerInfoMessage(customerPhone, campaignInfo);
      
      // オペレーター発信パラメータ
      const params = {
        phoneNumber: operatorNumber,
        callerID: `"転送: ${customerPhone}" <${campaignInfo.caller_number || '03-5946-8520'}>`,
        context: 'autodialer-transfer',
        exten: 's',
        priority: 1,
        variables: {
          TRANSFER_ID: transferId,
          CUSTOMER_PHONE: customerPhone,
          CAMPAIGN_ID: campaignInfo.id,
          CAMPAIGN_NAME: campaignInfo.name,
          TRANSFER_TYPE: 'operator',
          CUSTOMER_INFO: customerInfoMessage
        },
        callerIdData: null,
        mockMode: false,
        provider: 'sip',
        transferInfo: {
          transferId,
          customerPhone,
          campaignName: campaignInfo.name,
          message: customerInfoMessage
        }
      };
      
      logger.info(`🚀 オペレーター発信実行:`, {
        transferId,
        operatorNumber,
        customerPhone,
        campaignName: campaignInfo.name,
        callerID: params.callerID
      });
      
      // CallServiceでオペレーター発信
      const result = await callService.originate(params);
      
      if (!result || !result.ActionID) {
        throw new Error('オペレーター発信が失敗しました');
      }
      
      // 成功時の処理
      await this.updateTransferLog(transferId, {
        operator_call_id: result.ActionID,
        status: 'operator_calling'
      });
      
      // オペレーター通話ログ記録
      await db.query(`
        INSERT INTO call_logs 
        (contact_id, campaign_id, call_id, phone_number, start_time, status, test_call, call_provider, is_transfer, transfer_id, transfer_type)
        VALUES (NULL, ?, ?, ?, NOW(), 'ORIGINATING', 0, ?, 1, ?, 'operator')
      `, [campaignInfo.id, result.ActionID, operatorNumber, result.provider || 'sip', transferId]);
      
      logger.info(`✅ オペレーター発信成功: ${operatorNumber} → CallID: ${result.ActionID}`);
      
      // オペレーター発信タイムアウト設定
      setTimeout(async () => {
        try {
          await this.handleOperatorTimeout(transferId);
        } catch (timeoutError) {
          logger.error(`オペレータータイムアウト処理エラー: ${transferId}`, timeoutError);
        }
      }, this.operatorCallTimeout);
      
      return result;
      
    } catch (error) {
      logger.error(`オペレーター発信エラー: ${transferId}`, error);
      await this.updateTransferStatus(transferId, 'failed');
      throw error;
    }
  }

  // 🎵 顧客情報音声メッセージ生成
  generateCustomerInfoMessage(customerPhone, campaignInfo) {
    const formattedPhone = this.formatPhoneNumber(customerPhone);
    const campaignName = campaignInfo.name || 'キャンペーン';
    
    return `${campaignName}からの転送です。お客様の電話番号は${formattedPhone}です。`;
  }

  // 📞 電話番号フォーマット（音声用）
  formatPhoneNumber(phoneNumber) {
    // 数字を1桁ずつ読み上げ用に変換
    const digits = phoneNumber.replace(/[^\d]/g, '');
    return digits.split('').join('-');
  }

  // 📊 連絡先ステータス更新
  async updateContactStatus(phoneNumber, campaignId, status = 'transferred') {
    try {
      const [result] = await db.query(`
        UPDATE contacts 
        SET status = ?, last_attempt = NOW() 
        WHERE phone = ? AND campaign_id = ?
      `, [status, phoneNumber, campaignId]);
      
      if (result.affectedRows > 0) {
        logger.info(`📊 連絡先ステータス更新: ${phoneNumber} → ${status}`);
      }
      
    } catch (error) {
      logger.error(`連絡先ステータス更新エラー: ${phoneNumber}`, error);
      // 重要ではないエラーなので続行
    }
  }

  // 🔄 転送状態更新
  async updateTransferStatus(transferId, status) {
    try {
      await db.query(`
        UPDATE transfer_logs 
        SET status = ?, 
            ${status === 'completed' || status === 'failed' ? 'end_time = NOW(),' : ''} 
            updated_at = NOW()
        WHERE id = ?
      `, [status, transferId]);
      
      logger.info(`🔄 転送状態更新: ${transferId} → ${status}`);
      
      // 完了/失敗時はアクティブ転送から削除
      if (status === 'completed' || status === 'failed') {
        this.activeTransfers.delete(transferId);
      }
      
    } catch (error) {
      logger.error(`転送状態更新エラー: ${transferId}`, error);
    }
  }

  // 📝 転送ログ更新
  async updateTransferLog(transferId, updates) {
    try {
      const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(updates), transferId];
      
      await db.query(`
        UPDATE transfer_logs 
        SET ${setClause}, updated_at = NOW()
        WHERE id = ?
      `, values);
      
      logger.debug(`📝 転送ログ更新: ${transferId}`, updates);
      
    } catch (error) {
      logger.error(`転送ログ更新エラー: ${transferId}`, error);
    }
  }

  // ⏰ 転送タイムアウト設定
  setTransferTimeout(transferId) {
    setTimeout(async () => {
      try {
        const transfer = this.activeTransfers.get(transferId);
        if (transfer && transfer.status !== 'completed') {
          logger.warn(`⏰ 転送タイムアウト: ${transferId}`);
          await this.updateTransferStatus(transferId, 'failed');
        }
      } catch (error) {
        logger.error(`転送タイムアウト処理エラー: ${transferId}`, error);
      }
    }, this.transferTimeout);
  }

  // ⏰ オペレータータイムアウト処理
  async handleOperatorTimeout(transferId) {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || transfer.status === 'completed') {
      return;
    }
    
    logger.warn(`⏰ オペレーター発信タイムアウト: ${transferId}`);
    await this.updateTransferStatus(transferId, 'failed');
  }

  // 📞 オペレーター通話終了処理
  async handleOperatorCallEnd(operatorCallId, duration, status) {
    try {
      // オペレーター通話IDから転送IDを特定
      const [transfers] = await db.query(`
        SELECT id, transfer_number, transfer_number
        FROM transfer_logs 
        WHERE operator_call_id = ?
      `, [operatorCallId]);
      
      if (transfers.length === 0) {
        logger.warn(`転送情報が見つかりません: OperatorCallID=${operatorCallId}`);
        return false;
      }
      
      const transfer = transfers[0];
      const transferId = transfer.id;
      
      logger.info(`📞 オペレーター通話終了: ${transferId}, Status=${status}, Duration=${duration}`);
      
      // 通話ログ更新
      await db.query(`
        UPDATE call_logs 
        SET end_time = NOW(), duration = ?, status = ?
        WHERE call_id = ?
      `, [duration || 0, status || 'COMPLETED', operatorCallId]);
      
      // 転送を完了状態に
      await this.updateTransferStatus(transferId, 'completed');
      
      // イベント発火
      this.emit('transferCompleted', {
        transferId,
        operatorCallId,
        customerPhone: transfer.original_number,
        operatorNumber: transfer.transfer_number,
        duration,
        status
      });
      
      return true;
      
    } catch (error) {
      logger.error(`オペレーター通話終了処理エラー: ${operatorCallId}`, error);
      return false;
    }
  }

  // 📊 転送状態取得
  async getTransferStatus(transferId) {
    try {
      const [transfers] = await db.query(`
        SELECT tl.*, c.name as campaign_name
        FROM transfer_logs tl
        LEFT JOIN campaigns c ON tl.campaign_id = c.id
        WHERE tl.id = ?
      `, [transferId]);
      
      if (transfers.length === 0) {
        return null;
      }
      
      const transfer = transfers[0];
      
      // アクティブ転送情報がある場合は追加
      const activeTransfer = this.activeTransfers.get(transferId);
      if (activeTransfer) {
        transfer.activeInfo = {
          startTime: activeTransfer.startTime,
          currentStatus: activeTransfer.status
        };
      }
      
      return transfer;
      
    } catch (error) {
      logger.error(`転送状態取得エラー: ${transferId}`, error);
      throw error;
    }
  }

  // 📋 転送履歴取得
  async getAllTransfers(options = {}) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        campaignId, 
        status, 
        dateFrom, 
        dateTo 
      } = options;
      
      let whereClause = 'WHERE 1=1';
      const params = [];
      
      if (campaignId) {
        whereClause += ' AND tl.campaign_id = ?';
        params.push(campaignId);
      }
      
      if (status) {
        whereClause += ' AND tl.status = ?';
        params.push(status);
      }
      
      if (dateFrom) {
        whereClause += ' AND tl.start_time >= ?';
        params.push(dateFrom);
      }
      
      if (dateTo) {
        whereClause += ' AND tl.start_time <= ?';
        params.push(dateTo + ' 23:59:59');
      }
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      const [transfers] = await db.query(`
        SELECT tl.*, c.name as campaign_name,
               co.name as customer_name, co.company as customer_company
        FROM transfer_logs tl
        LEFT JOIN campaigns c ON tl.campaign_id = c.id
        LEFT JOIN contacts co ON (co.phone = tl.original_number AND co.campaign_id = tl.campaign_id)
        ${whereClause}
        ORDER BY tl.start_time DESC
        LIMIT ${parseInt(limit)} OFFSET ${offset}
      `, params);
      
      // 総数取得
      const [countResult] = await db.query(`
        SELECT COUNT(*) as total
        FROM transfer_logs tl
        ${whereClause}
      `, params);
      
      return {
        transfers,
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult[0].total / parseInt(limit))
      };
      
    } catch (error) {
      logger.error('転送履歴取得エラー:', error);
      throw error;
    }
  }

  // 🔑 転送ID生成
  generateTransferId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `transfer-${timestamp}-${random}`;
  }

  // 📊 アクティブ転送状況取得
  getActiveTransfers() {
    return Array.from(this.activeTransfers.values()).map(transfer => ({
      transferId: transfer.transferId,
      customerPhone: transfer.customerPhone,
      operatorNumber: transfer.operatorNumber,
      campaignId: transfer.campaignId,
      startTime: transfer.startTime,
      status: transfer.status,
      duration: new Date() - transfer.startTime
    }));
  }

  // 📊 転送統計取得
  async getTransferStats(campaignId = null, dateFrom = null, dateTo = null) {
    try {
      let whereClause = 'WHERE 1=1';
      const params = [];
      
      if (campaignId) {
        whereClause += ' AND campaign_id = ?';
        params.push(campaignId);
      }
      
      if (dateFrom) {
        whereClause += ' AND start_time >= ?';
        params.push(dateFrom);
      }
      
      if (dateTo) {
        whereClause += ' AND start_time <= ?';
        params.push(dateTo + ' 23:59:59');
      }
      
      const [stats] = await db.query(`
        SELECT 
          COUNT(*) as total_transfers,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_transfers,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_transfers,
          SUM(CASE WHEN status = 'operator_calling' THEN 1 ELSE 0 END) as pending_transfers,
          AVG(CASE WHEN end_time IS NOT NULL THEN TIMESTAMPDIFF(SECOND, start_time, end_time) ELSE NULL END) as avg_duration
        FROM transfer_logs
        ${whereClause}
      `, params);
      
      const result = stats[0];
      result.success_rate = result.total_transfers > 0 
        ? Math.round((result.completed_transfers / result.total_transfers) * 100) 
        : 0;
      result.avg_duration = result.avg_duration ? Math.round(result.avg_duration) : 0;
      
      return result;
      
    } catch (error) {
      logger.error('転送統計取得エラー:', error);
      throw error;
    }
  }

  // 🧹 システム終了時のクリーンアップ
  async shutdown() {
    logger.info('TransferService終了処理開始...');
    
    // アクティブ転送を安全に終了
    for (const [transferId, transfer] of this.activeTransfers.entries()) {
      try {
        await this.updateTransferStatus(transferId, 'failed');
        logger.info(`転送を強制終了: ${transferId}`);
      } catch (error) {
        logger.error(`転送終了エラー: ${transferId}`, error);
      }
    }
    
    this.activeTransfers.clear();
    logger.info('✅ TransferService終了処理完了');
  }
}

// シングルトンインスタンス
const transferService = new TransferService();

// イベントリスナー
transferService.on('transferCompleted', (data) => {
  logger.info(`🎉 転送完了イベント: ${data.transferId} - ${data.customerPhone} → ${data.operatorNumber}`);
});

// プロセス終了時の安全な停止
process.on('SIGTERM', async () => {
  logger.info('SIGTERM受信 - TransferService安全停止');
  await transferService.shutdown();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT受信 - TransferService安全停止');
  await transferService.shutdown();
});

module.exports = transferService;

// ========================================
// callController.js への追加コード
// ========================================

// ✅ 以下のコードを callController.js に追加してください:

/*
// transferService.js をrequire（ファイル冒頭に追加）
const transferService = require('../services/transferService');

// handleCallEnd 関数内の1キー処理部分を以下に置き換え：
if (keypress === '1') {
  // 🔄 オペレーター転送処理
  try {
    logger.info(`🔄 1キー押下により転送開始: CallID=${callId}`);
    
    // 通話ログから必要な情報を取得
    const [callInfoResult] = await db.query(`
      SELECT cl.contact_id, cl.campaign_id, cl.phone_number,
             c.phone as original_number
      FROM call_logs cl
      LEFT JOIN contacts c ON cl.contact_id = c.id
      WHERE cl.call_id = ?
    `, [callId]);
    
    if (callInfoResult.length > 0) {
      const callInfo = callInfoResult[0];
      const customerPhone = callInfo.original_number || callInfo.phone_number;
      const campaignId = callInfo.campaign_id;
      
      if (customerPhone && campaignId) {
        // transferServiceで転送実行
        const transferResult = await transferService.initiateTransfer(
          callId, 
          customerPhone, 
          campaignId, 
          keypress
        );
        
        logger.info(`✅ 転送処理完了: ${transferResult.transferId}`);
        contactStatus = 'transferred'; // 連絡先ステータスを転送済みに
      } else {
        logger.warn(`転送に必要な情報が不足: CallID=${callId}`);
        contactStatus = 'completed';
      }
    }
  } catch (transferError) {
    logger.error(`転送処理エラー: CallID=${callId}`, transferError);
    contactStatus = 'completed'; // エラー時は完了扱い
  }
}

// 新規API関数を追加：

// 転送状態取得API
exports.getTransferStatus = async (req, res) => {
  try {
    const { transferId } = req.params;
    
    if (!transferId) {
      return res.status(400).json({ message: '転送IDが必要です' });
    }
    
    const transferStatus = await transferService.getTransferStatus(transferId);
    
    if (!transferStatus) {
      return res.status(404).json({ message: '転送情報が見つかりません' });
    }
    
    res.json({
      success: true,
      transfer: transferStatus,
      message: '転送状態を取得しました'
    });
    
  } catch (error) {
    logger.error('転送状態取得エラー:', error);
    res.status(500).json({ message: '転送状態の取得に失敗しました' });
  }
};

// 転送履歴一覧取得API
exports.getAllTransfers = async (req, res) => {
  try {
    const { page = 1, limit = 20, campaign, status, dateFrom, dateTo } = req.query;
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit)
    };
    
    if (campaign) options.campaignId = campaign;
    if (status) options.status = status;
    if (dateFrom) options.dateFrom = dateFrom;
    if (dateTo) options.dateTo = dateTo;
    
    const transferData = await transferService.getAllTransfers(options);
    
    res.json({
      success: true,
      ...transferData,
      message: '転送履歴を取得しました'
    });
    
  } catch (error) {
    logger.error('転送履歴取得エラー:', error);
    res.status(500).json({ message: '転送履歴の取得に失敗しました' });
  }
};

// 転送統計取得API
exports.getTransferStats = async (req, res) => {
  try {
    const { campaignId, dateFrom, dateTo } = req.query;
    
    const stats = await transferService.getTransferStats(campaignId, dateFrom, dateTo);
    
    res.json({
      success: true,
      stats,
      message: '転送統計を取得しました'
    });
    
  } catch (error) {
    logger.error('転送統計取得エラー:', error);
    res.status(500).json({ message: '転送統計の取得に失敗しました' });
  }
};
*/
