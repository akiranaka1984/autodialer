-- ===============================================
-- Phase2 Step2.1.2: 発信者番号ベース設計に修正
-- 日付: 2025年6月9日
-- ===============================================

-- Step 1: 既存のキャンペーンベースデータを削除
DELETE FROM transfer_sip_assignments WHERE campaign_id = 52;

-- Step 2: テーブル構造を発信者番号ベースに修正
ALTER TABLE transfer_sip_assignments 
DROP FOREIGN KEY transfer_sip_assignments_ibfk_1;

ALTER TABLE transfer_sip_assignments 
DROP COLUMN campaign_id;

ALTER TABLE transfer_sip_assignments 
ADD COLUMN caller_id_id INT NOT NULL AFTER id;

ALTER TABLE transfer_sip_assignments 
ADD FOREIGN KEY (caller_id_id) REFERENCES caller_ids(id) ON DELETE CASCADE;

-- Step 3: インデックス修正
DROP INDEX idx_campaign_key ON transfer_sip_assignments;
CREATE INDEX idx_caller_id_key ON transfer_sip_assignments(caller_id_id, dtmf_key);

-- Step 4: ユニーク制約修正
ALTER TABLE transfer_sip_assignments 
DROP INDEX unique_campaign_key_sip;

ALTER TABLE transfer_sip_assignments 
ADD CONSTRAINT unique_caller_id_key_sip 
UNIQUE (caller_id_id, dtmf_key, sip_username);

-- ===============================================
-- Step 5: 発信者番号別サンプルデータ投入
-- ===============================================

-- まず、使用する発信者番号を確認
-- SELECT id, number, description FROM caller_ids WHERE active = 1;

-- 発信者番号 03-3528-9359 (ID: 6) の転送設定
INSERT IGNORE INTO transfer_sip_assignments 
(caller_id_id, dtmf_key, sip_username, priority, max_concurrent_calls, active) VALUES
-- キー1: 営業チームA
(6, '1', '03750001', 1, 5, true),
(6, '1', '03750002', 2, 5, true),
-- キー2: 営業チームB  
(6, '2', '03750003', 1, 5, true),
(6, '2', '03750004', 2, 5, true),
-- キー3: 営業マネージャー
(6, '3', '03750005', 1, 5, true);

-- 発信者番号 03-5579-2716 (ID: 5) の転送設定
INSERT IGNORE INTO transfer_sip_assignments 
(caller_id_id, dtmf_key, sip_username, priority, max_concurrent_calls, active) VALUES
-- キー1: 技術サポート
(5, '1', '03760001', 1, 5, true),
(5, '1', '03760002', 2, 5, true),
-- キー2: 一般サポート
(5, '2', '03760003', 1, 5, true),
(5, '2', '03760004', 2, 5, true),
-- キー3: サポート責任者
(5, '3', '03760005', 1, 5, true);

-- 発信者番号 03-5946-8411 (ID: 7) の転送設定
INSERT IGNORE INTO transfer_sip_assignments 
(caller_id_id, dtmf_key, sip_username, priority, max_concurrent_calls, active) VALUES
-- キー1: 技術チーム
(7, '1', '03770001', 1, 5, true),
(7, '1', '03770002', 2, 5, true),
-- キー2: システム管理
(7, '2', '03770003', 1, 5, true),
(7, '2', '03770004', 2, 5, true),
-- キー3: 技術責任者
(7, '3', '03770005', 1, 5, true);

-- ===============================================
-- Step 6: 統計ビューの修正
-- ===============================================

-- 既存ビューを削除
DROP VIEW IF EXISTS transfer_sip_load_status;
DROP VIEW IF EXISTS transfer_key_capacity;

-- 修正版: 発信者番号ベース統計ビュー
CREATE VIEW transfer_sip_load_status AS
SELECT 
  tsa.caller_id_id,
  ci.number as caller_id_number,
  ci.description as caller_id_description,
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
JOIN caller_ids ci ON tsa.caller_id_id = ci.id
WHERE tsa.active = true
ORDER BY tsa.caller_id_id, tsa.dtmf_key, tsa.priority;

-- キー別転送容量統計ビュー（修正版）
CREATE VIEW transfer_key_capacity AS
SELECT 
  tsa.caller_id_id,
  ci.number as caller_id_number,
  tsa.dtmf_key,
  COUNT(*) as total_sip_accounts,
  SUM(max_concurrent_calls) as total_max_calls,
  SUM(current_calls) as total_current_calls,
  SUM(CASE WHEN active = true THEN 1 ELSE 0 END) as active_accounts,
  ROUND((SUM(current_calls) / SUM(max_concurrent_calls)) * 100, 1) as overall_load_percentage
FROM transfer_sip_assignments tsa
JOIN caller_ids ci ON tsa.caller_id_id = ci.id
GROUP BY tsa.caller_id_id, tsa.dtmf_key
ORDER BY tsa.caller_id_id, tsa.dtmf_key;

-- ===============================================
-- Step 7: 動作確認
-- ===============================================

-- 確認1: 発信者番号一覧
SELECT id, number, description, active FROM caller_ids WHERE active = 1;

-- 確認2: 修正後のテーブル構造
DESCRIBE transfer_sip_assignments;

-- 確認3: 発信者番号別転送設定確認
SELECT 
  ci.number as '発信者番号',
  tsa.dtmf_key as 'キー',
  tsa.sip_username as 'SIPアカウント', 
  tsa.priority as '優先度'
FROM transfer_sip_assignments tsa
JOIN caller_ids ci ON tsa.caller_id_id = ci.id
WHERE ci.active = 1
ORDER BY tsa.caller_id_id, tsa.dtmf_key, tsa.priority;

-- ===============================================
-- 完了メッセージ
-- ===============================================
SELECT '✅ Phase2 Step2.1.2 発信者番号ベース設計修正完了！' as status;
SELECT '🎯 次: Step2.2 負荷分散API実装' as next_step;
