import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import re
import sys
import os

PORT = 8000

class APIHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # HTMLファイルの場合、UTF-8を明示的に設定
        if self.path.endswith('.html'):
            self.send_header('Content-Type', 'text/html; charset=utf-8')
        super().end_headers()
    
    def do_GET(self):
        # APIエンドポイント: /api/fetch?url=...
        if self.path.startswith('/api/fetch'):
            self.handle_fetch()
        else:
            # 通常のファイル配信
            super().do_GET()

    def handle_fetch(self):
        try:
            # URLパラメータの解析
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            target_url = params.get('url', [None])[0]

            if not target_url:
                self.send_error(400, "Missing 'url' parameter")
                return

            print(f"Fetching: {target_url}")

            # 記事の取得（User-Agentを設定してブラウザのふりをする）
            req = urllib.request.Request(
                target_url, 
                headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'}
            )
            
            with urllib.request.urlopen(req) as response:
                html_content = response.read().decode('utf-8')

            # HTMLをMarkdownに簡易変換
            markdown_content = self.html_to_markdown(html_content)

            # JSONレスポンスの作成
            response_data = {
                "success": True,
                "url": target_url,
                "content": markdown_content
            }

            # レスポンス送信
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*') # CORS許可
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))

        except Exception as e:
            print(f"Error: {e}")
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))

    def html_to_markdown(self, html):
        """
        簡易的なHTML→Markdown変換
        BeautifulSoupを使わずに正規表現で処理（依存関係を減らすため）
        """
        # mainタグまたはarticleタグの中身を抽出（できれば）
        main_match = re.search(r'<article[^>]*>(.*?)</article>', html, re.DOTALL | re.IGNORECASE)
        if not main_match:
            main_match = re.search(r'<main[^>]*>(.*?)</main>', html, re.DOTALL | re.IGNORECASE)
        
        content = main_match.group(1) if main_match else html

        # スクリプトとスタイルを削除
        content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL | re.IGNORECASE)
        content = re.sub(r'<style[^>]*>.*?</style>', '', content, flags=re.DOTALL | re.IGNORECASE)

        # 見出し
        content = re.sub(r'<h1[^>]*>(.*?)</h1>', r'\n# \1\n', content, flags=re.IGNORECASE)
        content = re.sub(r'<h2[^>]*>(.*?)</h2>', r'\n## \1\n', content, flags=re.IGNORECASE)
        content = re.sub(r'<h3[^>]*>(.*?)</h3>', r'\n### \1\n', content, flags=re.IGNORECASE)
        content = re.sub(r'<h4[^>]*>(.*?)</h4>', r'\n#### \1\n', content, flags=re.IGNORECASE)

        # 段落
        content = re.sub(r'<p[^>]*>(.*?)</p>', r'\n\1\n', content, flags=re.IGNORECASE)

        # リスト
        content = re.sub(r'<li[^>]*>(.*?)</li>', r'- \1', content, flags=re.IGNORECASE)
        content = re.sub(r'<ul[^>]*>', r'', content, flags=re.IGNORECASE)
        content = re.sub(r'</ul>', r'', content, flags=re.IGNORECASE)

        # 改行タグ
        content = re.sub(r'<br\s*/?>', r'\n', content, flags=re.IGNORECASE)

        # 太字
        content = re.sub(r'<strong[^>]*>(.*?)</strong>', r'**\1**', content, flags=re.IGNORECASE)
        content = re.sub(r'<b[^>]*>(.*?)</b>', r'**\1**', content, flags=re.IGNORECASE)

        # リンク
        content = re.sub(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', r'[\2](\1)', content, flags=re.IGNORECASE)

        # 画像
        content = re.sub(r'<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>', r'![\2](\1)', content, flags=re.IGNORECASE)

        # その他のタグを削除
        content = re.sub(r'<[^>]+>', '', content)

        # HTMLエンティティのデコード（簡易）
        content = content.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')

        # 連続する空行を整理
        content = re.sub(r'\n\s*\n', '\n\n', content)
        
        return content.strip()

if __name__ == "__main__":
    # カレントディレクトリをこのファイルの場所に移動
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), APIHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        print(f"Press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass

