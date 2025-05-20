// backend/scripts/run-migration.js
const db = require('../src/services/database');
const logger = require('../src/services/logger');

const runMigration = async () => {
  try {
    logger.info('channel_typeマイグレーションを開始します');
    
    // NULL値を'both'に更新
    await db.query("UPDATE caller_channels SET channel_type = 'both' WHERE channel_type IS NULL");
    
    logger.info('マイグレーションが完了しました');
    process.exit(0);
  } catch (error) {
    logger.error('マイグレーションエラー:', error);
    process.exit(1);
  }
};

runMigration();