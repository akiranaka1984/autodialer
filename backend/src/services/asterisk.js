// backend/src/services/asterisk.js
const AmiClient = require('asterisk-ami-client');
const logger = require('./logger');
const { EventEmitter } = require('events');

class AsteriskService extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.mockMode = process.env.MOCK_ASTERISK === 'true';
    this.client = null;
  }

  async connect() {
    if (this.mockMode) {
      logger.info('Asteriskサービスにモックモードで接続しました');
      this.connected = true;
      return true;
    }

    try {
      logger.info('Asteriskサービスに接続を試みています...');
      
      // AMIクライアントを初期化
      this.client = new AmiClient({
        reconnect: true,
        maxRetries: 5,
        maxRetryTime: 5000,
        keepAlive: true
      });
      
      // AMIイベントハンドラーの設定
      this.client.on('connect', () => {
        logger.info('Asteriskサービスに接続しました');
        this.connected = true;
      });
      
      this.client.on('disconnect', () => {
        logger.warn('Asteriskサービスから切断されました');
        this.connected = false;
      });
      
      this.client.on('reconnection', () => {
        logger.info('Asteriskサービスに再接続しています...');
      });
      
      this.client.on('event', (event) => {
        // 通話イベント処理
        if (event.Event === 'Hangup') {
          this.emit('callEnded', {
            callId: event.Uniqueid,
            status: this.getHangupStatusFromCause(event.Cause),
            duration: parseInt(event.Duration || 0)
          });
        } else if (event.Event === 'OriginateResponse' && event.Response === 'Success') {
          this.emit('callStarted', {
            callId: event.Uniqueid,
            number: event.CallerIDNum,
            callerID: event.CallerID
          });
        }
      });
      
      // AMIに接続
      await this.client.connect(
        process.env.ASTERISK_USERNAME || 'admin',
        process.env.ASTERISK_PASSWORD || 'password',
        { host: process.env.ASTERISK_HOST || 'localhost', port: process.env.ASTERISK_PORT || 5038 }
      );
      
      return true;
    } catch (error) {
      logger.error('Asterisk接続エラー:', error);
      this.connected = false;
      throw error;
    }
  }

  async originate(params) {
    if (this.mockMode) {
      logger.info(`モックモードで発信シミュレーション: 発信先=${params.phoneNumber}`);
      
      const callId = `mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // 発信成功イベントをエミット
      this.emit('callStarted', {
        callId,
        number: params.phoneNumber,
        callerID: params.callerID,
        variables: params.variables
      });
      
      return {
        ActionID: callId,
        Response: 'Success',
        Message: 'Originate successfully queued (MOCK MODE)'
      };
    }

    if (!this.connected || !this.client) {
      await this.connect();
    }

    try {
      logger.info(`発信処理を実行: 発信先=${params.phoneNumber}, 発信元=${params.callerID || 'デフォルト番号'}`);
      
      const actionId = `call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Asterisk AMIに発信リクエストを送信
      const result = await this.client.action({
        Action: 'Originate',
        ActionID: actionId,
        Channel: `SIP/${params.phoneNumber}`,
        Context: params.context || 'autodialer',
        Exten: params.exten || 's',
        Priority: params.priority || 1,
        CallerID: params.callerID || '"Auto Dialer" <0312345678>',
        Timeout: 30000,
        Async: true,
        Variable: this.formatVariables(params.variables)
      });
      
      return {
        ActionID: actionId,
        Response: result.Response,
        Message: result.Message
      };
    } catch (error) {
      logger.error('発信エラー:', error);
      throw error;
    }
  }

  // 変数を Asterisk AMI 形式にフォーマット
  formatVariables(variables) {
    if (!variables) return [];
    
    return Object.entries(variables).map(([key, value]) => `${key}=${value}`);
  }

  // 切断原因コードからステータスを取得
  getHangupStatusFromCause(cause) {
    const causeCode = parseInt(cause);
    
    switch (causeCode) {
      case 16: // NORMAL_CLEARING
        return 'ANSWERED';
      case 17: // USER_BUSY
        return 'BUSY';
      case 18: // NO_USER_RESPONSE
      case 19: // NO_ANSWER
        return 'NO ANSWER';
      case 21: // CALL_REJECTED
        return 'REJECTED';
      default:
        return 'FAILED';
    }
  }

  // テスト用に通話を終了させるメソッド（モックモード用）
  async simulateCallEnd(callId, status = 'ANSWERED', duration = 10) {
    if (!this.mockMode) {
      logger.warn('実環境でのコール終了シミュレーションは無効です');
      return false;
    }
    
    logger.info(`通話終了シミュレーション: callId=${callId}, status=${status}, duration=${duration}秒`);
    
    // 通話終了イベントをエミット
    this.emit('callEnded', {
      callId,
      status,
      duration
    });
    
    return true;
  }

  // AMI接続の切断
  async disconnect() {
    if (this.client && !this.mockMode) {
      await this.client.disconnect();
    }
    
    this.connected = false;
    logger.info('Asteriskサービスから切断しました');
  }
}

module.exports = new AsteriskService();