-- ===============================================
-- AutoDialer v2.2 - MySQL 8.0安全適用版
-- 日付: 2025年12月4日
-- 特徴: エラー無視・段階的適用・既存データ保護
-- ===============================================

-- Step 1: まず既存構造を確認
SELECT '🔍 既存テーブル構造確認中...' as status;

-- Step 2: 転送関連カラムを安全に追加（エラー無視）
SELECT '🔧 転送カラム追加中...' as status;

-- transfer_attempted カラム追加（エラー無視）
SET @sql = 'ALTER TABLE call_logs ADD COLUMN transfer_attempted tinyint(1) NOT NULL DEFAULT 0';
SET @sql_check = (SELECT COUNT(*) FROM information_schema.columns 
                  WHERE table_schema = DATABASE() 
                  AND table_name = 'call_logs' 
                  AND column_name = 'transfer_attempted');
SET @sql = IF(@sql_check = 0, @sql, 'SELECT "transfer_attempted already exists" as info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- transfer_successful カラム追加（エラー無視）
SET @sql = 'ALTER TABLE call_logs ADD COLUMN transfer_successful tinyint(1) NOT NULL DEFAULT 0';
SET @sql_check = (SELECT COUNT(*) FROM information_schema.columns 
                  WHERE table_schema = DATABASE() 
                  AND table_name = 'call_logs' 
                  AND column_name = 'transfer_successful');
SET @sql = IF(@sql_check = 0, @sql, 'SELECT "transfer_successful already exists" as info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- transfer_target カラム追加（エラー無視）
SET @sql = 'ALTER TABLE call_logs ADD COLUMN transfer_target varchar(255) DEFAULT NULL';
SET @sql_check = (SELECT COUNT(*) FROM information_schema.columns 
                  WHERE table_schema = DATABASE() 
                  AND table_name = 'call_logs' 
                  AND column_name = 'transfer_target');
SET @sql = IF(@sql_check = 0, @sql, 'SELECT "transfer_target already exists" as info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- transfer_duration カラム追加（エラー無視）
SET @sql = 'ALTER TABLE call_logs ADD COLUMN transfer_duration int NOT NULL DEFAULT 0';
SET @sql_check = (SELECT COUNT(*) FROM information_schema.columns 
                  WHERE table_schema = DATABASE() 
                  AND table_name = 'call_logs' 
                  AND column_name = 'transfer_duration');
SET @sql = IF(@sql_check = 0, @sql, 'SELECT "transfer_duration already exists" as info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ivr_menu_reached カラム追加（エラー無視）
SET @sql = 'ALTER TABLE call_logs ADD COLUMN ivr_menu_reached tinyint(1) NOT NULL DEFAULT 0';
SET @sql_check = (SELECT COUNT(*) FROM information_schema.columns 
                  WHERE table_schema = DATABASE() 
                  AND table_name = 'call_logs' 
                  AND column_name = 'ivr_menu_reached');
SET @sql = IF(@sql_check = 0, @sql, 'SELECT "ivr_menu_reached already exists" as info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: 転送設定テーブル作成
SELECT '🔧 転送設定テーブル作成中...' as status;

CREATE TABLE IF NOT EXISTS transfer_settings (
  id int NOT NULL AUTO_INCREMENT,
  campaign_id int NOT NULL,
  transfer_enabled tinyint(1) NOT NULL DEFAULT 1,
  transfer_key varchar(10) NOT NULL DEFAULT '1',
  transfer_type enum('extension','external','queue','operator') NOT NULL DEFAULT 'external',
  transfer_target varchar(255) NOT NULL COMMENT '転送先（番号・内線・キュー名等）',
  auto_transfer_delay int NOT NULL DEFAULT 0 COMMENT '自動転送遅延（秒）',
  max_ring_time int NOT NULL DEFAULT 30 COMMENT '最大呼出時間（秒）',
  fallback_action enum('hangup','voicemail','retry') NOT NULL DEFAULT 'hangup',
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_campaign_id (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 4: 転送ログテーブル作成
CREATE TABLE IF NOT EXISTS transfer_logs (
  id int NOT NULL AUTO_INCREMENT,
  call_id varchar(255) NOT NULL,
  campaign_id int NOT NULL,
  transfer_key varchar(10) NOT NULL,
  transfer_target varchar(255) NOT NULL,
  transfer_status enum('initiated','ringing','answered','failed','abandoned') NOT NULL,
  transfer_start_time timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  transfer_answer_time timestamp NULL DEFAULT NULL,
  transfer_end_time timestamp NULL DEFAULT NULL,
  transfer_duration int NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_call_id (call_id),
  KEY idx_campaign_id (campaign_id),
  KEY idx_transfer_status (transfer_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 完了
SELECT '✅ 転送テーブル作成完了！' as message;
