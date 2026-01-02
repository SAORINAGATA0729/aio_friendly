# VS Code Live Serverで起動する方法

## 最も簡単な方法

1. **VS Codeでこのフォルダを開く**
   ```
   月次定例/2026年/1月/analysis_aio/Tier1_AIO/AIO_PDCA爆速システム
   ```

2. **VS Codeの拡張機能「Live Server」をインストール**
   - VS Codeの拡張機能タブ（左側の四角いアイコン）を開く
   - 「Live Server」で検索
   - 「Live Server」by Ritwick Dey をインストール

3. **index.htmlを右クリック → 「Open with Live Server」を選択**

これで自動的にブラウザが開き、`http://127.0.0.1:5500` でアクセスできます。

## メリット
- ✅ 自動リロード（ファイル変更時に自動更新）
- ✅ CORS問題なし
- ✅ 文字エンコーディング問題なし
- ✅ 設定不要

## 注意点
- 記事の自動取得機能（`/api/fetch`）は動作しません（Pythonサーバーが必要）
- その場合は「ブラウザで開く」→「コピー」→「空のエディタを開く」で手動対応

