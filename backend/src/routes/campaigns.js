const express = require('express');
const router = express.Router();
const db = require('../services/database');
const auth = require('../middleware/auth');
// campaignsControllerをインポート
const campaignsController = require('../controllers/campaignsController');

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

// キャンペーンの詳細情報を取得
router.get('/:id/details', auth, async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // キャンペーン基本情報
    const [campaign] = await db.query(`
      SELECT c.*, 
             ci.number as caller_id_number,
             ci.description as caller_id_description,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as total_contacts,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'completed') as completed_contacts,
             (SELECT COUNT(*) FROM call_logs WHERE campaign_id = c.id) as total_calls,
             (SELECT COUNT(*) FROM call_logs WHERE campaign_id = c.id AND status = 'ANSWERED') as answered_calls
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ?
    `, [campaignId]);
    
    if (!campaign || campaign.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // 進捗率の計算
    const progress = campaign[0].total_contacts > 0 
      ? Math.round((campaign[0].completed_contacts / campaign[0].total_contacts) * 100)
      : 0;
    
    res.json({
      ...campaign[0],
      progress,
      stats: {
        totalContacts: campaign[0].total_contacts,
        completedContacts: campaign[0].completed_contacts,
        totalCalls: campaign[0].total_calls,
        answeredCalls: campaign[0].answered_calls,
        answerRate: campaign[0].total_calls > 0 
          ? Math.round((campaign[0].answered_calls / campaign[0].total_calls) * 100)
          : 0
      }
    });
  } catch (error) {
    logger.error('キャンペーン詳細取得エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
});

// キャンペーン開始
router.post('/:id/start', auth, async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // キャンペーンの検証
    const [campaign] = await db.query(`
      SELECT c.*, ci.active as caller_id_active,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as contact_count
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ?
    `, [campaignId]);
    
    if (!campaign || campaign.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    if (!campaign[0].caller_id_id || !campaign[0].caller_id_active) {
      return res.status(400).json({ message: '有効な発信者番号が設定されていません' });
    }
    
    if (campaign[0].contact_count === 0) {
      return res.status(400).json({ message: '連絡先が登録されていません' });
    }
    
    // キャンペーンのステータスを更新
    await db.query(
      'UPDATE campaigns SET status = ? WHERE id = ?',
      ['active', campaignId]
    );
    
    res.json({ message: 'キャンペーンを開始しました', status: 'active' });
  } catch (error) {
    logger.error('キャンペーン開始エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
});

// キャンペーン一時停止
router.post('/:id/pause', auth, async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // キャンペーンのステータスを更新
    await db.query(
      'UPDATE campaigns SET status = ? WHERE id = ?',
      ['paused', campaignId]
    );
    
    res.json({ message: 'キャンペーンを一時停止しました', status: 'paused' });
  } catch (error) {
    logger.error('キャンペーン一時停止エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
});

// キャンペーン再開
router.post('/:id/resume', auth, async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // キャンペーンのステータスを更新
    await db.query(
      'UPDATE campaigns SET status = ? WHERE id = ?',
      ['active', campaignId]
    );
    
    res.json({ message: 'キャンペーンを再開しました', status: 'active' });
  } catch (error) {
    logger.error('キャンペーン再開エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
});

module.exports = router;