// backend/src/services/autoDialer.js - 新規作成
const logger = require('./logger');
const db = require('./database');
const callService = require('./callService');
const audioService = require('./audioService');

class AutoDialer {
  constructor() {
    this.activeCampaigns = new Map();
    this.campaignIntervals = new Map();
    this.maxConcurrentCalls = 5;
    this.dialInterval = 10000; // 10秒間隔
  }

  // キャンペーンを開始
  async startCampaign(campaignId) {
    try {
      logger.info(`🚀 自動発信キャンペーン開始: Campaign=${campaignId}`);
      
      // キャンペーン情報を取得
      const [campaigns] = await db.query(
        'SELECT * FROM campaigns WHERE id = ? AND status = "active"',
        [campaignId]
      );
      
      if (campaigns.length === 0) {
        throw new Error('アクティブなキャンペーンが見つかりません');
      }
      
      const campaign = campaigns[0];
      
      // 発信対象の連絡先を取得
      const [contacts] = await db.query(
        'SELECT * FROM contacts WHERE campaign_id = ? AND status = "pending" ORDER BY created_at ASC',
        [campaignId]
      );
      
      if (contacts.length === 0) {
        logger.warn(`キャンペーン ${campaignId} に発信対象の連絡先がありません`);
        return false;
      }
      
      // 発信者番号を取得
      const [callerIds] = await db.query(
        'SELECT * FROM caller_ids WHERE id = ? AND active = true',
        [campaign.caller_id_id]
      );
      
      if (callerIds.length === 0) {
        throw new Error('有効な発信者番号が設定されていません');
      }
      
      const callerIdData = callerIds[0];
      
      // 音声ファイルを取得
      let campaignAudio = [];
      try {
        campaignAudio = await audioService.getCampaignAudio(campaignId);
        logger.info(`キャンペーン ${campaignId} の音声ファイル: ${campaignAudio.length}件`);
      } catch (audioError) {
        logger.warn('音声ファイル取得エラー（続行）:', audioError.message);
      }
      
      // キャンペーンデータを保存
      this.activeCampaigns.set(campaignId, {
        campaign,
        contacts,
        callerIdData,
        campaignAudio,
        currentContactIndex: 0,
        activeCalls: 0,
        maxConcurrentCalls: campaign.max_concurrent_calls || this.maxConcurrentCalls
      });
      
      // 定期実行を開始
      const intervalId = setInterval(() => {
        this.processCampaignCalls(campaignId);
      }, this.dialInterval);
      
      this.campaignIntervals.set(campaignId, intervalId);
      
      logger.info(`✅ キャンペーン ${campaignId} の自動発信を開始しました`);
      
      // 即座に最初の発信を実行
      this.processCampaignCalls(campaignId);
      
      return true;
    } catch (error) {
      logger.error(`キャンペーン開始エラー: Campaign=${campaignId}`, error);
      throw error;
    }
  }

  // キャンペーンを停止
  stopCampaign(campaignId) {
    try {
      logger.info(`🛑 自動発信キャンペーン停止: Campaign=${campaignId}`);
      
      // 定期実行を停止
      if (this.campaignIntervals.has(campaignId)) {
        clearInterval(this.campaignIntervals.get(campaignId));
        this.campaignIntervals.delete(campaignId);
      }
      
      // アクティブキャンペーンから削除
      this.activeCampaigns.delete(campaignId);
      
      logger.info(`✅ キャンペーン ${campaignId} の自動発信を停止しました`);
      return true;
    } catch (error) {
      logger.error(`キャンペーン停止エラー: Campaign=${campaignId}`, error);
      return false;
    }
  }

  // キャンペーンの発信処理
  async processCampaignCalls(campaignId) {
    try {
      const campaignData = this.activeCampaigns.get(campaignId);
      
      if (!campaignData) {
        logger.warn(`キャンペーンデータが見つかりません: ${campaignId}`);
        return;
      }
      
      const { campaign, contacts, callerIdData, campaignAudio, maxConcurrentCalls } = campaignData;
      
      // 現在のアクティブコール数をチェック
      if (campaignData.activeCalls >= maxConcurrentCalls) {
        logger.debug(`キャンペーン ${campaignId}: 同時発信数上限に達しています (${campaignData.activeCalls}/${maxConcurrentCalls})`);
        return;
      }
      
      // 発信対象の連絡先を取得
      const pendingContacts = contacts.filter(contact => contact.status === 'pending');
      
      if (pendingContacts.length === 0) {
        logger.info(`キャンペーン ${campaignId}: 発信対象の連絡先がありません。完了処理を実行します。`);
        await this.completeCampaign(campaignId);
        return;
      }
      
      // 営業時間チェック
      if (!this.isWithinWorkingHours(campaign)) {
        logger.debug(`キャンペーン ${campaignId}: 営業時間外のため発信をスキップ`);
        return;
      }
      
      // 発信可能な数を計算
      const availableSlots = maxConcurrentCalls - campaignData.activeCalls;
      const contactsToCall = pendingContacts.slice(0, availableSlots);
      
      // 各連絡先に発信
      for (const contact of contactsToCall) {
        try {
          await this.makeCall(campaignId, contact, callerIdData, campaignAudio);
          
          // 連絡先のステータスを更新
          await db.query(
            'UPDATE contacts SET status = "called", last_attempt = NOW(), attempt_count = attempt_count + 1 WHERE id = ?',
            [contact.id]
          );
          
          // アクティブコール数を増加
          campaignData.activeCalls++;
          
          logger.info(`📞 発信実行: Campaign=${campaignId}, Contact=${contact.id}, Phone=${contact.phone}`);
          
        } catch (callError) {
          logger.error(`発信エラー: Campaign=${campaignId}, Contact=${contact.id}`, callError);
          
          // 連絡先のステータスを失敗に更新
          await db.query(
            'UPDATE contacts SET status = "failed", last_attempt = NOW(), attempt_count = attempt_count + 1 WHERE id = ?',
            [contact.id]
          );
        }
      }
      
      // 進捗率を更新
      await this.updateCampaignProgress(campaignId);
      
    } catch (error) {
      logger.error(`キャンペーン処理エラー: Campaign=${campaignId}`, error);
    }
  }

  // 実際の発信を実行
  async makeCall(campaignId, contact, callerIdData, campaignAudio) {
    try {
      const callParams = {
        phoneNumber: contact.phone,
        callerID: `"${callerIdData.description || 'Auto Dialer'}" <${callerIdData.number}>`,
        context: 'autodialer',
        exten: 's',
        priority: 1,
        variables: {
          CAMPAIGN_ID: campaignId,
          CONTACT_ID: contact.id,
          CONTACT_NAME: contact.name || 'Unknown',
          COMPANY: contact.company || '',
          PHONE_NUMBER: contact.phone
        },
        callerIdData,
        mockMode: false,
        provider: 'sip',
        campaignAudio
      };
      
      // 🚀 切断防止版sipcmdで発信
      const { spawn } = require('child_process');
      const sipService = require('./sipService');
      
      // 利用可能なSIPアカウントを取得
      const sipAccount = await sipService.getAvailableSipAccount();
      if (!sipAccount) {
        throw new Error('利用可能なSIPアカウントが見つかりません');
      }
      
      // 音声ファイルパスを決定
      let audioPath = '';
      if (campaignAudio && campaignAudio.length > 0) {
        const welcomeAudio = campaignAudio.find(audio => audio.audio_type === 'welcome');
        if (welcomeAudio) {
          audioPath = welcomeAudio.path || `/var/www/autodialer/backend/audio-files/${welcomeAudio.filename}`;
        }
      }
      
      const callId = `campaign-${campaignId}-${contact.id}-${Date.now()}`;
      
      // 切断防止版sipcmdで発信
      const sipcmdArgs = [
        sipAccount.username,
        sipAccount.password,
        sipAccount.domain || 'ito258258.site',
        contact.phone,
        audioPath
      ];
      
      logger.info(`🚀 キャンペーン発信: Campaign=${campaignId}, Contact=${contact.phone}`);
      
      const sipcmdProcess = spawn('/usr/local/bin/sipcmd-no-hangup', sipcmdArgs);
      
      // プロセス出力を監視
      sipcmdProcess.stdout.on('data', (data) => {
        logger.debug(`sipcmd出力[${callId}]: ${data.toString()}`);
        
        // 通話確立の検出
        if (data.toString().includes('通話確立') || data.toString().includes('音声接続成功')) {
          logger.info(`✅ 通話確立: Campaign=${campaignId}, Contact=${contact.phone}`);
        }
      });
      
      sipcmdProcess.stderr.on('data', (data) => {
        logger.warn(`sipcmdエラー[${callId}]: ${data.toString()}`);
      });
      
      sipcmdProcess.on('close', async (code) => {
        logger.info(`通話終了: Campaign=${campaignId}, Contact=${contact.phone}, Code=${code}`);
        
        // アクティブコール数を減少
        const campaignData = this.activeCampaigns.get(campaignId);
        if (campaignData) {
          campaignData.activeCalls = Math.max(0, campaignData.activeCalls - 1);
        }
        
        // 通話結果によって連絡先ステータスを更新
        let finalStatus = 'completed';
        if (code !== 0) {
          finalStatus = code === 1 ? 'failed' : 'completed';
        }
        
        try {
          await db.query(
            'UPDATE contacts SET status = ? WHERE id = ?',
            [finalStatus, contact.id]
          );
        } catch (updateError) {
          logger.error('連絡先ステータス更新エラー:', updateError);
        }
      });
      
      // 通話ログに記録
      try {
        await db.query(`
          INSERT INTO call_logs 
          (call_id, campaign_id, contact_id, caller_id_id, phone_number, start_time, status, test_call, call_provider, has_audio, audio_file_count)
          VALUES (?, ?, ?, ?, ?, NOW(), 'ORIGINATING', 0, 'sip', ?, ?)
        `, [
          callId,
          campaignId,
          contact.id,
          callerIdData.id,
          contact.phone,
          campaignAudio.length > 0 ? 1 : 0,
          campaignAudio.length
        ]);
      } catch (logError) {
        logger.error('通話ログ記録エラー:', logError);
      }
      
      return {
        ActionID: callId,
        Response: 'Success',
        Message: 'Campaign call initiated',
        provider: 'sip'
      };
      
    } catch (error) {
      logger.error(`個別発信エラー: Campaign=${campaignId}, Contact=${contact.id}`, error);
      throw error;
    }
  }

  // 営業時間内かチェック
  isWithinWorkingHours(campaign) {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS format
    
    const workingStart = campaign.working_hours_start || '09:00:00';
    const workingEnd = campaign.working_hours_end || '18:00:00';
    
    return currentTime >= workingStart && currentTime <= workingEnd;
  }

  // キャンペーンの進捗率を更新
  async updateCampaignProgress(campaignId) {
    try {
      const [stats] = await db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('completed', 'failed', 'dnc') THEN 1 ELSE 0 END) as processed
        FROM contacts 
        WHERE campaign_id = ?
      `, [campaignId]);
      
      if (stats.length > 0) {
        const { total, processed } = stats[0];
        const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
        
        await db.query(
          'UPDATE campaigns SET progress = ?, updated_at = NOW() WHERE id = ?',
          [progress, campaignId]
        );
        
        logger.debug(`キャンペーン進捗更新: Campaign=${campaignId}, Progress=${progress}%`);
      }
    } catch (error) {
      logger.error(`進捗更新エラー: Campaign=${campaignId}`, error);
    }
  }

  // キャンペーンを完了
  async completeCampaign(campaignId) {
    try {
      logger.info(`🏁 キャンペーン完了処理: Campaign=${campaignId}`);
      
      // キャンペーンステータスを完了に更新
      await db.query(
        'UPDATE campaigns SET status = "completed", progress = 100, updated_at = NOW() WHERE id = ?',
        [campaignId]
      );
      
      // 自動発信を停止
      this.stopCampaign(campaignId);
      
      logger.info(`✅ キャンペーン完了: Campaign=${campaignId}`);
      
    } catch (error) {
      logger.error(`キャンペーン完了処理エラー: Campaign=${campaignId}`, error);
    }
  }

  // アクティブなキャンペーン一覧を取得
  getActiveCampaigns() {
    const campaigns = [];
    
    this.activeCampaigns.forEach((data, campaignId) => {
      campaigns.push({
        campaignId: parseInt(campaignId),
        campaignName: data.campaign.name,
        activeCalls: data.activeCalls,
        maxConcurrentCalls: data.maxConcurrentCalls,
        totalContacts: data.contacts.length,
        pendingContacts: data.contacts.filter(c => c.status === 'pending').length
      });
    });
    
    return campaigns;
  }

  // システム全体の統計を取得
  getSystemStats() {
    let totalActiveCalls = 0;
    let totalCampaigns = this.activeCampaigns.size;
    
    this.activeCampaigns.forEach((data) => {
      totalActiveCalls += data.activeCalls;
    });
    
    return {
      totalActiveCampaigns: totalCampaigns,
      totalActiveCalls: totalActiveCalls,
      maxSystemConcurrency: totalCampaigns * this.maxConcurrentCalls
    };
  }

  // 全キャンペーンを停止
  stopAllCampaigns() {
    logger.info('🛑 全キャンペーン停止処理開始');
    
    const campaignIds = Array.from(this.activeCampaigns.keys());
    
    campaignIds.forEach(campaignId => {
      this.stopCampaign(campaignId);
    });
    
    logger.info(`✅ ${campaignIds.length}個のキャンペーンを停止しました`);
  }

  // 定期的なヘルスチェック
  startHealthCheck() {
    setInterval(() => {
      this.performHealthCheck();
    }, 60000); // 1分ごと
  }

  async performHealthCheck() {
    try {
      // データベースとキャンペーンデータの同期チェック
      for (const [campaignId, data] of this.activeCampaigns.entries()) {
        const [campaigns] = await db.query(
          'SELECT status FROM campaigns WHERE id = ?',
          [campaignId]
        );
        
        if (campaigns.length === 0 || campaigns[0].status !== 'active') {
          logger.warn(`非アクティブキャンペーンを停止: ${campaignId}`);
          this.stopCampaign(campaignId);
        }
      }
      
      // システム統計をログ出力
      const stats = this.getSystemStats();
      logger.debug(`システム統計: アクティブキャンペーン=${stats.totalActiveCampaigns}, アクティブコール=${stats.totalActiveCalls}`);
      
    } catch (error) {
      logger.error('ヘルスチェックエラー:', error);
    }
  }

  // サービス初期化
  async initialize() {
    logger.info('🚀 自動発信サービスを初期化中...');
    
    try {
      // アクティブなキャンペーンを復元
      const [campaigns] = await db.query(
        'SELECT id FROM campaigns WHERE status = "active"'
      );
      
      for (const campaign of campaigns) {
        logger.info(`アクティブキャンペーンを復元: ${campaign.id}`);
        try {
          await this.startCampaign(campaign.id);
        } catch (restoreError) {
          logger.error(`キャンペーン復元エラー: ${campaign.id}`, restoreError);
        }
      }
      
      // ヘルスチェック開始
      this.startHealthCheck();
      
      logger.info('✅ 自動発信サービス初期化完了');
      
    } catch (error) {
      logger.error('自動発信サービス初期化エラー:', error);
      throw error;
    }
  }

  // サービス終了
  async shutdown() {
    logger.info('🛑 自動発信サービス終了処理...');
    
    this.stopAllCampaigns();
    
    logger.info('✅ 自動発信サービス終了完了');
  }
}

// シングルトンインスタンスを作成
const autoDialer = new AutoDialer();

// プロセス終了時のクリーンアップ
process.on('SIGINT', async () => {
  await autoDialer.shutdown();
});

process.on('SIGTERM', async () => {
  await autoDialer.shutdown();
});

module.exports = autoDialer;
