// src/services/sipService.js
const { spawn } = require('child_process');
const logger = require('./logger');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const db = require('./database');  // データベース接続を追加

class SipService extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    // 環境変数に関わらずモックモードをオフに設定
    this.mockMode = false; // process.env.MOCK_SIP === 'true' から変更
    this.sipAccounts = [];
    this.callToAccountMap = new Map();
    this.activeCallsMap = new Map();
    
    // メイン発信者番号とチャンネルのマッピング
    this.callerIdToChannelsMap = new Map();
    
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
      
      // モックモードでもデータベースからチャンネル情報を読み込む
      this.sipAccounts = await this.loadSipAccountsFromDatabase();
      
      // モックデータが読み込めなかった場合はデフォルト値を設定
      if (this.sipAccounts.length === 0) {
        this.sipAccounts = [
          { username: '03080001', password: '56110478', status: 'available', callerID: '0359468520', mainCallerId: 1 },
          { username: '03080002', password: '51448459', status: 'available', callerID: '0335289538', mainCallerId: 2 }
        ];
      }
      
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
      
      // データベースからSIPアカウント情報をロード
      this.sipAccounts = await this.loadSipAccountsFromDatabase();
      
      // データベースから読み込めなかった場合はファイルから読み込む
      if (this.sipAccounts.length === 0) {
        this.sipAccounts = this.loadSipAccountsFromFile();
      }
      
      if (this.sipAccounts.length === 0) {
        throw new Error('SIPアカウントが設定されていません');
      }
      
      logger.info(`${this.sipAccounts.length}個のSIPアカウントを読み込みました`);
      
      // 発信者番号ごとのチャンネルグループを作成
      this.organizeChannelsByCallerId();
      
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
  
  // データベースからSIPアカウント情報を読み込む（新機能）
  async loadSipAccountsFromDatabase() {
    try {
      logger.info('データベースからSIPチャンネル情報を読み込み中...');
      
      // caller_idsとcaller_channelsテーブルからデータを取得（channel_typeも含める）
      const [channels] = await db.query(`
        SELECT cc.*, ci.number as caller_number, ci.description as description, 
              ci.provider, ci.domain, ci.id as main_caller_id,
              cc.channel_type
        FROM caller_channels cc
        JOIN caller_ids ci ON cc.caller_id_id = ci.id
        WHERE ci.active = true
      `);
      
      if (!channels || channels.length === 0) {
        logger.warn('データベースに有効なSIPチャンネルが見つかりません');
        return [];
      }
      
      // チャンネル情報の初期状態を設定
      const formattedAccounts = channels.map(channel => ({
        username: channel.username,
        password: channel.password,
        callerID: channel.caller_number,
        description: channel.description,
        domain: channel.domain,
        provider: channel.provider,
        mainCallerId: channel.main_caller_id, // メイン発信者番号IDを保持
        channelType: channel.channel_type || 'both', // チャンネルタイプを追加
        status: channel.status || 'available', // DBにステータスが保存されていればそれを使用
        lastUsed: channel.last_used || null,
        failCount: 0
      }));
      
      logger.info(`データベースから${formattedAccounts.length}個のSIPチャンネルを読み込みました`);
      return formattedAccounts;
    } catch (error) {
      logger.error('データベースからのSIPチャンネル読み込みエラー:', error);
      return [];
    }
  }
  
  // 発信者番号ごとにチャンネルをグループ化
  organizeChannelsByCallerId() {
    this.callerIdToChannelsMap.clear();
    
    // 各チャンネルをメイン発信者番号IDごとにグループ化
    this.sipAccounts.forEach(account => {
      if (!account.mainCallerId) return;
      
      if (!this.callerIdToChannelsMap.has(account.mainCallerId)) {
        this.callerIdToChannelsMap.set(account.mainCallerId, []);
      }
      
      this.callerIdToChannelsMap.get(account.mainCallerId).push(account);
    });
    
    // 発信者番号ごとのチャンネル数をログ出力
    this.callerIdToChannelsMap.forEach((channels, callerId) => {
      logger.info(`発信者番号ID ${callerId} のチャンネル数: ${channels.length}`);
    });
  }
  
  // ファイルからSIPアカウント情報を読み込む（従来機能）
  loadSipAccountsFromFile() {
    logger.info('ファイルからSIPアカウントを読み込み中...');
    
    
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
          { username: '03080001', password: '56110478', callerID: '0359468520', mainCallerId: 1 },
          { username: '03080002', password: '51448459', callerID: '0335289538', mainCallerId: 2 }
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
        { username: '03080001', password: '56110478', callerID: '0359468520', mainCallerId: 1, status: 'available', lastUsed: null, failCount: 0 },
        { username: '03080002', password: '51448459', callerID: '0335289538', mainCallerId: 2, status: 'available', lastUsed: null, failCount: 0 }
      ];
    }
  }
  
  async originate(params) {
    if (this.mockMode) {
      return this.originateMock(params);
    }
    
    logger.info(`SIP発信を開始: 発信先=${params.phoneNumber}`);
    
    try {
      // 特定の発信者番号のチャンネルを使用する場合
      // 使用目的を取得（デフォルトはoutbound）
      const channelType = params.channelType || 'outbound';
      
      // 特定の発信者番号のチャンネルを使用する場合
      let sipAccount = null;
      
      if (params.callerIdData && params.callerIdData.id) {
        // 特定の発信者番号ID向けの利用可能な指定用途のチャンネルを探す
        sipAccount = await this.getAvailableSipAccountByType(params.callerIdData.id, channelType);
        
        if (!sipAccount) {
          logger.warn(`発信者番号ID ${params.callerIdData.id} に利用可能な ${channelType} チャンネルがありません`);
          // バックアップとして任意の利用可能なチャンネルを使用
          sipAccount = await this.getAvailableSipAccount();
        }
      } else {
        // 任意の利用可能なチャンネルを使用
        sipAccount = await this.getAvailableSipAccount();
      }
      
      if (!sipAccount) {
        throw new Error('利用可能なSIPアカウントが見つかりません');
      }
      
      // 発信先電話番号のフォーマット処理
      const formattedNumber = this.formatPhoneNumber(params.phoneNumber);
      const sipServer = process.env.SIP_SERVER || 'ito258258.site';
      const sipPort = process.env.SIP_PORT || '5060';
      
      // 発信IDの生成
      const callId = 'sip-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
      
      // pjsua用の引数を生成
      const args = [
        sipAccount.username,          // ユーザー名
        sipAccount.password,          // パスワード
        sipServer,                    // SIPサーバー
        formattedNumber,              // 発信先
        '30'                          // 発信タイムアウト（秒）
      ];
      
      logger.debug(`sipcmdコマンド実行: ${this.sipcmdPath} ${args.join(' ')}`);
      
      // SIPアカウントを使用中にマーク
      sipAccount.status = 'busy';
      sipAccount.lastUsed = new Date();
      
      // データベースのチャンネル状態を更新
      if (sipAccount.channelId) {
        try {
          await db.query(
            'UPDATE caller_channels SET status = ?, last_used = NOW() WHERE id = ?',
            ['busy', sipAccount.channelId]
          );
        } catch (dbError) {
          logger.warn(`チャンネル状態更新エラー: ${dbError.message}`);
        }
      }
      
      // 通話IDとSIPアカウントを関連付け
      this.callToAccountMap.set(callId, sipAccount);
      
      // sipcmdプロセスを起動
    const sipcmdProcess = spawn(this.sipcmdPath, args);

// ここから新しいコードを追加
    // アクティブコールマップに追加
    this.activeCallsMap.set(callId, {
      process: sipcmdProcess,
      startTime: Date.now(),
      status: 'calling',
      phoneNumber: formattedNumber,
      callerID: sipAccount.callerID,
      mainCallerId: sipAccount.mainCallerId
    });

    // 発信状態監視のタイムアウト設定
    const callTimeout = setTimeout(() => {
      if (this.activeCallsMap.has(callId)) {
        const callData = this.activeCallsMap.get(callId);
        if (callData.status === 'calling') {
          logger.warn(`発信タイムアウト: callId=${callId}, number=${formattedNumber}`);
          
          // プロセスを強制終了
          if (callData.process) {
            try {
              callData.process.kill();
            } catch (killError) {
              logger.error(`プロセス終了エラー: ${killError.message}`);
            }
          }
          
          // 通話終了イベントをエミット
          this.emit('callEnded', {
            callId,
            status: 'NO ANSWER',
            duration: 0,
            mainCallerId: callData.mainCallerId
          });
          
          // マップから削除
          this.activeCallsMap.delete(callId);
          this.releaseCallResource(callId);
        }
      }
    }, 60000); // 60秒タイムアウト
      
      // アクティブコールマップに追加
      this.activeCallsMap.set(callId, {
        process: sipcmdProcess,
        startTime: Date.now(),
        status: 'calling',
        phoneNumber: formattedNumber,
        callerID: sipAccount.callerID,
        mainCallerId: sipAccount.mainCallerId
      });
      
      // プロセス出力の処理
      sipcmdProcess.stdout.on('data', (data) => {
        const output = data.toString();
        logger.debug(`sipcmd出力: ${output}`);
        
        // 発信状況の処理（pjsuaの出力パターンに合わせて修正）
        if (output.includes('Call established') || 
            output.includes('Connected') || 
            output.includes('confirmed dialog') || 
            output.includes('Media active')) {
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
        // タイムアウトをクリア
        clearTimeout(callTimeout);
        
        logger.info(`sipcmdプロセス終了: コード=${code}, callId=${callId}`);
        
        // 通話終了イベントをエミット
        const callData = this.activeCallsMap.get(callId);
        
        if (callData) {
          const duration = Math.round((Date.now() - callData.startTime) / 1000);
          let status = 'COMPLETED';
          
          // pjsuaの終了コードに合わせて修正
          if (code !== 0) {
            if (callData.status === 'calling') {
              status = code === 1 ? 'NO ANSWER' : 
                      code === 2 ? 'BUSY' : 
                      code === 3 ? 'REJECTED' : 'FAILED';
            } else if (callData.status === 'answered') {
              status = 'ANSWERED'; // 応答後の終了は正常終了
            } else {
              status = 'FAILED';
            }
          } else if (callData.status === 'answered') {
            status = 'ANSWERED';
            // 成功した場合は失敗カウントをリセット
            sipAccount.failCount = 0;
          }
          
          // 通話ステータスを更新
          this.updateCallStatus(callId, status, duration).catch(err => {
            logger.error(`通話ステータス更新エラー: ${err.message}`);
          });
          
          // イベント発行
          this.emit('callEnded', {
            callId,
            status,
            duration: callData.status === 'answered' ? duration : 0,
            mainCallerId: callData.mainCallerId
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
        variables: params.variables || {},
        mainCallerId: sipAccount.mainCallerId // メイン発信者番号IDを追加
      });
      
      return {
        ActionID: callId,
        Response: 'Success',
        Message: 'SIP call successfully initiated',
        SipAccount: sipAccount.username,
        mainCallerId: sipAccount.mainCallerId, // メイン発信者番号IDを追加
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
      // 特定の発信者番号のチャンネルを使用する場合
      let sipAccount = null;
      
      if (params.callerIdData && params.callerIdData.id) {
        // 特定の発信者番号ID向けの利用可能なチャンネルを探す
        sipAccount = await this.getAvailableSipAccountForCallerId(params.callerIdData.id);
        
        if (!sipAccount) {
          logger.warn(`発信者番号ID ${params.callerIdData.id} に利用可能なチャンネルがありません`);
          // バックアップとして任意の利用可能なチャンネルを使用
          sipAccount = await this.getAvailableSipAccount();
        }
      } else {
        // 任意の利用可能なチャンネルを使用
        sipAccount = await this.getAvailableSipAccount();
      }
      
      if (!sipAccount) {
        throw new Error('利用可能なSIPアカウントがありません（モックモード）');
      }
      
      const callId = `sip-mock-${Date.now()}`;
      
      // SIPアカウントを使用中にマーク
      sipAccount.status = 'busy';
      sipAccount.lastUsed = new Date();
      
      // データベースのチャンネル状態を更新
      if (sipAccount.channelId) {
        try {
          await db.query(
            'UPDATE caller_channels SET status = ?, last_used = NOW() WHERE id = ?',
            ['busy', sipAccount.channelId]
          );
        } catch (dbError) {
          logger.warn(`チャンネル状態更新エラー: ${dbError.message}`);
        }
      }
      
      // 通話IDとSIPアカウントを関連付け
      this.callToAccountMap.set(callId, sipAccount);
      
      // 発信成功イベントをエミット
      this.emit('callStarted', {
        callId,
        number: params.phoneNumber,
        callerID: params.callerID || sipAccount.callerID || '0359468520',
        variables: params.variables || {},
        mainCallerId: sipAccount.mainCallerId // メイン発信者番号IDを追加
      });
      
      return {
        ActionID: callId,
        Response: 'Success',
        Message: 'Originate successfully queued (SIP MOCK)',
        SipAccount: sipAccount.username,
        mainCallerId: sipAccount.mainCallerId, // メイン発信者番号IDを追加
        provider: 'sip'
      };
    } catch (error) {
      logger.error('モックモードSIP発信エラー:', error);
      throw error;
    }
  }
  
  // 電話番号を適切な形式にフォーマット
  formatPhoneNumber(phoneNumber) {
    // 国内通話の場合
    if (phoneNumber.startsWith('0')) {
      return phoneNumber; // そのまま返す場合
      // または国際形式に変換する場合
      // return phoneNumber.replace(/^0/, '81');
    }
    
    // 先頭に国コードがない場合は日本の国コードを追加
    if (!/^[1-9][0-9]*/.test(phoneNumber)) {
      return '81' + phoneNumber;
    }
    
    return phoneNumber;
  }
  
  async handleCallEnded(eventData) {
    const { callId, status, duration } = eventData;
    logger.info(`通話終了イベント処理: ${callId}, status=${status || 'unknown'}, duration=${duration || 0}`);
    
    try {
      // 通話ステータスを更新
      if (status) {
        await this.updateCallStatus(callId, status, duration || 0);
      }
      
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
          
          // データベースのチャンネル状態を更新
          if (sipAccount.channelId) {
            try {
              await db.query(
                'UPDATE caller_channels SET status = ? WHERE id = ?',
                ['available', sipAccount.channelId]
              );
            } catch (dbError) {
              logger.warn(`チャンネル状態更新エラー: ${dbError.message}`);
            }
          }
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
  
  // 特定の発信者番号IDに関連付けられた利用可能なSIPアカウントを取得（新機能）
  async getAvailableSipAccountForCallerId(callerId) {
    logger.info(`発信者番号ID ${callerId} の利用可能なSIPアカウントを検索中`);
    
    // 発信者番号IDに関連付けられたチャンネルを取得
    const channels = this.callerIdToChannelsMap.get(parseInt(callerId));
    
    if (!channels || channels.length === 0) {
      logger.warn(`発信者番号ID ${callerId} に関連付けられたチャンネルが見つかりません`);
      return null;
    }
    
    // 利用可能なチャンネルを検索
    const availableAccount = channels.find(account => account && account.status === 'available');
    
    if (!availableAccount) {
      logger.warn(`発信者番号ID ${callerId} に利用可能なチャンネルがありません`);
      return null;
    }
    
    logger.info(`発信者番号ID ${callerId} の利用可能なSIPアカウントを見つけました: ${availableAccount.username}`);
    return availableAccount;
  }
  
  // 任意の利用可能なSIPアカウントを取得
  async getAvailableSipAccount() {
    logger.info('利用可能なSIPアカウントを検索中');
    
    if (!this.sipAccounts || this.sipAccounts.length === 0) {
      logger.info('SIPアカウントがないため、再読み込みを試みます');
      this.sipAccounts = await this.loadSipAccountsFromDatabase();
      
      if (this.sipAccounts.length === 0) {
        this.sipAccounts = this.loadSipAccountsFromFile();
      }
      
      // 発信者番号ごとのチャンネルグループを更新
      this.organizeChannelsByCallerId();
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
  
  // 特定の発信者番号の利用可能なSIPアカウント数を返す（新機能）
  getAvailableSipAccountCountForCallerId(callerId) {
    const channels = this.callerIdToChannelsMap.get(parseInt(callerId));
    
    if (!channels) return 0;
    
    return channels.filter(account => account && account.status === 'available').length;
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
    
    // 発信者番号ごとのチャンネル状態もログ出力
    this.callerIdToChannelsMap.forEach((channels, callerId) => {
      const availableCount = channels.filter(ch => ch.status === 'available').length;
      const busyCount = channels.filter(ch => ch.status === 'busy').length;
      const errorCount = channels.filter(ch => ch.status === 'error').length;
      
      logger.info(`発信者番号ID ${callerId} のチャンネル状態: 全体=${channels.length}, 利用可能=${availableCount}, 使用中=${busyCount}, エラー=${errorCount}`);
    });
    
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
            
            // データベースのチャンネル状態を更新
            if (account.channelId) {
              try {
                db.query(
                  'UPDATE caller_channels SET status = ? WHERE id = ?',
                  ['available', account.channelId]
                );
              } catch (dbError) {
                logger.warn(`チャンネル状態更新エラー: ${dbError.message}`);
              }
            }
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
  
  // 特定の発信者番号IDのアクティブコール数を取得（新機能）
  getActiveCallCountForCallerId(callerId) {
    let count = 0;
    this.activeCallsMap.forEach((callData) => {
      if (callData.mainCallerId === parseInt(callerId)) {
        count++;
      }
    });
    return count;
  }
  
  // アカウントステータス情報を取得（発信者番号IDによるグループ化を追加）
  getAccountStatus() {
    // 全チャンネルのステータス
    const allStatus = this.sipAccounts.map(account => ({
      username: account.username,
      status: account.status,
      callerID: account.callerID,
      lastUsed: account.lastUsed,
      failCount: account.failCount || 0,
      mainCallerId: account.mainCallerId
    }));
    
    // 発信者番号IDごとのステータスサマリー
    const callerIdSummary = [];
    
    this.callerIdToChannelsMap.forEach((channels, callerId) => {
      callerIdSummary.push({
        callerId,
        totalChannels: channels.length,
        availableChannels: channels.filter(ch => ch.status === 'available').length,
        busyChannels: channels.filter(ch => ch.status === 'busy').length,
        errorChannels: channels.filter(ch => ch.status === 'error').length
      });
    });
    
    return {
      channels: allStatus,
      callerIdSummary
    };
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
  
  // データベースのチャンネル状態を同期（新機能）
  async syncChannelStatusWithDatabase() {
    try {
      logger.info('データベースとチャンネル状態を同期中...');
      
      // アクティブアカウントの状態をデータベースに反映
      for (const account of this.sipAccounts) {
        if (account.channelId) {
          await db.query(
            'UPDATE caller_channels SET status = ?, last_used = ? WHERE id = ?',
            [account.status, account.lastUsed || null, account.channelId]
          );
        }
      }
      
      // データベースから最新のチャンネル情報を読み込み
      const freshAccounts = await this.loadSipAccountsFromDatabase();
      
      if (freshAccounts.length > 0) {
        // 既存のチャンネルをメモリから除去せずに状態を更新
        for (const freshAccount of freshAccounts) {
          const existingAccount = this.sipAccounts.find(acc => 
            acc.username === freshAccount.username && acc.mainCallerId === freshAccount.mainCallerId
          );
          
          if (existingAccount) {
            // 使用中のアカウントはそのままに、他の状態だけ更新
            if (existingAccount.status !== 'busy') {
              existingAccount.status = freshAccount.status;
              existingAccount.lastUsed = freshAccount.lastUsed;
            }
            // 他のメタデータも更新
            existingAccount.callerID = freshAccount.callerID;
            existingAccount.description = freshAccount.description;
            existingAccount.domain = freshAccount.domain;
            existingAccount.provider = freshAccount.provider;
            existingAccount.channelId = freshAccount.channelId;
          } else {
            // 新しいアカウントを追加
            this.sipAccounts.push(freshAccount);
          }
        }
        
        // チャンネルをグループ化
        this.organizeChannelsByCallerId();
      }
      
      logger.info('データベースとチャンネル状態の同期が完了しました');
      return true;
    } catch (error) {
      logger.error('チャンネル状態同期エラー:', error);
      return false;
    }
  }

  // SipServiceクラス内に追加

async updateCallStatus(callId, status, duration = 0) {
  try {
    logger.info(`通話ステータス更新: callId=${callId}, status=${status}, duration=${duration}`);
    
    // 通話ログを更新
    try {
      const [updateResult] = await db.query(`
        UPDATE call_logs
        SET status = ?, end_time = NOW(), duration = ?
        WHERE call_id = ?
      `, [status, duration, callId]);
      
      if (updateResult.affectedRows > 0) {
        logger.info(`通話ログを更新しました: callId=${callId}`);
      } else {
        logger.warn(`通話ログの更新に失敗: callId=${callId} - 該当レコードなし`);
      }
    } catch (dbError) {
      logger.error(`通話ログ更新エラー: ${dbError.message}`);
    }
    
    // チャンネル状態も更新
    if (this.callToAccountMap.has(callId)) {
      const sipAccount = this.callToAccountMap.get(callId);
      
      try {
        await db.query(`
          UPDATE caller_channels 
          SET status = ?, last_used = NOW()
          WHERE username = ? AND caller_id_id = ?
        `, ['available', sipAccount.username, sipAccount.mainCallerId]);
      } catch (dbError) {
        logger.warn(`チャンネル状態更新エラー: ${dbError.message}`);
      }
    }
    
    return true;
  } catch (error) {
    logger.error(`通話ステータス更新エラー: ${error.message}`);
    return false;
  }
}

  // 特定の用途に対応した利用可能なSIPアカウントを取得する関数
  async getAvailableSipAccountByType(callerId, channelType = 'outbound') {
    logger.info(`発信者番号ID ${callerId} の ${channelType} 用の利用可能なSIPアカウントを検索中`);
    
    // 発信者番号IDに関連付けられたチャンネルを取得
    const channels = this.callerIdToChannelsMap.get(parseInt(callerId));
    
    if (!channels || channels.length === 0) {
      logger.warn(`発信者番号ID ${callerId} に関連付けられたチャンネルが見つかりません`);
      return null;
    }
    
    // 指定された用途と一致するチャンネルのみをフィルタリング
    const filteredChannels = channels.filter(account => 
      account.status === 'available' && 
      (account.channelType === channelType || account.channelType === 'both')
    );
    
    if (filteredChannels.length === 0) {
      logger.warn(`発信者番号ID ${callerId} に利用可能な ${channelType} チャンネルがありません`);
      return null;
    }
    
    logger.info(`発信者番号ID ${callerId} の利用可能な ${channelType} チャンネルを見つけました: ${filteredChannels[0].username}`);
    return filteredChannels[0];
  }
}

// シングルトンインスタンスを作成
const sipService = new SipService();
module.exports = sipService;