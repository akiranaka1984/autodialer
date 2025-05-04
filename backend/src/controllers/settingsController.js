const db = require('../services/database');
const logger = require('../services/logger');

// 設定の取得
exports.getSettings = async (req, res) => {
  try {
    // 設定テーブルを作成
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // デフォルト設定の確認と初期化
    const defaultSettings = {
      defaultCallerID: '',
      defaultRetryAttempts: '3',
      defaultMaxConcurrentCalls: '10',
      defaultWorkingHoursStart: '09:00',
      defaultWorkingHoursEnd: '18:00',
      callTimeout: '30',
      recordCalls: 'false',
      enableSMS: 'false',
      smsProvider: '',
      smsApiKey: ''
    };

    // 現在の設定を取得
    const [rows] = await db.query('SELECT setting_key, setting_value FROM system_settings');
    
    // キー・バリュー形式に変換
    const currentSettings = {};
    rows.forEach(row => {
      currentSettings[row.setting_key] = row.setting_value;
    });

    // デフォルト設定が存在しない場合は追加
    for (const [key, value] of Object.entries(defaultSettings)) {
      if (!(key in currentSettings)) {
        await db.query(
          'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)',
          [key, value]
        );
        currentSettings[key] = value;
      }
    }

    // 結果を返す
    const settings = {
      defaultCallerID: currentSettings.defaultCallerID || '',
      defaultRetryAttempts: parseInt(currentSettings.defaultRetryAttempts) || 3,
      defaultMaxConcurrentCalls: parseInt(currentSettings.defaultMaxConcurrentCalls) || 10,
      defaultWorkingHoursStart: currentSettings.defaultWorkingHoursStart || '09:00',
      defaultWorkingHoursEnd: currentSettings.defaultWorkingHoursEnd || '18:00',
      callTimeout: parseInt(currentSettings.callTimeout) || 30,
      recordCalls: currentSettings.recordCalls === 'true',
      enableSMS: currentSettings.enableSMS === 'true',
      smsProvider: currentSettings.smsProvider || '',
      smsApiKey: currentSettings.smsApiKey || ''
    };

    res.json(settings);
  } catch (error) {
    logger.error('設定取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// 設定の更新
exports.updateSettings = async (req, res) => {
  try {
    const updates = req.body;

    for (const [key, value] of Object.entries(updates)) {
      let dbValue = value;
      if (typeof value === 'boolean') {
        dbValue = value.toString();
      } else if (typeof value === 'number') {
        dbValue = value.toString();
      }

      await db.query(
        `INSERT INTO system_settings (setting_key, setting_value) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE setting_value = ?`,
        [key, dbValue, dbValue]
      );
    }

    res.json({ message: '設定を保存しました' });
  } catch (error) {
    logger.error('設定更新エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};