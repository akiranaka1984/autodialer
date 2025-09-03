const AmiClient = require('asterisk-ami-client');
const logger = require('./logger');
const { EventEmitter } = require('events');

class AsteriskService extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.mockMode = false; // process.env.MOCK_ASTERISK === 'true' から変更
    this.client = null;
    this.sipAccounts = [];
    this.callToAccountMap = new Map();
    this.connectionTimeout = 15000; // 🔥 追加: 15秒タイムアウト
    this.maxRetryAttempts = 3; // 🔥 追加: 最大リトライ回数
    this.retryAttempt = 0; // 🔥 追加: 現在のリトライ回数
    
    logger.info(`AsteriskService初期化: mockMode=${this.mockMode}, timeout=${this.connectionTimeout}ms`);
    
    // 自身のイベントハンドラーを設定
    this.on('callEnded', this.handleCallEnded.bind(this));
  }

  // 🔥 修正版: タイムアウト付きconnect()メソッド
  async connect() {
    logger.info('AsteriskService.connect() 開始');
    
    if (this.mockMode) {
      logger.info('Asteriskサービスにモックモードで接続しました');
      this.connected = true;
      
      // SIPアカウントのロード
      try {
        this.sipAccounts = this.loadSipAccounts();
        logger.info(`${this.sipAccounts.length}個のSIPアカウントを読み込みました（モックモード）`);
      } catch (err) {
        logger.error('SIPアカウントロードエラー（モックモード）:', err);
        // デフォルトアカウントを設定
        this.sipAccounts = [
          { username: 'mock-user1', password: 'mock-pass1', status: 'available' },
          { username: 'mock-user2', password: 'mock-pass2', status: 'available' }
        ];
      }
      
      return true;
    }

    try {
      logger.info('Asteriskサービスに接続を試みています...');
      
      // 🔥 タイムアウト処理付きで接続実行
      const connectionResult = await Promise.race([
        this.performAsteriskConnection(),
        this.createConnectionTimeout()
      ]);
      
      if (connectionResult === 'TIMEOUT') {
        throw new Error(`Asterisk接続がタイムアウトしました（${this.connectionTimeout}ms）`);
      }
      
      logger.info('✅ Asterisk接続成功');
      this.retryAttempt = 0; // 成功時はリトライ回数をリセット
      return true;
      
    } catch (error) {
      logger.error('❌ Asterisk接続エラー:', error.message);
      this.connected = false;
      
      // 🔥 重要: エラー時でもシステム全体は継続
      if (this.retryAttempt < this.maxRetryAttempts) {
        this.retryAttempt++;
        logger.warn(`Asterisk接続リトライ ${this.retryAttempt}/${this.maxRetryAttempts} を5秒後に実行`);
        
        // 5秒後にリトライ（非同期）
        setTimeout(() => {
          this.connect().catch(retryError => {
            logger.error('Asterisk接続リトライエラー:', retryError.message);
          });
        }, 5000);
      } else {
        logger.error('Asterisk接続の最大リトライ回数に達しました。Asterisk機能は無効になります。');
      }
      
      // 🔥 重要: エラーをスローせずfalseを返す（システム継続のため）
      return false;
    }
  }

  // 🔥 新規追加: 実際のAsterisk接続処理
  async performAsteriskConnection() {
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
      process.env.AMI_USERNAME || 'autodialer',
      process.env.AMI_SECRET || 'autodial123',
      {
        host: process.env.AMI_HOST || '127.0.0.1', // AMIホスト
        port: parseInt(process.env.AMI_PORT || '5038') // AMIポート 
      }
    );
    
    // SIPアカウントの初期化
    this.sipAccounts = this.loadSipAccounts();
    logger.info(`${this.sipAccounts.length}個のSIPアカウントを読み込みました`);
    
    return 'SUCCESS';
  }

  // 🔥 新規追加: タイムアウト用Promise
  createConnectionTimeout() {
    return new Promise((resolve) => {
      setTimeout(() => {
        logger.warn(`Asterisk接続タイムアウト（${this.connectionTimeout}ms）`);
        resolve('TIMEOUT');
      }, this.connectionTimeout);
    });
  }

  async originate(params) {
    logger.info('originate() 呼び出し, パラメータ:', JSON.stringify(params));
    
    if (this.mockMode) {
      logger.info(`モックモードで発信シミュレーション: 発信先=${params.phoneNumber}`);
      
      try {
        // 利用可能なSIPアカウント（モックモード）
        const sipAccount = await this.getAvailableSipAccount();
        if (!sipAccount) {
          logger.error('モックモードでもSIPアカウントが取得できません');
          throw new Error('利用可能なSIPアカウントがありません（モックモード）');
        }
        
        logger.info(`モックモードで使用するSIPアカウント: ${JSON.stringify(sipAccount)}`);
        
        const callId = `mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // SIPアカウントを使用中にマーク
        sipAccount.status = 'busy';
        sipAccount.lastUsed = new Date();
        
        // 通話IDとSIPアカウントを関連付け
        this.callToAccountMap.set(callId, sipAccount);
        
        logger.info(`モック通話ID作成: ${callId}, アカウントマッピング設定`);
        
        // 発信成功イベントをエミット
        this.emit('callStarted', {
          callId,
          number: params.phoneNumber,
          callerID: params.callerID || 'デフォルト番号',
          variables: params.variables || {},
          sipAccount: sipAccount.username
        });
        
        return {
          ActionID: callId,
          Response: 'Success',
          Message: 'Originate successfully queued (MOCK MODE)',
          SipAccount: sipAccount.username
        };
      } catch (error) {
        logger.error('モックモード発信エラー:', error);
        throw error;
      }
    }

    // 🔥 修正: Asterisk未接続時の処理改善
    if (!this.connected || !this.client) {
      logger.warn('Asteriskに未接続のため、発信をSIPサービスにフォールバック');
      throw new Error('Asterisk未接続のため発信できません。SIPサービスを使用してください。');
    }

    try {
      // 利用可能なSIPアカウントを取得
      logger.info('利用可能なSIPアカウントを検索中');
      const sipAccount = await this.getAvailableSipAccount();
      
      if (!sipAccount) {
        logger.error('利用可能なSIPアカウントが見つかりません');
        throw new Error('利用可能なSIPアカウントがありません');
      }
      
      logger.info(`発信処理を実行: 発信先=${params.phoneNumber}, SIPアカウント=${sipAccount.username}`);
      
      const actionId = `call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // SIPアカウント情報を設定
      const channel = `SIP/${sipAccount.username}/${params.phoneNumber}`;
      
      logger.info(`AMIアクション送信: Channel=${channel}, CallerID=${params.callerID}`);
      
      // Asterisk AMIに発信リクエストを送信
      const result = await this.client.action({
        Action: 'Originate',
        ActionID: actionId,
        Channel: channel,
        Context: params.context || 'autodialer',
        Exten: params.exten || 's',
        Priority: params.priority || 1,
        CallerID: params.callerID || `"Auto Dialer" <${process.env.DEFAULT_CALLER_ID || '03-5946-8520'}>`,
        Timeout: 30000,
        Async: true,
        Variable: this.formatVariables(params.variables)
      });
      
      logger.info('AMI発信結果:', JSON.stringify(result));
      
      // SIPアカウントのステータスを更新
      sipAccount.status = 'busy';
      sipAccount.lastUsed = new Date();
      
      // 通話IDとSIPアカウントを関連付け
      this.callToAccountMap.set(actionId, sipAccount);
      
      logger.info(`SIPアカウント使用中マーク: ID=${actionId}, アカウント=${sipAccount.username}`);
      
      return {
        ActionID: actionId,
        Response: result.Response,
        Message: result.Message,
        SipAccount: sipAccount.username
      };
    } catch (error) {
      logger.error('発信エラー:', error);
      logger.error('スタックトレース:', error.stack);
      throw error;
    }
  }

  // 変数を Asterisk AMI 形式にフォーマット
  formatVariables(variables) {
    logger.debug('formatVariables() 呼び出し:', JSON.stringify(variables));
    
    if (!variables) {
      logger.debug('variables が null/undefined のため空配列を返します');
      return [];
    }
    
    if (typeof variables !== 'object') {
      logger.debug(`variables がオブジェクトではありません: ${typeof variables}`);
      return [];
    }
    
    try {
      const entries = Object.entries(variables);
      logger.debug(`変数エントリー: ${JSON.stringify(entries)}`);
      
      const formatted = entries.map(([key, value]) => `${key}=${value}`);
      logger.debug(`フォーマット後: ${JSON.stringify(formatted)}`);
      
      return formatted;
    } catch (error) {
      logger.error('変数フォーマットエラー:', error);
      return [];  // エラー時は空配列を返す
    }
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

  // 通話終了イベントハンドラ
  async handleCallEnded(eventData) {
    const { callId } = eventData;
    logger.info(`通話終了イベント処理: ${callId}`);
    
    try {
      // SIPアカウントを解放
      await this.releaseCallResource(callId);
    } catch (error) {
      logger.error(`通話終了処理エラー: ${error.message}`);
    }
  }

  // テスト用に通話を終了させるメソッド（モックモード用）
  async simulateCallEnd(callId, status = 'ANSWERED', duration = 10) {
    logger.info(`simulateCallEnd() 呼び出し: callId=${callId}, status=${status}, duration=${duration}`);
    
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

  // SIPアカウントの読み込み
  loadSipAccounts() {
    logger.info('loadSipAccounts() 呼び出し');
    
    try {
      // 環境変数から読み込む
      const accountsStr = process.env.SIP_ACCOUNTS || '[]';
      logger.debug(`SIP_ACCOUNTS環境変数の長さ: ${accountsStr.length}文字`);
      
      let accounts = [];
      
      try {
        accounts = JSON.parse(accountsStr);
        logger.info(`JSONパース成功: ${accounts.length}個のアカウント`);
      } catch (err) {
        logger.error('SIPアカウント形式エラー:', err);
        accounts = [];
      }
      
      if (!Array.isArray(accounts)) {
        logger.error('SIPアカウントデータが配列ではありません:', typeof accounts);
        accounts = [];
      }
      
      if (accounts.length === 0) {
        logger.warn('SIPアカウントが設定されていません。デフォルトアカウントを使用します。');
        // デモ用のアカウントを追加
        accounts = [
          { username: '03080001', password: '56110478' },
          { username: '03080002', password: '51448459' }
        ];
      }
      
      // アカウントの初期状態を設定
      const formattedAccounts = accounts.map(account => ({
        ...account,
        status: 'available', // 初期状態は利用可能
        lastUsed: null
      }));
      
      logger.info(`${formattedAccounts.length}個のSIPアカウントを初期化しました`);
      return formattedAccounts;
    } catch (error) {
      logger.error('SIPアカウント読み込みエラー:', error);
      logger.error('スタックトレース:', error.stack);
      
      // エラー時は添付ファイルの情報を元にデフォルトアカウントを返す
      return [
        { username: '03080001', password: '56110478', status: 'available' },
        { username: '03080002', password: '51448459', status: 'available' }
      ];
    }
  }

  // 利用可能なSIPアカウントを取得
  async getAvailableSipAccount() {
    logger.info('getAvailableSipAccount() 呼び出し');
    
    if (!this.sipAccounts || this.sipAccounts.length === 0) {
      logger.info('SIPアカウントがないため、再読み込みを試みます');
      this.sipAccounts = this.loadSipAccounts();
    }
    
    if (!this.sipAccounts || this.sipAccounts.length === 0) {
      logger.warn('SIPアカウントが設定されていません');
      return null;
    }
    
    logger.debug(`検索対象アカウント数: ${this.sipAccounts.length}`);
    
    // 利用可能なアカウントを検索
    const availableAccount = this.sipAccounts.find(account => account && account.status === 'available');
    
    if (!availableAccount) {
      logger.warn('利用可能なSIPアカウントがありません');
      return null;
    }
    
    logger.info(`利用可能なSIPアカウントを見つけました: ${availableAccount.username}`);
    return availableAccount;
  }

  // 通話終了時のSIPアカウント解放
  async releaseCallResource(callId) {
    logger.info(`releaseCallResource() 呼び出し: callId=${callId}`);
    
    if (!callId) {
      logger.warn('無効な通話ID: undefined または null');
      return false;
    }
    
    if (this.mockMode) {
      logger.info(`モックモードでSIPリソース解放: ${callId}`);
    }
    
    try {
      // 通話IDに関連するSIPアカウントを検索
      if (this.callToAccountMap && this.callToAccountMap.has(callId)) {
        const sipAccount = this.callToAccountMap.get(callId);
        
        // SIPアカウントのステータスを利用可能に戻す
        sipAccount.status = 'available';
        
        // マッピングから削除
        this.callToAccountMap.delete(callId);
        
        logger.info(`SIPアカウント解放: callId=${callId}, account=${sipAccount.username}`);
      } else {
        logger.warn(`通話IDに関連するSIPアカウントが見つかりません: ${callId}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`SIPアカウント解放エラー: callId=${callId}`, error);
      return false;
    }
  }

  // AMI接続の切断
  async disconnect() {
    if (this.client && !this.mockMode) {
      await this.client.disconnect();
    }
    
    this.connected = false;
    logger.info('Asteriskサービスから切断しました');
  }

  // モックモードの設定
  setMockMode(mode) {
    this.mockMode = mode === true;
    logger.info(`Asteriskサービスのモックモードを${this.mockMode ? '有効' : '無効'}に設定`);
    return this.mockMode;
  }

  // 通話IDの存在確認
  async hasCall(callId) {
    if (!callId) return false;
    return this.callToAccountMap.has(callId);
  }

  // アクティブコール数の取得
  getActiveCallCount() {
    return this.callToAccountMap.size;
  }

  // アカウント状態の取得
  getAccountStatus() {
    return this.sipAccounts.map(account => ({
      username: account.username,
      status: account.status,
      lastUsed: account.lastUsed
    }));
  }

  // 通話終了処理
  async handleCallEnd(callId, duration, status, keypress) {
    logger.info(`Asterisk通話終了処理: callId=${callId}, status=${status}, duration=${duration}`);
    
    // 通話終了イベントをエミット
    this.emit('callEnded', {
      callId,
      status,
      duration
    });
    
    // リソースの解放
    return await this.releaseCallResource(callId);
  }
}

// シングルトンインスタンスを作成
const asteriskService = new AsteriskService();

module.exports = asteriskService;
