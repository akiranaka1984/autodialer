-- メイン発信者番号テーブル
CREATE TABLE caller_ids (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(20) NOT NULL,
  description VARCHAR(255),
  provider VARCHAR(100),
  domain VARCHAR(100),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- チャンネルテーブル
CREATE TABLE caller_channels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  caller_id_id INT NOT NULL,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(50) NOT NULL,
  status ENUM('available', 'busy', 'error') DEFAULT 'available',
  last_used DATETIME NULL,
  FOREIGN KEY (caller_id_id) REFERENCES caller_ids(id) ON DELETE CASCADE
);

-- キャンペーンテーブル（progressカラム追加）
CREATE TABLE IF NOT EXISTS campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  status ENUM('draft', 'active', 'paused', 'completed') DEFAULT 'draft',
  caller_id_id INT,
  script TEXT,
  retry_attempts INT DEFAULT 0,
  max_concurrent_calls INT DEFAULT 5,
  schedule_start DATETIME,
  schedule_end DATETIME,
  working_hours_start TIME DEFAULT '09:00:00',
  working_hours_end TIME DEFAULT '18:00:00',
  progress INT DEFAULT 0, -- 進捗率（0-100%）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (caller_id_id) REFERENCES caller_ids(id)
);

-- 連絡先リストテーブル
CREATE TABLE IF NOT EXISTS contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  company VARCHAR(100),
  status ENUM('pending', 'called', 'completed', 'failed', 'dnc') DEFAULT 'pending',
  last_attempt DATETIME,
  attempt_count INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- テスト用のデータを挿入
/*
INSERT INTO caller_ids (number, description, provider, active)
VALUES 
('0312345678', 'テスト発信者番号1', 'テストプロバイダ', true),
('0312345679', 'テスト発信者番号2', 'テストプロバイダ', true);
*/
-- 通話ログテーブル
CREATE TABLE IF NOT EXISTS call_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  call_id VARCHAR(100) UNIQUE,
  campaign_id INT,
  contact_id INT,
  caller_id_id INT,
  phone_number VARCHAR(20),
  start_time DATETIME,
  end_time DATETIME,
  duration INT DEFAULT 0,
  status VARCHAR(50),
  keypress VARCHAR(10),
  test_call BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (caller_id_id) REFERENCES caller_ids(id)
);

-- DNCリストテーブル
CREATE TABLE IF NOT EXISTS dnc_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) UNIQUE,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  email VARCHAR(100),
  role ENUM('admin', 'user', 'operator') DEFAULT 'user',
  status ENUM('active', 'inactive') DEFAULT 'active',
  last_login DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 音声ファイルテーブル
CREATE TABLE IF NOT EXISTS audio_files (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  mimetype VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  duration INT,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- キャンペーンと音声ファイルの関連テーブル
CREATE TABLE IF NOT EXISTS campaign_audio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  audio_file_id VARCHAR(36) NOT NULL,
  audio_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (audio_file_id) REFERENCES audio_files(id) ON DELETE CASCADE,
  UNIQUE KEY unique_campaign_audio_type (campaign_id, audio_type)
);

-- キャンペーンのIVR設定テーブル
CREATE TABLE IF NOT EXISTS campaign_ivr_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  config TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  UNIQUE KEY unique_campaign_ivr_config (campaign_id)
);

-- オペレーター管理テーブル
CREATE TABLE IF NOT EXISTS operators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  operator_id VARCHAR(20) UNIQUE NOT NULL, -- 例: OP001, OP002
  status ENUM('available', 'busy', 'offline', 'break') DEFAULT 'offline',
  current_call_id VARCHAR(100) NULL,
  skills JSON, -- 対応可能な分野やスキル
  max_concurrent_calls INT DEFAULT 1,
  priority INT DEFAULT 1, -- 優先度（高いほど優先的に割り当て）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- オペレーターのシフト管理
CREATE TABLE IF NOT EXISTS operator_shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operator_id INT NOT NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_start TIME,
  break_end TIME,
  status ENUM('scheduled', 'active', 'completed', 'cancelled') DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE CASCADE,
  UNIQUE KEY unique_shift (operator_id, shift_date, start_time)
);

-- オペレーター対応履歴
CREATE TABLE IF NOT EXISTS operator_call_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operator_id INT NOT NULL,
  call_log_id INT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration INT, -- 秒
  disposition ENUM('completed', 'transferred', 'dropped', 'voicemail') DEFAULT 'completed',
  notes TEXT,
  customer_satisfaction INT, -- 1-5の評価
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operator_id) REFERENCES operators(id),
  FOREIGN KEY (call_log_id) REFERENCES call_logs(id)
);

-- オペレーターステータス履歴
CREATE TABLE IF NOT EXISTS operator_status_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operator_id INT NOT NULL,
  old_status ENUM('available', 'busy', 'offline', 'break'),
  new_status ENUM('available', 'busy', 'offline', 'break') NOT NULL,
  reason VARCHAR(255),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operator_id) REFERENCES operators(id)
);

-- backend/database/schema.sql への追加
-- 音声再生ログテーブル

-- 音声再生ログテーブル
CREATE TABLE IF NOT EXISTS audio_playback_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    call_id VARCHAR(255) NOT NULL,
    audio_file_id VARCHAR(255),
    audio_type ENUM('welcome', 'menu', 'goodbye', 'error') NOT NULL,
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('played', 'failed', 'skipped') DEFAULT 'played',
    duration_ms INT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_call_id (call_id),
    INDEX idx_audio_file_id (audio_file_id),
    INDEX idx_played_at (played_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- call_logs テーブルに音声関連カラムを追加
ALTER TABLE call_logs 
ADD COLUMN has_audio TINYINT(1) DEFAULT 0 AFTER keypress,
ADD COLUMN audio_file_count INT DEFAULT 0 AFTER has_audio,
ADD COLUMN audio_played_at TIMESTAMP NULL AFTER audio_file_count;

-- campaigns テーブルにIVRデプロイ状態を追加
ALTER TABLE campaigns
ADD COLUMN ivr_deployed TINYINT(1) DEFAULT 0 AFTER progress,
ADD COLUMN ivr_deploy_time TIMESTAMP NULL AFTER ivr_deployed;

-- 既存テーブルの修正（エラーを無視して続行）
SET sql_mode = '';

-- call_logsテーブルに不足カラムを追加
ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS call_provider VARCHAR(50) DEFAULT 'unknown' AFTER keypress;

ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS has_audio TINYINT(1) DEFAULT 0 AFTER call_provider;

ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS audio_file_count INT DEFAULT 0 AFTER has_audio;

ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS audio_played_at TIMESTAMP NULL AFTER audio_file_count;

-- MySQL 5.7対応（IF NOT EXISTSが使えない場合）
-- エラーが出ても続行
ALTER TABLE call_logs ADD COLUMN call_provider VARCHAR(50) DEFAULT 'unknown' AFTER keypress;
ALTER TABLE call_logs ADD COLUMN has_audio TINYINT(1) DEFAULT 0 AFTER call_provider;
ALTER TABLE call_logs ADD COLUMN audio_file_count INT DEFAULT 0 AFTER has_audio;
ALTER TABLE call_logs ADD COLUMN audio_played_at TIMESTAMP NULL AFTER audio_file_count;

-- campaignsテーブルも修正
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ivr_deployed TINYINT(1) DEFAULT 0 AFTER progress;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ivr_deploy_time TIMESTAMP NULL AFTER ivr_deployed;

-- MySQL 5.7対応
ALTER TABLE campaigns ADD COLUMN ivr_deployed TINYINT(1) DEFAULT 0 AFTER progress;
ALTER TABLE campaigns ADD COLUMN ivr_deploy_time TIMESTAMP NULL AFTER ivr_deployed;