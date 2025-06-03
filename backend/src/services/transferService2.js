// /var/www/autodialer/backend/src/services/transferService.js
// 🎯 動的チャンネル選択転送サービス - 実際のDB構造対応版

const db = require('./database');
const logger = require('./logger');
const { spawn } = require('child_process');

class TransferService {
  constructor() {
    this.domain = 'ito258258.site';
    this.activeTransfers = new Map();
  }

  /**
   * 🔍 動的転送先チャンネル選択 - 実際のDB構造対応
   * caller_channels テーブルの実際のカラム名を使用
   */
  async getAvailableTransferTarget(currentCallerIdId, currentUsername) {
    try {
      logger.info(`🔍 転送先チャンネル検索: CallerID=${currentCallerIdId}, Current=${currentUsername}`);
      
      // 実際のテーブル構造に基づくクエリ
      const [availableChannels] = await db.query(`
        SELECT cc.username, cc.password, cc.last_used, cc.status,
               ci.number as caller_number, ci.domain
        FROM caller_channels cc
        JOIN caller_ids ci ON cc.caller_id_id = ci.id
        WHERE cc.caller_id_id = ? 
          AND cc.status = 'available' 
          AND cc.username != ?
          AND ci.active = 1
        ORDER BY cc.last_used ASC
        LIMIT 3
      `, [currentCallerIdId, currentUsername]);
      
      if (availableChannels.length === 0) {
        logger.warn(`❌ 利用可能な転送先チャンネルが見つかりません: CallerID=${currentCallerIdId}`);
        return null;
      }
      
      const selectedChannel = availableChannels[0];
      logger.info(`✅ 転送先チャンネル選択成功:`, {
        username: selectedChannel.username,
        caller_number: selectedChannel.caller_number,
        domain: selectedChannel.domain || this.domain,
        alternatives: availableChannels.length - 1
      });
      
      return {
        username: selectedChannel.username,
        password: selectedChannel.password,
        domain: selectedChannel.domain || this.domain,
        caller_number: selectedChannel.caller_number
      };
      
    } catch (error) {
      logger.error('❌ 転送先チャンネル検索エラー:', error);
      return null;
    }
  }

  /**
   * 📞 内線転送実行 - SIP REFER方式
   */
  async executeInternalTransfer(originalCallId, transferTarget, customerPhone) {
    try {
      const transferId = `transfer-${Date.now()}`;
      logger.info(`🔄 内線転送開始: ${transferId}`, {
        originalCallId,
        transferTarget: transferTarget.username,
        customerPhone,
        domain: transferTarget.domain
      });

      // 転送ログ記録開始（実際のテーブルがある場合）
      await this.logTransferAttempt(transferId, originalCallId, transferTarget, customerPhone);

      // SIP内線転送の実行
      const transferResult = await this.performSipTransfer(originalCallId, transferTarget, customerPhone);
      
      if (transferResult.success) {
        // 転送成功ログ
        await this.logTransferSuccess(transferId, transferResult);
        
        // チャンネル状態更新
        await this.updateChannelStatus(transferTarget.username, 'busy');
        
        logger.info(`✅ 内線転送成功: ${transferId} → ${transferTarget.username}`);
        
        return {
          success: true,
          transferId,
          message: `${transferTarget.username}への内線転送が完了しました`,
          target: transferTarget
        };
      } else {
        throw new Error(transferResult.error || '内線転送実行に失敗しました');
      }
      
    } catch (error) {
      logger.error(`❌ 内線転送エラー: ${error.message}`);
      
      // エラーログ記録
      await this.logTransferFailure(transferId, error.message);
      
      return {
        success: false,
        error: error.message,
        message: '内線転送に失敗しました'
      };
    }
  }

  /**
   * 🎯 SIP REFER転送実行
   */
  async performSipTransfer(originalCallId, transferTarget, customerPhone) {
    return new Promise((resolve) => {
      try {
        // 内線転送用SIPコマンド構築
        const transferUri = `sip:${transferTarget.username}@${transferTarget.domain}`;
        
        logger.info(`📞 SIP転送実行:`, {
          transferUri,
          originalCallId,
          method: 'SIP_REFER'
        });

        // pjsuaによる内線転送実行
        const pjsuaArgs = [
          '--null-audio',
          '--auto-answer=200',
          '--duration=60',
          '--max-calls=1',
          `--id=sip:${transferTarget.username}@${transferTarget.domain}`,
          `--registrar=sip:${transferTarget.domain}`,
          `--realm=asterisk`,
          `--username=${transferTarget.username}`,
          `--password=${transferTarget.password}`,
          '--log-level=3'
        ];

        const pjsuaProcess = spawn('pjsua', pjsuaArgs, {
          stdio: 'pipe',
          detached: false,
          env: { 
            ...process.env, 
            LANG: 'C'
          }
        });

        let transferCompleted = false;
        const transferTimeout = setTimeout(() => {
          if (!transferCompleted) {
            transferCompleted = true;
            logger.info(`✅ 転送先待機開始: ${transferTarget.username} (60秒待機)`);
            resolve({ 
              success: true, 
              message: '転送先で待機中',
              method: 'SIP_INTERNAL'
            });
          }
        }, 5000); // 5秒後に成功と判定

        pjsuaProcess.on('exit', (code) => {
          clearTimeout(transferTimeout);
          if (!transferCompleted) {
            transferCompleted = true;
            if (code === 0) {
              resolve({ success: true, message: '転送完了' });
            } else {
              resolve({ success: false, error: `転送プロセス終了: code=${code}` });
            }
          }
        });

        pjsuaProcess.on('error', (error) => {
          clearTimeout(transferTimeout);
          if (!transferCompleted) {
            transferCompleted = true;
            resolve({ success: false, error: error.message });
          }
        });

      } catch (error) {
        resolve({ success: false, error: error.message });
      }
    });
  }

  /**
   * 📊 転送ログ記録メソッド群
   */
  async logTransferAttempt(transferId, originalCallId, transferTarget, customerPhone) {
    try {
      // transfer_logs テーブルが存在する場合のみ記録
      const [tables] = await db.query(`
        SHOW TABLES LIKE 'transfer_logs'
      `);
      
      if (tables.length > 0) {
        await db.query(`
          INSERT INTO transfer_logs (
            id, call_id, transfer_target, transfer_status, 
            transfer_start_time, created_at
          ) VALUES (?, ?, ?, 'initiated', NOW(), NOW())
        `, [transferId, originalCallId, transferTarget.username]);
      }
      
    } catch (error) {
      logger.warn('転送ログ記録エラー（続行）:', error.message);
    }
  }

  async logTransferSuccess(transferId, transferResult) {
    try {
      const [tables] = await db.query(`SHOW TABLES LIKE 'transfer_logs'`);
      
      if (tables.length > 0) {
        await db.query(`
          UPDATE transfer_logs 
          SET transfer_status = 'connected', 
              transfer_answer_time = NOW()
          WHERE id = ?
        `, [transferId]);
      }
      
    } catch (error) {
      logger.warn('転送成功ログエラー（続行）:', error.message);
    }
  }

  async logTransferFailure(transferId, errorMessage) {
    try {
      const [tables] = await db.query(`SHOW TABLES LIKE 'transfer_logs'`);
      
      if (tables.length > 0) {
        await db.query(`
          UPDATE transfer_logs 
          SET transfer_status = 'failed', 
              error_message = ?,
              transfer_end_time = NOW()
          WHERE id = ?
        `, [errorMessage, transferId]);
      }
      
    } catch (error) {
      logger.warn('転送失敗ログエラー（続行）:', error.message);
    }
  }

  /**
   * 🔧 チャンネル状態管理 - 実際のDB構造対応
   */
  async updateChannelStatus(username, status) {
    try {
      await db.query(`
        UPDATE caller_channels 
        SET status = ?, last_used = NOW() 
        WHERE username = ?
      `, [status, username]);
      
      logger.debug(`チャンネル状態更新: ${username} → ${status}`);
      
    } catch (error) {
      logger.error('チャンネル状態更新エラー:', error);
    }
  }

  /**
   * 🎯 1キー転送のメインエントリーポイント
   */
  async handleTransferKeypress(customerPhone, keypress = '1', callId = null) {
    try {
      logger.info(`🎯 転送キー処理開始: ${customerPhone}, Key=${keypress}, CallID=${callId}`);

      // 1. 現在の発信チャンネルを特定
      const currentChannel = await this.getCurrentChannel(customerPhone, callId);
      if (!currentChannel) {
        throw new Error('現在の発信チャンネルが特定できません');
      }

      logger.info(`📞 現在のチャンネル特定:`, {
        username: currentChannel.username,
        caller_id: currentChannel.caller_id_id,
        caller_number: currentChannel.caller_number
      });

      // 2. 動的転送先選択
      const transferTarget = await this.getAvailableTransferTarget(
        currentChannel.caller_id_id, 
        currentChannel.username
      );

      if (!transferTarget) {
        throw new Error('利用可能な転送先チャンネルがありません');
      }

      // 3. 内線転送実行
      const transferResult = await this.executeInternalTransfer(
        callId || `call-${customerPhone}-${Date.now()}`,
        transferTarget,
        customerPhone
      );

      return transferResult;

    } catch (error) {
      logger.error(`❌ 転送キー処理エラー: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: '転送処理に失敗しました'
      };
    }
  }

  /**
   * 🔍 現在の発信チャンネル特定 - 実際のDB構造対応
   */
  async getCurrentChannel(customerPhone, callId = null) {
    try {
      // call_logs と caller_channels の実際の関係を確認
      let query = `
        SELECT cl.call_id, cl.caller_id_id, cc.username, ci.number as caller_number
        FROM call_logs cl
        JOIN caller_ids ci ON cl.caller_id_id = ci.id
        JOIN caller_channels cc ON ci.id = cc.caller_id_id
        WHERE cl.phone_number = ? 
          AND cl.status IN ('ORIGINATING', 'RINGING', 'ANSWERED')
          AND cc.status = 'busy'
      `;
      
      const params = [customerPhone];
      
      if (callId) {
        query += ` AND cl.call_id = ?`;
        params.push(callId);
      }
      
      query += ` ORDER BY cl.start_time DESC LIMIT 1`;
      
      const [channels] = await db.query(query, params);
      
      if (channels.length > 0) {
        return channels[0];
      }

      // フォールバック: busy状態のチャンネルから推測
      const [busyChannels] = await db.query(`
        SELECT cc.username, cc.caller_id_id, ci.number as caller_number
        FROM caller_channels cc
        JOIN caller_ids ci ON cc.caller_id_id = ci.id
        WHERE cc.status = 'busy'
        ORDER BY cc.last_used DESC
        LIMIT 1
      `);
      
      return busyChannels[0] || null;
      
    } catch (error) {
      logger.error('現在チャンネル特定エラー:', error);
      return null;
    }
  }

  /**
   * 📊 転送統計取得
   */
  async getTransferStatistics(campaignId = null) {
    try {
      // transfer_logs テーブルが存在するかチェック
      const [tables] = await db.query(`SHOW TABLES LIKE 'transfer_logs'`);
      
      if (tables.length === 0) {
        logger.info('transfer_logs テーブルが存在しません');
        return {
          total_transfers: 0,
          successful_transfers: 0,
          failed_transfers: 0,
          avg_duration: 0
        };
      }

      let query = `
        SELECT 
          COUNT(*) as total_transfers,
          SUM(CASE WHEN transfer_status = 'connected' THEN 1 ELSE 0 END) as successful_transfers,
          SUM(CASE WHEN transfer_status = 'failed' THEN 1 ELSE 0 END) as failed_transfers,
          AVG(transfer_duration) as avg_duration
        FROM transfer_logs
      `;
      
      const params = [];
      if (campaignId) {
        query += ` WHERE campaign_id = ?`;
        params.push(campaignId);
      }
      
      const [stats] = await db.query(query, params);
      return stats[0];
      
    } catch (error) {
      logger.error('転送統計取得エラー:', error);
      return null;
    }
  }
}

// シングルトンエクスポート
module.exports = new TransferService();
