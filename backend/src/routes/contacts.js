// backend/src/routes/contacts.js
const express = require('express');
// mergeParams: true を追加して親ルーターのパラメータを継承
const router = express.Router({ mergeParams: true });

const db = require('../services/database');

// multerのインポートと設定
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// アップロードディレクトリの確保
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ストレージ設定
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});

const upload = multer({ storage: storage });

// すべてのルートで認証ミドルウェアを適用


// 連絡先一覧を取得
router.get('/', async (req, res) => {
  try {
    const { campaignId } = req.params;
    console.log(`連絡先一覧取得: キャンペーンID=${campaignId}`);
    
    // データベースから連絡先を取得
    const [contacts] = await db.query(
      'SELECT * FROM contacts WHERE campaign_id = ? LIMIT 10',
      [campaignId]
    );
    
    res.json(contacts);
  } catch (error) {
    console.error('連絡先取得エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

// 連絡先をCSVアップロードするエンドポイント
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    console.log(`連絡先アップロードリクエスト: キャンペーンID=${campaignId}`, {
      file: req.file ? {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size
      } : 'なし',
      body: req.body
    });
    
    if (!req.file) {
      return res.status(400).json({ message: 'ファイルがアップロードされていません' });
    }
    
    // リクエストボディからオプションを解析
    const skipFirstRow = req.body.skipFirstRow === 'true';
    const updateExisting = req.body.updateExisting === 'true';
    const skipDnc = req.body.skipDnc === 'true';
    
    let mappings;
    try {
      mappings = JSON.parse(req.body.mappings || '{}');
      console.log('マッピング情報:', mappings);
    } catch (error) {
      return res.status(400).json({ message: 'マッピング情報が無効です: ' + error.message });
    }
    
    // CSVファイルを処理（簡易処理）
    const fs = require('fs');
    const fileContent = fs.readFileSync(req.file.path, 'utf8');
    const rows = fileContent.split('\n');
    
    const contacts = [];
    let headerRow = null;
    let processedRows = 0;
    let importedCount = 0;
    
    // CSV処理ロジック
    for (let i = 0; i < rows.length; i++) {
      if (i === 0 && skipFirstRow) {
        headerRow = rows[i];
        continue;
      }
      
      const row = rows[i].trim();
      if (!row) continue;
      
      processedRows++;
      
      // カンマで分割（簡易的なCSVパース）
      const cols = row.split(',');
      
      // マッピングに基づいてデータを取得
      const phoneCol = mappings.phone || 0;
      const nameCol = mappings.name >= 0 ? mappings.name : -1;
      const companyCol = mappings.company >= 0 ? mappings.company : -1;
      
      const phone = cols[phoneCol] ? cols[phoneCol].trim() : '';
      
      if (!phone) {
        console.warn(`行 ${i+1}: 電話番号が空のためスキップします`);
        continue;
      }
      
      // 連絡先データ作成
      const contact = {
        phone,
        name: nameCol >= 0 && cols[nameCol] ? cols[nameCol].trim() : null,
        company: companyCol >= 0 && cols[companyCol] ? cols[companyCol].trim() : null,
        campaign_id: campaignId,
        status: 'pending',
        created_at: new Date()
      };
      
      contacts.push(contact);
      importedCount++;
    }
    
    console.log(`${contacts.length}件の連絡先をインポート処理します`);
    
    // データベースに登録
    const connection = await db.beginTransaction();
    
    try {
      // 各連絡先をデータベースに追加
      for (const contact of contacts) {
        await connection.query(
          'INSERT INTO contacts (phone, name, company, campaign_id, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
          [contact.phone, contact.name, contact.company, contact.campaign_id, contact.status]
        );
      }
      
      await db.commit(connection);
      console.log(`${importedCount}件の連絡先を登録しました`);
      
      // 一時ファイルを削除
      fs.unlinkSync(req.file.path);
      
      // 結果を返す
      res.json({
        message: `${importedCount}件の連絡先をインポートしました`,
        total_count: processedRows,
        imported_count: importedCount,
        updated_count: 0,
        skipped_count: processedRows - importedCount,
        error_count: 0,
        errors: []
      });
    } catch (dbError) {
      // エラー時はロールバック
      await db.rollback(connection);
      console.error('データベース登録エラー:', dbError);
      throw dbError;
    }
  } catch (error) {
    console.error('連絡先アップロードエラー:', error);
    
    // 一時ファイルのクリーンアップ
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.warn('一時ファイル削除エラー:', unlinkError);
      }
    }
    
    res.status(500).json({ message: 'アップロードエラー: ' + error.message });
  }
});

// 連絡先詳細の取得
router.get('/:id', async (req, res) => {
  try {
    const [contacts] = await db.query(
      'SELECT * FROM contacts WHERE id = ?',
      [req.params.id]
    );
    
    if (contacts.length === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    res.json(contacts[0]);
  } catch (error) {
    console.error('連絡先詳細取得エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

// 連絡先の更新
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, company, email, status } = req.body;
    
    if (!phone) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    await db.query(
      'UPDATE contacts SET name = ?, phone = ?, company = ?, email = ?, status = ? WHERE id = ?',
      [name, phone, company, email, status, req.params.id]
    );
    
    res.json({ message: '連絡先を更新しました', id: req.params.id });
  } catch (error) {
    console.error('連絡先更新エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

// 連絡先の削除
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM contacts WHERE id = ?',
      [req.params.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '連絡先が見つかりません' });
    }
    
    res.json({ message: '連絡先を削除しました' });
  } catch (error) {
    console.error('連絡先削除エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

// DNCリスト（発信拒否リスト）に登録
router.post('/dnc', async (req, res) => {
  try {
    const { phone, reason } = req.body;
    
    if (!phone) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    // DNリストに追加
    await db.query(
      'INSERT INTO dnc_list (phone, reason, created_at) VALUES (?, ?, NOW())',
      [phone, reason || 'ユーザー指定']
    );
    
    // 該当する連絡先のステータスを更新
    await db.query(
      'UPDATE contacts SET status = ? WHERE phone = ?',
      ['dnc', phone]
    );
    
    res.json({ message: '発信拒否リストに追加しました' });
  } catch (error) {
    console.error('DNC登録エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

// backend/src/routes/contacts.js に以下のルートを追加する
// 既存のコードはそのまま残し、これを追加します

// キャンペーンIDに基づく連絡先一覧の取得（別パスでの対応）
// backend/src/routes/contacts.js の該当部分を修正
router.get('/campaign/:campaignId', async (req, res) => {
  try {
    const campaignId = req.params.campaignId;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    console.log(`連絡先データを検索: campaign_id=${campaignId}, limit=${limit}, offset=${offset}`);
    
    // ===== 修正部分：LIMIT と OFFSET を直接クエリ文字列に埋め込む =====
    const [contacts] = await db.query(`
      SELECT * FROM contacts 
      WHERE campaign_id = ? 
      ORDER BY id DESC 
      LIMIT ${limit} OFFSET ${offset}
    `, [campaignId]);
    
    // 総件数を取得
    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM contacts WHERE campaign_id = ?',
      [campaignId]
    );
    
    // countResultは配列形式なので最初の要素のtotalプロパティを取得
    const total = countResult[0]?.total || 0;
    
    res.json({
      contacts: contacts, // 配列を返す
      total: total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (error) {
    console.error('連絡先取得エラー詳細:', error);
    
    // エラー情報を詳細に返す
    res.status(500).json({ 
      message: 'データの取得に失敗しました', 
      error: error.message,
      stack: error.stack
    });
  }
});

// フロントエンド互換用の追加ルート
router.get('/campaign/:campaignId/contactsList', async (req, res) => {
  try {
    const campaignId = req.params.campaignId;
    const limit = parseInt(req.query.limit) || 10;
    
    console.log(`連絡先リスト取得: campaign=${campaignId}`);
    
    const [contacts] = await db.query(`
      SELECT * FROM contacts 
      WHERE campaign_id = ? 
      ORDER BY id DESC 
      LIMIT ${limit}
    `, [campaignId]);
    
    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM contacts WHERE campaign_id = ?',
      [campaignId]
    );
    
    res.json({
      contacts: contacts,
      total: countResult[0]?.total || 0
    });
  } catch (error) {
    console.error('連絡先リスト取得エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
