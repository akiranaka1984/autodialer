// backend/src/routes/campaigns.js - IVR自動デプロイ対応修正版
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const logger = require('../services/logger');
const dialerService = require('../services/dialerService');

// ✅ 追加: ivrServiceをインポート（IVR自動デプロイのため）
const ivrService = require('../services/ivrService');

// ✅ 追加: campaignsControllerをインポート（IVR自動デプロイのため）
const campaignsController = require('../controllers/campaignsController');

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
    
    logger.info(`キャンペーン詳細取得完了: ID=${id}`);
    res.json(campaigns[0]);
    
  } catch (error) {
    logger.error(`キャンペーン詳細取得エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// キャンペーン作成 - ✅ IVR自動デプロイ実装
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

    // 転送設定を自動作成（transfer_sip_assignmentsからコピー）
    if (caller_id_id) {
      try {
        const [transferSettings] = await db.query(
          `INSERT INTO campaign_transfer_destinations (campaign_id, dtmf_key, sip_username, active, created_at)
           SELECT ?, dtmf_key, sip_username, active, NOW()
           FROM transfer_sip_assignments
           WHERE caller_id_id = ? AND active = 1`,
          [campaignId, caller_id_id]
        );
        logger.info(`転送設定を自動作成: Campaign=${campaignId}, 設定数=${transferSettings.affectedRows}`);
      } catch (transferError) {
        logger.warn(`転送設定の自動作成に失敗（処理は継続）: ${transferError.message}`);
      }
    }
    
    // ✅ 追加: IVRスクリプトの自動生成
    try {
      logger.info(`🎯 IVRスクリプト自動生成開始: Campaign=${campaignId}`);
      
      // IVRスクリプトをデプロイ
      const deployResult = await ivrService.deployIvrScript(campaignId);
      
      if (deployResult && deployResult.success) {
        logger.info(`✅ IVRスクリプト自動生成成功: ${deployResult.scriptPath}`);
        
        // データベースのivr_deployedフラグを更新
        await db.query(
          'UPDATE campaigns SET ivr_deployed = true, ivr_deploy_time = NOW() WHERE id = ?',
          [campaignId]
        );
      } else {
        logger.warn(`⚠️ IVRスクリプト自動生成に失敗しましたが、キャンペーン作成は続行します`);
      }
    } catch (ivrError) {
      logger.error(`❌ IVRスクリプト自動生成エラー（キャンペーン作成は成功）:`, ivrError);
      // IVR生成エラーがあってもキャンペーン作成は成功とする
    }
　　// フォールバック: campaign-74からコピー
      try {
        const { exec } = require('child_process');
        exec(`/usr/local/bin/fix-campaign-ivr.sh ${campaignId}`, (error, stdout, stderr) => {
          if (error) {
            logger.error(`フォールバックも失敗: ${error}`);
          } else {
            logger.info(`✅ フォールバックでIVRスクリプト作成: ${stdout}`);
          }
        });
      } catch (fallbackError) {
        logger.error(`フォールバックエラー: ${fallbackError}`);
      }
    
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
      [name, description, caller_id_id, script, status, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(500).json({ message: 'キャンペーンの更新に失敗しました' });
    }
    
    logger.info(`キャンペーン更新完了: ID=${id}`);
    
    res.json({
      success: true,
      message: 'キャンペーンを更新しました',
      campaign: {
        id: parseInt(id),
        name,
        description,
        status
      }
    });
    
  } catch (error) {
    logger.error(`キャンペーン更新エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'キャンペーンの更新に失敗しました' });
  }
});

// キャンペーン削除
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`🗑️ キャンペーン削除リクエスト: ID=${id}`);
    
    // 削除前のデータ量確認
    const [campaigns] = await db.query('SELECT * FROM campaigns WHERE id = ?', [id]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    const campaign = campaigns[0];
    
    // アクティブなキャンペーンは削除不可
    if (campaign.status === 'active') {
      return res.status(400).json({ message: 'アクティブなキャンペーンは削除できません。まず停止してください。' });
    }
    
    // トランザクション開始
    await db.query('START TRANSACTION');
    
    try {
      // 関連データ数の確認
      const [contactCount] = await db.query('SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ?', [id]);
      const [callLogCount] = await db.query('SELECT COUNT(*) as count FROM call_logs WHERE campaign_id = ?', [id]);
      
      const contactTotal = contactCount[0].count;
      const callLogTotal = callLogCount[0].count;
      
      logger.info(`削除対象データ: Contacts=${contactTotal}, CallLogs=${callLogTotal}`);
      
      // 4-1. キャンペーン音声設定を削除
      await db.query('DELETE FROM campaign_audio WHERE campaign_id = ?', [id]);
      logger.info(`キャンペーン音声設定を削除: ${id}`);
      
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

// ✅ 修正: キャンペーン開始 - campaignsController.startCampaignを使用
router.post('/:id/start', campaignsController.startCampaign);

// ✅ 修正: キャンペーン停止 - campaignsController.pauseCampaignを使用  
router.post('/:id/stop', campaignsController.pauseCampaign);

// ✅ 修正: キャンペーン再開 - campaignsController.resumeCampaignを使用
router.post('/:id/resume', campaignsController.resumeCampaign);

// キャンペーン統計取得
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`キャンペーン統計取得: ID=${id}`);
    
    // キャンペーン存在確認
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
    const totalContacts = contactStat.total || 0;
    const processedContacts = (contactStat.completed || 0) + (contactStat.failed || 0) + (contactStat.dnc || 0);

    let progress = 0;
    if (totalContacts > 0) {
     progress = Math.round((processedContacts / totalContacts) * 100);
     progress = Math.min(Math.max(progress, 0), 100); // 0-100%に制限
    }
    
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

module.exports = router;
