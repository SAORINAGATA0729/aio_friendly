# GitHubにプッシュ & Vercelデプロイ手順

## 1. GitHubリポジトリの準備

### 新しいリポジトリを作成
1. GitHubにログイン
2. https://github.com/new にアクセス
3. リポジトリ名を入力（例: `aio-pdca-system`）
4. 「Create repository」をクリック

### ローカルでGit初期化
```bash
cd "月次定例/2026年/1月/analysis_aio/Tier1_AIO/AIO_PDCA爆速システム"
git init
git add .
git commit -m "Initial commit: AIO_PDCA爆速システム"
git branch -M main
git remote add origin https://github.com/[あなたのユーザー名]/[リポジトリ名].git
git push -u origin main
```

## 2. Vercelでデプロイ

### 自動デプロイ（推奨）
1. https://vercel.com にアクセス
2. GitHubアカウントでログイン
3. 「Add New Project」をクリック
4. 先ほど作成したリポジトリを選択
5. 「Deploy」をクリック

**完了！** 数分でデプロイが完了し、URLが表示されます。

### 手動デプロイ（Vercel CLI使用）
```bash
npm i -g vercel
cd "月次定例/2026年/1月/analysis_aio/Tier1_AIO/AIO_PDCA爆速システム"
vercel
```

## 3. 注意事項

### 動作しない機能
- ❌ 記事の自動取得（`/api/fetch`） - Pythonサーバーが必要なため
  → 「ブラウザで開く」→「コピー」→「空のエディタを開く」で手動対応

### 動作する機能
- ✅ ダッシュボード表示
- ✅ 記事一覧表示
- ✅ 記事編集（Markdownエディタ）
- ✅ チェックリスト
- ✅ データ保存（ブラウザのローカルストレージ）
- ✅ モニタリングデータ入力
- ✅ レポート生成

## 4. 今後の更新方法

コードを変更したら：
```bash
git add .
git commit -m "更新内容"
git push
```

Vercelが自動的に再デプロイします！

