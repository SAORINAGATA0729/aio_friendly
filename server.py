import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import re
import sys
import os
import ssl

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
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "Missing 'url' parameter"}).encode('utf-8'))
                return

            # URLデコード
            try:
                target_url = urllib.parse.unquote(target_url)
            except Exception as decode_error:
                print(f"URL decode error: {decode_error}")
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": f"Invalid URL encoding: {str(decode_error)}"}).encode('utf-8'))
                return

            print(f"Fetching: {target_url}")

            # 記事の取得（User-Agentを設定してブラウザのふりをする）
            # SSL証明書の検証を無効化（開発環境用）
            # より確実な方法として、ssl._create_unverified_context()を使用
            try:
                ssl_context = ssl._create_unverified_context()
                print(f"[DEBUG] SSL context created using _create_unverified_context()")
            except AttributeError:
                # フォールバック: create_default_context()を使用
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
                print(f"[DEBUG] SSL context created using create_default_context(): check_hostname={ssl_context.check_hostname}, verify_mode={ssl_context.verify_mode}")
            
            try:
                req = urllib.request.Request(
                    target_url, 
                    headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'}
                )
                
                print(f"[DEBUG] Opening URL with SSL context...")
                with urllib.request.urlopen(req, timeout=30, context=ssl_context) as response:
                    html_content = response.read().decode('utf-8')
                print(f"[DEBUG] Successfully fetched content, length: {len(html_content)}")
            except urllib.error.HTTPError as e:
                print(f"HTTP Error: {e.code} - {e.reason}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": f"HTTP Error {e.code}: {e.reason}"}).encode('utf-8'))
                return
            except urllib.error.URLError as e:
                import traceback
                print(f"[DEBUG] URL Error caught: {e.reason}")
                print(f"[DEBUG] Error type: {type(e).__name__}")
                print(f"[DEBUG] Error args: {e.args}")
                print(f"[DEBUG] Traceback: {traceback.format_exc()}")
                # SSLエラーの場合、より詳細な情報を出力
                if 'SSL' in str(e.reason) or 'CERTIFICATE' in str(e.reason):
                    print(f"[DEBUG] SSL Error detected! SSL context was: check_hostname={ssl_context.check_hostname}, verify_mode={ssl_context.verify_mode}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": f"URL Error: {e.reason}"}).encode('utf-8'))
                return
            except Exception as fetch_error:
                import traceback
                print(f"[DEBUG] Fetch error: {fetch_error}")
                print(f"[DEBUG] Error type: {type(fetch_error).__name__}")
                print(f"[DEBUG] Traceback: {traceback.format_exc()}")
                # SSLエラーの場合、より詳細な情報を出力
                if 'SSL' in str(fetch_error) or 'CERTIFICATE' in str(fetch_error):
                    print(f"[DEBUG] SSL Error detected in general exception! SSL context was: check_hostname={ssl_context.check_hostname}, verify_mode={ssl_context.verify_mode}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": f"Fetch error: {str(fetch_error)}"}).encode('utf-8'))
                return

            # HTMLをMarkdownに簡易変換
            try:
                markdown_content = self.html_to_markdown(html_content, target_url)
            except Exception as convert_error:
                print(f"Conversion error: {convert_error}")
                import traceback
                print(f"Traceback: {traceback.format_exc()}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": f"Conversion error: {str(convert_error)}"}).encode('utf-8'))
                return

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
            import traceback
            print(f"Error: {e}")
            print(f"Traceback: {traceback.format_exc()}")
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_msg = str(e)
            if len(error_msg) > 500:
                error_msg = error_msg[:500] + "..."
            self.wfile.write(json.dumps({"success": False, "error": error_msg}).encode('utf-8'))

    def html_to_markdown(self, html, base_url=''):
        """
        HTML→Markdown変換（Vercel版と同じロジック）
        giftee.bizの記事ページ構造に合わせた抽出
        """
        # 1. まず、記事のメインコンテンツエリアを探す
        content_match = None
        
        # パターン1: classに"content"や"article"を含むdivを探す
        patterns = [
            r'<div[^>]*class="[^"]*article[^"]*content[^"]*"[^>]*>([\s\S]*?)</div>',
            r'<div[^>]*class="[^"]*post[^"]*content[^"]*"[^>]*>([\s\S]*?)</div>',
            r'<div[^>]*class="[^"]*entry[^"]*content[^"]*"[^>]*>([\s\S]*?)</div>',
            r'<div[^>]*class="[^"]*column[^"]*content[^"]*"[^>]*>([\s\S]*?)</div>',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                content_match = match
                break
        
        # パターン2: articleタグまたはmainタグの中身を抽出
        if not content_match:
            match = re.search(r'<article[^>]*>([\s\S]*?)</article>', html, re.IGNORECASE)
            if match:
                content_match = match
        
        if not content_match:
            match = re.search(r'<main[^>]*>([\s\S]*?)</main>', html, re.IGNORECASE)
            if match:
                content_match = match
        
        # パターン3: H1タグを含むセクションを探す
        if not content_match:
            h1_match = re.search(r'<h1[^>]*>([\s\S]*?)</h1>', html, re.IGNORECASE)
            if h1_match:
                h1_index = html.find(h1_match.group(0))
                start = max(0, h1_index - 500)
                end = min(len(html), h1_index + 10000)
                # ダミーマッチオブジェクトを作成
                class DummyMatch:
                    def __init__(self, group):
                        self._group = group
                    def group(self, n):
                        return self._group if n == 1 else None
                content_match = DummyMatch(html[start:end])
        
        # パターン4: bodyタグ全体から不要な部分を除外
        if not content_match:
            body_match = re.search(r'<body[^>]*>([\s\S]*?)</body>', html, re.IGNORECASE)
            if body_match:
                body_content = body_match.group(1)
                # ヘッダー、フッター、サイドバーを削除
                body_content = re.sub(r'<header[^>]*>[\s\S]*?</header>', '', body_content, flags=re.IGNORECASE)
                body_content = re.sub(r'<footer[^>]*>[\s\S]*?</footer>', '', body_content, flags=re.IGNORECASE)
                body_content = re.sub(r'<nav[^>]*>[\s\S]*?</nav>', '', body_content, flags=re.IGNORECASE)
                body_content = re.sub(r'<aside[^>]*>[\s\S]*?</aside>', '', body_content, flags=re.IGNORECASE)
                class DummyMatch:
                    def __init__(self, group):
                        self._group = group
                    def group(self, n):
                        return self._group if n == 1 else None
                content_match = DummyMatch(body_content)
        
        content = content_match.group(1) if content_match else html

        # スクリプトとスタイルを削除
        content = re.sub(r'<script[^>]*>[\s\S]*?</script>', '', content, flags=re.IGNORECASE)
        content = re.sub(r'<style[^>]*>[\s\S]*?</style>', '', content, flags=re.IGNORECASE)

        # 見出し（最初のH1のみを保持し、2つ目以降はH2に変換）
        h1_count = 0
        def replace_h1(match):
            nonlocal h1_count
            h1_count += 1
            text = match.group(1).strip()
            if h1_count == 1:
                return '\n# ' + text + '\n'
            else:
                return '\n## ' + text + '\n'
        
        content = re.sub(r'<h1[^>]*>([\s\S]*?)</h1>', replace_h1, content, flags=re.IGNORECASE)
        content = re.sub(r'<h2[^>]*>([\s\S]*?)</h2>', r'\n## \1\n', content, flags=re.IGNORECASE)
        content = re.sub(r'<h3[^>]*>([\s\S]*?)</h3>', r'\n### \1\n', content, flags=re.IGNORECASE)
        content = re.sub(r'<h4[^>]*>([\s\S]*?)</h4>', r'\n#### \1\n', content, flags=re.IGNORECASE)

        # 段落
        content = re.sub(r'<p[^>]*>([\s\S]*?)</p>', r'\n\1\n', content, flags=re.IGNORECASE)

        # リスト
        content = re.sub(r'<li[^>]*>([\s\S]*?)</li>', r'- \1', content, flags=re.IGNORECASE)
        content = re.sub(r'<ul[^>]*>', '', content, flags=re.IGNORECASE)
        content = re.sub(r'</ul>', '', content, flags=re.IGNORECASE)

        # 改行タグ
        content = re.sub(r'<br\s*/?>', '\n', content, flags=re.IGNORECASE)

        # 太字
        content = re.sub(r'<strong[^>]*>([\s\S]*?)</strong>', r'**\1**', content, flags=re.IGNORECASE)
        content = re.sub(r'<b[^>]*>([\s\S]*?)</b>', r'**\1**', content, flags=re.IGNORECASE)

        # リンク
        content = re.sub(r'<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)</a>', r'[\2](\1)', content, flags=re.IGNORECASE)

        # 画像（URLを絶対URLに変換）
        def convert_image_url(match):
            src = match.group(1)
            alt = match.group(2)
            image_url = src
            
            # 相対URLを絶対URLに変換
            if base_url and image_url and not image_url.startswith('http://') and not image_url.startswith('https://') and not image_url.startswith('//'):
                try:
                    if image_url.startswith('/'):
                        # ルート相対URL
                        from urllib.parse import urlparse
                        url_obj = urlparse(base_url)
                        image_url = f"{url_obj.scheme}://{url_obj.netloc}{image_url}"
                    else:
                        # 相対URL（ベースURLを基準に解決）
                        from urllib.parse import urljoin
                        image_url = urljoin(base_url, image_url)
                except Exception as e:
                    print(f"[ERROR] Failed to convert image URL to absolute: {e}")
                    # 変換に失敗した場合は元のURLをそのまま使用
            
            return f'![{alt}]({image_url})'
        
        content = re.sub(r'<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>', convert_image_url, content, flags=re.IGNORECASE)

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

