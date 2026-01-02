/**
 * データ管理機能
 * JSON/Markdownファイルの読み書きを管理
 */

class DataManager {
    constructor() {
        this.basePath = './data/';
        this.progressFile = 'progress.json';
        this.baselineFile = 'baseline.json';
        this.articlesPath = 'articles/';
        this.monitoringPath = 'monitoring/';
        
        // ローカルストレージのキー
        this.storageKeys = {
            progress: 'aio_pdca_progress',
            baseline: 'aio_pdca_baseline',
            articles: 'aio_pdca_articles_',
            monitoring: 'aio_pdca_monitoring_'
        };
    }

    /**
     * ファイルを読み込む（File System Access APIまたはローカルストレージ）
     */
    async loadFile(filename) {
        try {
            // まずローカルストレージから試行
            const storageKey = this.getStorageKey(filename);
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                return JSON.parse(stored);
            }

            // File System Access APIを試行（Chrome）
            if ('showOpenFilePicker' in window) {
                const fileHandle = await this.getFileHandle(filename);
                const file = await fileHandle.getFile();
                const text = await file.text();
                const data = JSON.parse(text);
                
                // ローカルストレージにも保存
                localStorage.setItem(storageKey, text);
                return data;
            }

            // フォールバック: fetchで読み込み
            try {
                const response = await fetch(`${this.basePath}${filename}`);
                if (response.ok) {
                    const data = await response.json();
                    localStorage.setItem(storageKey, JSON.stringify(data));
                    return data;
                }
            } catch (fetchError) {
                console.warn(`Fetch failed for ${filename}, trying relative path`);
                // 相対パスでも試行
                try {
                    const response = await fetch(`./data/${filename}`);
                    if (response.ok) {
                        const data = await response.json();
                        localStorage.setItem(storageKey, JSON.stringify(data));
                        return data;
                    }
                } catch (relError) {
                    console.error(`Failed to load ${filename}:`, relError);
                }
            }
        } catch (error) {
            console.error(`ファイル読み込みエラー (${filename}):`, error);
            // ローカルストレージから読み込みを試行
            const storageKey = this.getStorageKey(filename);
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                return JSON.parse(stored);
            }
        }
        return null;
    }

    /**
     * ファイルを保存する
     */
    async saveFile(filename, data) {
        try {
            const jsonString = JSON.stringify(data, null, 2);
            const storageKey = this.getStorageKey(filename);
            
            // ローカルストレージに保存
            localStorage.setItem(storageKey, jsonString);

            // File System Access APIを試行（Chrome）
            if ('showSaveFilePicker' in window) {
                const fileHandle = await this.getFileHandleForSave(filename);
                const writable = await fileHandle.createWritable();
                await writable.write(jsonString);
                await writable.close();
                return true;
            }

            // フォールバック: ダウンロード
            this.downloadFile(filename, jsonString);
            return true;
        } catch (error) {
            console.error(`ファイル保存エラー (${filename}):`, error);
            // ローカルストレージには保存済み
            return false;
        }
    }

    /**
     * Markdownファイルを読み込む
     */
    async loadMarkdown(filename) {
        try {
            const storageKey = `${this.storageKeys.articles}${filename}`;
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                return stored;
            }

            const response = await fetch(`${this.basePath}${this.articlesPath}${filename}`);
            if (response.ok) {
                const text = await response.text();
                localStorage.setItem(storageKey, text);
                return text;
            }
        } catch (error) {
            console.error(`Markdown読み込みエラー (${filename}):`, error);
            const storageKey = `${this.storageKeys.articles}${filename}`;
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                return stored;
            }
        }
        return '';
    }

    /**
     * Markdownファイルを保存する
     */
    async saveMarkdown(filename, content) {
        try {
            const storageKey = `${this.storageKeys.articles}${filename}`;
            localStorage.setItem(storageKey, content);

            if ('showSaveFilePicker' in window) {
                const fileHandle = await this.getFileHandleForSave(`${this.articlesPath}${filename}`);
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();
                return true;
            }

            this.downloadFile(filename, content, 'text/markdown');
            return true;
        } catch (error) {
            console.error(`Markdown保存エラー (${filename}):`, error);
            return false;
        }
    }

    /**
     * 進捗データを読み込む
     */
    async loadProgress() {
        return await this.loadFile(this.progressFile);
    }

    /**
     * 進捗データを保存する
     */
    async saveProgress(data) {
        data.lastUpdated = new Date().toISOString().split('T')[0];
        this.updateSummary(data);
        return await this.saveFile(this.progressFile, data);
    }

    /**
     * ベースラインデータを読み込む
     */
    async loadBaseline() {
        return await this.loadFile(this.baselineFile);
    }

    /**
     * ベースラインデータを保存する
     */
    async saveBaseline(data) {
        return await this.saveFile(this.baselineFile, data);
    }

    /**
     * 月次モニタリングデータを読み込む
     */
    async loadMonitoring(year, month) {
        const filename = `${year}-${String(month).padStart(2, '0')}.json`;
        return await this.loadFile(`${this.monitoringPath}${filename}`);
    }

    /**
     * 月次モニタリングデータを保存する
     */
    async saveMonitoring(year, month, data) {
        const filename = `${year}-${String(month).padStart(2, '0')}.json`;
        return await this.saveFile(`${this.monitoringPath}${filename}`, data);
    }

    /**
     * 進捗サマリーを更新
     */
    updateSummary(progressData) {
        if (!progressData.articles) return;

        const summary = {
            total: progressData.articles.length,
            notStarted: 0,
            inProgress: 0,
            completed: 0
        };

        progressData.articles.forEach(article => {
            if (article.status === '完了') {
                summary.completed++;
            } else if (article.status === '進行中') {
                summary.inProgress++;
            } else {
                summary.notStarted++;
            }
        });

        progressData.summary = summary;
    }

    /**
     * 記事のスコアを計算
     */
    calculateScore(checklist) {
        let score = {
            structure: 0,
            content: 0,
            primary: 0,
            keyword: 0,
            total: 0
        };

        // 記事構造（3項目）
        if (checklist.hasDefinition) score.structure++;
        if (checklist.hasConclusionFirst) score.structure++;
        if (checklist.hasProperHeadings) score.structure++;

        // コンテンツ形式（4項目）
        if (checklist.hasFAQ) score.content++;
        if (checklist.hasList) score.content++;
        if (checklist.hasTable) score.content++;
        if (checklist.hasSummary) score.content++;

        // 一次情報（1項目）
        if (checklist.hasPrimaryData) score.primary++;

        // キーワード配置（2項目）
        if (checklist.mainKeywordInH1) score.keyword++;
        if (checklist.mainKeywordInOpening) score.keyword++;

        score.total = score.structure + score.content + score.primary + score.keyword;

        // 評価レベルを決定
        let level = 'C';
        if (score.total >= 8) level = 'A';
        else if (score.total >= 5) level = 'B';

        return { ...score, level };
    }

    /**
     * ファイルハンドルを取得（File System Access API）
     */
    async getFileHandle(filename) {
        // 簡易実装: 実際にはユーザーにファイル選択を促す
        // ここではfetchで読み込む方式を使用
        throw new Error('File System Access APIは実装が必要');
    }

    /**
     * 保存用ファイルハンドルを取得
     */
    async getFileHandleForSave(filename) {
        // 簡易実装: 実際にはユーザーに保存場所を選択させる
        // ここではダウンロード方式を使用
        throw new Error('File System Access APIは実装が必要');
    }

    /**
     * ファイルをダウンロード
     */
    downloadFile(filename, content, mimeType = 'application/json') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * ストレージキーを取得
     */
    getStorageKey(filename) {
        if (filename === this.progressFile) return this.storageKeys.progress;
        if (filename === this.baselineFile) return this.storageKeys.baseline;
        if (filename.startsWith(this.monitoringPath)) {
            const monthFile = filename.replace(this.monitoringPath, '');
            return `${this.storageKeys.monitoring}${monthFile}`;
        }
        return `aio_pdca_${filename}`;
    }

    /**
     * データのバックアップを作成
     */
    async createBackup() {
        const backup = {
            timestamp: new Date().toISOString(),
            progress: await this.loadProgress(),
            baseline: await this.loadBaseline()
        };
        
        const backupString = JSON.stringify(backup, null, 2);
        const filename = `backup_${new Date().toISOString().split('T')[0]}.json`;
        this.downloadFile(filename, backupString);
        return backup;
    }

    /**
     * バックアップから復元
     */
    async restoreFromBackup(backupData) {
        if (backupData.progress) {
            await this.saveProgress(backupData.progress);
        }
        if (backupData.baseline) {
            await this.saveBaseline(backupData.baseline);
        }
    }
}

// グローバルインスタンスを作成
const dataManager = new DataManager();

