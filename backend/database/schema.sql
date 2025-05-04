-- 発信者番号（Caller ID）テーブル
CREATE TABLE IF NOT EXISTS caller_ids (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(20) NOT NULL,
  description VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  provider VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- キャンペーンテーブル
CREATE TABLE IF NOT EXISTS campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  status ENUM('draft', 'active', 'paused', 'completed') DEFAULT 'draft',
  caller_id_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (caller_id_id) REFERENCES caller_ids(id)
);

-- 連絡先リストテーブル
CREATE TABLE IF NOT EXISTS contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  company VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- テスト用のデータを挿入
INSERT INTO caller_ids (number, description, provider, active)
VALUES 
('0312345678', 'テスト発信者番号1', 'テストプロバイダ', true),
('0312345679', 'テスト発信者番号2', 'テストプロバイダ', true);

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
  role ENUM('admin', 'user') DEFAULT 'user',
  status ENUM('active', 'inactive') DEFAULT 'active',
  last_login DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- キャンペーンテーブルの拡張
ALTER TABLE campaigns
ADD COLUMN script TEXT,
ADD COLUMN retry_attempts INT DEFAULT 0,
ADD COLUMN max_concurrent_calls INT DEFAULT 5,
ADD COLUMN schedule_start DATETIME,
ADD COLUMN schedule_end DATETIME,
ADD COLUMN working_hours_start TIME DEFAULT '09:00:00',
ADD COLUMN working_hours_end TIME DEFAULT '18:00:00',
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 連絡先テーブルの拡張
ALTER TABLE contacts
ADD COLUMN status ENUM('pending', 'called', 'completed', 'failed', 'dnc') DEFAULT 'pending',
ADD COLUMN last_attempt DATETIME,
ADD COLUMN attempt_count INT DEFAULT 0,
ADD COLUMN notes TEXT,
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS audio_files (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  mimetype VARCHAR(50),
  size INT,
  duration INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- キャンペーンと音声ファイルの関連テーブル
CREATE TABLE IF NOT EXISTS campaign_audio (
  campaign_id INT,
  audio_file_id VARCHAR(36),
  audio_type ENUM('welcome', 'menu', 'goodbye', 'error') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, audio_type),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (audio_file_id) REFERENCES audio_files(id)
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

-- usersテーブルにoperatorロールを追加
ALTER TABLE users MODIFY role ENUM('admin', 'user', 'operator') DEFAULT 'user';