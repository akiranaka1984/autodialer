// src/services/sipService.js
const { spawn } = require('child_process');
const logger = require('./logger');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

class SipService extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.mockMode = process.env.MOCK_SIP === 'true';
    this.sipAccounts = [];
    this.callToAccountMap = new Map();
    this.activeCallsMap = new Map();
    
    // SIPコマンドのパス
    this.sipcmdPath = process.env.SIPCMD_PATH || '/usr/local/bin/sipcmd';
    
    logger.info(`SipService初期化: mockMode=${this.mockMode}, sipcmdPath=${this.sipcmdPath}`);
    
    // 自身のイベントハンドラーを設定
    this.on('callEnded', this.handleCallEnded.bind(this));
  }

  async connect() {
    if (this.mockMode) {
      logger.info('SIPサービスにモックモードで接続しました');
      this.connected = true;
      
      // モックアカウントの設定
      this.sipAccounts = [
        { username: '03080001', password: '56110478', status: 'available', callerID: '0359468520' },
        { username: '03080002', password: '51448459', status: 'available', callerID: '0335289538' }
      ];
      
      return true;
    }

    try {
      logger.info('SIPサービスに接続を試みています...');
      
      // sipcmdコマンドの存在チェック
      try {
        fs.accessSync(this.sipcmdPath, fs.constants.X_OK);
        logger.info(`SIPコマンド確認済み: ${this.sipcmdPath}`);
      } catch (error) {
        logger.error(`sipcmdコマンドが見つからないか実行できません: ${this.sipcmdPath}`);
        throw new Error(`SIP発信コマンドが使用できません: ${error.message}`);
      }
      
      // SIPアカウント情報をロード
      this.sipAccounts = this.loadSipAccounts();
      
      if (this.sipAccounts.length === 0) {
        throw new Error('SIPアカウントが設定されていません');
      }
      
      logger.info(`${this.sipAccounts.length}個のSIPアカウントを読み込みました`);
      
      // 定期的なステータスモニタリングを開始
      this.startStatusMonitoring();
      
      this.connected = true;
      logger.info('SIPサービスへの接続が完了しました');
      
      return true;
    } catch (error) {
      logger.error('SIP接続エラー:', error);
      this.connected = false;
      throw error;
    }
  }
  
  // SIPアカウント情報の取得
  loadSipAccounts() {
    logger.info('SIPアカウントを読み込み中...');
    
    try {
      // 環境変数から読み込む
      let accounts = [];
      
      // まずJSON文字列から読み込み
      const accountsStr = process.env.SIP_ACCOUNTS || '[]';
      if (accountsStr && accountsStr !== '[]') {
        try {
          accounts = JSON.parse(accountsStr);
          logger.info(`環境変数からSIPアカウント ${accounts.length}個 を読み込みました`);
        } catch (err) {
          logger.error('SIPアカウント形式エラー（環境変数）:', err);
        }
      }
      
      // アカウントが空なら、ファイルから読み込み
      if (accounts.length === 0) {
        const accountsFile = process.env.SIP_ACCOUNTS_FILE || path.join(__dirname, '../../config/sip-accounts.json');
        
        try {
          if (fs.existsSync(accountsFile)) {
            const fileContent = fs.readFileSync(accountsFile, 'utf8');
            accounts = JSON.parse(fileContent);
            logger.info(`ファイルから ${accounts.length}個 のSIPアカウントを読み込みました: ${accountsFile}`);
          }
        } catch (fileErr) {
          logger.error(`SIPアカウントファイル読み込みエラー: ${accountsFile}`, fileErr);
        }
      }
      
      // それでも空なら、ハードコードされたデフォルトアカウントを使用
      if (accounts.length === 0) {
        logger.warn('SIPアカウントが設定されていません。デフォルトアカウントを使用します。');
        accounts = [
          { username: '03080001', password: '56110478', callerID: '0359468520' },
          { username: '03080002', password: '51448459', callerID: '0335289538' }
        ];
      }
      
      // アカウントの初期状態を設定
      const formattedAccounts = accounts.map(account => ({
        ...account,
        status: 'available', // 初期状態は利用可能
        lastUsed: null,
        failCount: 0
      }));
      
      logger.info(`${formattedAccounts.length}個のSIPアカウントを初期化しました`);
      return formattedAccounts;
    } catch (error) {
      logger.error('SIPアカウント読み込みエラー:', error);
      
      // エラー時はデフォルトアカウントを返す
      return [
        { username: '03080001', password: '56110478', callerID: '0359468520', status: 'available', lastUsed: null, failCount: 0 },
        { username: '03080002', password: '51448459', callerID: '0335289538', status: 'available', lastUsed: null, failCount: 0 }
      ];
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
      
      if (!sipAccount) {
        throw new Error('利用可能なSIPアカウントが見つかりません');
      }
      
      // 発信先電話番号のフォーマット処理
      const formattedNumber = this.formatPhoneNumber(params.phoneNumber);
      const sipServer = process.env.SIP_SERVER || 'ito258258.site';
      const sipPort = process.env.SIP_PORT || '5060';
      
      // 発信IDの生成
      const callId = 'sip-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
      
      // sipcmdコマンドの引数を生成
      // 具体的な引数はsipcmdツールのバージョンによって異なる場合があります
      const args = [
        '-u', sipAccount.username,          // ユーザー名
        '-p', sipAccount.password,          // パスワード
        '-P', 'udp',                        // プロトコル
        '-a', sipAccount.username,          // 認証ユーザー名
        '-h', sipServer,                    // SIPサーバー
        '-d', sipPort,                      // SIPサーバーポート
        '-t', formattedNumber,              // 発信先
        '--from-name', params.callerID ? params.callerID.replace(/[<>]/g, '') : (sipAccount.callerID || '0359468520'),
        '--timeout', '60'                   // 発信タイムアウト（秒）
      ];
      
      logger.debug(`sipcmdコマンド実行: ${this.sipcmdPath} ${args.join(' ')}`);
      
      // SIPアカウントを使用中にマーク
      sipAccount.status = 'busy';
      sipAccount.lastUsed = new Date();
      
      // 通話IDとSIPアカウントを関連付け
      this.callToAccountMap.set(callId, sipAccount);
      
      // sipcmdプロセスを起動
      const sipcmdProcess = spawn(this.sipcmdPath, args);
      
      // アクティブコールマップに追加
      this.activeCallsMap.set(callId, {
        process: sipcmdProcess,
        startTime: Date.now(),
        status: 'calling',
        phoneNumber: formattedNumber
      });
      
      // プロセス出力の処理
      sipcmdProcess.stdout.on('data', (data) => {
        const output = data.toString();
        logger.debug(`sipcmd出力: ${output}`);
        
        // 発信状況の処理
        if (output.includes('Call established') || output.includes('Connected')) {
          const callData = this.activeCallsMap.get(callId);
          if (callData) {
            callData.status = 'answered';
            this.activeCallsMap.set(callId, callData);
            logger.info(`通話確立: callId=${callId}, number=${formattedNumber}`);
          }
        }
      });
      
      // エラー出力の処理
      sipcmdProcess.stderr.on('data', (data) => {
        logger.error(`sipcmd エラー: ${data.toString()}`);
      });
      
      // プロセス終了時の処理
      sipcmdProcess.on('close', (code) => {
        logger.info(`sipcmdプロセス終了: コード=${code}, callId=${callId}`);
        
        // 通話終了イベントをエミット
        const callData = this.activeCallsMap.get(callId);
        
        if (callData) {
          const duration = Math.round((Date.now() - callData.startTime) / 1000);
          let status = 'COMPLETED';
          
          if (code !== 0) {
            if (callData.status === 'calling') {
              status = code === 1 ? 'NO ANSWER' : (code === 2 ? 'BUSY' : 'FAILED');
            } else if (callData.status === 'answered') {
              status = 'ANSWERED'; // 応答後の終了は正常終了
            } else {
              status = 'FAILED';
            }
            
            // エラーコードが発生した場合、アカウントの失敗カウントを増やす
            if (status === 'FAILED') {
              sipAccount.failCount = (sipAccount.failCount || 0) + 1;
              
              // 失敗回数が一定数を超えたらアカウントを一時的に無効化
              if (sipAccount.failCount >= 3) {
                logger.warn(`SIPアカウント ${sipAccount.username} を一時的に無効化します（失敗回数: ${sipAccount.failCount}）`);
                sipAccount.status = 'error';
                
                // 30分後に再度有効化
                setTimeout(() => {
                  sipAccount.status = 'available';
                  sipAccount.failCount = 0;
                  logger.info(`SIPアカウント ${sipAccount.username} を再度有効化しました`);
                }, 30 * 60 * 1000);
              }
            }
          } else if (callData.status === 'answered') {
            status = 'ANSWERED';
            // 成功した場合は失敗カウントをリセット
            sipAccount.failCount = 0;
          }
          
          this.emit('callEnded', {
            callId,
            status,
            duration: callData.status === 'answered' ? duration : 0
          });
          
          // マップから削除
          this.activeCallsMap.delete(callId);
        }
        
        // リソース解放
        this.releaseCallResource(callId);
      });
      
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
        SipAccount: sipAccount.username,
        provider: 'sip'
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
        callerID: params.callerID || sipAccount.callerID || '0359468520',
        variables: params.variables || {}
      });
      
      return {
        ActionID: callId,
        Response: 'Success',
        Message: 'Originate successfully queued (SIP MOCK)',
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
      // アクティブコールを停止
      const callData = this.activeCallsMap.get(callId);
      if (callData && callData.process) {
        try {
          callData.process.kill();
          logger.info(`SIP通話プロセスを終了: ${callId}`);
        } catch (processError) {
          logger.warn(`SIP通話プロセス終了エラー: ${processError.message}`);
        }
        this.activeCallsMap.delete(callId);
      }
      
      // 通話IDに関連するSIPアカウントを検索
      if (this.callToAccountMap.has(callId)) {
        const sipAccount = this.callToAccountMap.get(callId);
        
        // SIPアカウントのステータスを利用可能に戻す
        if (sipAccount.status !== 'error') { // エラー状態のアカウントはそのまま
          sipAccount.status = 'available';
        }
        
        // マッピングから削除
        this.callToAccountMap.delete(callId);
        
        logger.info(`SIPアカウント解放成功: ${callId}, account=${sipAccount.username}`);
      } else {
        logger.warn(`通話IDに関連するSIPアカウントが見つかりません: ${callId}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`SIPアカウント解放エラー: ${callId}`, error);
      return false;
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
  
  // 利用可能なSIPアカウント数を返す
  getAvailableSipAccountCount() {
    if (!this.sipAccounts) return 0;
    return this.sipAccounts.filter(account => account && account.status === 'available').length;
  }
  
  // テスト用に通話を終了させるメソッド
  async simulateCallEnd(callId, status = 'ANSWERED', duration = 10) {
    logger.info(`通話終了シミュレーション: callId=${callId}, status=${status}, duration=${duration}秒`);
    
    if (!this.mockMode) {
      // 実際のモードでは、アクティブコールを終了
      const callData = this.activeCallsMap.get(callId);
      if (callData && callData.process) {
        try {
          callData.process.kill();
        } catch (error) {
          logger.warn(`通話プロセス終了エラー: ${error.message}`);
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
  
  // SIPアカウントの状態をログ出力
  logAccountStatus() {
    const statusCounts = {
      available: 0,
      busy: 0,
      error: 0,
      total: this.sipAccounts.length
    };
    
    this.sipAccounts.forEach(acc => {
      if (acc.status === 'available') statusCounts.available++;
      else if (acc.status === 'busy') statusCounts.busy++;
      else statusCounts.error++;
    });
    
    logger.info(`SIPアカウント状態: 全体=${statusCounts.total}, 利用可能=${statusCounts.available}, 使用中=${statusCounts.busy}, エラー=${statusCounts.error}`);
    
    return statusCounts;
  }
  
  // 定期的な状態レポート
  startStatusMonitoring() {
    setInterval(() => {
      this.logAccountStatus();
      
      // 長時間使用中のアカウントをリセット（15分以上使用中の場合）
      const now = Date.now();
      this.sipAccounts.forEach(account => {
        if (account.status === 'busy' && account.lastUsed) {
          const usedForMs = now - account.lastUsed.getTime();
          if (usedForMs > 15 * 60 * 1000) { // 15分
            logger.warn(`長時間使用中のSIPアカウントをリセット: ${account.username}, 使用時間: ${Math.round(usedForMs/1000/60)}分`);
            account.status = 'available';
          }
        }
      });
      
      // 通話IDのクリーンアップ（古い通話ID）
      const activeCalls = [...this.callToAccountMap.keys()];
      activeCalls.forEach(callId => {
        const account = this.callToAccountMap.get(callId);
        if (account && account.lastUsed) {
          const usedForMs = now - account.lastUsed.getTime();
          if (usedForMs > 60 * 60 * 1000) { // 1時間
            logger.warn(`古い通話IDをクリーンアップ: ${callId}`);
            this.callToAccountMap.delete(callId);
          }
        }
      });
    }, 60000); // 1分ごと
  }
  
  setMockMode(mode) {
    this.mockMode = mode === true;
    logger.info(`SIPサービスのモックモードを${this.mockMode ? '有効' : '無効'}に設定`);
    return this.mockMode;
  }
  
  async hasCall(callId) {
    if (!callId) return false;
    return this.callToAccountMap.has(callId) || this.activeCallsMap.has(callId);
  }
  
  getActiveCallCount() {
    return this.activeCallsMap.size;
  }
  
  getAccountStatus() {
    return this.sipAccounts.map(account => ({
      username: account.username,
      status: account.status,
      callerID: account.callerID,
      lastUsed: account.lastUsed,
      failCount: account.failCount || 0
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