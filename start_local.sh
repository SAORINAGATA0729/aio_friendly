#!/bin/bash

# ローカルサーバー起動スクリプト
# APIサーバー（Python）とHTTPサーバー（Python）の両方を起動

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "AIO_PDCA爆速システム - ローカルサーバー起動"
echo "=========================================="
echo ""

# 既存のプロセスを終了
echo "既存のサーバープロセスを終了中..."
pkill -f "python3.*server.py" 2>/dev/null
pkill -f "python3 -m http.server" 2>/dev/null
sleep 1

# APIサーバー（ポート8000）をバックグラウンドで起動
echo "1. APIサーバーを起動中（ポート8000）..."
python3 server.py > /tmp/aio_api_server.log 2>&1 &
API_PID=$!
sleep 2

# HTTPサーバー（ポート3000）をバックグラウンドで起動
echo "2. HTTPサーバーを起動中（ポート3000）..."
python3 -m http.server 3000 > /tmp/aio_http_server.log 2>&1 &
HTTP_PID=$!
sleep 2

# サーバーが起動したか確認
if ps -p $API_PID > /dev/null && ps -p $HTTP_PID > /dev/null; then
    echo ""
    echo "✅ サーバー起動完了！"
    echo ""
    echo "📡 APIサーバー: http://localhost:8000"
    echo "🌐 HTTPサーバー: http://localhost:3000"
    echo ""
    echo "ブラウザで http://localhost:3000 を開いてください"
    echo ""
    echo "ログ確認:"
    echo "  APIサーバー: tail -f /tmp/aio_api_server.log"
    echo "  HTTPサーバー: tail -f /tmp/aio_http_server.log"
    echo ""
    echo "停止するには: Ctrl+C を押すか、以下のコマンドを実行"
    echo "  pkill -f 'python3.*server.py'"
    echo "  pkill -f 'python3 -m http.server'"
    echo ""
    
    # ブラウザで開く（macOS）
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sleep 1
        open http://localhost:3000
    fi
    
    # クリーンアップ関数
    cleanup() {
        echo ""
        echo "サーバーを停止中..."
        kill $API_PID 2>/dev/null
        kill $HTTP_PID 2>/dev/null
        echo "サーバーを停止しました。"
    }
    
    # Ctrl+Cでクリーンアップ
    trap cleanup EXIT INT TERM
    
    # プロセスが終了するまで待機
    wait $API_PID $HTTP_PID
else
    echo "❌ サーバーの起動に失敗しました。"
    echo "ログを確認してください:"
    echo "  tail /tmp/aio_api_server.log"
    echo "  tail /tmp/aio_http_server.log"
    exit 1
fi

