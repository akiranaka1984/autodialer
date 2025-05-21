// debug-init.js - サービス初期化のデバッグ用スクリプト
const logger = require('./src/services/logger');
const dialerService = require('./src/services/dialerService');

// 非同期関数でサービス初期化
async function initializeServices() {
  logger.info('デバッグ: サービス初期化スクリプトを開始します');
  
  try {
    // 発信サービスの初期化
    if (typeof dialerService.initializeService === 'function') {
      logger.info('デバッグ: 発信サービスの初期化を実行します');
      const result = await dialerService.initializeService();
      logger.info(`デバッグ: 発信サービスの初期化結果: ${result ? '成功' : '失敗'}`);
    } else {
      logger.info('デバッグ: 発信サービスに initializeService メソッドが見つかりません');
      
      // 標準の初期化メソッドを使用
      if (typeof dialerService.initialize === 'function') {
        logger.info('デバッグ: 標準の initialize メソッドを実行します');
        await dialerService.initialize();
        logger.info('デバッグ: 標準の initialize メソッドが完了しました');
      } else {
        logger.error('デバッグ: 発信サービスには初期化メソッドがありません');
      }
    }
    
    // アクティブキャンペーンの表示
    if (dialerService.activeCampaigns) {
      logger.info(`デバッグ: アクティブキャンペーン数: ${dialerService.activeCampaigns.size}`);
      
      for (const [id, campaign] of dialerService.activeCampaigns.entries()) {
        logger.info(`デバッグ: キャンペーン ID=${id}, Name=${campaign.name}, Status=${campaign.status}`);
      }
    }
    
    // 発信キュー処理を実行
    if (typeof dialerService.processDialerQueue === 'function') {
      logger.info('デバッグ: 発信キュー処理を実行します');
      await dialerService.processDialerQueue();
      logger.info('デバッグ: 発信キュー処理が完了しました');
    }
    
    logger.info('デバッグ: サービス初期化スクリプトが完了しました');
  } catch (error) {
    logger.error(`デバッグ: サービス初期化エラー: ${error.message}`);
  }
}

// 初期化実行
initializeServices().catch(err => {
  logger.error(`デバッグ: 初期化スクリプト全体のエラー: ${err.message}`);
});