// backend/src/routes/contacts.js - 先頭0補完機能付き修正版
const express = require('express');
const router = express.Router();
const multer = require('multer');
const Papa = require('papaparse');
const db = require('../services/database');
const logger = require('../services/logger');

// multer設定
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || 
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('CSVファイルのみアップロード可能です'), false);
    }
  }
});

// 電話番号正規化関数 - 先頭0補完対応版
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  // 文字列に変換して数字以外を除去
  let normalized = String(phone).replace(/[^\d]/g, '');
  
  // 空の場合は空文字を返す
  if (!normalized) return '';
  
  logger.info(`電話番号正規化前: "${phone}" -> 数字のみ: "${normalized}"`);
  
  // 日本の電話番号パターンに基づいて先頭0を補完
  if (normalized.length >= 9 && normalized.length <= 11) {
    // 先頭が0でない場合は0を追加
    if (!normalized.startsWith('0')) {
      // 携帯電話パターン（90, 80, 70で始まる10桁）
      if (normalized.length === 10 && (normalized.startsWith('9') || normalized.startsWith('8') || normalized.startsWith('7'))) {
        normalized = '0' + normalized;
        logger.info(`携帯電話番号として0を補完: "${normalized}"`);
      }
      // 固定電話パターン（地域番号）
      else if (normalized.length === 9 || normalized.length === 10) {
        // 東京03、大阪06、名古屋052など
        if (normalized.match(/^[1-9]/)) {
          normalized = '0' + normalized;
          logger.info(`固定電話番号として0を補完: "${normalized}"`);
        }
      }
    }
  }
  
  // 国際番号の81を除去（81が先頭にある場合）
  if (normalized.startsWith('810')) {
    normalized = normalized.substring(2); // 81を除去して0を残す
    logger.info(`国際番号81を除去: "${normalized}"`);
  } else if (normalized.startsWith('81') && normalized.length > 11) {
    normalized = '0' + normalized.substring(2); // 81を除去して0を追加
    logger.info(`国際番号81を除去して0を補完: "${normalized}"`);
  }
  
  logger.info(`電話番号正規化完了: "${phone}" -> "${normalized}"`);
  return normalized;
}

// 電話番号バリデーション関数
function validatePhoneNumber(phone) {
  const normalized = normalizePhoneNumber(phone);
  
  if (!normalized) {
    return { valid: false, message: '電話番号が空です', normalized: '' };
  }
  
  // 長さチェック
  if (normalized.length < 10 || normalized.length > 11) {
    return { 
      valid: false, 
      message: `電話番号の桁数が不正です（${normalized.length}桁）。10-11桁で入力してください。`,
      normalized: normalized
    };
  }
  
  // 先頭0チェック
  if (!normalized.startsWith('0')) {
    return { 
      valid: false, 
      message: '日本の電話番号は0で始まる必要があります',
      normalized: normalized
    };
  }
  
  // パターンチェック
  const patterns = [
    /^0[1-9]\d{8,9}$/, // 固定電話 (010-1234-5678 など)
    /^0[789]0\d{8}$/,  // 携帯電話 (090-1234-5678 など)
    /^050\d{8}$/,      // IP電話 (050-1234-5678)
    /^0120\d{6,7}$/,   // フリーダイヤル
    /^0800\d{7}$/      // フリーアクセス
  ];
  
  const isValid = patterns.some(pattern => pattern.test(normalized));
  
  if (!isValid) {
    return { 
      valid: false, 
      message: `電話番号の形式が不正です: ${normalized}`,
      normalized: normalized
    };
  }
  
  return { valid: true, normalized: normalized, message: 'OK' };
}

// CSVアップロードエンドポイント - 先頭0補完対応版
router.post('/campaigns/:campaignId/contacts/upload', upload.single('file'), async (req, res) => {
  const campaignId = req.params.campaignId;
  
  logger.info('🚀 CSVアップロード開始', {
    campaignId,
    fileSize: req.file ? req.file.size : 0,
    hasHeader: req.body.hasHeader,
    skipEmptyLines: req.body.skipEmptyLines,
    delimiter: req.body.delimiter || 'auto',
    timestamp: new Date().toISOString()
  });
  
  try {
    // 1. ファイル存在確認
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: 'CSVファイルが添付されていません' 
      });
    }
    
    // 2. キャンペーン存在確認
    const [campaigns] = await db.query('SELECT id FROM campaigns WHERE id = ?', [campaignId]);
    if (campaigns.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'キャンペーンが見つかりません' 
      });
    }
    
    // 3. CSVファイル解析
    const csvText = req.file.buffer.toString('utf8');
    
    logger.info('📄 CSVファイル内容:', {
      totalLength: csvText.length,
      firstLine: csvText.split('\n')[0],
      totalLines: csvText.split('\n').length
    });
    
    // Papa Parse設定
    const parseConfig = {
      header: req.body.hasHeader !== 'false',
      skipEmptyLines: req.body.skipEmptyLines !== 'false',
      delimiter: req.body.delimiter === 'auto' ? '' : req.body.delimiter,
      encoding: 'utf8',
      transform: function(value) {
        return value ? String(value).trim() : '';
      }
    };
    
    const parseResult = Papa.parse(csvText, parseConfig);
    
    if (parseResult.errors.length > 0) {
      logger.warn('CSV解析警告:', parseResult.errors);
    }
    
    logger.info(`CSV解析完了: ${parseResult.data.length}行のデータ`);
    
    // 4. データ正規化
    let contacts = [];
    
    if (parseConfig.header) {
      // ヘッダーありの場合
      contacts = parseResult.data.map((row, index) => {
        const phoneValue = row.phone || row.電話番号 || row.tel || row.Phone || row.TEL || '';
        const nameValue = row.name || row.名前 || row.氏名 || row.Name || row.お名前 || '';
        const companyValue = row.company || row.会社名 || row.企業名 || row.Company || row.所属 || '';
        
        logger.info(`行${index + 1}（ヘッダーあり）:`, {
          original: row,
          normalized: { phone: phoneValue, name: nameValue, company: companyValue }
        });
        
        return {
          phone: phoneValue,
          name: nameValue,
          company: companyValue
        };
      });
    } else {
      // ヘッダーなしの場合
      contacts = parseResult.data.map((row, index) => {
        const rowArray = Array.isArray(row) ? row : Object.values(row);
        const contact = {
          phone: rowArray[0] || '',
          name: rowArray[1] || '',
          company: rowArray[2] || ''
        };
        
        logger.info(`行${index + 1}（ヘッダーなし）:`, {
          original: row,
          rowArray: rowArray,
          normalized: contact
        });
        
        return contact;
      });
    }
    
    // 5. バリデーションと正規化 - 先頭0補完対応版
    const validContacts = [];
    const invalidContacts = [];
    const phoneCorrections = []; // 修正内容の記録
    
    contacts.forEach((contact, index) => {
      const originalPhone = contact.phone;
      
      // 電話番号のバリデーションと正規化
      const validation = validatePhoneNumber(originalPhone);
      
      if (!validation.valid) {
        logger.info(`行${index + 1}: ${validation.message} - 元データ: "${originalPhone}"`);
        invalidContacts.push({
          index: index + 1,
          reason: validation.message,
          originalPhone: originalPhone,
          data: contact
        });
        return;
      }
      
      // 先頭0が補完された場合の記録
      if (originalPhone !== validation.normalized) {
        phoneCorrections.push({
          index: index + 1,
          original: originalPhone,
          corrected: validation.normalized,
          type: '先頭0補完'
        });
        logger.info(`行${index + 1}: 電話番号修正 "${originalPhone}" -> "${validation.normalized}"`);
      }
      
      // 正規化された電話番号を設定
      contact.phone = validation.normalized;
      validContacts.push(contact);
      
      logger.info(`行${index + 1}: 有効データ - "${originalPhone}" -> "${validation.normalized}"`);
    });
    
    logger.info(`バリデーション結果: 有効=${validContacts.length}, 無効=${invalidContacts.length}, 修正=${phoneCorrections.length}`);
    
    if (validContacts.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: '有効な連絡先データが見つかりませんでした',
        invalidContacts: invalidContacts,
        suggestions: [
          '電話番号が正しい形式で入力されているか確認してください',
          '先頭の0が削除されている場合は、システムが自動補完します',
          '例: 9012345678 → 09012345678, 312345678 → 0312345678'
        ]
      });
    }
    
    // 6. 重複チェック - 正規化後の番号で比較
    logger.info('🔍 重複チェック開始...');
    
    const [existingRows] = await db.query(
      'SELECT phone FROM contacts WHERE campaign_id = ?',
      [campaignId]
    );
    
    const existingPhones = new Set();
    existingRows.forEach(row => {
      const validatedExisting = validatePhoneNumber(row.phone);
      if (validatedExisting.valid) {
        existingPhones.add(validatedExisting.normalized);
        logger.info(`既存電話番号: "${row.phone}" -> 正規化: "${validatedExisting.normalized}"`);
      }
    });
    
    logger.info(`既存電話番号数: ${existingPhones.size}`);
    
    const newContacts = [];
    const duplicateContacts = [];
    const newPhoneSet = new Set();
    
    validContacts.forEach((contact, index) => {
      const normalizedPhone = contact.phone;
      
      // 既存データとの重複チェック
      if (existingPhones.has(normalizedPhone)) {
        logger.info(`重複検出（既存）: ${normalizedPhone}`);
        duplicateContacts.push({
          index: index + 1,
          reason: '既存データと重複',
          phone: normalizedPhone
        });
        return;
      }
      
      // 同一CSV内での重複チェック
      if (newPhoneSet.has(normalizedPhone)) {
        logger.info(`重複検出（CSV内）: ${normalizedPhone}`);
        duplicateContacts.push({
          index: index + 1,
          reason: 'CSV内で重複',
          phone: normalizedPhone
        });
        return;
      }
      
      newPhoneSet.add(normalizedPhone);
      newContacts.push(contact);
      logger.info(`新規データ追加: ${normalizedPhone}`);
    });
    
    logger.info(`重複チェック完了: 新規=${newContacts.length}, 重複=${duplicateContacts.length}`);
    
    // 7. データベース挿入
    let insertedCount = 0;
    
    if (newContacts.length > 0) {
      logger.info(`💾 データベース挿入開始: ${newContacts.length}件`);
      
      try {
        await db.query('START TRANSACTION');
        
        for (const contact of newContacts) {
          const [result] = await db.query(
            'INSERT INTO contacts (campaign_id, phone, name, company, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [campaignId, contact.phone, contact.name || '', contact.company || '', 'pending']
          );
          
          if (result.affectedRows > 0) {
            insertedCount++;
            logger.info(`挿入成功: ${contact.phone} (${contact.name || '名前なし'})`);
          }
        }
        
        await db.query('COMMIT');
        logger.info(`✅ 全件挿入完了: ${insertedCount}件`);
        
      } catch (dbError) {
        await db.query('ROLLBACK');
        logger.error('データベース挿入エラー:', dbError);
        throw dbError;
      }
    }
    
    // 8. キャンペーン進捗更新
    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM contacts WHERE campaign_id = ?',
      [campaignId]
    );
    
    const [completedResult] = await db.query(
      'SELECT COUNT(*) as completed FROM contacts WHERE campaign_id = ? AND status IN ("completed", "failed", "dnc")',
      [campaignId]
    );
    
    const totalContacts = countResult[0].total;
    const completedContacts = completedResult[0].completed;
    const progress = totalContacts > 0 ? Math.round((completedContacts / totalContacts) * 100) : 0;
    
    await db.query(
      'UPDATE campaigns SET progress = ?, updated_at = NOW() WHERE id = ?',
      [progress, campaignId]
    );
    
    // 9. レスポンス
    const response = {
      success: true,
      message: `CSVファイルから ${insertedCount} 件の連絡先を取り込みました`,
      imported: insertedCount,
      duplicates: duplicateContacts.length,
      invalid: invalidContacts.length,
      phoneCorrections: phoneCorrections.length,
      totalContacts: totalContacts,
      progress: progress,
      campaignId: parseInt(campaignId),
      details: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        csvRows: parseResult.data.length,
        validRows: validContacts.length,
        corrections: phoneCorrections.slice(0, 10), // 最初の10件の修正内容
        duplicateList: duplicateContacts.slice(0, 10), // 最初の10件のみ
        invalidList: invalidContacts.slice(0, 10)      // 最初の10件のみ
      }
    };
    
    logger.info('CSVアップロード完了', {
      campaignId,
      取り込み: insertedCount,
      重複: duplicateContacts.length,
      エラー: invalidContacts.length,
      修正: phoneCorrections.length
    });
    
    res.json(response);
    
  } catch (error) {
    logger.error('🔥 CSVアップロードエラー:', error);
    
    let errorMessage = 'CSVファイルの処理中にエラーが発生しました';
    let statusCode = 500;
    
    if (error.message.includes('ER_NO_SUCH_TABLE')) {
      errorMessage = 'データベーステーブルが見つかりません';
    } else if (error.message.includes('ER_DUP_ENTRY')) {
      errorMessage = '重複した連絡先があります';
    } else if (error.message.includes('CSVファイルのみ')) {
      errorMessage = error.message;
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 電話番号テスト用エンドポイント
router.post('/campaigns/:campaignId/contacts/test-phone', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ message: '電話番号が必要です' });
    }
    
    const validation = validatePhoneNumber(phone);
    
    res.json({
      inputPhone: phone,
      validation: validation,
      normalized: validation.valid ? validation.normalized : null,
      corrected: phone !== validation.normalized
    });
    
  } catch (error) {
    logger.error('電話番号テストエラー:', error);
    res.status(500).json({ message: 'テストに失敗しました' });
  }
});

// 既存のデータ確認用エンドポイント
router.get('/campaigns/:campaignId/contacts/existing', async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const [contacts] = await db.query(
      'SELECT id, phone, name, company, created_at FROM contacts WHERE campaign_id = ? ORDER BY created_at DESC',
      [campaignId]
    );
    
    // 電話番号の正規化状況も表示
    const contactsWithNormalized = contacts.map(contact => {
      const validation = validatePhoneNumber(contact.phone);
      return {
        ...contact,
        normalizedPhone: validation.normalized,
        phoneValid: validation.valid
      };
    });
    
    res.json({
      campaignId: parseInt(campaignId),
      totalContacts: contacts.length,
      contacts: contactsWithNormalized
    });
    
  } catch (error) {
    logger.error('既存データ取得エラー:', error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// 重複チェックテスト用エンドポイント
router.post('/campaigns/:campaignId/contacts/check-duplicate', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ message: '電話番号が必要です' });
    }
    
    const validation = validatePhoneNumber(phone);
    
    if (!validation.valid) {
      return res.json({
        inputPhone: phone,
        normalizedPhone: validation.normalized,
        valid: false,
        message: validation.message,
        exactMatch: false,
        normalizedMatch: false
      });
    }
    
    const normalizedPhone = validation.normalized;
    
    const [existing] = await db.query(
      'SELECT id, phone FROM contacts WHERE campaign_id = ? AND phone = ?',
      [campaignId, normalizedPhone]
    );
    
    // 正規化による検索も実行
    const [allExisting] = await db.query(
      'SELECT id, phone FROM contacts WHERE campaign_id = ?',
      [campaignId]
    );
    
    const normalizedMatches = allExisting.filter(contact => {
      const contactValidation = validatePhoneNumber(contact.phone);
      return contactValidation.valid && contactValidation.normalized === normalizedPhone;
    });
    
    res.json({
      inputPhone: phone,
      normalizedPhone: normalizedPhone,
      valid: validation.valid,
      corrected: phone !== normalizedPhone,
      exactMatch: existing.length > 0,
      normalizedMatch: normalizedMatches.length > 0,
      exactResults: existing,
      normalizedResults: normalizedMatches
    });
    
  } catch (error) {
    logger.error('重複チェックエラー:', error);
    res.status(500).json({ message: 'チェックに失敗しました' });
  }
});

// 連絡先一覧取得
router.get('/campaigns/:campaignId/contacts', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { page = 1, limit = 20, status, search } = req.query;
    
    logger.info(`連絡先一覧取得: Campaign=${campaignId}, Page=${page}, Limit=${limit}`);
    
    const [campaigns] = await db.query('SELECT id, name FROM campaigns WHERE id = ?', [campaignId]);
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    let whereClause = 'WHERE c.campaign_id = ?';
    let queryParams = [campaignId];
    
    if (status) {
      whereClause += ' AND c.status = ?';
      queryParams.push(status);
    }
    
    if (search) {
      whereClause += ' AND (c.phone LIKE ? OR c.name LIKE ? OR c.company LIKE ?)';
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const dataQuery = `
      SELECT c.*
      FROM contacts c
      ${whereClause}
     ORDER BY c.created_at DESC
     LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM contacts c
      ${whereClause}
    `;
    
    const [contacts] = await db.query(dataQuery, queryParams);
    const [countResult] = await db.query(countQuery, queryParams);
    
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / parseInt(limit));
    
    logger.info(`連絡先取得結果: Campaign=${campaignId}, 件数=${contacts.length}, 全体=${total}`);
    
    res.json({
      contacts: contacts || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      },
      campaign: {
        id: parseInt(campaignId),
        name: campaigns[0].name
      }
    });
    
  } catch (error) {
    logger.error('連絡先一覧取得エラー:', error);
    res.status(500).json({ message: 'データの取得に失敗しました' });
  }
});

// 連絡先削除
router.delete('/campaigns/:campaignId/contacts/:contactId', async (req, res) => {
  try {
    const { campaignId, contactId } = req.params;
    
    logger.info(`🗑️ 連絡先削除: Campaign=${campaignId}, Contact=${contactId}`);
    
    const [result] = await db.query(
      'DELETE FROM contacts WHERE id = ? AND campaign_id = ?',
      [contactId, campaignId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    logger.info('✅ 連絡先削除完了');
    
    res.json({ 
      success: true,
      message: '連絡先を削除しました' 
    });
    
  } catch (error) {
    logger.error('連絡先削除エラー:', error);
    res.status(500).json({ message: '削除に失敗しました' });
  }
});

// 連絡先一括削除
router.delete('/campaigns/:campaignId/contacts', async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    logger.info(`🗑️ 連絡先一括削除: Campaign=${campaignId}`);
    
    const [result] = await db.query(
      'DELETE FROM contacts WHERE campaign_id = ?',
      [campaignId]
    );
    
    logger.info(`✅ 連絡先一括削除完了: ${result.affectedRows}件`);
    
    res.json({ 
      success: true,
      message: `${result.affectedRows}件の連絡先を削除しました`,
      deleted: result.affectedRows
    });
    
  } catch (error) {
    logger.error('連絡先一括削除エラー:', error);
    res.status(500).json({ message: '一括削除に失敗しました' });
  }
});

// 連絡先ステータス更新
router.patch('/campaigns/:campaignId/contacts/:contactId', async (req, res) => {
  try {
    const { campaignId, contactId } = req.params;
    const { status, notes } = req.body;
    
    logger.info(`📝 連絡先ステータス更新: Campaign=${campaignId}, Contact=${contactId}, Status=${status}`);
    
    const [result] = await db.query(
      'UPDATE contacts SET status = ?, notes = ?, updated_at = NOW() WHERE id = ? AND campaign_id = ?',
      [status, notes || null, contactId, campaignId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    logger.info('✅ 連絡先ステータス更新完了');
    
    res.json({ 
      success: true,
      message: 'ステータスを更新しました' 
    });
    
  } catch (error) {
    logger.error('連絡先ステータス更新エラー:', error);
    res.status(500).json({ message: 'ステータス更新に失敗しました' });
  }
});

module.exports = router;
