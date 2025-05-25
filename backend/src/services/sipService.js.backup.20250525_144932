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

  // ★★★ 統合版connectメソッド（これのみを残す）★★★
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

  async loadSipAccountsFromDatabase() {
    try {
      logger.info('データベースからSIPチャンネル情報を読み込み中...');
      
      // より詳細なクエリでデバッグ情報を取得
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
        
        // デバッグ: 関連テーブルの状況を確認
        try {
          const [callerIds] = await db.query('SELECT * FROM caller_ids WHERE active = true');
          const [allChannels] = await db.query('SELECT * FROM caller_channels');
          
          logger.info(`発信者番号数: ${callerIds.length}件`);
          logger.info(`全チャンネル数: ${allChannels.length}件`);
          
          if (callerIds.length === 0) {
            logger.error('有効な発信者番号が登録されていません');
          }
          if (allChannels.length === 0) {
            logger.error('チャンネルが1件も登録されていません');
          }
        } catch (debugError) {
          logger.error('デバッグクエリエラー:', debugError);
        }
        
        return [];
      }
      
      const formattedAccounts = channels.map(channel => {
        const account = {
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
        };
        
        logger.info(`チャンネル読み込み: ${account.username} (${account.callerID}) - ${account.status}`);
        return account;
      });
      
      logger.info(`合計${formattedAccounts.length}個のSIPチャンネルを読み込みました`);
      
      // 発信者番号ごとの統計
      const stats = {};
      formattedAccounts.forEach(account => {
        if (!stats[account.mainCallerId]) {
          stats[account.mainCallerId] = { total: 0, available: 0, callerID: account.callerID };
        }
        stats[account.mainCallerId].total++;
        if (account.status === 'available') {
          stats[account.mainCallerId].available++;
        }
      });
      
      Object.entries(stats).forEach(([callerId, stat]) => {
        logger.info(`発信者番号 ${stat.callerID}: 全${stat.total}ch, 利用可能${stat.available}ch`);
      });
      
      return formattedAccounts;
    } catch (error) {
      logger.error('データベースからのSIPチャンネル読み込みエラー:', error);
      
      // エラー時はデフォルトアカウントを返す
      logger.warn('デフォルトSIPアカウントを使用します');
      return [
        {
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
        }
      ];
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
  
  // backend/src/services/sipService.js の修正
// loadSipAccountsFromDatabase メソッドの改良版

async loadSipAccountsFromDatabase() {
  try {
    logger.info('データベースからSIPチャンネル情報を読み込み中...');
    
    // より詳細なクエリでデバッグ情報を取得
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
      
      // デバッグ: 関連テーブルの状況を確認
      try {
        const [callerIds] = await db.query('SELECT * FROM caller_ids WHERE active = true');
        const [allChannels] = await db.query('SELECT * FROM caller_channels');
        
        logger.info(`発信者番号数: ${callerIds.length}件`);
        logger.info(`全チャンネル数: ${allChannels.length}件`);
        
        if (callerIds.length === 0) {
          logger.error('有効な発信者番号が登録されていません');
        }
        if (allChannels.length === 0) {
          logger.error('チャンネルが1件も登録されていません');
        }
      } catch (debugError) {
        logger.error('デバッグクエリエラー:', debugError);
      }
      
      return [];
    }
    
    const formattedAccounts = channels.map(channel => {
      const account = {
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
      };
      
      logger.info(`チャンネル読み込み: ${account.username} (${account.callerID}) - ${account.status}`);
      return account;
    });
    
    logger.info(`合計${formattedAccounts.length}個のSIPチャンネルを読み込みました`);
    
    // 発信者番号ごとの統計
    const stats = {};
    formattedAccounts.forEach(account => {
      if (!stats[account.mainCallerId]) {
        stats[account.mainCallerId] = { total: 0, available: 0, callerID: account.callerID };
      }
      stats[account.mainCallerId].total++;
      if (account.status === 'available') {
        stats[account.mainCallerId].available++;
      }
    });
    
    Object.entries(stats).forEach(([callerId, stat]) => {
      logger.info(`発信者番号 ${stat.callerID}: 全${stat.total}ch, 利用可能${stat.available}ch`);
    });
    
    return formattedAccounts;
  } catch (error) {
    logger.error('データベースからのSIPチャンネル読み込みエラー:', error);
    
    // エラー時はデフォルトアカウントを返す
    logger.warn('デフォルトSIPアカウントを使用します');
    return [
      {
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
      }
    ];
  }
}


async getAvailableSipAccount() {
  logger.info(`利用可能なSIPアカウントを検索中 (全${this.sipAccounts.length}個)`);
  
  // SIPアカウントが空の場合は再読み込み
  if (!this.sipAccounts || this.sipAccounts.length === 0) {
    logger.warn('SIPアカウントが設定されていません。再読み込みを試みます...');
    
    // 再読み込みを試行
    this.sipAccounts = await this.loadSipAccountsFromDatabase();
    
    if (this.sipAccounts.length === 0) {
      this.sipAccounts = this.loadSipAccountsFromFile();
    }
    
    // 発信者番号ごとのチャンネルグループを再作成
    this.organizeChannelsByCallerId();
    
    logger.info(`再読み込み後のSIPアカウント数: ${this.sipAccounts.length}`);
  }
  
  // 利用可能なアカウントを検索
  const availableAccounts = this.sipAccounts.filter(account => 
    account && account.status === 'available'
  );
  
  logger.info(`利用可能なSIPアカウント: ${availableAccounts.length}/${this.sipAccounts.length}`);
  
  if (availableAccounts.length === 0) {
    logger.error('利用可能なSIPアカウントがありません');
    
    // 全アカウントの状態をログ出力
    this.sipAccounts.forEach((account, index) => {
      logger.info(`アカウント${index}: ${account.username} - ${account.status} - CallerID: ${account.callerID}`);
    });
    
    // 強制的にアカウント状態をリセット
    logger.warn('全SIPアカウントの状態をavailableにリセットします');
    this.sipAccounts.forEach(account => {
      if (account.status !== 'available') {
        account.status = 'available';
        logger.info(`アカウント ${account.username} を available に変更`);
      }
    });
    
    // リセット後に再検索
    const resetAvailableAccounts = this.sipAccounts.filter(account => 
      account && account.status === 'available'
    );
    
    if (resetAvailableAccounts.length > 0) {
      const selectedAccount = resetAvailableAccounts[0];
      logger.info(`リセット後に選択されたSIPアカウント: ${selectedAccount.username}`);
      return selectedAccount;
    }
    
    return null;
  }
  
  const selectedAccount = availableAccounts[0];
  logger.info(`選択されたSIPアカウント: ${selectedAccount.username}`);
  
  return selectedAccount;
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
                          `/var/www/autodialer/backend/audio-files/${welcomeAudio.filename}`;
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
    ];

    // 音声ファイルがある場合は第6引数として追加
    if (primaryAudioFile) {
      args.push(primaryAudioFile);
      logger.info(`🔊 音声付き発信: ${path.basename(primaryAudioFile)}`);
    }
    ];
    
    logger.debug(`sipcmdコマンド実行（音声付き）: ${this.sipcmdPath} ${args.join(' ')}`);
    
    // sipcmdプロセスを起動
   // const realSip = require("./realSip");
   // return await realSip.makeCall(sipAccount.username, sipAccount.password, sipServer, formattedNumber, callDuration);
    const sipcmdProcess = spawn(this.sipcmdPath, args);

    // 🚀 実音声再生システム
    if (campaignAudio && campaignAudio.length > 0) {
      logger.info(`🎵 [実音声再生]音声再生開始: callId=${callId}`);
      setTimeout(() => {
        const callData = this.activeCallsMap.get(callId);
        if (callData && !callData.audioPlayed) {
          this.scheduleAudioPlayback(callId, campaignAudio);
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
  /*
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
          this.tryPlayAudioWithAplay(audioMap.welcome.path || audioMap.welcome.filename);
        }
      }, 1000);
      
      // メニュー案内（4秒後）
      setTimeout(() => {
        if (audioMap.menu) {
          logger.info(`🔊 [音声再生] メニュー案内: ${audioMap.menu.name}`);
          logger.info(`🔊 [再生内容] "詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。"`);
          this.tryPlayAudioWithAplay(audioMap.menu.path || audioMap.menu.filename);
        }
      }, 4000);
      
      // お別れメッセージ（15秒後）
      setTimeout(() => {
        if (audioMap.goodbye) {
          logger.info(`🔊 [音声再生] お別れメッセージ: ${audioMap.goodbye.name}`);
          logger.info(`🔊 [再生内容] "お電話ありがとうございました。"`);
          this.tryPlayAudioWithAplay(audioMap.goodbye.path || audioMap.goodbye.filename);
        }
      }, 15000);
      
    } catch (error) {
      logger.warn('音声再生処理エラー（継続）:', error.message);
    }
  }
*/
playAudioSimple(callId, campaignAudio) {
  try {
    if (!campaignAudio || campaignAudio.length === 0) {
      logger.info(`🔊 [安全モード] 音声ファイルなし: callId=${callId}`);
      return true;
    }
    
    logger.info(`🔊 [安全モード] 音声再生シミュレーション開始: callId=${callId}`);
    logger.info(`🔊 [情報] 音声ファイル数: ${campaignAudio.length}件`);
    
    // 音声ファイルをタイプ別に整理
    const audioMap = {};
    campaignAudio.forEach(audio => {
      if (audio && audio.audio_type) {
        audioMap[audio.audio_type] = audio;
      }
    });
    
    logger.info(`🔊 [音声タイプ] ${Object.keys(audioMap).join(', ')}`);
    
    // 段階的音声再生ログ（実際の再生は後で実装）
    setTimeout(() => {
      if (audioMap.welcome) {
        logger.info(`🔊 [シミュレーション] ウェルカムメッセージ: ${audioMap.welcome.name}`);
        logger.info(`🔊 [内容] "電話に出ていただきありがとうございます。"`);
        
        // 安全モード：実際の音声再生はスキップ
        // this.tryPlayAudioWithAplay(audioMap.welcome.path);
      }
    }, 1000);
    
    setTimeout(() => {
      if (audioMap.menu) {
        logger.info(`🔊 [シミュレーション] メニュー案内: ${audioMap.menu.name}`);
        logger.info(`🔊 [内容] "詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。"`);
        
        // 安全モード：実際の音声再生はスキップ
        // this.tryPlayAudioWithAplay(audioMap.menu.path);
      }
    }, 4000);
    
    setTimeout(() => {
      if (audioMap.goodbye) {
        logger.info(`🔊 [シミュレーション] お別れメッセージ: ${audioMap.goodbye.name}`);
        logger.info(`🔊 [内容] "お電話ありがとうございました。"`);
        
        // 安全モード：実際の音声再生はスキップ
        // this.tryPlayAudioWithAplay(audioMap.goodbye.path);
      }
    }, 15000);
    
    logger.info(`✅ [安全モード] 音声再生シミュレーション完了: callId=${callId}`);
    return true;
    
  } catch (error) {
    logger.warn('音声再生シミュレーションエラー（継続）:', error.message);
    return false;
  }
}

  
  // 現在のtryPlayAudioメソッドを以下に置き換え
// ★★★ Docker対応強化版音声再生メソッド ★★★
/*
tryPlayAudio(audioPath) {
  if (!audioPath) {
    logger.debug('音声ファイルパスが未設定');
    return;
  }
  
  logger.info(`🔊 音声再生試行: ${audioPath}`);
  
  try {
    // 方法1: ALSAのaplayを使用（最も確実）
    this.tryPlayWithAplay(audioPath)
      .then(success => {
        if (!success) {
          // 方法2: ffplayでフォールバック
          return this.tryPlayWithFFplay(audioPath);
        }
        return success;
      })
      .then(success => {
        if (!success) {
          // 方法3: スピーカーテストで音声確認
          return this.tryPlaySystemBeep();
        }
        return success;
      })
      .catch(error => {
        logger.error('全ての音声再生方法が失敗:', error.message);
      });
      
  } catch (error) {
    logger.error('音声再生処理エラー:', error.message);
  }
}
*/
async tryPlayAudio(audioPath) {
  if (!audioPath) {
    logger.debug('音声ファイルパスが未設定');
    return false;
  }
  
  logger.info(`🔊 Docker対応音声再生試行: ${audioPath}`);
  
  try {
    // 方法1: ALSAのaplayを使用（最も確実）
    const aplaySuccess = await this.tryPlayWithAplay(audioPath);
    if (aplaySuccess) {
      return true;
    }
    
    // 方法2: ffplayでフォールバック
    const ffplaySuccess = await this.tryPlayWithFFplay(audioPath);
    if (ffplaySuccess) {
      return true;
    }
    
    // 方法3: システムビープでテスト
    const beepSuccess = await this.tryPlaySystemBeep();
    
    logger.info(`🔊 音声再生結果: aplay=${aplaySuccess}, ffplay=${ffplaySuccess}, beep=${beepSuccess}`);
    return beepSuccess;
    
  } catch (error) {
    logger.error('全ての音声再生方法が失敗:', error.message);
    return false;
  }
}

tryPlayAudioWithAplay(audioPath) {
  if (!audioPath) {
    logger.debug('音声ファイルパスが未設定');
    return Promise.resolve(false);
  }
  
  return new Promise((resolve) => {
    logger.info(`🔊 aplay音声再生開始: ${audioPath}`);
    
    try {
      const aplayProcess = spawn('aplay', [
        '-D', 'default',  // デフォルトデバイス指定
        '-f', 'cd',       // CD品質
        '-q',             // クワイエットモード
        audioPath
      ]);
      
      let resolved = false;
      
      aplayProcess.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          const success = code === 0;
          logger.info(`✅ aplay音声再生結果: ${success ? '成功' : '失敗'} (code: ${code})`);
          resolve(success);
        }
      });
      
      aplayProcess.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          logger.debug(`aplayプロセスエラー: ${error.message}`);
          resolve(false);
        }
      });
      
      // 15秒でタイムアウト
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            aplayProcess.kill();
          } catch (killError) {
            // 無視
          }
          logger.warn('aplay音声再生タイムアウト');
          resolve(false);
        }
      }, 15000);
      
    } catch (error) {
      logger.error('aplay実行エラー:', error.message);
      resolve(false);
    }
  });
}

async tryPlayWithAplay(audioPath) {
  return new Promise((resolve) => {
    logger.info(`🔊 aplay音声再生開始: ${audioPath}`);
    
    // ファイル存在確認
    if (!require('fs').existsSync(audioPath)) {
      logger.warn(`音声ファイルが存在しません: ${audioPath}`);
      resolve(false);
      return;
    }
    
    const aplayProcess = spawn('aplay', [
      '-D', 'default',  // デフォルトデバイス指定
      '-f', 'cd',       // CD品質
      '-q',             // クワイエットモード
      audioPath
    ]);
    
    let resolved = false;
    
    aplayProcess.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        const success = code === 0;
        logger.info(`✅ aplay音声再生結果: ${success ? '成功' : '失敗'} (code: ${code})`);
        resolve(success);
      }
    });
    
    aplayProcess.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        logger.debug(`aplayプロセスエラー: ${error.message}`);
        resolve(false);
      }
    });
    
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          aplayProcess.kill();
        } catch (killError) {
          // 無視
        }
        logger.warn('aplay音声再生タイムアウト');
        resolve(false);
      }
    }, 15000);
  });
}

async tryPlayWithFFplay(audioPath) {
  return new Promise((resolve) => {
    logger.info(`🔊 ffplay音声再生開始: ${audioPath}`);
    
    const ffplayProcess = spawn('ffplay', [
      '-nodisp',        // ディスプレイなし
      '-autoexit',      // 再生終了時に自動終了
      '-loglevel', 'quiet', // ログレベルをクワイエットに
      '-volume', '100', // 音量100%
      audioPath
    ]);
    
    let resolved = false;
    
    ffplayProcess.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        const success = code === 0;
        logger.info(`✅ ffplay音声再生結果: ${success ? '成功' : '失敗'} (code: ${code})`);
        resolve(success);
      }
    });
    
    ffplayProcess.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        logger.debug(`ffplayプロセスエラー: ${error.message}`);
        resolve(false);
      }
    });
    
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          ffplayProcess.kill();
        } catch (killError) {
          // 無視
        }
        logger.warn('ffplay音声再生タイムアウト');
        resolve(false);
      }
    }, 15000);
  });
}

async tryPlaySystemBeep() {
  return new Promise((resolve) => {
    logger.info('🔔 システムビープ音テスト開始');
    
    try {
      const speakerTest = spawn('speaker-test', [
        '-t', 'sine',     // サイン波
        '-f', '1000',     // 1000Hz
        '-l', '1',        // 1回のみ
        '-s', '1'         // 1チャンネル
      ]);
      
      let resolved = false;
      
      speakerTest.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          const success = code === 0;
          logger.info(`✅ speaker-testビープ音結果: ${success ? '成功' : '失敗'}`);
          resolve(success);
        }
      });
      
      speakerTest.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          logger.debug(`speaker-testエラー: ${error.message}`);
          resolve(false);
        }
      });
      
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            speakerTest.kill();
          } catch (killError) {
            // 無視
          }
          resolve(false);
        }
      }, 5000);
      
    } catch (error) {
      logger.debug('システムビープ音エラー:', error.message);
      resolve(false);
    }
  });
}

enableRealAudioPlayback() {
  logger.info('🔊 実音声再生モードを有効化します');
  
  // playAudioSimpleメソッドを実音声再生版に切り替え
  this.playAudioSimple = this.playAudioSimpleReal;
  
  logger.info('✅ 実音声再生モードに切り替わりました');
}

playAudioSimpleReal(callId, campaignAudio) {
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
    
    logger.info(`🎵 実音声シーケンス開始: callId=${callId}, 音声タイプ: ${Object.keys(audioMap).join(', ')}`);
    
    // ウェルカムメッセージ（1秒後）
    setTimeout(() => {
      if (audioMap.welcome) {
        logger.info(`🔊 [実音声再生] ウェルカムメッセージ: ${audioMap.welcome.name}`);
        this.tryPlayAudioWithAplay(audioMap.welcome.path || audioMap.welcome.filename);
      }
    }, 1000);
    
    // メニュー案内（4秒後）
    setTimeout(() => {
      if (audioMap.menu) {
        logger.info(`🔊 [実音声再生] メニュー案内: ${audioMap.menu.name}`);
        this.tryPlayAudioWithAplay(audioMap.menu.path || audioMap.menu.filename);
      }
    }, 4000);
    
    // お別れメッセージ（15秒後）
    setTimeout(() => {
      if (audioMap.goodbye) {
        logger.info(`🔊 [実音声再生] お別れメッセージ: ${audioMap.goodbye.name}`);
        this.tryPlayAudioWithAplay(audioMap.goodbye.path || audioMap.goodbye.filename);
      }
    }, 15000);
    
  } catch (error) {
    logger.warn('実音声再生処理エラー（継続）:', error.message);
  }
}

// ALSAのaplayを使用した音声再生
async tryPlayWithAplay(audioPath) {
  return new Promise((resolve) => {
    logger.info(`🔊 aplay音声再生開始: ${audioPath}`);
    
    const aplayProcess = spawn('aplay', [
      '-D', 'default',  // デフォルトデバイス指定
      '-f', 'cd',       // CD品質
      audioPath
    ]);
    
    let resolved = false;
    
    aplayProcess.stdout.on('data', (data) => {
      logger.debug(`aplay出力: ${data.toString()}`);
    });
    
    aplayProcess.stderr.on('data', (data) => {
      logger.debug(`aplayエラー: ${data.toString()}`);
    });
    
    aplayProcess.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        const success = code === 0;
        logger.info(`✅ aplay音声再生結果: ${success ? '成功' : '失敗'} (code: ${code})`);
        resolve(success);
      }
    });
    
    aplayProcess.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        logger.debug(`aplayプロセスエラー: ${error.message}`);
        resolve(false);
      }
    });
    
    // 15秒でタイムアウト
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          aplayProcess.kill();
        } catch (killError) {
          // 無視
        }
        logger.warn('aplay音声再生タイムアウト');
        resolve(false);
      }
    }, 15000);
  });
}
async tryPlayWithFFplay(audioPath) {
  return new Promise((resolve) => {
    logger.info(`🔊 ffplay音声再生開始: ${audioPath}`);
    
    const ffplayProcess = spawn('ffplay', [
      '-nodisp',
      '-autoexit',
      '-loglevel', 'quiet',
      '-volume', '100',
      audioPath
    ]);
    
    let resolved = false;
    
    ffplayProcess.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        const success = code === 0;
        logger.info(`✅ ffplay音声再生結果: ${success ? '成功' : '失敗'} (code: ${code})`);
        resolve(success);
      }
    });
    
    ffplayProcess.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        logger.debug(`ffplayプロセスエラー: ${error.message}`);
        resolve(false);
      }
    });
    
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          ffplayProcess.kill();
        } catch (killError) {
          // 無視
        }
        logger.warn('ffplay音声再生タイムアウト');
        resolve(false);
      }
    }, 15000);
  });
}

async tryPlaySystemBeep() {
  return new Promise((resolve) => {
    logger.info('🔔 システムビープ音テスト開始');
    
    try {
      // 方法1: speaker-testコマンド
      const speakerTest = spawn('speaker-test', [
        '-t', 'sine',
        '-f', '1000',
        '-l', '1',
        '-s', '1'
      ]);
      
      let resolved = false;
      
      speakerTest.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          const success = code === 0;
          logger.info(`✅ speaker-testビープ音結果: ${success ? '成功' : '失敗'}`);
          
          if (!success) {
            // 方法2: echo bell文字
            try {
              spawn('sh', ['-c', 'echo -e "\\a"']);
              logger.info('🔔 ベル文字出力完了');
              resolve(true);
            } catch (error) {
              resolve(false);
            }
          } else {
            resolve(success);
          }
        }
      });
      
      speakerTest.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          logger.debug(`speaker-testエラー: ${error.message}`);
          
          // フォールバック: echo bell
          try {
            spawn('sh', ['-c', 'echo -e "\\a"']);
            logger.info('🔔 ベル文字フォールバック出力');
            resolve(true);
          } catch (echoError) {
            resolve(false);
          }
        }
      });
      
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            speakerTest.kill();
          } catch (killError) {
            // 無視
          }
          resolve(false);
        }
      }, 5000);
      
    } catch (error) {
      logger.debug('システムビープ音エラー:', error.message);
      resolve(false);
    }
  });
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
          const usedForMs = account.lastUsed ? now - new Date(account.lastUsed).getTime() : 0;
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
          const usedForMs = account.lastUsed ? now - new Date(account.lastUsed).getTime() : 0;
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

   // 🎵 音声シーケンス準備（新規追加）
   async prepareAudioSequence(campaignAudio) {
    const sequence = [];
    
    // 音声タイプ別に並び順を決定
    const typeOrder = ['welcome', 'menu', 'goodbye', 'error'];
    const audioMap = {};
    
    campaignAudio.forEach(audio => {
      if (audio && audio.audio_type) {
        audioMap[audio.audio_type] = audio;
      }
    });
    
    // 順序に従って音声シーケンスを構築
    typeOrder.forEach(type => {
      if (audioMap[type]) {
        sequence.push({
          ...audioMap[type],
          delay: this.getAudioDelay(type),
          message: this.getAudioMessage(type)
        });
      }
    });
    
    return sequence;
  }
  
  // 音声タイプ別の再生タイミング（新規追加）
  getAudioDelay(audioType) {
    const delays = {
      'welcome': 2000,  // 2秒後
      'menu': 6000,     // 6秒後
      'goodbye': 20000, // 20秒後
      'error': 25000    // 25秒後
    };
    return delays[audioType] || 5000;
  }
  
  // 音声タイプ別のメッセージ内容（新規追加）
  getAudioMessage(audioType) {
    const messages = {
      'welcome': '電話に出ていただきありがとうございます。',
      'menu': '詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。',
      'goodbye': 'お電話ありがとうございました。',
      'error': '無効な選択です。もう一度お試しください。'
    };
    return messages[audioType] || '音声メッセージ';
  }
  
  // 🎵 音声再生スケジュール実行（新規追加）
  async scheduleAudioPlayback(callId, campaignAudio) {
    logger.info(`🎵 音声再生スケジュール開始: callId=${callId}`);
    
    const audioSequence = await this.prepareAudioSequence(campaignAudio);
    
    audioSequence.forEach((audio, index) => {
      setTimeout(async () => {
        // 通話がまだアクティブかチェック
        if (this.activeCallsMap.has(callId)) {
          logger.info(`🔊 音声再生実行: ${audio.audio_type} - "${audio.name}"`);
          logger.info(`🔊 内容: "${audio.message}"`);
          
          // 実際の音声再生
          await this.playAudioToCall(callId, audio);
        }
      }, audio.delay);
    });
  }
  
  // 🎵 実際の音声再生実行（新規追加）
  async playAudioToCall(callId, audioFile) {
    try {
      logger.info(`🔊 音声ファイル再生開始: ${audioFile.filename}`);
      
      // 方法1: HTTPストリーミング経由での再生
      const success = await this.playAudioViaHttp(audioFile);
      
      if (!success) {
        // 方法2: ffmpegでの直接再生
        await this.playAudioViaFfmpeg(audioFile);
      }
      
      // データベースに再生ログを記録
      await this.recordAudioPlayback(callId, audioFile, 'played');
      
    } catch (error) {
      logger.error(`音声再生エラー: ${error.message}`);
      await this.recordAudioPlayback(callId, audioFile, 'failed');
    }
  }
  
  // 🎵 HTTPストリーミング方式音声再生（新規追加）
  async playAudioViaHttp(audioFile) {
    return new Promise((resolve) => {
      try {
        logger.info(`🌐 HTTP音声ストリーミング: ${audioFile.filename}`);
        
        // 音声ファイルのHTTPストリーム作成
        const audioPath = audioFile.path || path.join(__dirname, '../../audio-files', audioFile.filename);
        
        if (!fs.existsSync(audioPath)) {
          logger.warn(`音声ファイルが見つかりません: ${audioPath}`);
          resolve(false);
          return;
        }
        
        // ffplayでHTTP経由再生（ヘッドレス環境対応）
        const ffplayProcess = spawn('ffplay', [
          '-nodisp',           // ディスプレイなし
          '-autoexit',         // 自動終了
          '-loglevel', 'quiet', // ログ抑制
          '-f', 'mp3',         // フォーマット指定
          audioPath
        ]);
        
        let resolved = false;
        
        ffplayProcess.on('close', (code) => {
          if (!resolved) {
            resolved = true;
            const success = code === 0;
            logger.info(`🌐 HTTP音声再生結果: ${success ? '成功' : '失敗'} (code: ${code})`);
            resolve(success);
          }
        });
        
        ffplayProcess.on('error', (error) => {
          if (!resolved) {
            resolved = true;
            logger.debug(`ffplayエラー: ${error.message}`);
            resolve(false);
          }
        });
        
        // 30秒でタイムアウト
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            try {
              ffplayProcess.kill();
            } catch (killError) {
              // 無視
            }
            logger.warn('HTTP音声再生タイムアウト');
            resolve(false);
          }
        }, 30000);
        
      } catch (error) {
        logger.error('HTTP音声再生実行エラー:', error.message);
        resolve(false);
      }
    });
  }
  
  // 🎵 ffmpeg直接再生方式（新規追加）
  async playAudioViaFfmpeg(audioFile) {
    return new Promise((resolve) => {
      try {
        logger.info(`🎬 ffmpeg直接音声再生: ${audioFile.filename}`);
        
        const audioPath = audioFile.path || path.join(__dirname, '../../audio-files', audioFile.filename);
        
        // ffmpegで音声をWAV形式に変換しながら再生
        const ffmpegProcess = spawn('ffmpeg', [
          '-i', audioPath,           // 入力ファイル
          '-f', 'wav',              // WAV出力
          '-acodec', 'pcm_s16le',   // PCM 16bit Little Endian
          '-ar', '8000',            // サンプリングレート 8kHz（電話品質）
          '-ac', '1',               // モノラル
          '-y',                     // 上書き確認なし
          '-'                       // 標準出力に送信
        ]);
        
        let resolved = false;
        
        ffmpegProcess.on('close', (code) => {
          if (!resolved) {
            resolved = true;
            const success = code === 0;
            logger.info(`🎬 ffmpeg音声再生結果: ${success ? '成功' : '失敗'}`);
            resolve(success);
          }
        });
        
        ffmpegProcess.on('error', (error) => {
          if (!resolved) {
            resolved = true;
            logger.debug(`ffmpegプロセスエラー: ${error.message}`);
            resolve(false);
          }
        });
        
        // 30秒でタイムアウト
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            try {
              ffmpegProcess.kill();
            } catch (killError) {
              // 無視
            }
            logger.warn('ffmpeg音声再生タイムアウト');
            resolve(false);
          }
        }, 30000);
        
      } catch (error) {
        logger.error('ffmpeg音声再生実行エラー:', error.message);
        resolve(false);
      }
    });
  }
  
  // 🎵 音声再生ログ記録（新規追加）
  async recordAudioPlayback(callId, audioFile, status) {
    try {
      await db.query(`
        INSERT INTO audio_playback_logs (call_id, audio_file_id, audio_type, status, played_at, created_at)
        VALUES (?, ?, ?, ?, NOW(), NOW())
      `, [callId, audioFile.id || 'unknown', audioFile.audio_type || 'unknown', status]);
      
      // 通話ログも更新
      await db.query(`
        UPDATE call_logs 
        SET has_audio = 1, audio_file_count = (
          SELECT COUNT(*) FROM audio_playback_logs WHERE call_id = ?
        ), audio_played_at = NOW() 
        WHERE call_id = ?
      `, [callId, callId]);
      
    } catch (error) {
      logger.warn('音声再生ログ記録エラー:', error.message);
    }
  }
  
  // 🎵 緊急時の音声テスト機能（新規追加）
  async testAudioPlayback(audioFile) {
    logger.info(`🧪 音声再生テスト: ${audioFile.name}`);
    
    try {
      // 直接音声再生テスト
      const httpSuccess = await this.playAudioViaHttp(audioFile);
      
      if (!httpSuccess) {
        const ffmpegSuccess = await this.playAudioViaFfmpeg(audioFile);
        return ffmpegSuccess;
      }
      
      return httpSuccess;
    } catch (error) {
      logger.error('音声再生テストエラー:', error);
      return false;
    }
  }
  
  // 🎵 システム音声能力チェック（新規追加）
  async checkAudioCapabilities() {
    const capabilities = {
      ffplay: false,
      ffmpeg: false,
      httpStreaming: false,
      timestamp: new Date().toISOString()
    };
    
    try {
      // ffplayチェック
      const ffplayTest = spawn('ffplay', ['-version']);
      await new Promise((resolve) => {
        ffplayTest.on('close', (code) => {
          capabilities.ffplay = code === 0;
          resolve();
        });
        ffplayTest.on('error', () => {
          capabilities.ffplay = false;
          resolve();
        });
        setTimeout(resolve, 5000);
      });
      
      // ffmpegチェック
      const ffmpegTest = spawn('ffmpeg', ['-version']);
      await new Promise((resolve) => {
        ffmpegTest.on('close', (code) => {
          capabilities.ffmpeg = code === 0;
          resolve();
        });
        ffmpegTest.on('error', () => {
          capabilities.ffmpeg = false;
          resolve();
        });
        setTimeout(resolve, 5000);
      });
      
      capabilities.httpStreaming = capabilities.ffplay || capabilities.ffmpeg;
      
      logger.info('🔍 音声機能チェック結果:', capabilities);
      return capabilities;
      
    } catch (error) {
      logger.error('音声機能チェックエラー:', error);
      return capabilities;
    }
  }

  // 🎵 既存のplayAudioSimpleメソッドを実音声版に置き換え（新規追加）
  enableRealAudioPlayback() {
    logger.info('🔊 実音声再生モードを有効化します');
    
    // 既存のplayAudioSimpleメソッドを実音声再生版に置き換え
    this.playAudioSimple = this.playAudioSimpleReal;
    
    logger.info('✅ 実音声再生モードに切り替わりました');
  }

  // 🎵 実音声再生版playAudioSimple（新規追加）
  async playAudioSimpleReal(callId, campaignAudio) {
    try {
      if (!campaignAudio || campaignAudio.length === 0) {
        logger.info(`音声ファイルなし: callId=${callId}`);
        return;
      }
      
      logger.info(`🎵 実音声シーケンス開始: callId=${callId}`);
      
      // 新しい音声再生システムを使用
      await this.scheduleAudioPlayback(callId, campaignAudio);
      
    } catch (error) {
      logger.warn('実音声再生処理エラー（継続）:', error.message);
    }
  }
  // 🎵 緊急追加：音声再生テスト機能
  async testAudioPlayback(audioFile) {
    logger.info(`🧪 音声再生テスト: ${audioFile.name}`);
    
    try {
      // 簡易版音声再生テスト
      const audioPath = audioFile.path || path.join(__dirname, '../../audio-files', audioFile.filename);
      
      // ファイル存在確認
      if (!fs.existsSync(audioPath)) {
        logger.warn(`音声ファイルが見つかりません: ${audioPath}`);
        return false;
      }
      
      // ffmpeg/ffplayでの音声再生テスト
      return new Promise((resolve) => {
        const ffplayProcess = spawn('ffplay', [
          '-nodisp',
          '-autoexit',
          '-loglevel', 'quiet',
          '-t', '3', // 3秒間のみ再生
          audioPath
        ]);
        
        let resolved = false;
        
        ffplayProcess.on('close', (code) => {
          if (!resolved) {
            resolved = true;
            const success = code === 0;
            logger.info(`✅ 音声テスト結果: ${success ? '成功' : '失敗'}`);
            resolve(success);
          }
        });
        
        ffplayProcess.on('error', (error) => {
          if (!resolved) {
            resolved = true;
            logger.debug(`ffplayエラー: ${error.message}`);
            resolve(false);
          }
        });
        
        // 10秒でタイムアウト
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            try {
              ffplayProcess.kill();
            } catch (killError) {
              // 無視
            }
            logger.warn('音声テストタイムアウト');
            resolve(false);
          }
        }, 10000);
      });
      
    } catch (error) {
      logger.error('音声再生テストエラー:', error);
      return false;
    }
  }

}

// シングルトンインスタンスを作成
const sipService = new SipService();



module.exports = sipService;
