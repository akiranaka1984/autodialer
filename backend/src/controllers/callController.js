// src/controllers/callController.js
const logger = require('../services/logger');
const callService = require('../services/callService');
const db = require('../services/database');

// テスト発信
exports.testCall = async (req, res) => {
  try {
    const { phoneNumber, callerID, mockMode, provider } = req.body;
    
    // デバッグ情報を追加
    logger.info('テスト発信リクエスト受信:', {
      phoneNumber,
      callerID,
      mockMode,
      provider,
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
        CAMPAIGN_ID: 'TEST',
        CONTACT_ID: 'TEST',
        CONTACT_NAME: 'テストユーザー',
        COMPANY: 'テスト会社'
      },
      callerIdData,  // 発信者番号データを渡す
      mockMode,      // モックモードフラグ
      provider       // 明示的なプロバイダ指定
    };
    
    logger.info(`テスト発信実行: 発信先=${phoneNumber}, モード=${mockMode ? 'mock' : '通常'}, 指定プロバイダ=${provider || '自動選択'}`);
    
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
        data: result
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
      isSipError: error.message.includes('SIP') || originateError.message.includes('利用可能なSIPアカウント')
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

// 通話終了処理
exports.handleCallEnd = async (req, res) => {
  try {
    const { callId, duration, status, keypress } = req.body;
    
    if (!callId) {
      return res.status(400).json({ message: '通話IDが必要です' });
    }
    
    // 統合コールサービスで通話終了処理
    const callEndResult = await callService.handleCallEnd(callId, duration, status, keypress);
    
    // 通話ログを更新
    // db.queryの結果を[result, fields]として受け取る
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
    
    // 連絡先のステータスを更新（該当する場合）
    // db.queryの結果を[rows, fields]として受け取る
    const [callInfoResult] = await db.query('SELECT contact_id FROM call_logs WHERE call_id = ?', [callId]);
    
    if (callInfoResult.length > 0 && callInfoResult[0].contact_id) {
      const contactId = callInfoResult[0].contact_id;
      let contactStatus = 'completed';
      
      if (keypress === '9') {
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
      
      await db.query('UPDATE contacts SET status = ? WHERE id = ?', [contactStatus, contactId]);
    }
    
    res.json({ 
      success: true, 
      message: '通話終了が記録されました',
      callEndResult
    });
  } catch (error) {
    logger.error('通話終了処理エラー:', error);
    res.status(500).json({ message: '通話終了の処理に失敗しました' });
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