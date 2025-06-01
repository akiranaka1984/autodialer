-- ===============================================
-- AutoDialer v2.1 - 転送機能完全統合版（修正版）
-- 日付: 2025年12月4日
-- エラー修正: disposition → status カラム統一
-- ===============================================

-- 外部キー制約を一時的に無効化（安全な更新のため）
SET FOREIGN_KEY_CHECKS = 0;

-- ===============================================
-- 1. 基本構造確認・保持
-- ===============================================

-- 既存のusersテーブル確認・作成
CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `role` enum('admin','user','operator') NOT NULL DEFAULT 'user',
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 既存のcaller_idsテーブル確認・保持
CREATE TABLE IF NOT EXISTS `caller_ids` (
  `id` int NOT NULL AUTO_INCREMENT,
  `number` varchar(20) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `provider` varchar(100) DEFAULT NULL,
  `domain` varchar(255) DEFAULT 'ito258258.site',
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===============================================
-- 2. SIP通話システム拡張
-- ===============================================

-- caller_channelsテーブル（SIPチャンネル管理）
CREATE TABLE IF NOT EXISTS `caller_channels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `caller_id_id` int NOT NULL,
  `username` varchar(100) NOT NULL,
  `password` varchar(100) NOT NULL,
  `channel_type` enum('inbound','outbound','both') NOT NULL DEFAULT 'both',
  `status` enum('available','busy','error','maintenance') NOT NULL DEFAULT 'available',
  `last_used` timestamp NULL DEFAULT NULL,
  `failure_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_caller_id` (`caller_id_id`),
  KEY `idx_status` (`status`),
  UNIQUE KEY `unique_username` (`username`),
  CONSTRAINT `fk_caller_channels_caller_id` FOREIGN KEY (`caller_id_id`) REFERENCES `caller_ids` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===============================================
-- 3. キャンペーン管理拡張
-- ===============================================

-- campaignsテーブル確認・保持
CREATE TABLE IF NOT EXISTS `campaigns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text,
  `caller_id_id` int DEFAULT NULL,
  `script` text,
  `status` enum('draft','active','paused','completed') NOT NULL DEFAULT 'draft',
  `max_concurrent_calls` int NOT NULL DEFAULT 1,
  `retry_attempts` int NOT NULL DEFAULT 0,
  `call_interval` int NOT NULL DEFAULT 30,
  `progress` decimal(5,2) NOT NULL DEFAULT 0.00,
  `ivr_deployed` tinyint(1) NOT NULL DEFAULT 0,
  `ivr_deploy_time` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_caller_id` (`caller_id_id`),
  CONSTRAINT `fk_campaigns_caller_id` FOREIGN KEY (`caller_id_id`) REFERENCES `caller_ids` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===============================================
-- 4. 🔥 転送機能テーブル群（新規）
-- ===============================================

-- キャンペーン別転送設定
CREATE TABLE IF NOT EXISTS `transfer_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `transfer_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `transfer_key` varchar(10) NOT NULL DEFAULT '1',
  `transfer_type` enum('extension','external','queue','operator') NOT NULL DEFAULT 'external',
  `transfer_target` varchar(255) NOT NULL COMMENT '転送先（番号・内線・キュー名等）',
  `auto_transfer_delay` int NOT NULL DEFAULT 0 COMMENT '自動転送遅延（秒）',
  `max_ring_time` int NOT NULL DEFAULT 30 COMMENT '最大呼出時間（秒）',
  `fallback_action` enum('hangup','voicemail','retry') NOT NULL DEFAULT 'hangup',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_campaign_key` (`campaign_id`, `transfer_key`),
  KEY `idx_campaign_id` (`campaign_id`),
  CONSTRAINT `fk_transfer_settings_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 転送実行ログ
CREATE TABLE IF NOT EXISTS `transfer_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `call_id` varchar(255) NOT NULL,
  `campaign_id` int NOT NULL,
  `transfer_key` varchar(10) NOT NULL,
  `transfer_target` varchar(255) NOT NULL,
  `transfer_status` enum('initiated','ringing','answered','failed','abandoned') NOT NULL,
  `transfer_start_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `transfer_answer_time` timestamp NULL DEFAULT NULL,
  `transfer_end_time` timestamp NULL DEFAULT NULL,
  `transfer_duration` int NOT NULL DEFAULT 0,
  `error_message` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_call_id` (`call_id`),
  KEY `idx_campaign_id` (`campaign_id`),
  KEY `idx_transfer_status` (`transfer_status`),
  KEY `idx_transfer_start_time` (`transfer_start_time`),
  CONSTRAINT `fk_transfer_logs_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===============================================
-- 5. 連絡先管理拡張
-- ===============================================

-- contactsテーブル確認・保持
CREATE TABLE IF NOT EXISTS `contacts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `phone` varchar(20) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `company` varchar(255) DEFAULT NULL,
  `status` enum('pending','called','completed','failed','dnc') NOT NULL DEFAULT 'pending',
  `attempt_count` int NOT NULL DEFAULT 0,
  `last_attempt` timestamp NULL DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_campaign_id` (`campaign_id`),
  KEY `idx_phone` (`phone`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_contacts_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===============================================
-- 6. 通話ログ拡張（転送対応）
-- ===============================================

-- 通話ログテーブル（転送情報追加）
CREATE TABLE IF NOT EXISTS `call_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `call_id` varchar(255) NOT NULL,
  `contact_id` int DEFAULT NULL,
  `campaign_id` int DEFAULT NULL,
  `caller_id_id` int DEFAULT NULL,
  `phone_number` varchar(20) NOT NULL,
  `start_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `end_time` timestamp NULL DEFAULT NULL,
  `duration` int NOT NULL DEFAULT 0,
  `status` enum('ORIGINATING','RINGING','ANSWERED','NO ANSWER','BUSY','FAILED','COMPLETED') NOT NULL DEFAULT 'ORIGINATING',
  `keypress` varchar(10) DEFAULT NULL,
  `test_call` tinyint(1) NOT NULL DEFAULT 0,
  `call_provider` varchar(50) DEFAULT 'sip',
  `has_audio` tinyint(1) NOT NULL DEFAULT 0,
  `audio_file_count` int NOT NULL DEFAULT 0,
  -- 🔥 転送関連カラム追加
  `transfer_attempted` tinyint(1) NOT NULL DEFAULT 0,
  `transfer_successful` tinyint(1) NOT NULL DEFAULT 0,
  `transfer_target` varchar(255) DEFAULT NULL,
  `transfer_duration` int NOT NULL DEFAULT 0,
  `ivr_menu_reached` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_call_id` (`call_id`),
  KEY `idx_contact_id` (`contact_id`),
  KEY `idx_campaign_id` (`campaign_id`),
  KEY `idx_caller_id` (`caller_id_id`),
  KEY `idx_start_time` (`start_time`),
  KEY `idx_status` (`status`),
  KEY `idx_transfer_attempted` (`transfer_attempted`),
  CONSTRAINT `fk_call_logs_contact` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_call_logs_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_call_logs_caller_id` FOREIGN KEY (`caller_id_id`) REFERENCES `caller_ids` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===============================================
-- 7. 音声ファイル管理拡張
-- ===============================================

-- 音声ファイルテーブル
CREATE TABLE IF NOT EXISTS `audio_files` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `filename` varchar(255) NOT NULL,
  `path` varchar(500) NOT NULL,
  `file_size` bigint NOT NULL DEFAULT 0,
  `duration` decimal(10,2) DEFAULT NULL,
  `format` varchar(20) DEFAULT 'wav',
  `sample_rate` int DEFAULT 8000,
  `description` text,
  `upload_user_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_filename` (`filename`),
  KEY `idx_name` (`name`),
  KEY `idx_upload_user` (`upload_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- キャンペーン音声関連付け
CREATE TABLE IF NOT EXISTS `campaign_audio` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `audio_file_id` int NOT NULL,
  `audio_type` enum('welcome','menu','goodbye','error','hold','transfer') NOT NULL,
  `play_order` int NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_campaign_audio_type` (`campaign_id`, `audio_type`, `play_order`),
  KEY `idx_campaign_id` (`campaign_id`),
  KEY `idx_audio_file_id` (`audio_file_id`),
  CONSTRAINT `fk_campaign_audio_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_campaign_audio_file` FOREIGN KEY (`audio_file_id`) REFERENCES `audio_files` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 音声再生ログ
CREATE TABLE IF NOT EXISTS `audio_playback_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `call_id` varchar(255) NOT NULL,
  `audio_file_id` int NOT NULL,
  `audio_type` enum('welcome','menu','goodbye','error','hold','transfer') NOT NULL,
  `play_start_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `play_end_time` timestamp NULL DEFAULT NULL,
  `play_duration` decimal(10,2) DEFAULT NULL,
  `completed` tinyint(1) NOT NULL DEFAULT 0,
  `interrupted_by` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_call_id` (`call_id`),
  KEY `idx_audio_file_id` (`audio_file_id`),
  KEY `idx_audio_type` (`audio_type`),
  CONSTRAINT `fk_audio_playback_audio_file` FOREIGN KEY (`audio_file_id`) REFERENCES `audio_files` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===============================================
-- 8. IVR設定管理拡張
-- ===============================================

-- IVR設定テーブル
CREATE TABLE IF NOT EXISTS `campaign_ivr_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `config` json NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `deployed` tinyint(1) NOT NULL DEFAULT 0,
  `deployed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_campaign_config` (`campaign_id`),
  KEY `idx_deployed` (`deployed`),
  CONSTRAINT `fk_campaign_ivr_config_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===============================================
-- 9. DNCリスト管理拡張
-- ===============================================

-- DNCリストテーブル
CREATE TABLE IF NOT EXISTS `dnc_list` (
  `id` int NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `source` enum('user_request','manual','system','import') NOT NULL DEFAULT 'user_request',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_phone` (`phone`),
  KEY `idx_phone` (`phone`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===============================================
-- 10. オペレーター管理（将来拡張）
-- ===============================================

-- オペレーターテーブル
CREATE TABLE IF NOT EXISTS `operators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `operator_code` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `extension` varchar(20) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `skill_level` enum('trainee','junior','senior','expert') NOT NULL DEFAULT 'junior',
  `status` enum('available','busy','offline','break') NOT NULL DEFAULT 'offline',
  `max_concurrent_calls` int NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_operator_code` (`operator_code`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_operators_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- オペレーターシフト管理
CREATE TABLE IF NOT EXISTS `operator_shifts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `operator_id` int NOT NULL,
  `shift_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `break_start` time DEFAULT NULL,
  `break_end` time DEFAULT NULL,
  `status` enum('scheduled','active','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  `actual_start_time` timestamp NULL DEFAULT NULL,
  `actual_end_time` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_operator_id` (`operator_id`),
  KEY `idx_shift_date` (`shift_date`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_operator_shifts_operator` FOREIGN KEY (`operator_id`) REFERENCES `operators` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- オペレーター通話履歴
CREATE TABLE IF NOT EXISTS `operator_call_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `call_id` varchar(255) NOT NULL,
  `operator_id` int NOT NULL,
  `transfer_log_id` int DEFAULT NULL,
  `answered_at` timestamp NULL DEFAULT NULL,
  `ended_at` timestamp NULL DEFAULT NULL,
  `duration` int NOT NULL DEFAULT 0,
  `call_result` enum('sale','appointment','callback','no_interest','dnc') DEFAULT NULL,
  `notes` text,
  `rating` int DEFAULT NULL COMMENT '1-5 star rating',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_call_id` (`call_id`),
  KEY `idx_operator_id` (`operator_id`),
  KEY `idx_transfer_log_id` (`transfer_log_id`),
  KEY `idx_answered_at` (`answered_at`),
  CONSTRAINT `fk_operator_call_logs_operator` FOREIGN KEY (`operator_id`) REFERENCES `operators` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_operator_call_logs_transfer` FOREIGN KEY (`transfer_log_id`) REFERENCES `transfer_logs` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===============================================
-- 11. システム管理・ログ
-- ===============================================

-- システム設定
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text,
  `setting_type` enum('string','integer','boolean','json') NOT NULL DEFAULT 'string',
  `description` text,
  `category` varchar(50) DEFAULT 'general',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_setting_key` (`setting_key`),
  KEY `idx_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- システムログ
CREATE TABLE IF NOT EXISTS `system_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `level` enum('debug','info','warn','error','fatal') NOT NULL DEFAULT 'info',
  `category` varchar(50) NOT NULL DEFAULT 'system',
  `message` text NOT NULL,
  `context` json DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_level` (`level`),
  KEY `idx_category` (`category`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===============================================
-- 12. 統計・レポート用ビュー（修正版）
-- ===============================================

-- 転送統計ビュー（修正版：statusカラム使用）
DROP VIEW IF EXISTS `transfer_statistics`;
CREATE VIEW `transfer_statistics` AS
SELECT 
  c.id as campaign_id,
  c.name as campaign_name,
  COUNT(cl.id) as total_calls,
  COUNT(CASE WHEN cl.transfer_attempted = 1 THEN 1 END) as transfer_attempts,
  COUNT(CASE WHEN cl.transfer_successful = 1 THEN 1 END) as successful_transfers,
  ROUND((COUNT(CASE WHEN cl.transfer_successful = 1 THEN 1 END) * 100.0) / 
        NULLIF(COUNT(CASE WHEN cl.transfer_attempted = 1 THEN 1 END), 0), 2) as transfer_success_rate,
  ROUND(AVG(CASE WHEN cl.transfer_successful = 1 THEN cl.transfer_duration END), 2) as avg_transfer_duration,
  COUNT(CASE WHEN cl.status = 'ANSWERED' THEN 1 END) as answered_calls,
  COUNT(CASE WHEN cl.keypress = '1' THEN 1 END) as operator_requests,
  COUNT(CASE WHEN cl.keypress = '9' THEN 1 END) as dnc_requests
FROM campaigns c
LEFT JOIN call_logs cl ON c.id = cl.campaign_id
WHERE c.status = 'active' OR cl.id IS NOT NULL
GROUP BY c.id, c.name;

-- キャンペーン統計ビュー（修正版）
DROP VIEW IF EXISTS `campaign_statistics`;
CREATE VIEW `campaign_statistics` AS
SELECT 
  c.id as campaign_id,
  c.name as campaign_name,
  c.status as campaign_status,
  COUNT(co.id) as total_contacts,
  COUNT(CASE WHEN co.status = 'pending' THEN 1 END) as pending_contacts,
  COUNT(CASE WHEN co.status = 'called' THEN 1 END) as called_contacts,
  COUNT(CASE WHEN co.status = 'completed' THEN 1 END) as completed_contacts,
  COUNT(CASE WHEN co.status = 'failed' THEN 1 END) as failed_contacts,
  COUNT(CASE WHEN co.status = 'dnc' THEN 1 END) as dnc_contacts,
  COUNT(cl.id) as total_call_logs,
  COUNT(CASE WHEN cl.status = 'ANSWERED' THEN 1 END) as answered_calls,
  ROUND(AVG(cl.duration), 2) as avg_call_duration,
  ROUND((COUNT(CASE WHEN cl.status = 'ANSWERED' THEN 1 END) * 100.0) / 
        NULLIF(COUNT(cl.id), 0), 2) as answer_rate,
  c.created_at as campaign_created_at,
  c.updated_at as campaign_updated_at
FROM campaigns c
LEFT JOIN contacts co ON c.id = co.campaign_id
LEFT JOIN call_logs cl ON c.id = cl.campaign_id
GROUP BY c.id, c.name, c.status, c.created_at, c.updated_at;

-- オペレーター統計ビュー
DROP VIEW IF EXISTS `operator_statistics`;
CREATE VIEW `operator_statistics` AS
SELECT 
  o.id as operator_id,
  o.name as operator_name,
  o.operator_code,
  o.status as current_status,
  COUNT(ocl.id) as total_calls_handled,
  ROUND(AVG(ocl.duration), 2) as avg_call_duration,
  COUNT(CASE WHEN ocl.call_result = 'sale' THEN 1 END) as sales_count,
  COUNT(CASE WHEN ocl.call_result = 'appointment' THEN 1 END) as appointments_count,
  COUNT(CASE WHEN ocl.call_result = 'dnc' THEN 1 END) as dnc_count,
  ROUND(AVG(ocl.rating), 2) as avg_rating,
  MAX(ocl.answered_at) as last_call_time,
  -- 本日の統計
  COUNT(CASE WHEN DATE(ocl.answered_at) = CURDATE() THEN 1 END) as calls_today,
  ROUND(AVG(CASE WHEN DATE(ocl.answered_at) = CURDATE() THEN ocl.duration END), 2) as avg_duration_today
FROM operators o
LEFT JOIN operator_call_logs ocl ON o.id = ocl.operator_id
GROUP BY o.id, o.name, o.operator_code, o.status;

-- ===============================================
-- 13. 初期データ・設定投入
-- ===============================================

-- 基本システム設定（エラー無視で挿入）
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`, `setting_type`, `description`, `category`) VALUES
('dialer_enabled', 'true', 'boolean', '自動発信システムの有効/無効', 'dialer'),
('max_concurrent_calls', '5', 'integer', 'システム全体の最大同時通話数', 'dialer'),
('call_retry_limit', '3', 'integer', '発信リトライ回数上限', 'dialer'),
('call_interval_seconds', '30', 'integer', '発信間隔（秒）', 'dialer'),
('transfer_timeout_seconds', '30', 'integer', '転送タイムアウト時間（秒）', 'transfer'),
('ivr_timeout_seconds', '10', 'integer', 'IVRメニューのタイムアウト時間（秒）', 'ivr'),
('audio_format', 'wav', 'string', 'デフォルト音声ファイル形式', 'audio'),
('audio_sample_rate', '8000', 'integer', 'デフォルト音声サンプルレート', 'audio'),
('sip_server_domain', 'ito258258.site', 'string', 'SIPサーバードメイン', 'sip'),
('default_caller_id', '03-5946-8520', 'string', 'デフォルト発信者番号', 'dialer');

-- 基本管理ユーザー（存在しない場合のみ）
INSERT IGNORE INTO `users` (`username`, `password`, `name`, `role`) VALUES
('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'システム管理者', 'admin'),
('operator1', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'オペレーター1', 'operator');

-- 外部キー制約を再有効化
SET FOREIGN_KEY_CHECKS = 1;

-- ===============================================
-- 完了メッセージ
-- ===============================================
SELECT '✅ AutoDialer v2.1 スキーマ適用完了！転送機能統合済み' as message;
SELECT 'テーブル数: ', COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = DATABASE();
SELECT 'ビュー数: ', COUNT(*) as view_count FROM information_schema.views WHERE table_schema = DATABASE();
