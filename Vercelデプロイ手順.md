# Vercelデプロイ手順（上級者向け）

## 前提条件
- Vercelアカウント（GitHubアカウントでサインアップ可能）
- GitHubリポジトリ（このプロジェクトをプッシュ）

## デプロイ手順

### 1. GitHubにプッシュ
```bash
cd "月次定例/2026年/1月/analysis_aio/Tier1_AIO/AIO_PDCA爆速システム"
git init
git add .
git commit -m "Initial commit"
git remote add origin [あなたのGitHubリポジトリURL]
git push -u origin main
```

### 2. Vercelでデプロイ
1. https://vercel.com にアクセス
2. 「New Project」をクリック
3. GitHubリポジトリを選択
4. 「Deploy」をクリック

### 3. 必要な調整
Vercelでは以下の機能が動作しません：
- ❌ ローカルファイルへの書き込み（File System Access API）
- ❌ Pythonサーバー（`/api/fetch`エンドポイント）

**対応策：**
- データ保存 → ローカルストレージ（ブラウザ）に変更済み
- 記事取得 → 手動コピペにフォールバック（既に実装済み）

## メリット
- ✅ どこからでもアクセス可能
- ✅ 自動デプロイ（GitHubにプッシュするだけで更新）
- ✅ HTTPS対応

## デメリット
- ❌ 記事の自動取得機能は動作しない（手動コピペが必要）
- ❌ データはブラウザのローカルストレージに保存（ブラウザをクリアすると消える）

