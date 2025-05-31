// backend/src/controllers/shiftController.js

// シフト登録
exports.createShift = async (req, res) => {
  try {
    const { operatorId, shiftDate, startTime, endTime, breakStart, breakEnd } = req.body;
    
    // 重複チェック
    const [existing] = await db.query(
      'SELECT id FROM operator_shifts WHERE operator_id = ? AND shift_date = ? AND start_time = ?',
      [operatorId, shiftDate, startTime]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ message: '既に同じシフトが登録されています' });
    }
    
    const [result] = await db.query(
      `INSERT INTO operator_shifts 
       (operator_id, shift_date, start_time, end_time, break_start, break_end) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [operatorId, shiftDate, startTime, endTime, breakStart, breakEnd]
    );
    
    res.status(201).json({ id: result.insertId, message: 'シフトが登録されました' });
  } catch (error) {
    logger.error('シフト登録エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// シフト一覧取得
exports.getShifts = async (req, res) => {
  try {
    const { startDate, endDate, operatorId } = req.query;
    
    let query = `
      SELECT 
        s.*,
        o.operator_id as operator_code,
        u.name as operator_name
      FROM operator_shifts s
      JOIN operators o ON s.operator_id = o.id
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (startDate && endDate) {
      query += ' AND s.shift_date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }
    
    if (operatorId) {
      query += ' AND s.operator_id = ?';
      params.push(operatorId);
    }
    
    query += ' ORDER BY s.shift_date, s.start_time';
    
    const [shifts] = await db.query(query, params);
    res.json(shifts);
  } catch (error) {
    logger.error('シフト取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};