/**
 * ダッシュボード機能
 * PDCAタブ、現状把握カード、進捗状況の表示
 */

class Dashboard {
    constructor() {
        this.currentTab = 'plan'; // 初期タブをPlanに変更
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
        this.setupRecordTab();
        this.setupReportTab();
        
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
        // 0の値も正しく表示するように修正（?? を使用）
        document.getElementById('planAioCitations').value = plan.metrics?.aioCitations ?? '';
        document.getElementById('planAvgRanking').value = plan.metrics?.avgRanking ?? '';
        document.getElementById('planTraffic').value = plan.metrics?.traffic ?? '';
        document.getElementById('planBrandClicks').value = plan.metrics?.brandClicks ?? '';
        
        // 記事ごとの数値データを表示（URLも含まれる）
        if (plan.articleMetrics && plan.articleMetrics.length > 0) {
            this.renderArticleMetricsTable(plan.articleMetrics);
            // 記事テーブルを表示した後、自動計算で上書きしないように注意
            // updateMetricsFromArticleTable()は呼ばない
        } else {
            this.renderArticleMetricsTable([]);
        }
    }

    async savePlan() {
        const form = document.getElementById('planForm');
        if (!form) return;
        
        const planId = form.dataset.planId;
        
        // 記事ごとの数値入力テーブルからURLを取得
        const articleMetrics = this.getArticleMetricsFromTable();
        const articleUrls = articleMetrics
            .map(metric => metric.name)
            .filter(name => {
                // URL形式かどうかをチェック
                return name && (name.match(/^https?:\/\//) || name.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/));
            });
        
        const planData = {
            id: planId || `plan-${Date.now()}`,
            name: document.getElementById('planName').value,
            objective: document.getElementById('planObjective').value,
            overview: document.getElementById('planOverview').value,
            metrics: {
                aioCitations: parseInt(document.getElementById('planAioCitations').value) || 0,
                avgRanking: parseFloat(document.getElementById('planAvgRanking').value) || 0,
                traffic: parseInt(document.getElementById('planTraffic').value) || 0,
                brandClicks: parseInt(document.getElementById('planBrandClicks').value) || 0
            },
            articleUrls: articleUrls,
            articleMetrics: articleMetrics,
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
        this.updateCheckPlanSelect();
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
        this.updateCheckPlanSelect();
        
        // 現在選択されているプランが削除された場合、選択をリセット
        const planSelect = document.getElementById('selectedPlanId');
        if (planSelect && planSelect.value === planId) {
            planSelect.value = '';
            this.renderArticleList('all');
        }
    }
    
    // --- プラン選択機能の実装メソッド ---
    
    setupPlanSelection() {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:660',message:'setupPlanSelection called',data:{plansCount:this.plans?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        
        const planSelect = document.getElementById('selectedPlanId');
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:662',message:'planSelect element check',data:{planSelectExists:!!planSelect,planSelectId:planSelect?.id,planSelectValue:planSelect?.value},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        
        if (planSelect) {
            // 既存のイベントリスナーを削除（重複防止）
            // cloneNodeではなく、既存のイベントリスナーを削除してから再設定
            const existingValue = planSelect.value;
            planSelect.replaceWith(planSelect.cloneNode(true));
            const freshPlanSelect = document.getElementById('selectedPlanId');
            if (freshPlanSelect) {
                freshPlanSelect.value = existingValue;
            }
            
            // プラン一覧をドロップダウンに追加
            this.updatePlanSelectOptions();
            this.updateCheckPlanSelect();
            
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:675',message:'before addEventListener',data:{freshPlanSelectExists:!!freshPlanSelect,optionsCount:freshPlanSelect?.options?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
            // #endregion
            
            // プラン選択時のイベント
            if (freshPlanSelect) {
                freshPlanSelect.addEventListener('change', async (e) => {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:680',message:'planSelect change event fired',data:{planId:e.target.value,previousPlanId:this.selectedPlanId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
                // #endregion
                
                const planId = e.target.value;
                if (planId) {
                    await this.loadPlanArticles(planId);
                } else {
                    // プランが選択されていない場合は、通常の記事一覧を表示する
                    this.selectedPlanId = null;
                    this.currentPlanArticles = [];
                    
                    // 記事一覧セクションを非表示にする
                    const articleListSection = document.querySelector('.article-list-section');
                    if (articleListSection) {
                        articleListSection.style.display = 'none';
                    }
                }
                });
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:695',message:'setupPlanSelection completed',data:{hasEventListener:!!freshPlanSelect},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
            // #endregion
        } else {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:698',message:'planSelect element not found',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
            // #endregion
        }
    }
    
    updatePlanSelectOptions() {
        const planSelect = document.getElementById('selectedPlanId');
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:712',message:'updatePlanSelectOptions called',data:{planSelectExists:!!planSelect,plansCount:this.plans?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        
        if (!planSelect) return;
        
        // 既存のオプションをクリア（最初の「プランを選択してください」以外）
        const initialLength = planSelect.children.length;
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
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:730',message:'updatePlanSelectOptions completed',data:{initialOptionsCount:initialLength,finalOptionsCount:planSelect.children.length,addedPlans:this.plans.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
    }
    
    async loadPlanArticles(planId) {
        console.log('loadPlanArticles called with planId:', planId);
        const plan = this.plans.find(p => p.id === planId);
        if (!plan) {
            console.error('プランが見つかりません:', planId);
            alert('プランが見つかりません。');
            return;
        }
        
        if (!plan.articleUrls || plan.articleUrls.length === 0) {
            alert('このプランには記事URLが設定されていません。');
            return;
        }
        
        console.log('プランの記事URL数:', plan.articleUrls.length);
        
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
        
        console.log('プランの記事数:', planArticles.length);
        console.log('プランの記事ステータス:', planArticles.map(a => ({ title: a.title, status: a.status })));
        
        // プランの記事を一時的に保存して表示
        this.currentPlanArticles = planArticles;
        await this.renderPlanArticleList(planArticles);
        
        // 進捗状況を更新（選択したプランの記事に基づいて）
        console.log('進捗状況を更新します。記事数:', planArticles.length);
        this.updateProgressFromArticles(planArticles);
    }
    
    updateProgressFromArticles(articles) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:806',message:'updateProgressFromArticles called',data:{articlesCount:articles?.length,articleStatuses:articles?.map(a=>a.status)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        console.log('updateProgressFromArticles called with articles:', articles?.length);
        if (!articles || articles.length === 0) {
            // デフォルト値を設定
            const completedEl = document.getElementById('progressCompleted');
            const inProgressEl = document.getElementById('progressInProgress');
            const notStartedEl = document.getElementById('progressNotStarted');
            
            if (completedEl) completedEl.textContent = '0';
            if (inProgressEl) inProgressEl.textContent = '0';
            if (notStartedEl) notStartedEl.textContent = '0';
            console.log('記事が空のため、進捗を0に設定しました');
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:818',message:'articles empty, setting zeros',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            return;
        }
        
        const completed = articles.filter(a => a.status === '完了').length;
        const inProgress = articles.filter(a => a.status === '進行中').length;
        const notStarted = articles.filter(a => a.status === '未着手').length;
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:821',message:'calculated status counts',data:{completed,inProgress,notStarted,total:articles.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        console.log('進捗計算結果:', { completed, inProgress, notStarted, total: articles.length });
        
        const completedEl = document.getElementById('progressCompleted');
        const inProgressEl = document.getElementById('progressInProgress');
        const notStartedEl = document.getElementById('progressNotStarted');
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:826',message:'DOM elements found',data:{completedElFound:!!completedEl,inProgressElFound:!!inProgressEl,notStartedElFound:!!notStartedEl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        if (completedEl) {
            completedEl.textContent = completed;
            console.log('完了数を更新:', completed);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:832',message:'updated completedEl',data:{completed,completedElTextContent:completedEl.textContent},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        } else {
            console.error('progressCompleted要素が見つかりません');
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:835',message:'progressCompleted element not found',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        }
        
        if (inProgressEl) {
            inProgressEl.textContent = inProgress;
            console.log('進行中数を更新:', inProgress);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:838',message:'updated inProgressEl',data:{inProgress,inProgressElTextContent:inProgressEl.textContent},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        } else {
            console.error('progressInProgress要素が見つかりません');
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:842',message:'progressInProgress element not found',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        }
        
        if (notStartedEl) {
            notStartedEl.textContent = notStarted;
            console.log('未着手数を更新:', notStarted);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:845',message:'updated notStartedEl',data:{notStarted,notStartedElTextContent:notStartedEl.textContent},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        } else {
            console.error('progressNotStarted要素が見つかりません');
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:849',message:'progressNotStarted element not found',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        }
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
    
    /**
     * 記事のH1タイトルを取得（Markdownファイルから）
     */
    async getArticleH1Title(article) {
        // 既にH1タイトルが保存されている場合はそれを使用
        if (article.h1Title) {
            return article.h1Title;
        }
        
        // URLからスラッグを取得
        const slug = this.getSlugFromUrl(article.url);
        if (!slug) {
            return article.title || '';
        }
        
        // MarkdownファイルからH1を取得
        try {
            const markdown = await dataManager.loadMarkdown(`${slug}.md`);
            if (markdown) {
                const h1Match = markdown.match(/^#\s+(.+)$/m);
                if (h1Match && h1Match[1]) {
                    // HTMLタグを削除
                    const h1Title = h1Match[1].trim().replace(/<[^>]*>/g, '');
                    return h1Title;
                }
            }
        } catch (error) {
            console.warn('H1タイトルの取得に失敗:', error);
        }
        
        // H1が取得できない場合は、既存のタイトルを返す
        return article.title || '';
    }
    
    /**
     * URLからスラッグを取得
     */
    getSlugFromUrl(url) {
        try {
            const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            return pathParts[pathParts.length - 1] || '';
        } catch {
            return '';
        }
    }
    
    async renderPlanArticleList(articles) {
        const articleList = document.getElementById('articleList');
        if (!articleList) return;
        
        // 記事一覧セクションを表示
        const articleListSection = document.querySelector('.article-list-section');
        if (articleListSection) {
            articleListSection.style.display = 'block';
        }
        
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
        
        // insertBeforeを使用する前に、articleListが親ノードの子要素であることを確認
        if (articleList && articleList.parentNode && articleList.parentNode.contains(articleList)) {
            articleList.parentNode.insertBefore(header, articleList);
        } else {
            // 親要素が存在しない、またはarticleListが親要素の子要素でない場合は、articleListの前に追加
            if (articleList && articleList.parentNode) {
                articleList.parentNode.insertBefore(header, articleList);
            } else {
                // フォールバック: articleListの親要素を取得して追加
                const articleListSection = document.querySelector('.article-list-section');
                if (articleListSection) {
                    articleListSection.insertBefore(header, articleListSection.firstChild);
                }
            }
        }
        
        articleList.innerHTML = '';
        
        // 各記事のH1タイトルを取得してから表示
        for (const article of articles) {
            const h1Title = await this.getArticleH1Title(article);
            // H1タイトルを記事オブジェクトに保存（次回以降の表示を高速化）
            if (!article.h1Title && h1Title) {
                article.h1Title = h1Title;
            }
            const item = this.createPlanArticleItem(article, h1Title);
            articleList.appendChild(item);
        }
        
        // フィルターボタンの動作も更新（イベント委譲で処理するため、ここでは何もしない）
        // this.updateFilterButtons(); // 削除
        
        // 進捗状況を更新（フィルタリング前のプランの全記事で計算）
        // 重要：articlesはフィルタリング済みだが、進捗は全記事で計算
        if (this.selectedPlanId && this.currentPlanArticles.length > 0) {
            this.updateProgressFromArticles(this.currentPlanArticles);
        } else {
            this.updateProgressFromArticles(articles);
        }
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
        
        // 合計値を計算（参考用、全体の数値入力欄には自動反映しない）
        const totalClicks = metrics.reduce((sum, m) => sum + (m.clicks || 0), 0);
        const totalImpressions = metrics.reduce((sum, m) => sum + (m.impressions || 0), 0);
        const avgPosition = metrics.length > 0 
            ? metrics.reduce((sum, m) => sum + (m.position || 0), 0) / metrics.length 
            : 0;
        
        // 全体の数値入力欄への自動反映を削除
        // CSVからインポートした手動入力の値を保持するため
        // const trafficInput = document.getElementById('planTraffic');
        // if (trafficInput) {
        //     trafficInput.value = totalClicks;
        // }
        // 
        // const avgRankingInput = document.getElementById('planAvgRanking');
        // if (avgRankingInput) {
        //     avgRankingInput.value = avgPosition.toFixed(2);
        // }
        
        // AIO引用数は記事ごとの数値からは計算できないので、手動入力のまま
        // ブランド認知度も同様
        // トラフィックと検索順位も、手動入力の値を優先する
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
        // CSVパーサー（複数の形式に対応）
        const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length < 2) return null;
        
        // ヘッダー行を解析
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const data = {};
        
        // 指標名と数値のマッピング
        const metricMap = {
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
        
        // ヘッダーが「指標名」「数値」の形式かどうかをチェック
        const indicatorNameIndex = headers.findIndex(h => h.includes('指標') || h.includes('名前') || h.includes('項目'));
        const valueIndex = headers.findIndex(h => h.includes('数値') || h.includes('値') || h.includes('データ'));
        
        if (indicatorNameIndex !== -1 && valueIndex !== -1) {
            // 「指標名」「数値」形式のCSV（複数行対応）
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                if (values.length <= Math.max(indicatorNameIndex, valueIndex)) continue;
                
                const indicatorName = values[indicatorNameIndex] || '';
                const value = values[valueIndex] || '';
                
                // 指標名からキーワードを探す
                const matchedKey = Object.keys(metricMap).find(k => indicatorName.includes(k));
                if (matchedKey && value) {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        data[metricMap[matchedKey]] = numValue;
                    }
                }
            }
        } else {
            // 従来の形式（ヘッダーが指標名、値が1行目）
            if (lines.length >= 2) {
                const values = lines[1].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                
                headers.forEach((header, i) => {
                    const cleanHeader = header.replace(/^"|"$/g, '');
                    const matchedKey = Object.keys(metricMap).find(k => cleanHeader.includes(k));
                    if (matchedKey && values[i]) {
                        const cleanValue = values[i].replace(/^"|"$/g, '');
                        const numValue = parseFloat(cleanValue);
                        if (!isNaN(numValue)) {
                            data[metricMap[matchedKey]] = numValue;
                        }
                    }
                });
            }
        }
        
        return Object.keys(data).length > 0 ? data : null;
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
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:1388',message:'updateArticleStatus called',data:{articleId,newStatus,selectedPlanId:this.selectedPlanId,currentPlanArticlesCount:this.currentPlanArticles?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        if (!this.progressData || !this.progressData.articles) {
            console.error('進捗データが読み込まれていません');
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:1390',message:'progressData missing',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            return;
        }

        const article = this.progressData.articles.find(a => a.id === articleId);
        if (!article) {
            console.error('記事が見つかりません:', articleId);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:1396',message:'article not found',data:{articleId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            return;
        }

        // ステータスを更新
        const oldStatus = article.status;
        article.status = newStatus;
        article.lastModified = new Date().toISOString();
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:1401',message:'status updated in progressData',data:{articleId,oldStatus,newStatus},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion

        // 進捗サマリーを更新
        this.updateProgressSummary();

        // データを保存
        try {
            await dataManager.saveProgress(this.progressData);
            console.log('ステータスを更新しました:', articleId, newStatus);
            
            // プランが選択されている場合は、プランの記事一覧を再描画
            if (this.selectedPlanId) {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:1413',message:'plan selected, updating currentPlanArticles',data:{selectedPlanId:this.selectedPlanId,currentPlanArticlesCount:this.currentPlanArticles?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                
                // currentPlanArticlesも更新（progressDataから最新の状態を反映）
                // 記事IDの型を統一してマッチング（文字列と数値の両方に対応）
                const updatedArticle = this.currentPlanArticles.find(a => 
                    String(a.id) === String(articleId) || a.url === article.url
                );
                if (updatedArticle) {
                    updatedArticle.status = newStatus;
                    // progressDataから最新の情報を反映
                    Object.assign(updatedArticle, article);
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:1420',message:'updated article in currentPlanArticles',data:{articleId,newStatus,updatedArticleStatus:updatedArticle.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                } else {
                    // 見つからない場合は、URLでマッチングを試みる
                    const articleByUrl = this.currentPlanArticles.find(a => a.url === article.url);
                    if (articleByUrl) {
                        articleByUrl.status = newStatus;
                        Object.assign(articleByUrl, article);
                        // #region agent log
                        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:1427',message:'updated article by URL in currentPlanArticles',data:{articleId,newStatus,articleByUrlStatus:articleByUrl.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                        // #endregion
                    } else {
                        // #region agent log
                        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:1430',message:'article not found in currentPlanArticles',data:{articleId,articleUrl:article.url,currentPlanArticlesIds:this.currentPlanArticles.map(a=>a.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                        // #endregion
                    }
                }
                
                // プランを再読み込みせず、currentPlanArticlesを直接更新して再描画
                // これによりドロップダウンの値がリセットされない
                // #region agent log
                const statusCountsBefore = {
                    completed: this.currentPlanArticles.filter(a => a.status === '完了').length,
                    inProgress: this.currentPlanArticles.filter(a => a.status === '進行中').length,
                    notStarted: this.currentPlanArticles.filter(a => a.status === '未着手').length
                };
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:1434',message:'before renderPlanArticleList',data:{statusCountsBefore,currentPlanArticlesCount:this.currentPlanArticles.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                
                await this.renderPlanArticleList(this.currentPlanArticles);
                
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:1436',message:'calling updateProgressFromArticles',data:{currentPlanArticlesCount:this.currentPlanArticles.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                
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
                console.log('Doタブが選択されました。');
                // プランが選択されていない場合は通常の記事一覧を表示
                if (!this.selectedPlanId) {
                    const articleListSection = document.querySelector('.article-list-section');
                    if (articleListSection) {
                        articleListSection.style.display = 'block';
                    }
                    // 通常の記事一覧を表示
                    this.renderArticleList('all');
                }
            } else if (tabName === 'plan') {
                // Planタブが選択されたらプラン一覧を表示
                this.renderPlans();
            } else if (tabName === 'record') {
                // RecordタブはsetupRecordTabで処理される
            } else if (tabName === 'report') {
                // ReportタブはsetupReportTabで処理される
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

        // プランが選択されている場合は、プランの記事一覧を表示するため、通常の記事一覧は表示しない
        // renderPlanArticleListが呼ばれるので、ここでは早期リターン
        if (this.selectedPlanId) {
            return;
        }

        // プランが選択されていない時は記事一覧セクションを非表示にする
        const articleListSection = document.querySelector('.article-list-section');
        if (articleListSection) {
            articleListSection.style.display = 'none';
        }
        return; // プランが選択されていない時は記事一覧を表示しない

        const articleList = document.getElementById('articleList');
        if (!articleList) {
            console.error('articleList要素が見つかりません！');
            console.error('現在のDOM:', document.querySelector('#doTab'));
            return;
        }
        
        console.log('articleList要素が見つかりました:', articleList);
        console.log('記事数:', this.progressData.articles.length);
        
        // ヘッダーを追加（既存のヘッダーを削除して通常モードのヘッダーを作成）
        const existingHeaders = document.querySelectorAll('.article-list-header');
        existingHeaders.forEach(header => header.remove());
        
        const header = document.createElement('div');
        header.className = 'article-list-header';
        header.innerHTML = `
            <div>記事情報</div>
            <div style="text-align: center;">ステータス</div>
            <div style="text-align: center;">AIO引用数</div>
            <div style="text-align: center;">スコア</div>
        `;
        
        // insertBeforeを使用する前に、articleListが親ノードの子要素であることを確認
        if (articleList && articleList.parentNode && articleList.parentNode.contains(articleList)) {
            articleList.parentNode.insertBefore(header, articleList);
        } else {
            // 親要素が存在しない、またはarticleListが親要素の子要素でない場合は、articleListの前に追加
            if (articleList && articleList.parentNode) {
                articleList.parentNode.insertBefore(header, articleList);
            } else {
                // フォールバック: articleListの親要素を取得して追加
                const articleListSection = document.querySelector('.article-list-section');
                if (articleListSection) {
                    articleListSection.insertBefore(header, articleListSection.firstChild);
                }
            }
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

    createPlanArticleItem(article, h1Title = null) {
        const item = document.createElement('div');
        item.className = 'article-item plan-mode';
        item.dataset.articleId = article.id;

        const statusClass = article.status === '完了' ? 'completed' : 
                           article.status === '進行中' ? 'inProgress' : 'notStarted';

        const score = article.scores?.after || article.scores?.before || { total: 0, level: 'C' };
        const scoreLevel = score.level.toLowerCase();
        
        // H1タイトルを優先的に使用、なければ既存のタイトルを使用
        const displayTitle = h1Title || article.h1Title || article.title || '';

        item.innerHTML = `
            <div class="article-info">
                <div class="article-title">${displayTitle}</div>
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

        // ステータス変更のイベントリスナー
        const statusSelect = item.querySelector('.article-status-select');
        if (statusSelect) {
            // クリックイベントを停止（親要素のクリックイベントを防ぐ）
            statusSelect.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            
            // 変更イベントを設定
            statusSelect.addEventListener('change', async (e) => {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.js:2431',message:'plan article status select change event',data:{articleId:article.id,newStatus:e.target.value,oldStatus:article.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                
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
        // フィルターボタン（イベント委譲を使用、doTabに設定）
        const doTab = document.getElementById('doTab');
        if (doTab) {
            // 既存のイベントリスナーを削除してから再設定（重複を防ぐ）
            if (this.handleFilterClick) {
                doTab.removeEventListener('click', this.handleFilterClick);
            }
            // アロー関数でthisをバインド
                this.handleFilterClick = async (e) => {
                    if (e.target.classList.contains('filter-btn')) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // アクティブクラスを更新
                        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                        e.target.classList.add('active');
                        
                        const filter = e.target.dataset.filter;
                        
                        // プランが選択されている場合は、プランの記事一覧をフィルタリング
                        if (this.selectedPlanId && this.currentPlanArticles.length > 0) {
                            // フィルタリング済みの記事を取得
                            const filteredArticles = this.currentPlanArticles.filter(article => {
                                if (filter === 'all') return true;
                                if (filter === 'notStarted') return article.status === '未着手';
                                if (filter === 'inProgress') return article.status === '進行中';
                                if (filter === 'completed') return article.status === '完了';
                                return true;
                            });
                            // フィルタリング済み記事で一覧を表示
                            await this.renderPlanArticleList(filteredArticles);
                        } else {
                            // プランが選択されていない場合は記事一覧を非表示
                            const articleListSection = document.querySelector('.article-list-section');
                            if (articleListSection) {
                                articleListSection.style.display = 'none';
                            }
                        }
                    }
                };
            doTab.addEventListener('click', this.handleFilterClick);
        }

        // 仮説立案フォーム（削除）
        // const hypothesisForm = document.getElementById('hypothesisForm');
        // if (hypothesisForm) {
        //     hypothesisForm.addEventListener('submit', (e) => {
        //         e.preventDefault();
        //         this.saveHypothesis();
        //     });
        // }

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

    setupRecordTab() {
        const recordPlanSelect = document.getElementById('recordPlanSelect');
        const publishDate = document.getElementById('publishDate');
        const measurement2weeks = document.getElementById('measurement2weeks');
        const measurement3weeks = document.getElementById('measurement3weeks');
        const import2weeksCsvBtn = document.getElementById('import2weeksCsvBtn');
        const import3weeksCsvBtn = document.getElementById('import3weeksCsvBtn');
        const csv2weeksFileInput = document.getElementById('csv2weeksFileInput');
        const csv3weeksFileInput = document.getElementById('csv3weeksFileInput');
        const saveRecordDataBtn = document.getElementById('saveRecordDataBtn');
        const recordMetricsSection = document.getElementById('recordMetricsSection');
        const recordResultsSection = document.getElementById('recordResultsSection');

        // プラン選択ドロップダウンを更新
        this.updateRecordPlanSelect();

        // プラン選択時の処理
        if (recordPlanSelect) {
            recordPlanSelect.addEventListener('change', (e) => {
                const planId = e.target.value;
                if (planId) {
                    this.loadPlanForRecord(planId);
                } else {
                    recordMetricsSection.style.display = 'none';
                    recordResultsSection.style.display = 'none';
                }
            });
        }

        // 公開完了日の変更時に2週間後、3週間後の計測日を自動計算
        if (publishDate) {
            publishDate.addEventListener('change', (e) => {
                const publishDateValue = new Date(e.target.value);
                if (!isNaN(publishDateValue.getTime())) {
                    // 2週間後（14日後）
                    const date2weeks = new Date(publishDateValue);
                    date2weeks.setDate(date2weeks.getDate() + 14);
                    measurement2weeks.value = this.formatDateTimeLocal(date2weeks);

                    // 3週間後（21日後）
                    const date3weeks = new Date(publishDateValue);
                    date3weeks.setDate(date3weeks.getDate() + 21);
                    measurement3weeks.value = this.formatDateTimeLocal(date3weeks);
                }
            });
        }

        // 2週間後CSVインポート
        if (import2weeksCsvBtn && csv2weeksFileInput) {
            import2weeksCsvBtn.addEventListener('click', () => {
                csv2weeksFileInput.click();
            });
            
            csv2weeksFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.importRecordCsvFile(e.target.files[0], '2weeks');
                }
            });
        }

        // 3週間後CSVインポート
        if (import3weeksCsvBtn && csv3weeksFileInput) {
            import3weeksCsvBtn.addEventListener('click', () => {
                csv3weeksFileInput.click();
            });
            
            csv3weeksFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.importRecordCsvFile(e.target.files[0], '3weeks');
                }
            });
        }

        // 2週間後記事ごとのCSVインポート
        const import2weeksArticleCsvBtn = document.getElementById('import2weeksArticleCsvBtn');
        const csv2weeksArticleFileInput = document.getElementById('csv2weeksArticleFileInput');
        if (import2weeksArticleCsvBtn && csv2weeksArticleFileInput) {
            import2weeksArticleCsvBtn.addEventListener('click', () => {
                csv2weeksArticleFileInput.click();
            });
            
            csv2weeksArticleFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.importRecordArticleCsvFile(e.target.files[0], '2weeks');
                }
            });
        }

        // 3週間後記事ごとのCSVインポート
        const import3weeksArticleCsvBtn = document.getElementById('import3weeksArticleCsvBtn');
        const csv3weeksArticleFileInput = document.getElementById('csv3weeksArticleFileInput');
        if (import3weeksArticleCsvBtn && csv3weeksArticleFileInput) {
            import3weeksArticleCsvBtn.addEventListener('click', () => {
                csv3weeksArticleFileInput.click();
            });
            
            csv3weeksArticleFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.importRecordArticleCsvFile(e.target.files[0], '3weeks');
                }
            });
        }

        // データを保存
        if (saveRecordDataBtn) {
            saveRecordDataBtn.addEventListener('click', async () => {
                await this.saveRecordData();
            });
        }
    }

    updateRecordPlanSelect() {
        const recordPlanSelect = document.getElementById('recordPlanSelect');
        if (!recordPlanSelect) return;

        recordPlanSelect.innerHTML = '<option value="">プランを選択してください</option>';
        
        this.plans.forEach(plan => {
            const option = document.createElement('option');
            option.value = plan.id;
            option.textContent = plan.name;
            recordPlanSelect.appendChild(option);
        });
    }

    async loadPlanForRecord(planId) {
        const plan = this.plans.find(p => p.id === planId);
        if (!plan) return;

        const recordMetricsSection = document.getElementById('recordMetricsSection');
        if (recordMetricsSection) recordMetricsSection.style.display = 'block';

        // 現状数値をプランから引き継ぎ
        const elAio = document.getElementById('currentAioCitations');
        const elRank = document.getElementById('currentAvgRanking');
        const elTraffic = document.getElementById('currentTraffic');
        const elBrand = document.getElementById('currentBrandClicks');

        if (elAio) elAio.value = plan.metrics?.aioCitations ?? '';
        if (elRank) elRank.value = plan.metrics?.avgRanking ?? '';
        if (elTraffic) elTraffic.value = plan.metrics?.traffic ?? '';
        if (elBrand) elBrand.value = plan.metrics?.brandClicks ?? '';

        // 保存済みのRecordデータを読み込む
        await this.loadRecordData(planId);
    }

    async loadRecordData(planId) {
        // 互換性のため checkData_ を使用
        const recordData = localStorage.getItem(`checkData_${planId}`);
        if (recordData) {
            try {
                const data = JSON.parse(recordData);
                
                // 計測日を復元
                if (data.publishDate) {
                    const el = document.getElementById('publishDate');
                    if (el) {
                        el.value = data.publishDate;
                        // 計測日の自動計算をトリガー
                        const event = new Event('change');
                        el.dispatchEvent(event);
                    }
                }
                
                // 2週間後の数値を復元
                if (data.metrics2weeks) {
                    const m2w = data.metrics2weeks;
                    const elAio = document.getElementById('metrics2weeksAioCitations');
                    const elRank = document.getElementById('metrics2weeksAvgRanking');
                    const elTraffic = document.getElementById('metrics2weeksTraffic');
                    const elBrand = document.getElementById('metrics2weeksBrandClicks');
                    
                    if (elAio) elAio.value = m2w.aioCitations ?? '';
                    if (elRank) elRank.value = m2w.avgRanking ?? '';
                    if (elTraffic) elTraffic.value = m2w.traffic ?? '';
                    if (elBrand) elBrand.value = m2w.brandClicks ?? '';
                    
                    // 2週間後の記事ごとの数値を復元
                    if (data.articleMetrics2weeks && data.articleMetrics2weeks.length > 0) {
                        this.renderRecordArticleMetricsTable(data.articleMetrics2weeks, '2weeks');
                    }
                }
                
                // 3週間後の数値を復元
                if (data.metrics3weeks) {
                    const m3w = data.metrics3weeks;
                    const elAio = document.getElementById('metrics3weeksAioCitations');
                    const elRank = document.getElementById('metrics3weeksAvgRanking');
                    const elTraffic = document.getElementById('metrics3weeksTraffic');
                    const elBrand = document.getElementById('metrics3weeksBrandClicks');
                    
                    if (elAio) elAio.value = m3w.aioCitations ?? '';
                    if (elRank) elRank.value = m3w.avgRanking ?? '';
                    if (elTraffic) elTraffic.value = m3w.traffic ?? '';
                    if (elBrand) elBrand.value = m3w.brandClicks ?? '';
                    
                    // 3週間後の記事ごとの数値を復元
                    if (data.articleMetrics3weeks && data.articleMetrics3weeks.length > 0) {
                        this.renderRecordArticleMetricsTable(data.articleMetrics3weeks, '3weeks');
                    }
                }

                // 結果を表示（Recordタブでは簡易表示）
                const recordResultsSection = document.getElementById('recordResultsSection');
                if (recordResultsSection) {
                    recordResultsSection.style.display = 'block';
                }
            } catch (error) {
                console.error('Recordデータの読み込みエラー:', error);
            }
        }
    }

    importRecordCsvFile(file, period) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const csvText = e.target.result;
            const data = this.parseCsv(csvText);
            if (data) {
                this.fillCheckMetricsFromCsv(data, period);
                alert(`${period === '2weeks' ? '2週間後' : '3週間後'}のCSVからデータをインポートしました`);
            } else {
                alert('CSVデータの形式が正しくありません');
            }
        };
        reader.readAsText(file);
    }

    fillCheckMetricsFromCsv(data, period) {
        const prefix = period === '2weeks' ? 'metrics2weeks' : 'metrics3weeks';
        
        if (data.aioCitations) document.getElementById(`${prefix}AioCitations`).value = data.aioCitations;
        if (data.avgRanking) document.getElementById(`${prefix}AvgRanking`).value = data.avgRanking;
        if (data.traffic) document.getElementById(`${prefix}Traffic`).value = data.traffic;
        if (data.brandClicks) document.getElementById(`${prefix}BrandClicks`).value = data.brandClicks;
    }

    importCheckArticleCsvFile(file, period) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const csvText = e.target.result;
            const metrics = this.parseArticleMetricsCsv(csvText);
            if (metrics && metrics.length > 0) {
                this.renderCheckArticleMetricsTable(metrics, period);
                alert(`${period === '2weeks' ? '2週間後' : '3週間後'}の記事データ${metrics.length}件をインポートしました`);
            } else {
                alert('CSVデータの形式が正しくありません');
            }
        };
        reader.readAsText(file);
    }

    renderCheckArticleMetricsTable(metrics = [], period) {
        const tbodyId = period === '2weeks' ? 'articleMetrics2weeksBody' : 'articleMetrics3weeksBody';
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        
        if (metrics.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding: 2rem; text-align: center; color: #6b7280;">記事を追加してください</td></tr>';
            return;
        }
        
        tbody.innerHTML = metrics.map((metric, index) => `
            <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 0.75rem;">
                    <input type="text" class="check-article-name-input" data-period="${period}" data-index="${index}" value="${metric.name || ''}" 
                        placeholder="記事名またはURL" 
                        style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.4rem;">
                </td>
                <td style="padding: 0.75rem;">
                    <input type="number" class="check-article-clicks-input" data-period="${period}" data-index="${index}" value="${metric.clicks || ''}" 
                        style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.4rem; text-align: right;">
                </td>
                <td style="padding: 0.75rem;">
                    <input type="number" class="check-article-impressions-input" data-period="${period}" data-index="${index}" value="${metric.impressions || ''}" 
                        style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.4rem; text-align: right;">
                </td>
                <td style="padding: 0.75rem;">
                    <input type="number" step="0.01" class="check-article-ctr-input" data-period="${period}" data-index="${index}" value="${metric.ctr || ''}" 
                        style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.4rem; text-align: right;">
                </td>
                <td style="padding: 0.75rem;">
                    <input type="number" step="0.1" class="check-article-position-input" data-period="${period}" data-index="${index}" value="${metric.position || ''}" 
                        style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.4rem; text-align: right;">
                </td>
                <td style="padding: 0.75rem; text-align: center;">
                    <button type="button" class="remove-check-article-metric-btn" data-period="${period}" data-index="${index}" 
                        style="color: #ef4444; background: none; border: none; cursor: pointer; padding: 0.25rem;">
                        <span class="material-icons-round" style="font-size: 20px;">delete</span>
                    </button>
                </td>
            </tr>
        `).join('');
        
        // 削除ボタンのイベントリスナーを設定
        tbody.querySelectorAll('.remove-check-article-metric-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const period = btn.dataset.period;
                const index = parseInt(btn.dataset.index);
                const currentMetrics = this.getCheckArticleMetricsFromTable(period);
                currentMetrics.splice(index, 1);
                this.renderCheckArticleMetricsTable(currentMetrics, period);
            });
        });
    }

    getCheckArticleMetricsFromTable(period) {
        const tbodyId = period === '2weeks' ? 'articleMetrics2weeksBody' : 'articleMetrics3weeksBody';
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return [];
        
        const metrics = [];
        const rows = tbody.querySelectorAll('tr');
        
        rows.forEach(row => {
            const nameInput = row.querySelector('.check-article-name-input');
            const clicksInput = row.querySelector('.check-article-clicks-input');
            const impressionsInput = row.querySelector('.check-article-impressions-input');
            const ctrInput = row.querySelector('.check-article-ctr-input');
            const positionInput = row.querySelector('.check-article-position-input');
            
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

    saveCheckData() {
        const checkPlanSelect = document.getElementById('checkPlanSelect');
        const planId = checkPlanSelect.value;
        if (!planId) {
            alert('プランを選択してください');
            return;
        }

        const checkData = {
            planId: planId,
            publishDate: document.getElementById('publishDate').value,
            measurement2weeks: document.getElementById('measurement2weeks').value,
            measurement3weeks: document.getElementById('measurement3weeks').value,
            metrics2weeks: {
                aioCitations: parseFloat(document.getElementById('metrics2weeksAioCitations').value) || 0,
                avgRanking: parseFloat(document.getElementById('metrics2weeksAvgRanking').value) || 0,
                traffic: parseFloat(document.getElementById('metrics2weeksTraffic').value) || 0,
                brandClicks: parseFloat(document.getElementById('metrics2weeksBrandClicks').value) || 0
            },
            metrics3weeks: {
                aioCitations: parseFloat(document.getElementById('metrics3weeksAioCitations').value) || 0,
                avgRanking: parseFloat(document.getElementById('metrics3weeksAvgRanking').value) || 0,
                traffic: parseFloat(document.getElementById('metrics3weeksTraffic').value) || 0,
                brandClicks: parseFloat(document.getElementById('metrics3weeksBrandClicks').value) || 0
            },
            articleMetrics2weeks: this.getCheckArticleMetricsFromTable('2weeks'),
            articleMetrics3weeks: this.getCheckArticleMetricsFromTable('3weeks')
        };

        localStorage.setItem(`checkData_${planId}`, JSON.stringify(checkData));
        alert('データを保存しました');
        
        // 結果を表示
        this.renderCheckResults(planId);
    }

    renderCheckResults(planId) {
        const plan = this.plans.find(p => p.id === planId);
        if (!plan) return;

        const checkResultsSection = document.getElementById('checkResultsSection');
        checkResultsSection.style.display = 'block';

        const checkData = localStorage.getItem(`checkData_${planId}`);
        if (!checkData) return;

        const data = JSON.parse(checkData);
        
        // 現状数値
        const current = {
            aioCitations: parseFloat(plan.metrics?.aioCitations) || 0,
            avgRanking: parseFloat(plan.metrics?.avgRanking) || 0,
            traffic: parseFloat(plan.metrics?.traffic) || 0,
            brandClicks: parseFloat(plan.metrics?.brandClicks) || 0
        };

        // 2週間後数値
        const metrics2weeks = data.metrics2weeks || {};
        
        // 3週間後数値
        const metrics3weeks = data.metrics3weeks || {};

        // 比較表を生成
        this.renderMetricsComparisonTable(current, metrics2weeks, metrics3weeks);
        
        // グラフを生成
        this.renderCheckChart(current, metrics2weeks, metrics3weeks);
    }

    renderMetricsComparisonTable(current, metrics2weeks, metrics3weeks) {
        const tbody = document.getElementById('metricsComparisonBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        const metrics = [
            { key: 'aioCitations', label: 'AIO引用数', unit: '' },
            { key: 'avgRanking', label: '検索順位（平均）', unit: '' },
            { key: 'traffic', label: 'トラフィック（クリック数）', unit: '' },
            { key: 'brandClicks', label: 'ブランド認知度', unit: '' }
        ];

        metrics.forEach(metric => {
            const currentValue = current[metric.key] || 0;
            const value2weeks = metrics2weeks[metric.key] || 0;
            const value3weeks = metrics3weeks[metric.key] || 0;
            
            // 変化率を計算（3週間後）
            const changeRate = currentValue !== 0 
                ? ((value3weeks - currentValue) / currentValue * 100).toFixed(1)
                : '0.0';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="padding: 1rem; font-weight: 500;">${metric.label}</td>
                <td style="padding: 1rem; text-align: right;">${currentValue.toLocaleString()}</td>
                <td style="padding: 1rem; text-align: right;">${value2weeks.toLocaleString()}</td>
                <td style="padding: 1rem; text-align: right;">${value3weeks.toLocaleString()}</td>
                <td style="padding: 1rem; text-align: right; color: ${parseFloat(changeRate) >= 0 ? '#10b981' : '#ef4444'};">
                    ${changeRate}%
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    renderCheckChart(current, metrics2weeks, metrics3weeks) {
        // Recordタブではチャートを表示しないため空実装（Reportタブへ移動）
    }

    formatDateTimeLocal(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // ========== Report機能 ==========

    setupReportTab() {
        const reportPlanSelect = document.getElementById('reportPlanSelect');
        const generateReportBtn = document.getElementById('generateReportBtn');
        const exportReportPdfBtn = document.getElementById('exportReportPdfBtn');

        this.updateReportPlanSelect();

        if (reportPlanSelect) {
            reportPlanSelect.addEventListener('change', () => {
                const planId = reportPlanSelect.value;
                if (planId) {
                    const checkData = localStorage.getItem(`checkData_${planId}`);
                    if (checkData) {
                        this.generateReport();
                    } else {
                        const reportContent = document.getElementById('reportContent');
                        if (reportContent) reportContent.style.display = 'none';
                    }
                } else {
                    const reportContent = document.getElementById('reportContent');
                    if (reportContent) reportContent.style.display = 'none';
                }
            });
        }

        if (generateReportBtn) {
            generateReportBtn.addEventListener('click', () => {
                this.generateReport();
            });
        }

        if (exportReportPdfBtn) {
            exportReportPdfBtn.addEventListener('click', () => {
                this.exportReportPdf();
            });
        }
    }

    updateReportPlanSelect() {
        const reportPlanSelect = document.getElementById('reportPlanSelect');
        if (!reportPlanSelect) return;

        reportPlanSelect.innerHTML = '<option value="">プランを選択してください</option>';
        
        this.plans.forEach(plan => {
            const option = document.createElement('option');
            option.value = plan.id;
            option.textContent = plan.name;
            reportPlanSelect.appendChild(option);
        });
    }

    async generateReport() {
        const planSelect = document.getElementById('reportPlanSelect');
        const planId = planSelect?.value;
        if (!planId) {
            alert('プランを選択してください');
            return;
        }

        const reportContent = document.getElementById('reportContent');
        if (reportContent) reportContent.style.display = 'block';

        const plan = this.plans.find(p => p.id === planId);
        const savedData = localStorage.getItem(`checkData_${planId}`);
        const data = savedData ? JSON.parse(savedData) : null;

        await this.generateExecutiveSummary(plan, data);
        this.generateMetricsComparisonTable(plan, data);
        this.generateMetricsCharts(plan, data);
        this.generateArticlePerformance(plan, data);
    }

    async generateExecutiveSummary(plan, data) {
        const container = document.getElementById('executiveSummaryContent');
        if (!container) return;

        let summaryHtml = `
            <p><strong>プラン名:</strong> ${plan.name}</p>
            <p><strong>公開日:</strong> ${data?.publishDate ? new Date(data.publishDate).toLocaleDateString() : '未設定'}</p>
        `;

        if (data && data.metrics3weeks) {
            const currentAio = parseFloat(plan.metrics?.aioCitations) || 0;
            const week3Aio = parseFloat(data.metrics3weeks?.aioCitations) || 0;
            const improvement = week3Aio - currentAio;
            const isImproved = improvement > 0;
            const sign = improvement > 0 ? '+' : '';

            summaryHtml += `
                <div style="margin-top: 1rem;">
                    <h4 style="font-weight: bold; margin-bottom: 0.5rem;">📊 パフォーマンス概要</h4>
                    <p>施策実行から3週間経過し、AIO引用数は <strong>${currentAio}</strong> から <strong>${week3Aio}</strong> へ推移しました (${sign}${improvement})。</p>
                    <p>検索順位（平均）は <strong>${plan.metrics?.avgRanking || '-'}</strong> から <strong>${data.metrics3weeks?.avgRanking || '-'}</strong> となっています。</p>
                    <div style="margin-top: 1rem; padding: 1rem; background: ${isImproved ? '#f0fdf4' : '#fff1f2'}; border-radius: 6px; border: 1px solid ${isImproved ? '#bbf7d0' : '#fecdd3'}; color: ${isImproved ? '#166534' : '#9f1239'};">
                        <strong>🤖 AIインサイト:</strong><br>
                        ${isImproved 
                            ? '施策の効果が表れています。特にAIO引用数の増加は、コンテンツの信頼性が向上したことを示唆しています。今後はこの傾向を維持しつつ、トラフィックの質の向上に注力することをお勧めします。' 
                            : '現時点では大きな改善が見られません。コンテンツの意図が検索クエリと完全に合致していない可能性があります。競合記事との差分分析を再度行い、リライト方針を見直すことを検討してください。'}
                    </div>
                </div>
            `;
        } else {
            summaryHtml += '<p>十分なデータが記録されていません。Recordタブで3週間後の数値を入力してください。</p>';
        }

        container.innerHTML = summaryHtml;
    }

    generateMetricsComparisonTable(plan, data) {
        const container = document.getElementById('metricsComparisonTable');
        if (!container) return;

        const current = {
            aioCitations: parseFloat(plan.metrics?.aioCitations) || 0,
            avgRanking: parseFloat(plan.metrics?.avgRanking) || 0,
            traffic: parseFloat(plan.metrics?.traffic) || 0,
            brandClicks: parseFloat(plan.metrics?.brandClicks) || 0
        };

        const w2 = data?.metrics2weeks || {};
        const w3 = data?.metrics3weeks || {};

        const metrics = [
            { key: 'aioCitations', label: 'AIO引用数' },
            { key: 'avgRanking', label: '検索順位（平均）', reverse: true },
            { key: 'traffic', label: 'トラフィック' },
            { key: 'brandClicks', label: 'ブランド認知度' }
        ];

        let html = `
            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <thead>
                    <tr style="background: #f3f4f6;">
                        <th style="padding: 1rem; text-align: left;">指標</th>
                        <th style="padding: 1rem; text-align: right;">Before (現状)</th>
                        <th style="padding: 1rem; text-align: right;">After (2週間後)</th>
                        <th style="padding: 1rem; text-align: right;">After (3週間後)</th>
                        <th style="padding: 1rem; text-align: right;">変化率</th>
                    </tr>
                </thead>
                <tbody>
        `;

        metrics.forEach(m => {
            const v1 = current[m.key];
            const v2 = parseFloat(w2[m.key]) || 0;
            const v3 = parseFloat(w3[m.key]) || 0;
            
            let changeRate = 0;
            if (v1 !== 0 && v3 !== 0) {
                changeRate = ((v3 - v1) / v1) * 100;
            }
            
            const isPositive = m.reverse ? (v3 < v1 && v3 > 0) : (v3 > v1);
            const isNeutral = v3 === 0 || v1 === 0;
            
            const colorStyle = isPositive ? 'color: #16a34a;' : (v3 === v1 ? 'color: #4b5563;' : 'color: #dc2626;');

            html += `
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 1rem; font-weight: 500;">${m.label}</td>
                    <td style="padding: 1rem; text-align: right;">${v1}</td>
                    <td style="padding: 1rem; text-align: right;">${v2 || '-'}</td>
                    <td style="padding: 1rem; text-align: right;">${v3 || '-'}</td>
                    <td style="padding: 1rem; text-align: right; font-weight: bold; ${colorStyle}">
                        ${isNeutral ? '-' : Math.abs(changeRate).toFixed(1) + '%'}
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    generateMetricsCharts(plan, data) {
        if (typeof Chart === 'undefined') return;

        const current = {
            aioCitations: parseFloat(plan.metrics?.aioCitations) || 0,
            avgRanking: parseFloat(plan.metrics?.avgRanking) || 0,
            traffic: parseFloat(plan.metrics?.traffic) || 0,
            brandClicks: parseFloat(plan.metrics?.brandClicks) || 0
        };
        const w2 = data?.metrics2weeks || {};
        const w3 = data?.metrics3weeks || {};

        const labels = ['Before', '2週間後', '3週間後'];
        
        const createChart = (canvasId, label, key, color) => {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            
            const existingChart = Chart.getChart(canvas);
            if (existingChart) existingChart.destroy();

            new Chart(canvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: label,
                        data: [current[key], parseFloat(w2[key]) || null, parseFloat(w3[key]) || null],
                        borderColor: color,
                        backgroundColor: color.replace('1)', '0.1)'),
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: label }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        };

        createChart('aioChart', 'AIO引用数', 'aioCitations', 'rgba(59, 130, 246, 1)');
        createChart('rankingChart', '検索順位 (低いほど良い)', 'avgRanking', 'rgba(16, 185, 129, 1)');
        createChart('trafficChart', 'トラフィック', 'traffic', 'rgba(245, 158, 11, 1)');
        createChart('brandChart', 'ブランド認知', 'brandClicks', 'rgba(139, 92, 246, 1)');
    }

    generateArticlePerformance(plan, data) {
        const container = document.getElementById('articlePerformanceTable');
        if (!container) return;

        const articles = data?.articleMetrics3weeks?.length > 0 ? data.articleMetrics3weeks : (data?.articleMetrics2weeks || []);
        
        if (articles.length === 0) {
            container.innerHTML = '<p style="padding: 1rem; color: #6b7280;">記事ごとの詳細データがありません。</p>';
            return;
        }

        let html = `
            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
                <thead>
                    <tr style="background: #f3f4f6;">
                        <th style="padding: 0.75rem; text-align: left;">記事名/URL</th>
                        <th style="padding: 0.75rem; text-align: right;">クリック数</th>
                        <th style="padding: 0.75rem; text-align: right;">表示回数</th>
                        <th style="padding: 0.75rem; text-align: right;">CTR</th>
                        <th style="padding: 0.75rem; text-align: right;">順位</th>
                    </tr>
                </thead>
                <tbody>
        `;

        articles.forEach(a => {
            html += `
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 0.75rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${a.name}">${a.name || '-'}</td>
                    <td style="padding: 0.75rem; text-align: right;">${a.clicks || 0}</td>
                    <td style="padding: 0.75rem; text-align: right;">${a.impressions || 0}</td>
                    <td style="padding: 0.75rem; text-align: right;">${a.ctr || 0}%</td>
                    <td style="padding: 0.75rem; text-align: right;">${a.position || 0}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    exportReportPdf() {
        if (typeof html2pdf === 'undefined') {
            alert('PDF出力機能の読み込みに失敗しました。ページをリロードしてください。');
            return;
        }

        const element = document.getElementById('reportTab');
        const generateBtn = document.getElementById('generateReportBtn');
        const exportBtn = document.getElementById('exportReportPdfBtn');
        const planSelect = document.querySelector('.form-group');

        if (generateBtn) generateBtn.style.display = 'none';
        if (exportBtn) exportBtn.style.display = 'none';
        if (planSelect) planSelect.style.display = 'none';

        const opt = {
            margin: 10,
            filename: 'aio_report.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(element).save().then(() => {
            if (generateBtn) generateBtn.style.display = 'block';
            if (exportBtn) exportBtn.style.display = 'inline-block';
            if (planSelect) planSelect.style.display = 'block';
        }).catch(err => {
            console.error('PDF出力エラー:', err);
            alert('PDFの出力に失敗しました。');
            if (generateBtn) generateBtn.style.display = 'block';
            if (exportBtn) exportBtn.style.display = 'inline-block';
            if (planSelect) planSelect.style.display = 'block';
        });
    }
}

// グローバルインスタンス
let dashboardSystem;

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
    dashboardSystem = new Dashboard();
});
