@echo off
REM AIO_PDCA爆速システム 起動スクリプト（Windows用）

echo ==========================================
echo AIO_PDCA爆速システム を起動します
echo ==========================================
echo.

cd /d "%~dp0"

echo ディレクトリ: %CD%
echo.
echo ブラウザで以下のURLにアクセスしてください:
echo   http://localhost:8000
echo.
echo 停止するには Ctrl+C を押してください
echo.

REM Python 3でサーバーを起動
python -m http.server 8000
if errorlevel 1 (
    python3 -m http.server 8000
    if errorlevel 1 (
        echo エラー: Pythonが見つかりません
        echo Python 3をインストールするか、Node.jsを使用してください
        pause
        exit /b 1
    )
)

pause

