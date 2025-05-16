#!/bin/bash
# sipcmd ツールのインストール

# 必要なパッケージのインストール
apt-get update
apt-get install -y build-essential git libosip2-dev libeXosip2-dev libspandsp-dev libortp-dev

# 作業ディレクトリの作成
mkdir -p /tmp/sipcmd
cd /tmp/sipcmd

# sipcmd のソースコードを取得
git clone https://github.com/tmakkonen/sipcmd.git .

# コンパイル
make

# 実行ファイルをインストール
cp sipcmd /usr/local/bin/

# 実行権限を設定
chmod +x /usr/local/bin/sipcmd

# 動作確認
sipcmd --help

echo "sipcmd のインストールが完了しました"
