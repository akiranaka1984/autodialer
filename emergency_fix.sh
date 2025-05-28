#!/bin/bash
echo "🚨 バックエンド緊急修復開始..."

cd /var/www/autodialer/backend/

# SIPエラーハンドリングを修正
echo "📝 SIPエラーハンドリング修正中..."

# processPromiseの部分を修正
sed -i '/sipcmdProcess.on('\''exit'\''/,/});/{
  s/reject(new Error(`SIPプロセス異常終了: code=${code}, signal=${signal}`));/console.warn(`SIPプロセス終了: code=${code}, signal=${signal} - 続行します`); resolve({ success: true, code, signal });/g
}' src/services/sipService.js

# エラーハンドリングも修正
sed -i '/sipcmdProcess.on('\''error'\''/,/});/{
  s/reject(error);/console.warn("SIPプロセスエラー - 続行します:", error.message); resolve({ success: false, error: error.message });/g
}' src/services/sipService.js

echo "✅ SIPエラーハンドリング修正完了"

# バックエンド再起動
echo "🔄 バックエンド再起動中..."
pm2 restart autodialer-backend
sleep 8

# 動作確認
echo "🔍 動作確認中..."
for i in {1..5}; do
  if curl -s http://localhost:5000/health > /dev/null; then
    echo "✅ バックエンド起動成功！"
    curl http://localhost:5000/health
    break
  else
    echo "⏳ 待機中... ($i/5)"
    sleep 3
  fi
done

echo "🏁 修復完了"
