const logger = require('./logger');
const { EventEmitter } = require('events');

class AsteriskMockService extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    logger.info('Asteriskモックサービスを初期化しました');
  }

  async connect() {
    logger.info('Asteriskモックサービスに接続しました（シミュレーション）');
    this.connected = true;
    return true;
  }

  async originate(params) {
    logger.info(`発信シミュレーション: 発信先=${params.phoneNumber}, 発信元=${params.callerID || 'デフォルト番号'}`);
    
    // 実際の発信が行われるまでの遅延をシミュレート
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 発信ID（実際のAsteriskでは通話IDが返される）
    const callId = `mock-call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // 通話開始イベントをエミット
    this.emit('callStarted', {
      callId,
      number: params.phoneNumber,
      callerID: params.callerID,
      variables: params.variables
    });
    
    // 成功レスポンスをシミュレート
    return {
      ActionID: callId,
      Response: 'Success',
      Message: 'Originate successfully queued (MOCK MODE)'
    };
  }

  // テスト用に通話を終了させるメソッド
  async simulateCallEnd(callId, status = 'ANSWERED', duration = 10) {
    logger.info(`通話終了シミュレーション: callId=${callId}, status=${status}, duration=${duration}秒`);
    
    // 通話終了イベントをエミット
    this.emit('callEnded', {
      callId,
      status,
      duration
    });
    
    return true;
  }
}

module.exports = new AsteriskMockService();
