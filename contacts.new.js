// backend/src/routes/contacts.js - 新規作成
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const logger = require('../services/logger');

// 連絡先一覧を取得
router.get('/', async (req, res) => {
  try {
    const { campaign_id, limit = 100, offset = 0, status, search } = req.query;
    
    let query = `
      SELECT c.*, 
             ca.name as campaign_name
      FROM contacts c
      LEFT JOIN campaigns ca ON c.campaign_id = ca.id
      WHERE 1=1
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM contacts c
      WHERE 1=1
    `;
    
    const params = [];
    const countParams = [];
    
    // キャンペーンIDでフィルタ
    if (campaign_id) {
      query += ' AND c.campaign_id = ?';
      countQuery += ' AND c.campaign_id = ?';
      params.push(campaign_id);
      countParams.push(campaign_id);
    }
    
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
    
    logger.info(`連絡先一覧取得: ${contacts.length}件 (全体: ${total}件)`);
    
    res.json({
      contacts,
      total,
      page: Math.floor(queryOffset / queryLimit) + 1,
      limit: queryLimit,
      totalPages: Math.ceil(total / queryLimit)
    });
  } catch (error) {
    logger.error('連絡先一覧取得エラー:', error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// 特定のキャンペーンの連絡先一覧を取得
router.get('/campaign/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { limit = 100, offset = 0, status, search } = req.query;
    
    logger.info(`キャンペーン ${campaignId} の連絡先一覧を取得中`);
    
    let query = `
      SELECT c.*, 
             ca.name as campaign_name
      FROM contacts c
      LEFT JOIN campaigns ca ON c.campaign_id = ca.id
      WHERE c.campaign_id = ?
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM contacts c
      WHERE c.campaign_id = ?
    `;
    
    const params = [campaignId];
    const countParams = [campaignId];
    
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
    
    logger.info(`キャンペーン ${campaignId} の連絡先: ${contacts.length}件 (全体: ${total}件)`);
    
    res.json({
      contacts,
      total,
      page: Math.floor(queryOffset / queryLimit) + 1,
      limit: queryLimit,
      totalPages: Math.ceil(total / queryLimit),
      campaignId: parseInt(campaignId)
    });
  } catch (error) {
    logger.error(`キャンペーン ${req.params.campaignId} の連絡先取得エラー:`, error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// 連絡先の詳細を取得
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [contacts] = await db.query(`
      SELECT c.*, 
             ca.name as campaign_name,
             ca.description as campaign_description
      FROM contacts c
      LEFT JOIN campaigns ca ON c.campaign_id = ca.id
      WHERE c.id = ?
    `, [id]);
    
    if (contacts.length === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    logger.info(`連絡先詳細取得: ID=${id}`);
    res.json(contacts[0]);
  } catch (error) {
    logger.error(`連絡先詳細取得エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// 連絡先を作成
router.post('/', async (req, res) => {
  try {
    const { campaign_id, phone, name, company, notes } = req.body;
    
    if (!campaign_id || !phone) {
      return res.status(400).json({ message: 'キャンペーンIDと電話番号は必須です' });
    }
    
    // 電話番号の重複チェック（同一キャンペーン内）
    const [existing] = await db.query(
      'SELECT id FROM contacts WHERE campaign_id = ? AND phone = ?',
      [campaign_id, phone]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ message: 'この電話番号は既に登録されています' });
    }
    
    // 連絡先を作成
    const [result] = await db.query(`
      INSERT INTO contacts (campaign_id, phone, name, company, notes, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW())
    `, [campaign_id, phone, name, company, notes]);
    
    logger.info(`連絡先作成: ID=${result.insertId}, Phone=${phone}`);
    
    res.status(201).json({
      id: result.insertId,
      campaign_id,
      phone,
      name,
      company,
      notes,
      status: 'pending',
      message: '連絡先を作成しました'
    });
  } catch (error) {
    logger.error('連絡先作成エラー:', error);
    res.status(500).json({ message: '連絡先の作成に失敗しました' });
  }
});

// 連絡先を更新
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { phone, name, company, notes, status } = req.body;
    
    // 連絡先の存在確認
    const [existing] = await db.query('SELECT id FROM contacts WHERE id = ?', [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    // 更新
    const [result] = await db.query(`
      UPDATE contacts 
      SET phone = ?, name = ?, company = ?, notes = ?, status = ?, updated_at = NOW()
      WHERE id = ?
    `, [phone, name, company, notes, status, id]);
    
    logger.info(`連絡先更新: ID=${id}`);
    
    res.json({
      id: parseInt(id),
      phone,
      name,
      company,
      notes,
      status,
      message: '連絡先を更新しました'
    });
  } catch (error) {
    logger.error(`連絡先更新エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: '連絡先の更新に失敗しました' });
  }
});

// 連絡先を削除
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 連絡先の存在確認
    const [existing] = await db.query('SELECT id FROM contacts WHERE id = ?', [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    // 削除
    await db.query('DELETE FROM contacts WHERE id = ?', [id]);
    
    logger.info(`連絡先削除: ID=${id}`);
    
    res.json({ message: '連絡先を削除しました' });
  } catch (error) {
    logger.error(`連絡先削除エラー: ID=${req.params.id}`, error);
    res.status(500).json({ message: '連絡先の削除に失敗しました' });
  }
});

// CSVファイルから連絡先を一括インポート
router.post('/import', async (req, res) => {
  try {
    const { campaign_id, contacts } = req.body;
    
    if (!campaign_id || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ message: 'キャンペーンIDと連絡先データは必須です' });
    }
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT id FROM campaigns WHERE id = ?', [campaign_id]);
    
    if (campaigns.length === 0) {
      return res.status(400).json({ message: 'キャンペーンが見つかりません' });
    }
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // トランザクション開始
    await db.query('START TRANSACTION');
    
    try {
      for (const [index, contact] of contacts.entries()) {
        try {
          const { phone, name, company, notes } = contact;
          
          if (!phone) {
            errors.push(`行${index + 1}: 電話番号が必要です`);
            errorCount++;
            continue;
          }
          
          // 重複チェック
          const [existing] = await db.query(
            'SELECT id FROM contacts WHERE campaign_id = ? AND phone = ?',
            [campaign_id, phone]
          );
          
          if (existing.length > 0) {
            errors.push(`行${index + 1}: 電話番号 ${phone} は既に登録されています`);
            errorCount++;
            continue;
          }
          
          // 連絡先を挿入
          await db.query(`
            INSERT INTO contacts (campaign_id, phone, name, company, notes, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW())
          `, [campaign_id, phone, name, company, notes]);
          
          successCount++;
        } catch (contactError) {
          errors.push(`行${index + 1}: ${contactError.message}`);
          errorCount++;
        }
      }
      
      // トランザクションコミット
      await db.query('COMMIT');
      
      logger.info(`連絡先一括インポート完了: 成功=${successCount}, 失敗=${errorCount}`);
      
      res.json({
        message: '連絡先の一括インポートが完了しました',
        successCount,
        errorCount,
        errors: errors.length > 0 ? errors : null
      });
      
    } catch (transactionError) {
      // トランザクションロールバック
      await db.query('ROLLBACK');
      throw transactionError;
    }
    
  } catch (error) {
    logger.error('連絡先一括インポートエラー:', error);
    res.status(500).json({ message: '連絡先の一括インポートに失敗しました' });
  }
});

// 連絡先のステータス統計を取得
router.get('/stats/status', async (req, res) => {
  try {
    const { campaign_id } = req.query;
    
    let query = `
      SELECT status, COUNT(*) as count
      FROM contacts
    `;
    
    const params = [];
    
    if (campaign_id) {
      query += ' WHERE campaign_id = ?';
      params.push(campaign_id);
    }
    
    query += ' GROUP BY status';
    
    const [stats] = await db.query(query, params);
    
    // ステータス別の統計をオブジェクト形式に変換
    const statusStats = {
      pending: 0,
      called: 0,
      completed: 0,
      failed: 0,
      dnc: 0
    };
    
    stats.forEach(stat => {
      statusStats[stat.status] = stat.count;
    });
    
    logger.info(`連絡先ステータス統計取得: campaign_id=${campaign_id || 'all'}`);
    
    res.json({
      stats: statusStats,
      total: Object.values(statusStats).reduce((sum, count) => sum + count, 0),
      campaignId: campaign_id ? parseInt(campaign_id) : null
    });
  } catch (error) {
    logger.error('連絡先ステータス統計取得エラー:', error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// 連絡先のステータスを一括更新
router.put('/bulk/status', async (req, res) => {
  try {
    const { ids, status } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return res.status(400).json({ message: '連絡先IDリストとステータスは必須です' });
    }
    
    const validStatuses = ['pending', 'called', 'completed', 'failed', 'dnc'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: '無効なステータスです' });
    }
    
    // プレースホルダーを生成
    const placeholders = ids.map(() => '?').join(',');
    
    const [result] = await db.query(`
      UPDATE contacts 
      SET status = ?, updated_at = NOW()
      WHERE id IN (${placeholders})
    `, [status, ...ids]);
    
    logger.info(`連絡先ステータス一括更新: ${result.affectedRows}件をステータス${status}に更新`);
    
    res.json({
      message: `${result.affectedRows}件の連絡先ステータスを更新しました`,
      updatedCount: result.affectedRows,
      status
    });
  } catch (error) {
    logger.error('連絡先ステータス一括更新エラー:', error);
    res.status(500).json({ message: 'ステータスの更新に失敗しました' });
  }
});

module.exports = router;
