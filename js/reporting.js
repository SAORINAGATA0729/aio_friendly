/**
 * レポーティング機能
 * 効果測定結果の表示、レポート生成、PDF出力
 */

class ReportingSystem {
    constructor() {
        this.baselineData = null;
        this.progressData = null;
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
    }

    async loadData() {
        try {
            this.baselineData = await dataManager.loadBaseline();
            this.progressData = await dataManager.loadProgress();
        } catch (error) {
            console.error('データ読み込みエラー:', error);
        }
    }

    setupEventListeners() {
        const generateBtn = document.getElementById('generateReportBtn');
        const exportPdfBtn = document.getElementById('exportPdfBtn');

        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                this.generateReport();
            });
        }

        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => {
                this.exportToPDF();
            });
        }
    }

    async renderResults() {
        if (!this.baselineData || !this.progressData) {
            await this.loadData();
        }

        const resultsContainer = document.getElementById('resultsSummary');
        if (!resultsContainer) return;

        // 改修完了記事のスコアを集計
        const completedArticles = this.progressData.articles.filter(a => a.status === '完了');
        const avgScoreBefore = this.calculateAverageScore(completedArticles, 'before');
        const avgScoreAfter = this.calculateAverageScore(completedArticles, 'after');

        // モニタリングデータを取得
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const latestMonitoring = await dataManager.loadMonitoring(currentYear, currentMonth);

        resultsContainer.innerHTML = `
            <div class="results-grid">
                <div class="result-card">
                    <h4>改修完了記事数</h4>
                    <div class="result-value">${completedArticles.length}本</div>
                    <div class="result-label">/ 20本</div>
                </div>
                <div class="result-card">
                    <h4>平均スコア改善</h4>
                    <div class="result-value">${avgScoreBefore.total.toFixed(1)} → ${avgScoreAfter.total.toFixed(1)}</div>
                    <div class="result-change positive">+${(avgScoreAfter.total - avgScoreBefore.total).toFixed(1)}点</div>
                </div>
                <div class="result-card">
                    <h4>AIO引用数</h4>
                    <div class="result-value">${this.baselineData.aioCitations?.googleAIOverview?.count || 0}件</div>
                    ${latestMonitoring ? `
                        <div class="result-change ${latestMonitoring.aioCitations?.googleAIOverview > this.baselineData.aioCitations?.googleAIOverview?.count ? 'positive' : 'negative'}">
                            ${latestMonitoring.aioCitations?.googleAIOverview > this.baselineData.aioCitations?.googleAIOverview?.count ? '+' : ''}
                            ${(latestMonitoring.aioCitations?.googleAIOverview - (this.baselineData.aioCitations?.googleAIOverview?.count || 0))}件
                        </div>
                    ` : '<div class="result-label">データ未記録</div>'}
                </div>
                <div class="result-card">
                    <h4>検索順位改善</h4>
                    <div class="result-value">${this.baselineData.searchRanking?.tier1Pages?.averagePosition?.toFixed(2) || 0}位</div>
                    ${latestMonitoring ? `
                        <div class="result-change ${latestMonitoring.searchRanking?.averagePosition < this.baselineData.searchRanking?.tier1Pages?.averagePosition ? 'positive' : 'negative'}">
                            ${latestMonitoring.searchRanking?.averagePosition < this.baselineData.searchRanking?.tier1Pages?.averagePosition ? '-' : '+'}
                            ${Math.abs((latestMonitoring.searchRanking?.averagePosition || 0) - (this.baselineData.searchRanking?.tier1Pages?.averagePosition || 0)).toFixed(2)}位
                        </div>
                    ` : '<div class="result-label">データ未記録</div>'}
                </div>
            </div>
        `;
    }

    calculateAverageScore(articles, type) {
        if (articles.length === 0) {
            return { structure: 0, content: 0, primary: 0, keyword: 0, total: 0 };
        }

        const sum = articles.reduce((acc, article) => {
            const score = article.scores?.[type] || { structure: 0, content: 0, primary: 0, keyword: 0, total: 0 };
            return {
                structure: acc.structure + score.structure,
                content: acc.content + score.content,
                primary: acc.primary + score.primary,
                keyword: acc.keyword + score.keyword,
                total: acc.total + score.total
            };
        }, { structure: 0, content: 0, primary: 0, keyword: 0, total: 0 });

        return {
            structure: sum.structure / articles.length,
            content: sum.content / articles.length,
            primary: sum.primary / articles.length,
            keyword: sum.keyword / articles.length,
            total: sum.total / articles.length
        };
    }

    async generateReport() {
        if (!this.baselineData || !this.progressData) {
            await this.loadData();
        }

        const reportWindow = window.open('', '_blank');
        const reportHTML = this.createReportHTML();
        reportWindow.document.write(reportHTML);
        reportWindow.document.close();
    }

    createReportHTML() {
        const completedArticles = this.progressData.articles.filter(a => a.status === '完了');
        const avgScoreBefore = this.calculateAverageScore(completedArticles, 'before');
        const avgScoreAfter = this.calculateAverageScore(completedArticles, 'after');

        return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AIO対策 効果測定レポート</title>
    <style>
        body {
            font-family: 'Noto Sans JP', sans-serif;
            padding: 40px;
            line-height: 1.6;
            color: #212121;
        }
        h1 {
            color: #2196f3;
            border-bottom: 3px solid #2196f3;
            padding-bottom: 10px;
        }
        h2 {
            color: #1976d2;
            margin-top: 30px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #e0e0e0;
            padding: 12px;
            text-align: left;
        }
        th {
            background-color: #f5f5f5;
            font-weight: 600;
        }
        .metric-card {
            background: #f9f9f9;
            border-left: 4px solid #2196f3;
            padding: 15px;
            margin: 15px 0;
        }
        .positive {
            color: #4caf50;
            font-weight: 600;
        }
        .negative {
            color: #f44336;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <h1>AIO対策 効果測定レポート</h1>
    <p>作成日: ${new Date().toLocaleDateString('ja-JP')}</p>

    <h2>1. 改修進捗</h2>
    <table>
        <tr>
            <th>ステータス</th>
            <th>件数</th>
            <th>進捗率</th>
        </tr>
        <tr>
            <td>完了</td>
            <td>${this.progressData.summary?.completed || 0}本</td>
            <td>${((this.progressData.summary?.completed || 0) / 20 * 100).toFixed(1)}%</td>
        </tr>
        <tr>
            <td>進行中</td>
            <td>${this.progressData.summary?.inProgress || 0}本</td>
            <td>-</td>
        </tr>
        <tr>
            <td>未着手</td>
            <td>${this.progressData.summary?.notStarted || 0}本</td>
            <td>-</td>
        </tr>
    </table>

    <h2>2. スコア改善状況</h2>
    <table>
        <tr>
            <th>カテゴリー</th>
            <th>改修前</th>
            <th>改修後</th>
            <th>改善</th>
        </tr>
        <tr>
            <td>記事構造</td>
            <td>${avgScoreBefore.structure.toFixed(1)}点</td>
            <td>${avgScoreAfter.structure.toFixed(1)}点</td>
            <td class="${avgScoreAfter.structure > avgScoreBefore.structure ? 'positive' : ''}">
                ${avgScoreAfter.structure > avgScoreBefore.structure ? '+' : ''}${(avgScoreAfter.structure - avgScoreBefore.structure).toFixed(1)}点
            </td>
        </tr>
        <tr>
            <td>コンテンツ形式</td>
            <td>${avgScoreBefore.content.toFixed(1)}点</td>
            <td>${avgScoreAfter.content.toFixed(1)}点</td>
            <td class="${avgScoreAfter.content > avgScoreBefore.content ? 'positive' : ''}">
                ${avgScoreAfter.content > avgScoreBefore.content ? '+' : ''}${(avgScoreAfter.content - avgScoreBefore.content).toFixed(1)}点
            </td>
        </tr>
        <tr>
            <td>一次情報</td>
            <td>${avgScoreBefore.primary.toFixed(1)}点</td>
            <td>${avgScoreAfter.primary.toFixed(1)}点</td>
            <td class="${avgScoreAfter.primary > avgScoreBefore.primary ? 'positive' : ''}">
                ${avgScoreAfter.primary > avgScoreBefore.primary ? '+' : ''}${(avgScoreAfter.primary - avgScoreBefore.primary).toFixed(1)}点
            </td>
        </tr>
        <tr>
            <td>キーワード配置</td>
            <td>${avgScoreBefore.keyword.toFixed(1)}点</td>
            <td>${avgScoreAfter.keyword.toFixed(1)}点</td>
            <td class="${avgScoreAfter.keyword > avgScoreBefore.keyword ? 'positive' : ''}">
                ${avgScoreAfter.keyword > avgScoreBefore.keyword ? '+' : ''}${(avgScoreAfter.keyword - avgScoreBefore.keyword).toFixed(1)}点
            </td>
        </tr>
        <tr>
            <td><strong>合計</strong></td>
            <td><strong>${avgScoreBefore.total.toFixed(1)}点</strong></td>
            <td><strong>${avgScoreAfter.total.toFixed(1)}点</strong></td>
            <td class="${avgScoreAfter.total > avgScoreBefore.total ? 'positive' : ''}">
                <strong>${avgScoreAfter.total > avgScoreBefore.total ? '+' : ''}${(avgScoreAfter.total - avgScoreBefore.total).toFixed(1)}点</strong>
            </td>
        </tr>
    </table>

    <h2>3. 改修完了記事一覧</h2>
    <table>
        <tr>
            <th>記事タイトル</th>
            <th>改修前スコア</th>
            <th>改修後スコア</th>
            <th>改善</th>
        </tr>
        ${completedArticles.map(article => {
            const before = article.scores?.before || { total: 0 };
            const after = article.scores?.after || { total: 0 };
            return `
                <tr>
                    <td>${article.title}</td>
                    <td>${before.total}点</td>
                    <td>${after.total}点</td>
                    <td class="${after.total > before.total ? 'positive' : ''}">
                        ${after.total > before.total ? '+' : ''}${(after.total - before.total)}点
                    </td>
                </tr>
            `;
        }).join('')}
    </table>

    <h2>4. 次回への改善提案</h2>
    <div class="metric-card">
        <p>改修完了記事の分析結果に基づき、以下の改善を提案します：</p>
        <ul>
            <li>表の活用率を向上させる（現在の達成率を確認し、比較情報を表形式で提示）</li>
            <li>メインキーワードの冒頭配置を徹底する</li>
            <li>見出し構造の最適化を進める（H2を3個以上確保）</li>
        </ul>
    </div>
</body>
</html>
        `;
    }

    async exportToPDF() {
        // html2pdf.jsを使用してPDF出力
        if (typeof html2pdf === 'undefined') {
            alert('PDF出力機能を使用するには、html2pdf.jsを読み込んでください。\n現在はHTMLレポートを生成します。');
            this.generateReport();
            return;
        }

        const reportHTML = this.createReportHTML();
        const reportDiv = document.createElement('div');
        reportDiv.innerHTML = reportHTML;
        reportDiv.style.position = 'absolute';
        reportDiv.style.left = '-9999px';
        reportDiv.style.width = '210mm'; // A4幅
        document.body.appendChild(reportDiv);

        const opt = {
            margin: [10, 10, 10, 10],
            filename: `AIO対策_効果測定レポート_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2,
                useCORS: true,
                logging: false
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'a4', 
                orientation: 'portrait' 
            }
        };

        try {
            await html2pdf().set(opt).from(reportDiv).save();
            document.body.removeChild(reportDiv);
        } catch (error) {
            console.error('PDF出力エラー:', error);
            alert('PDF出力中にエラーが発生しました。HTMLレポートを生成します。');
            document.body.removeChild(reportDiv);
            this.generateReport();
        }
    }
}

// グローバルインスタンスは index.html で作成

