const db = require('../services/database');
const logger = require('../services/logger');
const csv = require('csv-parser');
const fs = require('fs');
const { promisify } = require('util');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

// DNCリストの取得
exports.getDNCList = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    
    let query = 'SELECT * FROM dnc_list';
    let countQuery = 'SELECT COUNT(*) as total FROM dnc_list';
    const params = [];
    const countParams = [];
    
    if (search) {
      query += ' WHERE phone LIKE ?';
      countQuery += ' WHERE phone LIKE ?';
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);
    
    const [list] = await db.query(query, params);
    const [totalResult] = await db.query(countQuery, countParams);
    const total = totalResult[0].total;
    
    res.json({
      list,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    logger.error('DNCリスト取得エラー:', error);
    res.status(500).json({ message: 'DNCリストの取得に失敗しました' });
  }
};

// DNCリストに追加
exports.addToDNC = async (req, res) => {
  try {
    const { phone, reason } = req.body;
    
    if (!phone) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    // 電話番号の正規化
    const normalizedPhone = phone.replace(/[^\d]/g, '');
    
    // 既に登録されているか確認
    const [existing] = await db.query('SELECT id FROM dnc_list WHERE phone = ?', [normalizedPhone]);
    
    if (existing.length > 0) {
      return res.status(400).json({ message: 'この電話番号は既にDNCリストに登録されています' });
    }
    
    // DNCリストに追加
    await db.query(
      'INSERT INTO dnc_list (phone, reason, created_at) VALUES (?, ?, NOW())',
      [normalizedPhone, reason || null]
    );
    
    // 関連する連絡先のステータスを更新
    await db.query(
      'UPDATE contacts SET status = "dnc" WHERE phone = ?',
      [normalizedPhone]
    );
    
    res.json({ message: 'DNCリストに追加しました' });
  } catch (error) {
    logger.error('DNC追加エラー:', error);
    res.status(500).json({ message: 'DNCリストへの追加に失敗しました' });
  }
};

// DNCリストから削除
exports.removeFromDNC = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.query('DELETE FROM dnc_list WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'エントリが見つかりません' });
    }
    
    res.json({ message: 'DNCリストから削除しました' });
  } catch (error) {
    logger.error('DNC削除エラー:', error);
    res.status(500).json({ message: 'DNCリストからの削除に失敗しました' });
  }
};

// DNCリストのインポート
exports.importDNC = async (req, res) => {
  const uploadMiddleware = promisify(upload.single('file'));
  
  try {
    await uploadMiddleware(req, res);
    
    if (!req.file) {
      return res.status(400).json({ message: 'ファイルが見つかりません' });
    }
    
    const results = [];
    let imported = 0;
    let skipped = 0;
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => {
          results.push(data);
        })
        .on('end', async () => {
          try {
            for (const row of results) {
              const phone = row.phone || row['電話番号'];
              const reason = row.reason || row['理由'];
              
              if (!phone) continue;
              
              const normalizedPhone = phone.replace(/[^\d]/g, '');
              
              // 既存チェック
              const [existing] = await db.query('SELECT id FROM dnc_list WHERE phone = ?', [normalizedPhone]);
              
              if (existing.length === 0) {
                await db.query(
                  'INSERT INTO dnc_list (phone, reason, created_at) VALUES (?, ?, NOW())',
                  [normalizedPhone, reason || null]
                );
                imported++;
              } else {
                skipped++;
              }
            }
            
            resolve();
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
    
    // アップロードファイルを削除
    fs.unlink(req.file.path, (err) => {
      if (err) logger.error('一時ファイル削除エラー:', err);
    });
    
    res.json({
      message: `インポートが完了しました`,
      imported,
      skipped
    });
  } catch (error) {
    logger.error('DNCインポートエラー:', error);
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ message: 'インポートに失敗しました' });
  }
};

// DNCリストのエクスポート
exports.exportDNC = async (req, res) => {
  try {
    const [dncList] = await db.query('SELECT phone, reason, created_at FROM dnc_list ORDER BY created_at DESC');
    
    let csv = '電話番号,理由,登録日時\n';
    
    dncList.forEach(item => {
      csv += `${item.phone},${item.reason || ''},${item.created_at}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=dnc_list_${new Date().toISOString().split('T')[0]}.csv`);
    res.send('\uFEFF' + csv); // BOM付きUTF-8
  } catch (error) {
    logger.error('DNCエクスポートエラー:', error);
    res.status(500).json({ message: 'エクスポートに失敗しました' });
  }
};