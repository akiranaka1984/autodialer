#!/bin/bash
# Auto Callerシステムデプロイスクリプト

set -e

PROJECT_DIR="/root/autodialer"
DEPLOY_DATE=$(date +"%Y-%m-%d %H:%M:%S")

echo "===== Auto Callerシステムのデプロイ開始: $DEPLOY_DATE ====="
cd $PROJECT_DIR

# 作業前にDocker Composeのバージョンを確認
docker-compose --version

# コンテナを一旦停止（データベースは維持）
echo "フロントエンドとバックエンドのコンテナを停止しています..."
docker-compose -f docker-compose.dev.yml stop frontend backend

# イメージをリビルド
echo "Dockerイメージを再構築しています..."
docker-compose -f docker-compose.dev.yml build frontend backend

# コンテナを再起動
echo "コンテナを再起動しています..."
docker-compose -f docker-compose.dev.yml up -d frontend backend

# ステータス確認
echo "コンテナのステータス:"
docker-compose -f docker-compose.dev.yml ps

# ログの確認
echo "バックエンドのログを確認中..."
docker-compose -f docker-compose.dev.yml logs --tail=20 backend

echo "フロントエンドのログを確認中..."
docker-compose -f docker-compose.dev.yml logs --tail=20 frontend

echo "===== デプロイ完了: $(date +"%Y-%m-%d %H:%M:%S") ====="
echo "フロントエンド: http://152.42.200.112:3003"
echo "バックエンドAPI: http://152.42.200.112:5001"
