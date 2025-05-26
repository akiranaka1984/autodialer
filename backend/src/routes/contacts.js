// backend/src/routes/contacts.js - 連絡先管理ルーター
const express = require('express');
const router = express.Router();
const multer = require('multer');
const Papa = require('papaparse');
const db = require('../services/database');
const logger = require('../services/logger');

// CSVアップロード用のメモリストレージ
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB制限
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || 
        file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('CSVファイルのみ許可されています'), false);
    }
  }
});

// キャンペーンの連絡先一覧を取得
router.get('/campaigns/:campaignId/contacts', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      status, 
      search 
    } = req.query;

    logger.info(`連絡先一覧取得: Campaign=${campaignId}, Page=${page}, Limit=${limit}`);

    // キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT id, name FROM campaigns WHERE id = ?', [campaignId]);
    
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

    const params = [campaignId];
    const countParams = [campaignId];

    // ステータスでフィルタ
    if (status && status !== 'all') {
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

    const queryOffset = (parseInt(page) - 1) * parseInt(limit);
    const queryLimit = parseInt(limit);
    query += ` ORDER BY c.created_at DESC LIMIT ${queryLimit} OFFSET ${queryOffset}`;

    // クエリ実行
    const [contacts] = await db.query(query, params);
    const [totalResults] = await db.query(countQuery, countParams);

    const total = totalResults[0].total;

    logger.info(`連絡先取得結果: Campaign=${campaignId}, 件数=${contacts.length}, 全体=${total}`);

    res.json({
      contacts: contacts || [],
      total,
      page: parseInt(page),
      limit: queryLimit,
      totalPages: Math.ceil(total / queryLimit),
      campaign: campaigns[0]
    });
  } catch (error) {
    logger.error(`連絡先一覧取得エラー: Campaign=${req.params.campaignId}`, error);
    res.status(500).json({ 
      contacts: [],
      total: 0,
      message: 'データの取得に失敗しました' 
    });
  }
});

// CSVファイルのアップロード
router.post('/campaigns/:campaignId/contacts/upload', upload.single('file'), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { hasHeader = 'true', skipEmptyLines = 'true', delimiter = 'auto' } = req.body;

    logger.info(`CSVアップロード開始: Campaign=${campaignId}`, {
      hasHeader,
      skipEmptyLines,
      delimiter,
      fileSize: req.file?.size
    });

    if (!req.file) {
      return res.status(400).json({ message: 'CSVファイルが見つかりません' });
    }

    // キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT id FROM campaigns WHERE id = ?', [campaignId]);
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }

    // CSVファイルを文字列として読み込み
    const csvData = req.file.buffer.toString('utf-8');

    // Papaparseの設定
    const parseConfig = {
      header: hasHeader === 'true',
      skipEmptyLines: skipEmptyLines === 'true',
      transformHeader: (header) => {
        // ヘッダーの正規化
        const normalizedHeader = header.trim().toLowerCase();
        if (normalizedHeader.includes('phone') || normalizedHeader.includes('電話')) {
          return 'phone';
        } else if (normalizedHeader.includes('name') || normalizedHeader.includes('名前')) {
          return 'name';
        } else if (normalizedHeader.includes('company') || normalizedHeader.includes('会社')) {
          return 'company';
        }
        return normalizedHeader;
      }
    };

    // 区切り文字の設定
    if (delimiter !== 'auto') {
      parseConfig.delimiter = delimiter === '\\t' ? '\t' : delimiter;
    }

    // CSVをパース
    const parseResult = Papa.parse(csvData, parseConfig);

    if (parseResult.errors.length > 0) {
      logger.warn('CSV解析警告:', parseResult.errors);
    }

    const csvRows = parseResult.data;
    
    if (csvRows.length === 0) {
      return res.status(400).json({ message: 'CSVファイルにデータが含まれていません' });
    }

    logger.info(`CSV解析完了: ${csvRows.length}行のデータ`);

    // データの検証と変換
    const validContacts = [];
    const errors = [];

    csvRows.forEach((row, index) => {
      const rowNum = index + 1;
      
      let phone, name, company;

      if (hasHeader === 'true') {
        // ヘッダー行がある場合
        phone = row.phone || row.電話番号 || row.電話;
        name = row.name || row.名前 || row.氏名;
        company = row.company || row.会社名 || row.会社;
      } else {
        // ヘッダー行がない場合（1列目=電話番号、2列目=名前、3列目=会社名）
        const values = Array.isArray(row) ? row : Object.values(row);
        phone = values[0];
        name = values[1];
        company = values[2];
      }

      // 電話番号の検証
      if (!phone || typeof phone !== 'string') {
        errors.push(`${rowNum}行目: 電話番号が見つかりません`);
        return;
      }

      // 電話番号の正規化（数字のみにする）
      const cleanPhone = phone.replace(/[^\d]/g, '');
      
      if (cleanPhone.length < 8 || cleanPhone.length > 15) {
        errors.push(`${rowNum}行目: 電話番号の形式が正しくありません (${phone})`);
        return;
      }

      validContacts.push({
        phone: cleanPhone,
        name: name && typeof name === 'string' ? name.trim() : null,
        company: company && typeof company === 'string' ? company.trim() : null,
        campaign_id: campaignId
      });
    });

    if (validContacts.length === 0) {
      return res.status(400).json({ 
        message: '有効な連絡先データが見つかりませんでした',
        errors: errors.slice(0, 10) // 最初の10個のエラーのみ表示
      });
    }

    logger.info(`有効な連絡先: ${validContacts.length}件, エラー: ${errors.length}件`);

    // データベースに挿入
    let imported = 0;
    const duplicates = [];

    for (const contact of validContacts) {
      try {
        // 重複チェック
        const [existing] = await db.query(
          'SELECT id FROM contacts WHERE campaign_id = ? AND phone = ?',
          [campaignId, contact.phone]
        );

        if (existing.length > 0) {
          duplicates.push(contact.phone);
          continue;
        }

        // 新規挿入
        await db.query(
          'INSERT INTO contacts (campaign_id, phone, name, company, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
          [contact.campaign_id, contact.phone, contact.name, contact.company, 'pending']
        );
        
        imported++;
      } catch (insertError) {
        logger.error(`連絡先挿入エラー: ${contact.phone}`, insertError);
        errors.push(`電話番号 ${contact.phone}: データベース挿入エラー`);
      }
    }

    logger.info(`CSVアップロード完了: Campaign=${campaignId}, 取り込み=${imported}件, 重複=${duplicates.length}件, エラー=${errors.length}件`);

    // キャンペーンの進捗を更新
    try {
      const [totalContacts] = await db.query(
        'SELECT COUNT(*) as total FROM contacts WHERE campaign_id = ?',
        [campaignId]
      );
      
      const [completedContacts] = await db.query(
        'SELECT COUNT(*) as completed FROM contacts WHERE campaign_id = ? AND status IN ("completed", "failed", "dnc")',
        [campaignId]
      );

      const total = totalContacts[0].total;
      const completed = completedContacts[0].completed;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

      await db.query(
        'UPDATE campaigns SET progress = ?, updated_at = NOW() WHERE id = ?',
        [progress, campaignId]
      );
    } catch (progressError) {
      logger.warn('進捗更新エラー:', progressError);
    }

    res.json({
      success: true,
      imported,
      duplicates: duplicates.length,
      errors: errors.length,
      message: `${imported}件の連絡先を取り込みました`,
      details: {
        duplicatePhones: duplicates.slice(0, 5), // 最初の5件のみ
        errors: errors.slice(0, 5) // 最初の5件のみ
      }
    });

  } catch (error) {
    logger.error(`CSVアップロードエラー: Campaign=${req.params.campaignId}`, error);
    res.status(500).json({ 
      message: 'CSVファイルの処理中にエラーが発生しました',
      error: error.message 
    });
  }
});

// 単一連絡先の追加
router.post('/campaigns/:campaignId/contacts', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { phone, name, company } = req.body;

    if (!phone) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }

    // キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT id FROM campaigns WHERE id = ?', [campaignId]);
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }

    // 電話番号の正規化
    const cleanPhone = phone.replace(/[^\d]/g, '');
    
    if (cleanPhone.length < 8 || cleanPhone.length > 15) {
      return res.status(400).json({ message: '電話番号の形式が正しくありません' });
    }

    // 重複チェック
    const [existing] = await db.query(
      'SELECT id FROM contacts WHERE campaign_id = ? AND phone = ?',
      [campaignId, cleanPhone]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'この電話番号は既に登録されています' });
    }

    // 挿入
    const [result] = await db.query(
      'INSERT INTO contacts (campaign_id, phone, name, company, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [campaignId, cleanPhone, name || null, company || null, 'pending']
    );

    logger.info(`連絡先追加: Campaign=${campaignId}, Phone=${cleanPhone}, ID=${result.insertId}`);

    res.status(201).json({
      id: result.insertId,
      campaign_id: parseInt(campaignId),
      phone: cleanPhone,
      name: name || null,
      company: company || null,
      status: 'pending',
      message: '連絡先を追加しました'
    });

  } catch (error) {
    logger.error(`連絡先追加エラー: Campaign=${req.params.campaignId}`, error);
    res.status(500).json({ message: '連絡先の追加に失敗しました' });
  }
});

// 連絡先の更新
router.put('/campaigns/:campaignId/contacts/:contactId', async (req, res) => {
  try {
    const { campaignId, contactId } = req.params;
    const { phone, name, company, status } = req.body;

    // 存在確認
    const [contacts] = await db.query(
      'SELECT id FROM contacts WHERE id = ? AND campaign_id = ?',
      [contactId, campaignId]
    );

    if (contacts.length === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }

    // 更新データを構築
    const updateFields = [];
    const updateValues = [];

    if (phone !== undefined) {
      const cleanPhone = phone.replace(/[^\d]/g, '');
      if (cleanPhone.length < 8 || cleanPhone.length > 15) {
        return res.status(400).json({ message: '電話番号の形式が正しくありません' });
      }
      updateFields.push('phone = ?');
      updateValues.push(cleanPhone);
    }

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name || null);
    }

    if (company !== undefined) {
      updateFields.push('company = ?');
      updateValues.push(company || null);
    }

    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: '更新するデータがありません' });
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(contactId, campaignId);

    const updateQuery = `UPDATE contacts SET ${updateFields.join(', ')} WHERE id = ? AND campaign_id = ?`;
    await db.query(updateQuery, updateValues);

    logger.info(`連絡先更新: Campaign=${campaignId}, Contact=${contactId}`);

    res.json({ message: '連絡先を更新しました' });

  } catch (error) {
    logger.error(`連絡先更新エラー: Campaign=${req.params.campaignId}, Contact=${req.params.contactId}`, error);
    res.status(500).json({ message: '連絡先の更新に失敗しました' });
  }
});

// 連絡先の削除
router.delete('/campaigns/:campaignId/contacts/:contactId', async (req, res) => {
  try {
    const { campaignId, contactId } = req.params;

    const [result] = await db.query(
      'DELETE FROM contacts WHERE id = ? AND campaign_id = ?',
      [contactId, campaignId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }

    logger.info(`連絡先削除: Campaign=${campaignId}, Contact=${contactId}`);

    res.json({ message: '連絡先を削除しました' });

  } catch (error) {
    logger.error(`連絡先削除エラー: Campaign=${req.params.campaignId}, Contact=${req.params.contactId}`, error);
    res.status(500).json({ message: '連絡先の削除に失敗しました' });
  }
});

// キャンペーンの全連絡先削除
router.delete('/campaigns/:campaignId/contacts', async (req, res) => {
  try {
    const { campaignId } = req.params;

    // キャンペーンの存在確認
    const [campaigns] = await db.query('SELECT id FROM campaigns WHERE id = ?', [campaignId]);
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }

    const [result] = await db.query(
      'DELETE FROM contacts WHERE campaign_id = ?',
      [campaignId]
    );

    logger.info(`全連絡先削除: Campaign=${campaignId}, 削除件数=${result.affectedRows}`);

    res.json({ 
      message: `${result.affectedRows}件の連絡先を削除しました`,
      deletedCount: result.affectedRows
    });

  } catch (error) {
    logger.error(`全連絡先削除エラー: Campaign=${req.params.campaignId}`, error);
    res.status(500).json({ message: '連絡先の削除に失敗しました' });
  }
});

// 連絡先の統計情報取得
router.get('/campaigns/:campaignId/contacts/stats', async (req, res) => {
  try {
    const { campaignId } = req.params;

    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'called' THEN 1 ELSE 0 END) as called,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'dnc' THEN 1 ELSE 0 END) as dnc
      FROM contacts 
      WHERE campaign_id = ?
    `, [campaignId]);

    const result = stats[0];
    const progress = result.total > 0 
      ? Math.round(((result.completed + result.failed + result.dnc) / result.total) * 100) 
      : 0;

    res.json({
      ...result,
      progress
    });

  } catch (error) {
    logger.error(`連絡先統計エラー: Campaign=${req.params.campaignId}`, error);
    res.status(500).json({ message: '統計情報の取得に失敗しました' });
  }
});

module.exports = router;
