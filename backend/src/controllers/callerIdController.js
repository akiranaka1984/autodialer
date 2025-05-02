const db = require('../services/database');
const logger = require('../services/logger');

// 全ての発信者番号を取得
exports.getAllCallerIds = async (req, res) => {
  try {
    const callerIds = await db.query('SELECT * FROM caller_ids ORDER BY created_at DESC');
    res.json(callerIds);
  } catch (error) {
    logger.error('発信者番号取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// CSVからの発信者番号インポート
exports.importCallerIds = async (req, res) => {
  try {
    // Multerミドルウェアを適用
    const uploadMiddleware = promisify(upload.single('file'));
    await uploadMiddleware(req, res);
    
    if (!req.file) {
      return res.status(400).json({ message: 'ファイルが見つかりません' });
    }
    
    // マッピング情報の取得
    let mappings;
    try {
      mappings = JSON.parse(req.body.mappings);
    } catch (error) {
      return res.status(400).json({ message: 'マッピング情報が不正です' });
    }
    
    if (!mappings.number) {
      return res.status(400).json({ message: '電話番号フィールドのマッピングが必要です' });
    }
    
    // 既存の発信者番号を取得（重複チェック用）
    const existingCallerIds = await db.query(
      'SELECT number FROM caller_ids'
    );
    
    const existingNumbers = new Set(existingCallerIds.map(callerId => callerId.number));
    
    // CSVファイル処理
    const filePath = req.file.path;
    const callerIds = [];
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
            const number = rowData[mappings.number].trim();
            const description = mappings.description ? rowData[mappings.description].trim() : '';
            const provider = mappings.provider ? rowData[mappings.provider].trim() : '';
            const sip_host = mappings.sip_host ? rowData[mappings.sip_host].trim() : '';
            const auth_username = mappings.auth_username ? rowData[mappings.auth_username].trim() : '';
            const auth_password = mappings.auth_password ? rowData[mappings.auth_password].trim() : '';
            const active = mappings.active ? 
              (rowData[mappings.active].trim().toLowerCase() === 'true' || 
               rowData[mappings.active].trim() === '1' || 
               rowData[mappings.active].trim() === '有効') : true;
            
            // 電話番号の検証
            if (!number) {
              errors.push(`行 ${totalCount + 1}: 電話番号が空です`);
              errorCount++;
              return;
            }
            
            // 電話番号の正規化（ハイフンを削除）
            const normalizedNumber = number.replace(/-/g, '');
            
            // 重複チェック
            if (existingNumbers.has(normalizedNumber)) {
              errors.push(`行 ${totalCount + 1}: 電話番号 ${normalizedNumber} は既に登録されています`);
              duplicateCount++;
              return;
            }
            
            // 発信者番号を追加
            callerIds.push({
              number: normalizedNumber,
              description,
              provider,
              sip_host,
              auth_username,
              auth_password,
              active,
              created_at: new Date()
            });
            
            // 重複チェック用セットに追加
            existingNumbers.add(normalizedNumber);
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
    
    // 発信者番号がない場合
    if (callerIds.length === 0) {
      return res.status(400).json({
        message: 'インポートできる発信者番号がありません',
        total_count: totalCount,
        imported_count: 0,
        duplicate_count: duplicateCount,
        error_count: errorCount,
        errors: errors.slice(0, 10) // 最初の10件のエラーのみ返す
      });
    }
    
    // トランザクション開始
    await db.beginTransaction();
    
    try {
      // 一括挿入処理
      for (const callerId of callerIds) {
        await db.query(
          'INSERT INTO caller_ids (number, description, provider, sip_host, auth_username, auth_password, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            callerId.number,
            callerId.description,
            callerId.provider,
            callerId.sip_host,
            callerId.auth_username,
            callerId.auth_password,
            callerId.active ? 1 : 0,
            callerId.created_at
          ]
        );
      }
      
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }
    
    // 一時ファイルを削除
    fs.unlink(filePath, (err) => {
      if (err) {
        logger.error(`一時ファイル削除エラー: ${err.message}`);
      }
    });
    
    res.json({
      message: `${importedCount}件の発信者番号をインポートしました`,
      total_count: totalCount,
      imported_count: importedCount,
      duplicate_count: duplicateCount,
      error_count: errorCount,
      errors: errors.slice(0, 10) // 最初の10件のエラーのみ返す
    });
  } catch (error) {
    logger.error('発信者番号インポートエラー:', error);
    
    // 一時ファイルがある場合は削除
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// 特定の発信者番号を取得
exports.getCallerIdById = async (req, res) => {
  try {
    const callerIds = await db.query('SELECT * FROM caller_ids WHERE id = ?', [req.params.id]);
    
    if (callerIds.length === 0) {
      return res.status(404).json({ message: '発信者番号が見つかりません' });
    }
    
    res.json(callerIds[0]);
  } catch (error) {
    logger.error('発信者番号詳細取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// 新しい発信者番号を作成
exports.createCallerId = async (req, res) => {
  try {
    const { number, description, provider, active } = req.body;
    
    if (!number) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    const result = await db.query(
      'INSERT INTO caller_ids (number, description, provider, active) VALUES (?, ?, ?, ?)',
      [number, description, provider, active === false ? 0 : 1]
    );
    
    res.status(201).json({ 
      id: result.insertId,
      number,
      description,
      provider,
      active: active === false ? false : true
    });
  } catch (error) {
    logger.error('発信者番号作成エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// 発信者番号を更新
exports.updateCallerId = async (req, res) => {
  try {
    const { number, description, provider, active } = req.body;
    
    if (!number) {
      return res.status(400).json({ message: '電話番号は必須です' });
    }
    
    const result = await db.query(
      'UPDATE caller_ids SET number = ?, description = ?, provider = ?, active = ? WHERE id = ?',
      [number, description, provider, active === false ? 0 : 1, req.params.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '発信者番号が見つかりません' });
    }
    
    res.json({ 
      id: parseInt(req.params.id),
      number,
      description,
      provider,
      active: active === false ? false : true
    });
  } catch (error) {
    logger.error('発信者番号更新エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// 発信者番号を削除
exports.deleteCallerId = async (req, res) => {
  try {
    const result = await db.query('DELETE FROM caller_ids WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '発信者番号が見つかりません' });
    }
    
    res.json({ message: '発信者番号が削除されました' });
  } catch (error) {
    logger.error('発信者番号削除エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};
