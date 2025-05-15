const JsSIP = require('jssip');
const logger = require('./logger');
const { EventEmitter } = require('events');

class SipService extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.mockMode = process.env.MOCK_SIP === 'true';
    this.sipAccounts = [];
    this.callToAccountMap = new Map();
    this.sessions = new Map();
    
    logger.info(`SipService初期化: mockMode=${this.mockMode}`);
    
    // 自身のイベントハンドラーを設定
    this.on('callEnded', this.handleCallEnded.bind(this));
  }

  async connect() {
    if (this.mockMode) {
      logger.info('SIPサービスにモックモードで接続しました');
      this.connected = true;
      
      // モックアカウントの設定
      this.sipAccounts = [
        { username: 'mock-user1', password: 'mock-pass1', status: 'available', callerID: '0359468520' },
        { username: 'mock-user2', password: 'mock-pass2', status: 'available', callerID: '0335289538' }
      ];
      
      return true;
    }

    try {
      logger.info('SIPサービスに接続を試みています...');
      
      // SIPアカウント情報をロード
      this.sipAccounts = this.loadSipAccounts();
      
      if (this.sipAccounts.length === 0) {
        throw new Error('SIPアカウントが設定されていません');
      }
      
      logger.info(`${this.sipAccounts.length}個のSIPアカウントを読み込みました`);
      
      // 各SIPアカウントへの接続を試みる
      for (const account of this.sipAccounts) {
        await this.initializeAccount(account);
      }
      
      this.connected = true;
      logger.info('SIPサービスへの接続が完了しました');
      
      return true;
    } catch (error) {
      logger.error('SIP接続エラー:', error);
      this.connected = false;
      throw error;
    }
  }
  
  async initializeAccount(account) {
    try {
      // JsSIPの設定
      const sipServer = process.env.SIP_SERVER || 'sip.provider.com';
      const wsServer = process.env.SIP_WS_SERVER || 'wss://sip.provider.com:8089/ws';
      
      // SocketインスタンスとUAの作成
      const socket = new JsSIP.WebSocketInterface(wsServer);
      const configuration = {
        sockets: [socket],
        uri: `sip:${account.username}@${sipServer}`,
        password: account.password,
        display_name: account.callerID || account.username,
        register: true
      };
      
      const ua = new JsSIP.UA(configuration);
      
      // イベントリスナーを設定
      ua.on('registered', () => {
        logger.info(`SIPアカウント ${account.username} が登録されました`);
        account.status = 'available';
        account.ua = ua;
      });
      
      ua.on('unregistered', () => {
        logger.warn(`SIPアカウント ${account.username} の登録が解除されました`);
        account.status = 'offline';
      });
      
      ua.on('registrationFailed', (ev) => {
        logger.error(`SIPアカウント ${account.username} の登録に失敗しました: ${ev.cause}`);
        account.status = 'error';
      });
      
      // 着信処理
      ua.on('newRTCSession', (ev) => {
        const session = ev.session;
        
        if (session.direction === 'incoming') {
          // 着信拒否（このシステムは発信専用）
          session.terminate();
        }
      });
      
      // UA起動
      ua.start();
      
      account.ua = ua;
      logger.info(`SIPアカウント ${account.username} の初期化が完了しました`);
      
      return true;
    } catch (error) {
      logger.error(`SIPアカウント ${account.username} の初期化エラー:`, error);
      account.status = 'error';
      return false;
    }
  }
  
  async originate(params) {
    if (this.mockMode) {
      return this.originateMock(params);
    }
    
    logger.info(`SIP発信を開始: 発信先=${params.phoneNumber}`);
    
    try {
      // 利用可能なSIPアカウントを取得
      const sipAccount = await this.getAvailableSipAccount();
      
      if (!sipAccount || !sipAccount.ua) {
        throw new Error('利用可能なSIPアカウントが見つかりません');
      }
      
      // 発信先電話番号のフォーマット処理
      const formattedNumber = this.formatPhoneNumber(params.phoneNumber);
      const targetUri = `sip:${formattedNumber}@${process.env.SIP_SERVER || 'sip.provider.com'}`;
      
      // 発信の設定
      const callOptions = {
        mediaConstraints: { audio: true, video: false },
        pcConfig: {
          iceServers: [
            { urls: ['stun:stun.l.google.com:19302'] }
          ]
        },
        extraHeaders: [
          `P-Asserted-Identity: <sip:${params.callerID || sipAccount.callerID}@${process.env.SIP_SERVER || 'sip.provider.com'}>`
        ]
      };
      
      // 発信IDの生成
      const callId = 'sip-' + Date.now();
      
      // 発信実行
      logger.info(`SIP発信実行: ${sipAccount.username} -> ${targetUri}`);
      const session = sipAccount.ua.call(targetUri, callOptions);
      
      // セッションイベントの処理
      session.on('connecting', () => {
        logger.info(`SIP発信中: ${callId}`);
      });
      
      session.on('progress', () => {
        logger.info(`SIP呼び出し中: ${callId}`);
      });
      
      session.on('accepted', () => {
        logger.info(`SIP通話応答: ${callId}`);
        // 通話開始時間を記録
        this.sessions.set(callId, {
          session,
          startTime: Date.now()
        });
      });
      
      session.on('ended', () => {
        logger.info(`SIP通話終了: ${callId}`);
        // 通話終了イベントを発火
        const sessionData = this.sessions.get(callId);
        const duration = sessionData ? Math.round((Date.now() - sessionData.startTime) / 1000) : 0;
        
        this.emit('callEnded', {
          callId,
          status: 'ANSWERED',
          duration
        });
        
        // セッション情報をクリーンアップ
        this.sessions.delete(callId);
      });
      
      session.on('failed', (e) => {
        logger.info(`SIP通話失敗: ${callId}, 理由: ${e.cause}`);
        
        // 通話終了イベントを発火
        this.emit('callEnded', {
          callId,
          status: this.mapSipStatus(e.cause),
          duration: 0
        });
        
        // セッション情報をクリーンアップ
        this.sessions.delete(callId);
      });
      
      // SIPアカウントを使用中にマーク
      sipAccount.status = 'busy';
      sipAccount.lastUsed = new Date();
      
      // 通話IDとSIPアカウントを関連付け
      this.callToAccountMap.set(callId, sipAccount);
      
      // 発信成功イベントをエミット
      this.emit('callStarted', {
        callId,
        number: params.phoneNumber,
        callerID: params.callerID || sipAccount.callerID,
        variables: params.variables || {}
      });
      
      return {
        ActionID: callId,
        Response: 'Success',
        Message: 'SIP call successfully initiated',
        SipAccount: sipAccount.username
      };
    } catch (error) {
      logger.error('SIP発信エラー:', error);
      throw error;
    }
  }
  
  // モックモードでの発信処理
  async originateMock(params) {
    logger.info(`モックモードでSIP発信シミュレーション: 発信先=${params.phoneNumber}`);
    
    try {
      // 利用可能なSIPアカウントを取得
      const sipAccount = await this.getAvailableSipAccount();
      
      if (!sipAccount) {
        throw new Error('利用可能なSIPアカウントがありません（モックモード）');
      }
      
      const callId = `sip-mock-${Date.now()}`;
      
      // SIPアカウントを使用中にマーク
      sipAccount.status = 'busy';
      sipAccount.lastUsed = new Date();
      
      // 通話IDとSIPアカウントを関連付け
      this.callToAccountMap.set(callId, sipAccount);
      
      // 発信成功イベントをエミット
      this.emit('callStarted', {
        callId,
        number: params.phoneNumber,
        callerID: params.callerID || sipAccount.callerID || '0312345678',
        variables: params.variables || {}
      });
      
      return {
        ActionID: callId,
        Response: 'Success',
        Message: 'Originate successfully queued (SIP)',
        SipAccount: sipAccount.username,
        provider: 'sip'
      };
    } catch (error) {
      logger.error('モックモードSIP発信エラー:', error);
      throw error;
    }
  }
  
  // 電話番号を適切な形式にフォーマット
  formatPhoneNumber(phoneNumber) {
    // 日本の国内番号の場合、先頭の0を除去して国際形式に変換
    if (phoneNumber.startsWith('0')) {
      return phoneNumber.replace(/^0/, '81');
    }
    return phoneNumber;
  }
  
  // SIPステータスをシステム用ステータスにマッピング
  mapSipStatus(sipStatus) {
    const statusMap = {
      'Rejected': 'REJECTED',
      'Canceled': 'CANCELED',
      'Busy': 'BUSY',
      'No Answer': 'NO ANSWER',
      'Not Found': 'FAILED',
      'Connection Error': 'FAILED',
      'Transport Error': 'FAILED'
    };
    
    return statusMap[sipStatus] || 'FAILED';
  }
  
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
  
  async releaseCallResource(callId) {
    logger.info(`SIPリソース解放: ${callId}`);
    
    if (!callId) {
      logger.warn('無効な通話ID: undefined または null');
      return false;
    }
    
    try {
      // 通話IDに関連するSIPアカウントを検索
      if (this.callToAccountMap.has(callId)) {
        const sipAccount = this.callToAccountMap.get(callId);
        
        // SIPアカウントのステータスを利用可能に戻す
        sipAccount.status = 'available';
        
        // セッションの終了処理
        const sessionData = this.sessions.get(callId);
        if (sessionData && sessionData.session) {
          try {
            if (sessionData.session.isEstablished()) {
              sessionData.session.terminate();
            }
          } catch (e) {
            logger.warn(`セッション終了処理エラー: ${e.message}`);
          }
        }
        
        // マッピングから削除
        this.callToAccountMap.delete(callId);
        this.sessions.delete(callId);
        
        logger.info(`SIPアカウント解放成功: ${callId}`);
      } else {
        logger.warn(`通話IDに関連するSIPアカウントが見つかりません: ${callId}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`SIPアカウント解放エラー: ${callId}`, error);
      return false;
    }
  }
  
  // SIPアカウントの読み込み
  loadSipAccounts() {
    logger.info('SIPアカウントを読み込み中...');
    
    try {
      // 環境変数から読み込む
      const accountsStr = process.env.SIP_ACCOUNTS || '[]';
      
      let accounts = [];
      
      try {
        accounts = JSON.parse(accountsStr);
      } catch (err) {
        logger.error('SIPアカウント形式エラー:', err);
        accounts = [];
      }
      
      if (accounts.length === 0) {
        logger.warn('SIPアカウントが設定されていません。デフォルトアカウントを使用します。');
        // デフォルトアカウントを設定
        accounts = [
          {
            username: process.env.SIP_USERNAME || 'sipuser',
            password: process.env.SIP_PASSWORD || 'sippassword',
            callerID: process.env.SIP_CALLER_ID || '0312345678'
          }
        ];
      }
      
      // アカウントの初期状態を設定
      const formattedAccounts = accounts.map(account => ({
        ...account,
        status: 'offline', // 初期状態はオフライン
        lastUsed: null,
        ua: null
      }));
      
      logger.info(`${formattedAccounts.length}個のSIPアカウントを初期化しました`);
      return formattedAccounts;
    } catch (error) {
      logger.error('SIPアカウント読み込みエラー:', error);
      
      // エラー時はデフォルトアカウントを返す
      return [
        {
          username: process.env.SIP_USERNAME || 'sipuser',
          password: process.env.SIP_PASSWORD || 'sippassword',
          callerID: process.env.SIP_CALLER_ID || '0312345678',
          status: 'offline', 
          lastUsed: null,
          ua: null
        }
      ];
    }
  }
  
  // 利用可能なSIPアカウントを取得
  async getAvailableSipAccount() {
    logger.info('利用可能なSIPアカウントを検索中');
    
    if (!this.sipAccounts || this.sipAccounts.length === 0) {
      logger.info('SIPアカウントがないため、再読み込みを試みます');
      this.sipAccounts = this.loadSipAccounts();
    }
    
    if (!this.sipAccounts || this.sipAccounts.length === 0) {
      logger.warn('SIPアカウントが設定されていません');
      return null;
    }
    
    // 利用可能なアカウントを検索
    const availableAccount = this.sipAccounts.find(account => account && account.status === 'available');
    
    if (!availableAccount) {
      logger.warn('利用可能なSIPアカウントがありません');
      return null;
    }
    
    logger.info(`利用可能なSIPアカウントを見つけました: ${availableAccount.username}`);
    return availableAccount;
  }
  
  // テスト用に通話を終了させるメソッド
  async simulateCallEnd(callId, status = 'ANSWERED', duration = 10) {
    logger.info(`通話終了シミュレーション: callId=${callId}, status=${status}, duration=${duration}秒`);
    
    if (!this.mockMode && this.sessions.has(callId)) {
      const sessionData = this.sessions.get(callId);
      if (sessionData && sessionData.session) {
        try {
          if (sessionData.session.isEstablished()) {
            sessionData.session.terminate();
          }
        } catch (e) {
          logger.warn(`セッション終了処理エラー: ${e.message}`);
        }
      }
    }
    
    // 通話終了イベントをエミット
    this.emit('callEnded', {
      callId,
      status,
      duration
    });
    
    return true;
  }
  
  // SIP接続の切断
  async disconnect() {
    if (this.mockMode) {
      logger.info('モックモードのSIPサービスを切断しました');
      this.connected = false;
      return true;
    }
    
    try {
      // 各SIPアカウントのUAを停止
      for (const account of this.sipAccounts) {
        if (account.ua) {
          account.ua.stop();
        }
      }
      
      this.connected = false;
      logger.info('SIPサービスから切断しました');
      return true;
    } catch (error) {
      logger.error('SIP切断エラー:', error);
      return false;
    }
  }
  
  setMockMode(mode) {
    this.mockMode = mode === true;
    logger.info(`SIPサービスのモックモードを${this.mockMode ? '有効' : '無効'}に設定`);
    return this.mockMode;
  }
  
  async hasCall(callId) {
    if (!callId) return false;
    return this.callToAccountMap.has(callId) || this.sessions.has(callId);
  }
  
  getActiveCallCount() {
    return this.callToAccountMap.size;
  }
  
  getAccountStatus() {
    return this.sipAccounts.map(account => ({
      username: account.username,
      status: account.status,
      callerID: account.callerID,
      lastUsed: account.lastUsed
    }));
  }
  
  async handleCallEnd(callId, duration, status, keypress) {
    logger.info(`SIP通話終了処理: callId=${callId}, status=${status}, duration=${duration}`);
    
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
const sipService = new SipService();

module.exports = sipService;