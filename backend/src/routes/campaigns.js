// backend/src/routes/campaigns.js - キャンペーン削除機能追加版
const dialerService = require('../services/dialerService');
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const logger = require('../services/logger');

// キャンペーン一覧取得
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    
    logger.info(`キャンペーン一覧取得: Page=${page}, Limit=${limit}, Status=${status}`);
    
    let whereClause = 'WHERE 1=1';
    let queryParams = [];
    
    if (status) {
      whereClause += ' AND c.status = ?';
      queryParams.push(status);
    }
    
    if (search) {
      whereClause += ' AND (c.name LIKE ? OR c.description LIKE ?)';
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm);
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const dataQuery = `
      SELECT c.id, c.name, c.description, c.status, c.created_at, c.updated_at, c.progress,
             ci.number as caller_id_number,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as contact_count
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM campaigns c
      ${whereClause}
    `;
    
    const [campaigns] = await db.query(dataQuery, queryParams);
    const [countResult] = await db.query(countQuery, queryParams);
    
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / parseInt(limit));
    
    logger.info(`キャンペーン取得結果: ${campaigns.length}/${total}件`);
    
    res.json({
      campaigns: campaigns || [],
      total: total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: totalPages
    });
    
  } catch (error) {
    logger.error('キャンペーン一覧取得エラー:', error);
    res.status(500).json({ message: 'キャンペーンの取得に失敗しました' });
  }
});

// キャンペーン詳細取得
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`キャンペーン詳細取得: ID=${id}`);
    
    const [campaigns] = await db.query(`
      SELECT c.*, 
             ci.number as caller_id_number,
             ci.description as caller_id_description,
             ci.provider as caller_id_provider,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as contact_count,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'pending') as pending_count,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'completed') as completed_count,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'failed') as failed_count,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'dnc') as dnc_count
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ?
    `, [id]);
    
    if (campaigns.length === 0) {
      logger.warn(`キャンペーンが見つかりません: ID=${id}`);
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    logger.info(`キャンペーン詳細取得: ID=${id}`);
    res.json(campaigns[0]);
    
  } catch (error) {
    logger.error(`キャンペーン詳細取得エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// ✅ キャンペーン削除 - 新規追加
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`🗑️ キャンペーン削除開始: ID=${id}`);
    
    // 1. キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT id, name, status FROM campaigns WHERE id = ?', [id]);
    
    if (campaigns.length === 0) {
      logger.warn(`削除対象のキャンペーンが見つかりません: ID=${id}`);
      return res.status(404).json({ 
        success: false,
        message: 'キャンペーンが見つかりません' 
      });
    }
    
    const campaign = campaigns[0];
    
    // 2. アクティブなキャンペーンの削除確認
    if (campaign.status === 'active') {
      logger.warn(`アクティブなキャンペーンの削除試行: ID=${id}`);
      return res.status(400).json({ 
        success: false,
        message: 'アクティブなキャンペーンは削除できません。先に停止してください。' 
      });
    }
    
    // 3. 関連データの確認
    const [contactCount] = await db.query(
      'SELECT COUNT(*) as total FROM contacts WHERE campaign_id = ?', 
      [id]
    );
    
    const [callLogCount] = await db.query(
      'SELECT COUNT(*) as total FROM call_logs WHERE campaign_id = ?', 
      [id]
    );
    
    const contactTotal = contactCount[0].total;
    const callLogTotal = callLogCount[0].total;
    
    logger.info(`削除対象データ: Campaign=${campaign.name}, Contacts=${contactTotal}, CallLogs=${callLogTotal}`);
    
    // 4. トランザクション開始して削除実行
    await db.query('START TRANSACTION');
    
    try {
      // 関連データを順番に削除
      
      // 4-1. キャンペーン音声の関連付けを削除
      if (contactTotal > 0) {
        await db.query('DELETE FROM campaign_audio WHERE campaign_id = ?', [id]);
        logger.info(`キャンペーン音声関連付けを削除: ${id}`);
      }
      
      // 4-2. IVR設定を削除
      await db.query('DELETE FROM campaign_ivr_config WHERE campaign_id = ?', [id]);
      logger.info(`IVR設定を削除: ${id}`);
      
      // 4-3. 通話ログを削除
      if (callLogTotal > 0) {
        const [callLogResult] = await db.query('DELETE FROM call_logs WHERE campaign_id = ?', [id]);
        logger.info(`通話ログを削除: ${callLogResult.affectedRows}件`);
      }
      
      // 4-4. 連絡先を削除
      if (contactTotal > 0) {
        const [contactResult] = await db.query('DELETE FROM contacts WHERE campaign_id = ?', [id]);
        logger.info(`連絡先を削除: ${contactResult.affectedRows}件`);
      }
      
      // 4-5. キャンペーン本体を削除
      const [campaignResult] = await db.query('DELETE FROM campaigns WHERE id = ?', [id]);
      
      if (campaignResult.affectedRows === 0) {
        throw new Error('キャンペーンの削除に失敗しました');
      }
      
      // トランザクション確定
      await db.query('COMMIT');
      
      logger.info(`✅ キャンペーン削除完了: ID=${id}, Name=${campaign.name}`);
      
      res.json({
        success: true,
        message: `キャンペーン「${campaign.name}」を削除しました`,
        deletedCampaign: {
          id: parseInt(id),
          name: campaign.name
        },
        deletedData: {
          contacts: contactTotal,
          callLogs: callLogTotal
        }
      });
      
    } catch (deleteError) {
      // トランザクションロールバック
      await db.query('ROLLBACK');
      throw deleteError;
    }
    
  } catch (error) {
    logger.error(`🔥 キャンペーン削除エラー: ID=${req.params.id}`, error);
    
    let errorMessage = 'キャンペーンの削除に失敗しました';
    let statusCode = 500;
    
    if (error.message.includes('foreign key constraint')) {
      errorMessage = '関連データが存在するため削除できません';
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// キャンペーン作成
router.post('/', async (req, res) => {
  try {
    const { name, description, caller_id_id, script } = req.body;
    
    logger.info(`キャンペーン作成: Name=${name}`);
    
    if (!name) {
      return res.status(400).json({ message: 'キャンペーン名は必須です' });
    }
    
    const [result] = await db.query(
      'INSERT INTO campaigns (name, description, caller_id_id, script, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [name, description || '', caller_id_id || null, script || '', 'draft']
    );
    
    const campaignId = result.insertId;
    
    logger.info(`キャンペーン作成完了: ID=${campaignId}, Name=${name}`);
    
    res.status(201).json({
      success: true,
      message: 'キャンペーンを作成しました',
      campaign: {
        id: campaignId,
        name: name,
        description: description || '',
        status: 'draft'
      }
    });
    
  } catch (error) {
    logger.error('キャンペーン作成エラー:', error);
    res.status(500).json({ message: 'キャンペーンの作成に失敗しました' });
  }
});

// キャンペーン更新
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, caller_id_id, script, status } = req.body;
    
    logger.info(`キャンペーン更新: ID=${id}`);
    
    const [campaigns] = await db.query('SELECT id FROM campaigns WHERE id = ?', [id]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    const [result] = await db.query(
      'UPDATE campaigns SET name = ?, description = ?, caller_id_id = ?, script = ?, status = ?, updated_at = NOW() WHERE id = ?',
      [name, description || '', caller_id_id || null, script || '', status || 'draft', id]
    );
    
    logger.info(`キャンペーン更新完了: ID=${id}`);
    
    res.json({
      success: true,
      message: 'キャンペーンを更新しました',
      campaignId: parseInt(id)
    });
    
  } catch (error) {
    logger.error(`キャンペーン更新エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'キャンペーンの更新に失敗しました' });
  }
});

// キャンペーン開始
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`キャンペーン開始: ID=${id}`);
    
    const [result] = await db.query(
      'UPDATE campaigns SET status = "active", updated_at = NOW() WHERE id = ? AND status != "active"',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(400).json({ message: 'キャンペーンが見つからないか既にアクティブです' });
    }
    
    logger.info(`キャンペーン開始完了: ID=${id}`);
    
    res.json({
      success: true,
      message: 'キャンペーンを開始しました',
      campaignId: parseInt(id)
    });
    
  } catch (error) {
    logger.error(`キャンペーン開始エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'キャンペーンの開始に失敗しました' });
  }
});

// キャンペーン停止
router.post('/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`キャンペーン停止: ID=${id}`);
    
    const [result] = await db.query(
      'UPDATE campaigns SET status = "paused", updated_at = NOW() WHERE id = ? AND status = "active"',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(400).json({ message: 'キャンペーンが見つからないかアクティブではありません' });
    }
    
    logger.info(`キャンペーン停止完了: ID=${id}`);
    
    res.json({
      success: true,
      message: 'キャンペーンを停止しました',
      campaignId: parseInt(id)
    });
    
  } catch (error) {
    logger.error(`キャンペーン停止エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'キャンペーンの停止に失敗しました' });
  }
});

// キャンペーン統計取得
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`キャンペーン統計取得: ID=${id}`);
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT * FROM campaigns WHERE id = ?', [id]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // 連絡先統計
    const [contactStats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'called' THEN 1 ELSE 0 END) as called,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'dnc' THEN 1 ELSE 0 END) as dnc
      FROM contacts 
      WHERE campaign_id = ?
    `, [id]);
    
    // 通話統計
    const [callStats] = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered_calls,
        SUM(CASE WHEN status = 'NO ANSWER' THEN 1 ELSE 0 END) as no_answer_calls,
        SUM(CASE WHEN status = 'BUSY' THEN 1 ELSE 0 END) as busy_calls,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_calls,
        AVG(duration) as avg_duration
      FROM call_logs 
      WHERE campaign_id = ?
    `, [id]);
    
    const contactStat = contactStats[0];
    const callStat = callStats[0];
    
    // 進捗率を計算
    // 進捗率を計算（修正版）
   const totalContacts = contactStat.total || 0;
   const processedContacts = (contactStat.completed || 0) + (contactStat.failed || 0) + (contactStat.dnc || 0);

   let progress = 0;
   if (totalContacts > 0) {
    progress = Math.round((processedContacts / totalContacts) * 100);
    progress = Math.min(Math.max(progress, 0), 100); // 0-100%に制限
   }

   console.log(`進捗計算デバッグ: total=${totalContacts}, processed=${processedContacts}, progress=${progress}%`);
    // 成功率を計算
    const successRate = callStat.total_calls > 0 
      ? Math.round((callStat.answered_calls / callStat.total_calls) * 100) 
      : 0;
    
    logger.info(`キャンペーン統計取得完了: ID=${id}, Progress=${progress}%`);
    
    res.json({
      campaignId: parseInt(id),
      campaignName: campaigns[0].name,
      campaignStatus: campaigns[0].status,
      progress,
      successRate,
      contacts: {
        total: contactStat.total,
        pending: contactStat.pending,
        called: contactStat.called,
        completed: contactStat.completed,
        failed: contactStat.failed,
        dnc: contactStat.dnc
      },
      calls: {
        total: callStat.total_calls || 0,
        answered: callStat.answered_calls || 0,
        noAnswer: callStat.no_answer_calls || 0,
        busy: callStat.busy_calls || 0,
        failed: callStat.failed_calls || 0,
        avgDuration: callStat.avg_duration ? Math.round(callStat.avg_duration) : 0
      }
    });
    
  } catch (error) {
    logger.error(`キャンペーン統計取得エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// 🚀 キャンペーン開始API（既存コードの後に追加）
router.post('/:id/start', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    
    logger.info(`🚀 キャンペーン開始リクエスト: ${campaignId}`);
    
    // キャンペーンの存在と状態確認
    const [campaigns] = await db.query(
      'SELECT * FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    const campaign = campaigns[0];
    
    if (campaign.status === 'active') {
      return res.status(400).json({ message: 'キャンペーンは既にアクティブです' });
    }
    
    // 発信対象の連絡先数をチェック
    const [contactCount] = await db.query(
      'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = "pending"',
      [campaignId]
    );
    
    if (contactCount[0].count === 0) {
      return res.status(400).json({ 
        message: '発信対象の連絡先がありません。連絡先を追加してからキャンペーンを開始してください。' 
      });
    }
    
    // dialerServiceでキャンペーン開始
    const result = await dialerService.startCampaign(campaignId);
    
    if (!result) {
      return res.status(500).json({ message: 'キャンペーンの開始に失敗しました' });
    }
    
    logger.info(`✅ キャンペーン開始成功: ${campaignId}`);
    
    res.json({
      success: true,
      message: `キャンペーン「${campaign.name}」を開始しました`,
      campaign: {
        id: campaignId,
        name: campaign.name,
        totalContacts: contactCount[0].count
      }
    });
    
  } catch (error) {
    logger.error(`キャンペーン開始エラー: ${req.params.id}`, error);
    res.status(500).json({ 
      message: 'キャンペーンの開始に失敗しました',
      error: error.message 
    });
  }
});

// 4. キャンペーン設定画面用の転送設定取得API
// backend/src/routes/campaigns.js に追加

router.get('/:id/transfer-settings', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [campaign] = await db.query(`
      SELECT 
        c.id,
        c.name,
        c.transfer_enabled,
        c.operator_number,
        c.transfer_message,
        ci.number as caller_id_number,
        ci.description as caller_id_description
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id  
      WHERE c.id = ?
    `, [id]);
    
    if (campaign.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // デフォルト設定
    const transferSettings = {
      transferEnabled: campaign[0].transfer_enabled || true,
      operatorNumber: campaign[0].operator_number || campaign[0].caller_id_number,
      transferMessage: campaign[0].transfer_message || 'オペレーターに転送いたします。少々お待ちください。',
      callerIdNumber: campaign[0].caller_id_number,
      callerIdDescription: campaign[0].caller_id_description
    };
    
    res.json({
      success: true,
      campaignId: parseInt(id),
      transferSettings: transferSettings
    });
    
  } catch (error) {
    logger.error('転送設定取得エラー:', error);
    res.status(500).json({ message: '転送設定の取得に失敗しました' });
  }
});

// 5. 転送設定更新API
router.put('/:id/transfer-settings', async (req, res) => {
  try {
    const { id } = req.params;
    const { transferEnabled, operatorNumber, transferMessage } = req.body;
    
    await db.query(`
      UPDATE campaigns 
      SET 
        transfer_enabled = ?,
        operator_number = ?,
        transfer_message = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [transferEnabled, operatorNumber, transferMessage, id]);
    
    res.json({
      success: true,
      message: '転送設定を更新しました',
      campaignId: parseInt(id)
    });
    
  } catch (error) {
    logger.error('転送設定更新エラー:', error);
    res.status(500).json({ message: '転送設定の更新に失敗しました' });
  }
});

// 6. 管理画面用の転送状況監視API（リアルタイム風）
router.get('/transfers/realtime', async (req, res) => {
  try {
    // アクティブな転送の状況
    const activeTransfers = transferService.getAllTransferStatus();
    
    // 今日の転送統計
    const [todayStats] = await db.query(`
      SELECT 
        COUNT(*) as total_transfers,
        SUM(CASE WHEN transfer_status = 'completed' THEN 1 ELSE 0 END) as completed_transfers,
        SUM(CASE WHEN transfer_status = 'failed' THEN 1 ELSE 0 END) as failed_transfers,
        AVG(operator_duration) as avg_operator_duration
      FROM transfer_logs 
      WHERE DATE(created_at) = CURDATE()
    `);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      activeTransfers: activeTransfers,
      todayStats: todayStats[0] || {
        total_transfers: 0,
        completed_transfers: 0, 
        failed_transfers: 0,
        avg_operator_duration: 0
      }
    });
    
  } catch (error) {
    logger.error('リアルタイム転送状況取得エラー:', error);
    res.status(500).json({ message: 'リアルタイム転送状況の取得に失敗しました' });
  }
});

// 🛑 キャンペーン停止API（上記の後に追加）
router.post('/:id/stop', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    
    logger.info(`🛑 キャンペーン停止リクエスト: ${campaignId}`);
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query(
      'SELECT * FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    const campaign = campaigns[0];
    
    // dialerServiceでキャンペーン停止
    const result = await dialerService.pauseCampaign(campaignId);
    
    if (!result) {
      return res.status(500).json({ message: 'キャンペーンの停止に失敗しました' });
    }
    
    logger.info(`✅ キャンペーン停止成功: ${campaignId}`);
    
    res.json({
      success: true,
      message: `キャンペーン「${campaign.name}」を停止しました`,
      campaign: {
        id: campaignId,
        name: campaign.name
      }
    });
    
  } catch (error) {
    logger.error(`キャンペーン停止エラー: ${req.params.id}`, error);
    res.status(500).json({ 
      message: 'キャンペーンの停止に失敗しました',
      error: error.message 
    });
  }
});

module.exports = router;
