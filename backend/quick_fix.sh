#!/bin/bash
# 緊急ポート修復スクリプト（いつでも実行可能）

echo "🚨 緊急ポート修復実行"

# 全停止
pm2 delete autodialer 2>/dev/null || true
sudo pkill -f "node.*index.js" 2>/dev/null || true
sudo fuser -k 5000/tcp 2>/dev/null || true

# 3秒待機
sleep 3

# 再起動
cd /var/www/autodialer/backend
pm2 start ecosystem.config.js

# 確認
sleep 2
pm2 list
curl -s http://localhost:5000/health | jq '.status' 2>/dev/null || echo "まだ起動中..."

echo "✅ 緊急修復完了"
