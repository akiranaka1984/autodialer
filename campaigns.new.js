// backend/src/routes/campaigns.js - レスポンス形式修正版
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
    
    console.log('キャンペーン一覧クエリ実行:', query, params);
    
    const [campaigns] = await db.query(query, params);
    const [totalResults] = await db.query(countQuery, countParams);
    
    const total = totalResults[0].total;
    
    logger.info(`キャンペーン一覧取得: ${campaigns.length}件 (全体: ${total}件)`);
    
    // ✅ 修正: 必ず配列を返すように統一
    const response = {
      campaigns: campaigns || [], // 必ず配列
      total,
      page: Math.floor(queryOffset / queryLimit) + 1,
      limit: queryLimit,
      totalPages: Math.ceil(total / queryLimit)
    };
    
    console.log('キャンペーン一覧レスポンス:', {
      campaignsCount: response.campaigns.length,
      total: response.total,
      isArray: Array.isArray(response.campaigns)
    });
    
    res.json(response);
  } catch (error) {
    logger.error('キャンペーン一覧取得エラー:', error);
    console.error('キャンペーン一覧取得エラー詳細:', error);
    
    // エラー時も配列構造でレスポンス
    res.status(500).json({ 
      campaigns: [], // 空配列
      total: 0,
      page: 1,
      limit: parseInt(req.query.limit || 50),
      totalPages: 0,
      error: 'データの取得に失敗しました'
    });
  }
});

// ✅ フォールバック: 簡易版キャンペーン一覧（互換性のため）
router.get('/simple', async (req, res) => {
  try {
    console.log('シンプルキャンペーン一覧API呼び出し');
    
    const [campaigns] = await db.query(`
      SELECT c.id, c.name, c.description, c.status, c.created_at, c.updated_at, c.progress,
             ci.number as caller_id_number,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as contact_count
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      ORDER BY c.created_at DESC
    `);
    
    console.log('シンプルキャンペーン取得結果:', campaigns.length, '件');
    
    // 直接配列を返す（CampaignListコンポーネントの修正版で対応済み）
    res.json(campaigns || []);
    
  } catch (error) {
    console.error('シンプルキャンペーン一覧エラー:', error);
    res.status(500).json([]);
  }
});

// その他のルート（変更なし）
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

// キャンペーン作成
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
    
    if (caller_id_id) {
      const [callerIds] = await db.query(
        'SELECT id FROM caller_ids WHERE id = ? AND active = true',
        [caller_id_id]
      );
      
      if (callerIds.length === 0) {
        return res.status(400).json({ message: '指定された発信者番号が見つからないか無効です' });
      }
    }
    
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

// キャンペーンを開始
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`キャンペーン開始リクエスト: ID=${id}`);
    
    const [campaigns] = await db.query('SELECT * FROM campaigns WHERE id = ?', [id]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    const campaign = campaigns[0];
    
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
    
    // 自動発信サービスを開始
    try {
      const autoDialer = require('../services/autoDialer');
      await autoDialer.startCampaign(id);
      logger.info(`自動発信サービス開始: Campaign=${id}`);
    } catch (dialerError) {
      logger.warn('自動発信サービス開始エラー（キャンペーンは開始済み）:', dialerError.message);
    }
    
    res.json({
      success: true,
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
    
    console.log(`キャンペーン停止リクエスト: ID=${id}`);
    
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
    
    // 自動発信サービスを停止
    try {
      const autoDialer = require('../services/autoDialer');
      autoDialer.stopCampaign(id);
      logger.info(`自動発信サービス停止: Campaign=${id}`);
    } catch (dialerError) {
      logger.warn('自動発信サービス停止エラー（キャンペーンは停止済み）:', dialerError.message);
    }
    
    logger.info(`キャンペーン停止: ID=${id}, Name=${campaign.name}`);
    
    res.json({
      success: true,
      message: 'キャンペーンを停止しました',
      campaignId: parseInt(id),
      campaignName: campaign.name
    });
  } catch (error) {
    logger.error(`キャンペーン停止エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'キャンペーンの停止に失敗しました' });
  }
});

// 他のルートは省略（変更なし）

module.exports = router;
