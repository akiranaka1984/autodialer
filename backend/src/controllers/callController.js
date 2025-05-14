const logger = require('../services/logger');
const asterisk = require('../services/asterisk');
const db = require('../services/database');

// テスト発信
exports.testCall = async (req, res) => {
  try {
    const { phoneNumber, callerID, mockMode } = req.body;
    
    // デバッグ情報を追加
    logger.info('テスト発信リクエスト受信:', {
      phoneNumber,
      callerID,
      mockMode,
      環境変数_MOCK_ASTERISK: process.env.MOCK_ASTERISK,
      環境変数_USE_TWILIO: process.env.USE_TWILIO
    });
    
    if (!phoneNumber) {
      return res.status(400).json({ message: '発信先電話番号は必須です' });
    }
    
    // テスト用の一時的なモック設定
    const originalMockMode = process.env.MOCK_ASTERISK;
    if (mockMode !== undefined) {
      process.env.MOCK_ASTERISK = mockMode ? 'true' : 'false';
      logger.info(`テスト用にMOCK_ASTERISKを${process.env.MOCK_ASTERISK}に変更`);
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
      }
    };
    
    logger.info(`テスト発信実行: 発信先=${phoneNumber}, モード=${process.env.MOCK_ASTERISK}`);
    
    try {
      // 発信実行
      const result = await asterisk.originate(params);
      
      // 通話ログに記録
      try {
        // db.queryの結果を[logResult, fields]として受け取る
        const [logResult] = await db.query(`
          INSERT INTO call_logs 
          (call_id, caller_id_id, phone_number, start_time, status, test_call)
          VALUES (?, ?, ?, NOW(), 'ORIGINATING', 1)
        `, [result.ActionID, callerIdData ? callerIdData.id : null, phoneNumber]);
      } catch (logError) {
        logger.error('通話ログ記録エラー:', logError);
        // エラーはスローせず、処理を続行
      }
      
      // モック設定を元に戻す
      process.env.MOCK_ASTERISK = originalMockMode;
      
      // 発信結果を返す（SIPアカウント情報を含める）
      const responseData = {
        success: true,
        callId: result.ActionID,
        message: 'テスト発信が開始されました' + (mockMode ? '（モックモード）' : ''),
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
          try {
            asterisk.simulateCallEnd(result.ActionID, 'ANSWERED', 10);
            
            // 通話ログを更新
            db.query(`
              UPDATE call_logs
              SET end_time = NOW(), duration = 10, status = 'ANSWERED'
              WHERE call_id = ?
            `, [result.ActionID]).catch(err => {
              logger.error('通話ログ更新エラー:', err);
            });
            
            // SIPアカウントを解放（リソース管理）
            if (typeof asterisk.releaseCallResource === 'function') {
              asterisk.releaseCallResource(result.ActionID).catch(err => {
                logger.error('SIPリソース解放エラー:', err);
              });
            }
          } catch (simulateError) {
            logger.error('テスト発信シミュレーションエラー:', simulateError);
          }
        }, 10000);
      }
    } catch (originateError) {
      logger.error('発信処理エラー:', originateError);
      
      // モック設定を元に戻す
      process.env.MOCK_ASTERISK = originalMockMode;
      
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

// 通話履歴一覧を取得（フィルター付き）
exports.getAllCalls = async (req, res) => {
  try {
    const { campaign, status, dateFrom, dateTo, search, page = 1, limit = 20 } = req.query;
    
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
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ' ORDER BY cl.start_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
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

// 通話履歴のエクスポート
exports.exportCalls = async (req, res) => {
  try {
    const { campaign, status, dateFrom, dateTo, search } = req.query;
    
    let query = `
      SELECT cl.start_time as '発信日時',
             c.phone as '電話番号',
             c.name as '名前',
             c.company as '会社名',
             ca.name as 'キャンペーン名',
             cl.status as 'ステータス',
             cl.duration as '通話時間（秒）',
             cl.keypress as 'キー入力',
             ci.number as '発信者番号'
      FROM call_logs cl
      LEFT JOIN contacts c ON cl.contact_id = c.id
      LEFT JOIN campaigns ca ON cl.campaign_id = ca.id
      LEFT JOIN caller_ids ci ON cl.caller_id_id = ci.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (campaign) {
      query += ' AND cl.campaign_id = ?';
      params.push(campaign);
    }
    
    if (status) {
      query += ' AND cl.status = ?';
      params.push(status);
    }
    
    if (dateFrom) {
      query += ' AND cl.start_time >= ?';
      params.push(dateFrom);
    }
    
    if (dateTo) {
      query += ' AND cl.start_time <= ?';
      params.push(dateTo + ' 23:59:59');
    }
    
    if (search) {
      query += ' AND (c.phone LIKE ? OR c.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ' ORDER BY cl.start_time DESC';
    
    // db.queryの結果を[rows, fields]として受け取る
    const [calls] = await db.query(query, params);
    
    // CSVヘッダーを作成
    const headers = [
      '発信日時',
      '電話番号',
      '名前',
      '会社名',
      'キャンペーン名',
      'ステータス',
      '通話時間（秒）',
      'キー入力',
      '発信者番号'
    ];
    
    // CSVデータを作成
    let csv = headers.join(',') + '\n';
    
    calls.forEach(call => {
      const row = [
        call['発信日時'] ? `"${call['発信日時']}"` : '',
        call['電話番号'] ? `"${call['電話番号']}"` : '',
        call['名前'] ? `"${call['名前']}"` : '',
        call['会社名'] ? `"${call['会社名']}"` : '',
        call['キャンペーン名'] ? `"${call['キャンペーン名']}"` : '',
        call['ステータス'] ? `"${call['ステータス']}"` : '',
        call['通話時間（秒）'] || '0',
        call['キー入力'] ? `"${call['キー入力']}"` : '',
        call['発信者番号'] ? `"${call['発信者番号']}"` : ''
      ];
      csv += row.join(',') + '\n';
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=call_history_${new Date().toISOString().split('T')[0]}.csv`);
    res.send('\uFEFF' + csv); // BOM付きUTF-8
  } catch (error) {
    logger.error('通話履歴エクスポートエラー:', error);
    res.status(500).json({ message: 'エクスポートに失敗しました' });
  }
};

// 特定の通話の詳細を取得
exports.getCallById = async (req, res) => {
  try {
    // db.queryの結果を[rows, fields]として受け取る
    const [calls] = await db.query(`
      SELECT cl.*, 
             c.phone as contact_phone, c.name as contact_name, c.company as contact_company,
             ca.name as campaign_name, ca.script as campaign_script,
             ci.number as caller_id_number, ci.description as caller_id_description
      FROM call_logs cl
      LEFT JOIN contacts c ON cl.contact_id = c.id
      LEFT JOIN campaigns ca ON cl.campaign_id = ca.id
      LEFT JOIN caller_ids ci ON cl.caller_id_id = ci.id
      WHERE cl.id = ?
    `, [req.params.id]);
    
    if (calls.length === 0) {
      return res.status(404).json({ message: '通話が見つかりません' });
    }
    
    res.json(calls[0]);
  } catch (error) {
    logger.error('通話詳細取得エラー:', error);
    res.status(500).json({ message: '通話詳細の取得に失敗しました' });
  }
};

// 通話ステータスの統計を取得
exports.getCallStats = async (req, res) => {
  try {
    const { startDate, endDate, campaignId } = req.query;
    
    let query = `
      SELECT 
        COUNT(*) as totalCalls,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered,
        SUM(CASE WHEN status = 'NO ANSWER' THEN 1 ELSE 0 END) as noAnswer,
        SUM(CASE WHEN status = 'BUSY' THEN 1 ELSE 0 END) as busy,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
        AVG(CASE WHEN status = 'ANSWERED' THEN duration ELSE NULL END) as avgDuration
      FROM call_logs
      WHERE 1=1
    `;
    
    const params = [];
    
    if (startDate) {
      query += ' AND start_time >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND start_time <= ?';
      params.push(endDate + ' 23:59:59');
    }
    
    if (campaignId) {
      query += ' AND campaign_id = ?';
      params.push(campaignId);
    }
    
    // db.queryの結果を[rows, fields]として受け取る
    const [stats] = await db.query(query, params);
    
    res.json(stats[0]);
  } catch (error) {
    logger.error('通話統計取得エラー:', error);
    res.status(500).json({ message: '統計の取得に失敗しました' });
  }
};

// 通話終了の処理
exports.handleCallEnd = async (req, res) => {
  try {
    const { callId, duration, status, keypress } = req.body;
    
    if (!callId) {
      return res.status(400).json({ message: '通話IDが必要です' });
    }
    
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
    
    // SIPアカウントを解放
    if (typeof asterisk.releaseCallResource === 'function') {
      try {
        await asterisk.releaseCallResource(callId);
        logger.info(`通話終了時にSIPリソースを解放: callId=${callId}`);
      } catch (sipError) {
        logger.warn(`SIPリソース解放エラー: ${sipError.message}`);
      }
    }
    
    res.json({ success: true, message: '通話終了が記録されました' });
  } catch (error) {
    logger.error('通話終了処理エラー:', error);
    res.status(500).json({ message: '通話終了の処理に失敗しました' });
  }
};