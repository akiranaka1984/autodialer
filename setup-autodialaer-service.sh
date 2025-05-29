#!/bin/bash
# setup-autodialer-service.sh
# 自動発信システム systemd サービスセットアップスクリプト

set -e  # エラー時に終了

# カラー出力用の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログ関数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 設定変数
SERVICE_NAME="autodialer"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
APP_DIR="/var/www/autodialer"
BACKEND_DIR="${APP_DIR}/backend"
LOG_DIR="${BACKEND_DIR}/logs"
AUDIO_DIR="${BACKEND_DIR}/audio-files"
IVR_DIR="${BACKEND_DIR}/ivr-scripts"
USER="www-data"
GROUP="www-data"

# 管理者権限チェック
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "このスクリプトは管理者権限で実行してください"
        echo "使用方法: sudo $0"
        exit 1
    fi
}

# 依存関係チェック
check_dependencies() {
    log_step "依存関係チェック中..."
    
    # Node.js チェック
    if ! command -v node &> /dev/null; then
        log_error "Node.js がインストールされていません"
        exit 1
    fi
    
    NODE_VERSION=$(node --version)
    log_info "Node.js バージョン: $NODE_VERSION"
    
    # MySQL チェック
    if ! systemctl is-active mysql &> /dev/null; then
        log_warn "MySQL サービスが動作していません"
        if systemctl is-enabled mysql &> /dev/null; then
            log_info "MySQL サービスを開始しています..."
            systemctl start mysql
        else
            log_error "MySQL がインストールされていないか有効化されていません"
            exit 1
        fi
    fi
    
    log_info "MySQL サービス: 動作中"
    
    # sipcmd バイナリチェック
    SIPCMD_PATH="/usr/local/bin/sipcmd-final"
    if [[ ! -f "$SIPCMD_PATH" ]]; then
        log_warn "SIPコマンドバイナリが見つかりません: $SIPCMD_PATH"
        log_info "システムは動作しますが、実際の発信機能は制限されます"
    else
        log_info "SIPコマンドバイナリ: 存在確認"
    fi
}

# ディレクトリとファイル構成チェック
check_file_structure() {
    log_step "ファイル構成チェック中..."
    
    if [[ ! -d "$BACKEND_DIR" ]]; then
        log_error "バックエンドディレクトリが見つかりません: $BACKEND_DIR"
        exit 1
    fi
    
    if [[ ! -f "$BACKEND_DIR/src/index.js" ]]; then
        log_error "メインアプリケーションファイルが見つかりません: $BACKEND_DIR/src/index.js"
        exit 1
    fi
    
    if [[ ! -f "$BACKEND_DIR/package.json" ]]; then
        log_error "package.json が見つかりません: $BACKEND_DIR/package.json"
        exit 1
    fi
    
    log_info "ファイル構成: 正常"
}

# 必要なディレクトリ作成
create_directories() {
    log_step "必要なディレクトリを作成中..."
    
    # ログディレクトリ
    mkdir -p "$LOG_DIR"
    chown -R $USER:$GROUP "$LOG_DIR"
    chmod 755 "$LOG_DIR"
    log_info "ログディレクトリ作成: $LOG_DIR"
    
    # 音声ファイルディレクトリ
    mkdir -p "$AUDIO_DIR"
    chown -R $USER:$GROUP "$AUDIO_DIR"
    chmod 755 "$AUDIO_DIR"
    log_info "音声ファイルディレクトリ作成: $AUDIO_DIR"
    
    # IVRスクリプトディレクトリ
    mkdir -p "$IVR_DIR"
    chown -R $USER:$GROUP "$IVR_DIR"
    chmod 755 "$IVR_DIR"
    log_info "IVRスクリプトディレクトリ作成: $IVR_DIR"
}

# 権限設定
set_permissions() {
    log_step "権限設定中..."
    
    # アプリケーションディレクトリの権限
    chown -R $USER:$GROUP "$APP_DIR"
    
    # 実行権限
    find "$BACKEND_DIR" -name "*.js" -exec chmod 644 {} \;
    chmod 755 "$BACKEND_DIR/src/index.js"
    
    log_info "権限設定完了"
}

# systemd サービスファイル作成
create_service_file() {
    log_step "systemd サービスファイルを作成中..."
    
    cat > "$SERVICE_FILE" << 'EOF'
# /etc/systemd/system/autodialer.service
# 自動発信システム systemd サービス設定

[Unit]
Description=Auto Dialer System - Automated Call Management
After=network.target mysql.service
Wants=mysql.service
Documentation=https://github.com/your-org/autodialer

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/autodialer/backend
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
StartLimitBurst=5
StartLimitIntervalSec=300

# 環境変数
Environment=NODE_ENV=production
Environment=PORT=5000
Environment=DB_HOST=127.0.0.1
Environment=DB_USER=autodialer
Environment=DB_PASSWORD=TestPassword123!
Environment=DB_NAME=autodialer
Environment=MYSQL_USER=autodialer
Environment=MYSQL_PASSWORD=TestPassword123!
Environment=MYSQL_DATABASE=autodialer
Environment=DEFAULT_CALLER_ID="Auto Dialer" <03-5946-8520>
Environment=SIP_SERVER=ito258258.site
Environment=SIPCMD_PATH=/usr/local/bin/sipcmd-final
Environment=DISABLE_AUTO_DIALER=false
Environment=FALLBACK_ENABLED=true
Environment=LOAD_BALANCING_ENABLED=false
Environment=DEFAULT_CALL_PROVIDER=sip

# ログ設定
StandardOutput=journal
StandardError=journal
SyslogIdentifier=autodialer

# セキュリティ設定
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/www/autodialer/backend/logs
ReadWritePaths=/var/www/autodialer/backend/audio-files
ReadWritePaths=/var/www/autodialer/backend/ivr-scripts

# リソース制限
LimitNOFILE=65536
LimitNPROC=4096
MemoryMax=2G
CPUQuota=200%

# プロセス管理
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30

# 健全性チェック
WatchdogSec=120

[Install]
WantedBy=multi-user.target
EOF

    log_info "systemd サービスファイル作成完了: $SERVICE_FILE"
}

# Node.js 依存関係インストール
install_dependencies() {
    log_step "Node.js 依存関係をインストール中..."
    
    cd "$BACKEND_DIR"
    
    # package.json の存在確認
    if [[ ! -f "package.json" ]]; then
        log_error "package.json が見つかりません"
        exit 1
    fi
    
    # npm インストール（本番環境用）
    sudo -u $USER npm install --production
    
    log_info "依存関係インストール完了"
}

# systemd サービス登録・開始
register_service() {
    log_step "systemd サービスを登録中..."
    
    # systemd リロード
    systemctl daemon-reload
    log_info "systemd 設定リロード完了"
    
    # サービス有効化
    systemctl enable $SERVICE_NAME
    log_info "サービス自動起動有効化"
    
    # 既存サービスが動作中の場合は停止
    if systemctl is-active $SERVICE_NAME &> /dev/null; then
        log_info "既存サービスを停止中..."
        systemctl stop $SERVICE_NAME
        sleep 3
    fi
    
    # サービス開始
    systemctl start $SERVICE_NAME
    log_info "サービス開始"
    
    # 起動確認
    sleep 5
    if systemctl is-active $SERVICE_NAME &> /dev/null; then
        log_info "✅ サービス起動成功"
    else
        log_error "❌ サービス起動失敗"
        systemctl status $SERVICE_NAME --no-pager
        exit 1
    fi
}

# サービス状態確認
check_service_status() {
    log_step "サービス状態確認中..."
    
    echo -e "\n${BLUE}=== サービス状態 ===${NC}"
    systemctl status $SERVICE_NAME --no-pager
    
    echo -e "\n${BLUE}=== プロセス情報 ===${NC}"
    ps aux | grep "node.*autodialer" | grep -v grep || log_warn "プロセスが見つかりません"
    
    echo -e "\n${BLUE}=== ポート監視 ===${NC}"
    netstat -tlnp | grep :5000 || log_warn "ポート5000でリッスンしていません"
    
    echo -e "\n${BLUE}=== 最新ログ ===${NC}"
    journalctl -u $SERVICE_NAME --no-pager -n 10
}

# ヘルスチェック
health_check() {
    log_step "ヘルスチェック実行中..."
    
    # APIエンドポイントチェック
    local max_attempts=10
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log_info "ヘルスチェック試行 $attempt/$max_attempts"
        
        if curl -s -f http://localhost:5000/health > /dev/null; then
            log_info "✅ ヘルスチェック成功"
            
            # APIレスポンス詳細
            echo -e "\n${BLUE}=== API レスポンス ===${NC}"
            curl -s http://localhost:5000/health | jq . || curl -s http://localhost:5000/health
            
            return 0
        else
            log_warn "ヘルスチェック失敗 (試行 $attempt/$max_attempts)"
            sleep 3
            ((attempt++))
        fi
    done
    
    log_error "❌ ヘルスチェック最終失敗"
    return 1
}

# アンインストール機能
uninstall_service() {
    log_step "サービスをアンインストール中..."
    
    # サービス停止
    if systemctl is-active $SERVICE_NAME &> /dev/null; then
        systemctl stop $SERVICE_NAME
        log_info "サービス停止"
    fi
    
    # サービス無効化
    if systemctl is-enabled $SERVICE_NAME &> /dev/null; then
        systemctl disable $SERVICE_NAME
        log_info "サービス自動起動無効化"
    fi
    
    # サービスファイル削除
    if [[ -f "$SERVICE_FILE" ]]; then
        rm "$SERVICE_FILE"
        log_info "サービスファイル削除"
    fi
    
    # systemd リロード
    systemctl daemon-reload
    log_info "systemd 設定リロード"
    
    log_info "✅ アンインストール完了"
}

# 使用方法表示
show_usage() {
    echo "使用方法: $0 [コマンド]"
    echo ""
    echo "コマンド:"
    echo "  install     - サービスをインストール・開始（デフォルト）"
    echo "  uninstall   - サービスをアンインストール"
    echo "  status      - サービス状態確認"
    echo "  health      - ヘルスチェック実行"
    echo "  restart     - サービス再起動"
    echo "  logs        - ログ表示"
    echo "  help        - このヘルプを表示"
    echo ""
    echo "例:"
    echo "  sudo $0 install"
    echo "  sudo $0 status"
    echo "  sudo $0 restart"
}

# ログ表示
show_logs() {
    echo -e "${BLUE}=== 最新ログ (リアルタイム) ===${NC}"
    echo "Ctrl+C で終了"
    sleep 2
    journalctl -u $SERVICE_NAME -f
}

# メイン実行
main() {
    local command=${1:-install}
    
    case $command in
        "install")
            log_info "🚀 自動発信システム systemd サービスセットアップ開始"
            check_root
            check_dependencies
            check_file_structure
            create_directories
            set_permissions
            install_dependencies
            create_service_file
            register_service
            check_service_status
            
            if health_check; then
                echo -e "\n${GREEN}✅ セットアップ完了！${NC}"
                echo -e "${GREEN}サービスが正常に動作しています${NC}"
                echo ""
                echo "管理コマンド:"
                echo "  sudo systemctl status $SERVICE_NAME    # ステータス確認"
                echo "  sudo systemctl restart $SERVICE_NAME   # 再起動"
                echo "  sudo systemctl stop $SERVICE_NAME      # 停止"
                echo "  sudo journalctl -u $SERVICE_NAME -f    # ログ監視"
                echo ""
                echo "Webインターフェース: http://localhost:3003"
                echo "API: http://localhost:5000"
            else
                echo -e "\n${YELLOW}⚠️ セットアップ完了（ヘルスチェック失敗）${NC}"
                echo "サービスログを確認してください:"
                echo "  sudo journalctl -u $SERVICE_NAME -n 20"
            fi
            ;;
        "uninstall")
            check_root
            uninstall_service
            ;;
        "status")
            check_service_status
            ;;
        "health")
            health_check
            ;;
        "restart")
            check_root
            log_info "サービス再起動中..."
            systemctl restart $SERVICE_NAME
            sleep 3
            check_service_status
            health_check
            ;;
        "logs")
            show_logs
            ;;
        "help")
            show_usage
            ;;
        *)
            log_error "不明なコマンド: $command"
            show_usage
            exit 1
            ;;
    esac
}

# スクリプト実行
main "$@"
