const express = require('express');
const router = express.Router();
const db = require('../services/database');
const auth = require('../middleware/auth');

// キャンペーン一覧取得
router.get('/', auth, async (req, res) => {
  try {
    const [campaigns] = await db.query(`
      SELECT c.*, 
             ci.number as caller_id_number,
             ci.description as caller_id_description
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      ORDER BY c.created_at DESC
    `);
    
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// キャンペーン詳細取得
router.get('/:id', auth, async (req, res) => {
  try {
    const [campaigns] = await db.query(`
      SELECT c.*, 
             ci.number as caller_id_number,
             ci.description as caller_id_description
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ?
    `, [req.params.id]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    res.json(campaigns[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 新規キャンペーン作成
router.post('/', auth, async (req, res) => {
  try {
    const { 
      name, description, caller_id_id, script, retry_attempts,
      max_concurrent_calls, schedule_start, schedule_end, 
      working_hours_start, working_hours_end 
    } = req.body;
    
    // 入力検証
    if (!name) {
      return res.status(400).json({ message: 'キャンペーン名は必須です' });
    }
    
    // 発信者番号の検証
    if (caller_id_id) {
      const [callerIds] = await db.query(
        'SELECT id FROM caller_ids WHERE id = ? AND active = true',
        [caller_id_id]
      );
      
      if (callerIds.length === 0) {
        return res.status(400).json({ message: '選択された発信者番号が見つからないか無効です' });
      }
    } else {
      return res.status(400).json({ message: '発信者番号の選択は必須です' });
    }
    
    const [result] = await db.query(`
      INSERT INTO campaigns (
        name, description, status, caller_id_id, script, retry_attempts,
        max_concurrent_calls, schedule_start, schedule_end, 
        working_hours_start, working_hours_end
      ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, description, caller_id_id, script, retry_attempts || 0,
      max_concurrent_calls || 5, schedule_start, schedule_end,
      working_hours_start, working_hours_end
    ]);
    
    // 新しく作成されたキャンペーンを取得
    const [newCampaign] = await db.query(`
      SELECT c.*, 
             ci.number as caller_id_number,
             ci.description as caller_id_description
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ?
    `, [result.insertId]);
    
    res.status(201).json(newCampaign[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// キャンペーン更新
router.put('/:id', auth, async (req, res) => {
  try {
    const { 
      name, description, caller_id_id, script, retry_attempts,
      max_concurrent_calls, schedule_start, schedule_end, 
      working_hours_start, working_hours_end 
    } = req.body;
    
    // 入力検証
    if (!name) {
      return res.status(400).json({ message: 'キャンペーン名は必須です' });
    }
    
    // 発信者番号の検証
    if (caller_id_id) {
      const [callerIds] = await db.query(
        'SELECT id FROM caller_ids WHERE id = ? AND active = true',
        [caller_id_id]
      );
      
      if (callerIds.length === 0) {
        return res.status(400).json({ message: '選択された発信者番号が見つからないか無効です' });
      }
    } else {
      return res.status(400).json({ message: '発信者番号の選択は必須です' });
    }
    
    // 既存キャンペーン確認
    const [existing] = await db.query(
      'SELECT id, status FROM campaigns WHERE id = ?',
      [req.params.id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // アクティブなキャンペーンの発信者番号は変更できない
    if (existing[0].status === 'active' && caller_id_id) {
      const [currentCallerId] = await db.query(
        'SELECT caller_id_id FROM campaigns WHERE id = ?',
        [req.params.id]
      );
      
      if (currentCallerId[0].caller_id_id !== caller_id_id) {
        return res.status(400).json({ 
          message: 'アクティブなキャンペーンの発信者番号は変更できません。一時停止してから変更してください。'
        });
      }
    }
    
    await db.query(`
      UPDATE campaigns SET
        name = ?, description = ?, caller_id_id = ?, script = ?, retry_attempts = ?,
        max_concurrent_calls = ?, schedule_start = ?, schedule_end = ?, 
        working_hours_start = ?, working_hours_end = ?
      WHERE id = ?
    `, [
      name, description, caller_id_id, script, retry_attempts || 0,
      max_concurrent_calls || 5, schedule_start, schedule_end,
      working_hours_start, working_hours_end, req.params.id
    ]);
    
    // 更新されたキャンペーンを取得
    const [updatedCampaign] = await db.query(`
      SELECT c.*, 
             ci.number as caller_id_number,
             ci.description as caller_id_description
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ?
    `, [req.params.id]);
    
    res.json(updatedCampaign[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// キャンペーンステータス変更
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['draft', 'active', 'paused', 'completed'].includes(status)) {
      return res.status(400).json({ message: '無効なステータスです' });
    }
    
    // キャンペーン存在確認
    const [campaigns] = await db.query(
      'SELECT id, status FROM campaigns WHERE id = ?',
      [req.params.id]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // ステータスをactiveに変更する場合は追加チェック
    if (status === 'active') {
      // 発信者番号チェック
      const [campaign] = await db.query(`
        SELECT c.id, c.caller_id_id, ci.active, ci.number  
        FROM campaigns c
        LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
        WHERE c.id = ?
      `, [req.params.id]);
      
      if (!campaign[0].caller_id_id) {
        return res.status(400).json({ message: 'キャンペーンを開始するには発信者番号を設定する必要があります' });
      }
      
      if (!campaign[0].active) {
        return res.status(400).json({ message: '選択された発信者番号は現在無効になっています' });
      }
      
      // 連絡先のチェック
      const [contactCount] = await db.query(
        'SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ?',
        [req.params.id]
      );
      
      if (contactCount[0].count === 0) {
        return res.status(400).json({ message: 'キャンペーンを開始するには連絡先リストが必要です' });
      }
    }
    
    await db.query(
      'UPDATE campaigns SET status = ? WHERE id = ?',
      [status, req.params.id]
    );
    
    res.json({ message: 'キャンペーンステータスを更新しました', status });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;