-- =====================================================
-- AutoDialer システム完全データベーススキーマ v2.0
-- 転送機能・音声システム・IVR・統計機能すべて対応
-- 作成日: 2025年6月1日
-- =====================================================

-- データベース作成・選択
-- CREATE DATABASE IF NOT EXISTS autodialer DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE autodialer;

-- エラー無視モード（既存環境での安全な更新）
SET sql_mode = '';
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================
-- 1. ユーザー・認証関連テーブル
-- =====================================================

-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  email VARCHAR(100),
  role ENUM('admin', 'user', 'operator', 'supervisor') DEFAULT 'user',
  status ENUM('active', 'inactive') DEFAULT 'active',
  last_login DATETIME,
  login_attempts INT DEFAULT 0,
  locked_until DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_username (username),
  INDEX idx_status (status),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ユーザー管理テーブル';

-- =====================================================
-- 2. 発信者番号・SIP関連テーブル
-- =====================================================

-- メイン発信者番号テーブル
CREATE TABLE IF NOT EXISTS caller_ids (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(20) NOT NULL,
  description VARCHAR(255),
  provider VARCHAR(100),
  domain VARCHAR(100) DEFAULT 'ito258258.site',
  active BOOLEAN DEFAULT true,
  max_concurrent_calls INT DEFAULT 5,
  priority INT DEFAULT 1 COMMENT '優先度（高いほど優先）',
  cost_per_minute DECIMAL(5,4) DEFAULT 0.0000 COMMENT '分あたりコスト',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_number (number),
  INDEX idx_active (active),
  INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='発信者番号管理テーブル';

-- SIPチャンネルテーブル
CREATE TABLE IF NOT EXISTS caller_channels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  caller_id_id INT NOT NULL,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(50) NOT NULL,
  status ENUM('available', 'busy', 'error', 'maintenance') DEFAULT 'available',
  last_used DATETIME NULL,
  total_calls INT DEFAULT 0,
  failed_calls INT DEFAULT 0,
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (caller_id_id) REFERENCES caller_ids(id) ON DELETE CASCADE,
  INDEX idx_caller_id (caller_id_id),
  INDEX idx_status (status),
  INDEX idx_last_used (last_used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SIPチャンネル管理テーブル';

-- =====================================================
-- 3. キャンペーン関連テーブル
-- =====================================================

-- キャンペーンテーブル（完全版）
CREATE TABLE IF NOT EXISTS campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  status ENUM('draft', 'active', 'paused', 'completed', 'archived') DEFAULT 'draft',
  caller_id_id INT,
  script TEXT,
  retry_attempts INT DEFAULT 0,
  retry_interval INT DEFAULT 300 COMMENT 'リトライ間隔（秒）',
  max_concurrent_calls INT DEFAULT 5,
  call_rate_limit INT DEFAULT 10 COMMENT '分あたり最大発信数',
  schedule_start DATETIME,
  schedule_end DATETIME,
  working_hours_start TIME DEFAULT '09:00:00',
  working_hours_end TIME DEFAULT '18:00:00',
  working_days VARCHAR(20) DEFAULT '1,2,3,4,5' COMMENT '営業日（1=月曜）',
  timezone VARCHAR(50) DEFAULT 'Asia/Tokyo',
  progress INT DEFAULT 0 COMMENT '進捗率（0-100%）',
  completion_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT '完了率',
  
  -- IVR関連
  ivr_enabled BOOLEAN DEFAULT true,
  ivr_deployed TINYINT(1) DEFAULT 0,
  ivr_deploy_time TIMESTAMP NULL,
  
  -- 転送関連
  transfer_enabled BOOLEAN DEFAULT true,
  default_transfer_number VARCHAR(20) NULL,
  
  -- 統計関連
  total_contacts INT DEFAULT 0,
  contacted_count INT DEFAULT 0,
  completed_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  dnc_count INT DEFAULT 0,
  transferred_count INT DEFAULT 0,
  
  -- タイムスタンプ
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  
  FOREIGN KEY (caller_id_id) REFERENCES caller_ids(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_caller_id (caller_id_id),
  INDEX idx_created_at (created_at),
  INDEX idx_progress (progress)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='キャンペーン管理テーブル';

-- 連絡先リストテーブル（拡張版）
CREATE TABLE IF NOT EXISTS contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  company VARCHAR(100),
  email VARCHAR(255),
  status ENUM('pending', 'called', 'completed', 'failed', 'dnc', 'transferred', 'scheduled') DEFAULT 'pending',
  priority INT DEFAULT 1 COMMENT '優先度（高いほど優先）',
  
  -- 試行関連
  last_attempt DATETIME,
  next_attempt DATETIME,
  attempt_count INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  
  -- 結果関連
  last_call_duration INT DEFAULT 0,
  last_call_status VARCHAR(50),
  last_keypress VARCHAR(10),
  
  -- カスタムフィールド
  custom_field1 VARCHAR(255),
  custom_field2 VARCHAR(255),
  custom_field3 VARCHAR(255),
  notes TEXT,
  
  -- タイムスタンプ
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  INDEX idx_campaign_status (campaign_id, status),
  INDEX idx_phone (phone),
  INDEX idx_next_attempt (next_attempt),
  INDEX idx_priority (priority),
  UNIQUE KEY unique_campaign_phone (campaign_id, phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='連絡先管理テーブル';

-- =====================================================
-- 4. 通話ログ・統計テーブル
-- =====================================================

-- 通話ログテーブル（完全版）
CREATE TABLE IF NOT EXISTS call_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  call_id VARCHAR(100) UNIQUE,
  campaign_id INT,
  contact_id INT,
  caller_id_id INT,
  phone_number VARCHAR(20),
  
  -- 通話時刻
  start_time DATETIME,
  end_time DATETIME,
  duration INT DEFAULT 0 COMMENT '通話時間（秒）',
  
  -- 通話結果
  status VARCHAR(50),
  disposition ENUM('ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED', 'CONGESTION', 'TRANSFERRED') DEFAULT 'FAILED',
  keypress VARCHAR(10),
  keypress_detected VARCHAR(10) COMMENT '実際に検知されたキー',
  
  -- プロバイダ情報
  call_provider VARCHAR(50) DEFAULT 'sip',
  sip_account_used VARCHAR(50),
  server_used VARCHAR(100),
  
  -- 音声関連
  has_audio TINYINT(1) DEFAULT 0,
  audio_file_count INT DEFAULT 0,
  audio_played_at TIMESTAMP NULL,
  audio_duration INT DEFAULT 0 COMMENT '音声再生時間（秒）',
  
  -- 🎯 転送関連
  transfer_number VARCHAR(20) NULL COMMENT '転送先電話番号',
  transfer_time DATETIME NULL COMMENT '転送実行時刻',
  transfer_status ENUM('none', 'initiated', 'connected', 'failed') DEFAULT 'none',
  transfer_duration INT DEFAULT 0 COMMENT '転送通話時間（秒）',
  
  -- コスト・品質
  call_cost DECIMAL(8,4) DEFAULT 0.0000,
  audio_quality INT DEFAULT 0 COMMENT '音声品質（1-5）',
  
  -- フラグ
  test_call BOOLEAN DEFAULT FALSE,
  retry_call BOOLEAN DEFAULT FALSE,
  
  -- タイムスタンプ
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (caller_id_id) REFERENCES caller_ids(id) ON DELETE SET NULL,
  
  INDEX idx_call_id (call_id),
  INDEX idx_campaign_id (campaign_id),
  INDEX idx_start_time (start_time),
  INDEX idx_status (status),
  INDEX idx_transfer (transfer_number, transfer_time),
  INDEX idx_keypress (keypress_detected),
  INDEX idx_disposition (disposition)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通話ログテーブル';

-- =====================================================
-- 5. 🎯 転送機能専用テーブル
-- =====================================================

-- 転送設定テーブル
CREATE TABLE IF NOT EXISTS transfer_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  transfer_enabled BOOLEAN DEFAULT true COMMENT '転送機能有効/無効',
  transfer_key VARCHAR(5) DEFAULT '1' COMMENT '転送トリガーキー',
  transfer_timeout INT DEFAULT 15 COMMENT '転送待機時間（秒）',
  transfer_retry_attempts INT DEFAULT 2 COMMENT '転送リトライ回数',
  announcement_before_transfer TEXT NULL COMMENT '転送前アナウンス',
  announcement_after_transfer TEXT NULL COMMENT '転送後アナウンス',
  transfer_hours_start TIME DEFAULT '09:00:00' COMMENT '転送受付開始時刻',
  transfer_hours_end TIME DEFAULT '18:00:00' COMMENT '転送受付終了時刻',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_campaign_transfer (campaign_id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  INDEX idx_campaign_transfer (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='転送設定テーブル';

-- 転送詳細ログテーブル
CREATE TABLE IF NOT EXISTS transfer_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  original_call_id VARCHAR(100) NOT NULL COMMENT '元の通話ID',
  transfer_call_id VARCHAR(100) NULL COMMENT '転送通話ID', 
  campaign_id INT NOT NULL,
  contact_id INT NULL,
  original_number VARCHAR(20) NOT NULL COMMENT '元の発信先番号',
  transfer_number VARCHAR(20) NOT NULL COMMENT '転送先番号',
  keypress VARCHAR(10) NULL COMMENT 'トリガーキー',
  
  -- 転送タイミング
  transfer_initiated_at DATETIME NOT NULL COMMENT '転送開始時刻',
  transfer_connected_at DATETIME NULL COMMENT '転送接続時刻',
  transfer_ended_at DATETIME NULL COMMENT '転送終了時刻',
  
  -- 転送結果
  transfer_status ENUM('initiated', 'ringing', 'connected', 'failed', 'completed', 'abandoned') DEFAULT 'initiated',
  duration INT NULL COMMENT '転送通話時間（秒）',
  failure_reason TEXT NULL COMMENT '転送失敗理由',
  
  -- オペレーター情報
  operator_id INT NULL COMMENT '対応オペレーターID',
  operator_satisfaction INT NULL COMMENT 'オペレーター評価（1-5）',
  
  -- コスト
  transfer_cost DECIMAL(8,4) DEFAULT 0.0000,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  
  INDEX idx_campaign_id (campaign_id),
  INDEX idx_transfer_time (transfer_initiated_at),
  INDEX idx_original_call_id (original_call_id),
  INDEX idx_transfer_status (transfer_status),
  INDEX idx_transfer_number (transfer_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='転送詳細ログテーブル';

-- =====================================================
-- 6. 音声・IVR関連テーブル
-- =====================================================

-- 音声ファイルテーブル
CREATE TABLE IF NOT EXISTS audio_files (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  mimetype VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  duration INT COMMENT '音声長（秒）',
  bitrate INT COMMENT 'ビットレート',
  sample_rate INT COMMENT 'サンプリングレート',
  channels INT DEFAULT 1 COMMENT 'チャンネル数',
  description TEXT NULL,
  category ENUM('system', 'campaign', 'custom') DEFAULT 'custom',
  usage_count INT DEFAULT 0 COMMENT '使用回数',
  created_by INT NULL COMMENT '作成者ID',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_category (category),
  INDEX idx_usage_count (usage_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='音声ファイル管理テーブル';

-- キャンペーンと音声ファイルの関連テーブル
CREATE TABLE IF NOT EXISTS campaign_audio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  audio_file_id VARCHAR(36) NOT NULL,
  audio_type ENUM('welcome', 'menu', 'goodbye', 'error', 'transfer', 'hold') NOT NULL,
  play_order INT DEFAULT 1 COMMENT '再生順序',
  loop_count INT DEFAULT 1 COMMENT 'ループ回数',
  volume_level INT DEFAULT 100 COMMENT '音量（0-100）',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (audio_file_id) REFERENCES audio_files(id) ON DELETE CASCADE,
  UNIQUE KEY unique_campaign_audio_type (campaign_id, audio_type),
  INDEX idx_play_order (play_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='キャンペーン音声関連付けテーブル';

-- IVR設定テーブル
CREATE TABLE IF NOT EXISTS campaign_ivr_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  config TEXT NOT NULL COMMENT 'JSON形式のIVR設定',
  version INT DEFAULT 1 COMMENT '設定バージョン',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  UNIQUE KEY unique_campaign_ivr_config (campaign_id),
  INDEX idx_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='IVR設定テーブル';

-- 音声再生ログテーブル
CREATE TABLE IF NOT EXISTS audio_playback_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    call_id VARCHAR(255) NOT NULL,
    audio_file_id VARCHAR(36),
    audio_type ENUM('welcome', 'menu', 'goodbye', 'error', 'transfer', 'hold') NOT NULL,
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('played', 'failed', 'skipped', 'interrupted') DEFAULT 'played',
    duration_ms INT DEFAULT 0 COMMENT '実際の再生時間（ミリ秒）',
    error_message TEXT,
    play_order INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (audio_file_id) REFERENCES audio_files(id) ON DELETE SET NULL,
    INDEX idx_call_id (call_id),
    INDEX idx_audio_file_id (audio_file_id),
    INDEX idx_played_at (played_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='音声再生ログテーブル';

-- =====================================================
-- 7. オペレーター管理テーブル
-- =====================================================

-- オペレーター管理テーブル
CREATE TABLE IF NOT EXISTS operators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  operator_id VARCHAR(20) UNIQUE NOT NULL COMMENT 'オペレーターID（例：OP001）',
  extension VARCHAR(20) NULL COMMENT '内線番号',
  status ENUM('available', 'busy', 'offline', 'break', 'training') DEFAULT 'offline',
  current_call_id VARCHAR(100) NULL,
  skills JSON COMMENT '対応可能スキル',
  languages JSON COMMENT '対応言語',
  max_concurrent_calls INT DEFAULT 1,
  priority INT DEFAULT 1 COMMENT '優先度',
  hourly_rate DECIMAL(8,2) DEFAULT 0.00 COMMENT '時給',
  performance_score DECIMAL(3,2) DEFAULT 0.00 COMMENT 'パフォーマンススコア（0-1）',
  
  -- 統計
  total_calls_handled INT DEFAULT 0,
  total_talk_time INT DEFAULT 0 COMMENT '総通話時間（秒）',
  avg_call_duration INT DEFAULT 0,
  customer_satisfaction DECIMAL(3,2) DEFAULT 0.00,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='オペレーター管理テーブル';

-- オペレーターシフト管理
CREATE TABLE IF NOT EXISTS operator_shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operator_id INT NOT NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_start TIME,
  break_end TIME,
  status ENUM('scheduled', 'active', 'completed', 'cancelled', 'no_show') DEFAULT 'scheduled',
  actual_start_time DATETIME NULL,
  actual_end_time DATETIME NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE CASCADE,
  UNIQUE KEY unique_shift (operator_id, shift_date, start_time),
  INDEX idx_shift_date (shift_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='オペレーターシフト管理テーブル';

-- オペレーター対応履歴
CREATE TABLE IF NOT EXISTS operator_call_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operator_id INT NOT NULL,
  call_log_id INT NOT NULL,
  transfer_log_id INT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration INT COMMENT '対応時間（秒）',
  disposition ENUM('completed', 'transferred', 'dropped', 'voicemail', 'callback_scheduled') DEFAULT 'completed',
  resolution ENUM('resolved', 'escalated', 'follow_up_required', 'no_resolution') DEFAULT 'resolved',
  notes TEXT,
  customer_satisfaction INT COMMENT '顧客満足度（1-5）',
  internal_quality_score INT COMMENT '内部品質スコア（1-5）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (operator_id) REFERENCES operators(id),
  FOREIGN KEY (call_log_id) REFERENCES call_logs(id),
  FOREIGN KEY (transfer_log_id) REFERENCES transfer_logs(id),
  INDEX idx_operator_date (operator_id, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='オペレーター対応履歴テーブル';

-- =====================================================
-- 8. DNC・コンプライアンス関連テーブル
-- =====================================================

-- DNCリストテーブル（拡張版）
CREATE TABLE IF NOT EXISTS dnc_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) UNIQUE,
  reason TEXT,
  source ENUM('customer_request', 'operator_added', 'system_auto', 'import') DEFAULT 'customer_request',
  campaign_id INT NULL COMMENT '登録元キャンペーン',
  operator_id INT NULL COMMENT '登録オペレーター',
  expiry_date DATE NULL COMMENT 'DNC解除予定日',
  is_permanent BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE SET NULL,
  INDEX idx_phone (phone),
  INDEX idx_expiry_date (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DNCリスト管理テーブル';

-- =====================================================
-- 9. システム設定・ログテーブル
-- =====================================================

-- システム設定テーブル
CREATE TABLE IF NOT EXISTS system_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  setting_type ENUM('string', 'integer', 'boolean', 'json') DEFAULT 'string',
  description TEXT,
  is_public BOOLEAN DEFAULT false COMMENT '一般ユーザーに表示するか',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_setting_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='システム設定テーブル';

-- システムログテーブル
CREATE TABLE IF NOT EXISTS system_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  level ENUM('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL') DEFAULT 'INFO',
  component VARCHAR(50) NOT NULL COMMENT 'ログ出力元（dialerService, sipService等）',
  message TEXT NOT NULL,
  details JSON NULL COMMENT '詳細情報',
  user_id INT NULL,
  session_id VARCHAR(100) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_level (level),
  INDEX idx_component (component),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='システムログテーブル';

-- =====================================================
-- 10. 統計・分析用ビュー
-- =====================================================

-- 転送統計ビュー
CREATE OR REPLACE VIEW transfer_statistics AS
SELECT 
  c.id as campaign_id,
  c.name as campaign_name,
  COUNT(tl.id) as total_transfers,
  SUM(CASE WHEN tl.transfer_status = 'completed' THEN 1 ELSE 0 END) as successful_transfers,
  SUM(CASE WHEN tl.transfer_status = 'failed' THEN 1 ELSE 0 END) as failed_transfers,
  ROUND(
    (SUM(CASE WHEN tl.transfer_status = 'completed' THEN 1 ELSE 0 END) / 
     NULLIF(COUNT(tl.id), 0)) * 100, 2
  ) as transfer_success_rate,
  ROUND(AVG(tl.duration), 2) as avg_transfer_duration,
  MAX(tl.transfer_initiated_at) as last_transfer_time,
  SUM(tl.transfer_cost) as total_transfer_cost
FROM campaigns c
LEFT JOIN transfer_logs tl ON c.id = tl.campaign_id
GROUP BY c.id, c.name;

-- キャンペーン統計ビュー
CREATE OR REPLACE VIEW campaign_statistics AS
SELECT 
  c.id as campaign_id,
  c.name as campaign_name,
  c.status,
  ci.number as caller_number,
  
  -- 連絡先統計
  COUNT(ct.id) as total_contacts,
  SUM(CASE WHEN ct.status = 'pending' THEN 1 ELSE 0 END) as pending_contacts,
  SUM(CASE WHEN ct.status = 'completed' THEN 1 ELSE 0 END) as completed_contacts,
  SUM(CASE WHEN ct.status = 'transferred' THEN 1 ELSE 0 END) as transferred_contacts,
  SUM(CASE WHEN ct.status = 'dnc' THEN 1 ELSE 0 END) as dnc_contacts,
  
  -- 通話統計
  COUNT(cl.id) as total_calls,
  SUM(CASE WHEN cl.disposition = 'ANSWERED' THEN 1 ELSE 0 END) as answered_calls,
  SUM(CASE WHEN cl.transfer_status != 'none' THEN 1 ELSE 0 END) as transferred_calls,
  ROUND(AVG(cl.duration), 2) as avg_call_duration,
  
  -- 転送率
  ROUND(
    (SUM(CASE WHEN cl.transfer_status != 'none' THEN 1 ELSE 0 END) / 
     NULLIF(COUNT(cl.id), 0)) * 100, 2
  ) as transfer_rate_percent,
  
  -- コスト
  SUM(cl.call_cost) as total_call_cost,
  
  -- 期間
  c.created_at,
  c.started_at,
  c.completed_at
  
FROM campaigns c
LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
LEFT JOIN contacts ct ON c.id = ct.campaign_id
LEFT JOIN call_logs cl ON c.id = cl.campaign_id
GROUP BY c.id, c.name, c.status, ci.number, c.created_at, c.started_at, c.completed_at;

-- オペレーター統計ビュー
CREATE OR REPLACE VIEW operator_statistics AS
SELECT 
  o.id as operator_id,
  o.operator_id,
  u.name as operator_name,
  o.status,
  
  -- 通話統計
  COUNT(ocl.id) as total_calls_handled,
  ROUND(AVG(ocl.duration), 2) as avg_call_duration,
  SUM(ocl.duration) as total_talk_time,
  
  -- 品質統計
  ROUND(AVG(ocl.customer_satisfaction), 2) as avg_customer_satisfaction,
  ROUND(AVG(ocl.internal_quality_score), 2) as avg_quality_score,
  
  -- 解決率
  ROUND(
    (SUM(CASE WHEN ocl.resolution = 'resolved' THEN 1 ELSE 0 END) / 
     NULLIF(COUNT(ocl.id), 0)) * 100, 2
  ) as resolution_rate,
  
  -- 最新活動
  MAX(ocl.end_time) as last_call_time
  
FROM operators o
JOIN users u ON o.user_id = u.id
LEFT JOIN operator_call_logs ocl ON o.id = ocl.operator_id
GROUP BY o.id, o.operator_id, u.name, o.status;

-- =====================================================
-- 11. デフォルトデータ・設定値
-- =====================================================

-- システム設定のデフォルト値
INSERT IGNORE INTO system_settings (setting_key, setting_value, setting_type, description, is_public) VALUES
('max_concurrent_calls', '10', 'integer', '最大同時通話数', true),
('default_call_timeout', '30', 'integer', 'デフォルト通話タイムアウト（秒）', true),
('auto_retry_enabled', 'true', 'boolean', '自動リトライ有効', true),
('transfer_default_timeout', '15', 'integer', 'デフォルト転送待機時間（秒）', true),
('dnc_check_enabled', 'true', 'boolean', 'DNCチェック有効', true),
('call_recording_enabled', 'false', 'boolean', '通話録音有効', false),
('system_timezone', 'Asia/Tokyo', 'string', 'システムタイムゾーン', true);

-- 既存キャンペーンの転送設定初期化
INSERT IGNORE INTO transfer_settings (campaign_id, transfer_enabled, transfer_key, transfer_timeout)
SELECT id, true, '1', 15 
FROM campaigns 
WHERE id NOT IN (SELECT campaign_id FROM transfer_settings WHERE campaign_id IS NOT NULL);

-- =====================================================
-- 12. インデックス最適化・外部キー確認
-- =====================================================

-- パフォーマンス向上用インデックス
CREATE INDEX IF NOT EXISTS idx_call_logs_transfer_stats ON call_logs(campaign_id, transfer_status, start_time);
CREATE INDEX IF NOT EXISTS idx_contacts_next_attempt ON contacts(next_attempt, status);
CREATE INDEX IF NOT EXISTS idx_transfer_logs_campaign_time ON transfer_logs(campaign_id, transfer_initiated_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(status, created_at);

-- 外部キー制約を元に戻す
SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- 13. 完了確認・検証
-- =====================================================

-- テーブル一覧表示
SELECT 'AutoDialer Schema v2.0 - Installation completed!' as status;

SHOW TABLES;

-- 重要テーブルのレコード数確認
SELECT 
  'campaigns' as table_name, COUNT(*) as record_count FROM campaigns
UNION ALL
SELECT 'contacts', COUNT(*) FROM contacts
UNION ALL
SELECT 'call_logs', COUNT(*) FROM call_logs
UNION ALL
SELECT 'transfer_settings', COUNT(*) FROM transfer_settings
UNION ALL
SELECT 'audio_files', COUNT(*) FROM audio_files;

-- 転送機能の準備状況確認
SELECT 
  c.id,
  c.name,
  c.status,
  ci.number as caller_number,
  ts.transfer_enabled,
  ts.transfer_key,
  ts.transfer_timeout,
  CASE WHEN ts.id IS NOT NULL THEN 'Ready' ELSE 'Not configured' END as transfer_status
FROM campaigns c
LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
LEFT JOIN transfer_settings ts ON c.id = ts.campaign_id
ORDER BY c.id;

SELECT 'Transfer function ready for deployment!' as final_message;
