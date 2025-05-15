// src/services/sipService.js
const SIP = require('sip.js'); // または適切なSIPライブラリ
const logger = require('./logger');
const { EventEmitter } = require('events');

class SipService extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.mockMode = process.env.MOCK_SIP === 'true';
    this.sipAccounts = [];
    this.callToAccountMap = new Map();
    
    logger.info(`SipService初期化: mockMode=${this.mockMode}`);
    
    // 自身のイベントハンドラーを設定
    this.on('callEnded', this.handleCallEnded.bind(this));
  }

  async connect() {
    logger.info('SipService.connect() 開始');
    
    if (this.mockMode) {
      logger.info('SIPサービスにモックモードで接続しました');
      this.connected = true;
      
      // SIPアカウントのロード
      try {
        this.sipAccounts = this.loadSipAccounts();
        logger.info(`${this.sipAccounts.length}個のSIPアカウントを読み込みました（モックモード）`);
      } catch (err) {
        logger.error('SIPアカウントロードエラー（モックモード）:', err);
        // デフォルトアカウントを設定
        this.sipAccounts = [
          { username: 'mock-user1', password: 'mock-pass1', status: 'available', callerID: '0359468520' },
          { username: 'mock-user2', password: 'mock-pass2', status: 'available', callerID: '0335289538' }
        ];
      }
      
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
      
      // SIPクライアントの初期化
      // 注意: 実際にはSIPライブラリによって初期化方法が異なります
      try {
        // SIP.jsを使用した例
        this.client = new SIP.UA({
          uri: `sip:${this.sipAccounts[0].username}@${process.env.SIP_HOST}`,
          transportOptions: {
            wsServers: [`ws://${process.env.SIP_HOST}:${process.env.SIP_WS_PORT || 8088}`]
          },
          authorizationUser: this.sipAccounts[0].username,
          password: this.sipAccounts[0].password,
          displayName: this.sipAccounts[0].callerID,
          register: true,
          registerExpires: 300, // 5分
          iceCheckingTimeout: 5000,
          hackIpInContact: true,
          log: {
            level: process.env.NODE_ENV === 'production' ? 'error' : 'debug'
          }
        });
        
        // SIP.jsイベントハンドラー
        this.client.on('registered', () => {
          logger.info('SIPサービスに登録成功');
          this.connected = true;
        });
        
        this.client.on('unregistered', () => {
          logger.warn('SIPサービスから登録解除');
          this.connected = false;
        });
        
        this.client.on('registrationFailed', (response, cause) => {
          logger.error(`SIP登録失敗: ${cause}`);
          this.connected = false;
        });
        
        // 通話イベント監視
        this.client.on('invite', (session) => {
          // 着信処理（必要に応じて実装）
          logger.info(`SIP着信: ${session.remoteIdentity.uri}`);
        });
        
        // 接続確立
        this.client.start();
        
        logger.info('SIPクライアントを初期化しました');
      } catch (sipError) {
        logger.error('SIPクライアント初期化エラー:', sipError);
        throw sipError;
      }
      
      return true;
    } catch (error) {
      logger.error('SIP接続エラー:', error);
      this.connected = false;
      throw error;
    }
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
        
        const callId = `sip-mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
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
          callerID: params.callerID || sipAccount.callerID || '0359468520',
          variables: params.variables || {},
          sipAccount: sipAccount.username
        });
        
        return {
          ActionID: callId,
          Response: 'Success',
          Message: 'SIP call successfully queued (MOCK MODE)',
          SipAccount: sipAccount.username
        };
      } catch (error) {
        logger.error('モックモードSIP発信エラー:', error);
        throw error;
      }
    }

    if (!this.connected) {
      logger.info('SIPサービスに未接続のため、接続を試行します');
      await this.connect();
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
      
      const actionId = `sip-call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // 発信先番号のフォーマット処理
      const formattedNumber = this.formatPhoneNumber(params.phoneNumber);
      
      // 発信者番号の設定
      const callerID = params.callerID || sipAccount.callerID || process.env.DEFAULT_CALLER_ID;
      
      try {
        // SIP.jsを使った発信例
        const session = this.client.invite(`sip:${formattedNumber}@${process.env.SIP_HOST}`, {
          extraHeaders: [
            `P-Asserted-Identity: <sip:${callerID}@${process.env.SIP_HOST}>`,
            `X-Call-ID: ${actionId}`
          ],
          media: {
            constraints: { audio: true, video: false }
          },
          sessionDescriptionHandlerOptions: {
            constraints: { audio: true, video: false }
          }
        });
        
        // セッションイベントのハンドリング
        session.on('accepted', () => {
          logger.info(`SIP通話応答: ${actionId}`);
          // 通話応答イベントをエミット（必要に応じて）
        });
        
        session.on('terminated', (message, cause) => {
          logger.info(`SIP通話終了: ${actionId}, cause=${cause}`);
          this.emit('callEnded', {
            callId: actionId,
            status: this.mapSipStatus(cause),
            duration: Math.round((Date.now() - session.startTime) / 1000) || 0
          });
        });
        
        // 通話開始時間を記録
        session.startTime = Date.now();
        
        // セッションを保存
        this.callToAccountMap.set(actionId, {
          sipAccount,
          session,
          startTime: Date.now()
        });
        
        // 発信開始イベントをエミット
        this.emit('callStarted', {
          callId: actionId,
          number: params.phoneNumber,
          callerID: callerID,
          variables: params.variables || {}
        });
        
        logger.info(`SIP発信成功: ${actionId}`);
        
        // 結果を返す
        return {
          ActionID: actionId,
          Response: 'Success',
          Message: 'SIP call successfully placed',
          SipAccount: sipAccount.username
        };
      } catch (sipError) {
        logger.error(`SIP発信エラー: ${sipError.message}`);
        throw sipError;
      }
    } catch (error) {
      logger.error('発信エラー:', error);
      logger.error('スタックトレース:', error.stack);
      throw error;
    }
  }

  // SIPステータスをシステム用ステータスにマッピング
  mapSipStatus(sipStatus) {
    switch (sipStatus) {
      case 'Answered':
      case 'Normal Clearing':
        return 'ANSWERED';
      case 'Busy':
      case 'User Busy':
        return 'BUSY';
      case 'No Answer':
      case 'No User Response':
        return 'NO ANSWER';
      case 'Rejected':
      case 'Call Rejected':
        return 'REJECTED';
      default:
        return 'FAILED';
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
          { username: 'sip1', password: 'password1', callerID: '0359468520' },
          { username: 'sip2', password: 'password2', callerID: '0335289538' }
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
      
      // エラー時はデフォルトアカウントを返す
      return [
        { username: 'sip1', password: 'password1', status: 'available', callerID: '0359468520' },
        { username: 'sip2', password: 'password2', status: 'available', callerID: '0335289538' }
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
        const callData = this.callToAccountMap.get(callId);
        
        if (this.mockMode) {
          // モックモードの場合は単純にステータス変更
          callData.status = 'available';
        } else {
          // 実モードの場合はセッション終了処理
          const sipAccount = callData.sipAccount;
          const session = callData.session;
          
          // アクティブなセッションの場合は終了
          if (session && session.isEstablished()) {
            try {
              session.terminate();
            } catch (sessionError) {
              logger.warn(`セッション終了エラー: ${sessionError.message}`);
            }
          }
          
          // SIPアカウントのステータスを利用可能に戻す
          sipAccount.status = 'available';
        }
        
        // マッピングから削除
        this.callToAccountMap.delete(callId);
        
        logger.info(`SIPアカウント解放: callId=${callId}`);
      } else {
        logger.warn(`通話IDに関連するSIPアカウントが見つかりません: ${callId}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`SIPアカウント解放エラー: callId=${callId}`, error);
      return false;
    }
  }

  // SIP接続の切断
  async disconnect() {
    if (this.client && !this.mockMode) {
      try {
        // SIPクライアントを停止
        await this.client.stop();
        logger.info('SIPクライアントを停止しました');
      } catch (error) {
        logger.error('SIP切断エラー:', error);
      }
    }
    
    this.connected = false;
    logger.info('SIPサービスから切断しました');
  }

  // 全ての利用可能なSIPアカウント情報を取得（管理画面用）
  getAccountStatus() {
    return this.sipAccounts.map(account => ({
      username: account.username,
      status: account.status,
      callerID: account.callerID,
      lastUsed: account.lastUsed
    }));
  }
  // src/services/sipService.js に追加

  setMockMode(mode) {
    this.mockMode = mode === true;
    logger.info(`SIPサービスのモックモードを${this.mockMode ? '有効' : '無効'}に設定`);
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