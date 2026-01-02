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
        console.log('[DEBUG] Dashboard.init: Starting');
        try {
            await this.loadData();
            console.log('[DEBUG] Dashboard.init: Data loaded');
            this.setupTabs();
            console.log('[DEBUG] Dashboard.init: Tabs setup');
            this.updateDashboard();
            console.log('[DEBUG] Dashboard.init: Dashboard updated');
            this.setupEventListeners();
            console.log('[DEBUG] Dashboard.init: Event listeners setup');
            
            // データが読み込まれたら、現在のタブのコンテンツを表示
            // Doタブがアクティブな場合、記事一覧を表示
            if (this.currentTab === 'do' && this.progressData && this.progressData.articles) {
                console.log('初期化時: Doタブがアクティブなので記事一覧を表示します');
                setTimeout(() => {
                    this.renderArticleList();
                }, 500);
            }
            console.log('[DEBUG] Dashboard.init: Completed');
        } catch (error) {
            console.error('[ERROR] Dashboard.init failed:', error);
        }
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
                                console.log('読み込んだ記事数:', this.progressData?.articles?.length);
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
            
            // データ読み込み完了後、Doタブがアクティブな場合は記事一覧を表示
            if (this.progressData && this.progressData.articles) {
                console.log('データ読み込み完了。記事数:', this.progressData.articles.length);
                // 現在アクティブなタブを確認
                const activeTab = document.querySelector('.pdca-tab.active');
                if (activeTab && activeTab.dataset.tab === 'do') {
                    console.log('Doタブがアクティブなので記事一覧を表示します...');
                    setTimeout(() => {
                        this.renderArticleList();
                    }, 300);
                }
            }
        } catch (error) {
            console.error('データ読み込みエラー:', error);
        }
    }

    setupTabs() {
        console.log('[DEBUG] setupTabs: Starting');
        const tabs = document.querySelectorAll('.pdca-tab');
        console.log('[DEBUG] setupTabs: Tabs found:', tabs.length);
        if (tabs.length === 0) {
            console.error('[ERROR] No tabs found!');
            return;
        }
        tabs.forEach((tab, index) => {
            const tabName = tab.dataset.tab;
            console.log(`[DEBUG] Setting up tab ${index}:`, tabName, tab);
            if (!tabName) {
                console.error('[ERROR] Tab has no data-tab attribute:', tab);
                return;
            }
            tab.addEventListener('click', (e) => {
                console.log('[DEBUG] Tab clicked:', tabName, e);
                e.preventDefault();
                e.stopPropagation();
                try {
                    this.switchTab(tabName);
                } catch (error) {
                    console.error('[ERROR] Error in switchTab:', error);
                }
            });
        });
        console.log('[DEBUG] setupTabs completed');
    }

    getStatusClass(status) {
        return status === '完了' ? 'completed' : 
               status === '進行中' ? 'inProgress' : 'notStarted';
    }

    async updateArticleStatus(articleId, newStatus) {
        if (!this.progressData || !this.progressData.articles) {
            console.error('進捗データが読み込まれていません');
            return;
        }

        const article = this.progressData.articles.find(a => a.id === articleId);
        if (!article) {
            console.error('記事が見つかりません:', articleId);
            return;
        }

        // ステータスを更新
        article.status = newStatus;
        article.lastModified = new Date().toISOString();

        // 進捗サマリーを更新
        this.updateProgressSummary();

        // データを保存
        try {
            await dataManager.saveProgress(this.progressData);
            console.log('ステータスを更新しました:', articleId, newStatus);
            
            // 一覧を再描画
            const currentFilter = document.querySelector('.pdca-tab.active')?.dataset.tab || 'all';
            this.renderArticleList(currentFilter);
            
            // 進捗を更新
            this.updateProgress();
        } catch (error) {
            console.error('ステータスの更新に失敗しました:', error);
            alert('ステータスの更新に失敗しました: ' + error.message);
        }
    }

    updateProgressSummary() {
        if (!this.progressData || !this.progressData.articles) return;

        const summary = {
            total: this.progressData.articles.length,
            completed: this.progressData.articles.filter(a => a.status === '完了').length,
            inProgress: this.progressData.articles.filter(a => a.status === '進行中').length,
            notStarted: this.progressData.articles.filter(a => a.status === '未着手').length
        };

        this.progressData.summary = summary;
    }

    switchTab(tabName) {
        console.log('[DEBUG] switchTab called with:', tabName);
        console.log('[DEBUG] this:', this);
        
        // タブの切り替え
        const allTabs = document.querySelectorAll('.pdca-tab');
        console.log('[DEBUG] All tabs found:', allTabs.length);
        allTabs.forEach(tab => {
            tab.classList.remove('active');
        });
        
        const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
        console.log('[DEBUG] Target tab found:', !!targetTab, targetTab);
        if (targetTab) {
            targetTab.classList.add('active');
            console.log('[DEBUG] Tab activated:', tabName);
        } else {
            console.error('[ERROR] Tab not found:', tabName);
            return;
        }

        // コンテンツの切り替え
        const allContents = document.querySelectorAll('.tab-content');
        console.log('[DEBUG] All contents found:', allContents.length);
        allContents.forEach(content => {
            content.classList.remove('active');
        });
        
        const targetContent = document.getElementById(`${tabName}Tab`);
        console.log('[DEBUG] Target content found:', !!targetContent, targetContent);
        if (targetContent) {
            targetContent.classList.add('active');
            console.log('[DEBUG] Content activated:', `${tabName}Tab`);
        } else {
            console.error('[ERROR] Content not found:', `${tabName}Tab`);
            return;
        }

        this.currentTab = tabName;
        console.log('[DEBUG] switchTab completed');

        // タブごとの初期化（少し遅延させてDOMの更新を確実にする）
        setTimeout(() => {
            console.log('=== タブ初期化開始 ===');
            console.log('tabName:', tabName);
            console.log('progressData:', this.progressData);
            console.log('articles:', this.progressData?.articles);
            
            if (tabName === 'do') {
                console.log('Doタブが選択されました。記事一覧を表示します...');
                if (this.progressData && this.progressData.articles) {
                    console.log('データが読み込まれています。記事一覧を表示します');
                    this.renderArticleList();
                } else {
                    console.warn('データがまだ読み込まれていません。データを読み込みます...');
                    this.loadData().then(() => {
                        console.log('データ読み込み完了。記事一覧を表示します');
                        this.renderArticleList();
                    });
                }
            } else if (tabName === 'check') {
                this.renderComparisonChart();
            } else if (tabName === 'action') {
                this.renderResults();
            }
        }, 200);
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
        // 進捗サマリーを更新
        this.updateProgressSummary();
        
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
        console.log('=== renderArticleList called ===');
        console.log('filter:', filter);
        console.log('progressData:', this.progressData);
        console.log('articles:', this.progressData?.articles);
        
        if (!this.progressData || !this.progressData.articles) {
            console.warn('進捗データが読み込まれていません。データを再読み込みします...');
            // データを再読み込み
            this.loadData().then(() => {
                if (this.progressData && this.progressData.articles) {
                    console.log('データ再読み込み成功。記事一覧を表示します');
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
            console.error('articleList要素が見つかりません！');
            console.error('現在のDOM:', document.querySelector('#doTab'));
            return;
        }
        
        console.log('articleList要素が見つかりました:', articleList);
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
                <select class="article-status-select ${statusClass}" data-article-id="${article.id}" style="
                    padding: 0.4rem 0.8rem;
                    border-radius: 0.5rem;
                    border: 1px solid var(--border-color);
                    background: white;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: var(--transition);
                    min-width: 100px;
                ">
                    <option value="未着手" ${article.status === '未着手' ? 'selected' : ''}>未着手</option>
                    <option value="進行中" ${article.status === '進行中' ? 'selected' : ''}>進行中</option>
                    <option value="完了" ${article.status === '完了' ? 'selected' : ''}>完了</option>
                </select>
            </div>
            <div style="display: flex; justify-content: center; align-items: center; gap: 4px;">
                <span class="material-icons-round" style="font-size: 16px; color: var(--primary-color);">auto_awesome</span>
                <input type="number" class="article-citation-input" data-article-id="${article.id}" 
                    value="${article.citationCount || 0}" 
                    min="0" 
                    style="
                        width: 60px;
                        padding: 0.3rem 0.5rem;
                        border: 1px solid var(--border-color);
                        border-radius: 0.4rem;
                        font-size: 0.85rem;
                        text-align: center;
                        background: white;
                    "
                    title="AIO引用数をクリックして編集">
            </div>
            <div style="display: flex; justify-content: center; align-items: center; gap: 4px;">
                <input type="number" class="article-score-input" data-article-id="${article.id}" 
                    value="${score.total || 0}" 
                    min="0" 
                    max="100"
                    style="
                        width: 50px;
                        padding: 0.3rem 0.5rem;
                        border: 1px solid var(--border-color);
                        border-radius: 0.4rem;
                        font-size: 0.85rem;
                        text-align: center;
                        background: white;
                    "
                    title="スコアをクリックして編集">
                <select class="article-score-level-select" data-article-id="${article.id}" 
                    style="
                        padding: 0.3rem 0.5rem;
                        border-radius: 0.4rem;
                        border: 1px solid var(--border-color);
                        background: white;
                        font-size: 0.85rem;
                        font-weight: 600;
                        cursor: pointer;
                        min-width: 50px;
                    "
                    title="ランクを選択">
                    <option value="S" ${score.level === 'S' ? 'selected' : ''}>S</option>
                    <option value="A" ${score.level === 'A' ? 'selected' : ''}>A</option>
                    <option value="B" ${score.level === 'B' ? 'selected' : ''}>B</option>
                    <option value="C" ${score.level === 'C' ? 'selected' : ''}>C</option>
                    <option value="D" ${score.level === 'D' ? 'selected' : ''}>D</option>
                </select>
            </div>
        `;

        item.style.cursor = 'pointer';
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('記事がクリックされました:', article.title);
            console.log('rewriteSystem:', typeof rewriteSystem);
            
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:398',message:'Article clicked: Checking rewriteSystem',data:{hasRewriteSystem:typeof window.rewriteSystem !== 'undefined',rewriteSystemExists:!!window.rewriteSystem,hasOpenUrlModal:window.rewriteSystem && typeof window.rewriteSystem.openUrlModal},timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            // rewriteSystemが初期化されるまで待つ
            if (typeof window.rewriteSystem === 'undefined' || !window.rewriteSystem) {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:401',message:'Article clicked: rewriteSystem not found, waiting',data:{timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                console.warn('rewriteSystemが初期化されていません。少し待ってから再試行してください。');
                // 少し待ってから再試行
                setTimeout(async () => {
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:406',message:'Article clicked: Retry after timeout',data:{hasRewriteSystem:typeof window.rewriteSystem !== 'undefined',rewriteSystemExists:!!window.rewriteSystem,hasOpenUrlModal:window.rewriteSystem && typeof window.rewriteSystem.openUrlModal},timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    if (typeof window.rewriteSystem !== 'undefined' && window.rewriteSystem && window.rewriteSystem.openUrlModal) {
                        console.log('再試行: rewriteSystemが見つかりました');
                        await window.rewriteSystem.openUrlModal(article);
                    } else {
                        // #region agent log
                        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:410',message:'Article clicked: rewriteSystem still not found',data:{hasRewriteSystem:typeof window.rewriteSystem !== 'undefined',rewriteSystemExists:!!window.rewriteSystem,hasOpenUrlModal:window.rewriteSystem && typeof window.rewriteSystem.openUrlModal},timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                        // #endregion
                        console.error('rewriteSystemが見つかりません');
                        alert('システムの初期化に失敗しました。ページをリロードしてください。');
                    }
                }, 1000);
                return;
            }
            
            // URL入力モーダルを開く
            try {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:420',message:'Article clicked: Calling openUrlModal',data:{articleId:article.id,articleTitle:article.title},timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                console.log('openUrlModalを呼び出します');
                await window.rewriteSystem.openUrlModal(article);
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:423',message:'Article clicked: openUrlModal completed',data:{timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                console.log('openUrlModalが完了しました');
            } catch (error) {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:426',message:'Article clicked: Error opening article',data:{error:error.message,stack:error.stack},timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
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
        if (typeof window.monitoringSystem !== 'undefined' && window.monitoringSystem) {
            window.monitoringSystem.renderComparisonChart();
        }
    }

    renderResults() {
        // 効果測定結果の表示
        // reporting.jsで実装
        if (typeof window.reportingSystem !== 'undefined' && window.reportingSystem) {
            window.reportingSystem.renderResults();
        }
    }
}

// グローバルインスタンス
let dashboardSystem;

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
    dashboardSystem = new Dashboard();
});
