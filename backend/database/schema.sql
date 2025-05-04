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
