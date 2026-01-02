/**
 * モニタリング機能
 * データ入力、前後比較、グラフ表示
 */

class MonitoringSystem {
    constructor() {
        this.baselineData = null;
        this.monitoringData = null;
        this.comparisonChart = null;
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupForm();
    }

    async loadData() {
        try {
            this.baselineData = await dataManager.loadBaseline();
        } catch (error) {
            console.error('ベースラインデータ読み込みエラー:', error);
        }
    }

    setupForm() {
        const form = document.getElementById('monitoringForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveMonitoringData();
            });
        }
    }

    async saveMonitoringData() {
        const monthInput = document.getElementById('monitoringMonth');
        const [year, month] = monthInput.value.split('-').map(Number);

        const data = {
            year,
            month,
            recordedDate: new Date().toISOString().split('T')[0],
            aioCitations: {
                googleAIOverview: parseInt(document.querySelector('[data-metric="aio_google"]').value) || 0,
                chatGPT: parseInt(document.querySelector('[data-metric="aio_chatgpt"]').value) || 0,
                perplexity: parseInt(document.querySelector('[data-metric="aio_perplexity"]').value) || 0
            },
            searchRanking: {
                totalClicks: parseInt(document.querySelector('[data-metric="ranking_clicks"]').value) || 0,
                averagePosition: parseFloat(document.querySelector('[data-metric="ranking_position"]').value) || 0
            },
            traffic: {
                totalClicks: parseInt(document.querySelector('[data-metric="traffic_clicks"]').value) || 0,
                averageCTR: parseFloat(document.querySelector('[data-metric="traffic_ctr"]').value) || 0
            },
            brandRecognition: {
                totalClicks: parseInt(document.querySelector('[data-metric="brand_clicks"]').value) || 0,
                averagePosition: parseFloat(document.querySelector('[data-metric="brand_position"]').value) || 0
            }
        };

        await dataManager.saveMonitoring(year, month, data);
        alert('モニタリングデータを保存しました。');
        
        // グラフを更新
        this.renderComparisonChart();
    }

    async renderComparisonChart() {
        if (!this.baselineData) {
            await this.loadData();
        }

        const ctx = document.getElementById('comparisonChart');
        if (!ctx) return;

        // 既存のチャートを破棄
        if (this.comparisonChart) {
            this.comparisonChart.destroy();
        }

        // 最新のモニタリングデータを取得
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        
        // 過去3ヶ月分のデータを取得
        const months = [];
        const aioData = [];
        const rankingData = [];
        const trafficData = [];

        for (let i = 2; i >= 0; i--) {
            const date = new Date(currentYear, currentMonth - i - 1, 1);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            months.push(`${year}年${month}月`);

            const monitoring = await dataManager.loadMonitoring(year, month);
            if (monitoring) {
                aioData.push(monitoring.aioCitations?.googleAIOverview || 0);
                rankingData.push(monitoring.searchRanking?.averagePosition || 0);
                trafficData.push(monitoring.traffic?.totalClicks || 0);
            } else {
                // ベースラインデータを使用
                if (i === 2) {
                    aioData.push(this.baselineData.aioCitations?.googleAIOverview?.count || 0);
                    rankingData.push(this.baselineData.searchRanking?.tier1Pages?.averagePosition || 0);
                    trafficData.push(this.baselineData.traffic?.totalClicks || 0);
                } else {
                    aioData.push(0);
                    rankingData.push(0);
                    trafficData.push(0);
                }
            }
        }

        this.comparisonChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'AIO引用数',
                        data: aioData,
                        borderColor: '#2196f3',
                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                        yAxisID: 'y'
                    },
                    {
                        label: '平均検索順位',
                        data: rankingData,
                        borderColor: '#4caf50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        yAxisID: 'y1'
                    },
                    {
                        label: 'トラフィック（クリック数）',
                        data: trafficData,
                        borderColor: '#ff9800',
                        backgroundColor: 'rgba(255, 152, 0, 0.1)',
                        yAxisID: 'y2'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'AIO引用数'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: '平均検索順位'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    },
                    y2: {
                        type: 'linear',
                        display: false
                    }
                }
            }
        });
    }

    calculateChange(current, baseline) {
        if (!baseline || baseline === 0) return { value: 0, percentage: 0 };
        const change = current - baseline;
        const percentage = ((change / baseline) * 100).toFixed(1);
        return { value: change, percentage };
    }
}

// グローバルインスタンス
let monitoringSystem;

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
    monitoringSystem = new MonitoringSystem();
});

