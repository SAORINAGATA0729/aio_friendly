/**
 * ダッシュボード機能
 * PDCAタブ、現状把握カード、進捗状況の表示
 */

class Dashboard {
    constructor() {
        this.currentTab = 'plan';
        this.progressData = null;
        this.baselineData = null;
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupTabs();
        this.updateDashboard();
        this.setupEventListeners();
    }

    async loadData() {
        try {
            console.log('データ読み込み開始...');
            this.progressData = await dataManager.loadProgress();
            this.baselineData = await dataManager.loadBaseline();
            
            console.log('dataManager.loadProgress()結果:', this.progressData);
            console.log('dataManager.loadBaseline()結果:', this.baselineData);
            
            if (!this.progressData) {
                try {
                    console.warn('進捗データが見つかりません。fetchで直接読み込みます...');
                    // 複数のパスを試行
                    const paths = ['./data/progress.json', '/data/progress.json', 'data/progress.json'];
                    for (const path of paths) {
                        try {
                            console.log(`試行中: ${path}`);
                            const response = await fetch(path);
                            if (response.ok) {
                                this.progressData = await response.json();
                                console.log('progress.jsonの読み込み成功:', path);
                                break;
                            } else {
                                console.warn(`${path} の読み込み失敗: ${response.status}`);
                            }
                        } catch (error) {
                            console.warn(`${path} の読み込みエラー:`, error);
                        }
                    }
                    
                    if (!this.progressData) {
                        console.error('progress.jsonの読み込みに完全に失敗しました');
                    }
                } catch (error) {
                    console.error('progress.jsonの読み込みエラー:', error);
                }
            }
            
            if (!this.baselineData) {
                try {
                    console.warn('ベースラインデータが見つかりません。fetchで直接読み込みます...');
                    const paths = ['./data/baseline.json', '/data/baseline.json', 'data/baseline.json'];
                    for (const path of paths) {
                        try {
                            console.log(`試行中: ${path}`);
                            const response = await fetch(path);
                            if (response.ok) {
                                this.baselineData = await response.json();
                                console.log('baseline.jsonの読み込み成功:', path);
                                break;
                            } else {
                                console.warn(`${path} の読み込み失敗: ${response.status}`);
                            }
                        } catch (error) {
                            console.warn(`${path} の読み込みエラー:`, error);
                        }
                    }
                    
                    if (!this.baselineData) {
                        console.error('baseline.jsonの読み込みに完全に失敗しました');
                    }
                } catch (error) {
                    console.error('baseline.jsonの読み込みエラー:', error);
                }
            }
        } catch (error) {
            console.error('データ読み込みエラー:', error);
        }
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.pdca-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        // タブの切り替え
        document.querySelectorAll('.pdca-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // コンテンツの切り替え
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`).classList.add('active');

        this.currentTab = tabName;

        // タブごとの初期化
        if (tabName === 'do') {
            this.renderArticleList();
        } else if (tabName === 'check') {
            this.renderComparisonChart();
        } else if (tabName === 'action') {
            this.renderResults();
        }
    }

    updateDashboard() {
        if (!this.baselineData) return;

        // AIO引用数
        const aioCount = this.baselineData.aioCitations?.googleAIOverview?.count || 0;
        document.getElementById('aioCitationCount').textContent = aioCount.toLocaleString();
        
        // 検索順位
        const avgPosition = this.baselineData.searchRanking?.tier1Pages?.averagePosition || 0;
        document.getElementById('searchRankingAvg').textContent = avgPosition.toFixed(2);
        
        // トラフィック
        const trafficClicks = this.baselineData.traffic?.totalClicks || 0;
        document.getElementById('trafficClicks').textContent = trafficClicks.toLocaleString();
        
        // ブランド認知度
        const brandClicks = this.baselineData.brandRecognition?.totalClicks || 0;
        document.getElementById('brandClicks').textContent = brandClicks.toLocaleString();

        // 進捗状況
        this.updateProgress();
    }

    updateProgress() {
        if (!this.progressData || !this.progressData.summary) return;

        const summary = this.progressData.summary;
        document.getElementById('progressCompleted').textContent = summary.completed || 0;
        document.getElementById('progressInProgress').textContent = summary.inProgress || 0;
        document.getElementById('progressNotStarted').textContent = summary.notStarted || 0;

        // 進捗バー
        const total = summary.total || 20;
        const completed = summary.completed || 0;
        const percentage = total > 0 ? (completed / total) * 100 : 0;
        document.getElementById('progressBarFill').style.width = `${percentage}%`;
    }

    renderArticleList(filter = 'all') {
        console.log('renderArticleList called, filter:', filter);
        console.log('progressData:', this.progressData);
        
        if (!this.progressData || !this.progressData.articles) {
            console.warn('進捗データが読み込まれていません。データを再読み込みします...');
            // データを再読み込み
            this.loadData().then(() => {
                if (this.progressData && this.progressData.articles) {
                    this.renderArticleList(filter);
                } else {
                    console.error('データの読み込みに失敗しました');
                    const articleList = document.getElementById('articleList');
                    if (articleList) {
                        articleList.innerHTML = '<div style="padding: 2rem; text-align: center; color: #ef4444;">データの読み込みに失敗しました。ページをリロードしてください。</div>';
                    }
                }
            });
            return;
        }

        const articleList = document.getElementById('articleList');
        if (!articleList) {
            console.error('articleList要素が見つかりません');
            return;
        }
        
        console.log('記事数:', this.progressData.articles.length);
        
        // ヘッダーを追加（初回のみ）
        if (!document.querySelector('.article-list-header')) {
            const header = document.createElement('div');
            header.className = 'article-list-header';
            header.innerHTML = `
                <div>記事情報</div>
                <div style="text-align: center;">ステータス</div>
                <div style="text-align: center;">AIO引用数</div>
                <div style="text-align: center;">スコア</div>
            `;
            articleList.parentNode.insertBefore(header, articleList);
        }
        
        articleList.innerHTML = '';

        const articles = this.progressData.articles.filter(article => {
            if (filter === 'all') return true;
            if (filter === 'notStarted') return article.status === '未着手';
            if (filter === 'inProgress') return article.status === '進行中';
            if (filter === 'completed') return article.status === '完了';
            return true;
        });

        articles.forEach(article => {
            const item = this.createArticleItem(article);
            articleList.appendChild(item);
        });
    }

    createArticleItem(article) {
        const item = document.createElement('div');
        item.className = 'article-item';
        item.dataset.articleId = article.id;

        const statusClass = article.status === '完了' ? 'completed' : 
                           article.status === '進行中' ? 'inProgress' : 'notStarted';

        const score = article.scores?.after || article.scores?.before || { total: 0, level: 'C' };
        const scoreLevel = score.level.toLowerCase();

        item.innerHTML = `
            <div class="article-info">
                <div class="article-title">${article.title}</div>
                <div class="article-meta">
                    <span class="material-icons-round" style="font-size: 14px;">vpn_key</span>
                    ${article.keyword}
                </div>
            </div>
            <div style="display: flex; justify-content: center;">
                <span class="article-status ${statusClass}">${article.status}</span>
            </div>
            <div style="display: flex; justify-content: center; align-items: center; gap: 4px;">
                <span class="material-icons-round" style="font-size: 16px; color: var(--primary-color);">auto_awesome</span>
                <span class="article-citation">${article.citationCount}</span>
            </div>
            <div style="display: flex; justify-content: center;">
                <span class="score-badge level-${scoreLevel}">${score.total}点 (${score.level})</span>
            </div>
        `;

        item.style.cursor = 'pointer';
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('記事がクリックされました:', article.title);
            console.log('rewriteSystem:', typeof rewriteSystem);
            
            // rewriteSystemが初期化されるまで待つ
            if (typeof rewriteSystem === 'undefined') {
                console.warn('rewriteSystemが初期化されていません。少し待ってから再試行してください。');
                // 少し待ってから再試行
                setTimeout(async () => {
                    if (typeof rewriteSystem !== 'undefined' && rewriteSystem.openUrlModal) {
                        console.log('再試行: rewriteSystemが見つかりました');
                        await rewriteSystem.openUrlModal(article);
                    } else {
                        console.error('rewriteSystemが見つかりません');
                        alert('システムの初期化に失敗しました。ページをリロードしてください。');
                    }
                }, 1000);
                return;
            }
            
            // URL入力モーダルを開く
            try {
                console.log('openUrlModalを呼び出します');
                await rewriteSystem.openUrlModal(article);
                console.log('openUrlModalが完了しました');
            } catch (error) {
                console.error('記事を開く際にエラーが発生しました:', error);
                alert('記事を開く際にエラーが発生しました: ' + error.message);
            }
        });

        return item;
    }

    setupEventListeners() {
        // フィルターボタン
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filter = btn.dataset.filter;
                this.renderArticleList(filter);
            });
        });

        // 仮説立案フォーム
        const hypothesisForm = document.getElementById('hypothesisForm');
        if (hypothesisForm) {
            hypothesisForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveHypothesis();
            });
        }

        // バックアップボタン
        const backupBtn = document.getElementById('backupBtn');
        if (backupBtn) {
            backupBtn.addEventListener('click', () => {
                dataManager.createBackup();
            });
        }
    }

    async saveHypothesis() {
        const title = document.getElementById('hypothesisTitle').value;
        const description = document.getElementById('hypothesisDescription').value;
        const target = document.getElementById('hypothesisTarget').value;

        if (!title || !description) {
            alert('タイトルと詳細は必須です。');
            return;
        }

        const hypothesis = {
            title,
            description,
            target,
            createdAt: new Date().toISOString()
        };

        // ローカルストレージに保存（仮）
        localStorage.setItem('aio_hypothesis', JSON.stringify(hypothesis));
        alert('仮説を保存しました。');
        
        // フォームをリセット
        document.getElementById('hypothesisForm').reset();
    }

    renderComparisonChart() {
        // Chart.jsを使用した比較グラフの実装
        // monitoring.jsで実装
        if (typeof monitoringSystem !== 'undefined') {
            monitoringSystem.renderComparisonChart();
        }
    }

    renderResults() {
        // 効果測定結果の表示
        // reporting.jsで実装
        if (typeof reportingSystem !== 'undefined') {
            reportingSystem.renderResults();
        }
    }
}

// グローバルインスタンス
let dashboardSystem;

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
    dashboardSystem = new Dashboard();
});
