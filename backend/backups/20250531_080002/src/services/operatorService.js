// backend/src/services/operatorService.js
const logger = require('./logger');
const db = require('./database');
const callService = require('./callService');
const websocketService = require('./websocketService');

class OperatorService {
  constructor() {
    this.activeOperators = new Map(); // オペレーターID => オペレーター情報
    this.callQueue = []; // 待機中の通話
  }

  // サービスの初期化
  async initialize() {
    try {
      // アクティブなオペレーターを取得
      const operators = await db.query(`
        SELECT o.*, u.name as operator_name 
        FROM operators o
        JOIN users u ON o.user_id = u.id
        WHERE o.status = 'available'
      `);
      
      // オペレーターを登録
      operators.forEach(operator => {
        this.activeOperators.set(operator.id, {
          id: operator.id,
          name: operator.operator_name,
          status: operator.status,
          currentCallId: operator.current_call_id,
          skills: operator.skills ? JSON.parse(operator.skills) : [],
          maxConcurrentCalls: operator.max_concurrent_calls,
          priority: operator.priority
        });
      });
      
      logger.info(`${this.activeOperators.size}人のオペレーターが利用可能です`);
      return true;
    } catch (error) {
      logger.error('オペレーターサービス初期化エラー:', error);
      return false;
    }
  }

  // 通話をオペレーターに割り当て
  async assignCallToOperator(callId, campaignId = null, requiredSkills = []) {
    try {
      logger.info(`通話をオペレーターに割り当て: callId=${callId}, campaignId=${campaignId}`);
      
      // 通話情報を取得
      const [calls] = await db.query(`
        SELECT cl.*, c.name as contact_name, ca.name as campaign_name
        FROM call_logs cl
        LEFT JOIN contacts c ON cl.contact_id = c.id
        LEFT JOIN campaigns ca ON cl.campaign_id = ca.id
        WHERE cl.call_id = ?
      `, [callId]);
      
      if (calls.length === 0) {
        throw new Error('通話情報が見つかりません');
      }
      
      const call = calls[0];
      
      // 利用可能なオペレーターを検索
      const availableOperator = this.findAvailableOperator(requiredSkills);
      
      if (!availableOperator) {
        logger.warn('利用可能なオペレーターがいません、通話を待機キューに追加します');
        
        // 待機キューに追加
        this.callQueue.push({
          callId,
          campaignId: campaignId || call.campaign_id,
          callData: call,
          requiredSkills,
          queuedAt: new Date()
        });
        
        // WebSocket通知を送信
        websocketService.notifyCallQueued(callId, call);
        
        return {
          success: false,
          message: 'オペレーターが利用できません、通話は待機キューに追加されました',
          queuePosition: this.callQueue.length
        };
      }
      
      // オペレーターを割り当て
      await this.assignCall(availableOperator, callId, call);
      
      return {
        success: true,
        operatorId: availableOperator.id,
        operatorName: availableOperator.name,
        message: `通話がオペレーター ${availableOperator.name} に割り当てられました`
      };
    } catch (error) {
      logger.error(`オペレーター割り当てエラー: callId=${callId}`, error);
      throw error;
    }
  }

  // 利用可能なオペレーターを検索
  findAvailableOperator(requiredSkills = []) {
    // 条件に合うオペレーターを検索
    const availableOperators = Array.from(this.activeOperators.values())
      .filter(operator => {
        // ステータスチェック
        if (operator.status !== 'available') {
          return false;
        }
        
        // スキルチェック（必要な場合）
        if (requiredSkills.length > 0) {
          // すべての必要スキルを持っているか確認
          const hasAllSkills = requiredSkills.every(skill => 
            operator.skills.includes(skill)
          );
          
          if (!hasAllSkills) {
            return false;
          }
        }
        
        return true;
      });
    
    if (availableOperators.length === 0) {
      return null;
    }
    
    // 優先度の高いオペレーターを選択
    availableOperators.sort((a, b) => b.priority - a.priority);
    
    return availableOperators[0];
  }

  // オペレーターに通話を割り当て
  async assignCall(operator, callId, callData) {
    try {
      // オペレーターのステータスを更新
      operator.status = 'busy';
      operator.currentCallId = callId;
      
      // データベースを更新
      await db.query(
        'UPDATE operators SET status = ?, current_call_id = ? WHERE id = ?',
        ['busy', callId, operator.id]
      );
      
      // 通話ログに記録
      await db.query(`
        INSERT INTO operator_call_logs 
        (operator_id, call_log_id, start_time)
        VALUES (?, (SELECT id FROM call_logs WHERE call_id = ?), NOW())
      `, [operator.id, callId]);
      
      // オペレーターマップを更新
      this.activeOperators.set(operator.id, operator);
      
      // WebSocket通知
      websocketService.notifyOperatorAssigned(callId, operator);
      
      logger.info(`通話 ${callId} をオペレーター ${operator.name} (ID: ${operator.id}) に割り当てました`);
      return true;
    } catch (error) {
      logger.error(`通話割り当てエラー: operatorId=${operator.id}, callId=${callId}`, error);
      throw error;
    }
  }

  // オペレーターのステータスを更新
  async updateOperatorStatus(operatorId, status, reason = null) {
    try {
      // 現在のステータスを取得
      const [operators] = await db.query(
        'SELECT status FROM operators WHERE id = ?',
        [operatorId]
      );
      
      if (operators.length === 0) {
        throw new Error('オペレーターが見つかりません');
      }
      
      const oldStatus = operators[0].status;
      
      // ステータスを更新
      await db.query(
        'UPDATE operators SET status = ? WHERE id = ?',
        [status, operatorId]
      );
      
      // ステータス変更ログを記録
      await db.query(`
        INSERT INTO operator_status_logs 
        (operator_id, old_status, new_status, reason, changed_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [operatorId, oldStatus, status, reason]);
      
      // アクティブオペレーターマップを更新
      if (this.activeOperators.has(operatorId)) {
        const operator = this.activeOperators.get(operatorId);
        operator.status = status;
        
        // 'available' 状態に変更される場合、現在の通話をクリア
        if (status === 'available') {
          operator.currentCallId = null;
        }
        
        this.activeOperators.set(operatorId, operator);
      }
      
      // 'available' 状態になった場合は待機キューをチェック
      if (status === 'available') {
        this.processCallQueue();
      }
      
      logger.info(`オペレーター ${operatorId} のステータスを ${oldStatus} から ${status} に更新しました`);
      return true;
    } catch (error) {
      logger.error(`オペレーターステータス更新エラー: ${operatorId}`, error);
      throw error;
    }
  }

  // 待機キューを処理
  async processCallQueue() {
    if (this.callQueue.length === 0) {
      return;
    }
    
    // キューから次の通話を取得
    const nextCall = this.callQueue.shift();
    
    try {
      // 利用可能なオペレーターを検索
      const availableOperator = this.findAvailableOperator(nextCall.requiredSkills);
      
      if (!availableOperator) {
        // 利用可能なオペレーターがいない場合はキューに戻す
        this.callQueue.unshift(nextCall);
        return;
      }
      
      // オペレーターに割り当て
      await this.assignCall(availableOperator, nextCall.callId, nextCall.callData);
      
      // 継続してキューを処理
      setTimeout(() => this.processCallQueue(), 1000);
    } catch (error) {
      logger.error('キュー処理エラー:', error);
      // エラーが発生しても処理は継続
      setTimeout(() => this.processCallQueue(), 5000);
    }
  }

  // 通話処理終了
  async completeCall(operatorId, callId, notes = null, disposition = 'completed') {
    try {
      // オペレーター通話ログを更新
      const [result] = await db.query(`
        UPDATE operator_call_logs
        SET end_time = NOW(), 
            duration = TIMESTAMPDIFF(SECOND, start_time, NOW()),
            disposition = ?,
            notes = ?
        WHERE operator_id = ? AND call_log_id = (
          SELECT id FROM call_logs WHERE call_id = ?
        )
      `, [disposition, notes, operatorId, callId]);
      
      // オペレーターのステータスを更新
      await this.updateOperatorStatus(operatorId, 'available', '通話終了');
      
      logger.info(`通話処理が完了しました: operatorId=${operatorId}, callId=${callId}, disposition=${disposition}`);
      return true;
    } catch (error) {
      logger.error(`通話完了処理エラー: operatorId=${operatorId}, callId=${callId}`, error);
      throw error;
    }
  }
}

// シングルトンインスタンス
const operatorService = new OperatorService();

module.exports = operatorService;