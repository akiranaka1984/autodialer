// debug-start-campaign.js
const db = require('./src/services/database');
const logger = require('./src/services/logger');
const dialerService = require('./src/services/dialerService');

// テスト対象のキャンペーンID
const campaignId = 1; // 実際のキャンペーンIDに変更してください

async function testStartCampaign() {
  try {
    logger.info('=== キャンペーン起動テスト開始 ===');
    
    // サービス初期化
    if (!dialerService.initialized) {
      logger.info('発信サービスを初期化中...');
      await dialerService.initialize();
      logger.info('発信サービス初期化完了');
    }
    
    // キャンペーン情報を取得
    logger.info(`キャンペーン ${campaignId} の情報を取得中...`);
    const [campaigns] = await db.query(`
      SELECT c.*, ci.number as caller_id_number, 
        (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'pending') as pending_contacts
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ?
    `, [campaignId]);
    
    if (campaigns.length === 0) {
      logger.error(`キャンペーン ${campaignId} が見つかりません`);
      return;
    }
    
    const campaign = campaigns[0];
    logger.info(`キャンペーン情報: ${JSON.stringify(campaign)}`);
    logger.info(`発信可能な連絡先数: ${campaign.pending_contacts}件`);
    
    // キャンペーンを開始
    logger.info(`キャンペーン ${campaignId} を開始します...`);
    const startResult = await dialerService.startCampaign(campaignId);
    logger.info(`キャンペーン開始結果: ${startResult ? '成功' : '失敗'}`);
    
    // アクティブキャンペーン一覧を表示
    logger.info('アクティブキャンペーン一覧:');
    if (dialerService.activeCampaigns.size === 0) {
      logger.warn('アクティブキャンペーンが見つかりません！');
    } else {
      for (const [id, campaign] of dialerService.activeCampaigns.entries()) {
        logger.info(`  ID: ${id}, 名前: ${campaign.name}, ステータス: ${campaign.status}`);
      }
    }
    
    // 発信キューを実行
    logger.info('発信キュー処理を実行します...');
    await dialerService.processDialerQueue();
    logger.info('発信キュー処理を完了しました');
    
    // 5秒待機して再度実行
    logger.info('5秒待機します...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    logger.info('発信キュー処理を再度実行します...');
    await dialerService.processDialerQueue();
    logger.info('発信キュー処理を完了しました');
    
    logger.info('=== キャンペーン起動テスト終了 ===');
  } catch (error) {
    logger.error(`テスト実行エラー: ${error.message}`);
  }
}

// テスト実行
testStartCampaign().catch(err => {
  logger.error(`全体エラー: ${err.message}`);
}).finally(() => {
  setTimeout(() => {
    process.exit(0);
  }, 10000); // 10秒後に終了（処理完了を待つ）
});