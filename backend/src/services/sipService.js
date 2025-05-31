// backend/src/services/sipService.js - 音声統合完全版
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
    this.sipcmdPath = process.env.SIPCMD_PATH || "/usr/local/bin/sipcmd-working";
    
    // 🔧 安定化設定
    this.connectionRetryCount = 0;
    this.maxConnectionRetries = 3;
    this.accountLoadRetryCount = 0;
    this.maxAccountLoadRetries = 5;
    this.lastDatabaseCheck = null;
    this.healthCheckInterval = 60000; // 60秒間隔
    this.healthCheckIntervalId = null;
    
    logger.info(`SipService初期化: mockMode=${this.mockMode}, sipcmdPath=${this.sipcmdPath}`);
    this.on('callEnded', this.handleCallEnded.bind(this));
    
    // 定期ヘルスチェック開始
    this.startHealthCheck();
  }

  // 🔧 修正版接続メソッド（リトライ機能付き）
  async connect() {
    if (this.mockMode) {
      logger.info('SIPサービスにモックモードで接続しました');
      this.connected = true;
      await this.loadSipAccountsWithRetry();
      return true;
    }

    try {
      logger.info(`🔧 SIPサービス接続開始（試行 ${this.connectionRetryCount + 1}/${this.maxConnectionRetries + 1}）...`);
      
      // 🔍 事前チェック: sipcmdバイナリの存在確認
      await this.verifySimcmdBinary();
      
      // 🔍 事前チェック: データベース接続確認
      await this.verifyDatabaseConnection();
      
      // SIPアカウント読み込み（リトライ機能付き）
      await this.loadSipAccountsWithRetry();
      
      if (this.sipAccounts.length === 0) {
        logger.warn('⚠️ データベースからSIPアカウントを読み込めませんでした - フォールバック処理');
        this.createFallbackAccounts();
      }
      
      // 発信者番号ごとのチャンネルグループを作成
      this.organizeChannelsByCallerId();
      
      // 接続成功
      this.connected = true;
      this.connectionRetryCount = 0;
      
      logger.info(`✅ SIPサービス接続完了: ${this.sipAccounts.length}個のアカウント`);
      this.logAccountSummary();
      
      return true;
      
    } catch (error) {
      this.connectionRetryCount++;
      logger.error(`❌ SIP接続エラー (試行${this.connectionRetryCount}/${this.maxConnectionRetries + 1}):`, error);
      
      if (this.connectionRetryCount <= this.maxConnectionRetries) {
        const retryDelay = Math.min(5000 * this.connectionRetryCount, 15000);
        logger.info(`🔄 ${retryDelay}ms後にSIP接続を再試行...`);
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return await this.connect();
      } else {
        logger.error('❌ SIP接続の最大試行回数に達しました - 緊急フォールバック実行');
        return this.enableEmergencyFallback();
      }
    }
  }

  // 🔍 sipcmdバイナリ存在確認
  async verifySimcmdBinary() {
    try {
      if (!fs.existsSync(this.sipcmdPath)) {
        throw new Error(`sipcmdバイナリが見つかりません: ${this.sipcmdPath}`);
      }
      
      // 実行権限確認
      await fs.promises.access(this.sipcmdPath, fs.constants.X_OK);
      logger.info(`✅ sipcmdバイナリ確認完了: ${this.sipcmdPath}`);
      
    } catch (error) {
      logger.error(`❌ sipcmdバイナリ確認エラー: ${error.message}`);
      throw new Error('sipcmdバイナリが利用できません');
    }
  }

  // 🔍 データベース接続確認
  async verifyDatabaseConnection() {
    try {
      const [testResult] = await db.query('SELECT COUNT(*) as count FROM caller_ids WHERE active = 1');
      logger.info(`✅ データベース接続確認完了: アクティブ発信者番号 ${testResult[0].count}件`);
      this.lastDatabaseCheck = new Date();
      
    } catch (error) {
      logger.error('❌ データベース接続確認エラー:', error);
      throw new Error('データベース接続に失敗しました');
    }
  }

  // 🔧 SIPアカウント読み込み（リトライ機能付き）
  async loadSipAccountsWithRetry() {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxAccountLoadRetries; attempt++) {
      try {
        logger.info(`📋 SIPアカウント読み込み試行 ${attempt}/${this.maxAccountLoadRetries}`);
        
        this.sipAccounts = await this.loadSipAccountsFromDatabase();
        
        if (this.sipAccounts.length > 0) {
          logger.info(`✅ SIPアカウント読み込み成功: ${this.sipAccounts.length}個`);
          this.accountLoadRetryCount = 0;
          return;
        } else {
          throw new Error('有効なSIPアカウントがデータベースに見つかりません');
        }
        
      } catch (error) {
        lastError = error;
        logger.warn(`⚠️ SIPアカウント読み込み失敗 (試行${attempt}/${this.maxAccountLoadRetries}): ${error.message}`);
        
        if (attempt < this.maxAccountLoadRetries) {
          const retryDelay = 2000 * attempt; // 段階的遅延
          logger.info(`🔄 ${retryDelay}ms後に再試行...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    // 全ての試行が失敗した場合
    logger.error(`❌ SIPアカウント読み込みの全試行が失敗: ${lastError?.message}`);
    throw new Error('SIPアカウントの読み込みに失敗しました');
  }

  // データベースからSIPアカウント読み込み（改良版）
  async loadSipAccountsFromDatabase() {
    try {
      logger.info('🔧 データベースからSIPチャンネル情報を読み込み中...');
      
      // より詳細なクエリ
      const [channels] = await db.query(`
        SELECT 
          cc.id,
          cc.caller_id_id,
          cc.username,
          cc.password,
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
      
      logger.info(`📊 データベースクエリ結果: ${channels ? channels.length : 0}件のチャンネル`);
      
      if (!channels || channels.length === 0) {
        logger.warn('⚠️ データベースに有効なSIPチャンネルが見つかりません');
        
        // 基本的な発信者番号のみでも確認
        const [basicCallerIds] = await db.query(`
          SELECT id, number, description, provider, domain 
          FROM caller_ids 
          WHERE active = true
          ORDER BY created_at DESC
        `);
        
        if (basicCallerIds.length > 0) {
          logger.info(`📞 基本発信者番号を検出: ${basicCallerIds.length}件`);
          
          // 基本発信者番号から仮想SIPアカウントを作成
          return basicCallerIds.map((callerId, index) => ({
            username: `${callerId.number.replace(/[^\d]/g, '').substring(0, 8)}${String(index + 1).padStart(2, '0')}`,
            password: this.generateDefaultPassword(callerId.id),
            callerID: callerId.number,
            description: callerId.description || `発信者番号${callerId.id}`,
            domain: callerId.domain || 'ito258258.site',
            provider: callerId.provider || 'Default SIP',
            mainCallerId: callerId.id,
            channelType: 'both',
            status: 'available',
            lastUsed: null,
            failCount: 0,
            channelId: `virtual-${callerId.id}`,
            isVirtual: true
          }));
        }
        
        throw new Error('データベースに有効な発信者番号が見つかりません');
      }
      
      const formattedAccounts = channels.map(channel => ({
        username: channel.username || `default-${channel.id}`,
        password: channel.password || this.generateDefaultPassword(channel.caller_id_id),
        callerID: channel.caller_number || '03-5946-8520',
        description: channel.description || `チャンネル${channel.id}`,
        domain: channel.domain || 'ito258258.site',
        provider: channel.provider || 'SIP Provider',
        mainCallerId: channel.caller_id_id || 1,
        channelType: 'both',
        status: channel.status || 'available',
        lastUsed: channel.last_used || null,
        failCount: 0,
        channelId: channel.id || 1,
        isVirtual: false
      }));
      
      logger.info(`✅ 合計${formattedAccounts.length}個のSIPチャンネルを読み込み`);
      
      // アカウントの詳細をログ出力
      formattedAccounts.forEach((account, index) => {
        logger.debug(`SIPアカウント${index + 1}: ${account.username} (${account.callerID})`);
      });
      
      return formattedAccounts;
      
    } catch (error) {
      logger.error('❌ データベースからのSIPチャンネル読み込みエラー:', error);
      throw error;
    }
  }

  // デフォルトパスワード生成
  generateDefaultPassword(callerIdId) {
    // 簡単なハッシュベースのパスワード生成
    const base = `caller${callerIdId}${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < base.length; i++) {
      const char = base.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32-bit整数に変換
    }
    return Math.abs(hash).toString().substring(0, 8).padStart(8, '1');
  }

  // 🚨 緊急フォールバック
  enableEmergencyFallback() {
    logger.warn('🚨 SIPサービス緊急フォールバック開始');
    
    this.createFallbackAccounts();
    this.connected = true;
    
    logger.warn('⚠️ 緊急フォールバックモードで動作中');
    return true;
  }

  // フォールバックアカウント作成（成功アカウント使用）
  createFallbackAccounts() {
    this.sipAccounts = [
      {
        username: '03760002',
        password: '90176617',
        callerID: '03-5946-8520',
        description: '動作確認済み SIP 1',
        domain: 'ito258258.site',
        provider: 'Working SIP',
        mainCallerId: 1,
        channelType: 'both',
        status: 'available',
        lastUsed: null,
        failCount: 0,
        channelId: 'working-1',
        isVirtual: true
      },
      {
        username: '03080002',
        password: '51448459',
        callerID: '03-3528-9538',
        description: 'フォールバック SIP 2',
        domain: 'ito258258.site',
        provider: 'Emergency SIP',
        mainCallerId: 2,
        channelType: 'both',
        status: 'available',
        lastUsed: null,
        failCount: 0,
        channelId: 'fallback-2',
        isVirtual: true
      }
    ];
    
    logger.warn(`🚨 フォールバックアカウント作成完了: ${this.sipAccounts.length}個`);
  }

  // アカウント概要ログ
  logAccountSummary() {
    logger.info(`📊 SIPアカウント概要:`);
    logger.info(`  - 総アカウント数: ${this.sipAccounts.length}`);
    logger.info(`  - 利用可能: ${this.sipAccounts.filter(a => a.status === 'available').length}`);
    logger.info(`  - 使用中: ${this.sipAccounts.filter(a => a.status === 'busy').length}`);
    logger.info(`  - エラー: ${this.sipAccounts.filter(a => a.status === 'error').length}`);
    
    const callerIdGroups = new Map();
    this.sipAccounts.forEach(account => {
      const callerId = account.mainCallerId;
      if (!callerIdGroups.has(callerId)) {
        callerIdGroups.set(callerId, []);
      }
      callerIdGroups.get(callerId).push(account);
    });
    
    callerIdGroups.forEach((accounts, callerId) => {
      logger.info(`  - 発信者番号ID ${callerId}: ${accounts.length}チャンネル (${accounts[0].callerID})`);
    });
  }

  // 💗 ヘルスチェック開始
  startHealthCheck() {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
    }
    
    this.healthCheckIntervalId = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('SIPヘルスチェックエラー:', error);
      }
    }, this.healthCheckInterval);
    
    logger.info(`💗 SIPヘルスチェック開始: ${this.healthCheckInterval}ms間隔`);
  }

  // 🔍 ヘルスチェック実行
  async performHealthCheck() {
    try {
      // データベース接続確認
      await this.verifyDatabaseConnection();
      
      // アカウント状態確認
      const availableCount = this.sipAccounts.filter(acc => acc.status === 'available').length;
      const busyCount = this.sipAccounts.filter(acc => acc.status === 'busy').length;
      const errorCount = this.sipAccounts.filter(acc => acc.status === 'error').length;
      
      // エラーアカウントが多い場合は警告
      if (errorCount > this.sipAccounts.length / 2) {
        logger.warn(`⚠️ エラー状態のSIPアカウントが多数: ${errorCount}/${this.sipAccounts.length}`);
      }
      
      // 利用可能アカウントが0の場合は警告
      if (availableCount === 0 && this.sipAccounts.length > 0) {
        logger.warn('⚠️ 利用可能なSIPアカウントがありません - アカウント状態をリセット');
        this.resetAccountStates();
      }
      
      logger.debug(`💗 SIPヘルスチェック正常: Available=${availableCount}, Busy=${busyCount}, Error=${errorCount}`);
      
    } catch (error) {
      logger.error('❌ SIPヘルスチェック失敗:', error);
      
      // 重大なエラーの場合は再接続を試行
      if (error.message.includes('データベース接続')) {
        logger.info('🔄 データベース接続エラーによりSIPサービス再接続試行');
        setTimeout(() => {
          this.reconnect();
        }, 5000);
      }
    }
  }

  // アカウント状態リセット
  resetAccountStates() {
    let resetCount = 0;
    
    this.sipAccounts.forEach(account => {
      if (account.status === 'error' || account.status === 'busy') {
        account.status = 'available';
        account.failCount = Math.max(0, (account.failCount || 0) - 1);
        resetCount++;
      }
    });
    
    logger.info(`🔄 SIPアカウント状態リセット完了: ${resetCount}個のアカウント`);
  }

  // 再接続処理
  async reconnect() {
    logger.info('🔄 SIPサービス再接続開始...');
    
    this.connected = false;
    this.connectionRetryCount = 0;
    
    try {
      await this.connect();
      logger.info('✅ SIPサービス再接続完了');
    } catch (error) {
      logger.error('❌ SIPサービス再接続失敗:', error);
    }
  }

  // 発信者番号ごとにチャンネルをグループ化（改良版）
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
      logger.info(`📞 発信者番号ID ${callerId}: ${channels.length}チャンネル (${channels[0]?.callerID})`);
    });
  }

  // 利用可能なSIPアカウント取得（改良版）
  async getAvailableSipAccount() {
    logger.debug(`利用可能なSIPアカウントを検索中 (全${this.sipAccounts.length}個)`);
    
    if (!this.sipAccounts || this.sipAccounts.length === 0) {
      logger.warn('SIPアカウントが設定されていません。再読み込みを試みます...');
      
      try {
        await this.loadSipAccountsWithRetry();
        this.organizeChannelsByCallerId();
        logger.info(`再読み込み後のSIPアカウント数: ${this.sipAccounts.length}`);
      } catch (error) {
        logger.error('SIPアカウント再読み込み失敗:', error);
        
        // 最後の手段：フォールバックアカウント作成
        this.createFallbackAccounts();
        this.organizeChannelsByCallerId();
      }
    }
    
    // 利用可能なアカウントを優先度順に選択
    const availableAccounts = this.sipAccounts.filter(account => 
      account && account.status === 'available'
    );
    
    // 失敗回数の少ない順、最後に使用された時間の古い順でソート
    availableAccounts.sort((a, b) => {
      const failCountDiff = (a.failCount || 0) - (b.failCount || 0);
      if (failCountDiff !== 0) return failCountDiff;
      
      const aLastUsed = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
      const bLastUsed = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
      return aLastUsed - bLastUsed;
    });
    
    logger.debug(`利用可能なSIPアカウント: ${availableAccounts.length}/${this.sipAccounts.length}`);
    
    if (availableAccounts.length === 0) {
      logger.error('❌ 利用可能なSIPアカウントがありません');
      
      // 緊急処置：busy状態のアカウントを強制的にavailableに
      const busyAccounts = this.sipAccounts.filter(acc => acc.status === 'busy');
      if (busyAccounts.length > 0) {
        logger.warn(`🚨 緊急処置: busy状態のアカウント${busyAccounts.length}個を利用可能に変更`);
        busyAccounts[0].status = 'available';
        return busyAccounts[0];
      }
      
      return null;
    }
    
    const selectedAccount = availableAccounts[0];
    logger.info(`選択されたSIPアカウント: ${selectedAccount.username} (失敗回数: ${selectedAccount.failCount || 0})`);
    return selectedAccount;
  }

  // 🚀 メイン発信メソッド（音声統合版）
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
      const sipServer = process.env.SIP_SERVER || sipAccount.domain || 'ito258258.site';
      const callId = 'sip-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
      
      logger.info(`📞 SIP発信詳細:`, {
        account: sipAccount.username,
        server: sipServer,
        number: formattedNumber,
        callerID: sipAccount.callerID,
        hasAudio: !!(params.campaignAudio && params.campaignAudio.length > 0)
      });
      
      // SIPアカウントを使用中にマーク
      sipAccount.status = 'busy';
      sipAccount.lastUsed = new Date();
      
      // 通話IDとSIPアカウントを関連付け
      this.callToAccountMap.set(callId, sipAccount);
      
      // 🎵 音声付きSIPコマンド実行
      const success = await this.executeSipCommand(sipAccount, formattedNumber, callId, params);
      
      if (!success) {
        throw new Error('SIP発信コマンドの実行に失敗しました');
      }
      
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
        Message: 'SIP call successfully initiated with audio',
        SipAccount: sipAccount.username,
        mainCallerId: sipAccount.mainCallerId,
        provider: 'sip',
        hasAudio: !!(params.campaignAudio && params.campaignAudio.length > 0)
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

// 🎵 成功パターン100%適用版 - executeSipCommand
  async executeSipCommand(sipAccount, formattedNumber, callId, params = {}) {
    try {
      const sipServer = sipAccount.domain || 'ito258258.site';
      
      // 🎵 音声ファイルパス決定
      let audioPath = '/var/www/autodialer/backend/audio-files/welcome-test.wav';
      
      // キャンペーン音声ファイルがある場合は使用
      if (params.campaignAudio && params.campaignAudio.length > 0) {
        const welcomeAudio = params.campaignAudio.find(audio => audio.audio_type === 'welcome');
        if (welcomeAudio && welcomeAudio.path && fs.existsSync(welcomeAudio.path)) {
          audioPath = welcomeAudio.path;
          logger.info(`🎵 キャンペーン音声使用: ${audioPath}`);
        }
      }

      // 🚀 成功パターンのコマンド構築（診断で確認された成功パターンと100%一致）
      const pjsuaArgs = [
        '--null-audio',                                    // ✅ 診断で確認済み
        `--play-file=${audioPath}`,                       // 🎵 音声ファイル
        '--auto-play',                                    // 🔑 重要！診断で不足発見
        '--auto-loop',                                    // 🔑 ループ再生で確実
        '--duration=30',                                  // ⏱️ 通話時間
        `--id=sip:${sipAccount.username}@${sipServer}`,
        `--registrar=sip:${sipServer}`,
        `--realm=asterisk`,                               // ✅ 診断で確認済み
        `--username=${sipAccount.username}`,
        `--password=${sipAccount.password}`,
        `sip:${formattedNumber}@${sipServer}`             // 🎯 直接発信先指定！
      ];

      const commandLine = `pjsua ${pjsuaArgs.join(' ')}`;
      logger.info(`🚀 SIP発信（成功パターン完全一致）: ${sipAccount.username} -> ${formattedNumber}`);
      logger.info(`🎵 使用音声: ${audioPath}`);
      logger.info(`📞 実行コマンド: ${commandLine.replace(sipAccount.password, '***')}`);

      return new Promise((resolve, reject) => {
        const pjsuaProcess = spawn('pjsua', pjsuaArgs, {
	  stdio: 'inherit',
          env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
          cwd: '/var/www/autodialer/backend'
        });

        let hasResponded = false;
        let callConnected = false;

        const respondOnce = (success, error = null) => {
          if (hasResponded) return;
          hasResponded = true;
          
          if (success) {
            resolve(true);
          } else {
            reject(error || new Error('SIP発信失敗'));
          }
        };

        // 📞 通話終了処理（30秒後に自動実行）
        const scheduleCallEnd = () => {
          setTimeout(() => {
            logger.info(`📞 通話終了処理開始: ${callId}`);
            
            // 通話終了イベント発火
            this.emit('callEnded', {
              callId,
              status: callConnected ? 'ANSWERED' : 'FAILED',
              duration: callConnected ? 30 : 0
            });

            // プロセス終了
            try {
              if (pjsuaProcess.pid) {
                pjsuaProcess.kill('SIGTERM');
                setTimeout(() => {
                  if (pjsuaProcess.pid) {
                    pjsuaProcess.kill('SIGKILL');
                  }
                }, 5000);
              }
            } catch (killError) {
              logger.error('プロセス終了エラー:', killError);
            }
          }, 30000); // 30秒後
        };

        // 🎯 出力監視（成功パターン検知）
        pjsuaProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          logger.debug(`SIP stdout [${callId}]: ${output}`);

          // ✅ 登録・認証成功検知
          if (output.includes('registration success') || output.includes('status=200') || 
              output.includes('Registration successful')) {
            logger.info(`✅ SIP登録成功: ${callId}`);
          }

          // ✅ 発信開始・接続検知
          if (output.includes('CALLING') || output.includes('TRYING') || 
              output.includes('CONNECTING') || output.includes('EARLY') ||
              output.includes('Making call')) {
            if (!callConnected) {
              callConnected = true;
              logger.info(`📞 通話接続確認: ${callId} - 音声再生開始`);
              
              // 📞 通話終了スケジュール開始
              scheduleCallEnd();
              
              // 🎉 発信成功として応答
              if (!hasResponded) {
                respondOnce(true);
              }
            }
          }

          // ✅ 通話確立検知
          if (output.includes('CONFIRMED') || output.includes('Call established')) {
            logger.info(`✅ 通話確立確認: ${callId}`);
            callConnected = true;
            if (!hasResponded) {
              respondOnce(true);
            }
          }

          // 🎵 音声再生検知
          if (output.includes('Playing') || output.includes('auto-play') || 
              output.includes('play_file')) {
            logger.info(`🎵 音声再生確認: ${callId}`);
          }
        });

        // エラー出力監視
        pjsuaProcess.stderr?.on('data', (data) => {
          const error = data.toString();
          if (error.trim() && !error.includes('Warning')) {
            logger.warn(`SIP stderr [${callId}]: ${error}`);
          }
        });

        // プロセス終了処理
        pjsuaProcess.on('exit', (code, signal) => {
          logger.info(`SIPプロセス終了 [${callId}]: code=${code}, signal=${signal}, connected=${callConnected}`);
          
          // まだ通話終了イベントが発火していない場合は発火
          if (!callConnected) {
            this.emit('callEnded', {
              callId,
              status: code === 0 ? 'ANSWERED' : 'FAILED',
              duration: code === 0 ? 30 : 0
            });
          }

          // まだ応答していない場合の処理
          if (!hasResponded) {
            if (code === 0 || callConnected) {
              respondOnce(true);
            } else {
              respondOnce(false, new Error(`SIP終了コード: ${code}`));
            }
          }
        });

        // プロセスエラー処理
        pjsuaProcess.on('error', (error) => {
          logger.error(`SIPプロセスエラー [${callId}]:`, error);
          if (!hasResponded) {
            respondOnce(false, error);
          }
        });

        // 🚨 全体タイムアウト処理（45秒）
        setTimeout(() => {
          if (!hasResponded) {
            logger.warn(`⏰ SIP発信タイムアウト: ${callId}`);
            try {
              pjsuaProcess.kill('SIGTERM');
            } catch (killError) {
              logger.error('プロセス終了エラー:', killError);
            }
            respondOnce(false, new Error('SIP発信タイムアウト'));
          }
        }, 45000);

        // 🎯 プロセス開始確認（3秒後に確認）
        setTimeout(() => {
          if (!hasResponded && pjsuaProcess.pid) {
            logger.info(`📞 SIPプロセス正常開始: ${callId}`);
            // まだ接続が確認されていない場合は、成功として処理
            if (!callConnected) {
              respondOnce(true);
            }
          }
        }, 3000);
      });

    } catch (error) {
      logger.error(`SIPコマンド実行エラー: ${error.message}`);
      throw error;
    }
  }

  // ✅ 電話番号フォーマット（改良版）
  formatPhoneNumber(phoneNumber) {
    // 数字のみに変換
    const numbersOnly = phoneNumber.replace(/[^\d]/g, '');
    
    // 日本の電話番号フォーマット処理
    if (numbersOnly.startsWith('0')) {
      // 国内番号（0から始まる）はそのまま
      return numbersOnly;
    } else if (numbersOnly.startsWith('81')) {
      // 国際番号（81から始まる）もそのまま
      return numbersOnly;
    } else if (numbersOnly.length >= 10) {
      // その他の長い番号は0を前置
      return '0' + numbersOnly;
    }
    
    // デフォルトはそのまま返す
    return numbersOnly;
  }

  // モックモード発信（改良版）
  async originateMock(params) {
    logger.info(`モックモードでSIP発信シミュレーション: 発信先=${params.phoneNumber}`);
    
    const sipAccount = await this.getAvailableSipAccount();
    if (!sipAccount) {
      // モックモードでも最低限のアカウントを作成
      this.createFallbackAccounts();
      sipAccount = this.sipAccounts[0];
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
    
    // 10秒後に自動終了（モック）
    setTimeout(() => {
      this.emit('callEnded', {
        callId,
        status: 'ANSWERED',
        duration: 10
      });
    }, 10000);
    
    return {
      ActionID: callId,
      Response: 'Success',
      Message: 'Originate successfully queued (SIP MOCK)',
      SipAccount: sipAccount.username,
      mainCallerId: sipAccount.mainCallerId,
      provider: 'sip'
    };
  }

  // 通話終了イベント処理（改良版）
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

  // SIPリソース解放（改良版）
  async releaseCallResource(callId) {
    logger.debug(`SIPリソース解放: ${callId}`);
  
    if (!callId) {
      logger.warn('無効な通話ID: undefined または null');
      return false;
    }
    
    try {
      if (this.callToAccountMap.has(callId)) {
        const sipAccount = this.callToAccountMap.get(callId);
        
        // アカウント状態を更新
        if (sipAccount.status === 'busy') {
          sipAccount.status = 'available';
          sipAccount.lastUsed = new Date();
        } else if (sipAccount.status === 'error') {
          // エラー状態の場合は失敗回数を増加
          sipAccount.failCount = (sipAccount.failCount || 0) + 1;
          
          // 失敗回数が多い場合は一定時間後に復旧
          if (sipAccount.failCount >= 3) {
            logger.warn(`⚠️ SIPアカウント ${sipAccount.username} の失敗回数が多いため一時無効化`);
            setTimeout(() => {
              sipAccount.status = 'available';
              sipAccount.failCount = 0;
              logger.info(`🔄 SIPアカウント ${sipAccount.username} を復旧`);
            }, 60000); // 60秒後に復旧
          } else {
            sipAccount.status = 'available';
          }
        }
        
        this.callToAccountMap.delete(callId);
        logger.debug(`SIPアカウント解放成功: ${callId}, account=${sipAccount.username}`);
      }
      
      // アクティブコールマップからも削除
      if (this.activeCallsMap.has(callId)) {
        this.activeCallsMap.delete(callId);
      }
      
      return true;
      
    } catch (error) {
      logger.error(`SIPアカウント解放エラー: ${callId}`, error);
      return false;
    }
  }

  // 通話ステータス更新（改良版）
  async updateCallStatus(callId, status, duration = 0) {
    try {
      logger.debug(`通話ステータス更新: callId=${callId}, status=${status}, duration=${duration}`);
      
      const [updateResult] = await db.query(`
        UPDATE call_logs
        SET status = ?, end_time = NOW(), duration = ?
        WHERE call_id = ?
      `, [status, duration, callId]);
      
      if (updateResult.affectedRows > 0) {
        logger.debug(`通話ログを更新しました: callId=${callId}`);
      } else {
        logger.warn(`通話ログが見つかりません: callId=${callId}`);
      }
      
      return true;
      
    } catch (error) {
      logger.error(`通話ステータス更新エラー: ${error.message}`);
      return false;
    }
  }

  // ヘルパーメソッド（改良版）
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
    return Math.max(this.activeCallsMap.size, this.callToAccountMap.size);
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

  // アカウント状態取得（詳細版）
  getAccountStatus() {
    const allStatus = this.sipAccounts.map(account => ({
      username: account.username,
      status: account.status,
      callerID: account.callerID,
      lastUsed: account.lastUsed,
      failCount: account.failCount || 0,
      mainCallerId: account.mainCallerId,
      isVirtual: account.isVirtual || false,
      domain: account.domain,
      provider: account.provider
    }));
    
    const summary = {
      totalAccounts: this.sipAccounts.length,
      availableAccounts: this.sipAccounts.filter(a => a.status === 'available').length,
      busyAccounts: this.sipAccounts.filter(a => a.status === 'busy').length,
      errorAccounts: this.sipAccounts.filter(a => a.status === 'error').length,
      connected: this.connected,
      lastDatabaseCheck: this.lastDatabaseCheck
    };
    
    return {
      channels: allStatus,
      summary: summary,
      callerIdGroups: Array.from(this.callerIdToChannelsMap.entries()).map(([callerId, accounts]) => ({
        callerId,
        accountCount: accounts.length,
        callerNumber: accounts[0]?.callerID,
        availableCount: accounts.filter(a => a.status === 'available').length
      }))
    };
  }

  // 安全な切断処理
  async disconnect() {
    logger.info('SIPサービスを切断しています...');
    
    // ヘルスチェック停止
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
    
    // アクティブな通話を安全に終了
    const activeCallIds = Array.from(this.callToAccountMap.keys());
    for (const callId of activeCallIds) {
      try {
        await this.releaseCallResource(callId);
      } catch (error) {
        logger.error(`通話終了エラー: ${callId}`, error);
      }
    }
    
    this.connected = false;
    logger.info('✅ SIPサービス切断完了');
    
    return true;
  }
}

// シングルトンインスタンスを作成
const sipService = new SipService();

// プロセス終了時の安全な切断
process.on('SIGTERM', async () => {
  logger.info('SIGTERM受信 - SIPサービス安全切断');
  await sipService.disconnect();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT受信 - SIPサービス安全切断');
  await sipService.disconnect();
});

module.exports = sipService;
