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
        const addUrlBtn = document.getElementById('addUrlBtn');
        const cancelPlanBtn = document.getElementById('cancelPlanBtn');
        const importCsvBtn = document.getElementById('importCsvBtn');
        const exportCsvTemplateBtn = document.getElementById('exportCsvTemplateBtn');
        const csvFileInput = document.getElementById('csvFileInput');

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

        if (addUrlBtn) {
            addUrlBtn.addEventListener('click', () => {
                this.addUrlInput();
            });
        }

        if (planForm) {
            planForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.savePlan();
            });
        }
        
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
        
        if (exportCsvTemplateBtn) {
            exportCsvTemplateBtn.addEventListener('click', () => {
                this.exportCsvTemplate();
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
        const urlContainer = document.getElementById('articleUrlsContainer');
        if (urlContainer) {
            urlContainer.innerHTML = '';
        }
        
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
            // URL入力欄を1つ追加
            this.addUrlInput();
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
        
        const urlContainer = document.getElementById('articleUrlsContainer');
        if (urlContainer) {
            urlContainer.innerHTML = '';
            if (plan.articleUrls && plan.articleUrls.length > 0) {
                plan.articleUrls.forEach(url => this.addUrlInput(url));
            } else {
                this.addUrlInput();
            }
        }
    }

    async savePlan() {
        const form = document.getElementById('planForm');
        if (!form) return;
        
        const planId = form.dataset.planId;
        
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
            articleUrls: Array.from(document.querySelectorAll('.article-url-input'))
                .map(input => input.value)
                .filter(url => url.trim() !== ''),
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
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin: 1rem 0; padding: 1rem; background: #f9fafb; border-radius: 0.5rem;">
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
        if (!this.baselineData) return;

        // AIO引用数
        const aioCount = this.baselineData.metrics?.aioCitations || 0;
        const aioEl = document.getElementById('aioCitationCount');
        if (aioEl) aioEl.textContent = aioCount.toLocaleString();
        
        // 検索順位
        const avgPosition = this.baselineData.metrics?.avgRanking || 0;
        const rankEl = document.getElementById('searchRankingAvg');
        if (rankEl) rankEl.textContent = avgPosition.toFixed(2);
        
        // トラフィック
        const trafficClicks = this.baselineData.metrics?.traffic || 0;
        const trafficEl = document.getElementById('trafficClicks');
        if (trafficEl) trafficEl.textContent = trafficClicks.toLocaleString();
        
        // ブランド認知度
        const brandClicks = this.baselineData.metrics?.brandClicks || 0;
        const brandEl = document.getElementById('brandClicks');
        if (brandEl) brandEl.textContent = brandClicks.toLocaleString();

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
