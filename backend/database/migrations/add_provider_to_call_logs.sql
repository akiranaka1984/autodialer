ALTER TABLE call_logs
ADD COLUMN call_provider VARCHAR(20) DEFAULT 'asterisk' AFTER test_call;

-- 既存のデータを更新（オプション）
UPDATE call_logs SET call_provider = 'asterisk' WHERE call_provider IS NULL;