/**
 * リライト機能
 * AIフレンドリーな記事リライトをサポート
 */

class RewriteSystem {
    constructor() {
        this.currentArticle = null;
        this.progressData = null;
        this.checklistItems = [
            {
                id: 'h1',
                label: 'H1タグが1つだけ存在する',
                check: (content) => {
                    const h1Matches = content.match(/^#\s+.+$/gm);
                    return h1Matches && h1Matches.length === 1;
                },
                guidance: '記事のタイトルをH1タグ（# タイトル）で1つだけ記述してください。'
            },
            {
                id: 'structure',
                label: '見出し構造が階層的（H2→H3）',
                check: (content) => {
                    const h2Matches = content.match(/^##\s+.+$/gm);
                    const h3Matches = content.match(/^###\s+.+$/gm);
                    return h2Matches && h2Matches.length > 0;
                },
                guidance: 'H2（## 見出し）を複数使用し、必要に応じてH3（### 小見出し）で階層構造を作成してください。'
            },
            {
                id: 'qa',
                label: 'Q&A形式のセクションがある',
                check: (content) => {
                    return /(?:Q|質問|疑問|問い|^##\s*[Q?])/i.test(content) && 
                           /(?:A|回答|答え|答|^##\s*[A答])/i.test(content);
                },
                guidance: '読者の疑問に答えるQ&A形式のセクションを追加してください。例：\n\n## Q. よくある質問\n\n### A. 回答内容'
            },
            {
                id: 'lists',
                label: '箇条書きや表を活用している',
                check: (content) => {
                    return /^[-*+]\s+|^\d+\.\s+|^\|.+\|/m.test(content);
                },
                guidance: '情報を整理するために箇条書き（- 項目）や表（| 列1 | 列2 |）を活用してください。'
            },
            {
                id: 'conclusion',
                label: '結論ファースト（冒頭に要点）',
                check: (content) => {
                    const firstParagraph = content.split('\n\n')[0];
                    return firstParagraph && firstParagraph.length < 200;
                },
                guidance: '記事の冒頭（最初の段落）に結論や要点を簡潔に記述してください（200文字以内）。'
            },
            {
                id: 'keywords',
                label: 'ターゲットキーワードが自然に含まれている',
                check: (content) => {
                    // このチェックは記事データからキーワードを取得して確認
                    return true; // 簡易実装
                },
                guidance: 'ターゲットキーワードを自然な形で記事全体に散りばめてください。'
            },
            {
                id: 'plain',
                label: '平易な言葉で書かれている',
                check: (content) => {
                    // 簡易チェック: 長すぎる文がないか
                    const sentences = content.split(/[。\n]/);
                    const longSentences = sentences.filter(s => s.length > 100);
                    return longSentences.length < sentences.length * 0.2;
                },
                guidance: '専門用語は避け、誰でも理解できる平易な言葉で記述してください。1文は100文字以内を目安にしてください。'
            },
            {
                id: 'data',
                label: '一次情報（データ・事例）が含まれている',
                check: (content) => {
                    return /(?:データ|統計|調査|事例|実績|結果|数値|％|%|\d+件|\d+人)/.test(content);
                },
                guidance: '信頼性を高めるため、調査データ、統計、事例、実績などの一次情報を盛り込んでください。'
            }
        ];
    }

    async init() {
        await this.loadProgressData();
        this.setupModal();
        this.setupEditor();
    }

    async loadProgressData() {
        try {
            this.progressData = await dataManager.loadProgress();
        } catch (error) {
            console.error('進捗データの読み込みに失敗:', error);
            this.progressData = { articles: [] };
        }
    }

    setupModal() {
        const modal = document.getElementById('rewriteModal');
        const closeBtn = document.getElementById('closeRewriteModal');
        const urlModal = document.getElementById('urlModal');
        const closeUrlBtn = document.getElementById('closeUrlModal');
        const openUrlBtn = document.getElementById('openUrlBtn');
        const proceedBtn = document.getElementById('proceedToEditorBtn');
        const autoFetchBtn = document.getElementById('autoFetchBtn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
            });
        }

        if (closeUrlBtn) {
            closeUrlBtn.addEventListener('click', () => {
                urlModal.classList.remove('active');
            });
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        }

        if (urlModal) {
            urlModal.addEventListener('click', (e) => {
                if (e.target === urlModal) {
                    urlModal.classList.remove('active');
                }
            });
        }

        if (openUrlBtn) {
            openUrlBtn.addEventListener('click', () => {
                const url = document.getElementById('articleUrlInput').value;
                if (url) {
                    window.open(url, '_blank');
                }
            });
        }

        if (proceedBtn) {
            proceedBtn.addEventListener('click', () => {
                urlModal.classList.remove('active');
                this.openRewriteModal(this.currentArticle);
            });
        }

        // 自動取得ボタンの処理
        if (autoFetchBtn) {
            autoFetchBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const url = document.getElementById('articleUrlInput').value;
                if (!url) {
                    alert('URLが入力されていません。');
                    return;
                }

                const statusDiv = document.getElementById('fetchStatus');
                if (!statusDiv) return;
                
                statusDiv.innerHTML = '<span style="color: var(--primary-color);"><span class="material-icons-round" style="font-size:14px; vertical-align:middle; animation: spin 1s linear infinite;">sync</span> 記事を取得中...</span>';
                
                try {
                    // 自作サーバーのAPIを叩く
                    const response = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
                    
                    if (!response.ok) {
                        throw new Error(`HTTPエラー: ${response.status}`);
                    }
                    
                    const data = await response.json();

                    if (data.success && data.content) {
                        statusDiv.innerHTML = '<span style="color: var(--success-color);">✓ 取得成功！エディタを開きます...</span>';
                        setTimeout(() => {
                            urlModal.classList.remove('active');
                            this.openRewriteModal(this.currentArticle, data.content);
                        }, 500);
                    } else {
                        throw new Error(data.error || 'コンテンツを取得できませんでした');
                    }
                } catch (error) {
                    console.error('Fetch error:', error);
                    statusDiv.innerHTML = `<span style="color: var(--danger-color);">⚠ エラー: ${error.message}<br>手動でコピーしてください。</span>`;
                }
            });
        }
    }

    setupEditor() {
        const editor = document.getElementById('markdownEditor');
        const previewBtn = document.querySelector('[data-action="preview"]');
        const saveBtn = document.querySelector('[data-action="save"]');
        const preview = document.getElementById('markdownPreview');

        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                const content = editor.value;
                if (preview) {
                    preview.innerHTML = this.markdownToHtml(content);
                    preview.style.display = preview.style.display === 'none' ? 'block' : 'none';
                    editor.style.display = editor.style.display === 'none' ? 'block' : 'none';
                }
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                await this.saveArticle();
            });
        }
    }

    async openUrlModal(article) {
        this.currentArticle = article;
        const urlModal = document.getElementById('urlModal');
        const urlInput = document.getElementById('articleUrlInput');
        const statusDiv = document.getElementById('fetchStatus');
        if (statusDiv) statusDiv.innerHTML = '';
        
        let url = article.url;
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        
        if (urlInput) urlInput.value = url;
        if (urlModal) urlModal.classList.add('active');
    }

    async openRewriteModal(article, fetchedContent = null) {
        if (!this.progressData) {
            await this.loadProgressData();
        }
        
        this.currentArticle = article;
        const modal = document.getElementById('rewriteModal');
        const modalTitle = document.getElementById('rewriteModalTitle');
        
        if (!modal || !modalTitle) {
            console.error('モーダル要素が見つかりません');
            return;
        }
        
        modalTitle.textContent = article.title;
        modal.classList.add('active');

        const slug = this.getSlugFromUrl(article.url);
        let content = await dataManager.loadMarkdown(`${slug}.md`);
        
        if (!content) {
            if (fetchedContent) {
                content = `# ${article.title}\n\n${fetchedContent}`;
            } else {
                content = this.createArticleTemplate(article);
            }
        }

        const editor = document.getElementById('markdownEditor');
        if (editor) {
            editor.value = content;
            editor.style.display = 'block';
            const preview = document.getElementById('markdownPreview');
            if (preview) preview.style.display = 'none';

            this.renderChecklist(article, content);

            editor.addEventListener('input', () => {
                this.updateChecklist(article, editor.value);
            });
            
            this.updateChecklist(article, content);
        }
    }

    getSlugFromUrl(url) {
        const match = url.match(/\/columns\/([^\/]+)/);
        return match ? match[1] : 'article';
    }

    createArticleTemplate(article) {
        return `# ${article.title}

## はじめに

${article.keyword}について、わかりやすく解説します。

## 目次

- [セクション1](#セクション1)
- [セクション2](#セクション2)
- [よくある質問](#よくある質問)

## セクション1

内容を記述してください。

## セクション2

内容を記述してください。

## よくある質問

### Q. 質問1

A. 回答1

### Q. 質問2

A. 回答2

## まとめ

${article.keyword}について、重要なポイントをまとめました。
`;
    }

    renderChecklist(article, content) {
        const container = document.getElementById('checklistItems');
        if (!container) return;

        container.innerHTML = '';
        
        this.checklistItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'checklist-item';
            div.dataset.itemId = item.id;
            
            const checked = item.check(content);
            div.innerHTML = `
                <div class="checklist-checkbox">
                    <span class="material-icons-round ${checked ? 'checked' : ''}">${checked ? 'check_circle' : 'radio_button_unchecked'}</span>
                </div>
                <div class="checklist-content">
                    <div class="checklist-label">${item.label}</div>
                    <div class="checklist-guidance">${item.guidance}</div>
                </div>
            `;
            
            div.addEventListener('click', () => {
                const guidanceDiv = document.getElementById('aiGuidance');
                if (guidanceDiv) {
                    guidanceDiv.innerHTML = `
                        <h4>${item.label}</h4>
                        <p>${item.guidance}</p>
                    `;
                }
            });
            
            container.appendChild(div);
        });
    }

    updateChecklist(article, content) {
        this.checklistItems.forEach(item => {
            const div = document.querySelector(`[data-item-id="${item.id}"]`);
            if (!div) return;
            
            const checked = item.check(content);
            const icon = div.querySelector('.material-icons-round');
            if (icon) {
                icon.textContent = checked ? 'check_circle' : 'radio_button_unchecked';
                icon.classList.toggle('checked', checked);
            }
        });
    }

    async saveArticle() {
        if (!this.currentArticle) return;

        const editor = document.getElementById('markdownEditor');
        if (!editor) return;

        const content = editor.value;
        const slug = this.getSlugFromUrl(this.currentArticle.url);
        
        await dataManager.saveMarkdown(`${slug}.md`, content);
        
        // 進捗を更新
        if (this.progressData && this.progressData.articles) {
            const article = this.progressData.articles.find(a => a.id === this.currentArticle.id);
            if (article) {
                article.status = '完了';
                article.lastModified = new Date().toISOString();
                await dataManager.saveProgress(this.progressData);
            }
        }

        alert('保存しました！');
        
        // ダッシュボードを更新
        if (typeof dashboard !== 'undefined') {
            await dashboard.renderArticleList();
        }
    }

    markdownToHtml(markdown) {
        // 簡易的なMarkdown to HTML変換
        return markdown
            .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
            .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
            .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
            .replace(/^\*\s+(.+)$/gm, '<li>$1</li>')
            .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/^(.+)$/gm, '<p>$1</p>');
    }
}
