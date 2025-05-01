-- サンプル発信者番号
INSERT INTO caller_ids (number, description, provider, sip_host, auth_username, auth_password, active)
VALUES 
('0312345678', '東京オフィス', 'SIP Provider A', 'sip.provider-a.com', 'tokyo_office', 'password123', true),
('0312345679', '大阪オフィス', 'SIP Provider A', 'sip.provider-a.com', 'osaka_office', 'password123', true),
('0501234567', 'マーケティング部', 'Twilio', 'sip.twilio.com', 'marketing_dept', 'password123', true);

-- サンプルキャンペーン
INSERT INTO campaigns (name, description, status, caller_id_id, script, max_concurrent_calls)
VALUES
('テストキャンペーン', 'システムテスト用キャンペーン', 'draft', 1, 'こんにちは、{会社名}の{担当者名}です。新サービスのご案内で...', 2),
('春の商品案内', '2025年春の新商品案内キャンペーン', 'draft', 2, 'こんにちは、{会社名}の{担当者名}です。春の新商品のご案内で...', 5);

-- 管理者アカウント
INSERT INTO users (username, password, name, email, role)
VALUES
('admin', '$2b$10$X5GgRjYRqX0mIHeGGln6aex5iJJjK7Qsk1ry9fwxWmamVKxYj2b6O', '管理者', 'admin@example.com', 'admin');