-- ===============================================
-- Phase2: 転送用SIPアカウント分離管理テーブル
-- 日付: 2025年6月9日
-- 目的: キー別に複数SIPアカウントを設定可能にする
-- ===============================================

-- 🚀 メインテーブル: 転送SIPアカウント割り当て
CREATE TABLE IF NOT EXISTS transfer_sip_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  dtmf_key VARCHAR(5) NOT NULL,              -- '1', '2', '3'
  sip_username VARCHAR(50) NOT NULL,         -- 転送専用SIPアカウント
  sip_password VARCHAR(50) DEFAULT NULL,     -- SIPパスワード（必要時）
  sip_account_type ENUM('transfer', 'outbound') DEFAULT 'transfer',
  priority INT DEFAULT 1,                    -- 同一キー内での優先度（高い方が優先）
  max_concurrent_calls INT DEFAULT 5,        -- このSIPアカウントの最大同時通話数
  current_calls INT DEFAULT 0,               -- 現在の通話数（リアルタイム更新）
  active BOOLEAN DEFAULT true,               -- 有効/無効
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- インデックス
  INDEX idx_campaign_key (campaign_id, dtmf_key),
  INDEX idx_sip_username (sip_username),
  INDEX idx_active (active),
  INDEX idx_current_calls (current_calls),
  
  -- 外部キー
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- ユニーク制約：同一キャンペーン・キー・SIPアカウントは1つまで
  UNIQUE KEY unique_campaign_key_sip (campaign_id, dtmf_key, sip_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='転送用SIPアカウント割り当てテーブル';

-- ===============================================
-- 🔄 既存データ移行
-- ===============================================

-- Step 1: 既存の campaign_transfer_destinations から新テーブルにデータ移行
INSERT IGNORE INTO transfer_sip_assignments 
(campaign_id, dtmf_key, sip_username, sip_account_type, priority, active)
SELECT 
  campaign_id,
  dtmf_key,
  sip_username,
  'transfer' as sip_account_type,
  1 as priority,
  active
FROM campaign_transfer_destinations 
WHERE active = 1;

-- ===============================================
-- 🎯 サンプルデータ投入（キャンペーン52用）
-- ===============================================

-- キー1転送用SIPアカウント（3個）
INSERT IGNORE INTO transfer_sip_assignments 
(campaign_id, dtmf_key, sip_username, priority, max_concurrent_calls, active) VALUES
(52, '1', '03750001', 1, 5, true),
(52, '1', '03750002', 2, 5, true),
(52, '1', '03750003', 3, 5, true);

-- キー2転送用SIPアカウント（2個）
INSERT IGNORE INTO transfer_sip_assignments 
(campaign_id, dtmf_key, sip_username, priority, max_concurrent_calls, active) VALUES
(52, '2', '03750004', 1, 5, true),
(52, '2', '03750005', 2, 5, true);

-- キー3転送用SIPアカウント（3個）
INSERT IGNORE INTO transfer_sip_assignments 
(campaign_id, dtmf_key, sip_username, priority, max_concurrent_calls, active) VALUES
(52, '3', '03750006', 1, 5, true),
(52, '3', '03750007', 2, 5, true),
(52, '3', '03750008', 3, 5, true);

-- ===============================================
-- 📊 統計・監視用ビュー
-- ===============================================

-- 転送SIPアカウント負荷状況ビュー
CREATE OR REPLACE VIEW transfer_sip_load_status AS
SELECT 
  tsa.campaign_id,
  c.name as campaign_name,
  tsa.dtmf_key,
  tsa.sip_username,
  tsa.current_calls,
  tsa.max_concurrent_calls,
  ROUND((tsa.current_calls / tsa.max_concurrent_calls) * 100, 1) as load_percentage,
  tsa.priority,
  tsa.active,
  CASE 
    WHEN tsa.current_calls >= tsa.max_concurrent_calls THEN 'FULL'
    WHEN tsa.current_calls > (tsa.max_concurrent_calls * 0.8) THEN 'HIGH'
    WHEN tsa.current_calls > (tsa.max_concurrent_calls * 0.5) THEN 'MEDIUM'
    ELSE 'LOW'
  END as load_status,
  tsa.updated_at as last_updated
FROM transfer_sip_assignments tsa
JOIN campaigns c ON tsa.campaign_id = c.id
WHERE tsa.active = true
ORDER BY tsa.campaign_id, tsa.dtmf_key, tsa.priority;

-- キー別転送容量統計ビュー
CREATE OR REPLACE VIEW transfer_key_capacity AS
SELECT 
  campaign_id,
  dtmf_key,
  COUNT(*) as total_sip_accounts,
  SUM(max_concurrent_calls) as total_max_calls,
  SUM(current_calls) as total_current_calls,
  SUM(CASE WHEN active = true THEN 1 ELSE 0 END) as active_accounts,
  ROUND((SUM(current_calls) / SUM(max_concurrent_calls)) * 100, 1) as overall_load_percentage
FROM transfer_sip_assignments 
GROUP BY campaign_id, dtmf_key
ORDER BY campaign_id, dtmf_key;

-- ===============================================
-- 🔍 動作確認クエリ
-- ===============================================

-- 確認1: キャンペーン52の転送設定一覧
SELECT 
  dtmf_key as 'キー',
  sip_username as 'SIPアカウント', 
  priority as '優先度',
  max_concurrent_calls as '最大通話数',
  current_calls as '現在通話数',
  active as '有効'
FROM transfer_sip_assignments 
WHERE campaign_id = 52 
ORDER BY dtmf_key, priority;

-- 確認2: 負荷状況確認
SELECT * FROM transfer_sip_load_status WHERE campaign_id = 52;

-- 確認3: キー別容量確認
SELECT * FROM transfer_key_capacity WHERE campaign_id = 52;

-- ===============================================
-- 完了メッセージ
-- ===============================================
SELECT '✅ Phase2 Step2.1 データベース設計完了！' as status;
SELECT '🎯 次: Step2.2 負荷分散API実装' as next_step;
