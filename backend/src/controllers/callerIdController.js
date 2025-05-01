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
