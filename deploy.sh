#!/bin/bash

echo "オートコールシステムをデプロイします..."

# 本番環境変数ファイルの作成
cp backend/.env.example backend/.env.production
cp frontend/.env.example frontend/.env.production

# 環境変数の更新（実際のデプロイでは自動化ツールで設定）
sed -i 's/your_db_password/your_secure_password/g' backend/.env.production
sed -i 's/your_jwt_secret/your_secure_jwt_secret/g' backend/.env.production
sed -i 's/http:\/\/localhost:5000\/api/\/api/g' frontend/.env.production

# ビルドと起動
cd docker
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

echo "データベースを初期化しています..."
sleep 10  # データベースの起動を待つ
docker-compose -f docker-compose.prod.yml exec mysql mysql -uroot -pyour_secure_password autodialer < ../backend/database/schema.sql

echo "デプロイが完了しました！"
echo "システムは http://your-server-ip で利用可能です"