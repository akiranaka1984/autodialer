-- backend/database/migrations/update_channel_types.sql
UPDATE caller_channels SET channel_type = 'both' WHERE channel_type IS NULL;