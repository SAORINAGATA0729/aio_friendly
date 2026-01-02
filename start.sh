#!/bin/bash

# AIO_PDCA爆速システム 起動スクリプト

echo "=========================================="
echo "AIO_PDCA爆速システム を起動します"
echo "=========================================="
echo ""

# 現在のディレクトリを取得
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "ディレクトリ: $SCRIPT_DIR"
echo ""
echo "ブラウザで以下のURLにアクセスしてください:"
echo "  http://localhost:8000"
echo ""
echo "停止するには Ctrl+C を押してください"
echo ""

# Python 3でサーバーを起動
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    python -m http.server 8000
else
    echo "エラー: Pythonが見つかりません"
    echo "Python 3をインストールするか、Node.jsを使用してください"
    exit 1
fi

