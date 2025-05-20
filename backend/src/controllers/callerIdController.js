const db = require('../services/database');
const logger = require('../services/logger');
const fs = require('fs');
const csv = require('csv-parser');
const multer = require('multer');
const { promisify } = require('util');

// 全ての発信者番号を取得
exports.getAllCallerIds = async (req, res) => {
  try {
    console.log('発信者番号一覧取得API開始');
    
    // db.queryの結果構造を確認するログを追加
    const result = await db.query('SELECT * FROM caller_ids ORDER BY created_at DESC');
    console.log('db.query結果の型:', typeof result);
    console.log('db.query結果の構造:', Object.prototype.toString.call(result));
    
    // 結果が配列かどうかを確認
    if (Array.isArray(result)) {
      console.log('結果は配列です。長さ:', result.length);
      res.json(result);
    } else if (result && Array.isArray(result[0])) {
      // MySQL2の場合、結果は[rows, fields]の形式で返される
      console.log('結果は[rows, fields]形式です。行数:', result[0].length);
      res.json(result[0]);
    } else {
      console.log('不明な結果形式:', result);
      // 空の配列を返して安全に処理
      res.json([]);
    }
  } catch (error) {
    console.error('発信者番号取得エラー:', error);
    res.status(500).json({ message: '発信者番号の取得に失敗しました: ' + error.message });
  }
};

// 発信者番号の詳細を取得（チャンネルも含む）
exports.getCallerIdById = async (req, res) => {
  try {
    // 発信者番号の基本情報取得
    const [callerIds] = await db.query(
      'SELECT * FROM caller_ids WHERE id = ?', 
      [req.params.id]
    );
    
    if (callerIds.length === 0) {
      return res.status(404).json({ message: '発信者番号が見つかりません' });
    }
    
    // チャンネル情報の取得
    const [channels] = await db.query(
      'SELECT * FROM caller_channels WHERE caller_id_id = ?',
      [req.params.id]
    );
    
    // 発信者番号とチャンネル情報を組み合わせて返す
    const callerId = callerIds[0];
    callerId.channels = channels;
    
    res.json(callerId);
  } catch (error) {
    logger.error('発信者番号詳細取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
  }
};

// 新しいチャンネルを追加
exports.addCallerChannel = async (req, res) => {
  try {
    const { caller_id_id, username, password, channel_type } = req.body;
    
    if (!caller_id_id || !username || !password) {
      return res.status(400).json({ message: '必須フィールドが不足しています' });
    }
    
    // チャンネルタイプの検証（指定されていない場合はデフォルト値を使用）
    const validType = channel_type && ['outbound', 'transfer', 'both'].includes(channel_type) 
      ? channel_type 
      : 'both';
    
    // チャンネルを追加（channel_typeも含める）
    const [result] = await db.query(
      'INSERT INTO caller_channels (caller_id_id, username, password, channel_type) VALUES (?, ?, ?, ?)',
      [caller_id_id, username, password, validType]
    );
    
    res.status(201).json({ 
      id: result.insertId,
      caller_id_id,
      username,
      password,
      channel_type: validType,
      status: 'available'
    });
  } catch (error) {
    logger.error('チャンネル追加エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
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
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
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
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
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
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
  }
};

// CSVからの発信者番号インポート
exports.importCallerIds = async (req, res) => {
  try {
    // Multerミドルウェアを設定
    const upload = multer({ dest: 'uploads/' });
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
    const connection = await db.beginTransaction();
    
    try {
      // 一括挿入処理
      for (const callerId of callerIds) {
        await connection.query(
          'INSERT INTO caller_ids (number, description, provider, active) VALUES (?, ?, ?, ?)',
          [
            callerId.number,
            callerId.description,
            callerId.provider,
            callerId.active ? 1 : 0
          ]
        );
      }
      
      await db.commit(connection);
    } catch (error) {
      await db.rollback(connection);
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
// backend/src/controllers/callerIdController.js 内のインポート関数の修正

// CSVからのチャンネルインポート
exports.importCallerChannels = async (req, res) => {
  try {
    const callerId = req.params.id;
    
    // Multerミドルウェアを設定
    const upload = multer({ dest: 'uploads/' });
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
    
    if (!mappings.username || !mappings.password) {
      return res.status(400).json({ message: 'ユーザー名とパスワードのマッピングが必要です' });
    }
    
    // CSVファイル処理
    const filePath = req.file.path;
    const channels = [];
    const errors = [];
    let totalCount = 0;
    let importedCount = 0;
    let duplicateCount = 0;
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          totalCount++;
          
          try {
            // マッピングに従ってデータを抽出
            const username = row[mappings.username].trim();
            const password = row[mappings.password].trim();
            
            if (!username || !password) {
              errors.push(`行 ${totalCount + 1}: ユーザー名またはパスワードが空です`);
              return;
            }
            
            // チャンネルを追加
            channels.push({
              caller_id_id: callerId,
              username,
              password,
              status: 'available'
            });
            
            importedCount++;
          } catch (error) {
            errors.push(`行 ${totalCount + 1}: データ処理エラー - ${error.message}`);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });
    
    // 一括挿入処理
    const connection = await db.beginTransaction();
    try {
      for (const channel of channels) {
        await connection.query(
          'INSERT INTO caller_channels (caller_id_id, username, password, status) VALUES (?, ?, ?, ?)',
          [channel.caller_id_id, channel.username, channel.password, channel.status]
        );
      }
      
      await db.commit(connection);
    } catch (error) {
      await db.rollback(connection);
      throw error;
    }
    
    // 一時ファイルを削除
    fs.unlink(filePath, () => {});
    
    res.json({
      message: `${importedCount}件のチャンネルをインポートしました`,
      total_count: totalCount,
      imported_count: importedCount,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    logger.error('チャンネルインポートエラー:', error);
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// 特定の発信者番号のチャンネル一覧を取得
exports.getCallerChannels = async (req, res) => {
  try {
    logger.info(`発信者番号ID=${req.params.id}のチャンネル一覧を取得`);
    
    // 明示的にすべてのフィールドを指定（channel_typeも含む）
    const [channels] = await db.query(`
      SELECT id, caller_id_id, username, password, status, last_used, channel_type
      FROM caller_channels 
      WHERE caller_id_id = ?
    `, [req.params.id]);
    
    logger.info(`${channels.length}件のチャンネルを取得しました`);
    
    res.json(channels);
  } catch (error) {
    logger.error('チャンネル取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
  }
};

exports.updateCallerChannel = async (req, res) => {
  try {
    const { username, password, channel_type } = req.body;
    let updateQuery = 'UPDATE caller_channels SET ';
    const queryParams = [];
    let hasUpdates = false;

    // ユーザー名の更新
    if (username) {
      updateQuery += 'username = ?';
      queryParams.push(username);
      hasUpdates = true;
    }

    // パスワードの更新
    if (password) {
      if (hasUpdates) updateQuery += ', ';
      updateQuery += 'password = ?';
      queryParams.push(password);
      hasUpdates = true;
    }
    
    // チャンネルタイプの更新
    if (channel_type && ['outbound', 'transfer', 'both'].includes(channel_type)) {
      if (hasUpdates) updateQuery += ', ';
      updateQuery += 'channel_type = ?';
      queryParams.push(channel_type);
      hasUpdates = true;
    }

    if (!hasUpdates) {
      return res.status(400).json({ message: '更新するフィールドがありません' });
    }

    updateQuery += ' WHERE id = ?';
    queryParams.push(req.params.id);

    const [result] = await db.query(updateQuery, queryParams);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'チャンネルが見つかりません' });
    }

    res.json({ 
      message: 'チャンネルが更新されました',
      id: parseInt(req.params.id),
      updates: {
        username: username || undefined,
        channel_type: channel_type || undefined,
        password: password ? '********' : undefined
      }
    });
  } catch (error) {
    logger.error('チャンネル更新エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
  }
};

// チャンネルを削除
exports.deleteCallerChannel = async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM caller_channels WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'チャンネルが見つかりません' });
    }

    res.json({ message: 'チャンネルが削除されました' });
  } catch (error) {
    logger.error('チャンネル削除エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
  }
};

// 特定の発信者番号のチャンネル状態サマリーを取得
exports.getCallerChannelsStatus = async (req, res) => {
  try {
    const [channels] = await db.query(
      `SELECT 
        status, 
        COUNT(*) as count
       FROM caller_channels 
       WHERE caller_id_id = ?
       GROUP BY status`,
      [req.params.id]
    );

    // 総チャンネル数を取得
    const [totalResult] = await db.query(
      'SELECT COUNT(*) as total FROM caller_channels WHERE caller_id_id = ?',
      [req.params.id]
    );

    const total = totalResult[0]?.total || 0;

    // ステータスごとの数を整理
    const statusCounts = {
      total,
      available: 0,
      busy: 0,
      error: 0
    };

    channels.forEach(item => {
      if (item.status in statusCounts) {
        statusCounts[item.status] = item.count;
      }
    });

    res.json(statusCounts);
  } catch (error) {
    logger.error('チャンネル状態取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
  }
};

// 特定のチャンネルを取得
exports.getCallerChannelById = async (req, res) => {
  try {
    const [channels] = await db.query(
      'SELECT * FROM caller_channels WHERE id = ?',
      [req.params.id]
    );

    if (channels.length === 0) {
      return res.status(404).json({ message: 'チャンネルが見つかりません' });
    }

    res.json(channels[0]);
  } catch (error) {
    logger.error('チャンネル取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
  }
};

// 発信者番号の状態を監視（アクティブコール数など）
exports.monitorCallerId = async (req, res) => {
  try {
    // 発信者番号の基本情報を取得
    const [callerIds] = await db.query(
      'SELECT * FROM caller_ids WHERE id = ?',
      [req.params.id]
    );

    if (callerIds.length === 0) {
      return res.status(404).json({ message: '発信者番号が見つかりません' });
    }

    // チャンネル状態を取得
    const [channels] = await db.query(
      `SELECT 
        status, 
        COUNT(*) as count
       FROM caller_channels 
       WHERE caller_id_id = ?
       GROUP BY status`,
      [req.params.id]
    );

    // アクティブコール数を取得（仮実装 - 実際にはsipServiceと連携する必要あり）
    const sipService = require('../services/sipService');
    let activeCallCount = 0;
    
    if (sipService && typeof sipService.getActiveCallCountForCallerId === 'function') {
      try {
        activeCallCount = sipService.getActiveCallCountForCallerId(req.params.id);
      } catch (err) {
        logger.warn(`アクティブコール数取得エラー: ${err.message}`);
      }
    }

    // レスポンスを構築
    const monitorData = {
      callerId: callerIds[0],
      channels: channels.reduce((acc, curr) => {
        acc[curr.status] = curr.count;
        return acc;
      }, {}),
      activeCallCount,
      timestamp: new Date()
    };

    res.json(monitorData);
  } catch (error) {
    logger.error('発信者番号モニターエラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
  }
};

// 特定の発信者番号のチャンネルをリセット（すべてavailable状態に）
exports.resetCallerChannels = async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE caller_channels SET status = "available", last_used = NULL WHERE caller_id_id = ?',
      [req.params.id]
    );

    // SIPサービスの状態も更新
    const sipService = require('../services/sipService');
    if (sipService && typeof sipService.syncChannelStatusWithDatabase === 'function') {
      try {
        await sipService.syncChannelStatusWithDatabase();
      } catch (err) {
        logger.warn(`SIPサービス同期エラー: ${err.message}`);
      }
    }

    res.json({ 
      message: 'チャンネル状態をリセットしました', 
      updatedCount: result.affectedRows 
    });
  } catch (error) {
    logger.error('チャンネルリセットエラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
  }
};

// データベースとSIPサービスのチャンネル状態を同期
exports.syncCallerChannels = async (req, res) => {
  try {
    const sipService = require('../services/sipService');
    
    if (!sipService || typeof sipService.syncChannelStatusWithDatabase !== 'function') {
      return res.status(500).json({ message: 'SIPサービスが利用できないか、同期機能が実装されていません' });
    }
    
    const result = await sipService.syncChannelStatusWithDatabase();
    
    if (result) {
      res.json({ message: 'チャンネル状態の同期が完了しました' });
    } else {
      res.status(500).json({ message: 'チャンネル状態の同期に失敗しました' });
    }
  } catch (error) {
    logger.error('チャンネル同期エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました: ' + error.message });
  }
};