const db = require('./database');
const asterisk = require('./asterisk');
const logger = require('./logger');

class DialerService {
  constructor() {
    this.activeCampaigns = new Map(); // キャンペーンIDごとの発信状態を管理
    this.activeCalls = new Map(); // 進行中の通話を管理
    this.initialized = false;
  }

// initialize メソッドの改善
async initialize() {
  if (this.initialized) {
    logger.info('発信サービスは既に初期化されています');
    return;
  }
  
  try {
    logger.info('発信サービスの初期化を開始します');
    
    // SIPサービスとAsteriskサービスの初期化
    try {
      // SIPサービスの初期化
      const sipService = require('./sipService');
      await sipService.connect();
      logger.info('SIPサービスの初期化が完了しました');
      
      // Asteriskサービスの初期化
      await asterisk.connect();
      logger.info('Asteriskサービスの初期化が完了しました');
    } catch (serviceError) {
      logger.error('通話サービス初期化エラー:', serviceError);
      // エラーをスローせず続行する
    }
    
    // アクティブなキャンペーンの復元
    try {
      logger.info('アクティブなキャンペーンを復元中...');
      const [activeCampaigns] = await db.query(`
        SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id, 
               ci.number as caller_id_number
        FROM campaigns c
        JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.status = 'active' AND ci.active = true
      `);
      
      logger.info(`${activeCampaigns.length}件のアクティブキャンペーンを読み込みました`);
      
      for (const campaign of activeCampaigns) {
        this.activeCampaigns.set(campaign.id, {
          id: campaign.id,
          name: campaign.name,
          maxConcurrentCalls: campaign.max_concurrent_calls || 5,
          callerIdId: campaign.caller_id_id,
          callerIdNumber: campaign.caller_id_number,
          activeCalls: 0,
          status: 'active',
          lastDialTime: null
        });
        logger.info(`キャンペーンを読み込みました: ID=${campaign.id}, Name=${campaign.name}`);
      }
    } catch (dbError) {
      logger.error('キャンペーン読み込みエラー:', dbError);
      // エラーをスローせず続行する
    }
    
    // 定期的な発信ジョブを開始
    logger.info('発信ジョブを開始します');
    this.startDialerJob();
    
    this.initialized = true;
    logger.info('発信サービスの初期化が完了しました');
  } catch (error) {
    logger.error('発信サービスの初期化エラー:', error);
    throw error; // 重大なエラーは再スロー
  }
}

  async startCampaign(campaignId) {
    try {
      // キャンペーン情報を取得
      const [campaigns] = await db.query(`
        SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id, 
               ci.number as caller_id_number
        FROM campaigns c
        JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.id = ? AND ci.active = true
      `, [campaignId]);
      
      if (campaigns.length === 0) {
        throw new Error('キャンペーンが見つからないか、発信者番号が無効です');
      }
      
      const campaign = campaigns[0];
      
      // キャンペーンのステータスを更新
      await db.query(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['active', campaignId]
      );
      
      // アクティブキャンペーンリストに追加
      this.activeCampaigns.set(campaignId, {
        id: campaign.id,
        name: campaign.name,
        maxConcurrentCalls: campaign.max_concurrent_calls,
        callerIdId: campaign.caller_id_id,
        callerIdNumber: campaign.caller_id_number,
        activeCalls: 0,
        status: 'active',
        lastDialTime: null
      });
      
      logger.info(`キャンペーン開始: ID=${campaignId}, Name=${campaign.name}`);
      
      // ここが重要な追加部分：発信処理を即時に開始
      await this.processDialerQueue();
      
      return true;
    } catch (error) {
      logger.error(`キャンペーン開始エラー: ID=${campaignId}`, error);
      return false;
    }
  }

  // キャンペーンの一時停止
  async pauseCampaign(campaignId) {
    try {
      // キャンペーンのステータスを更新
      await db.query(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['paused', campaignId]
      );
      
      // アクティブキャンペーンリストから削除または一時停止
      if (this.activeCampaigns.has(campaignId)) {
        const campaign = this.activeCampaigns.get(campaignId);
        campaign.status = 'paused';
        this.activeCampaigns.set(campaignId, campaign);
      }
      
      logger.info(`キャンペーン一時停止: ID=${campaignId}`);
      return true;
    } catch (error) {
      logger.error(`キャンペーン一時停止エラー: ID=${campaignId}`, error);
      return false;
    }
  }

  // キャンペーンの再開
  async resumeCampaign(campaignId) {
    try {
      // キャンペーンのステータスを更新
      await db.query(
        'UPDATE campaigns SET status = ? WHERE id = ?',
        ['active', campaignId]
      );
      
      // アクティブキャンペーンリストでステータスを更新
      if (this.activeCampaigns.has(campaignId)) {
        const campaign = this.activeCampaigns.get(campaignId);
        campaign.status = 'active';
        this.activeCampaigns.set(campaignId, campaign);
      } else {
        // 存在しない場合は新規追加
        await this.startCampaign(campaignId);
      }
      
      logger.info(`キャンペーン再開: ID=${campaignId}`);
      return true;
    } catch (error) {
      logger.error(`キャンペーン再開エラー: ID=${campaignId}`, error);
      return false;
    }
  }

  // 発信ジョブの開始
  startDialerJob() {
    // 3秒ごとに発信処理を実行
    setInterval(() => this.processDialerQueue(), 3000);
    logger.info('発信ジョブを開始しました');
  }

  // 以下の修正をdialerService.jsに追加します

// 発信キューの処理
async processDialerQueue() {
  try {
    // デバッグ情報の追加
    logger.info('発信キュー処理を開始します');
    
    // 現在の時間帯をチェック（発信可能時間内かどうか）
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    
    // アクティブキャンペーン数の確認
    logger.info(`アクティブキャンペーン数: ${this.activeCampaigns.size}`);
    if (this.activeCampaigns.size === 0) {
      logger.warn('アクティブなキャンペーンがありません');
      return;
    }
    
    // 各アクティブキャンペーンを処理
    for (const [campaignId, campaign] of this.activeCampaigns.entries()) {
      logger.info(`キャンペーン ${campaignId} を処理中, ステータス: ${campaign.status}`);
      
      if (campaign.status !== 'active') {
        logger.warn(`キャンペーン ${campaignId} はアクティブではありません (${campaign.status})`);
        continue;
      }
      
      // キャンペーン情報の最新化
      const [campaigns] = await db.query(`
        SELECT c.working_hours_start, c.working_hours_end, c.status
        FROM campaigns c
        WHERE c.id = ?
      `, [campaignId]);
      
      if (campaigns.length === 0 || campaigns[0].status !== 'active') {
        logger.warn(`キャンペーン ${campaignId} がDBで見つからないか非アクティブです`);
        this.activeCampaigns.delete(campaignId);
        continue;
      }
      
      // 発信時間のチェック
      let workingHoursStart = campaigns[0].working_hours_start?.split(':') || ['9', '00'];
      let workingHoursEnd = campaigns[0].working_hours_end?.split(':') || ['18', '00'];
      
      // 時間が正しくフォーマットされていることを確認
      if (!workingHoursStart || workingHoursStart.length !== 2 || !workingHoursEnd || workingHoursEnd.length !== 2) {
        logger.warn(`キャンペーン ${campaignId} の発信時間設定が不正です: 開始=${campaigns[0].working_hours_start}, 終了=${campaigns[0].working_hours_end}`);
        // デフォルト値を設定
        workingHoursStart = ['9', '00'];
        workingHoursEnd = ['18', '00'];
      }
      
      const startTime = parseInt(workingHoursStart[0]) * 60 + parseInt(workingHoursStart[1]);
      const endTime = parseInt(workingHoursEnd[0]) * 60 + parseInt(workingHoursEnd[1]);
      
      logger.info(`キャンペーン ${campaignId} 発信時間: ${workingHoursStart[0]}:${workingHoursStart[1]}-${workingHoursEnd[0]}:${workingHoursEnd[1]}, 現在時刻: ${currentHour}:${currentMinute}`);
      
      if (currentTime < startTime || currentTime > endTime) {
        logger.warn(`キャンペーン ${campaignId} は発信時間外です: ${currentHour}:${currentMinute}`);
        continue;
      }
      
      // 最大同時発信数をチェック
      const availableSlots = campaign.maxConcurrentCalls - campaign.activeCalls;
      logger.info(`キャンペーン ${campaignId} の利用可能スロット: ${availableSlots} (最大:${campaign.maxConcurrentCalls}, 現在:${campaign.activeCalls})`);
      
      if (availableSlots <= 0) {
        logger.warn(`キャンペーン ${campaignId} は最大同時発信数に達しています: ${campaign.activeCalls}/${campaign.maxConcurrentCalls}`);
        continue;
      }
      
      // 発信する連絡先を取得
      const availableSlotsInt = parseInt(availableSlots, 10); // 整数に変換して確実に数値型にする
      const [contacts] = await db.query(`
      SELECT id, phone, name, company
      FROM contacts
      WHERE campaign_id = ? AND status = 'pending'
      LIMIT ?
    `, [campaignId, availableSlotsInt]);
      
      logger.info(`キャンペーン ${campaignId} の発信待ち連絡先: ${contacts.length}件`);
      
      if (contacts.length === 0) {
        logger.warn(`キャンペーン ${campaignId} には発信待ちの連絡先がありません`);
        continue;
      }
      
      // 各連絡先に発信
      for (const contact of contacts) {
        logger.info(`連絡先に発信を試行: ID=${contact.id}, 電話番号=${contact.phone}`);
        const result = await this.dialContact(campaign, contact);
        logger.info(`発信結果: ${result ? '成功' : '失敗'}`);
      }
    }
    
    logger.info('発信キュー処理を完了しました');
  } catch (error) {
    logger.error('発信キュー処理エラー:', error);
  }
}

// 連絡先への発信
async dialContact(campaign, contact) {
  try {
    logger.info(`発信処理開始: Campaign=${campaign.id}, Contact=${contact.id}, Phone=${contact.phone}`);
    
    // 電話番号の検証
    if (!contact.phone || contact.phone.length < 8) {
      logger.error(`不正な電話番号: ${contact.phone}`);
      await db.query(
        'UPDATE contacts SET status = ? WHERE id = ?',
        ['invalid', contact.id]
      );
      return false;
    }
    
    // 発信中ステータスに更新
    await db.query(
      'UPDATE contacts SET status = ? WHERE id = ?',
      ['called', contact.id]
    );
    
    // 発信パラメータの準備
    const params = {
      phoneNumber: contact.phone,
      context: 'autodialer',
      exten: 's',
      priority: 1,
      callerID: `"${campaign.name}" <${campaign.callerIdNumber}>`,
      callerIdData: { id: campaign.callerIdId }, // 発信者番号データを追加
      variables: {
        CAMPAIGN_ID: campaign.id,
        CONTACT_ID: contact.id,
        CONTACT_NAME: contact.name || '',
        COMPANY: contact.company || ''
      }
    };
    
    // デバッグ用に発信パラメータをログ出力
    logger.info(`発信パラメータ: ${JSON.stringify(params)}`);
    
    try {
      // 発信サービスの選択（asteriskからcallServiceに変更）
      const callService = require('./callService');
      
      // 発信実行
      const result = await callService.originate(params);
      logger.info(`発信結果: ${JSON.stringify(result)}`);
      
      // アクティブコール数を更新
      campaign.activeCalls++;
      campaign.lastDialTime = new Date();
      this.activeCampaigns.set(campaign.id, campaign);
      
      // 通話ログを記録
      const [logResult] = await db.query(`
        INSERT INTO call_logs 
        (contact_id, campaign_id, caller_id_id, call_id, start_time, status, call_provider)
        VALUES (?, ?, ?, ?, NOW(), 'active', ?)
      `, [contact.id, campaign.id, campaign.callerIdId, result.ActionID, result.provider || 'unknown']);
      
      const callId = result.ActionID;
      this.activeCalls.set(callId, {
        id: callId,
        contactId: contact.id,
        campaignId: campaign.id,
        startTime: new Date(),
        status: 'active'
      });
      
      logger.info(`発信成功: Campaign=${campaign.id}, Contact=${contact.id}, Number=${contact.phone}, CallID=${callId}`);
      return true;
    } catch (originateError) {
      logger.error(`発信実行エラー: ${originateError.message}`);
      
      // SIPエラーの場合は特に詳細をログ
      if (originateError.message.includes('SIP') || originateError.message.includes('sip') || 
          originateError.message.includes('channel') || originateError.message.includes('アカウント')) {
        logger.error(`SIP関連エラー詳細: ${originateError.stack}`);
      }
      
      throw originateError; // 再スロー
    }
    
  } catch (error) {
    logger.error(`発信エラー: Campaign=${campaign.id}, Contact=${contact.id}, Error=${error.message}`);
    
    // エラー状態に更新
    await db.query(
      'UPDATE contacts SET status = ? WHERE id = ?',
      ['failed', contact.id]
    );
    
    return false;
  }
}
  // 通話の終了処理
  async handleCallEnd(callId, duration, disposition, keypress) {
    try {
      if (!this.activeCalls.has(callId)) {
        logger.warn(`未知の通話ID: ${callId}`);
        return false;
      }
      
      const call = this.activeCalls.get(callId);
      
      // 通話ログの更新
      await db.query(`
        UPDATE call_logs
        SET end_time = NOW(), duration = ?, status = ?, keypress = ?
        WHERE call_id = ?
      `, [duration, disposition, keypress, callId]);
      
      // 連絡先の状態を更新
      let contactStatus = 'completed';
      if (keypress === '9') {
        contactStatus = 'dnc';
        
        // DNCリストに追加
        const [contact] = await db.query(
          'SELECT phone FROM contacts WHERE id = ?',
          [call.contactId]
        );
        
        if (contact && contact.length > 0) {
          await db.query(
            'INSERT IGNORE INTO dnc_list (phone, reason) VALUES (?, ?)',
            [contact[0].phone, 'ユーザーリクエスト']
          );
        }
      }
      
      await db.query(
        'UPDATE contacts SET status = ? WHERE id = ?',
        [contactStatus, call.contactId]
      );
      
      // キャンペーンの同時通話数を減らす
      if (this.activeCampaigns.has(call.campaignId)) {
        const campaign = this.activeCampaigns.get(call.campaignId);
        campaign.activeCalls = Math.max(0, campaign.activeCalls - 1);
        this.activeCampaigns.set(call.campaignId, campaign);
      }
      
      // アクティブコールリストから削除
      this.activeCalls.delete(callId);
      
      logger.info(`通話終了: CallID=${callId}, Duration=${duration}, Disposition=${disposition}, Keypress=${keypress}`);
      return true;
    } catch (error) {
      logger.error(`通話終了処理エラー: CallID=${callId}`, error);
      return false;
    }
  }

  // キャンペーンのステータスを確認
  async checkCampaignCompletion(campaignId) {
    try {
      // 処理待ちの連絡先数を確認
      const [pendingCount] = await db.query(`
        SELECT COUNT(*) as count
        FROM contacts
        WHERE campaign_id = ? AND status IN ('pending', 'called')
      `, [campaignId]);
      
      if (pendingCount[0].count === 0) {
        // すべての連絡先が処理済み
        await db.query(
          'UPDATE campaigns SET status = ? WHERE id = ?',
          ['completed', campaignId]
        );
        
        // アクティブキャンペーンリストから削除
        this.activeCampaigns.delete(campaignId);
        
        logger.info(`キャンペーン完了: ID=${campaignId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`キャンペーン完了チェックエラー: ID=${campaignId}`, error);
      return false;
    }
  }
  // オペレーターへの通話転送
async transferToOperator(callId, skills = []) {
  try {
    // 利用可能なオペレーターを検索
    const [availableOperators] = await db.query(`
      SELECT o.*, u.name
      FROM operators o
      JOIN users u ON o.user_id = u.id
      WHERE o.status = 'available'
      ${skills.length > 0 ? 'AND JSON_CONTAINS(o.skills, ?)' : ''}
      ORDER BY o.priority DESC
      LIMIT 1
    `, skills.length > 0 ? [JSON.stringify(skills)] : []);
    
    if (availableOperators.length === 0) {
      logger.warn('利用可能なオペレーターがいません');
      return false;
    }
    
    const operator = availableOperators[0];
    
    // オペレーターのステータスを更新
    await db.query(
      'UPDATE operators SET status = "busy", current_call_id = ? WHERE id = ?',
      [callId, operator.id]
    );
    
    // 通話を転送
    // Asterisk APIを使用して転送を実行
    await asterisk.transfer(callId, operator.extension);
    
    // オペレーター通話ログを作成
    await db.query(
      'INSERT INTO operator_call_logs (operator_id, call_log_id, start_time) VALUES (?, ?, NOW())',
      [operator.id, callId]
    );
    
    return true;
  } catch (error) {
    logger.error('オペレーター転送エラー:', error);
    return false;
  }
}

// 発信速度調整機能を追加
async setMaxConcurrentCalls(maxCalls, campaignId = null) {
  try {
    if (campaignId) {
      // 特定のキャンペーンの発信数を設定
      if (this.activeCampaigns.has(campaignId)) {
        const campaign = this.activeCampaigns.get(campaignId);
        const oldValue = campaign.maxConcurrentCalls;
        campaign.maxConcurrentCalls = maxCalls;
        this.activeCampaigns.set(campaignId, campaign);
        
        // DBにも反映
        await db.query(
          'UPDATE campaigns SET max_concurrent_calls = ? WHERE id = ?',
          [maxCalls, campaignId]
        );
        
        logger.info(`キャンペーン ${campaignId} の最大同時発信数を ${oldValue} から ${maxCalls} に変更しました`);
      }
    } else {
      // 全キャンペーンの発信数を調整
      let count = 0;
      
      for (const [id, campaign] of this.activeCampaigns.entries()) {
        const oldValue = campaign.maxConcurrentCalls;
        campaign.maxConcurrentCalls = maxCalls;
        this.activeCampaigns.set(id, campaign);
        
        // DBにも反映
        await db.query(
          'UPDATE campaigns SET max_concurrent_calls = ? WHERE id = ?',
          [maxCalls, id]
        );
        
        count++;
        logger.info(`キャンペーン ${id} の最大同時発信数を ${oldValue} から ${maxCalls} に変更しました`);
      }
      
      logger.info(`${count}個のキャンペーンの最大同時発信数を ${maxCalls} に設定しました`);
    }
    
    return true;
  } catch (error) {
    logger.error(`最大同時発信数設定エラー: ${error.message}`);
    return false;
  }
}

// 発信処理にオペレーター転送率の考慮を追加
async processDialerQueue() {
  try {
    // 現在の時間帯をチェック（発信可能時間内かどうか）
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    
    // キューサービスからオペレーター状況を取得
    const callQueueService = require('./callQueueService');
    
    // 各アクティブキャンペーンを処理
    for (const [campaignId, campaign] of this.activeCampaigns.entries()) {
      if (campaign.status !== 'active') continue;
      
      // キャンペーン情報の最新化
      const [campaigns] = await db.query(`
        SELECT c.working_hours_start, c.working_hours_end, c.status
        FROM campaigns c
        WHERE c.id = ?
      `, [campaignId]);
      
      if (campaigns.length === 0 || campaigns[0].status !== 'active') {
        // キャンペーンが存在しないか、アクティブでなくなった場合
        this.activeCampaigns.delete(campaignId);
        continue;
      }
      
      // 発信時間のチェック
      const workingHoursStart = campaigns[0].working_hours_start.split(':');
      const workingHoursEnd = campaigns[0].working_hours_end.split(':');
      const startTime = parseInt(workingHoursStart[0]) * 60 + parseInt(workingHoursStart[1]);
      const endTime = parseInt(workingHoursEnd[0]) * 60 + parseInt(workingHoursEnd[1]);
      
      if (currentTime < startTime || currentTime > endTime) {
        logger.debug(`キャンペーン ${campaignId} は発信時間外です: ${currentHour}:${currentMinute}`);
        continue;
      }
      
      // オペレーター転送の状況を考慮
      // キューのキャパシティに基づいて発信数を調整
      let availableSlots = campaign.maxConcurrentCalls - campaign.activeCalls;
      
      // オペレーターキューの状態を考慮
      const queueStatus = await callQueueService.getQueueStatus();
      if (queueStatus) {
        // キャパシティに余裕がないか、オペレーターがいない場合は調整
        if (queueStatus.currentSize >= queueStatus.maxSize * 0.8 || queueStatus.activeOperators === 0) {
          // キューがほぼ満杯、またはオペレーターがいない場合は発信数を制限
          availableSlots = Math.min(availableSlots, 1);
          logger.info(`オペレーターキューの状態により発信数を制限: キャンペーン=${campaignId}, 利用可能スロット=${availableSlots}`);
        }
      }
      
      if (availableSlots <= 0) {
        logger.debug(`キャンペーン ${campaignId} は最大同時発信数に達しています: ${campaign.activeCalls}/${campaign.maxConcurrentCalls}`);
        continue;
      }
      
      // 発信する連絡先を取得
      const [contacts] = await db.query(`
        SELECT id, phone, name, company
        FROM contacts
        WHERE campaign_id = ? AND status = 'pending'
        LIMIT ?
      `, [campaignId, availableSlots]);
      
      if (contacts.length === 0) {
        logger.debug(`キャンペーン ${campaignId} には発信待ちの連絡先がありません`);
        continue;
      }
      
      // 各連絡先に発信
      for (const contact of contacts) {
        await this.dialContact(campaign, contact);
      }
    }
  } catch (error) {
    logger.error('発信キュー処理エラー:', error);
  }
}

// キャンペーンの進捗状況を更新
async updateCampaignProgress(campaignId) {
  try {
    // 全連絡先数
    const [totalResult] = await db.query(
      'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ?',
      [campaignId]
    );
    
    // 完了した連絡先数
    const [completedResult] = await db.query(
      'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status IN ("completed", "dnc")',
      [campaignId]
    );
    
    const total = totalResult[0].count;
    const completed = completedResult[0].count;
    
    // 進捗率を計算
    const progress = total > 0 ? Math.floor((completed / total) * 100) : 0;
    
    // キャンペーン情報を更新
    await db.query(
      'UPDATE campaigns SET progress = ? WHERE id = ?',
      [progress, campaignId]
    );
    
    // キャンペーンが完了したかチェック
    if (total > 0 && completed >= total) {
      await this.completeCampaign(campaignId);
    }
    
    return progress;
  } catch (error) {
    logger.error(`キャンペーン進捗更新エラー: ${campaignId}`, error);
    return null;
  }
}

// キャンペーンを完了状態に設定
async completeCampaign(campaignId) {
  try {
    await db.query(
      'UPDATE campaigns SET status = ? WHERE id = ?',
      ['completed', campaignId]
    );
    
    // アクティブキャンペーンから削除
    this.activeCampaigns.delete(campaignId);
    
    logger.info(`キャンペーン ${campaignId} を完了状態に設定しました`);
    return true;
  } catch (error) {
    logger.error(`キャンペーン完了設定エラー: ${campaignId}`, error);
    return false;
  }
}

// サービスの初期化を手動で行うメソッド - src/index.jsから呼び出す用
async initializeService() {
  logger.info('発信サービスの手動初期化を開始します');
  
  try {
    // アクティブなキャンペーンの復元
    const [activeCampaigns] = await db.query(`
      SELECT c.id, c.name, c.max_concurrent_calls, c.caller_id_id, 
             ci.number as caller_id_number
      FROM campaigns c
      JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.status = 'active' AND ci.active = true
    `);
    
    logger.info(`${activeCampaigns.length}件のアクティブキャンペーンを読み込みました`);
    
    for (const campaign of activeCampaigns) {
      this.activeCampaigns.set(campaign.id, {
        id: campaign.id,
        name: campaign.name,
        maxConcurrentCalls: campaign.max_concurrent_calls || 5,
        callerIdId: campaign.caller_id_id,
        callerIdNumber: campaign.caller_id_number,
        activeCalls: 0,
        status: 'active',
        lastDialTime: null
      });
      logger.info(`キャンペーンを読み込みました: ID=${campaign.id}, Name=${campaign.name}`);
    }
    
    // 定期的な発信ジョブを開始
    logger.info('発信ジョブを開始します');
    this.startDialerJob();
    
    // 即時にキュー処理を実行
    await this.processDialerQueue();
    
    this.initialized = true;
    logger.info('発信サービスの初期化が完了しました');
    return true;
  } catch (error) {
    logger.error('発信サービスの初期化エラー:', error);
    return false;
  }
}

}

// シングルトンインスタンス
const dialerService = new DialerService();

module.exports = dialerService;