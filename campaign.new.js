// backend/src/routes/campaigns.js - 修正版
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const logger = require('../services/logger');

// キャンペーン一覧を取得
router.get('/', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT c.*, 
             ci.number as caller_id_number,
             ci.description as caller_id_description,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as contact_count,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'pending') as pending_count,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'completed') as completed_count
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE 1=1
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM campaigns c
      WHERE 1=1
    `;
    
    const params = [];
    const countParams = [];
    
    if (status) {
      query += ' AND c.status = ?';
      countQuery += ' AND c.status = ?';
      params.push(status);
      countParams.push(status);
    }
    
    const queryOffset = parseInt(offset);
    const queryLimit = parseInt(limit);
    query += ` ORDER BY c.created_at DESC LIMIT ${queryLimit} OFFSET ${queryOffset}`;
    
    const [campaigns] = await db.query(query, params);
    const [totalResults] = await db.query(countQuery, countParams);
    
    const total = totalResults[0].total;
    
    logger.info(`キャンペーン一覧取得: ${campaigns.length}件 (全体: ${total}件)`);
    
    res.json({
      campaigns,
      total,
      page: Math.floor(queryOffset / queryLimit) + 1,
      limit: queryLimit,
      totalPages: Math.ceil(total / queryLimit)
    });
  } catch (error) {
    logger.error('キャンペーン一覧取得エラー:', error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// キャンペーンの詳細を取得
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
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
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    logger.info(`キャンペーン詳細取得: ID=${id}`);
    res.json(campaigns[0]);
  } catch (error) {
    logger.error(`キャンペーン詳細取得エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// キャンペーンを作成
router.post('/', async (req, res) => {
  try {
    const { 
      name, 
      description, 
      caller_id_id, 
      script, 
      max_concurrent_calls = 5,
      schedule_start,
      schedule_end,
      working_hours_start = '09:00:00',
      working_hours_end = '18:00:00'
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'キャンペーン名は必須です' });
    }
    
    // 発信者番号の存在確認（指定された場合）
    if (caller_id_id) {
      const [callerIds] = await db.query(
        'SELECT id FROM caller_ids WHERE id = ? AND active = true',
        [caller_id_id]
      );
      
      if (callerIds.length === 0) {
        return res.status(400).json({ message: '指定された発信者番号が見つからないか無効です' });
      }
    }
    
    // キャンペーンを作成
    const [result] = await db.query(`
      INSERT INTO campaigns (
        name, description, status, caller_id_id, script, 
        max_concurrent_calls, schedule_start, schedule_end,
        working_hours_start, working_hours_end, progress,
        created_at, updated_at
      )
      VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
    `, [
      name, description, caller_id_id, script, max_concurrent_calls,
      schedule_start, schedule_end, working_hours_start, working_hours_end
    ]);
    
    logger.info(`キャンペーン作成: ID=${result.insertId}, Name=${name}`);
    
    res.status(201).json({
      id: result.insertId,
      name,
      description,
      status: 'draft',
      caller_id_id,
      script,
      max_concurrent_calls,
      schedule_start,
      schedule_end,
      working_hours_start,
      working_hours_end,
      progress: 0,
      message: 'キャンペーンを作成しました'
    });
  } catch (error) {
    logger.error('キャンペーン作成エラー:', error);
    res.status(500).json({ message: 'キャンペーンの作成に失敗しました' });
  }
});

// キャンペーンを更新
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      status,
      caller_id_id, 
      script, 
      max_concurrent_calls,
      schedule_start,
      schedule_end,
      working_hours_start,
      working_hours_end
    } = req.body;
    
    // キャンペーンの存在確認
    const [existing] = await db.query('SELECT id, status FROM campaigns WHERE id = ?', [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // 発信者番号の存在確認（指定された場合）
    if (caller_id_id) {
      const [callerIds] = await db.query(
        'SELECT id FROM caller_ids WHERE id = ? AND active = true',
        [caller_id_id]
      );
      
      if (callerIds.length === 0) {
        return res.status(400).json({ message: '指定された発信者番号が見つからないか無効です' });
      }
    }
    
    // 進捗率を計算（ステータスが更新される場合）
    let progress = null;
    if (status) {
      const [contactStats] = await db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('completed', 'failed', 'dnc') THEN 1 ELSE 0 END) as processed
        FROM contacts 
        WHERE campaign_id = ?
      `, [id]);
      
      if (contactStats.length > 0) {
        const { total, processed } = contactStats[0];
        progress = total > 0 ? Math.round((processed / total) * 100) : 0;
      }
    }
    
    // 更新クエリを構築
    const updateFields = [];
    const updateParams = [];
    
    if (name !== undefined) {
      updateFields.push('name = ?');
      updateParams.push(name);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateParams.push(description);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateParams.push(status);
    }
    if (caller_id_id !== undefined) {
      updateFields.push('caller_id_id = ?');
      updateParams.push(caller_id_id);
    }
    if (script !== undefined) {
      updateFields.push('script = ?');
      updateParams.push(script);
    }
    if (max_concurrent_calls !== undefined) {
      updateFields.push('max_concurrent_calls = ?');
      updateParams.push(max_concurrent_calls);
    }
    if (schedule_start !== undefined) {
      updateFields.push('schedule_start = ?');
      updateParams.push(schedule_start);
    }
    if (schedule_end !== undefined) {
      updateFields.push('schedule_end = ?');
      updateParams.push(schedule_end);
    }
    if (working_hours_start !== undefined) {
      updateFields.push('working_hours_start = ?');
      updateParams.push(working_hours_start);
    }
    if (working_hours_end !== undefined) {
      updateFields.push('working_hours_end = ?');
      updateParams.push(working_hours_end);
    }
    if (progress !== null) {
      updateFields.push('progress = ?');
      updateParams.push(progress);
    }
    
    updateFields.push('updated_at = NOW()');
    updateParams.push(id);
    
    if (updateFields.length === 1) { // updated_atのみの場合
      return res.status(400).json({ message: '更新するフィールドがありません' });
    }
    
    const updateQuery = `UPDATE campaigns SET ${updateFields.join(', ')} WHERE id = ?`;
    
    const [result] = await db.query(updateQuery, updateParams);
    
    logger.info(`キャンペーン更新: ID=${id}, affected=${result.affectedRows}`);
    
    // 更新後のデータを取得
    const [updated] = await db.query(`
      SELECT c.*, 
             ci.number as caller_id_number,
             ci.description as caller_id_description
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ?
    `, [id]);
    
    res.json({
      ...updated[0],
      message: 'キャンペーンを更新しました'
    });
  } catch (error) {
    logger.error(`キャンペーン更新エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'キャンペーンの更新に失敗しました' });
  }
});

// キャンペーンを削除
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // キャンペーンの存在確認
    const [existing] = await db.query('SELECT id, status FROM campaigns WHERE id = ?', [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // アクティブなキャンペーンは削除不可
    if (existing[0].status === 'active') {
      return res.status(400).json({ message: 'アクティブなキャンペーンは削除できません。まず停止してください。' });
    }
    
    // 関連する連絡先も削除するか確認
    const [contactCount] = await db.query('SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ?', [id]);
    
    if (contactCount[0].count > 0) {
      // 関連する連絡先を削除
      await db.query('DELETE FROM contacts WHERE campaign_id = ?', [id]);
      logger.info(`キャンペーン ${id} の連絡先 ${contactCount[0].count} 件を削除`);
    }
    
    // キャンペーンを削除
    await db.query('DELETE FROM campaigns WHERE id = ?', [id]);
    
    logger.info(`キャンペーン削除: ID=${id}`);
    
    res.json({ 
      message: 'キャンペーンを削除しました',
      deletedContactsCount: contactCount[0].count
    });
  } catch (error) {
    logger.error(`キャンペーン削除エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'キャンペーンの削除に失敗しました' });
  }
});

// キャンペーンの連絡先一覧を取得
router.get('/:id/contacts', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100, offset = 0, status, search } = req.query;
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT id, name FROM campaigns WHERE id = ?', [id]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    let query = `
      SELECT c.*
      FROM contacts c
      WHERE c.campaign_id = ?
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM contacts c
      WHERE c.campaign_id = ?
    `;
    
    const params = [id];
    const countParams = [id];
    
    // ステータスでフィルタ
    if (status) {
      query += ' AND c.status = ?';
      countQuery += ' AND c.status = ?';
      params.push(status);
      countParams.push(status);
    }
    
    // 検索フィルタ
    if (search) {
      query += ' AND (c.phone LIKE ? OR c.name LIKE ? OR c.company LIKE ?)';
      countQuery += ' AND (c.phone LIKE ? OR c.name LIKE ? OR c.company LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
      countParams.push(searchParam, searchParam, searchParam);
    }
    
    const queryOffset = parseInt(offset);
    const queryLimit = parseInt(limit);
    query += ` ORDER BY c.created_at DESC LIMIT ${queryLimit} OFFSET ${queryOffset}`;
    
    // クエリ実行
    const [contacts] = await db.query(query, params);
    const [totalResults] = await db.query(countQuery, countParams);
    
    const total = totalResults[0].total;
    
    logger.info(`キャンペーン ${id} の連絡先一覧取得: ${contacts.length}件 (全体: ${total}件)`);
    
    res.json({
      contacts,
      total,
      page: Math.floor(queryOffset / queryLimit) + 1,
      limit: queryLimit,
      totalPages: Math.ceil(total / queryLimit),
      campaign: campaigns[0]
    });
  } catch (error) {
    logger.error(`キャンペーン連絡先一覧取得エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// キャンペーンを開始
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT * FROM campaigns WHERE id = ?', [id]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    const campaign = campaigns[0];
    
    // キャンペーンの状態チェック
    if (campaign.status === 'active') {
      return res.status(400).json({ message: 'キャンペーンは既にアクティブです' });
    }
    
    if (campaign.status === 'completed') {
      return res.status(400).json({ message: '完了したキャンペーンは開始できません' });
    }
    
    // 連絡先の存在確認
    const [contactCount] = await db.query(
      'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = "pending"',
      [id]
    );
    
    if (contactCount[0].count === 0) {
      return res.status(400).json({ message: '発信対象の連絡先がありません' });
    }
    
    // 発信者番号の確認
    if (!campaign.caller_id_id) {
      return res.status(400).json({ message: '発信者番号が設定されていません' });
    }
    
    const [callerIds] = await db.query(
      'SELECT * FROM caller_ids WHERE id = ? AND active = true',
      [campaign.caller_id_id]
    );
    
    if (callerIds.length === 0) {
      return res.status(400).json({ message: '有効な発信者番号が設定されていません' });
    }
    
    // キャンペーンをアクティブに更新
    await db.query(
      'UPDATE campaigns SET status = "active", updated_at = NOW() WHERE id = ?',
      [id]
    );
    
    logger.info(`キャンペーン開始: ID=${id}, Name=${campaign.name}`);
    
    // ✅ ここで実際の自動発信処理を開始
    try {
      const autoDialer = require('../services/autoDialer');
      autoDialer.startCampaign(id);
      logger.info(`自動発信サービス開始: Campaign=${id}`);
    } catch (dialerError) {
      logger.warn('自動発信サービス開始エラー（キャンペーンは開始済み）:', dialerError.message);
    }
    
    res.json({
      message: 'キャンペーンを開始しました',
      campaignId: parseInt(id),
      campaignName: campaign.name,
      pendingContacts: contactCount[0].count
    });
  } catch (error) {
    logger.error(`キャンペーン開始エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'キャンペーンの開始に失敗しました' });
  }
});

// キャンペーンを停止
router.post('/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT * FROM campaigns WHERE id = ?', [id]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    const campaign = campaigns[0];
    
    if (campaign.status !== 'active') {
      return res.status(400).json({ message: 'キャンペーンはアクティブではありません' });
    }
    
    // キャンペーンを一時停止に更新
    await db.query(
      'UPDATE campaigns SET status = "paused", updated_at = NOW() WHERE id = ?',
      [id]
    );
    
    // ✅ 自動発信サービスを停止
    try {
      const autoDialer = require('../services/autoDialer');
      autoDialer.stopCampaign(id);
      logger.info(`自動発信サービス停止: Campaign=${id}`);
    } catch (dialerError) {
      logger.warn('自動発信サービス停止エラー（キャンペーンは停止済み）:', dialerError.message);
    }
    
    logger.info(`キャンペーン停止: ID=${id}, Name=${campaign.name}`);
    
    res.json({
      message: 'キャンペーンを停止しました',
      campaignId: parseInt(id),
      campaignName: campaign.name
    });
  } catch (error) {
    logger.error(`キャンペーン停止エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'キャンペーンの停止に失敗しました' });
  }
});

// キャンペーンの統計情報を取得
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    
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
    const progress = contactStat.total > 0 
      ? Math.round(((contactStat.completed + contactStat.failed + contactStat.dnc) / contactStat.total) * 100) 
      : 0;
    
    // 成功率を計算
    const successRate = callStat.total_calls > 0 
      ? Math.round((callStat.answered_calls / callStat.total_calls) * 100) 
      : 0;
    
    logger.info(`キャンペーン統計取得: ID=${id}`);
    
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
