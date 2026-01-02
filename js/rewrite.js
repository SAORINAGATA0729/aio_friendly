/**
 * リライト機能
 * AIフレンドリーな記事リライトをサポート
 */

class RewriteSystem {
    constructor() {
        this.currentArticle = null;
        this.progressData = null;
        this.quill = null; // Quillエディタインスタンス
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
        // Quillエディタを初期化（画像のALTタグ対応）
        const editorContainer = document.getElementById('quillEditor');
        if (editorContainer && typeof Quill !== 'undefined') {
            // カスタム画像ハンドラー（ALTタグ対応）
            const Image = Quill.import('formats/image');
            Image.sanitize = function(url) {
                return url;
            };
            
            this.quill = new Quill('#quillEditor', {
                theme: 'snow',
                modules: {
                    toolbar: {
                        container: [
                            [{ 'header': [1, 2, 3, 4, false] }],
                            ['bold', 'italic', 'underline', 'strike'],
                            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                            [{ 'color': [] }, { 'background': [] }],
                            ['link', 'image'],
                            ['blockquote', 'code-block'],
                            ['clean']
                        ],
                        handlers: {
                            'image': () => {
                                this.handleImageUpload();
                            }
                        }
                    }
                },
                placeholder: '記事を編集してください...',
                formats: ['header', 'bold', 'italic', 'underline', 'strike', 'list', 'bullet', 'color', 'background', 'link', 'image', 'blockquote', 'code-block']
            });
        }

        // 編集モード切り替えタブ
        const visualTab = document.getElementById('visualModeTab');
        const htmlTab = document.getElementById('htmlModeTab');
        const visualContainer = document.getElementById('visualEditorContainer');
        const htmlContainer = document.getElementById('htmlEditorContainer');
        const htmlEditor = document.getElementById('htmlEditor');

        if (visualTab && htmlTab) {
            visualTab.addEventListener('click', () => {
                this.switchEditorMode('visual');
            });

            htmlTab.addEventListener('click', () => {
                this.switchEditorMode('html');
            });
        }

        // HTMLエディタの変更を監視
        if (htmlEditor) {
            htmlEditor.addEventListener('input', () => {
                if (this.currentArticle) {
                    const htmlContent = htmlEditor.value;
                    const markdownContent = this.htmlToMarkdown(htmlContent);
                    this.updateChecklist(this.currentArticle, markdownContent);
                }
            });
        }

        const saveBtn = document.querySelector('[data-action="save"]');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                await this.saveArticle();
            });
        }
    }

    switchEditorMode(mode) {
        const visualTab = document.getElementById('visualModeTab');
        const htmlTab = document.getElementById('htmlModeTab');
        const visualContainer = document.getElementById('visualEditorContainer');
        const htmlContainer = document.getElementById('htmlEditorContainer');
        const htmlEditor = document.getElementById('htmlEditor');

        if (mode === 'visual') {
            // ビジュアルモードに切り替え
            visualTab?.classList.add('active');
            htmlTab?.classList.remove('active');
            visualContainer?.classList.add('active');
            htmlContainer?.style.setProperty('display', 'none');
            
            // HTMLエディタの内容をQuillに反映
            if (this.quill && htmlEditor) {
                const htmlContent = htmlEditor.value;
                this.quill.root.innerHTML = htmlContent;
            }
        } else {
            // HTMLモードに切り替え
            htmlTab?.classList.add('active');
            visualTab?.classList.remove('active');
            htmlContainer?.style.setProperty('display', 'block');
            visualContainer?.classList.remove('active');
            
            // Quillの内容をHTMLエディタに反映
            if (this.quill && htmlEditor) {
                const htmlContent = this.quill.root.innerHTML;
                htmlEditor.value = htmlContent;
            }
        }
    }

    handleImageUpload() {
        // 画像URL入力用のモーダルを表示
        const imageUrl = prompt('画像のURLを入力してください:');
        if (!imageUrl) return;

        const imageAlt = prompt('画像のALTテキスト（説明）を入力してください:') || '';
        
        if (this.quill) {
            const range = this.quill.getSelection(true);
            this.quill.insertEmbed(range.index, 'image', imageUrl, 'user');
            
            // ALTタグを設定（Quillのカスタム属性として）
            setTimeout(() => {
                const img = this.quill.root.querySelector(`img[src="${imageUrl}"]`);
                if (img && imageAlt) {
                    img.setAttribute('alt', imageAlt);
                    img.setAttribute('data-alt', imageAlt);
                }
            }, 100);
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

        // コンテンツをMarkdownからHTMLに変換
        const htmlContent = this.markdownToHtml(content);
        
        // Quillエディタにコンテンツを設定
        if (this.quill) {
            this.quill.root.innerHTML = htmlContent;
            
            // Quillエディタの変更を監視してチェックリストを更新
            this.quill.on('text-change', () => {
                const htmlContent = this.quill.root.innerHTML;
                const markdownContent = this.htmlToMarkdown(htmlContent);
                this.updateChecklist(article, markdownContent);
            });
        }
        
        // HTMLエディタにもコンテンツを設定
        const htmlEditor = document.getElementById('htmlEditor');
        if (htmlEditor) {
            htmlEditor.value = htmlContent;
        }
        
        // デフォルトでビジュアルモードを表示
        this.switchEditorMode('visual');
        
        this.renderChecklist(article, content);
        this.updateChecklist(article, content);
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

        let content;
        
        // 現在の編集モードに応じてコンテンツを取得
        const visualContainer = document.getElementById('visualEditorContainer');
        const isVisualMode = visualContainer && visualContainer.classList.contains('active');
        
        if (isVisualMode && this.quill) {
            // ビジュアルモード：QuillエディタからHTMLを取得してMarkdownに変換
            const htmlContent = this.quill.root.innerHTML;
            content = this.htmlToMarkdown(htmlContent);
        } else {
            // HTMLモード：HTMLエディタから直接取得してMarkdownに変換
            const htmlEditor = document.getElementById('htmlEditor');
            if (htmlEditor && htmlEditor.value) {
                const htmlContent = htmlEditor.value;
                content = this.htmlToMarkdown(htmlContent);
            } else {
                // フォールバック：従来のtextarea
                const editor = document.getElementById('markdownEditor');
                if (!editor) return;
                content = editor.value;
            }
        }
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

    htmlToMarkdown(html) {
        // HTMLをMarkdownに変換（QuillのHTML出力用、ALTタグ対応）
        let markdown = html;
        
        // 見出し（Quillのクラス名にも対応）
        markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
        markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
        markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
        markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');
        
        // 段落
        markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n');
        markdown = markdown.replace(/<p><br><\/p>/gi, '\n');
        
        // リスト
        markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1');
        markdown = markdown.replace(/<ul[^>]*>/gi, '');
        markdown = markdown.replace(/<\/ul>/gi, '');
        markdown = markdown.replace(/<ol[^>]*>/gi, '');
        markdown = markdown.replace(/<\/ol>/gi, '');
        
        // 画像（ALTタグ対応）
        markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*(?:alt="([^"]*)")?[^>]*>/gi, (match, src, alt) => {
            const altText = alt || '';
            return `![${altText}](${src})`;
        });
        
        // 太字・斜体
        markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
        markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
        markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
        markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
        markdown = markdown.replace(/<u[^>]*>(.*?)<\/u>/gi, '<u>$1</u>'); // 下線はそのまま
        markdown = markdown.replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~'); // 取り消し線
        
        // リンク
        markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
        
        // 引用
        markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '\n> $1\n');
        
        // コードブロック
        markdown = markdown.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
        markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
        
        // 改行
        markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
        
        // その他のタグを削除
        markdown = markdown.replace(/<[^>]+>/g, '');
        
        // HTMLエンティティのデコード
        markdown = markdown.replace(/&nbsp;/g, ' ')
                          .replace(/&amp;/g, '&')
                          .replace(/&lt;/g, '<')
                          .replace(/&gt;/g, '>')
                          .replace(/&quot;/g, '"')
                          .replace(/&#39;/g, "'");
        
        // 連続する空行を整理
        markdown = markdown.replace(/\n\s*\n\s*\n/g, '\n\n');
        markdown = markdown.replace(/^\s+|\s+$/g, '');
        
        return markdown.trim();
    }

    markdownToHtml(markdown) {
        // Markdown to HTML変換（Quill用）
        let html = markdown;
        
        // 見出し
        html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
        html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
        
        // 画像（ALTタグ対応）
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
        
        // リンク
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        
        // 太字
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // 斜体
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // リスト
        html = html.replace(/^-\s+(.+)$/gm, '<li>$1</li>');
        html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<li>$2</li>');
        
        // 段落（空行で区切る）
        html = html.split('\n\n').map(para => {
            para = para.trim();
            if (!para) return '';
            if (para.startsWith('<h') || para.startsWith('<li') || para.startsWith('<ul') || para.startsWith('<ol')) {
                return para;
            }
            return `<p>${para}</p>`;
        }).join('\n');
        
        // リストをulで囲む
        html = html.replace(/(<li>.*<\/li>)/gs, (match) => {
            return `<ul>${match}</ul>`;
        });
        
        // 改行をbrに変換
        html = html.replace(/\n/g, '<br>');
        
        return html;
    }
}
