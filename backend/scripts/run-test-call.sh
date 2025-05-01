#!/bin/bash
# scripts/run-test-call.sh

# 引数チェック
if [ -z "$1" ]; then
  echo "使用方法: ./scripts/run-test-call.sh <電話番号>"
  exit 1
fi

PHONE=$1

echo "テスト発信を実行します: 発信先 $PHONE"

# テスト発信の実行
node scripts/test-call.js $PHONE

# 終了コードの確認
if [ $? -ne 0 ]; then
  echo "テスト発信に失敗しました"
  exit 1
fi