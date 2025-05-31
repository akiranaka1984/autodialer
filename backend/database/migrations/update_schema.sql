ALTER TABLE caller_channels 
MODIFY COLUMN channel_type ENUM('outbound', 'transfer', 'both') NOT NULL DEFAULT 'both';