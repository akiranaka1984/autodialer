// backend/src/services/sipService.js - 完全書き換え版
const { spawn } = require('child_process');
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
    this.sipcmdPath = process.env.SIPCMD_PATH || '/usr/local/bin/sipcmd';
    
    logger.info(`SipService初期化: mockMode=${this.mockMode}, sipcmdPath=${this.sipcmdPath}`);
    this.on('callEnded', this.handleCallEnded.bind(this));
  }

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
  
  // データベースからSIPアカウント情報を読み込む
  async loadSipAccountsFromDatabase() {
    try {
      logger.info('データベースからSIPチャンネル情報を読み込み中...');
      
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
      
      const formattedAccounts = channels.map(channel => ({
        username: channel.username,
        password: channel.password,
        callerID: channel.caller_number,
        description: channel.description,
        domain: channel.domain,
        provider: channel.provider,
        mainCallerId: channel.main_caller_id,
        channelType: channel.channel_type || 'both',
        status: channel.status || 'available',
        lastUsed: channel.last_used || null,
        failCount: 0,
        channelId: channel.id
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
  
  // ファイルからSIPアカウント情報を読み込む
  loadSipAccountsFromFile() {
    logger.info('ファイルからSIPアカウントを読み込み中...');
    
    try {
      let accounts = [];
      
      // 環境変数から読み込み
      const accountsStr = process.env.SIP_ACCOUNTS || '[]';
      if (accountsStr && accountsStr !== '[]') {
        try {
          accounts = JSON.parse(accountsStr);
          logger.info(`環境変数からSIPアカウント ${accounts.length}個 を読み込みました`);
        } catch (err) {
          logger.error('SIPアカウント形式エラー（環境変数）:', err);
        }
      }
      
      // ファイルから読み込み
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
      
      // デフォルトアカウント
      if (accounts.length === 0) {
        logger.warn('SIPアカウントが設定されていません。デフォルトアカウントを使用します。');
        accounts = [
          { username: '03080001', password: '56110478', callerID: '0359468520', mainCallerId: 1 },
          { username: '03080002', password: '51448459', callerID: '0335289538', mainCallerId: 2 }
        ];
      }
      
      const formattedAccounts = accounts.map(account => ({
        ...account,
        status: 'available',
        lastUsed: null,
        failCount: 0
      }));
      
      logger.info(`${formattedAccounts.length}個のSIPアカウントを初期化しました`);
      return formattedAccounts;
    } catch (error) {
      logger.error('SIPアカウント読み込みエラー:', error);
      
      return [
        { username: '03080001', password: '56110478', callerID: '0359468520', mainCallerId: 1, status: 'available', lastUsed: null, failCount: 0 },
        { username: '03080002', password: '51448459', callerID: '0335289538', mainCallerId: 2, status: 'available', lastUsed: null, failCount: 0 }
      ];
    }
  }
  
  // ★★★ メイン発信メソッド（音声対応・シンプル版）★★★
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
    const channelType = params.channelType || 'outbound';
    let sipAccount = null;
    
    if (params.callerIdData && params.callerIdData.id) {
      sipAccount = await this.getAvailableSipAccountByType(params.callerIdData.id, channelType);
      
      if (!sipAccount) {
        logger.warn(`発信者番号ID ${params.callerIdData.id} に利用可能な ${channelType} チャンネルがありません`);
        sipAccount = await this.getAvailableSipAccount();
      }
    } else {
      sipAccount = await this.getAvailableSipAccount();
    }
    
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
    
    // 🎵 音声ファイルの準備（Phase 1対応）
    let primaryAudioFile = null;
    if (campaignAudio && campaignAudio.length > 0) {
      // welcomeメッセージを優先的に選択
      const welcomeAudio = campaignAudio.find(audio => audio.audio_type === 'welcome');
      
      if (welcomeAudio) {
        // 音声ファイルパスを構築
        primaryAudioFile = welcomeAudio.path || 
                          `/app/audio-files/${welcomeAudio.filename}`;
        logger.info(`🎵 Primary音声ファイル設定: ${welcomeAudio.filename}`);
      }
    }
    
    // pjsua用の引数を生成（音声ファイル対応）
    const args = [
      sipAccount.username,
      sipAccount.password,
      sipServer,
      formattedNumber,
      callDuration,
      primaryAudioFile || ''  // 音声ファイルパスを第6引数として追加
    ];
    
    logger.debug(`sipcmdコマンド実行（音声付き）: ${this.sipcmdPath} ${args.join(' ')}`);
    
    // sipcmdプロセスを起動
    const sipcmdProcess = spawn(this.sipcmdPath, args);
    
    // アクティブコールマップに追加（音声情報も含める）
    this.activeCallsMap.set(callId, {
      process: sipcmdProcess,
      startTime: Date.now(),
      status: 'calling',
      phoneNumber: formattedNumber,
      callerID: sipAccount.callerID,
      mainCallerId: sipAccount.mainCallerId,
      campaignAudio: campaignAudio,
      audioPlayed: false
    });

    // 🚀 強制音声配信: ALSAエラー回避のため即座に実行
    if (campaignAudio && campaignAudio.length > 0) {
      logger.info(`🎵 [即時実行]音声再生開始: callId=${callId}`);
      setTimeout(() => {
        const callData = this.activeCallsMap.get(callId);
        if (callData && !callData.audioPlayed) {
          this.playAudioSimple(callId, campaignAudio);
          callData.audioPlayed = true;
          this.activeCallsMap.set(callId, callData);
        }
      }, 2000);
    }
    
    // 発信状態監視のタイムアウト設定
    const callTimeout = setTimeout(() => {
      if (this.activeCallsMap.has(callId)) {
        const callData = this.activeCallsMap.get(callId);
        if (callData.status === 'calling') {
          logger.warn(`発信タイムアウト: callId=${callId}, number=${formattedNumber}`);
          
          if (callData.process) {
            try {
              callData.process.kill();
            } catch (killError) {
              logger.error(`プロセス終了エラー: ${killError.message}`);
            }
          }
          
          this.emit('callEnded', {
            callId,
            status: 'NO ANSWER',
            duration: 0,
            mainCallerId: callData.mainCallerId
          });
          
          this.activeCallsMap.delete(callId);
          this.releaseCallResource(callId);
        }
      }
    }, 60000);
    
    // プロセス出力の処理（stdout）- RTP音声対応版
    sipcmdProcess.stdout.on('data', (data) => {
      const output = data.toString();
      logger.debug(`sipcmd出力: ${output}`);
      
      // 通話確立の検出
      if (output.includes('Call established') || 
          output.includes('Connected') || 
          output.includes('confirmed dialog') || 
          output.includes('Media active')) {
        const callData = this.activeCallsMap.get(callId);
        if (callData && callData.status === 'calling') {
          callData.status = 'answered';
          this.activeCallsMap.set(callId, callData);
          logger.info(`通話確立: callId=${callId}, number=${formattedNumber}`);
          
          // 🎵 RTP音声インジェクション開始
          if (callData.campaignAudio && !callData.audioPlayed) {
            this.startRtpAudioInjection(callId, callData.campaignAudio, output);
            callData.audioPlayed = true;
            this.activeCallsMap.set(callId, callData);
          }
        }
      }
    });
    
    // エラー出力の処理（stderr）
    sipcmdProcess.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      logger.error(`sipcmd エラー: ${errorOutput}`);
      
      if (errorOutput.includes('408') || errorOutput.includes('Timeout')) {
        logger.error('SIPタイムアウトエラーが発生しました - ネットワーク設定を確認してください');
      } else if (errorOutput.includes('403')) {
        logger.error('SIP認証エラー: ユーザー名またはパスワードが正しくない可能性があります');
      }
    });
    
    // プロセス終了時の処理
    sipcmdProcess.on('close', (code) => {
      clearTimeout(callTimeout);
      
      logger.info(`sipcmdプロセス終了: コード=${code}, callId=${callId}`);
      
      const callData = this.activeCallsMap.get(callId);
      
      if (callData) {
        const duration = Math.round((Date.now() - callData.startTime) / 1000);
        let status = 'COMPLETED';
        
        if (code !== 0) {
          if (callData.status === 'calling') {
            status = code === 1 ? 'NO ANSWER' : 
                    code === 2 ? 'BUSY' : 
                    code === 3 ? 'REJECTED' : 'FAILED';
          } else if (callData.status === 'answered') {
            status = 'ANSWERED';
          } else {
            status = 'FAILED';
          }
        } else if (callData.status === 'answered') {
          status = 'ANSWERED';
          sipAccount.failCount = 0;
        }
        
        this.updateCallStatus(callId, status, duration).catch(err => {
          logger.error(`通話ステータス更新エラー: ${err.message}`);
        });
        
        this.emit('callEnded', {
          callId,
          status,
          duration: callData.status === 'answered' ? duration : 0,
          mainCallerId: callData.mainCallerId
        });
        
        this.activeCallsMap.delete(callId);
      }
      
      this.releaseCallResource(callId);
    });
    
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
// RTP音声インジェクション開始メソッド（新規追加）
async startRtpAudioInjection(callId, campaignAudio, pjsuaOutput) {
  try {
    logger.info(`🎵 RTP音声インジェクション開始: callId=${callId}`);
    
    // pjsuaの出力からRTP情報を抽出
    const rtpInfo = this.extractRtpInfo(pjsuaOutput);
    
    if (!rtpInfo) {
      logger.warn(`RTP情報の抽出に失敗: callId=${callId}`);
      // フォールバック：従来の音声再生方式
      this.playAudioSimple(callId, campaignAudio);
      return;
    }
    
    // RTP音声サービスで音声配信
    const rtpAudioService = require('./rtpAudioService');
    const success = await rtpAudioService.injectAudioToCall(
      callId, 
      campaignAudio, 
      rtpInfo
    );
    
    if (success) {
      logger.info(`✅ RTP音声インジェクション成功: callId=${callId}`);
    } else {
      logger.warn(`⚠️ RTP音声インジェクション失敗、フォールバック: callId=${callId}`);
      // フォールバック：従来の音声再生方式
      this.playAudioSimple(callId, campaignAudio);
    }
    
  } catch (error) {
    logger.error(`RTP音声インジェクションエラー: ${error.message}`);
    // フォールバック：従来の音声再生方式
    this.playAudioSimple(callId, campaignAudio);
  }
}

// pjsuaの出力からRTP情報を抽出（新規追加）
extractRtpInfo(pjsuaOutput) {
  try {
    // pjsuaの出力例：
    // "RTP port 4000, RTCP port 4001"
    // "Remote RTP/RTCP address: 192.168.1.100:5004/5005"
    
    const rtpPortMatch = pjsuaOutput.match(/RTP port (\d+)/);
    const remoteAddressMatch = pjsuaOutput.match(/Remote.*?(\d+\.\d+\.\d+\.\d+):(\d+)/);
    
    if (rtpPortMatch && remoteAddressMatch) {
      return {
        localPort: parseInt(rtpPortMatch[1]),
        ip: remoteAddressMatch[1],
        port: parseInt(remoteAddressMatch[2])
      };
    }
    
    // デフォルト値（ローカルテスト用）
    return {
      localPort: 4000,
      ip: '127.0.0.1',
      port: 5004
    };
    
  } catch (error) {
    logger.error(`RTP情報抽出エラー: ${error.message}`);
    return null;
  }
}
  
  // ★★★ シンプル音声再生メソッド ★★★
  playAudioSimple(callId, campaignAudio) {
    try {
      if (!campaignAudio || campaignAudio.length === 0) {
        logger.info(`音声ファイルなし: callId=${callId}`);
        return;
      }
      
      // 音声ファイルをタイプ別に整理
      const audioMap = {};
      campaignAudio.forEach(audio => {
        if (audio && audio.audio_type) {
          audioMap[audio.audio_type] = audio;
        }
      });
      
      logger.info(`🎵 音声シーケンス開始: callId=${callId}, 音声タイプ: ${Object.keys(audioMap).join(', ')}`);
      
      // ウェルカムメッセージ（1秒後）
      setTimeout(() => {
        if (audioMap.welcome) {
          logger.info(`🔊 [音声再生] ウェルカムメッセージ: ${audioMap.welcome.name}`);
          logger.info(`🔊 [再生内容] "電話に出ていただきありがとうございます。"`);
          this.tryPlayAudio(audioMap.welcome.path || audioMap.welcome.filename);
        }
      }, 1000);
      
      // メニュー案内（4秒後）
      setTimeout(() => {
        if (audioMap.menu) {
          logger.info(`🔊 [音声再生] メニュー案内: ${audioMap.menu.name}`);
          logger.info(`🔊 [再生内容] "詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。"`);
          this.tryPlayAudio(audioMap.menu.path || audioMap.menu.filename);
        }
      }, 4000);
      
      // お別れメッセージ（15秒後）
      setTimeout(() => {
        if (audioMap.goodbye) {
          logger.info(`🔊 [音声再生] お別れメッセージ: ${audioMap.goodbye.name}`);
          logger.info(`🔊 [再生内容] "お電話ありがとうございました。"`);
          this.tryPlayAudio(audioMap.goodbye.path || audioMap.goodbye.filename);
        }
      }, 15000);
      
    } catch (error) {
      logger.warn('音声再生処理エラー（継続）:', error.message);
    }
  }
  
  // ★★★ 音声ファイル再生試行メソッド ★★★
  tryPlayAudio(audioPath) {
    if (!audioPath) {
      logger.debug('音声ファイルパスが未設定');
      return;
    }
    
    try {
      // FFplayで音声再生を試行
      const audioProcess = spawn('ffplay', [
        '-nodisp',
        '-autoexit',
        '-loglevel', 'quiet',
        audioPath
      ]);
      
      audioProcess.on('error', (error) => {
        logger.debug(`音声再生エラー（${audioPath}）:`, error.message);
        // FFplayが失敗した場合はaplayを試行
        this.tryPlayAudioWithAplay(audioPath);
      });
      
      audioProcess.on('close', (code) => {
        if (code === 0) {
          logger.debug(`音声再生成功: ${audioPath}`);
        } else {
          logger.debug(`音声再生終了: ${audioPath}, code=${code}`);
        }
      });
      
      // 5秒でタイムアウト
      setTimeout(() => {
        try {
          audioProcess.kill();
        } catch (killError) {
          // 既に終了している場合のエラーは無視
        }
      }, 5000);
      
    } catch (error) {
      logger.debug('音声再生プロセス起動エラー:', error.message);
    }
  }
  
  // aplayでの音声再生試行
  tryPlayAudioWithAplay(audioPath) {
    try {
      const aplayProcess = spawn('aplay', [audioPath]);
      
      aplayProcess.on('error', (error) => {
        logger.debug(`aplay音声再生エラー（${audioPath}）:`, error.message);
      });
      
      aplayProcess.on('close', (code) => {
        logger.debug(`aplay音声再生終了: ${audioPath}, code=${code}`);
      });
      
      // 5秒でタイムアウト
      setTimeout(() => {
        try {
          aplayProcess.kill();
        } catch (killError) {
          // 既に終了している場合のエラーは無視
        }
      }, 5000);
      
    } catch (error) {
      logger.debug('aplay音声再生プロセス起動エラー:', error.message);
    }
  }
  
  // モックモードでの発信処理
  async originateMock(params) {
    logger.info(`モックモードでSIP発信シミュレーション: 発信先=${params.phoneNumber}`);
    
    try {
      let sipAccount = null;
      
      if (params.callerIdData && params.callerIdData.id) {
        sipAccount = await this.getAvailableSipAccountForCallerId(params.callerIdData.id);
        
        if (!sipAccount) {
          logger.warn(`発信者番号ID ${params.callerIdData.id} に利用可能なチャンネルがありません`);
          sipAccount = await this.getAvailableSipAccount();
        }
      } else {
        sipAccount = await this.getAvailableSipAccount();
      }
      
      if (!sipAccount) {
        throw new Error('利用可能なSIPアカウントがありません（モックモード）');
      }
      
      const callId = `sip-mock-${Date.now()}`;
      
      sipAccount.status = 'busy';
      sipAccount.lastUsed = new Date();
      
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
    } catch (error) {
      logger.error('モックモードSIP発信エラー:', error);
      throw error;
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
      // RTP音声配信を停止
      const rtpAudioService = require('./rtpAudioService');
      rtpAudioService.stopAudioForCall(callId);
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
      
      // SIPアカウントを解放
      if (this.callToAccountMap.has(callId)) {
        const sipAccount = this.callToAccountMap.get(callId);
        
        if (sipAccount.status !== 'error') {
          sipAccount.status = 'available';
          
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
  
  // 特定の発信者番号IDの利用可能なSIPアカウントを取得
  async getAvailableSipAccountForCallerId(callerId) {
    logger.info(`発信者番号ID ${callerId} の利用可能なSIPアカウントを検索中`);
    
    const channels = this.callerIdToChannelsMap.get(parseInt(callerId));
    
    if (!channels || channels.length === 0) {
      logger.warn(`発信者番号ID ${callerId} に関連付けられたチャンネルが見つかりません`);
      return null;
    }
    
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
      
      this.organizeChannelsByCallerId();
    }
    
    if (!this.sipAccounts || this.sipAccounts.length === 0) {
      logger.warn('SIPアカウントが設定されていません');
      return null;
    }
    
    const availableAccount = this.sipAccounts.find(account => account && account.status === 'available');
    
    if (!availableAccount) {
      logger.warn('利用可能なSIPアカウントがありません');
      return null;
    }
    
    logger.info(`利用可能なSIPアカウントを見つけました: ${availableAccount.username}`);
    return availableAccount;
  }
  
  // 特定の用途に対応した利用可能なSIPアカウントを取得
  async getAvailableSipAccountByType(callerId, channelType = 'outbound') {
    logger.info(`発信者番号ID ${callerId} の ${channelType} 用の利用可能なSIPアカウントを検索中`);
    
    const channels = this.callerIdToChannelsMap.get(parseInt(callerId));
    
    if (!channels || channels.length === 0) {
      logger.warn(`発信者番号ID ${callerId} に関連付けられたチャンネルが見つかりません`);
      return null;
    }
    
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
  
  // 利用可能なSIPアカウント数を返す
  getAvailableSipAccountCount() {
    if (!this.sipAccounts) return 0;
    return this.sipAccounts.filter(account => account && account.status === 'available').length;
  }
  
  // テスト用通話終了シミュレーション
  async simulateCallEnd(callId, status = 'ANSWERED', duration = 10) {
    logger.info(`通話終了シミュレーション: callId=${callId}, status=${status}, duration=${duration}秒`);
    
    if (!this.mockMode) {
      const callData = this.activeCallsMap.get(callId);
      if (callData && callData.process) {
        try {
          callData.process.kill();
        } catch (error) {
          logger.warn(`通話プロセス終了エラー: ${error.message}`);
        }
      }
    }
    
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
      
      // 通話IDのクリーンアップ
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
  
  // 通話ステータス更新
  async updateCallStatus(callId, status, duration = 0) {
    try {
      logger.info(`通話ステータス更新: callId=${callId}, status=${status}, duration=${duration}`);
      
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
  
  // その他のヘルパーメソッド
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
  
  getAccountStatus() {
    const allStatus = this.sipAccounts.map(account => ({
      username: account.username,
      status: account.status,
      callerID: account.callerID,
      lastUsed: account.lastUsed,
      failCount: account.failCount || 0,
      mainCallerId: account.mainCallerId
    }));
    
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
}

// シングルトンインスタンスを作成
const sipService = new SipService();
module.exports = sipService;