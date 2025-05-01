const events = require('events');
const logger = require('./logger');

class AsteriskService extends events.EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.mockMode = process.env.MOCK_ASTERISK === 'true';
  }

  async connect() {
    if (this.mockMode) {
      logger.info('Asteriskサービスにモックモードで接続しました');
      this.connected = true;
      return true;
    }

    logger.info('実際のAsteriskサービスに接続します - 未実装');
    this.connected = true;
    return true;
  }

  async originate(params) {
    if (this.mockMode) {
      logger.info(`モックモードで発信シミュレーション: 発信先=${params.phoneNumber}`);
      
      return {
        ActionID: `mock-${Date.now()}`,
        Response: 'Success',
        Message: 'Originate successfully queued (MOCK MODE)'
      };
    }

    logger.info(`実際の発信処理を実行 - 未実装`);
    return {
      ActionID: `real-${Date.now()}`,
      Response: 'Success',
      Message: 'Originate successfully queued'
    };
  }
}

module.exports = new AsteriskService();
