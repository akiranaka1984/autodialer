// src/routes/telnyx.js
const express = require('express');
const router = express.Router();
const logger = require('../services/logger');
const db = require('../services/database');
const telnyxService = require('../services/telnyxService');

/**
 * Webhook受信エンドポイント
 * TelnyxからのWebhookを受信して処理
 */
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body.data;
    
    // イベントデータの検証
    if (!event) {
      logger.warn('⚠️ 不正なWebhook受信: イベントデータなし');
      return res.sendStatus(400);
    }
    
    const eventType = event.event_type;
    const payload = event.payload;
    
    logger.info(`📨 Telnyxイベント受信: ${eventType}`);
    logger.debug('   イベント詳細:', JSON.stringify(payload, null, 2));
    
    // イベントタイプ別に処理
    switch(eventType) {
      case 'call.initiated':
        await handleCallInitiated(payload);
        break;
        
      case 'call.answered':
        await handleCallAnswered(payload);
        break;
        
      case 'call.hangup':
        await handleCallHangup(payload);
        break;
        
      case 'call.dtmf.received':
        await handleDTMFReceived(payload);
        break;
        
      default:
        logger.info(`ℹ️ 未処理のイベントタイプ: ${eventType}`);
    }
    
    // Telnyxに200 OKを返す（必須）
    res.sendStatus(200);
    
  } catch (error) {
    logger.error('❌ Webhook処理エラー:', error);
    // エラーでも200を返す（Telnyxのリトライを防ぐため）
    res.sendStatus(200);
  }
});

/**
 * 発信開始イベントの処理
 */
async function handleCallInitiated(payload) {
  const callId = payload.call_control_id;
  const to = payload.to;
  const from = payload.from;
  
  logger.info(`📞 通話開始: CallID=${callId}, To=${to}, From=${from}`);
  
  try {
    // データベースに通話ログを作成
    await db.query(`
      INSERT INTO call_logs 
      (call_id, phone_number, start_time, status, call_provider)
      VALUES (?, ?, NOW(), 'INITIATED', 'telnyx')
    `, [callId, to]);
    
    logger.info(`✅ 通話ログ作成: CallID=${callId}`);
    
  } catch (error) {
    logger.error(`❌ 通話ログ作成エラー: CallID=${callId}`, error);
  }
}

/**
 * 応答イベントの処理
 */
async function handleCallAnswered(payload) {
  const callId = payload.call_control_id;
  
  logger.info(`✅ 通話応答: CallID=${callId}`);
  
  try {
    // データベースの通話ログを更新
    await db.query(`
      UPDATE call_logs 
      SET status = 'ANSWERED'
      WHERE call_id = ?
    `, [callId]);
    
    logger.info(`✅ 通話ステータス更新: CallID=${callId} → ANSWERED`);
    
    // TODO: 音声再生などの処理を追加
    // await telnyxService.playAudio(callId, 'https://example.com/audio.mp3');
    
  } catch (error) {
    logger.error(`❌ 通話応答処理エラー: CallID=${callId}`, error);
  }
}

/**
 * 通話終了イベントの処理
 */
async function handleCallHangup(payload) {
  const callId = payload.call_control_id;
  const hangupCause = payload.hangup_cause;
  const duration = payload.call_duration_secs || 0;
  
  logger.info(`📴 通話終了: CallID=${callId}, 理由=${hangupCause}, 時間=${duration}秒`);
  
  try {
    // データベースの通話ログを更新
    await db.query(`
      UPDATE call_logs 
      SET 
        status = 'HANGUP',
        end_time = NOW(),
        duration = ?
      WHERE call_id = ?
    `, [duration, callId]);
    
    // 連絡先のステータスを更新
    await db.query(`
      UPDATE contacts 
      SET 
        status = 'completed',
        last_attempt = NOW()
      WHERE id = (
        SELECT contact_id 
        FROM call_logs 
        WHERE call_id = ?
      )
    `, [callId]);
    
    logger.info(`✅ 通話終了処理完了: CallID=${callId}`);
    
  } catch (error) {
    logger.error(`❌ 通話終了処理エラー: CallID=${callId}`, error);
  }
}

/**
 * DTMFキー入力イベントの処理
 */
async function handleDTMFReceived(payload) {
  const callId = payload.call_control_id;
  const digit = payload.digit;
  
  logger.info(`🔢 DTMFキー受信: CallID=${callId}, Key=${digit}`);
  
  try {
    // データベースに記録
    await db.query(`
      UPDATE call_logs 
      SET keypress = ?
      WHERE call_id = ?
    `, [digit, callId]);
    
    // キーに応じた処理
    if (digit === '1' || digit === '2' || digit === '3') {
      // オペレーター転送（TODO: 転送機能実装後に追加）
      logger.info(`📞 オペレーター転送リクエスト: Key=${digit}`);
      
    } else if (digit === '9') {
      // DNC登録
      logger.info(`🚫 DNC登録リクエスト: Key=${digit}`);
      
      // 電話番号を取得してDNCリストに追加
      const [callLogs] = await db.query(`
        SELECT phone_number 
        FROM call_logs 
        WHERE call_id = ?
      `, [callId]);
      
      if (callLogs.length > 0) {
        const phoneNumber = callLogs[0].phone_number;
        
        await db.query(`
          INSERT INTO dnc_list (phone, reason)
          VALUES (?, 'Customer request via DTMF')
          ON DUPLICATE KEY UPDATE reason = 'Customer request via DTMF'
        `, [phoneNumber]);
        
        logger.info(`✅ DNC登録完了: ${phoneNumber}`);
      }
      
      // 通話を切断
      await telnyxService.hangup(callId);
    }
    
  } catch (error) {
    logger.error(`❌ DTMF処理エラー: CallID=${callId}`, error);
  }
}

/**
 * ヘルスチェックエンドポイント
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'telnyx',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
