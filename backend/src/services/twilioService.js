const twilio = require('twilio');
const logger = require('./logger');
const { EventEmitter } = require('events');

class TwilioService extends EventEmitter {
  constructor() {
    super();
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioNumber = process.env.TWILIO_PHONE_NUMBER;
    this.client = null;
    this.connected = false;
  }

  async connect() {
    try {
      logger.info('Twilioサービスに接続を試みています...');
      
      // Twilioクライアントを初期化
      this.client = twilio(this.accountSid, this.authToken);
      
      // アカウント情報を取得して接続確認
      const account = await this.client.api.accounts(this.accountSid).fetch();
      
      if (account) {
        this.connected = true;
        logger.info('Twilioサービスに接続しました');
        return true;
      }
    } catch (error) {
      logger.error('Twilio接続エラー:', error);
      this.connected = false;
      throw error;
    }
  }

  async originate(params) {
    if (!this.connected || !this.client) {
      await this.connect();
    }

    try {
      logger.info(`発信処理を実行: 発信先=${params.phoneNumber}, 発信元=${params.callerID || this.twilioNumber}`);
      
      const actionId = `call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // TwiMLを構築してコールバックURLを指定
      const twiml = `<Response><Say language="ja-JP">これはテスト通話です。</Say><Pause length="2"/><Say language="ja-JP">1を押すとオペレータに接続します。9を押すと通話を終了します。</Say><Gather numDigits="1" action="${process.env.PUBLIC_URL || 'http://your-server-url'}/api/callback/keypress?callId=${actionId}" method="POST"/></Response>`;
      
      // 発信元番号の設定
      const from = params.callerID || this.twilioNumber;
      
      // Twilioで発信
      const call = await this.client.calls.create({
        to: `+81${params.phoneNumber.replace(/^0/, '')}`, // 日本の電話番号形式に変換
        from: from,
        twiml: twiml
      });
      
      // 発信開始イベントをエミット
      this.emit('callStarted', {
        callId: actionId,
        twilioCallSid: call.sid,
        number: params.phoneNumber,
        callerID: from,
        variables: params.variables
      });
      
      // コールステータスのモニタリング
      this.monitorCallStatus(call.sid, actionId);
      
      return {
        ActionID: actionId,
        TwilioSID: call.sid,
        Response: 'Success',
        Message: 'Call successfully placed'
      };
    } catch (error) {
      logger.error('Twilio発信エラー:', error);
      throw error;
    }
  }

  // コールステータスの監視
  async monitorCallStatus(callSid, actionId) {
    try {
      // 5秒ごとにステータスをチェック
      const checkStatus = async () => {
        try {
          const call = await this.client.calls(callSid).fetch();
          
          // 通話が終了した場合
          if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(call.status)) {
            clearInterval(interval);
            
            // 通話終了イベントをエミット
            this.emit('callEnded', {
              callId: actionId,
              twilioCallSid: callSid,
              status: this.mapTwilioStatus(call.status),
              duration: call.duration || 0
            });
          }
        } catch (err) {
          logger.error(`コールステータス監視エラー: ${err.message}`);
          clearInterval(interval);
        }
      };
      
      // 定期的にステータスをチェック
      const interval = setInterval(checkStatus, 5000);
      
      // 初回チェック
      await checkStatus();
    } catch (error) {
      logger.error(`コールモニタリングエラー: ${error.message}`);
    }
  }

  // Twilioステータスをシステムのステータスにマッピング
  mapTwilioStatus(twilioStatus) {
    switch (twilioStatus) {
      case 'completed':
        return 'ANSWERED';
      case 'busy':
        return 'BUSY';
      case 'failed':
        return 'FAILED';
      case 'no-answer':
        return 'NO ANSWER';
      case 'canceled':
        return 'CANCELED';
      default:
        return 'UNKNOWN';
    }
  }
}

module.exports = new TwilioService();