#!/bin/bash
# create-test-campaign.sh - テスト用キャンペーンの作成

echo "🎯 テスト用キャンペーンを作成します..."

# データベースに直接キャンペーンを挿入
docker-compose -f docker-compose.dev.yml exec mysql mysql -u root -ppassword autodialer -e "
INSERT INTO campaigns (name, description, status, caller_id_id, max_concurrent_calls, created_at) 
VALUES ('テスト削除用キャンペーン', '削除テスト用', 'draft', 1, 5, NOW()),
       ('テスト削除用キャンペーン2', '削除テスト用その2', 'draft', 1, 5, NOW());
"

echo "✅ テスト用キャンペーンを作成しました"

# 作成されたキャンペーンを確認
echo "📋 現在のキャンペーン一覧:"
docker-compose -f docker-compose.dev.yml exec mysql mysql -u root -ppassword autodialer -e "
SELECT id, name, status FROM campaigns ORDER BY id;
"