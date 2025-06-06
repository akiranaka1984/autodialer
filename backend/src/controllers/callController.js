// src/controllers/callController.js - 転送機能統合完全版
const logger = require('../services/logger');
const callService = require('../services/callService');
const db = require('../services/database');

// テスト発信
exports.testCall = async (req, res) => {
  try {
    const { phoneNumber, callerID, mockMode, provider, campaignId } = req.body;
    
    // デバッグ情報を追加
    logger.info('テスト発信リクエスト受信:', {
      phoneNumber,
      callerID,
      mockMode,
      provider,
      campaignId,
      環境変数_MOCK_ASTERISK: process.env.MOCK_ASTERISK,
      環境変数_MOCK_SIP: process.env.MOCK_SIP,
      環境変数_DEFAULT_CALL_PROVIDER: process.env.DEFAULT_CALL_PROVIDER
    });
    
    if (!phoneNumber) {
      return res.status(400).json({ message: '発信先電話番号は必須です' });
    }
    
    // 発信者番号の検証（指定された場合）
    let callerIdData = null;
    if (callerID) {
      try {
        // db.queryの結果を[rows, fields]として受け取る
        const results = await db.query('SELECT * FROM caller_ids WHERE id = ? AND active = true', [callerID]);
        const callerIds = results[0]; // 最初の要素が行データの配列
        
        if (!callerIds || callerIds.length === 0) {
          return res.status(400).json({ message: '選択された発信者番号が見つからないか無効です' });
        }
        
        callerIdData = callerIds[0];
      } catch (dbError) {
        logger.error('発信者番号データ取得エラー:', dbError);
        return res.status(500).json({ message: 'データベースエラーが発生しました' });
      }
    }
    
    // キャンペーンの音声ファイルを取得
    let campaignAudio = null;
    if (campaignId) {
      try {
        const audioService = require('../services/audioService');
        campaignAudio = await audioService.getCampaignAudio(campaignId);
        
        if (campaignAudio && campaignAudio.length > 0) {
          logger.info(`テスト発信でキャンペーン ${campaignId} の音声ファイル取得: ${campaignAudio.length}件`);
        } else {
          logger.info(`テスト発信でキャンペーン ${campaignId} に音声ファイルが設定されていません`);
        }
      } catch (audioError) {
        logger.warn('テスト発信での音声ファイル取得エラー:', audioError.message);
        // 音声なしで続行
      }
    }
    
    // 発信パラメータの設定
    const params = {
      phoneNumber,
      callerID: callerIdData 
        ? `"${callerIdData.description || ''}" <${callerIdData.number}>` 
        : process.env.DEFAULT_CALLER_ID || '"Auto Dialer" <03-5946-8520>',
      context: 'autodialer',
      exten: 's',
      priority: 1,
      variables: {
        CAMPAIGN_ID: campaignId || 'TEST',
        CONTACT_ID: 'TEST',
        CONTACT_NAME: 'テストユーザー',
        COMPANY: 'テスト会社'
      },
      callerIdData,
      mockMode,
      provider,
      campaignAudio
    };
    
    logger.info(`テスト発信実行: 発信先=${phoneNumber}, モード=${mockMode ? 'mock' : '通常'}, 指定プロバイダ=${provider || '自動選択'}, キャンペーン=${campaignId || 'なし'}, 音声ファイル=${campaignAudio ? campaignAudio.length : 0}件`);
    
    try {
      // 統合コールサービスで発信
      const result = await callService.originate(params);
      
      // 通話ログに記録
      try {
        const [logResult] = await db.query(`
          INSERT INTO call_logs 
          (call_id, caller_id_id, phone_number, start_time, status, test_call, call_provider)
          VALUES (?, ?, ?, NOW(), 'ORIGINATING', 1, ?)
        `, [result.ActionID, callerIdData ? callerIdData.id : null, phoneNumber, result.provider]);
      } catch (logError) {
        logger.error('通話ログ記録エラー:', logError);
        // エラーはスローせず、処理を続行
      }
      
      // 発信結果を返す
      const responseData = {
        success: true,
        callId: result.ActionID,
        message: `テスト発信が開始されました（${result.provider}${mockMode ? 'モード' : ''}）`,
        data: {
          ...result,
          audioFilesCount: campaignAudio ? campaignAudio.length : 0
        }
      };
      
      // SIPアカウント情報がある場合は追加
      if (result.SipAccount) {
        responseData.sipAccount = result.SipAccount;
      }
      
      res.json(responseData);
      
      // 通話終了のシミュレーション（モックモードの場合）
      if (mockMode) {
        setTimeout(() => {
          callService.simulateCallEnd(result.ActionID, 'ANSWERED', 10);
        }, 10000);
      }
    } catch (originateError) {
      logger.error('発信処理エラー:', originateError);
      
      return res.status(500).json({ 
        message: 'テスト発信に失敗しました', 
        error: originateError.message,
        isSipError: originateError.message.includes('SIP') || originateError.message.includes('利用可能なSIPアカウント')
      });
    }
  } catch (error) {
    logger.error('テスト発信エラー:', error);
    res.status(500).json({ 
      message: 'テスト発信に失敗しました', 
      error: error.message,
      isSipError: error.message.includes('SIP') || error.message.includes('利用可能なSIPアカウント')
    });
  }
};

// モックモードでの通話終了シミュレーション
exports.simulateCallEnd = async (callId, status = 'ANSWERED', duration = 10) => {
  setTimeout(async () => {
    try {
      // 通話終了シミュレーション
      await callService.simulateCallEnd(callId, status, duration);
      
      // 通話ログを更新
      await db.query(`
        UPDATE call_logs
        SET end_time = NOW(), duration = ?, status = ?
        WHERE call_id = ?
      `, [duration, status, callId]);
      
      logger.info(`通話終了シミュレーション完了: callId=${callId}, status=${status}, duration=${duration}`);
    } catch (simulateError) {
      logger.error('テスト発信シミュレーションエラー:', simulateError);
    }
  }, 10000);
};

// 通話履歴一覧を取得（フィルター付き）
exports.getAllCalls = async (req, res) => {
  try {
    const { campaign, status, dateFrom, dateTo, search, provider, page = 1, limit = 20 } = req.query;
    
    let query = `
      SELECT cl.*, 
             c.phone as contact_phone, c.name as contact_name, c.company as contact_company,
             ca.name as campaign_name,
             ci.number as caller_id_number
      FROM call_logs cl
      LEFT JOIN contacts c ON cl.contact_id = c.id
      LEFT JOIN campaigns ca ON cl.campaign_id = ca.id
      LEFT JOIN caller_ids ci ON cl.caller_id_id = ci.id
      WHERE 1=1
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM call_logs cl
      LEFT JOIN contacts c ON cl.contact_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    const countParams = [];
    
    if (campaign) {
      query += ' AND cl.campaign_id = ?';
      countQuery += ' AND cl.campaign_id = ?';
      params.push(campaign);
      countParams.push(campaign);
    }
    
    if (status) {
      query += ' AND cl.status = ?';
      countQuery += ' AND cl.status = ?';
      params.push(status);
      countParams.push(status);
    }
    
    if (dateFrom) {
      query += ' AND cl.start_time >= ?';
      countQuery += ' AND cl.start_time >= ?';
      params.push(dateFrom);
      countParams.push(dateFrom);
    }
    
    if (dateTo) {
      query += ' AND cl.start_time <= ?';
      countQuery += ' AND cl.start_time <= ?';
      params.push(dateTo + ' 23:59:59');
      countParams.push(dateTo + ' 23:59:59');
    }
    
    if (search) {
      query += ' AND (c.phone LIKE ? OR c.name LIKE ?)';
      countQuery += ' AND (c.phone LIKE ? OR c.name LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam);
      countParams.push(searchParam, searchParam);
    }
    
    // プロバイダフィルター追加
    if (provider) {
      query += ' AND cl.call_provider = ?';
      countQuery += ' AND cl.call_provider = ?';
      params.push(provider);
      countParams.push(provider);
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY cl.start_time DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    
    // db.queryの結果を[rows, fields]として受け取る
    const [calls] = await db.query(query, params);
    const [totalResults] = await db.query(countQuery, countParams);
    
    // totalResults[0]を使用
    const total = totalResults[0].total;
    
    res.json({
      calls,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    logger.error('通話履歴取得エラー:', error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
};

// 通話終了処理（転送機能統合版）
exports.handleCallEnd = async (req, res) => {
  try {
    const { callId, duration, status, keypress } = req.body;
    
    if (!callId) {
      return res.status(400).json({ message: '通話IDが必要です' });
    }
    
    logger.info(`📞 通話終了処理開始: CallID=${callId}, Status=${status}, Keypress=${keypress}, Duration=${duration}`);
    
    // 統合コールサービスで通話終了処理
    const callEndResult = await callService.handleCallEnd(callId, duration, status, keypress);
    
    // 通話ログを更新
    const [result] = await db.query(`
      UPDATE call_logs
      SET end_time = NOW(), 
          duration = ?, 
          status = ?, 
          keypress = ?
      WHERE call_id = ?
    `, [duration || 0, status || 'COMPLETED', keypress, callId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '通話ログが見つかりません' });
    }
    
    // 🔄 キーパッド処理（転送機能統合）
    const [callInfoResult] = await db.query(`
      SELECT cl.contact_id, cl.campaign_id, cl.phone_number,
             c.phone as original_number
      FROM call_logs cl
      LEFT JOIN contacts c ON cl.contact_id = c.id
      WHERE cl.call_id = ?
    `, [callId]);
    
    let transferResult = null;
    
    if (callInfoResult.length > 0 && callInfoResult[0].contact_id) {
      const callInfo = callInfoResult[0];
      const contactId = callInfo.contact_id;
      let contactStatus = 'completed';
      
      if (keypress === '1') {
        // 🔄 オペレーター転送処理
        try {
          logger.info(`🔄 1キー押下により転送開始: CallID=${callId}`);
          
          const customerPhone = callInfo.original_number || callInfo.phone_number;
          const campaignId = callInfo.campaign_id;
          
          if (customerPhone && campaignId) {
            // transferServiceが存在する場合のみ実行
            try {
              const transferService = require('../services/transferService');
              transferResult = await transferService.initiateTransfer(
                callId, 
                customerPhone, 
                campaignId, 
                keypress
              );
              
              logger.info(`✅ 転送処理完了: ${transferResult.transferId}`);
              contactStatus = 'transferred'; // 連絡先ステータスを転送済みに
              
              // 通話ログに転送情報を追加
              await db.query(`
                UPDATE call_logs 
                SET is_transfer = true, transfer_id = ?
                WHERE call_id = ?
              `, [transferResult.transferId, callId]);
              
            } catch (transferServiceError) {
              logger.warn(`transferService利用不可: ${transferServiceError.message}`);
              
              // フォールバック：直接オペレーター番号に発信
              const operatorNumber = process.env.OPERATOR_NUMBER || '03-5946-8520';
              logger.info(`📞 フォールバック転送: ${operatorNumber}に発信`);
              
              // 簡易転送ログ記録
              const transferId = `fallback-${Date.now()}`;
              await db.query(`
                INSERT INTO transfer_logs (original_call_id, original_number, transfer_number, campaign_id, status, transfer_initiated_at, created_at)
                VALUES (?, ?, ?, ?, 'initiated', NOW(), NOW())
              `, [callId, customerPhone, operatorNumber, campaignId]);
              
              contactStatus = 'transferred';
              transferResult = { transferId, method: 'fallback', operatorNumber };
            }
          } else {
            logger.warn(`転送に必要な情報が不足: CallID=${callId}`);
            contactStatus = 'completed';
          }
        } catch (transferError) {
          logger.error(`転送処理エラー: CallID=${callId}`, transferError);
          contactStatus = 'completed'; // エラー時は完了扱い
        }
      } else if (keypress === '9') {
        contactStatus = 'dnc';
        // DNCリストに追加
        const [contactResult] = await db.query('SELECT phone FROM contacts WHERE id = ?', [contactId]);
        
        if (contactResult.length > 0) {
          await db.query(
            'INSERT IGNORE INTO dnc_list (phone, reason, created_at) VALUES (?, ?, NOW())',
            [contactResult[0].phone, 'ユーザーリクエスト（キーパッド入力9）']
          );
        }
      }
      
      // 連絡先ステータス更新
      await db.query('UPDATE contacts SET status = ? WHERE id = ?', [contactStatus, contactId]);
    }
    
    res.json({ 
      success: true, 
      message: '通話終了が記録されました',
      callEndResult,
      keypress,
      transferHandled: keypress === '1',
      transferResult
    });
    
  } catch (error) {
    logger.error('通話終了処理エラー:', error);
    res.status(500).json({ message: '通話終了の処理に失敗しました' });
  }
};

// 🔄 転送リクエスト処理（IVR Asteriskからの直接呼び出し用）
exports.handleTransferRequest = async (req, res) => {
  try {
    const { callId, customerPhone, campaignId, keypress = '1' } = req.body;
    
    logger.info(`🔄 転送リクエスト受信: CallID=${callId}, Customer=${customerPhone}, Campaign=${campaignId}`);

    if (!callId || !customerPhone || !campaignId) {
      return res.status(400).json({ 
        message: '必須パラメータが不足しています (callId, customerPhone, campaignId)' 
      });
    }

    // 通話情報を取得
    const [callInfo] = await db.query(`
      SELECT cl.contact_id, cl.campaign_id, c.phone, c.name, ca.name as campaign_name
      FROM call_logs cl
      LEFT JOIN contacts c ON cl.contact_id = c.id  
      LEFT JOIN campaigns ca ON cl.campaign_id = ca.id
      WHERE cl.call_id = ?
    `, [callId]);

    let transferResult;

    try {
      // transferServiceを試行
      const transferService = require('../services/transferService');
      transferResult = await transferService.initiateTransfer(
        callId,
        customerPhone,
        campaignId,
        keypress
      );
    } catch (transferServiceError) {
      logger.warn(`transferService利用不可、フォールバック実行: ${transferServiceError.message}`);
      
      // フォールバック処理
      const operatorNumber = process.env.OPERATOR_NUMBER || '03-5946-8520';
      const transferId = `fallback-${Date.now()}`;
      
      // 簡易転送ログ記録
      await db.query(`
        INSERT INTO transfer_logs (original_call_id, original_number, transfer_number, campaign_id, status, transfer_initiated_at, created_at)
        VALUES (?, ?, ?, ?, 'initiated', NOW(), NOW())
      `, [callId, customerPhone, operatorNumber, campaignId]);
      
      transferResult = { 
        transferId, 
        method: 'fallback', 
        operatorNumber,
        message: `オペレーター ${operatorNumber} に転送を開始しました（フォールバック）`
      };
    }

    // 通話ログに転送情報を記録
    await db.query(`
      UPDATE call_logs 
      SET status = 'TRANSFERRED', 
          keypress = ?,
          end_time = NOW(),
          is_transfer = true,
          transfer_id = ?
      WHERE call_id = ?
    `, [keypress, transferResult.transferId, callId]);

    // 連絡先ステータスを転送済みに更新
    if (callInfo.length > 0 && callInfo[0].contact_id) {
      await db.query('UPDATE contacts SET status = ? WHERE id = ?', ['transferred', callInfo[0].contact_id]);
    }

    res.json({
      success: true,
      message: transferResult.message || 'オペレーターに転送を開始しました',
      transferId: transferResult.transferId,
      customerPhone: customerPhone,
      campaignId: campaignId,
      method: transferResult.method || 'normal'
    });

  } catch (error) {
    logger.error('転送リクエスト処理エラー:', error);
    res.status(500).json({ 
      message: '転送処理に失敗しました',
      error: error.message 
    });
  }
};

// 転送状況取得API
exports.getTransferStatus = async (req, res) => {
  try {
    const { transferId } = req.params;
    
    if (!transferId) {
      return res.status(400).json({ message: '転送IDが必要です' });
    }

    // データベースから転送ログを取得
    const [transferLogs] = await db.query(`
      SELECT 
        tl.*,
        ca.name as campaign_name,
        c.name as customer_name
      FROM transfer_logs tl
      LEFT JOIN campaigns ca ON tl.campaign_id = ca.id
      LEFT JOIN contacts c ON tl.original_number = c.phone
      WHERE tl.transfer_id = ?
    `, [transferId]);

    if (transferLogs.length === 0) {
      return res.status(404).json({ message: '転送情報が見つかりません' });
    }

    const transferLog = transferLogs[0];

    // transferServiceが利用可能な場合はリアルタイム状態も取得
    try {
      const transferService = require('../services/transferService');
      const liveStatus = transferService.getTransferStatus(transferId);
      
      if (liveStatus.found) {
        transferLog.liveStatus = liveStatus;
      }
    } catch (serviceError) {
      // transferServiceが利用できない場合はデータベース情報のみ
      logger.debug('transferService利用不可、データベース情報のみ返却');
    }

    res.json({
      success: true,
      transfer: transferLog
    });

  } catch (error) {
    logger.error('転送状況取得エラー:', error);
    res.status(500).json({ message: '転送状況の取得に失敗しました' });
  }
};

// 全転送状況取得API（管理画面用）
exports.getAllTransfers = async (req, res) => {
  try {
    // データベースから転送ログを取得
    const [transferLogs] = await db.query(`
      SELECT 
        tl.*,
        ca.name as campaign_name,
        c.name as customer_name
      FROM transfer_logs tl
      LEFT JOIN campaigns ca ON tl.campaign_id = ca.id
      LEFT JOIN contacts c ON tl.original_number = c.phone
      ORDER BY tl.created_at DESC
      LIMIT 50
    `);

    let activeTransfers = [];

    // transferServiceが利用可能な場合はアクティブ転送も取得
    try {
      const transferService = require('../services/transferService');
      activeTransfers = transferService.getAllTransferStatus();
    } catch (serviceError) {
      logger.debug('transferService利用不可、データベース情報のみ返却');
    }

    res.json({
      success: true,
      activeTransfers: activeTransfers,
      transferHistory: transferLogs || []
    });

  } catch (error) {
    logger.error('全転送状況取得エラー:', error);
    res.status(500).json({ message: '転送状況の取得に失敗しました' });
  }
};    

// プロバイダのステータス取得
exports.getProvidersStatus = async (req, res) => {
  try {
    const providersStatus = callService.getProvidersStatus();
    
    res.json({
      providers: providersStatus,
      defaultProvider: callService.defaultProvider,
      enableFallback: callService.enableFallback,
      enableLoadBalancing: callService.enableLoadBalancing
    });
  } catch (error) {
    logger.error('プロバイダステータス取得エラー:', error);
    res.status(500).json({ message: 'プロバイダステータスの取得に失敗しました' });
  }
};
