/**
 * ダッシュボード機能
 * PDCAタブ、現状把握カード、進捗状況の表示
 */

class Dashboard {
    constructor() {
        this.currentTab = 'overview'; // 初期タブをOverviewに変更
        this.progressData = null;
        this.baselineData = null;
        this.evidenceRecords = []; // エビデンス記録の配列
        this.plans = []; // プラン一覧
        this.currentPlanArticles = []; // 現在選択されているプランの記事一覧
        this.initialized = false;
        // init()は外部から明示的に呼び出す
    }

    async init() {
        if (this.initialized) {
            console.log('Dashboardは既に初期化されています');
            return;
        }
        
        this.initialized = true;
        await this.loadData();
        await this.loadEvidenceRecords();
        await this.loadPlans();
        
        this.setupTabs();
        this.setupEventListeners();
        this.setupBaselineManagement();
        this.setupEvidenceManagement();
        this.setupPlanManagement();
        this.setupPlanSelection();
        
        this.updateDashboard();
        this.renderBaseline();
        this.renderEvidenceTable();
        this.renderEvidenceChart();
        this.renderPlans();
        
        // rewriteSystemの初期化を待つ（記事クリック時に必要）
        // rewriteSystemはindex.htmlで先に初期化されるので、ここでは確認のみ
        if (typeof window.rewriteSystem === 'undefined' || !window.rewriteSystem || typeof window.rewriteSystem.openUrlModal !== 'function') {
            console.warn('⚠️ rewriteSystemがまだ初期化されていません。待機します...');
            await this.waitForRewriteSystem();
        }
        
        // データが読み込まれたら、現在のタブのコンテンツを表示
        // Doタブがアクティブな場合、記事一覧を表示
        if (this.currentTab === 'do' && this.progressData && this.progressData.articles) {
            console.log('初期化時: Doタブがアクティブなので記事一覧を表示します');
            setTimeout(() => {
                this.renderArticleList();
            }, 500);
        }
    }

    async waitForRewriteSystem(maxWaitTime = 5000) {
        const startTime = Date.now();
        while (typeof window.rewriteSystem === 'undefined' || !window.rewriteSystem || typeof window.rewriteSystem.openUrlModal !== 'function') {
            if (Date.now() - startTime > maxWaitTime) {
                console.warn('⚠️ rewriteSystemの初期化待機がタイムアウトしました');
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log('✅ rewriteSystemの初期化が完了しました');
        return true;
    }

    async loadData() {
        try {
            console.log('データ読み込み開始...');
            this.progressData = await dataManager.loadProgress();
            
            // ベースライン読み込み（デフォルト値付き）
            try {
                this.baselineData = await dataManager.loadBaseline();
            } catch (e) {
                console.warn('ベースライン読み込み失敗、デフォルト値を使用します', e);
            }

            if (!this.baselineData) {
                // デフォルト値を設定
                this.baselineData = {
                    period: '2025年12月',
                    recordedDate: new Date().toISOString().split('T')[0],
                    metrics: {
                        aioCitations: 857,
                        avgRanking: 4.88,
                        traffic: 102000,
                        brandClicks: 22
                    },
                    tier1Articles: [] // Tier 1記事の詳細データ
                };
            }
            
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

    async loadEvidenceRecords() {
        try {
            const stored = localStorage.getItem('aio_pdca_evidence_records');
            if (stored) {
                this.evidenceRecords = JSON.parse(stored);
            } else {
                // 初期データとしてベースラインを追加
                if (this.baselineData) {
                    this.evidenceRecords = [{
                        ...this.baselineData,
                        id: 'baseline-2025-12'
                    }];
                }
            }
        } catch (error) {
            console.error('エビデンス記録読み込みエラー:', error);
            this.evidenceRecords = [];
        }
    }

    async loadPlans() {
        try {
            if (this.progressData && this.progressData.plans) {
                this.plans = this.progressData.plans;
            } else {
                this.plans = [];
            }
        } catch (error) {
            console.error('プラン読み込みエラー:', error);
            this.plans = [];
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

    setupBaselineManagement() {
        const editBaselineBtn = document.getElementById('editBaselineBtn');
        const baselineModal = document.getElementById('baselineModal');
        const closeBaselineModal = document.getElementById('closeBaselineModal');
        const baselineForm = document.getElementById('baselineForm');
        
        if (editBaselineBtn && baselineModal) {
            editBaselineBtn.addEventListener('click', () => {
                this.openBaselineModal();
            });
        }
        
        if (closeBaselineModal && baselineModal) {
            closeBaselineModal.addEventListener('click', () => {
                baselineModal.classList.remove('active');
            });
        }
        
        if (baselineForm) {
            baselineForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveBaseline();
            });
        }
    }

    openBaselineModal() {
        const baselineModal = document.getElementById('baselineModal');
        if (!baselineModal) {
            console.error('ベースラインモーダルが見つかりません');
            return;
        }
        
        // フォームに現在の値を設定
        if (this.baselineData) {
            const aioEl = document.getElementById('baselineAioCitations');
            const rankEl = document.getElementById('baselineAvgRanking');
            const trafficEl = document.getElementById('baselineTraffic');
            const brandEl = document.getElementById('baselineBrandClicks');
            
            if (aioEl) aioEl.value = this.baselineData.metrics?.aioCitations || '';
            if (rankEl) rankEl.value = this.baselineData.metrics?.avgRanking || '';
            if (trafficEl) trafficEl.value = this.baselineData.metrics?.traffic || '';
            if (brandEl) brandEl.value = this.baselineData.metrics?.brandClicks || '';
            
            // Tier 1記事データを設定
            this.renderTier1ArticlesInput();
        }
        
        baselineModal.classList.add('active');
    }

    setupEvidenceManagement() {
        const addEvidenceBtn = document.getElementById('addEvidenceBtn');
        const evidenceModal = document.getElementById('evidenceModal');
        const exportEvidenceCsvBtn = document.getElementById('exportEvidenceCsvBtn');
        
        if (addEvidenceBtn && evidenceModal) {
            addEvidenceBtn.addEventListener('click', () => {
                this.openEvidenceModal();
            });
        }
        
        if (exportEvidenceCsvBtn) {
            exportEvidenceCsvBtn.addEventListener('click', () => {
                this.exportEvidenceCsv();
            });
        }
    }

    setupPlanManagement() {
        const createPlanBtn = document.getElementById('createPlanBtn');
        const planModal = document.getElementById('planModal');
        const closePlanModal = document.getElementById('closePlanModal');
        const planForm = document.getElementById('planForm');
        const cancelPlanBtn = document.getElementById('cancelPlanBtn');
        const importCsvBtn = document.getElementById('importCsvBtn');
        const importMdMetricsBtn = document.getElementById('importMdMetricsBtn');
        const exportCsvTemplateBtn = document.getElementById('exportCsvTemplateBtn');
        const csvFileInput = document.getElementById('csvFileInput');
        const mdMetricsFileInput = document.getElementById('mdMetricsFileInput');
        const importUrlsCsvBtn = document.getElementById('importUrlsCsvBtn');
        const importUrlsMdBtn = document.getElementById('importUrlsMdBtn');
        const urlsCsvFileInput = document.getElementById('urlsCsvFileInput');
        const urlsMdFileInput = document.getElementById('urlsMdFileInput');

        if (createPlanBtn) {
            createPlanBtn.addEventListener('click', () => {
                this.openPlanModal();
            });
        }

        if (closePlanModal && planModal) {
            closePlanModal.addEventListener('click', () => {
                planModal.classList.remove('active');
            });
        }
        
        if (cancelPlanBtn && planModal) {
            cancelPlanBtn.addEventListener('click', () => {
                planModal.classList.remove('active');
            });
        }

        if (planForm) {
            planForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.savePlan();
            });
        }
        
        // 数値入力のCSVインポート
        if (importCsvBtn && csvFileInput) {
            importCsvBtn.addEventListener('click', () => {
                csvFileInput.click();
            });
            
            csvFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.importCsvFile(e.target.files[0]);
                }
            });
        }
        
        // 数値入力のMDインポート
        if (importMdMetricsBtn && mdMetricsFileInput) {
            importMdMetricsBtn.addEventListener('click', () => {
                mdMetricsFileInput.click();
            });
            
            mdMetricsFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.importMdMetricsFile(e.target.files[0]);
                }
            });
        }
        
        // 記事URL一覧のCSVインポート
        if (importUrlsCsvBtn && urlsCsvFileInput) {
            importUrlsCsvBtn.addEventListener('click', () => {
                urlsCsvFileInput.click();
            });
            
            urlsCsvFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.importUrlsCsvFile(e.target.files[0]);
                }
            });
        }
        
        // 記事URL一覧のMDインポート
        if (importUrlsMdBtn && urlsMdFileInput) {
            importUrlsMdBtn.addEventListener('click', () => {
                urlsMdFileInput.click();
            });
            
            urlsMdFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.importUrlsMdFile(e.target.files[0]);
                }
            });
        }
        
        if (exportCsvTemplateBtn) {
            exportCsvTemplateBtn.addEventListener('click', () => {
                this.exportCsvTemplate();
            });
        }
        
        // 記事ごとの数値入力のCSVインポート
        const importArticleMetricsCsvBtn = document.getElementById('importArticleMetricsCsvBtn');
        const articleMetricsCsvFileInput = document.getElementById('articleMetricsCsvFileInput');
        if (importArticleMetricsCsvBtn && articleMetricsCsvFileInput) {
            importArticleMetricsCsvBtn.addEventListener('click', () => {
                articleMetricsCsvFileInput.click();
            });
            
            articleMetricsCsvFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.importArticleMetricsCsvFile(e.target.files[0]);
                }
            });
        }
        
        // 記事ごとの数値入力のMDインポート
        const importArticleMetricsMdBtn = document.getElementById('importArticleMetricsMdBtn');
        const articleMetricsMdFileInput = document.getElementById('articleMetricsMdFileInput');
        if (importArticleMetricsMdBtn && articleMetricsMdFileInput) {
            importArticleMetricsMdBtn.addEventListener('click', () => {
                articleMetricsMdFileInput.click();
            });
            
            articleMetricsMdFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.importArticleMetricsMdFile(e.target.files[0]);
                }
            });
        }
    }

    // --- プラン管理機能の実装メソッド ---

    openPlanModal(planId = null) {
        const modal = document.getElementById('planModal');
        const title = document.getElementById('planModalTitle');
        const form = document.getElementById('planForm');
        
        if (!modal || !form) {
            console.error('プランモーダルまたはフォームが見つかりません');
            return;
        }
        
        form.reset();
        const urlTextarea = document.getElementById('articleUrlsTextarea');
        if (urlTextarea) {
            urlTextarea.value = '';
        }
        
        // 記事ごとの数値テーブルをリセット
        this.renderArticleMetricsTable([]);
        
        if (planId) {
            if (title) title.textContent = 'プランを編集';
            const plan = this.plans.find(p => p.id === planId);
            if (plan) {
                this.fillPlanForm(plan);
                form.dataset.planId = planId;
            }
        } else {
            if (title) title.textContent = '新規プラン作成';
            delete form.dataset.planId;
        }
        
        modal.classList.add('active');
    }

    addUrlInput(url = '') {
        const container = document.getElementById('articleUrlsContainer');
        if (!container) return;
        
        const div = document.createElement('div');
        div.className = 'url-input-group';
        div.style.display = 'flex';
        div.style.gap = '0.5rem';
        div.style.marginBottom = '0.5rem';
        
        div.innerHTML = `
            <input type="url" class="article-url-input" value="${url}" required
                style="flex: 1; padding: 0.6rem; border: 1px solid var(--border-color); border-radius: 0.4rem;"
                placeholder="https://example.com/article">
            <button type="button" class="remove-url-btn" style="color: #ef4444; background: none; border: none; cursor: pointer; padding: 0.5rem;">
                <span class="material-icons-round">delete</span>
            </button>
        `;
        
        div.querySelector('.remove-url-btn').addEventListener('click', () => {
            container.removeChild(div);
        });
        
        container.appendChild(div);
    }

    fillPlanForm(plan) {
        document.getElementById('planName').value = plan.name || '';
        document.getElementById('planObjective').value = plan.objective || '';
        document.getElementById('planOverview').value = plan.overview || '';
        document.getElementById('planNextSteps').value = plan.nextSteps || '';
        document.getElementById('planAioCitations').value = plan.metrics?.aioCitations || '';
        document.getElementById('planAvgRanking').value = plan.metrics?.avgRanking || '';
        document.getElementById('planTraffic').value = plan.metrics?.traffic || '';
        document.getElementById('planBrandClicks').value = plan.metrics?.brandClicks || '';
        
        const urlTextarea = document.getElementById('articleUrlsTextarea');
        if (urlTextarea && plan.articleUrls && plan.articleUrls.length > 0) {
            urlTextarea.value = plan.articleUrls.join('\n');
        } else if (urlTextarea) {
            urlTextarea.value = '';
        }
        
        // 記事ごとの数値データを表示
        if (plan.articleMetrics && plan.articleMetrics.length > 0) {
            this.renderArticleMetricsTable(plan.articleMetrics);
        } else {
            this.renderArticleMetricsTable([]);
        }
    }

    async savePlan() {
        const form = document.getElementById('planForm');
        if (!form) return;
        
        const planId = form.dataset.planId;
        
        // テキストエリアからURLを取得（改行区切り）
        const urlTextarea = document.getElementById('articleUrlsTextarea');
        const articleUrls = urlTextarea && urlTextarea.value
            ? urlTextarea.value
                .split('\n')
                .map(url => url.trim())
                .filter(url => url !== '' && url.length > 0)
            : [];
        
        const planData = {
            id: planId || `plan-${Date.now()}`,
            name: document.getElementById('planName').value,
            objective: document.getElementById('planObjective').value,
            overview: document.getElementById('planOverview').value,
            nextSteps: document.getElementById('planNextSteps').value,
            metrics: {
                aioCitations: parseInt(document.getElementById('planAioCitations').value) || 0,
                avgRanking: parseFloat(document.getElementById('planAvgRanking').value) || 0,
                traffic: parseInt(document.getElementById('planTraffic').value) || 0,
                brandClicks: parseInt(document.getElementById('planBrandClicks').value) || 0
            },
            articleUrls: articleUrls,
            articleMetrics: this.getArticleMetricsFromTable(),
            updatedAt: new Date().toISOString()
        };
        
        if (!planId) {
            planData.createdAt = new Date().toISOString();
            this.plans.push(planData);
        } else {
            const index = this.plans.findIndex(p => p.id === planId);
            if (index !== -1) {
                this.plans[index] = { ...this.plans[index], ...planData };
            }
        }
        
        await this.savePlans();
        
        const modal = document.getElementById('planModal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.renderPlans();
        this.updatePlanSelectOptions();
    }

    async savePlans() {
        if (!this.progressData) {
            this.progressData = { articles: [], plans: [] };
        }
        this.progressData.plans = this.plans;
        await dataManager.saveProgress(this.progressData);
    }

    renderPlans() {
        const container = document.getElementById('plansList');
        if (!container) return;
        
        if (this.plans.length === 0) {
            container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 2rem;">プランがまだありません。「プランを作成する」ボタンから作成してください。</p>';
            return;
        }
        
        container.innerHTML = this.plans.map(plan => `
            <div class="plan-card" style="background: white; border: 1px solid var(--border-color); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-sm);">
                <div class="plan-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                    <div>
                        <h4 style="margin: 0; font-size: 1.25rem; color: var(--text-primary); font-weight: 700;">${plan.name}</h4>
                        <div style="font-size: 0.85rem; color: #6b7280; margin-top: 0.25rem;">更新日: ${new Date(plan.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="edit-plan-btn" data-id="${plan.id}" style="padding: 0.4rem; color: #3b82f6; background: #eff6ff; border: none; border-radius: 0.4rem; cursor: pointer;">
                            <span class="material-icons-round" style="font-size: 18px;">edit</span>
                        </button>
                        <button class="delete-plan-btn" data-id="${plan.id}" style="padding: 0.4rem; color: #ef4444; background: #fef2f2; border: none; border-radius: 0.4rem; cursor: pointer;">
                            <span class="material-icons-round" style="font-size: 18px;">delete</span>
                        </button>
                    </div>
                </div>
                
                <div class="plan-card-body">
                    <div style="margin-bottom: 1rem;">
                        <strong style="display: block; font-size: 0.85rem; color: #374151; margin-bottom: 0.25rem;">目的</strong>
                        <p style="margin: 0; font-size: 0.95rem; color: #4b5563; white-space: pre-wrap;">${plan.objective}</p>
                    </div>
                    
                    ${plan.overview ? `
                    <div style="margin-bottom: 1rem;">
                        <strong style="display: block; font-size: 0.85rem; color: #374151; margin-bottom: 0.25rem;">概要</strong>
                        <p style="margin: 0; font-size: 0.95rem; color: #4b5563; white-space: pre-wrap;">${plan.overview}</p>
                    </div>
                    ` : ''}
                    
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin: 1rem 0; padding: 1rem; background: #f9fafb; border-radius: 0.5rem;">
                        <div>
                            <div style="font-size: 0.75rem; color: #6b7280;">AIO引用数</div>
                            <div style="font-weight: 700; color: #2563eb;">${(plan.metrics?.aioCitations || 0).toLocaleString()}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.75rem; color: #6b7280;">平均順位</div>
                            <div style="font-weight: 700; color: #059669;">${(plan.metrics?.avgRanking || 0).toFixed(2)}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.75rem; color: #6b7280;">トラフィック</div>
                            <div style="font-weight: 700; color: #d97706;">${(plan.metrics?.traffic || 0).toLocaleString()}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.75rem; color: #6b7280;">ブランド認知度</div>
                            <div style="font-weight: 700; color: #9333ea;">${(plan.metrics?.brandClicks || 0).toLocaleString()}</div>
                        </div>
                    </div>
                    
                    ${plan.articleUrls && plan.articleUrls.length > 0 ? `
                    <div style="margin-top: 1rem;">
                        <strong style="display: block; font-size: 0.85rem; color: #374151; margin-bottom: 0.25rem;">対象記事 (${plan.articleUrls.length})</strong>
                        <div style="max-height: 100px; overflow-y: auto; font-size: 0.85rem; color: #6b7280; background: #fff; border: 1px solid #e5e7eb; border-radius: 0.4rem; padding: 0.5rem;">
                            ${plan.articleUrls.map(url => `<div style="margin-bottom: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${url}</div>`).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
        
        // イベントリスナー
        container.querySelectorAll('.edit-plan-btn').forEach(btn => {
            btn.addEventListener('click', () => this.openPlanModal(btn.dataset.id));
        });
        
        container.querySelectorAll('.delete-plan-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('本当にこのプランを削除しますか？')) {
                    await this.deletePlan(btn.dataset.id);
                }
            });
        });
    }

    async deletePlan(planId) {
        this.plans = this.plans.filter(p => p.id !== planId);
        await this.savePlans();
        this.renderPlans();
        this.updatePlanSelectOptions();
        
        // 現在選択されているプランが削除された場合、選択をリセット
        const planSelect = document.getElementById('selectedPlanId');
        if (planSelect && planSelect.value === planId) {
            planSelect.value = '';
            this.renderArticleList('all');
        }
    }
    
    // --- プラン選択機能の実装メソッド ---
    
    setupPlanSelection() {
        const planSelect = document.getElementById('selectedPlanId');
        if (planSelect) {
            // プラン一覧をドロップダウンに追加
            this.updatePlanSelectOptions();
            
            // プラン選択時のイベント
            planSelect.addEventListener('change', (e) => {
                const planId = e.target.value;
                if (planId) {
                    this.loadPlanArticles(planId);
                } else {
                    // プランが選択されていない場合は、デフォルトの記事一覧を表示
                    // プラン選択を解除
                    this.selectedPlanId = null;
                    this.currentPlanArticles = [];
                    this.renderArticleList('all');
                    // 進捗状況もデフォルトに戻す
                    this.updateProgress();
                }
            });
        }
    }
    
    updatePlanSelectOptions() {
        const planSelect = document.getElementById('selectedPlanId');
        if (!planSelect) return;
        
        // 既存のオプションをクリア（最初の「プランを選択してください」以外）
        while (planSelect.children.length > 1) {
            planSelect.removeChild(planSelect.lastChild);
        }
        
        // プランを追加
        this.plans.forEach(plan => {
            const option = document.createElement('option');
            option.value = plan.id;
            option.textContent = plan.name;
            planSelect.appendChild(option);
        });
    }
    
    loadPlanArticles(planId) {
        const plan = this.plans.find(p => p.id === planId);
        if (!plan || !plan.articleUrls || plan.articleUrls.length === 0) {
            alert('このプランには記事URLが設定されていません。');
            return;
        }
        
        // 選択されたプランIDを保存
        this.selectedPlanId = planId;
        
        // ドロップダウンの値も確実に設定
        const planSelect = document.getElementById('selectedPlanId');
        if (planSelect) {
            planSelect.value = planId;
        }
        
        // プランの記事URLから記事データを作成
        const planArticles = plan.articleUrls.map((url, index) => {
            // 既存の記事データから該当するものを探す
            const existingArticle = this.progressData?.articles?.find(a => a.url === url);
            
            // プランの記事メトリクスから該当する記事のメトリクスを取得
            const articleMetric = plan.articleMetrics?.find(m => m.name === url || m.name === existingArticle?.title);
            
            if (existingArticle) {
                // 既存記事にメトリクス情報を追加（最新のステータスを含む）
                return {
                    ...existingArticle, // 最新のステータスを含む
                    planId: planId,
                    clicks: articleMetric?.clicks || existingArticle.clicks || 0,
                    impressions: articleMetric?.impressions || existingArticle.impressions || 0,
                    ctr: articleMetric?.ctr || existingArticle.ctr || 0,
                    position: articleMetric?.position || existingArticle.position || 0,
                    aioRank: existingArticle.aioRank || (existingArticle.scores?.after?.level || existingArticle.scores?.before?.level || 'C')
                };
            } else {
                // 新規記事データを作成
                return {
                    id: `plan-${planId}-article-${index}`,
                    title: this.extractTitleFromUrl(url) || `記事 ${index + 1}`,
                    url: url,
                    keyword: '',
                    status: '未着手',
                    citationCount: 0,
                    clicks: articleMetric?.clicks || 0,
                    impressions: articleMetric?.impressions || 0,
                    ctr: articleMetric?.ctr || 0,
                    position: articleMetric?.position || 0,
                    aioRank: 'C',
                    scores: {
                        before: { total: 0, level: 'C' },
                        after: { total: 0, level: 'C' }
                    },
                    createdAt: new Date().toISOString(),
                    planId: planId // どのプランから来たかを記録
                };
            }
        });
        
        // プランの記事を一時的に保存して表示
        this.currentPlanArticles = planArticles;
        this.renderPlanArticleList(planArticles);
        
        // 進捗状況を更新（選択したプランの記事に基づいて）
        this.updateProgressFromArticles(planArticles);
    }
    
    updateProgressFromArticles(articles) {
        if (!articles || articles.length === 0) {
            // デフォルト値を設定
            const completedEl = document.getElementById('progressCompleted');
            const inProgressEl = document.getElementById('progressInProgress');
            const notStartedEl = document.getElementById('progressNotStarted');
            
            if (completedEl) completedEl.textContent = '0';
            if (inProgressEl) inProgressEl.textContent = '0';
            if (notStartedEl) notStartedEl.textContent = '0';
            return;
        }
        
        const completed = articles.filter(a => a.status === '完了').length;
        const inProgress = articles.filter(a => a.status === '進行中').length;
        const notStarted = articles.filter(a => a.status === '未着手').length;
        
        const completedEl = document.getElementById('progressCompleted');
        const inProgressEl = document.getElementById('progressInProgress');
        const notStartedEl = document.getElementById('progressNotStarted');
        
        if (completedEl) completedEl.textContent = completed;
        if (inProgressEl) inProgressEl.textContent = inProgress;
        if (notStartedEl) notStartedEl.textContent = notStarted;
    }
    
    extractTitleFromUrl(url) {
        try {
            const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            return pathParts[pathParts.length - 1] || '';
        } catch {
            return '';
        }
    }
    
    renderPlanArticleList(articles) {
        const articleList = document.getElementById('articleList');
        if (!articleList) return;
        
        // ヘッダーを更新（既存のヘッダーをすべて削除して新しく作成）
        const existingHeaders = document.querySelectorAll('.article-list-header');
        existingHeaders.forEach(header => header.remove());
        
        const header = document.createElement('div');
        header.className = 'article-list-header plan-mode';
        header.innerHTML = `
            <div>記事情報</div>
            <div style="text-align: center;">ステータス</div>
            <div style="text-align: center;">クリック数</div>
            <div style="text-align: center;">表示回数</div>
            <div style="text-align: center;">CTR (%)</div>
            <div style="text-align: center;">順位</div>
            <div style="text-align: center;">AIOランク</div>
        `;
        articleList.parentNode.insertBefore(header, articleList);
        
        articleList.innerHTML = '';
        
        articles.forEach(article => {
            const item = this.createPlanArticleItem(article);
            articleList.appendChild(item);
        });
        
        // フィルターボタンの動作も更新
        this.updateFilterButtons();
        
        // 進捗状況を更新
        this.updateProgressFromArticles(articles);
    }
    
    // --- 記事ごとの数値入力テーブルの実装メソッド ---
    
    renderArticleMetricsTable(metrics = []) {
        const tbody = document.getElementById('articleMetricsBody');
        if (!tbody) return;
        
        if (metrics.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding: 2rem; text-align: center; color: #6b7280;">記事を追加してください</td></tr>';
            this.setupArticleMetricsListeners();
            return;
        }
        
        tbody.innerHTML = metrics.map((metric, index) => `
            <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 0.75rem;">
                    <input type="text" class="article-name-input" data-index="${index}" value="${metric.name || ''}" 
                        placeholder="記事名またはURL" 
                        style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.4rem;">
                </td>
                <td style="padding: 0.75rem;">
                    <input type="number" class="article-clicks-input" data-index="${index}" value="${metric.clicks || ''}" 
                        style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.4rem; text-align: right;">
                </td>
                <td style="padding: 0.75rem;">
                    <input type="number" class="article-impressions-input" data-index="${index}" value="${metric.impressions || ''}" 
                        style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.4rem; text-align: right;">
                </td>
                <td style="padding: 0.75rem;">
                    <input type="number" step="0.01" class="article-ctr-input" data-index="${index}" value="${metric.ctr || ''}" 
                        style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.4rem; text-align: right;">
                </td>
                <td style="padding: 0.75rem;">
                    <input type="number" step="0.1" class="article-position-input" data-index="${index}" value="${metric.position || ''}" 
                        style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.4rem; text-align: right;">
                </td>
                <td style="padding: 0.75rem; text-align: center;">
                    <button type="button" class="remove-article-metric-btn" data-index="${index}" 
                        style="color: #ef4444; background: none; border: none; cursor: pointer; padding: 0.25rem;">
                        <span class="material-icons-round" style="font-size: 20px;">delete</span>
                    </button>
                </td>
            </tr>
        `).join('');
        
        // イベントリスナーを設定
        this.setupArticleMetricsListeners();
        
        // 数値を反映
        this.updateMetricsFromArticleTable();
    }
    
    setupArticleMetricsListeners() {
        const addBtn = document.getElementById('addArticleRowBtn');
        if (addBtn) {
            // 既存のイベントリスナーを削除
            const newAddBtn = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(newAddBtn, addBtn);
            
            newAddBtn.addEventListener('click', () => {
                const currentMetrics = this.getArticleMetricsFromTable();
                currentMetrics.push({
                    name: '',
                    clicks: 0,
                    impressions: 0,
                    ctr: 0,
                    position: 0
                });
                this.renderArticleMetricsTable(currentMetrics);
            });
        }
        
        // 削除ボタン
        document.querySelectorAll('.remove-article-metric-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                const currentMetrics = this.getArticleMetricsFromTable();
                currentMetrics.splice(index, 1);
                this.renderArticleMetricsTable(currentMetrics);
                this.updateMetricsFromArticleTable(); // 数値を反映
            });
        });
        
        // 数値入力時に全体の数値に反映
        setTimeout(() => {
            document.querySelectorAll('#articleMetricsBody input').forEach(input => {
                input.addEventListener('input', () => {
                    this.updateMetricsFromArticleTable();
                });
            });
        }, 100);
    }
    
    updateMetricsFromArticleTable() {
        const metrics = this.getArticleMetricsFromTable();
        if (metrics.length === 0) return;
        
        // 合計値を計算
        const totalClicks = metrics.reduce((sum, m) => sum + (m.clicks || 0), 0);
        const totalImpressions = metrics.reduce((sum, m) => sum + (m.impressions || 0), 0);
        const avgPosition = metrics.length > 0 
            ? metrics.reduce((sum, m) => sum + (m.position || 0), 0) / metrics.length 
            : 0;
        
        // 全体の数値入力欄に反映
        const trafficInput = document.getElementById('planTraffic');
        if (trafficInput) {
            trafficInput.value = totalClicks;
        }
        
        const avgRankingInput = document.getElementById('planAvgRanking');
        if (avgRankingInput) {
            avgRankingInput.value = avgPosition.toFixed(2);
        }
        
        // AIO引用数は記事ごとの数値からは計算できないので、手動入力のまま
        // ブランド認知度も同様
    }
    
    importArticleMetricsCsvFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const csvText = e.target.result;
            const metrics = this.parseArticleMetricsCsv(csvText);
            if (metrics && metrics.length > 0) {
                this.renderArticleMetricsTable(metrics);
                this.updateMetricsFromArticleTable();
                alert(`${metrics.length}件の記事データをインポートしました`);
            } else {
                alert('CSVファイルから記事データを読み込めませんでした');
            }
        };
        reader.readAsText(file);
    }
    
    parseArticleMetricsCsv(csvText) {
        const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length < 2) return null;
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const metrics = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            if (values.length === 0 || !values[0]) continue;
            
            const metric = {};
            headers.forEach((header, index) => {
                const value = values[index] || '';
                if (header.includes('記事') || header.includes('URL') || header.includes('名前')) {
                    metric.name = value;
                } else if (header.includes('クリック')) {
                    metric.clicks = parseInt(value) || 0;
                } else if (header.includes('表示') || header.includes('インプレッション')) {
                    metric.impressions = parseInt(value) || 0;
                } else if (header.includes('CTR')) {
                    metric.ctr = parseFloat(value) || 0;
                } else if (header.includes('順位') || header.includes('ポジション')) {
                    metric.position = parseFloat(value) || 0;
                }
            });
            
            if (metric.name) {
                metrics.push(metric);
            }
        }
        
        return metrics.length > 0 ? metrics : null;
    }
    
    importArticleMetricsMdFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const mdText = e.target.result;
            const metrics = this.parseArticleMetricsMd(mdText);
            if (metrics && metrics.length > 0) {
                this.renderArticleMetricsTable(metrics);
                this.updateMetricsFromArticleTable();
                alert(`${metrics.length}件の記事データをインポートしました`);
            } else {
                alert('MDファイルから記事データを読み込めませんでした');
            }
        };
        reader.readAsText(file);
    }
    
    parseArticleMetricsMd(mdText) {
        const metrics = [];
        const lines = mdText.split('\n').map(line => line.trim()).filter(line => line);
        
        let currentMetric = null;
        
        lines.forEach(line => {
            // テーブル形式のMarkdownをパース
            if (line.startsWith('|') && !line.includes('---')) {
                const cells = line.split('|').map(c => c.trim()).filter(c => c);
                if (cells.length >= 5 && !cells[0].toLowerCase().includes('記事')) {
                    // ヘッダー行をスキップ
                    const name = cells[0];
                    const clicks = parseInt(cells[1]) || 0;
                    const impressions = parseInt(cells[2]) || 0;
                    const ctr = parseFloat(cells[3]) || 0;
                    const position = parseFloat(cells[4]) || 0;
                    
                    if (name) {
                        metrics.push({ name, clicks, impressions, ctr, position });
                    }
                }
            }
            // リスト形式のMarkdownをパース
            else if (line.match(/^[-*]\s*(.+)/)) {
                const match = line.match(/^[-*]\s*(.+)/);
                if (match) {
                    const parts = match[1].split(/[:：]/);
                    if (parts.length >= 2) {
                        const name = parts[0].trim();
                        const rest = parts.slice(1).join(':');
                        const numbers = rest.match(/\d+(?:\.\d+)?/g) || [];
                        
                        if (name && numbers.length >= 4) {
                            metrics.push({
                                name,
                                clicks: parseInt(numbers[0]) || 0,
                                impressions: parseInt(numbers[1]) || 0,
                                ctr: parseFloat(numbers[2]) || 0,
                                position: parseFloat(numbers[3]) || 0
                            });
                        }
                    }
                }
            }
        });
        
        return metrics.length > 0 ? metrics : null;
    }
    
    getArticleMetricsFromTable() {
        const metrics = [];
        const rows = document.querySelectorAll('#articleMetricsBody tr');
        
        rows.forEach(row => {
            const nameInput = row.querySelector('.article-name-input');
            const clicksInput = row.querySelector('.article-clicks-input');
            const impressionsInput = row.querySelector('.article-impressions-input');
            const ctrInput = row.querySelector('.article-ctr-input');
            const positionInput = row.querySelector('.article-position-input');
            
            if (nameInput && nameInput.value.trim()) {
                metrics.push({
                    name: nameInput.value.trim(),
                    clicks: parseInt(clicksInput?.value) || 0,
                    impressions: parseInt(impressionsInput?.value) || 0,
                    ctr: parseFloat(ctrInput?.value) || 0,
                    position: parseFloat(positionInput?.value) || 0
                });
            }
        });
        
        return metrics;
    }
    
    importCsvFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const csvText = e.target.result;
            const data = this.parseCsv(csvText);
            if (data) {
                this.fillMetricsFromCsv(data);
                alert('CSVからデータをインポートしました');
            } else {
                alert('CSVデータの形式が正しくありません');
            }
        };
        reader.readAsText(file);
    }
    
    parseCsv(csvText) {
        // 簡易的なCSVパーサー
        const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length < 2) return null;
        
        // ヘッダー行を解析
        const headers = lines[0].split(',').map(h => h.trim());
        const values = lines[1].split(',').map(v => v.trim());
        
        const data = {};
        
        // ヘッダーのマッピング
        const headerMap = {
            'AIO引用数': 'aioCitations',
            '引用数': 'aioCitations',
            '検索順位': 'avgRanking',
            '平均順位': 'avgRanking',
            'トラフィック': 'traffic',
            'クリック数': 'traffic',
            'ブランド認知度': 'brandClicks',
            '指名検索': 'brandClicks'
        };
        
        headers.forEach((header, i) => {
            // "を削除
            const cleanHeader = header.replace(/^"|"$/g, '');
            const key = Object.keys(headerMap).find(k => cleanHeader.includes(k));
            if (key && values[i]) {
                const cleanValue = values[i].replace(/^"|"$/g, '');
                data[headerMap[key]] = parseFloat(cleanValue) || 0;
            }
        });
        
        return data;
    }
    
    fillMetricsFromCsv(data) {
        if (data.aioCitations) document.getElementById('planAioCitations').value = data.aioCitations;
        if (data.avgRanking) document.getElementById('planAvgRanking').value = data.avgRanking;
        if (data.traffic) document.getElementById('planTraffic').value = data.traffic;
        if (data.brandClicks) document.getElementById('planBrandClicks').value = data.brandClicks;
    }
    
    importMdMetricsFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const mdText = e.target.result;
            const data = this.parseMdMetrics(mdText);
            if (data) {
                this.fillMetricsFromCsv(data);
                alert('MDファイルからデータをインポートしました');
            } else {
                alert('MDファイルの形式が正しくありません');
            }
        };
        reader.readAsText(file);
    }
    
    parseMdMetrics(mdText) {
        const data = {};
        const lines = mdText.split('\n').map(line => line.trim()).filter(line => line);
        
        // キーと値のマッピング
        const keyMap = {
            'AIO引用数': 'aioCitations',
            '引用数': 'aioCitations',
            'AIO': 'aioCitations',
            '検索順位': 'avgRanking',
            '平均順位': 'avgRanking',
            '順位': 'avgRanking',
            'トラフィック': 'traffic',
            'クリック数': 'traffic',
            'ブランド認知度': 'brandClicks',
            '指名検索': 'brandClicks',
            'ブランド': 'brandClicks'
        };
        
        lines.forEach(line => {
            // コロン区切りや等号区切りをサポート
            const match = line.match(/^[-*]?\s*(.+?)[:：=]\s*(\d+(?:\.\d+)?)/);
            if (match) {
                const key = match[1].trim();
                const value = parseFloat(match[2]);
                
                // キーマップから該当するフィールドを探す
                const mappedKey = Object.keys(keyMap).find(k => key.includes(k));
                if (mappedKey && !isNaN(value)) {
                    data[keyMap[mappedKey]] = value;
                }
            }
        });
        
        return Object.keys(data).length > 0 ? data : null;
    }
    
    importUrlsCsvFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const csvText = e.target.result;
            const urls = this.parseUrlsCsv(csvText);
            if (urls && urls.length > 0) {
                const textarea = document.getElementById('articleUrlsTextarea');
                if (textarea) {
                    textarea.value = urls.join('\n');
                    alert(`${urls.length}件のURLをインポートしました`);
                }
            } else {
                alert('CSVファイルからURLを読み込めませんでした');
            }
        };
        reader.readAsText(file);
    }
    
    parseUrlsCsv(csvText) {
        const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
        const urls = [];
        
        lines.forEach((line, index) => {
            // ヘッダー行をスキップ
            if (index === 0 && (line.toLowerCase().includes('url') || line.toLowerCase().includes('link'))) {
                return;
            }
            
            // CSVの各行からURLを抽出
            const columns = line.split(',').map(col => col.trim().replace(/^"|"$/g, ''));
            columns.forEach(col => {
                // URL形式かチェック
                if (col.match(/^https?:\/\//)) {
                    urls.push(col);
                }
            });
        });
        
        return urls;
    }
    
    importUrlsMdFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const mdText = e.target.result;
            const urls = this.parseUrlsMd(mdText);
            if (urls && urls.length > 0) {
                const textarea = document.getElementById('articleUrlsTextarea');
                if (textarea) {
                    textarea.value = urls.join('\n');
                    alert(`${urls.length}件のURLをインポートしました`);
                }
            } else {
                alert('MDファイルからURLを読み込めませんでした');
            }
        };
        reader.readAsText(file);
    }
    
    parseUrlsMd(mdText) {
        const urls = [];
        const lines = mdText.split('\n').map(line => line.trim()).filter(line => line);
        
        lines.forEach(line => {
            // Markdownリンク形式 [text](url) からURLを抽出
            const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
            if (linkMatch && linkMatch[2].match(/^https?:\/\//)) {
                urls.push(linkMatch[2]);
            }
            // 直接URLが書かれている場合
            else if (line.match(/^https?:\/\//)) {
                urls.push(line);
            }
            // リスト形式 - URL や * URL
            else if (line.match(/^[-*]\s*(https?:\/\/.+)/)) {
                const urlMatch = line.match(/^[-*]\s*(https?:\/\/.+)/);
                if (urlMatch) {
                    urls.push(urlMatch[1].trim());
                }
            }
        });
        
        return urls;
    }
    
    exportCsvTemplate() {
        const headers = ['AIO引用数', '検索順位', 'トラフィック', 'ブランド認知度'];
        const example = ['857', '4.88', '102000', '22'];
        
        const csvContent = [
            headers.join(','),
            example.join(',')
        ].join('\n');
        
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `metric_template.csv`;
        link.click();
        URL.revokeObjectURL(url);
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
            
            // プランが選択されている場合は、プランの記事一覧を再描画
            if (this.selectedPlanId) {
                // currentPlanArticlesも更新（progressDataから最新の状態を反映）
                // 記事IDの型を統一してマッチング（文字列と数値の両方に対応）
                const updatedArticle = this.currentPlanArticles.find(a => 
                    String(a.id) === String(articleId) || a.url === article.url
                );
                if (updatedArticle) {
                    updatedArticle.status = newStatus;
                    // progressDataから最新の情報を反映
                    Object.assign(updatedArticle, article);
                } else {
                    // 見つからない場合は、URLでマッチングを試みる
                    const articleByUrl = this.currentPlanArticles.find(a => a.url === article.url);
                    if (articleByUrl) {
                        articleByUrl.status = newStatus;
                        Object.assign(articleByUrl, article);
                    }
                }
                
                // プランを再読み込みせず、currentPlanArticlesを直接更新して再描画
                // これによりドロップダウンの値がリセットされない
                this.renderPlanArticleList(this.currentPlanArticles);
                // 進捗状況を更新（プランの記事に基づいて）
                this.updateProgressFromArticles(this.currentPlanArticles);
            } else {
                // プランが選択されていない場合は通常の記事一覧を表示
                const currentFilter = document.querySelector('.pdca-tab.active')?.dataset.tab || 'all';
                this.renderArticleList(currentFilter);
            }
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
        console.log('=== switchTab called ===', tabName);
        // タブの切り替え
        document.querySelectorAll('.pdca-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
        if (targetTab) {
            targetTab.classList.add('active');
            console.log('タブをアクティブにしました:', tabName);
        } else {
            console.error('タブが見つかりません:', tabName);
            return;
        }

        // コンテンツの切り替え
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        const targetContent = document.getElementById(`${tabName}Tab`);
        if (targetContent) {
            targetContent.classList.add('active');
            console.log('コンテンツをアクティブにしました:', `${tabName}Tab`);
        } else {
            console.error('コンテンツが見つかりません:', `${tabName}Tab`);
            return;
        }

        this.currentTab = tabName;

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
            } else if (tabName === 'plan') {
                // Planタブが選択されたらプラン一覧を表示
                this.renderPlans();
            } else if (tabName === 'check') {
                this.renderComparisonChart();
            } else if (tabName === 'action') {
                this.renderResults();
            }
        }, 200);
    }

    updateDashboard() {
        // Overviewタブの数値を更新
        this.renderBaseline();
        
        // 進捗状況を更新
        this.updateProgress();
    }

    renderBaseline() {
        // ベースライン数値をOverviewカードに表示
        if (this.baselineData && this.baselineData.metrics) {
            const aioEl = document.getElementById('aioCitationCount');
            const rankEl = document.getElementById('searchRankingAvg');
            const trafficEl = document.getElementById('trafficClicks');
            const brandEl = document.getElementById('brandClicks');
            
            console.log('[DEBUG] renderBaseline: Updating Overview cards', {
                aioCitations: this.baselineData.metrics.aioCitations,
                avgRanking: this.baselineData.metrics.avgRanking,
                traffic: this.baselineData.metrics.traffic,
                brandClicks: this.baselineData.metrics.brandClicks
            });
            
            if (aioEl) {
                aioEl.textContent = (this.baselineData.metrics.aioCitations || 0).toLocaleString();
                console.log('[DEBUG] Updated aioCitationCount:', aioEl.textContent);
            }
            if (rankEl) {
                rankEl.textContent = (this.baselineData.metrics.avgRanking || 0).toFixed(2);
                console.log('[DEBUG] Updated searchRankingAvg:', rankEl.textContent);
            }
            if (trafficEl) {
                trafficEl.textContent = (this.baselineData.metrics.traffic || 0).toLocaleString();
                console.log('[DEBUG] Updated trafficClicks:', trafficEl.textContent);
            }
            if (brandEl) {
                brandEl.textContent = (this.baselineData.metrics.brandClicks || 0).toLocaleString();
                console.log('[DEBUG] Updated brandClicks:', brandEl.textContent);
            } else {
                console.warn('[WARN] brandClicks element not found!');
            }
        } else {
            // デフォルト値を表示
            const aioEl = document.getElementById('aioCitationCount');
            const rankEl = document.getElementById('searchRankingAvg');
            const trafficEl = document.getElementById('trafficClicks');
            const brandEl = document.getElementById('brandClicks');
            
            console.log('[DEBUG] renderBaseline: Using default values');
            
            if (aioEl) aioEl.textContent = '857';
            if (rankEl) rankEl.textContent = '4.88';
            if (trafficEl) trafficEl.textContent = '102,000';
            if (brandEl) {
                brandEl.textContent = '22';
                console.log('[DEBUG] Set default brandClicks:', brandEl.textContent);
            } else {
                console.warn('[WARN] brandClicks element not found for default value!');
            }
        }
        
        // Tier 1記事テーブルを表示（Planタブ用 - 現在はPlanタブにないのでコメントアウト）
        // this.renderTier1ArticlesTable();
    }

    renderTier1ArticlesTable() {
        const container = document.getElementById('tier1ArticlesTable');
        if (!container) return;
        
        const articles = this.baselineData?.tier1Articles || [];
        
        if (articles.length === 0) {
            container.innerHTML = '<p style="color: #6b7280; padding: 1rem; text-align: center;">データがありません。ベースラインを編集してデータを追加してください。</p>';
            return;
        }
        
        container.innerHTML = `
            <table style="width: 100%; font-size: 13px; border-collapse: collapse; min-width: 600px;">
                <thead>
                    <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                        <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">記事名</th>
                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #374151;">クリック数</th>
                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #374151;">表示回数</th>
                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #374151;">CTR</th>
                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #374151;">順位</th>
                    </tr>
                </thead>
                <tbody>
                    ${articles.map((article, i) => `
                        <tr style="border-bottom: 1px solid #f3f4f6; ${i % 2 === 0 ? 'background: #fff;' : 'background: #fcfcfc;'}">
                            <td style="padding: 10px; color: #1f2937;">${article.title || '-'}</td>
                            <td style="padding: 10px; text-align: right; font-weight: 600; color: #ea580c;">${(article.clicks || 0).toLocaleString()}</td>
                            <td style="padding: 10px; text-align: right; color: #4b5563;">${(article.impressions || 0).toLocaleString()}</td>
                            <td style="padding: 10px; text-align: right; color: #4b5563;">${(article.ctr || 0).toFixed(2)}%</td>
                            <td style="padding: 10px; text-align: right; font-weight: 600; color: #059669;">${(article.position || 0).toFixed(1)}位</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    renderTier1ArticlesInput() {
        const container = document.getElementById('tier1ArticlesInputContainer');
        if (!container) return;
        
        const articles = this.baselineData?.tier1Articles || [];
        
        container.innerHTML = `
            <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f9fafb;">
                        <th style="padding: 8px; border: 1px solid #e5e7eb;">記事名</th>
                        <th style="padding: 8px; border: 1px solid #e5e7eb;">クリック数</th>
                        <th style="padding: 8px; border: 1px solid #e5e7eb;">表示回数</th>
                        <th style="padding: 8px; border: 1px solid #e5e7eb;">CTR</th>
                        <th style="padding: 8px; border: 1px solid #e5e7eb;">順位</th>
                        <th style="padding: 8px; border: 1px solid #e5e7eb;">操作</th>
                    </tr>
                </thead>
                <tbody id="tier1ArticlesBody">
                    ${articles.map((article, index) => `
                        <tr>
                            <td style="padding: 4px; border: 1px solid #e5e7eb;"><input type="text" value="${article.title || ''}" data-index="${index}" data-field="title" style="width: 100%; border: 1px solid #ccc; padding: 4px;"></td>
                            <td style="padding: 4px; border: 1px solid #e5e7eb;"><input type="number" value="${article.clicks || ''}" data-index="${index}" data-field="clicks" style="width: 100%; border: 1px solid #ccc; padding: 4px;"></td>
                            <td style="padding: 4px; border: 1px solid #e5e7eb;"><input type="number" value="${article.impressions || ''}" data-index="${index}" data-field="impressions" style="width: 100%; border: 1px solid #ccc; padding: 4px;"></td>
                            <td style="padding: 4px; border: 1px solid #e5e7eb;"><input type="number" step="0.01" value="${article.ctr || ''}" data-index="${index}" data-field="ctr" style="width: 100%; border: 1px solid #ccc; padding: 4px;"></td>
                            <td style="padding: 4px; border: 1px solid #e5e7eb;"><input type="number" step="0.1" value="${article.position || ''}" data-index="${index}" data-field="position" style="width: 100%; border: 1px solid #ccc; padding: 4px;"></td>
                            <td style="padding: 4px; border: 1px solid #e5e7eb; text-align: center;">
                                <button type="button" class="remove-article-btn" data-index="${index}" style="color: red; border: none; background: none; cursor: pointer;">
                                    <span class="material-icons-round">delete</span>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <button type="button" id="addTier1ArticleBtn" class="btn btn-secondary" style="margin-top: 1rem;">
                <span class="material-icons-round">add</span>
                記事を追加
            </button>
        `;
        
        // 記事追加ボタン
        const addBtn = document.getElementById('addTier1ArticleBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.addTier1ArticleRow();
            });
        }

        // 削除ボタン
        container.querySelectorAll('.remove-article-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                this.baselineData.tier1Articles.splice(index, 1);
                this.renderTier1ArticlesInput();
            });
        });
    }

    addTier1ArticleRow() {
        if (!this.baselineData.tier1Articles) {
            this.baselineData.tier1Articles = [];
        }
        this.baselineData.tier1Articles.push({
            title: '', clicks: 0, impressions: 0, ctr: 0, position: 0
        });
        this.renderTier1ArticlesInput();
    }

    async saveBaseline() {
        const metrics = {
            aioCitations: parseInt(document.getElementById('baselineAioCitations').value) || 0,
            avgRanking: parseFloat(document.getElementById('baselineAvgRanking').value) || 0,
            traffic: parseInt(document.getElementById('baselineTraffic').value) || 0,
            brandClicks: parseInt(document.getElementById('baselineBrandClicks').value) || 0
        };
        
        // Tier 1記事データを取得（入力値で更新）
        const articleInputs = document.querySelectorAll('#tier1ArticlesInputContainer input[data-index]');
        
        articleInputs.forEach(input => {
            const index = parseInt(input.dataset.index);
            const field = input.dataset.field;
            
            if (this.baselineData.tier1Articles[index]) {
                if (field === 'title') {
                    this.baselineData.tier1Articles[index].title = input.value;
                } else if (field === 'clicks') {
                    this.baselineData.tier1Articles[index].clicks = parseInt(input.value) || 0;
                } else if (field === 'impressions') {
                    this.baselineData.tier1Articles[index].impressions = parseInt(input.value) || 0;
                } else if (field === 'ctr') {
                    this.baselineData.tier1Articles[index].ctr = parseFloat(input.value) || 0;
                } else if (field === 'position') {
                    this.baselineData.tier1Articles[index].position = parseFloat(input.value) || 0;
                }
            }
        });
        
        this.baselineData.metrics = metrics;
        this.baselineData.period = '2025年12月';
        this.baselineData.recordedDate = new Date().toISOString().split('T')[0];
        
        // 保存
        await dataManager.saveBaseline(this.baselineData);
        
        // エビデンス記録の最初のエントリを更新
        const baselineRecord = {
            ...this.baselineData,
            id: 'baseline-2025-12'
        };

        if (this.evidenceRecords.length > 0 && this.evidenceRecords[0].id === 'baseline-2025-12') {
            this.evidenceRecords[0] = baselineRecord;
        } else {
            this.evidenceRecords.unshift(baselineRecord);
        }
        
        await this.saveEvidenceRecords();
        
        // モーダルを閉じる
        document.getElementById('baselineModal').classList.remove('active');
        
        // 表示を更新
        this.renderBaseline();
        this.renderEvidenceTable();
        this.renderEvidenceChart();
        this.updateDashboard(); // Overviewタブの更新
    }

    openEvidenceModal() {
        const evidenceModal = document.getElementById('evidenceModal');
        if (!evidenceModal) {
            console.error('エビデンスモーダルが見つかりません');
            return;
        }
        
        // フォームをリセット
        const form = document.getElementById('evidenceForm');
        if (form) {
            form.reset();
            // 現在の月をデフォルトに設定
            const now = new Date();
            document.getElementById('evidenceMonth').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        
        evidenceModal.classList.add('active');
    }

    async saveEvidenceRecord() {
        const monthInput = document.getElementById('evidenceMonth');
        if (!monthInput) return;
        
        const [year, month] = monthInput.value.split('-').map(Number);
        
        const record = {
            id: `evidence-${year}-${month}`,
            period: `${year}年${month}月`,
            recordedDate: new Date().toISOString().split('T')[0],
            metrics: {
                aioCitations: parseInt(document.getElementById('evidenceAioCitations').value) || 0,
                avgRanking: parseFloat(document.getElementById('evidenceAvgRanking').value) || 0,
                traffic: parseInt(document.getElementById('evidenceTraffic').value) || 0,
                brandClicks: parseInt(document.getElementById('evidenceBrandClicks').value) || 0
            },
            notes: document.getElementById('evidenceNotes').value || ''
        };
        
        // 既存のレコードを更新または新規追加
        const existingIndex = this.evidenceRecords.findIndex(r => r.id === record.id);
        if (existingIndex >= 0) {
            this.evidenceRecords[existingIndex] = record;
        } else {
            this.evidenceRecords.push(record);
        }
        
        // 日付順にソート
        this.evidenceRecords.sort((a, b) => {
            const dateA = new Date(a.period.replace('年', '-').replace('月', ''));
            const dateB = new Date(b.period.replace('年', '-').replace('月', ''));
            return dateA - dateB;
        });
        
        await this.saveEvidenceRecords();
        
        // モーダルを閉じる
        document.getElementById('evidenceModal').classList.remove('active');
        
        // 表示を更新
        this.renderEvidenceTable();
        this.renderEvidenceChart();
    }

    async saveEvidenceRecords() {
        localStorage.setItem('aio_pdca_evidence_records', JSON.stringify(this.evidenceRecords));
    }

    renderEvidenceTable() {
        const container = document.getElementById('evidenceTable');
        if (!container) return;
        
        if (this.evidenceRecords.length === 0) {
            container.innerHTML = '<p style="padding: 2rem; text-align: center; color: #999;">エビデンス記録がありません。「月次データを追加」から記録を追加してください。</p>';
            return;
        }
        
        container.innerHTML = `
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                        <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">月</th>
                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #374151;">AIO引用</th>
                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #374151;">平均順位</th>
                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #374151;">トラフィック</th>
                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #374151;">ブランド認知度</th>
                        <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">備考</th>
                        <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.evidenceRecords.map((record, i) => `
                        <tr style="border-bottom: 1px solid #f3f4f6; ${i % 2 === 0 ? 'background: #fff;' : 'background: #fcfcfc;'}">
                            <td style="padding: 12px; font-weight: bold; color: #1f2937;">${record.period}</td>
                            <td style="padding: 12px; text-align: right; color: #2563eb;">${(record.metrics?.aioCitations || 0).toLocaleString()}件</td>
                            <td style="padding: 12px; text-align: right; color: #059669;">${(record.metrics?.avgRanking || 0).toFixed(2)}位</td>
                            <td style="padding: 12px; text-align: right; color: #d97706;">${(record.metrics?.traffic || 0).toLocaleString()}</td>
                            <td style="padding: 12px; text-align: right; color: #9333ea;">${(record.metrics?.brandClicks || 0)}件</td>
                            <td style="padding: 12px; color: #6b7280; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${record.notes || '-'}</td>
                            <td style="padding: 12px; text-align: center;">
                                <button class="edit-evidence-btn" data-id="${record.id}" style="padding: 6px; background: transparent; color: #6b7280; border: none; border-radius: 4px; cursor: pointer;">
                                    <span class="material-icons-round" style="font-size: 20px;">edit</span>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        // 編集ボタンのイベントリスナー
        container.querySelectorAll('.edit-evidence-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const recordId = btn.dataset.id;
                this.editEvidenceRecord(recordId);
            });
        });
    }

    editEvidenceRecord(id) {
        const record = this.evidenceRecords.find(r => r.id === id);
        if (!record) return;
        
        const evidenceModal = document.getElementById('evidenceModal');
        const [yearStr, monthStr] = record.period.split('年');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr.replace('月', ''));
        
        document.getElementById('evidenceMonth').value = `${year}-${String(month).padStart(2, '0')}`;
        document.getElementById('evidenceAioCitations').value = record.metrics?.aioCitations || 0;
        document.getElementById('evidenceAvgRanking').value = record.metrics?.avgRanking || 0;
        document.getElementById('evidenceTraffic').value = record.metrics?.traffic || 0;
        document.getElementById('evidenceBrandClicks').value = record.metrics?.brandClicks || 0;
        document.getElementById('evidenceNotes').value = record.notes || '';
        
        evidenceModal.classList.add('active');
    }

    renderEvidenceChart() {
        const ctx = document.getElementById('evidenceChart');
        if (!ctx || this.evidenceRecords.length === 0) return;
        
        // Chart.jsでグラフを描画
        const labels = this.evidenceRecords.map(r => r.period);
        const aioData = this.evidenceRecords.map(r => r.metrics?.aioCitations || 0);
        const rankingData = this.evidenceRecords.map(r => r.metrics?.avgRanking || 0);
        const trafficData = this.evidenceRecords.map(r => r.metrics?.traffic || 0);
        
        // 既存のチャートを破棄
        if (this.evidenceChart) {
            this.evidenceChart.destroy();
        }
        
        this.evidenceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'AIO引用数',
                        data: aioData,
                        borderColor: '#2563eb', // blue
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        yAxisID: 'y',
                        tension: 0.3
                    },
                    {
                        label: '平均順位',
                        data: rankingData,
                        borderColor: '#059669', // green
                        backgroundColor: 'rgba(5, 150, 105, 0.1)',
                        yAxisID: 'y1',
                        tension: 0.3
                    },
                    {
                        label: 'トラフィック',
                        data: trafficData,
                        borderColor: '#d97706', // amber
                        backgroundColor: 'rgba(217, 119, 6, 0.1)',
                        yAxisID: 'y2',
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'AIO引用数' },
                        grid: { borderDash: [2, 4] }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: '平均順位' },
                        grid: { drawOnChartArea: false },
                        reverse: true // 順位なので逆順
                    },
                    y2: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'トラフィック' },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    exportEvidenceCsv() {
        if (this.evidenceRecords.length === 0) {
            alert('エクスポートするデータがありません。');
            return;
        }
        
        // CSVヘッダー
        const headers = ['月', 'AIO引用数', '平均順位', 'トラフィック', 'ブランド認知度', '備考', '記録日'];
        
        // CSVデータ
        const rows = this.evidenceRecords.map(record => [
            record.period,
            record.metrics?.aioCitations || 0,
            record.metrics?.avgRanking || 0,
            record.metrics?.traffic || 0,
            record.metrics?.brandClicks || 0,
            (record.notes || '').replace(/,/g, '、'), // カンマを置換
            record.recordedDate || ''
        ]);
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `${cell}`).join(','))
        ].join('\n');
        
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `エビデンス記録_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    updateProgress() {
        // 進捗サマリーを更新
        this.updateProgressSummary();
        
        if (!this.progressData || !this.progressData.summary) {
            // デフォルト値を設定
            const completedEl = document.getElementById('progressCompleted');
            const inProgressEl = document.getElementById('progressInProgress');
            const notStartedEl = document.getElementById('progressNotStarted');
            
            if (completedEl) completedEl.textContent = '0';
            if (inProgressEl) inProgressEl.textContent = '0';
            if (notStartedEl) notStartedEl.textContent = '0';
            return;
        }

        const summary = this.progressData.summary;
        const completedEl = document.getElementById('progressCompleted');
        const inProgressEl = document.getElementById('progressInProgress');
        const notStartedEl = document.getElementById('progressNotStarted');
        
        if (completedEl) completedEl.textContent = summary.completed || 0;
        if (inProgressEl) inProgressEl.textContent = summary.inProgress || 0;
        if (notStartedEl) notStartedEl.textContent = summary.notStarted || 0;
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
        
        // 進捗状況を更新
        this.updateProgressFromArticles(articles);
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
                <select class="article-status-select ${statusClass}" data-article-id="${article.id}">
                    <option value="未着手" ${article.status === '未着手' ? 'selected' : ''}>未着手</option>
                    <option value="進行中" ${article.status === '進行中' ? 'selected' : ''}>進行中</option>
                    <option value="完了" ${article.status === '完了' ? 'selected' : ''}>完了</option>
                </select>
            </div>
            <div style="display: flex; justify-content: center; align-items: center; gap: 4px;">
                <span class="material-icons-round" style="font-size: 16px; color: var(--primary-color);">auto_awesome</span>
                <span class="article-citation-display" data-article-id="${article.id}" 
                    style="
                        width: 60px;
                        padding: 0.3rem 0.5rem;
                        border: 1px solid var(--border-color);
                        border-radius: 0.4rem;
                        font-size: 0.85rem;
                        text-align: center;
                        background: #f3f4f6;
                        color: var(--text-primary);
                        font-weight: 600;
                        display: inline-block;
                    ">
                    ${article.citationCount || 0}
                </span>
            </div>
            <div style="display: flex; justify-content: center; align-items: center;">
                <span class="article-score-display" data-article-id="${article.id}" 
                    style="
                        padding: 0.3rem 0.5rem;
                        border-radius: 0.4rem;
                        border: 1px solid var(--border-color);
                        background: #f3f4f6;
                        color: var(--text-primary);
                        font-size: 0.85rem;
                        font-weight: 600;
                        text-align: center;
                        min-width: 50px;
                    ">
                    ランク ${score.level || 'C'}
                </span>
            </div>
        `;

        // 記事情報部分のみクリック可能にする
        const articleInfo = item.querySelector('.article-info');
        if (articleInfo) {
            articleInfo.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                console.log('記事がクリックされました:', article.title);
                console.log('rewriteSystem:', typeof rewriteSystem);
                
                
                // rewriteSystemが初期化されるまで最大3秒待つ
                let retryCount = 0;
                const maxRetries = 30; // 3秒間（100ms * 30回）
                
                const waitForRewriteSystem = async () => {
                    if (typeof window.rewriteSystem !== 'undefined' && window.rewriteSystem && typeof window.rewriteSystem.openUrlModal === 'function') {
                        console.log('✅ rewriteSystemが利用可能です');
                        try {
                            console.log('openUrlModalを呼び出します');
                            await window.rewriteSystem.openUrlModal(article);
                            console.log('openUrlModalが完了しました');
                        } catch (error) {
                            console.error('記事を開く際にエラーが発生しました:', error);
                            alert('記事を開く際にエラーが発生しました: ' + error.message);
                        }
                        return true;
                    } else {
                        retryCount++;
                        if (retryCount < maxRetries) {
                            console.log(`rewriteSystemの初期化を待機中... (${retryCount}/${maxRetries})`);
                            await new Promise(resolve => setTimeout(resolve, 100));
                            return waitForRewriteSystem();
                        } else {
                            console.error('❌ rewriteSystemの初期化がタイムアウトしました');
                            alert('システムの初期化に失敗しました。ページをリロードしてください。');
                            return false;
                        }
                    }
                };
                
                await waitForRewriteSystem();
            });
        }
        
        // ステータスセレクトボックスのクリックイベントを停止
        const statusSelect = item.querySelector('.article-status-select');
        if (statusSelect) {
            statusSelect.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
        return item;
    }

    createPlanArticleItem(article) {
        const item = document.createElement('div');
        item.className = 'article-item plan-mode';
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
                    ${article.keyword || ''}
                </div>
            </div>
            <div style="display: flex; justify-content: center;">
                <select class="article-status-select ${statusClass}" data-article-id="${article.id}">
                    <option value="未着手" ${article.status === '未着手' ? 'selected' : ''}>未着手</option>
                    <option value="進行中" ${article.status === '進行中' ? 'selected' : ''}>進行中</option>
                    <option value="完了" ${article.status === '完了' ? 'selected' : ''}>完了</option>
                </select>
            </div>
            <div style="display: flex; justify-content: center; align-items: center;">
                <span style="
                    padding: 0.3rem 0.5rem;
                    border: 1px solid var(--border-color);
                    border-radius: 0.4rem;
                    font-size: 0.85rem;
                    text-align: center;
                    background: #f3f4f6;
                    color: var(--text-primary);
                    font-weight: 600;
                    min-width: 80px;
                ">
                    ${(article.clicks || 0).toLocaleString()}
                </span>
            </div>
            <div style="display: flex; justify-content: center; align-items: center;">
                <span style="
                    padding: 0.3rem 0.5rem;
                    border: 1px solid var(--border-color);
                    border-radius: 0.4rem;
                    font-size: 0.85rem;
                    text-align: center;
                    background: #f3f4f6;
                    color: var(--text-primary);
                    font-weight: 600;
                    min-width: 80px;
                ">
                    ${(article.impressions || 0).toLocaleString()}
                </span>
            </div>
            <div style="display: flex; justify-content: center; align-items: center;">
                <span style="
                    padding: 0.3rem 0.5rem;
                    border: 1px solid var(--border-color);
                    border-radius: 0.4rem;
                    font-size: 0.85rem;
                    text-align: center;
                    background: #f3f4f6;
                    color: var(--text-primary);
                    font-weight: 600;
                    min-width: 70px;
                ">
                    ${(article.ctr || 0).toFixed(2)}%
                </span>
            </div>
            <div style="display: flex; justify-content: center; align-items: center;">
                <span style="
                    padding: 0.3rem 0.5rem;
                    border: 1px solid var(--border-color);
                    border-radius: 0.4rem;
                    font-size: 0.85rem;
                    text-align: center;
                    background: #f3f4f6;
                    color: var(--text-primary);
                    font-weight: 600;
                    min-width: 60px;
                ">
                    ${(article.position || 0).toFixed(1)}
                </span>
            </div>
            <div style="display: flex; justify-content: center; align-items: center;">
                <span class="article-score-display" data-article-id="${article.id}" 
                    style="
                        padding: 0.3rem 0.5rem;
                        border-radius: 0.4rem;
                        border: 1px solid var(--border-color);
                        background: #f3f4f6;
                        color: var(--text-primary);
                        font-size: 0.85rem;
                        font-weight: 600;
                        text-align: center;
                        min-width: 70px;
                    ">
                    ${article.aioRank || score.level || 'C'}
                </span>
            </div>
        `;

        // 記事情報部分のみクリック可能にする
        const articleInfo = item.querySelector('.article-info');
        if (articleInfo) {
            articleInfo.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                console.log('記事がクリックされました:', article.title);
                if (window.rewriteSystem) {
                    await window.rewriteSystem.openUrlModal(article);
                } else {
                    console.error('rewriteSystemが利用できません');
                }
            });
        }

        // ステータス変更のイベントリスナー
        const statusSelect = item.querySelector('.article-status-select');
        if (statusSelect) {
            statusSelect.addEventListener('change', async (e) => {
                e.stopPropagation();
                const newStatus = e.target.value;
                // ステータス変更時にクラスを更新して色を反映
                const newStatusClass = newStatus === '完了' ? 'completed' : newStatus === '進行中' ? 'inProgress' : 'notStarted';
                statusSelect.className = `article-status-select ${newStatusClass}`;
                await this.updateArticleStatus(article.id, newStatus);
            });
        }

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

        // 仮説立案フォーム（削除）
        // const hypothesisForm = document.getElementById('hypothesisForm');
        // if (hypothesisForm) {
        //     hypothesisForm.addEventListener('submit', (e) => {
        //         e.preventDefault();
        //         this.saveHypothesis();
        //     });
        // }

        // バックアップボタン
        const backupBtn = document.getElementById('backupBtn');
        if (backupBtn) {
            backupBtn.addEventListener('click', () => {
                dataManager.createBackup();
            });
        }
        
        // 記事一覧のイベントリスナー（イベント委譲を使用）
        const articleList = document.getElementById('articleList');
        if (articleList) {
            // ステータス変更
            articleList.addEventListener('change', async (e) => {
                if (e.target.classList.contains('article-status-select')) {
                    e.stopPropagation();
                    const articleId = parseInt(e.target.dataset.articleId);
                    const newStatus = e.target.value;
                    await this.updateArticleStatus(articleId, newStatus);
                }
                // スコアランク変更のイベントリスナーは削除（読み取り専用のため）
            });
        }
    }
    
    async updateArticleScore(articleId, newLevel) {
        if (!this.progressData || !this.progressData.articles) {
            console.error('進捗データが読み込まれていません');
            return;
        }

        const article = this.progressData.articles.find(a => a.id === articleId);
        if (!article) {
            console.error('記事が見つかりません:', articleId);
            return;
        }

        // スコアを更新（afterスコアを優先、なければbeforeスコアを更新）
        if (!article.scores) {
            article.scores = {};
        }
        if (!article.scores.after) {
            article.scores.after = { total: 0, level: 'C' };
        }
        article.scores.after.level = newLevel;
        article.lastModified = new Date().toISOString();

        // データを保存
        try {
            await dataManager.saveProgress(this.progressData);
            console.log('スコアランクを更新しました:', articleId, newLevel);
            
            // 一覧を再描画
            const currentFilter = document.querySelector('.pdca-tab.active')?.dataset.tab || 'all';
            this.renderArticleList(currentFilter);
        } catch (error) {
            console.error('スコアランクの更新に失敗しました:', error);
            alert('スコアランクの更新に失敗しました: ' + error.message);
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

    async showArticlePreview(article) {
        const slug = this.getSlugFromUrl(article.url);
        const savedContent = await dataManager.loadMarkdown(`${slug}.md`);
        
        if (!savedContent) {
            alert('保存済みの内容が見つかりませんでした。');
            return;
        }
        
        // プレビューモーダルを開く（rewrite.jsのプレビューモーダルを再利用）
        const previewModal = document.getElementById('previewModal');
        const previewContent = document.getElementById('previewContent');
        
        if (!previewModal || !previewContent) {
            alert('プレビューモーダルが見つかりませんでした。');
            return;
        }
        
        // MarkdownをHTMLに変換して表示
        const htmlContent = this.markdownToHtml(savedContent);
        const formattedHtml = this.formatHtmlForPreview(htmlContent);
        previewContent.innerHTML = formattedHtml;
        
        previewModal.classList.add('active');
    }

    getSlugFromUrl(url) {
        try {
            const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
            return urlObj.pathname.split('/').filter(p => p).join('-') || 'article';
        } catch {
            return url.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
        }
    }

    markdownToHtml(markdown) {
        if (!markdown) return '';
        
        // 簡易的なMarkdown to HTML変換
        let html = markdown
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
            .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/gim, '<em>$1</em>')
            .replace(/!\[([^\]]*)\]\(([^)]+)\)/gim, '<img src="$2" alt="$1">')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>')
            .replace(/`([^`]+)`/gim, '<code>$1</code>')
            .replace(/\n\n/gim, '</p><p>')
            .replace(/\n/gim, '<br>');
        
        // 段落タグで囲む
        html = '<p>' + html + '</p>';
        
        return html;
    }

    formatHtmlForPreview(html) {
        // HTMLを整形してプレビュー用に最適化
        let formatted = html;
        
        // スタイルタグを追加（まだ追加されていない場合）
        if (!formatted.includes('<style')) {
            formatted = `
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                        line-height: 1.8;
                        color: #1f2937;
                    }
                    h1 {
                        font-size: 2rem;
                        font-weight: 800;
                        margin: 2rem 0 1rem 0;
                        padding-bottom: 0.5rem;
                        border-bottom: 2px solid #e5e7eb;
                    }
                    h2 {
                        font-size: 1.5rem;
                        font-weight: 700;
                        margin: 1.5rem 0 0.75rem 0;
                        padding-top: 1rem;
                    }
                    h3 {
                        font-size: 1.25rem;
                        font-weight: 600;
                        margin: 1.25rem 0 0.5rem 0;
                    }
                    h4 {
                        font-size: 1.1rem;
                        font-weight: 600;
                        margin: 1rem 0 0.5rem 0;
                    }
                    p {
                        margin: 1rem 0;
                    }
                    ul, ol {
                        margin: 1rem 0;
                        padding-left: 2rem;
                    }
                    li {
                        margin: 0.5rem 0;
                    }
                    img {
                        max-width: 100%;
                        height: auto;
                        border-radius: 8px;
                        margin: 1.5rem 0;
                    }
                    blockquote {
                        border-left: 4px solid #3b82f6;
                        padding-left: 1rem;
                        margin: 1rem 0;
                        color: #4b5563;
                        font-style: italic;
                    }
                    code {
                        background: #f3f4f6;
                        padding: 0.2rem 0.4rem;
                        border-radius: 4px;
                        font-family: 'Courier New', monospace;
                        font-size: 0.9em;
                    }
                    pre {
                        background: #1f2937;
                        color: #f9fafb;
                        padding: 1rem;
                        border-radius: 8px;
                        overflow-x: auto;
                        margin: 1rem 0;
                    }
                    pre code {
                        background: transparent;
                        padding: 0;
                        color: inherit;
                    }
                    a {
                        color: #3b82f6;
                        text-decoration: underline;
                    }
                    a:hover {
                        color: #2563eb;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 1rem 0;
                    }
                    th, td {
                        border: 1px solid #e5e7eb;
                        padding: 0.75rem;
                        text-align: left;
                    }
                    th {
                        background: #f9fafb;
                        font-weight: 600;
                    }
                </style>
                ${formatted}
            `;
        }
        
        return formatted;
    }
}

// グローバルインスタンス
let dashboardSystem;

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
    dashboardSystem = new Dashboard();
});
