#!/bin/bash
# 🔄 VPS→GitHub自動同期スクリプト

cd /var/www/autodialer

echo "🔄 GitHub自動同期開始..."

# 変更をステージング
git add .

# 変更があるかチェック
if git diff --staged --quiet; then
  echo "✅ 変更なし - 同期不要"
  exit 0
fi

# コミット
git commit -m "🔄 VPS自動同期 - $(date '+%Y-%m-%d %H:%M:%S')"

# プッシュ（masterブランチへ）
git push origin master

echo "✅ GitHub同期完了"
