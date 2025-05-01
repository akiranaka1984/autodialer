#!/bin/bash

echo "オートコールシステムを起動します..."

# データベースの初期化
echo "データベースを初期化しています..."
docker-compose -f docker/docker-compose.yml exec mysql mysql -uroot -ppassword autodialer < backend/database/schema.sql

# サンプルデータの挿入（オプション）
echo "サンプルデータを挿入しています..."
docker-compose -f docker/docker-compose.yml exec mysql mysql -uroot -ppassword autodialer < backend/database/sample-data.sql

# Asterisk設定の更新
echo "Asterisk設定を更新しています..."
docker-compose -f docker/docker-compose.yml restart asterisk

echo "システムが起動しました！"
echo "バックエンドAPI: http://localhost:5000"
echo "フロントエンド: http://localhost:3001"