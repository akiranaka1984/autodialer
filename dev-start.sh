#!/bin/bash
set -e  # エラー時に停止

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_dependency() {
  if ! command -v $1 &> /dev/null; then
    log_error "$1 が見つかりません。インストールしてください。"
    exit 1
  fi
}

log_info "依存関係を確認しています..."
check_dependency docker
check_dependency docker-compose

log_info "オートコールシステム開発環境を起動中..."

# Docker Composeファイルの存在チェック
if [ ! -f "docker-compose.dev.yml" ]; then
  log_error "docker-compose.dev.yml ファイルが見つかりません！"
  exit 1
fi

# バックエンドディレクトリのチェック
if [ ! -d "backend" ]; then
  log_warn "backend ディレクトリが見つかりません。作成します..."
  mkdir -p backend/src/services
  mkdir -p backend/database
fi

# 既存のコンテナを停止（存在する場合）
if docker-compose -f docker-compose.dev.yml ps -q 2>/dev/null | grep -q .; then
  log_info "既存のコンテナを停止します..."
  docker-compose -f docker-compose.dev.yml down
fi

# Docker環境の起動
log_info "Dockerコンテナを起動しています..."
docker-compose -f docker-compose.dev.yml up -d

# 初期化が必要な場合
if [ "$1" == "init" ]; then
  log_info "データベースの初期化を待機しています..."
  
  # MySQLが起動するまで待機（最大30秒）
  timeout=30
  counter=0
  while ! docker-compose -f docker-compose.dev.yml exec -T mysql mysqladmin -uroot -ppassword ping --silent &> /dev/null; do
    counter=$((counter+1))
    if [ $counter -gt $timeout ]; then
      log_error "データベース接続がタイムアウトしました。"
      exit 1
    fi
    log_info "データベースの準備を待機中... ($counter/$timeout)"
    sleep 1
  done
  
  log_info "データベースに接続しました。スキーマを適用します..."
  
  # スキーマファイルの存在確認
  if [ -f "backend/database/schema.sql" ]; then
    docker-compose -f docker-compose.dev.yml exec -T mysql mysql -uroot -ppassword autodialer < backend/database/schema.sql
    log_info "データベーススキーマが適用されました。"
  else
    log_warn "スキーマファイルが見つかりません: backend/database/schema.sql"
  fi
fi

# サービスの状態確認
log_info "サービスの状態:"
docker-compose -f docker-compose.dev.yml ps

log_info "開発環境が起動しました！"
log_info "バックエンドAPI: http://localhost:5001"  # ポート番号を5001に更新
log_info "MySQLデータベース: localhost:13306 (user: root, password: password)"
log_info "開発を開始するには: "
log_info "  - バックエンドのログを表示: docker-compose -f docker-compose.dev.yml logs -f backend"
log_info "  - データベースに接続: docker-compose -f docker-compose.dev.yml exec mysql mysql -uroot -ppassword autodialer"
