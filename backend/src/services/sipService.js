// backend/src/services/sipService.js - 完全修正版
const { spawn, exec } = require('child_process');
const logger = require('./logger');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const db = require('./database');

class SipService extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.mockMode = false;
    this.sipAccounts = [];
    this.callToAccountMap = new Map();
    this.activeCallsMap = new Map();
    this.callerIdToChannelsMap = new Map();
    this.sipcmdPath = process.env.SIPCMD_PATH || "/usr/local/bin/sipcmd-flexible";
    
    logger.info(`SipService初期化: mockMode=${this.mockMode}, sipcmdPath=${this.sipcmdPath}`);
    this.on('callEnded', this.handleCallEnded.bind(this));
  }

  // 🔧 修正版接続メソッド
  async connect() {
    if (this.mockMode) {
      logger.info('SIPサービスにモックモードで接続しました');
      this.connected = true;
      this.sipAccounts = await this.loadSipAccountsFromDatabase();
      
      if (this.sipAccounts.length === 0) {
        this.sipAccounts = [
          { username: '03080001', password: '56110478', status: 'available', callerID: '0359468520', mainCallerId: 1 },
          { username: '03080002', password: '51448459', status: 'available', callerID: '0335289538', mainCallerId: 2 }
        ];
      }
      return true;
    }

    try {
      logger.info('🔧 SIPサービス接続開始（修正版）...');
      
      // SIPアカウント読み込み
      this.sipAccounts = await this.loadSipAccountsFromDatabase();
      logger.info(`📊 SIPアカウント読み込み結果: ${this.sipAccounts.length}個`);
      
      if (this.sipAccounts.length === 0) {
        this.sipAccounts = [{
          username: '03080001',
          password: '56110478',
          callerID: '03-5946-8520',
          description: 'デフォルト SIP',
          domain: 'ito258258.site',
          provider: 'Default SIP',
          mainCallerId: 1,
          channelType: 'both',
          status: 'available',
          lastUsed: null,
          failCount: 0,
          channelId: 1
        }];
      }
      
      // 発信者番号ごとのチャンネルグループを作成
      this.organizeChannelsByCallerId();
      
      // 定期的なステータスモニタリングを開始
      this.startStatusMonitoring();
      
      this.connected = true;
      logger.info(`✅ SIPサービス接続完了: ${this.sipAccounts.length}個のアカウント`);
      return true;
      
    } catch (error) {
      logger.error('❌ SIP接続エラー:', error);
      
      // フォールバック処理
      this.sipAccounts = [{
        username: '03080001',
        password: '56110478',
        callerID: '03-5946-8520',
        description: 'エラー時フォールバック',
        domain: 'ito258258.site',
        provider: 'Fallback SIP',
        mainCallerId: 1,
        channelType: 'both',
        status: 'available',
        lastUsed: null,
        failCount: 0,
        channelId: 999
      }];
      
      this.connected = true;
      logger.warn('⚠️ エラー時フォールバック: デフォルトSIPアカウントで動作継続');
      return true;
    }
  }

  // 発信者番号ごとにチャンネルをグループ化
  organizeChannelsByCallerId() {
    this.callerIdToChannelsMap.clear();
    
    this.sipAccounts.forEach(account => {
      if (!account.mainCallerId) return;
      
      if (!this.callerIdToChannelsMap.has(account.mainCallerId)) {
        this.callerIdToChannelsMap.set(account.mainCallerId, []);
      }
      
      this.callerIdToChannelsMap.get(account.mainCallerId).push(account);
    });
    
    this.callerIdToChannelsMap.forEach((channels, callerId) => {
      logger.info(`発信者番号ID ${callerId} のチャンネル数: ${channels.length}`);
    });
  }

  // データベースからSIPアカウント読み込み
  async loadSipAccountsFromDatabase() {
    try {
      logger.info('🔧 データベースからSIPチャンネル情報を読み込み中...');
      
      const [channels] = await db.query(`
        SELECT 
          cc.id,
          cc.caller_id_id,
          cc.username,
          cc.password,
          cc.channel_type,
          cc.status,
          cc.last_used,
          cc.created_at,
          ci.number as caller_number, 
          ci.description, 
          ci.provider, 
          ci.domain, 
          ci.active as caller_active
        FROM caller_channels cc
        JOIN caller_ids ci ON cc.caller_id_id = ci.id
        WHERE ci.active = true
        ORDER BY cc.caller_id_id, cc.id
      `);
      
      if (!channels || channels.length === 0) {
        logger.warn('データベースに有効なSIPチャンネルが見つかりません');
        return [{
          username: '03080001',
          password: '56110478',
          callerID: '03-5946-8520',
          description: 'フォールバック SIP',
          domain: 'ito258258.site',
          provider: 'Emergency SIP',
          mainCallerId: 1,
          channelType: 'both',
          status: 'available',
          lastUsed: null,
          failCount: 0,
          channelId: 999
        }];
      }
      
      const formattedAccounts = channels.map(channel => ({
        username: channel.username || 'unknown',
        password: channel.password || 'unknown',
        callerID: channel.caller_number || '03-5946-8520',
        description: channel.description || '',
        domain: channel.domain || 'ito258258.site',
        provider: channel.provider || 'SIP Provider',
        mainCallerId: channel.caller_id_id || 1,
        channelType: channel.channel_type || 'both',
        status: channel.status || 'available',
        lastUsed: channel.last_used || null,
        failCount: 0,
        channelId: channel.id || 1
      }));
      
      logger.info(`合計${formattedAccounts.length}個のSIPチャンネルを読み込みました`);
      return formattedAccounts;
      
    } catch (error) {
      logger.error('データベースからのSIPチャンネル読み込みエラー:', error);
      return [{
        username: '03080001',
        password: '56110478',
        callerID: '03-5946-8520',
        description: 'エラー時フォールバック',
        domain: 'ito258258.site',
        provider: 'Fallback SIP',
        mainCallerId: 1,
        channelType: 'both',
        status: 'available',
        lastUsed: null,
        failCount: 0,
        channelId: 999
      }];
    }
  }

  // 利用可能なSIPアカウント取得
  async getAvailableSipAccount() {
    logger.info(`利用可能なSIPアカウントを検索中 (全${this.sipAccounts.length}個)`);
    
    if (!this.sipAccounts || this.sipAccounts.length === 0) {
      logger.warn('SIPアカウントが設定されていません。再読み込みを試みます...');
      this.sipAccounts = await this.loadSipAccountsFromDatabase();
      this.organizeChannelsByCallerId();
      logger.info(`再読み込み後のSIPアカウント数: ${this.sipAccounts.length}`);
    }
    
    const availableAccounts = this.sipAccounts.filter(account => 
      account && account.status === 'available'
    );
    
    logger.info(`利用可能なSIPアカウント: ${availableAccounts.length}/${this.sipAccounts.length}`);
    
    if (availableAccounts.length === 0) {
      logger.error('利用可能なSIPアカウントがありません');
      return null;
    }
    
    const selectedAccount = availableAccounts[0];
    logger.info(`選択されたSIP���カウント: ${selectedAccount.username}`);
    return selectedAccount;
  }

  // 🚀 メイン発信メソッド（完全修正版）
  async originate(params) {
    if (this.mockMode) {
      return this.originateMock(params);
    }
    
    logger.info(`🔥 SIP発信を開始: 発信先=${params.phoneNumber}`);
    
    try {
      // SIPアカウントを取得
      let sipAccount = await this.getAvailableSipAccount();
      
      if (!sipAccount) {
        throw new Error('利用可能なSIPアカウントが見つかりません');
      }
      
      // 発信準備
      const formattedNumber = this.formatPhoneNumber(params.phoneNumber);
      const sipServer = process.env.SIP_SERVER || 'ito258258.site';
      const callId = 'sip-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
      
      logger.info(`📞 SIP発信詳細: Account=${sipAccount.username}, Server=${sipServer}, Number=${formattedNumber}`);
      
      // SIPアカウントを使用中にマーク
      sipAccount.status = 'busy';
      sipAccount.lastUsed = new Date();
      
      // 通話IDとSIPアカウントを関連付け
      this.callToAccountMap.set(callId, sipAccount);
      
      // sipcmdコマンド実行
      const args = [
        sipAccount.username,
        sipAccount.password,
        sipServer,
        formattedNumber,
        '30'
      ];
      
      const commandLine = `${this.sipcmdPath} "${args[0]}" "${args[1]}" "${args[2]}" "${args[3]}" "${args[4]}"`;
      
      logger.info(`🚀 SIPコマンド実行: ${this.sipcmdPath} [引数は安全のため省略]`);
      
      // プロセス実行（エラーハンドリング強化）
      const sipcmdProcess = exec(commandLine, {
        cwd: '/var/www/autodialer/backend',
        env: {
          ...process.env,
          LANG: 'C',
          LC_ALL: 'C'
        },
        timeout: 45000,
        killSignal: 'SIGTERM',
        maxBuffer: 1024 * 1024
      });
      
      // プロセス開始確認
      if (!sipcmdProcess.pid) {
        throw new Error('SIP発信プロセスの開始に失敗しました');
      }
      
      logger.info(`✅ SIPプロセス開始: PID=${sipcmdProcess.pid}`);
      
      // プロセス監視
      sipcmdProcess.on('exit', (code, signal) => {
        logger.info(`SIPプロセス終了: code=${code}, signal=${signal}`);
        this.emit('callEnded', {
          callId,
          status: code === 0 ? 'ANSWERED' : 'FAILED',
          duration: 10
        });
      });
      
      sipcmdProcess.on('error', (error) => {
        logger.error(`SIPプロセスエラー: ${error.message}`);
        this.emit('callEnded', {
          callId,
          status: 'FAILED',
          duration: 0
        });
      });
      
      sipcmdProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          logger.info(`SIP stdout: ${output}`);
        }
      });
      
      sipcmdProcess.stderr?.on('data', (data) => {
        const error = data.toString().trim();
        if (error) {
          logger.warn(`SIP stderr: ${error}`);
        }
      });
      
      // 発信成功イベントをエミット
      this.emit('callStarted', {
        callId,
        number: params.phoneNumber,
        callerID: params.callerID || sipAccount.callerID,
        variables: params.variables || {},
        mainCallerId: sipAccount.mainCallerId
      });
      
      return {
        ActionID: callId,
        Response: 'Success',
        Message: 'SIP call successfully initiated',
        SipAccount: sipAccount.username,
        mainCallerId: sipAccount.mainCallerId,
        provider: 'sip',
        processId: sipcmdProcess.pid
      };
      
    } catch (error) {
      logger.error('SIP発信エラー:', error);
      
      // エラー時はリソースを解放
      if (typeof callId !== 'undefined' && this.callToAccountMap.has(callId)) {
        await this.releaseCallResource(callId);
      }
      
      throw error;
    }
  }

  // ✅ 電話番号フォーマット（追加）
  formatPhoneNumber(phoneNumber) {
    if (phoneNumber.startsWith('0')) {
      return phoneNumber;
    }
    
    if (!/^[1-9][0-9]*/.test(phoneNumber)) {
      return '81' + phoneNumber;
    }
    
    return phoneNumber;
  }

  // モックモード発信
  async originateMock(params) {
    logger.info(`モックモードでSIP発信シミュレーション: 発信先=${params.phoneNumber}`);
    
    const sipAccount = await this.getAvailableSipAccount();
    if (!sipAccount) {
      throw new Error('利用可能なSIPアカウントがありません（モックモード）');
    }
    
    const callId = `sip-mock-${Date.now()}`;
    sipAccount.status = 'busy';
    this.callToAccountMap.set(callId, sipAccount);
    
    this.emit('callStarted', {
      callId,
      number: params.phoneNumber,
      callerID: params.callerID || sipAccount.callerID || '0359468520',
      variables: params.variables || {},
      mainCallerId: sipAccount.mainCallerId
    });
    
    return {
      ActionID: callId,
      Response: 'Success',
      Message: 'Originate successfully queued (SIP MOCK)',
      SipAccount: sipAccount.username,
      mainCallerId: sipAccount.mainCallerId,
      provider: 'sip'
    };
  }

  // 通話終了イベント処理
  async handleCallEnded(eventData) {
    const { callId, status, duration, keypress } = eventData;
    logger.info(`通話終了イベント処理: ${callId}, status=${status || 'unknown'}, keypress=${keypress || 'none'}`);
    
    try {
      if (keypress) {
        const dialerService = require('./dialerService');
        await dialerService.handleCallEnd(callId, duration, status, keypress);
      }
      
      if (status) {
        await this.updateCallStatus(callId, status, duration || 0);
      }
      await this.releaseCallResource(callId);
    } catch (error) {
      logger.error(`通話終了処理エラー: ${error.message}`);
    }
  }

  // SIPリソース解放
  async releaseCallResource(callId) {
    logger.info(`SIPリソース解放: ${callId}`);
  
    if (!callId) {
      logger.warn('無効な通話ID: undefined または null');
      return false;
    }
    
    try {
      if (this.callToAccountMap.has(callId)) {
        const sipAccount = this.callToAccountMap.get(callId);
        
        if (sipAccount.status !== 'error') {
          sipAccount.status = 'available';
        }
        
        this.callToAccountMap.delete(callId);
        logger.info(`SIPアカウント解放成功: ${callId}, account=${sipAccount.username}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`SIPアカウント解放エラー: ${callId}`, error);
      return false;
    }
  }

  // 通話ステータス更新
  async updateCallStatus(callId, status, duration = 0) {
    try {
      logger.info(`通話ステータス更新: callId=${callId}, status=${status}, duration=${duration}`);
      
      const [updateResult] = await db.query(`
        UPDATE call_logs
        SET status = ?, end_time = NOW(), duration = ?
        WHERE call_id = ?
      `, [status, duration, callId]);
      
      if (updateResult.affectedRows > 0) {
        logger.info(`通話ログを更新しました: callId=${callId}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`通話ステータス更新エラー: ${error.message}`);
      return false;
    }
  }

  // ヘルパーメソッド
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
  
  async handleCallEnd(callId, duration, status, keypress) {
    logger.info(`SIP通話終了処理: callId=${callId}, status=${status}, duration=${duration}`);
    
    this.emit('callEnded', {
      callId,
      status,
      duration,
      keypress
    });
    
    return await this.releaseCallResource(callId);
  }

  getAvailableSipAccountCount() {
    if (!this.sipAccounts) return 0;
    return this.sipAccounts.filter(account => account && account.status === 'available').length;
  }

  async simulateCallEnd(callId, status = 'ANSWERED', duration = 10) {
    logger.info(`通話終了シミュレーション: callId=${callId}, status=${status}, duration=${duration}秒`);
    
    this.emit('callEnded', {
      callId,
      status,
      duration
    });
    
    return true;
  }

  // 定期的なステータスモニタリング
  startStatusMonitoring() {
    setInterval(() => {
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
    }, 60000);
  }

  getAccountStatus() {
    const allStatus = this.sipAccounts.map(account => ({
      username: account.username,
      status: account.status,
      callerID: account.callerID,
      lastUsed: account.lastUsed,
      failCount: account.failCount || 0,
      mainCallerId: account.mainCallerId
    }));
    
    return {
      channels: allStatus,
      callerIdSummary: []
    };
  }

  async disconnect() {
    logger.info('SIPサービスを切断しています...');
    this.connected = false;
    return true;
  }
}

// シングルトンインスタンスを作成
const sipService = new SipService();
module.exports = sipService;
