-- backend/database/migrations/update_channel_type_schema.sql
-- 既存のNULL値を'both'に更新
UPDATE caller_channels SET channel_type = 'both' WHERE channel_type IS NULL;

-- カラムの型と制約を変更
ALTER TABLE caller_channels 
MODIFY COLUMN channel_type ENUM('outbound', 'transfer', 'both') NOT NULL DEFAULT 'both';