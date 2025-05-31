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

async function processBatch(batch) {
  if (batch.length === 0) return;
  
  console.log(`バッチ処理開始: ${batch.length}件`);
  
  // 挿入と更新するレコードを分離
  const inserts = batch.filter(contact => contact.action === 'insert');
  const updates = batch.filter(contact => contact.action === 'update');
  
  console.log(`挿入: ${inserts.length}件, 更新: ${updates.length}件`);
  
  const connection = await db.beginTransaction();
  
  try {
    // 挿入処理
    if (inserts.length > 0) {
      // テーブル構造に合わせてクエリを修正
      const insertValues = inserts.map(contact => [
        contact.campaign_id,
        contact.phone,
        contact.name || null,
        contact.company || null,
        'pending',  // status
        null,       // last_attempt
        0,          // attempt_count
        contact.notes || null
      ]);
      
      // INSERT文のカラム名を確認
      await connection.query(`
        INSERT INTO contacts 
        (campaign_id, phone, name, company, status, last_attempt, attempt_count, notes)
        VALUES ?
      `, [insertValues]);
      
      console.log(`${inserts.length}件の連絡先を挿入しました`);
    }
    
    // 更新処理
    for (const contact of updates) {
      // テーブル構造に合わせてクエリを修正
      await connection.query(`
        UPDATE contacts
        SET name = ?, company = ?, notes = ?, updated_at = NOW()
        WHERE id = ?
      `, [
        contact.name || null,
        contact.company || null,
        contact.notes || null,
        contact.id
      ]);
      
      console.log(`連絡先ID ${contact.id} を更新しました`);
    }
    
    await db.commit(connection);
    console.log('トランザクションをコミットしました');
  } catch (error) {
    await db.rollback(connection);
    console.error('バッチ処理エラー:', error);
    throw error;
  }
}

function parseCSVLine(line) {
  // より堅牢なCSV解析
  const result = [];
  let currentValue = '';
  let inQuotes = false;
  let i = 0;
  
  console.log(`解析する行: ${line}`);
  
  while (i < line.length) {
    const char = line[i];
    
    // 引用符内の処理
    if (char === '"') {
      // エスケープされた引用符（""）の処理
      if (i + 1 < line.length && line[i + 1] === '"' && inQuotes) {
        currentValue += '"';
        i += 2;
        continue;
      }
      
      inQuotes = !inQuotes;
      i++;
      continue;
    }
    
    // カンマの処理
    if (char === ',' && !inQuotes) {
      result.push(currentValue);
      currentValue = '';
      i++;
      continue;
    }
    
    // 通常の文字
    currentValue += char;
    i++;
  }
  
  // 最後の値を追加
  result.push(currentValue);
  console.log(`解析結果: ${JSON.stringify(result)}`);
  
  return result;
}

// 電話番号を正規化する関数
function normalizePhoneNumber(phone) {
  // ハイフンや空白を削除
  return phone.replace(/[-\s]/g, '');
}

// キャンペーンに関連する連絡先一覧を取得（エラー処理強化版）
exports.getContactsByCampaign = async (req, res) => {
  try {
    const campaignId = req.params.campaignId;
    console.log(`連絡先一覧取得リクエスト: campaignId=${campaignId}, URL=${req.originalUrl}`);
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    logger.info(`連絡先一覧取得開始: キャンペーンID=${campaignId}, limit=${limit}, offset=${offset}`);
    
    // データベース接続テスト
    try {
      await db.query('SELECT 1 as test');
      console.log('データベース接続テスト成功');
    } catch (dbError) {
      console.error('データベース接続エラー:', dbError);
      return res.status(500).json({
        message: 'データベース接続に失敗しました',
        error: dbError.message
      });
    }

    // キャンペーンの存在確認
    try {
      const [campaigns] = await db.query(
        'SELECT id FROM campaigns WHERE id = ?',
        [campaignId]
      );
      
      if (campaigns.length === 0) {
        logger.warn(`連絡先取得: キャンペーンが見つかりません (ID=${campaignId})`);
        return res.status(404).json({ message: 'キャンペーンが見つかりません' });
      }
      
      logger.info(`キャンペーン確認OK: ID=${campaignId}`);
    } catch (dbError) {
      logger.error(`キャンペーン検索エラー: ${dbError.message}`);
      return res.status(500).json({ 
        message: 'キャンペーン情報の取得に失敗しました', 
        error: dbError.message 
      });
    }
    
    // テーブル存在確認
    try {
      // 連絡先テーブルが存在するか確認
      await db.query('SHOW TABLES LIKE "contacts"');
      logger.info('contactsテーブル確認OK');
    } catch (tableError) {
      logger.error(`contactsテーブル確認エラー: ${tableError.message}`);
      return res.status(500).json({ 
        message: 'contactsテーブルが存在しないか、アクセスできません', 
        error: tableError.message,
        solution: 'データベーススキーマにcontactsテーブルを作成してください' 
      });
    }
    
    // 連絡先一覧を取得
    try {
      const [contacts] = await db.query(`
        SELECT c.*, 
               CASE 
                 WHEN c.status = 'pending' THEN '未発信'
                 WHEN c.status = 'called' THEN '発信中'
                 WHEN c.status = 'completed' THEN '完了'
                 WHEN c.status = 'failed' THEN '失敗'
                 WHEN c.status = 'dnc' THEN 'DNC'
                 ELSE c.status
               END as status_text
        FROM contacts c
        WHERE c.campaign_id = ?
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
      `, [campaignId, limit, offset]);
      
      logger.info(`連絡先リスト取得成功: ${contacts.length}件`);
      
      // 総件数を取得
      const [totalResult] = await db.query(
        'SELECT COUNT(*) as total FROM contacts WHERE campaign_id = ?',
        [campaignId]
      );
      
      // ステータス別の集計
      const [statusStats] = await db.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM contacts
        WHERE campaign_id = ?
        GROUP BY status
      `, [campaignId]);
      
      // ステータス集計をオブジェクトに変換
      const statusCounts = {};
      statusStats.forEach(stat => {
        statusCounts[stat.status] = stat.count;
      });
      
      res.json({
        contacts,
        total: totalResult[0].total,
        page: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(totalResult[0].total / limit),
        limit,
        stats: {
          pending: statusCounts.pending || 0,
          called: statusCounts.called || 0,
          completed: statusCounts.completed || 0,
          failed: statusCounts.failed || 0,
          dnc: statusCounts.dnc || 0
        }
      });
    } catch (contactsError) {
      logger.error(`連絡先リスト取得エラー: ${contactsError.message}`);
      
      // テーブルカラムに問題がある場合の特殊処理
      if (contactsError.message.includes('Unknown column')) {
        return res.status(500).json({ 
          message: 'contactsテーブルのスキーマに問題があります',
          error: contactsError.message,
          solution: 'データベーススキーマを確認し、必要なカラムが存在するか確認してください' 
        });
      }
      
      return res.status(500).json({ 
        message: '連絡先の取得に失敗しました', 
        error: contactsError.message 
      });
    }
  } catch (error) {
    logger.error(`連絡先取得処理全体エラー: ${error.message}`);
    res.status(500).json({ 
      message: '連絡先の取得に失敗しました', 
      error: error.message,
      stack: error.stack
    });
  }
};

// その他のメソッドはそのまま保持... (特に変更なし)
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

     // multerミドルウェアを適用
     await uploadMiddleware(req, res);
    
     console.log('CSVアップロードリクエスト受信:', {
       file: req.file ? {
         originalname: req.file.originalname,
         size: req.file.size,
         mimetype: req.file.mimetype
       } : 'なし',
       body: req.body
     });
     
     if (!req.file) {
       return res.status(400).json({ message: 'ファイルが見つかりません' });
     }
     
     const { campaignId, skipDnc, updateExisting, skipFirstRow } = req.body;
     console.log('CSVアップロードパラメータ:', { campaignId, skipDnc, updateExisting, skipFirstRow });
     
     // ファイル内容をログ出力（デバッグ用）
     const fileContent = req.file.buffer.toString('utf8');
     console.log('CSVファイル内容（先頭500文字）:', fileContent.substring(0, 500));
     
     // 行数をカウント
     const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
     console.log(`CSVファイル行数: ${lines.length}`);
     
     // 最初の数行をデバッグ表示
     lines.slice(0, Math.min(5, lines.length)).forEach((line, i) => {
       console.log(`行 ${i + 1}: ${line}`);
     });

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