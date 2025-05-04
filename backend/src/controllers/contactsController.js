// backend/src/controllers/contactsController.js
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const csv = require('csv-parser');
const multer = require('multer');
const db = require('../services/database');
const logger = require('../services/logger');

// CSVアップロード用の設定
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB制限
  },
  fileFilter: (req, file, cb) => {
    // CSVファイルのみ許可
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('CSVファイル形式のみアップロード可能です。'));
    }
  }
});

// CSVファイルから連絡先をインポート
exports.uploadContacts = async (req, res) => {
  // Multerミドルウェアを適用
  const uploadMiddleware = promisify(upload.single('file'));
  
  try {
    await uploadMiddleware(req, res);
    
    if (!req.file) {
      return res.status(400).json({ message: 'ファイルが見つかりません' });
    }
    
    const campaignId = req.body.campaign_id;
    
    if (!campaignId) {
      return res.status(400).json({ message: 'キャンペーンIDが必要です' });
    }
    
    // キャンペーンの存在確認
    const campaigns = await db.query('SELECT id FROM campaigns WHERE id = ?', [campaignId]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // マッピング情報の取得
    let mappings;
    try {
      mappings = JSON.parse(req.body.mappings);
    } catch (error) {
      return res.status(400).json({ message: 'マッピング情報が不正です' });
    }
    
    if (!mappings.phone) {
      return res.status(400).json({ message: '電話番号フィールドのマッピングが必要です' });
    }
    
    // 既存の連絡先を取得（重複チェック用）
    const existingContacts = await db.query(
      'SELECT phone FROM contacts WHERE campaign_id = ?',
      [campaignId]
    );
    
    const existingPhones = new Set(existingContacts.map(contact => contact.phone));
    
    // CSVファイル処理
    const filePath = req.file.path;
    const contacts = [];
    const errors = [];
    let totalCount = 0;
    let importedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          totalCount++;
          
          // 行のデータを配列化
          const rowData = Object.values(row);
          
          try {
            // マッピングに従ってデータを抽出
            const phone = rowData[mappings.phone].trim();
            const name = mappings.name ? rowData[mappings.name].trim() : '';
            const company = mappings.company ? rowData[mappings.company].trim() : '';
            
            // 電話番号の検証
            if (!phone) {
              errors.push(`行 ${totalCount + 1}: 電話番号が空です`);
              errorCount++;
              return;
            }
            
            // 電話番号の正規化（ハイフンを削除）
            const normalizedPhone = phone.replace(/-/g, '');
            
            // 重複チェック
            if (existingPhones.has(normalizedPhone)) {
              errors.push(`行 ${totalCount + 1}: 電話番号 ${normalizedPhone} は既に登録されています`);
              duplicateCount++;
              return;
            }
            
            // 連絡先を追加
            contacts.push({
              campaign_id: campaignId,
              phone: normalizedPhone,
              name,
              company,
              status: 'pending',
              created_at: new Date()
            });
            
            // 重複チェック用セットに追加
            existingPhones.add(normalizedPhone);
            importedCount++;
          } catch (error) {
            errors.push(`行 ${totalCount + 1}: データ処理エラー - ${error.message}`);
            errorCount++;
          }
        })
        .on('end', () => {
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });
    
    // 連絡先がない場合
    if (contacts.length === 0) {
      return res.status(400).json({
        message: 'インポートできる連絡先がありません',
        total_count: totalCount,
        imported_count: 0,
        duplicate_count: duplicateCount,
        error_count: errorCount,
        errors: errors.slice(0, 10) // 最初の10件のエラーのみ返す
      });
    }
    
    // 一括挿入
    const values = contacts.map(contact => [
      contact.campaign_id,
      contact.phone,
      contact.name,
      contact.company,
      contact.status,
      contact.created_at
    ]);
    
    // 分割して挿入（一度に大量のレコードを挿入するとエラーになる可能性があるため）
    const chunkSize = 1000;
    for (let i = 0; i < values.length; i += chunkSize) {
      const chunk = values.slice(i, i + chunkSize);
      
      await db.query(
        'INSERT INTO contacts (campaign_id, phone, name, company, status, created_at) VALUES ?',
        [chunk]
      );
    }
    
    // 一時ファイルを削除
    fs.unlink(filePath, (err) => {
      if (err) {
        logger.error(`一時ファイル削除エラー: ${err.message}`);
      }
    });
    
    // キャンペーンの連絡先数を更新
    await db.query(
      'UPDATE campaigns SET contact_count = (SELECT COUNT(*) FROM contacts WHERE campaign_id = ?) WHERE id = ?',
      [campaignId, campaignId]
    );
    
    res.json({
      message: `${importedCount}件の連絡先をインポートしました`,
      total_count: totalCount,
      imported_count: importedCount,
      duplicate_count: duplicateCount,
      error_count: errorCount,
      errors: errors.slice(0, 10) // 最初の10件のエラーのみ返す
    });
  } catch (error) {
    logger.error('連絡先アップロードエラー:', error);
    
    // 一時ファイルがある場合は削除
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// キャンペーンの連絡先一覧を取得
exports.getContactsByCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { limit = 100, offset = 0, status } = req.query;
    
    // キャンペーン存在確認
    const campaigns = await db.query('SELECT id FROM campaigns WHERE id = ?', [campaignId]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    let query = 'SELECT * FROM contacts WHERE campaign_id = ?';
    const params = [campaignId];
    
    // ステータスフィルター
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    // 並べ替えとページネーション
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const contacts = await db.query(query, params);
    
    // 総件数を取得
    let countQuery = 'SELECT COUNT(*) as total FROM contacts WHERE campaign_id = ?';
    const countParams = [campaignId];
    
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    
    const countResult = await db.query(countQuery, countParams);
    const total = countResult[0].total;
    
    res.json({
      contacts,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('連絡先取得エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// 連絡先詳細の取得
exports.getContactById = async (req, res) => {
  try {
    const contactId = req.params.id;
    
    const contacts = await db.query(`
      SELECT c.*, 
             ca.name as campaign_name
      FROM contacts c
      LEFT JOIN campaigns ca ON c.campaign_id = ca.id
      WHERE c.id = ?
    `, [contactId]);
    
    if (contacts.length === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    // 通話履歴を取得
    const callLogs = await db.query(`
      SELECT * FROM call_logs 
      WHERE contact_id = ? 
      ORDER BY start_time DESC
    `, [contactId]);
    
    const contact = contacts[0];
    contact.call_logs = callLogs;
    
    res.json(contact);
  } catch (error) {
    logger.error('連絡先詳細取得エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// 連絡先の更新
exports.updateContact = async (req, res) => {
  try {
    const contactId = req.params.id;
    const { phone, name, company, status, notes } = req.body;
    
    if (!phone) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    // 連絡先の存在確認
    const contacts = await db.query('SELECT id FROM contacts WHERE id = ?', [contactId]);
    
    if (contacts.length === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    // 電話番号の正規化（ハイフンを削除）
    const normalizedPhone = phone.replace(/-/g, '');
    
    // 重複チェック（同一キャンペーン内で、自分以外の連絡先と電話番号が重複していないか）
    const duplicates = await db.query(`
      SELECT id FROM contacts 
      WHERE phone = ? AND id != ? AND campaign_id = (
        SELECT campaign_id FROM contacts WHERE id = ?
      )
    `, [normalizedPhone, contactId, contactId]);
    
    if (duplicates.length > 0) {
      return res.status(400).json({ message: 'この電話番号は既に登録されています' });
    }
    
    // 連絡先を更新
    await db.query(`
      UPDATE contacts
      SET phone = ?, name = ?, company = ?, status = ?, notes = ?
      WHERE id = ?
    `, [normalizedPhone, name, company, status, notes, contactId]);
    
    // 更新された連絡先を取得
    const updatedContacts = await db.query(`
      SELECT * FROM contacts WHERE id = ?
    `, [contactId]);
    
    res.json(updatedContacts[0]);
  } catch (error) {
    logger.error('連絡先更新エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// 連絡先の削除
exports.deleteContact = async (req, res) => {
  try {
    const contactId = req.params.id;
    
    // 連絡先の存在確認
    const contacts = await db.query('SELECT id, campaign_id FROM contacts WHERE id = ?', [contactId]);
    
    if (contacts.length === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    const campaignId = contacts[0].campaign_id;
    
    // キャンペーンがアクティブな場合、連絡先の削除を拒否
    const campaigns = await db.query('SELECT status FROM campaigns WHERE id = ?', [campaignId]);
    
    if (campaigns[0].status === 'active') {
      return res.status(400).json({ 
        message: 'アクティブなキャンペーンの連絡先は削除できません。キャンペーンを一時停止してから削除してください。' 
      });
    }
    
    // トランザクション開始
    await db.beginTransaction();
    
    try {
      // 通話ログの削除（外部キー制約がある場合）
      await db.query('DELETE FROM call_logs WHERE contact_id = ?', [contactId]);
      
      // 連絡先の削除
      await db.query('DELETE FROM contacts WHERE id = ?', [contactId]);
      
      // キャンペーンの連絡先数を更新
      await db.query(
        'UPDATE campaigns SET contact_count = (SELECT COUNT(*) FROM contacts WHERE campaign_id = ?) WHERE id = ?',
        [campaignId, campaignId]
      );
      
      // トランザクションのコミット
      await db.commit();
      
      res.json({ message: '連絡先を削除しました' });
    } catch (error) {
      // エラー時はロールバック
      await db.rollback();
      throw error;
    }
  } catch (error) {
    logger.error('連絡先削除エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// 複数の連絡先を削除
exports.deleteMultipleContacts = async (req, res) => {
  try {
    const { contactIds } = req.body;
    
    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ message: '削除する連絡先IDのリストが必要です' });
    }
    
    // 連絡先が同じキャンペーンに属しているか確認
    const contacts = await db.query(
      'SELECT DISTINCT campaign_id FROM contacts WHERE id IN (?)',
      [contactIds]
    );
    
    if (contacts.length === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    if (contacts.length > 1) {
      return res.status(400).json({ message: '異なるキャンペーンの連絡先は一括削除できません' });
    }
    
    const campaignId = contacts[0].campaign_id;
    
    // キャンペーンがアクティブな場合、連絡先の削除を拒否
    const campaigns = await db.query('SELECT status FROM campaigns WHERE id = ?', [campaignId]);
    
    if (campaigns[0].status === 'active') {
      return res.status(400).json({ 
        message: 'アクティブなキャンペーンの連絡先は削除できません。キャンペーンを一時停止してから削除してください。' 
      });
    }
    
    // トランザクション開始
    await db.beginTransaction();
    
    try {
      // 通話ログの削除（外部キー制約がある場合）
      await db.query('DELETE FROM call_logs WHERE contact_id IN (?)', [contactIds]);
      
      // 連絡先の削除
      const result = await db.query('DELETE FROM contacts WHERE id IN (?)', [contactIds]);
      
      // キャンペーンの連絡先数を更新
      await db.query(
        'UPDATE campaigns SET contact_count = (SELECT COUNT(*) FROM contacts WHERE campaign_id = ?) WHERE id = ?',
        [campaignId, campaignId]
      );
      
      // トランザクションのコミット
      await db.commit();
      
      res.json({ 
        message: `${result.affectedRows}件の連絡先を削除しました`,
        deleted_count: result.affectedRows
      });
    } catch (error) {
      // エラー時はロールバック
      await db.rollback();
      throw error;
    }
  } catch (error) {
    logger.error('連絡先一括削除エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// DNCリスト（発信拒否リスト）に登録
exports.addToDncList = async (req, res) => {
  try {
    const { phone, reason } = req.body;
    
    if (!phone) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    // 電話番号の正規化（ハイフンを削除）
    const normalizedPhone = phone.replace(/-/g, '');
    
    // 既に登録されているか確認
    const existing = await db.query('SELECT id FROM dnc_list WHERE phone = ?', [normalizedPhone]);
    
    if (existing.length > 0) {
      // 理由を更新
      await db.query(
        'UPDATE dnc_list SET reason = ?, updated_at = NOW() WHERE phone = ?',
        [reason, normalizedPhone]
      );
      
      return res.json({ 
        message: '電話番号は既にDNCリストに登録されています。理由が更新されました。',
        updated: true
      });
    }
    
    // 新規登録
    await db.query(
      'INSERT INTO dnc_list (phone, reason, created_at) VALUES (?, ?, NOW())',
      [normalizedPhone, reason]
    );
    
    // この電話番号を持つすべての連絡先のステータスを更新
    await db.query(
      'UPDATE contacts SET status = "dnc" WHERE phone = ?',
      [normalizedPhone]
    );
    
    res.json({ 
      message: '電話番号がDNCリストに登録されました',
      added: true
    });
  } catch (error) {
    logger.error('DNCリスト登録エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// DNCリストを取得
exports.getDncList = async (req, res) => {
  try {
    const { limit = 100, offset = 0, search } = req.query;
    
    let query = 'SELECT * FROM dnc_list';
    const params = [];
    
    // 検索フィルター
    if (search) {
      query += ' WHERE phone LIKE ?';
      params.push(`%${search}%`);
    }
    
    // 並べ替えとページネーション
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const dncList = await db.query(query, params);
    
    // 総件数を取得
    let countQuery = 'SELECT COUNT(*) as total FROM dnc_list';
    const countParams = [];
    
    if (search) {
      countQuery += ' WHERE phone LIKE ?';
      countParams.push(`%${search}%`);
    }
    
    const countResult = await db.query(countQuery, countParams);
    const total = countResult[0].total;
    
    res.json({
      dnc_list: dncList,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('DNCリスト取得エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// DNCリストから削除
exports.removeFromDncList = async (req, res) => {
  try {
    const { id } = req.params;
    
    // レコードの存在確認
    const dncEntries = await db.query('SELECT id, phone FROM dnc_list WHERE id = ?', [id]);
    
    if (dncEntries.length === 0) {
      return res.status(404).json({ message: 'DNCリストエントリが見つかりません' });
    }
    
    const phone = dncEntries[0].phone;
    
    // DNCリストから削除
    await db.query('DELETE FROM dnc_list WHERE id = ?', [id]);
    
    res.json({ 
      message: '電話番号がDNCリストから削除されました',
      removed: true,
      phone
    });
  } catch (error) {
    logger.error('DNCリスト削除エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// CSVテンプレートのダウンロード
exports.downloadTemplate = (req, res) => {
  const template = 'phone,name,company\n0312345678,山田太郎,株式会社サンプル\n0398765432,佐藤花子,テスト工業\n';
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=contacts_template.csv');
  res.send('\uFEFF' + template); // BOM付きUTF-8
};

// 連絡先のステータス一括更新
exports.batchUpdateStatus = async (req, res) => {
  try {
    const { contactIds, status } = req.body;
    
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ message: '連絡先IDリストが必要です' });
    }
    
    const validStatuses = ['pending', 'completed', 'failed', 'dnc'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: '無効なステータスです' });
    }
    
    await db.query(
      'UPDATE contacts SET status = ? WHERE id IN (?)',
      [status, contactIds]
    );
    
    res.json({ message: 'ステータスを更新しました' });
  } catch (error) {
    logger.error('ステータス一括更新エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};