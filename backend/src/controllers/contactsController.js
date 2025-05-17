// backend/src/controllers/contactsController.js
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const createCsvStringifier = require('csv-writer').createObjectCsvStringifier;
const multer = require('multer');
const { promisify } = require('util');
const { Readable } = require('stream');
const db = require('../services/database');
const logger = require('../services/logger');

// CSVアップロード用のmulter設定
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB制限
});

// ファイルアップロードミドルウェアをPromisifyする
const uploadMiddleware = promisify(upload.single('file'));

// 連絡先のCSVアップロード
exports.uploadContacts = async (req, res) => {
  try {
    // multerミドルウェアを適用
    await uploadMiddleware(req, res);
    
    if (!req.file) {
      return res.status(400).json({ message: 'ファイルが見つかりません' });
    }
    
    const { campaignId, skipDnc, updateExisting, skipFirstRow } = req.body;
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
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
    
    if (mappings.phone === undefined) {
      return res.status(400).json({ message: '電話番号フィールドのマッピングが必要です' });
    }
    
    // DNCリストの取得（スキップしない場合）
    let dncList = new Set();
    if (skipDnc !== 'true') {
      const dncResults = await db.query('SELECT phone FROM dnc_list');
      dncList = new Set(dncResults.map(item => normalizePhoneNumber(item.phone)));
    }
    
    // ファイル処理
    const fileBuffer = req.file.buffer;
    const fileContent = fileBuffer.toString('utf8');
    
    // 行を解析
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
    
    // ヘッダー行
    let headers = [];
    if (lines.length > 0) {
      headers = parseCSVLine(lines[0]);
    } else {
      return res.status(400).json({ message: 'ファイルにデータがありません' });
    }
    
    // 既存の連絡先を確認（更新する場合）
    let existingContacts = new Map();
    if (updateExisting === 'true') {
      const existingResults = await db.query(
        'SELECT id, phone FROM contacts WHERE campaign_id = ?',
        [campaignId]
      );
      
      existingContacts = new Map(
        existingResults.map(contact => [normalizePhoneNumber(contact.phone), contact.id])
      );
    }
    
    // 結果集計用の変数
    let totalCount = 0;
    let skipCount = 0;
    let dncCount = 0;
    let successCount = 0;
    let updateCount = 0;
    let errorCount = 0;
    let errors = [];
    
    // 開始行のインデックス（ヘッダーをスキップするかどうか）
    const startIndex = skipFirstRow === 'true' ? 1 : 0;
    
    // 連絡先をバッチ処理するための配列
    const contactBatch = [];
    const maxBatchSize = 1000; // 一度に処理する最大レコード数
    
    // 各行を処理
    for (let i = startIndex; i < lines.length; i++) {
      totalCount++;
      
      try {
        // 行のデータを解析
        const rowData = parseCSVLine(lines[i]);
        
        // 電話番号を取得
        const phoneIndex = parseInt(mappings.phone);
        if (isNaN(phoneIndex) || phoneIndex >= rowData.length) {
          throw new Error('マッピングされた電話番号フィールドが見つかりません');
        }
        
        let phone = rowData[phoneIndex].trim();
        
        // 電話番号の検証
        if (!phone) {
          skipCount++;
          continue;
        }
        
        // 電話番号を正規化
        const normalizedPhone = normalizePhoneNumber(phone);
        
        // DNCリストとの照合
        if (dncList.has(normalizedPhone)) {
          dncCount++;
          continue;
        }
        
        // 連絡先データの構築
        const contactData = {
          phone: normalizedPhone,
          name: mappings.name !== undefined ? rowData[mappings.name].trim() : null,
          company: mappings.company !== undefined ? rowData[mappings.company].trim() : null,
          email: mappings.email !== undefined ? rowData[mappings.email].trim() : null,
          notes: mappings.notes !== undefined ? rowData[mappings.notes].trim() : null,
          custom1: mappings.custom1 !== undefined ? rowData[mappings.custom1].trim() : null,
          custom2: mappings.custom2 !== undefined ? rowData[mappings.custom2].trim() : null,
          campaign_id: campaignId,
          status: 'pending',
          created_at: new Date(),
          updated_at: new Date()
        };
        
        // 既存の連絡先があれば更新、なければ挿入
        if (existingContacts.has(normalizedPhone)) {
          if (updateExisting === 'true') {
            contactData.id = existingContacts.get(normalizedPhone);
            contactData.action = 'update';
            updateCount++;
          } else {
            skipCount++;
            continue;
          }
        } else {
          contactData.action = 'insert';
          successCount++;
        }
        
        // バッチに追加
        contactBatch.push(contactData);
        
        // バッチサイズに達したら処理
        if (contactBatch.length >= maxBatchSize) {
          await processBatch(contactBatch);
          contactBatch.length = 0; // バッチをクリア
        }
      } catch (error) {
        errorCount++;
        errors.push(`行 ${i + 1}: ${error.message}`);
        
        // エラーが多すぎる場合は処理を中断
        if (errorCount > 100) {
          errors.push('エラーが多すぎるため処理を中断しました');
          break;
        }
      }
    }
    
    // 残りのバッチを処理
    if (contactBatch.length > 0) {
      await processBatch(contactBatch);
    }
    
    res.json({
      message: `${successCount}件の連絡先をインポートしました`,
      total: totalCount,
      success: successCount,
      updated: updateCount,
      skipped: skipCount,
      dnc: dncCount,
      errors: errorCount,
      error_details: errors.slice(0, 10) // 最初の10件のエラーのみ返す
    });
  } catch (error) {
    logger.error('連絡先アップロードエラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// バッチ処理関数
async function processBatch(batch) {
  if (batch.length === 0) return;
  
  // 挿入と更新するレコードを分離
  const inserts = batch.filter(contact => contact.action === 'insert');
  const updates = batch.filter(contact => contact.action === 'update');
  
  const connection = await db.beginTransaction();
  
  try {
    // 挿入処理
    if (inserts.length > 0) {
      const insertValues = inserts.map(contact => [
        contact.campaign_id,
        contact.phone,
        contact.name,
        contact.company,
        contact.email,
        contact.notes,
        contact.custom1,
        contact.custom2,
        contact.status,
        contact.created_at,
        contact.updated_at
      ]);
      
      await connection.query(`
        INSERT INTO contacts 
        (campaign_id, phone, name, company, email, notes, custom1, custom2, status, created_at, updated_at)
        VALUES ?
      `, [insertValues]);
    }
    
    // 更新処理
    for (const contact of updates) {
      await connection.query(`
        UPDATE contacts 
        SET name = ?, company = ?, email = ?, notes = ?, custom1 = ?, custom2 = ?, updated_at = ?
        WHERE id = ?
      `, [
        contact.name,
        contact.company,
        contact.email,
        contact.notes,
        contact.custom1,
        contact.custom2,
        contact.updated_at,
        contact.id
      ]);
    }
    
    await db.commit(connection);
  } catch (error) {
    await db.rollback(connection);
    throw error;
  }
}

// CSVの行を解析する関数
function parseCSVLine(line) {
  const result = [];
  let inQuotes = false;
  let currentValue = '';
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
    
    i++;
  }
  
  // 最後の値を追加
  result.push(currentValue);
  
  return result;
}

// 電話番号を正規化する関数
function normalizePhoneNumber(phone) {
  // ハイフンや空白を削除
  return phone.replace(/[-\s]/g, '');
}

// キャンペーンの連絡先一覧を取得
exports.getContactsByCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { status, search, limit = 100, offset = 0 } = req.query;
    
    // クエリパラメータの検証
    if (isNaN(parseInt(campaignId))) {
      return res.status(400).json({ message: 'キャンペーンIDは数値である必要があります' });
    }
    
    // キャンペーンの存在確認
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // 連絡先クエリの構築
    let query = `
      SELECT * FROM contacts 
      WHERE campaign_id = ?
    `;
    
    const queryParams = [campaignId];
    
    // ステータスフィルター
    if (status) {
      query += ' AND status = ?';
      queryParams.push(status);
    }
    
    // 検索フィルター
    if (search) {
      query += ' AND (phone LIKE ? OR name LIKE ? OR company LIKE ?)';
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    // カウントクエリを実行
    const countQuery = `
      SELECT COUNT(*) as total FROM contacts 
      WHERE campaign_id = ?
      ${status ? ' AND status = ?' : ''}
      ${search ? ' AND (phone LIKE ? OR name LIKE ? OR company LIKE ?)' : ''}
    `;
    
    const [countResult] = await db.query(countQuery, queryParams);
    const total = countResult[0].total;
    
    // メインクエリにページネーションを追加
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), parseInt(offset));
    
    // 連絡先データを取得
    const contacts = await db.query(query, queryParams);
    
    res.json({
      contacts,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('連絡先取得エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// 特定の連絡先を取得
exports.getContactById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 連絡先を取得
    const [contacts] = await db.query(
      'SELECT * FROM contacts WHERE id = ?',
      [id]
    );
    
    if (contacts.length === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    // 通話履歴も取得
    const callLogs = await db.query(`
      SELECT cl.*, cid.number as caller_id_number 
      FROM call_logs cl
      LEFT JOIN caller_ids cid ON cl.caller_id_id = cid.id
      WHERE cl.contact_id = ?
      ORDER BY cl.start_time DESC
    `, [id]);
    
    res.json({
      contact: contacts[0],
      callLogs
    });
  } catch (error) {
    logger.error('連絡先詳細取得エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// 連絡先を更新
exports.updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const { phone, name, company, email, notes, custom1, custom2, status } = req.body;
    
    // 電話番号の検証
    if (!phone) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    // DNCリストと照合
    const [dncResults] = await db.query(
      'SELECT id FROM dnc_list WHERE phone = ?',
      [normalizePhoneNumber(phone)]
    );
    
    if (dncResults.length > 0 && status !== 'dnc') {
      return res.status(400).json({ 
        message: 'この電話番号はDNCリストに登録されています',
        dnc: true
      });
    }
    
    // 連絡先を更新
    const [result] = await db.query(`
      UPDATE contacts
      SET phone = ?, name = ?, company = ?, email = ?, notes = ?, 
          custom1 = ?, custom2 = ?, status = ?, updated_at = NOW()
      WHERE id = ?
    `, [
      normalizePhoneNumber(phone), name, company, email, notes, 
      custom1, custom2, status, id
    ]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    // 更新後の連絡先を取得
    const [contacts] = await db.query(
      'SELECT * FROM contacts WHERE id = ?',
      [id]
    );
    
    res.json(contacts[0]);
  } catch (error) {
    logger.error('連絡先更新エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// 連絡先を削除
exports.deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 連絡先を削除
    const [result] = await db.query(
      'DELETE FROM contacts WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    res.json({ message: '連絡先を削除しました', id });
  } catch (error) {
    logger.error('連絡先削除エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// 複数の連絡先を削除
exports.deleteMultipleContacts = async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: '削除するIDが指定されていません' });
    }
    
    // 連絡先を削除
    const [result] = await db.query(
      'DELETE FROM contacts WHERE id IN (?)',
      [ids]
    );
    
    res.json({ 
      message: `${result.affectedRows}件の連絡先を削除しました`,
      deletedCount: result.affectedRows
    });
  } catch (error) {
    logger.error('複数連絡先削除エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// DNCリストに登録
exports.addToDncList = async (req, res) => {
  try {
    const { phone, reason, contactId } = req.body;
    
    if (!phone) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    const normalizedPhone = normalizePhoneNumber(phone);
    
    // DNCリストに追加
    await db.query(
      'INSERT IGNORE INTO dnc_list (phone, reason, created_at) VALUES (?, ?, NOW())',
      [normalizedPhone, reason || 'ユーザー登録']
    );
    
    // 連絡先のステータスを更新（指定されている場合）
    if (contactId) {
      await db.query(
        'UPDATE contacts SET status = "dnc", updated_at = NOW() WHERE id = ?',
        [contactId]
      );
    }
    
    res.json({ 
      message: 'DNCリストに追加しました',
      phone: normalizedPhone
    });
  } catch (error) {
    logger.error('DNC追加エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// DNCリストを取得
exports.getDncList = async (req, res) => {
  try {
    const { search, limit = 100, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM dnc_list';
    const params = [];
    
    // 検索フィルター
    if (search) {
      query += ' WHERE phone LIKE ?';
      params.push(`%${search}%`);
    }
    
    // カウントクエリを実行
    const countQuery = `SELECT COUNT(*) as total FROM dnc_list ${search ? 'WHERE phone LIKE ?' : ''}`;
    const [countResult] = await db.query(countQuery, search ? [`%${search}%`] : []);
    const total = countResult[0].total;
    
    // メインクエリにページネーションを追加
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    // DNCリストを取得
    const dncList = await db.query(query, params);
    
    res.json({
      dnc_list: dncList,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
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
    
    // DNCリストから削除
    const [result] = await db.query(
      'DELETE FROM dnc_list WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'DNCリストエントリが見つかりません' });
    }
    
    res.json({ message: 'DNCリストから削除しました', id });
  } catch (error) {
    logger.error('DNCリスト削除エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// DNCリストのCSVインポート
exports.importDncList = async (req, res) => {
  try {
    // multerミドルウェアを適用
    await uploadMiddleware(req, res);
    
    if (!req.file) {
      return res.status(400).json({ message: 'ファイルが見つかりません' });
    }
    
    // ファイル処理
    const fileBuffer = req.file.buffer;
    const fileContent = fileBuffer.toString('utf8');
    
    // 行を解析
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
    
    // 電話番号のカラムインデックスを指定
    const phoneColumnIndex = req.body.phoneColumn || 0;
    const reasonColumnIndex = req.body.reasonColumn || 1;
    const skipHeader = req.body.skipHeader === 'true';
    
    // 処理開始行
    const startRow = skipHeader ? 1 : 0;
    
    // 結果集計用の変数
    let totalCount = 0;
    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    let errors = [];
    
    // 既存のDNC電話番号を取得
    const existingDnc = await db.query('SELECT phone FROM dnc_list');
    const existingPhones = new Set(existingDnc.map(item => normalizePhoneNumber(item.phone)));
    
    // DNCエントリをバッチ処理するための配列
    const dncBatch = [];
    const maxBatchSize = 1000;
    
    // 各行を処理
    for (let i = startRow; i < lines.length; i++) {
      totalCount++;
      
      try {
        // 行のデータを解析
        const rowData = parseCSVLine(lines[i]);
        
        // 電話番号を取得
        if (phoneColumnIndex >= rowData.length) {
          throw new Error('電話番号カラムが見つかりません');
        }
        
        let phone = rowData[phoneColumnIndex].trim();
        
        // 電話番号の検証
        if (!phone) {
          throw new Error('電話番号が空です');
        }
        
        // 電話番号を正規化
        const normalizedPhone = normalizePhoneNumber(phone);
        
        // 重複チェック
        if (existingPhones.has(normalizedPhone)) {
          duplicateCount++;
          continue;
        }
        
        // 理由を取得（オプション）
        let reason = '';
        if (reasonColumnIndex < rowData.length) {
          reason = rowData[reasonColumnIndex].trim();
        }
        
        // DNエントリーを追加
        dncBatch.push({
          phone: normalizedPhone,
          reason: reason || 'CSVインポート',
          created_at: new Date()
        });
        
        // 既存セットに追加
        existingPhones.add(normalizedPhone);
        successCount++;
        
        // バッチサイズに達したら処理
        if (dncBatch.length >= maxBatchSize) {
          await processDncBatch(dncBatch);
          dncBatch.length = 0;
        }
      } catch (error) {
        errorCount++;
        errors.push(`行 ${i + 1}: ${error.message}`);
        
        // エラーが多すぎる場合は処理を中断
        if (errorCount > 100) {
          errors.push('エラーが多すぎるため処理を中断しました');
          break;
        }
      }
    }
    
    // 残りのバッチを処理
    if (dncBatch.length > 0) {
      await processDncBatch(dncBatch);
    }
    
    res.json({
      message: `${successCount}件の電話番号をDNCリストにインポートしました`,
      total: totalCount,
      success: successCount,
      duplicates: duplicateCount,
      errors: errorCount,
      error_details: errors.slice(0, 10)
    });
  } catch (error) {
    logger.error('DNCインポートエラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// DNCバッチ処理関数
async function processDncBatch(batch) {
  if (batch.length === 0) return;
  
  const connection = await db.beginTransaction();
  
  try {
    const values = batch.map(item => [
      item.phone,
      item.reason,
      item.created_at
    ]);
    
    await connection.query(`
      INSERT IGNORE INTO dnc_list 
      (phone, reason, created_at)
      VALUES ?
    `, [values]);
    
    await db.commit(connection);
  } catch (error) {
    await db.rollback(connection);
    throw error;
  }
}

// DNCリストをエクスポート
exports.exportDncList = async (req, res) => {
  try {
    // DNCリストを取得
    const dncList = await db.query('SELECT * FROM dnc_list ORDER BY created_at DESC');
    
    // CSVヘッダーの設定
    const csvStringifier = createCsvStringifier({
      header: [
        { id: 'phone', title: '電話番号' },
        { id: 'reason', title: '理由' },
        { id: 'created_at', title: '登録日時' }
      ]
    });
    
    // ヘッダーを含めたCSVデータを生成
    const csvData = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(dncList);
    
    // CSVファイルとしてレスポンスを設定
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=dnc_list_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send('\uFEFF' + csvData); // BOMを追加してUTF-8でエクスポート
  } catch (error) {
    logger.error('DNCエクスポートエラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};