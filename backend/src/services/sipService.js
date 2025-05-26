// backend/src/services/sipService.js - 修正版
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
    this.sipcmdPath = process.env.SIPCMD_PATH || "/usr/local/bin/sipcmd-instant-audio";
    
    logger.info(`SipService初期化: mockMode=${this.mockMode}, sipcmdPath=${this.sipcmdPath}`);
    this.on('callEnded', this.handleCallEnded.bind(this));
  }

  // ★★★ 統合版connectメソッド ★★★
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
      logger.info('SIPサービス接続開始...');
      
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
      
      logger.info(`SIPアカウント読み込み結果: ${this.sipAccounts.length}個`);
      
      if (this.sipAccounts.length === 0) {
        logger.warn('SIPアカウントが0個です。ファイルから読み込みを試します...');
        this.sipAccounts = this.loadSipAccountsFromFile();
      }
      
      if (this.sipAccounts.length === 0) {
        logger.error('SIPアカウントが設定されていません');
        throw new Error('SIPアカウントが設定されていません');
      }
      
      // 発信者番号ごとのチャンネルグループを作成
      this.organizeChannelsByCallerId();
      
      // 定期的なステータスモニタリングを開始
      this.startStatusMonitoring();
      
      logger.info(`SIPサービス接続完了: ${this.sipAccounts.length}個のアカウント, ${this.callerIdToChannelsMap.size}個の発信者番号`);
      
      this.connected = true;
      return true;
    } catch (error) {
      logger.error('SIP接続エラー:', error);
      this.connected = false;
      throw error;
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
      logger.info('データベースからSIPチャンネル情報を読み込み中...');
      
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
      
      logger.info(`データベースクエリ結果: ${channels ? channels.length : 0}件のチャンネル`);
      
      if (!channels || channels.length === 0) {
        logger.warn('データベースに有効なSIPチャンネルが見つかりません');
        return [{
          username: '03080001',
          password: '56110478',
          callerID: '03-5946-8520',
          description: 'デフォルトテスト',
          domain: 'ito258258.site',
          provider: 'Default SIP',
          mainCallerId: 1,
          channelType: 'both',
          status: 'available',
          lastUsed: null,
          failCount: 0,
          channelId: 999
        }];
      }
      
      const formattedAccounts = channels.map(channel => ({
        username: channel.username,
        password: channel.password,
        callerID: channel.caller_number,
        description: channel.description || '',
        domain: channel.domain || 'ito258258.site',
        provider: channel.provider || 'SIP Provider',
        mainCallerId: channel.caller_id_id,
        channelType: channel.channel_type || 'both',
        status: channel.status || 'available',
        lastUsed: channel.last_used || null,
        failCount: 0,
        channelId: channel.id
      }));
      
      logger.info(`合計${formattedAccounts.length}個のSIPチャンネルを読み込みました`);
      return formattedAccounts;
    } catch (error) {
      logger.error('データベースからのSIPチャンネル読み込みエラー:', error);
      return [{
        username: '03080001',
        password: '56110478',
        callerID: '03-5946-8520',
        description: 'デフォルトテスト',
        domain: 'ito258258.site',
        provider: 'Default SIP',
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
    logger.info(`選択されたSIPアカウント: ${selectedAccount.username}`);
    return selectedAccount;
  }
  
  // ★★★ メイン発信メソッド ★★★
  async originate(params) {
    if (this.mockMode) {
      return this.originateMock(params);
    }
    
    logger.info(`SIP発信を開始: 発信先=${params.phoneNumber}`);
    
    try {
      // キャンペーンの音声ファイルを事前に取得
      let campaignAudio = null;
      if (params.variables && params.variables.CAMPAIGN_ID) {
        try {
          const audioService = require('./audioService');
          campaignAudio = await audioService.getCampaignAudio(params.variables.CAMPAIGN_ID);
          
          if (campaignAudio && campaignAudio.length > 0) {
            logger.info(`キャンペーン ${params.variables.CAMPAIGN_ID} の音声ファイル取得: ${campaignAudio.length}件`);
          }
        } catch (audioError) {
          logger.warn('音声ファイル取得エラー（続行）:', audioError.message);
        }
      }
      
      // SIPアカウントを取得
      let sipAccount = await this.getAvailableSipAccount();
      
      if (!sipAccount) {
        throw new Error('利用可能なSIPアカウントが見つかりません');
      }
      
      // 発信準備
      const formattedNumber = this.formatPhoneNumber(params.phoneNumber);
      const sipServer = process.env.SIP_SERVER || 'ito258258.site';
      const callDuration = '30';
      const callId = 'sip-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
      
      // SIPアカウントを使用中にマーク
      sipAccount.status = 'busy';
      sipAccount.lastUsed = new Date();
      
      // 通話IDとSIPアカウントを関連付け
      this.callToAccountMap.set(callId, sipAccount);
      
      // 音声ファイルの準備
      let primaryAudioFile = null;
      if (campaignAudio && campaignAudio.length > 0) {
        const welcomeAudio = campaignAudio.find(audio => audio.audio_type === 'welcome');
        if (welcomeAudio) {
          primaryAudioFile = welcomeAudio.path || 
                            `/var/www/autodialer/backend/audio-files/${welcomeAudio.filename}`;
          logger.info(`🎵 Primary音声ファイル設定: ${welcomeAudio.filename}`);
        }
      }
      
      // pjsua用の引数を生成
      const args = [
        sipAccount.username,
        sipAccount.password,
        sipServer,
        formattedNumber,
        callDuration,
        primaryAudioFile || ''
      ];

      // exec版の発信処理
      const commandLine = `${this.sipcmdPath} ${args.join(' ')}`;
      console.log(`🚀 exec実行: ${commandLine}`);

      const sipcmdProcess = exec(commandLine, {
        cwd: '/var/www/autodialer/backend',
        env: process.env,
        timeout: 60000
      }, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ exec エラー: ${error.message}`);
          this.releaseCallResource(callId);
          return;
        }
        if (stderr) console.error(`⚠️ stderr: ${stderr}`);
        console.log(`✅ stdout: ${stdout}`);
      });

      console.log(`✅ プロセス開始: PID=${sipcmdProcess.pid}`);

      // 音声再生システム
      if (campaignAudio && campaignAudio.length > 0) {
        logger.info(`🎵 [実音声再生]音声再生開始: callId=${callId}`);
        setTimeout(() => {
          this.playAudioSimple(callId, campaignAudio);
        }, 2000);
      }
      
      // 発信成功イベントをエミット
      this.emit('callStarted', {
        callId,
        number: params.phoneNumber,
        callerID: params.callerID || sipAccount.callerID,
        variables: params.variables || {},
        mainCallerId: sipAccount.mainCallerId,
        hasAudio: campaignAudio ? true : false
      });
      
      return {
        ActionID: callId,
        Response: 'Success',
        Message: 'SIP call successfully initiated',
        SipAccount: sipAccount.username,
        mainCallerId: sipAccount.mainCallerId,
        provider: 'sip',
        audioFilesCount: campaignAudio ? campaignAudio.length : 0
      };
    } catch (error) {
      logger.error('SIP発信エラー:', error);
      throw error;
    }
  }

  // 音声再生シミュレーション
  playAudioSimple(callId, campaignAudio) {
    try {
      if (!campaignAudio || campaignAudio.length === 0) {
        logger.info(`🔊 [安全モード] 音声ファイルなし: callId=${callId}`);
        return true;
      }
      
      logger.info(`🔊 [安全モード] 音声再生シミュレーション開始: callId=${callId}`);
      logger.info(`🔊 [情報] 音声ファイル数: ${campaignAudio.length}件`);
      
      const audioMap = {};
      campaignAudio.forEach(audio => {
        if (audio && audio.audio_type) {
          audioMap[audio.audio_type] = audio;
        }
      });
      
      logger.info(`🔊 [音声タイプ] ${Object.keys(audioMap).join(', ')}`);
      
      // 段階的音声再生ログ
      setTimeout(() => {
        if (audioMap.welcome) {
          logger.info(`🔊 [シミュレーション] ウェルカムメッセージ: ${audioMap.welcome.name}`);
          logger.info(`🔊 [内容] "電話に出ていただきありがとうございます。"`);
        }
      }, 1000);
      
      setTimeout(() => {
        if (audioMap.menu) {
          logger.info(`🔊 [シミュレーション] メニュー案内: ${audioMap.menu.name}`);
          logger.info(`🔊 [内容] "詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。"`);
        }
      }, 4000);
      
      setTimeout(() => {
        if (audioMap.goodbye) {
          logger.info(`🔊 [シミュレーション] お別れメッセージ: ${audioMap.goodbye.name}`);
          logger.info(`🔊 [内容] "お電話ありがとうございました。"`);
        }
      }, 15000);
      
      logger.info(`✅ [安全モード] 音声再生シミュレーション完了: callId=${callId}`);
      return true;
      
    } catch (error) {
      logger.warn('音声再生シミュレーションエラー（継続）:', error.message);
      return false;
    }
  }

  // 電話番号フォーマット
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
    const { callId, status, duration } = eventData;
    logger.info(`通話終了イベント処理: ${callId}, status=${status || 'unknown'}, duration=${duration || 0}`);
    
    try {
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
      // SIPアカウントを解放
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
      duration
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
    }, 60000); // 1分ごと
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

  async testAudioPlayback(audioFile) {
    logger.info(`🧪 音声再生テスト: ${audioFile.name}`);
    
    try {
      const audioPath = audioFile.path || path.join(__dirname, '../../audio-files', audioFile.filename);
      
      if (!fs.existsSync(audioPath)) {
        logger.warn(`音声ファイルが見つかりません: ${audioPath}`);
        return false;
      }
      
      logger.info(`✅ 音声テスト結果: 成功`);
      return true;
      
    } catch (error) {
      logger.error('音声再生テストエラー:', error);
      return false;
    }
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
