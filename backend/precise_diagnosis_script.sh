#!/bin/bash
# 精密診断 - 0335289359削除阻害要因の特定と解決
# 実行場所: /var/www/autodialer/backend

echo "🔍 0335289359 削除阻害要因の精密診断"
echo "=============================================="

# 対象番号
TARGET_NUMBER="0335289359"

echo "📊 Step 1: 対象発信者番号の基本情報"
echo "----------------------------------------------"

# 発信者番号の基本情報取得
echo "🎯 対象番号: $TARGET_NUMBER"
mysql -u autodialer -p'TestPassword123!' autodialer -e "
SELECT 
    id,
    number,
    description,
    provider,
    domain,
    active,
    created_at
FROM caller_ids 
WHERE number = '$TARGET_NUMBER';
" 2>/dev/null

# IDを取得して変数に格納
CALLER_ID=$(mysql -u autodialer -p'TestPassword123!' autodialer -se "SELECT id FROM caller_ids WHERE number = '$TARGET_NUMBER';" 2>/dev/null)

if [ -z "$CALLER_ID" ]; then
    echo "❌ エラー: 発信者番号 $TARGET_NUMBER が見つかりません"
    exit 1
fi

echo "✅ 発信者番号ID: $CALLER_ID"

echo ""
echo "🔒 Step 2: 削除阻害要因の詳細確認"
echo "----------------------------------------------"

echo "【1. キャンペーンでの使用状況】"
mysql -u autodialer -p'TestPassword123!' autodialer -e "
SELECT 
    id as campaign_id,
    name as campaign_name,
    status,
    caller_id_id,
    created_at,
    updated_at
FROM campaigns 
WHERE caller_id_id = $CALLER_ID;
" 2>/dev/null

CAMPAIGN_COUNT=$(mysql -u autodialer -p'TestPassword123!' autodialer -se "SELECT COUNT(*) FROM campaigns WHERE caller_id_id = $CALLER_ID;" 2>/dev/null)
echo "🔢 使用中のキャンペーン数: $CAMPAIGN_COUNT"

echo ""
echo "【2. 通話ログでの使用状況】"
mysql -u autodialer -p'TestPassword123!' autodialer -e "
SELECT 
    COUNT(*) as total_calls,
    MIN(start_time) as first_call,
    MAX(start_time) as last_call,
    SUM(CASE WHEN end_time IS NULL THEN 1 ELSE 0 END) as active_calls,
    SUM(CASE WHEN test_call = 1 THEN 1 ELSE 0 END) as test_calls
FROM call_logs 
WHERE caller_id_id = $CALLER_ID;
" 2>/dev/null

CALL_LOG_COUNT=$(mysql -u autodialer -p'TestPassword123!' autodialer -se "SELECT COUNT(*) FROM call_logs WHERE caller_id_id = $CALLER_ID;" 2>/dev/null)
echo "🔢 通話ログ件数: $CALL_LOG_COUNT"

echo ""
echo "【3. チャンネル設定での使用状況】"
mysql -u autodialer -p'TestPassword123!' autodialer -e "
SELECT 
    id as channel_id,
    username,
    status,
    last_used
FROM caller_channels 
WHERE caller_id_id = $CALLER_ID;
" 2>/dev/null

CHANNEL_COUNT=$(mysql -u autodialer -p'TestPassword123!' autodialer -se "SELECT COUNT(*) FROM caller_channels WHERE caller_id_id = $CALLER_ID;" 2>/dev/null)
echo "🔢 関連チャンネル数: $CHANNEL_COUNT"

echo ""
echo "📋 Step 3: 削除可能性の判定"
echo "----------------------------------------------"

TOTAL_DEPENDENCIES=$((CAMPAIGN_COUNT + CALL_LOG_COUNT + CHANNEL_COUNT))

echo "依存関係サマリー:"
echo "  - キャンペーン: $CAMPAIGN_COUNT 件"
echo "  - 通話ログ: $CALL_LOG_COUNT 件"
echo "  - チャンネル: $CHANNEL_COUNT 件"
echo "  - 合計依存: $TOTAL_DEPENDENCIES 件"

if [ $TOTAL_DEPENDENCIES -eq 0 ]; then
    echo "✅ 削除可能: 依存関係なし"
    DELETION_STRATEGY="direct"
elif [ $CAMPAIGN_COUNT -gt 0 ] && [ $CALL_LOG_COUNT -eq 0 ]; then
    echo "⚠️ 制限あり削除可能: キャンペーンの再割り当てが必要"
    DELETION_STRATEGY="reassign"
elif [ $CALL_LOG_COUNT -gt 0 ]; then
    echo "🚨 制限あり削除可能: 通話ログの処理選択が必要"
    DELETION_STRATEGY="choice_required"
else
    echo "❌ 削除困難: 複雑な依存関係"
    DELETION_STRATEGY="complex"
fi

echo ""
echo "🎯 Step 4: 推奨解決策"
echo "----------------------------------------------"

case $DELETION_STRATEGY in
    "direct")
        echo "💚 直接削除可能"
        echo "実行コマンド:"
        echo "mysql -u autodialer -p'TestPassword123!' autodialer -e \"DELETE FROM caller_ids WHERE id = $CALLER_ID;\""
        ;;
    "reassign")
        echo "💛 キャンペーン再割り当て後削除"
        
        # 代替発信者番号を検索
        ALT_CALLER=$(mysql -u autodialer -p'TestPassword123!' autodialer -se "SELECT id FROM caller_ids WHERE active = 1 AND id != $CALLER_ID LIMIT 1;" 2>/dev/null)
        
        if [ -n "$ALT_CALLER" ]; then
            ALT_NUMBER=$(mysql -u autodialer -p'TestPassword123!' autodialer -se "SELECT number FROM caller_ids WHERE id = $ALT_CALLER;" 2>/dev/null)
            echo "✅ 代替番号見つかりました: ID=$ALT_CALLER ($ALT_NUMBER)"
            echo ""
            echo "実行手順:"
            echo "1. キャンペーン再割り当て:"
            echo "   mysql -u autodialer -p'TestPassword123!' autodialer -e \"UPDATE campaigns SET caller_id_id = $ALT_CALLER WHERE caller_id_id = $CALLER_ID;\""
            echo "2. チャンネル削除:"
            echo "   mysql -u autodialer -p'TestPassword123!' autodialer -e \"DELETE FROM caller_channels WHERE caller_id_id = $CALLER_ID;\""
            echo "3. 発信者番号削除:"
            echo "   mysql -u autodialer -p'TestPassword123!' autodialer -e \"DELETE FROM caller_ids WHERE id = $CALLER_ID;\""
        else
            echo "❌ 代替発信者番号が見つかりません"
            echo "先に新しい発信者番号を追加してください"
        fi
        ;;
    "choice_required")
        echo "💙 通話ログ処理選択後削除"
        echo ""
        echo "選択肢:"
        echo "A) 通話ログを保持して無効化のみ"
        echo "   mysql -u autodialer -p'TestPassword123!' autodialer -e \"UPDATE caller_ids SET active = 0 WHERE id = $CALLER_ID;\""
        echo ""
        echo "B) 通話ログごと完全削除"
        echo "   1. 通話ログ削除: DELETE FROM call_logs WHERE caller_id_id = $CALLER_ID;"
        echo "   2. チャンネル削除: DELETE FROM caller_channels WHERE caller_id_id = $CALLER_ID;"
        echo "   3. 発信者番号削除: DELETE FROM caller_ids WHERE id = $CALLER_ID;"
        ;;
    "complex")
        echo "🔴 手動確認が必要"
        echo "複雑な依存関係のため、個別確認が必要です"
        ;;
esac

echo ""
echo "⚡ Step 5: 自動実行オプション"
echo "----------------------------------------------"

if [ "$DELETION_STRATEGY" = "reassign" ] || [ "$DELETION_STRATEGY" = "direct" ]; then
    echo "自動実行しますか？ (y/N)"
    read -p "実行: " AUTO_EXECUTE
    
    if [ "$AUTO_EXECUTE" = "y" ] || [ "$AUTO_EXECUTE" = "Y" ]; then
        echo ""
        echo "🚀 自動削除実行中..."
        echo "----------------------------------------"
        
        if [ "$DELETION_STRATEGY" = "reassign" ]; then
            echo "1. キャンペーン再割り当て実行中..."
            mysql -u autodialer -p'TestPassword123!' autodialer -e "UPDATE campaigns SET caller_id_id = $ALT_CALLER WHERE caller_id_id = $CALLER_ID;" 2>/dev/null
            echo "✅ キャンペーン再割り当て完了"
            
            echo "2. チャンネル削除実行中..."
            mysql -u autodialer -p'TestPassword123!' autodialer -e "DELETE FROM caller_channels WHERE caller_id_id = $CALLER_ID;" 2>/dev/null
            echo "✅ チャンネル削除完了"
        fi
        
        echo "3. 発信者番号削除実行中..."
        mysql -u autodialer -p'TestPassword123!' autodialer -e "DELETE FROM caller_ids WHERE id = $CALLER_ID;" 2>/dev/null
        
        # 削除確認
        REMAINING=$(mysql -u autodialer -p'TestPassword123!' autodialer -se "SELECT COUNT(*) FROM caller_ids WHERE id = $CALLER_ID;" 2>/dev/null)
        
        if [ "$REMAINING" -eq 0 ]; then
            echo "✅ 削除完了: $TARGET_NUMBER ($CALLER_ID) が正常に削除されました"
            
            echo ""
            echo "📊 現在の発信者番号一覧:"
            mysql -u autodialer -p'TestPassword123!' autodialer -e "
            SELECT 
                id,
                number,
                description,
                active,
                created_at
            FROM caller_ids 
            ORDER BY id;
            " 2>/dev/null
            
        else
            echo "❌ 削除失敗: データが残っています"
        fi
        
    else
        echo "キャンセルしました"
    fi
else
    echo "手動実行が必要です。上記の手順に従って実行してください。"
fi

echo ""
echo "🎯 診断完了"
echo "WebUIをリロードして結果を確認してください"
