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
            // カスタム画像フォーマット（ALTタグ対応）
            const Image = Quill.import('formats/image');
            const BaseImage = Image;
            
            class CustomImage extends BaseImage {
                static create(value) {
                    const node = super.create(value);
                    if (typeof value === 'object') {
                        node.setAttribute('src', value.src);
                        node.setAttribute('alt', value.alt || '');
                    } else {
                        node.setAttribute('src', value);
                    }
                    return node;
                }
                
                static value(node) {
                    return {
                        src: node.getAttribute('src'),
                        alt: node.getAttribute('alt') || ''
                    };
                }
            }
            
            Quill.register(CustomImage, true);
            
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
            
            // 画像をクリックしたときにALTタグを編集できるように
            this.quill.root.addEventListener('click', (e) => {
                if (e.target.tagName === 'IMG') {
                    this.editImageAlt(e.target);
                }
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

        // エクスポートボタン（リライトモーダル内）
        const exportBtn = document.getElementById('rewriteExportBtn');
        const exportModal = document.getElementById('exportModal');
        const closeExportModal = document.getElementById('closeExportModal');
        
        if (exportBtn && exportModal) {
            exportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                exportModal.classList.add('active');
            });
        }

        if (closeExportModal) {
            closeExportModal.addEventListener('click', () => {
                if (exportModal) exportModal.classList.remove('active');
            });
        }

        if (exportModal) {
            exportModal.addEventListener('click', (e) => {
                if (e.target === exportModal) {
                    exportModal.classList.remove('active');
                }
            });
        }

        // エクスポートオプションボタン（動的に追加される要素なので、イベント委譲を使用）
        const self = this;
        document.addEventListener('click', async (e) => {
            const exportOptionBtn = e.target.closest('.export-option-btn');
            if (exportOptionBtn) {
                e.preventDefault();
                e.stopPropagation();
                const format = exportOptionBtn.dataset.format;
                if (format) {
                    try {
                        await self.exportArticle(format);
                        const exportModal = document.getElementById('exportModal');
                        if (exportModal) exportModal.classList.remove('active');
                    } catch (error) {
                        console.error('エクスポートエラー:', error);
                        alert('エクスポートに失敗しました: ' + error.message);
                    }
                }
            }
        });
    }

    switchEditorMode(mode, skipContentSync = false) {
        const visualTab = document.getElementById('visualModeTab');
        const htmlTab = document.getElementById('htmlModeTab');
        const visualContainer = document.getElementById('visualEditorContainer');
        const htmlContainer = document.getElementById('htmlEditorContainer');
        const htmlEditor = document.getElementById('htmlEditor');

        console.log('[DEBUG] switchEditorMode: mode=', mode, 'skipContentSync=', skipContentSync);

        if (mode === 'visual') {
            // ビジュアルモードに切り替え
            visualTab?.classList.add('active');
            htmlTab?.classList.remove('active');
            visualContainer?.classList.add('active');
            htmlContainer?.style.setProperty('display', 'none');
            
            // コンテンツの同期をスキップしない場合のみ、HTMLエディタの内容をQuillに反映
            if (!skipContentSync && this.quill && htmlEditor && htmlEditor.value) {
                const htmlContent = htmlEditor.value.trim();
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:363',message:'switchEditorMode: Syncing HTML to Quill',data:{skipContentSync:skipContentSync,mode:mode,htmlContentLength:htmlContent.length,htmlContentPreview:htmlContent.substring(0,300),h1Count:(htmlContent.match(/<h1[^>]*>/gi)||[]).length,imgCount:(htmlContent.match(/<img[^>]*>/gi)||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
                if (htmlContent) {
                    // 既存のコンテンツをクリア
                    this.quill.setText('');
                    // Quillのエディタ要素を取得
                    const quillEditor = this.quill.root.querySelector('.ql-editor');
                    if (quillEditor) {
                        // 既存のコンテンツをクリア
                        quillEditor.innerHTML = '';
                        // 新しいコンテンツを設定
                        quillEditor.innerHTML = htmlContent;
                        // #region agent log
                        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:377',message:'switchEditorMode: After setting Quill content',data:{quillEditorInnerHTML:quillEditor.innerHTML.substring(0,500),h1Count:(quillEditor.innerHTML.match(/<h1[^>]*>/gi)||[]).length,imgCount:(quillEditor.innerHTML.match(/<img[^>]*>/gi)||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H'})}).catch(()=>{});
                        // #endregion
                    } else {
                        this.quill.root.innerHTML = htmlContent;
                    }
                }
            } else {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:386',message:'switchEditorMode: Skipping content sync',data:{skipContentSync:skipContentSync,hasQuill:!!this.quill,hasHtmlEditor:!!htmlEditor,htmlEditorValue:htmlEditor?.value?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'I'})}).catch(()=>{});
                // #endregion
            }
        } else {
            // HTMLモードに切り替え
            htmlTab?.classList.add('active');
            visualTab?.classList.remove('active');
            htmlContainer?.style.setProperty('display', 'block');
            visualContainer?.classList.remove('active');
            
            // コンテンツの同期をスキップしない場合のみ、Quillの内容をHTMLエディタに反映
            if (!skipContentSync && this.quill && htmlEditor) {
                // Quillの内容を取得（.ql-editorの内容を直接取得）
                const quillEditor = this.quill.root.querySelector('.ql-editor');
                const htmlContent = quillEditor ? quillEditor.innerHTML : this.quill.root.innerHTML;
                
                // 空の段落や不要な要素をクリーンアップ
                let cleanedHtml = htmlContent
                    .replace(/<p><br><\/p>/g, '') // 空の段落を削除
                    .replace(/<p>\s*<\/p>/g, '') // 空白のみの段落を削除
                    .trim();
                
                // HTMLエディタをクリアしてから設定（重複を防ぐ）
                htmlEditor.value = '';
                htmlEditor.value = cleanedHtml || '';
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
            // カスタム画像フォーマットを使用してALTタグ付きで挿入
            this.quill.insertEmbed(range.index, 'image', {
                src: imageUrl,
                alt: imageAlt
            }, 'user');
        }
    }

    editImageAlt(imgElement) {
        const currentAlt = imgElement.getAttribute('alt') || '';
        const newAlt = prompt('画像のALTテキスト（説明）を編集してください:', currentAlt);
        
        if (newAlt !== null) {
            imgElement.setAttribute('alt', newAlt);
            // Quillの変更をトリガー
            const range = this.quill.getSelection();
            this.quill.updateContents([], 'user');
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
        if (urlModal) {
            urlModal.classList.add('active');
        } else {
        }
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
        
        // エクスポートボタンのイベントリスナーを設定（モーダルが開かれた後に設定）
        const exportBtn = document.getElementById('rewriteExportBtn');
        const exportModal = document.getElementById('exportModal');
        const closeExportModal = document.getElementById('closeExportModal');
        
        if (exportBtn && exportModal) {
            // 既存のイベントリスナーを削除（重複を防ぐ）
            const newExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
            
            newExportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                exportModal.classList.add('active');
            });
        }
        
        if (closeExportModal && exportModal) {
            closeExportModal.addEventListener('click', () => {
                exportModal.classList.remove('active');
            });
        }

        const slug = this.getSlugFromUrl(article.url);
        let content = null;
        
        // fetchedContentが存在する場合は、それを優先的に使用（実際のWebサイトから取得した最新の内容）
        if (fetchedContent) {
            // fetchedContentに既にH1が含まれている場合は追加しない
            const hasH1 = fetchedContent.trim().startsWith('# ');
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:510',message:'openRewriteModal: Using fetchedContent (priority)',data:{hasH1:hasH1,fetchedContentLength:fetchedContent.length,fetchedContentPreview:fetchedContent.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            if (hasH1) {
                content = fetchedContent;
            } else {
                content = `# ${article.title}\n\n${fetchedContent}`;
            }
        } else {
            // fetchedContentが存在しない場合のみ、保存されているMarkdownファイルを読み込む
            content = await dataManager.loadMarkdown(`${slug}.md`);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:520',message:'openRewriteModal: Using saved markdown file',data:{hasContent:!!content,contentLength:content?.length,contentPreview:content?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            if (!content) {
                // 保存されているファイルも存在しない場合は、テンプレートを作成
                content = this.createArticleTemplate(article);
            }
        }

        // 重複するH1とアイキャッチ画像を削除（最初の1つだけを保持）
        content = this.removeDuplicateH1AndEyeCatch(content);
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:521',message:'openRewriteModal: Content before markdownToHtml',data:{contentLength:content.length,contentPreview:content.substring(0,300),h1Count:(content.match(/^#\s+/gm)||[]).length,imgCount:(content.match(/!\[.*?\]\(.*?\)/g)||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
        // #endregion

        // コンテンツをMarkdownからHTMLに変換
        const htmlContent = this.markdownToHtml(content);
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:525',message:'openRewriteModal: HTML content after markdownToHtml',data:{htmlContentLength:htmlContent.length,htmlContentPreview:htmlContent.substring(0,500),h1Count:(htmlContent.match(/<h1[^>]*>/gi)||[]).length,imgCount:(htmlContent.match(/<img[^>]*>/gi)||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        // HTMLエディタにコンテンツを設定（先に設定）
        const htmlEditor = document.getElementById('htmlEditor');
        if (htmlEditor) {
            htmlEditor.value = '';
            htmlEditor.value = htmlContent;
        }
        
        // デフォルトでビジュアルモードを表示（先に切り替え、同期をスキップ）
        this.switchEditorMode('visual', true);
        
        // Quillエディタをクリアしてからコンテンツを設定（モード切り替え後）
        if (this.quill) {
            // 既存のイベントリスナーを削除（重複を防ぐ）
            this.quill.off('text-change');
            
            // エディタを完全にクリア
            this.quill.setText('');
            
            // Quillのエディタ要素を取得して設定（重複を防ぐ）
            const quillEditor = this.quill.root.querySelector('.ql-editor');
            if (quillEditor) {
                // 既存のコンテンツを完全にクリア
                quillEditor.innerHTML = '';
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:548',message:'openRewriteModal: Before setting Quill content',data:{quillEditorInnerHTML:quillEditor.innerHTML,htmlContentLength:htmlContent.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                // 新しいコンテンツを設定
                quillEditor.innerHTML = htmlContent;
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:551',message:'openRewriteModal: After setting Quill content',data:{quillEditorInnerHTML:quillEditor.innerHTML.substring(0,500),h1Count:(quillEditor.innerHTML.match(/<h1[^>]*>/gi)||[]).length,imgCount:(quillEditor.innerHTML.match(/<img[^>]*>/gi)||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
                // #endregion
            } else {
                this.quill.root.innerHTML = htmlContent;
            }
            
            // Quillエディタの変更を監視してチェックリストを更新
            this.quill.on('text-change', () => {
                const htmlContent = this.quill.root.innerHTML;
                const markdownContent = this.htmlToMarkdown(htmlContent);
                this.updateChecklist(article, markdownContent);
            });
        }
        
        this.renderChecklist(article, content);
        this.updateChecklist(article, content);
    }

    getSlugFromUrl(url) {
        const match = url.match(/\/columns\/([^\/]+)/);
        return match ? match[1] : 'article';
    }

    /**
     * 重複するH1とアイキャッチ画像を削除（最初の1つだけを保持）
     */
    removeDuplicateH1AndEyeCatch(content) {
        if (!content) return content;
        
        const lines = content.split('\n');
        let h1Found = false;
        let eyeCatchFound = false;
        const result = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // H1のチェック（Markdown形式: # タイトル）
            if (trimmedLine.match(/^#\s+/)) {
                if (!h1Found) {
                    // 最初のH1は保持
                    result.push(line);
                    h1Found = true;
                } else {
                    // 2つ目以降のH1はH2に変換
                    const h2Line = line.replace(/^#\s+/, '## ');
                    result.push(h2Line);
                }
            }
            // アイキャッチ画像のチェック（Markdown形式: ![alt](url)）
            else if (trimmedLine.match(/^!\[.*?\]\(.*?\)/)) {
                if (!eyeCatchFound && h1Found) {
                    // H1の直後の最初の画像をアイキャッチとして保持
                    result.push(line);
                    eyeCatchFound = true;
                } else if (!eyeCatchFound && i < 10) {
                    // 最初の10行以内の画像もアイキャッチとして扱う
                    result.push(line);
                    eyeCatchFound = true;
                } else {
                    // 2つ目以降の画像は保持（本文中の画像として）
                    result.push(line);
                }
            }
            else {
                // その他の行はそのまま保持
                result.push(line);
            }
        }
        
        return result.join('\n');
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
        
        // チェック状態を保存するオブジェクト（手動チェック用）
        if (!this.manualChecks) {
            this.manualChecks = {};
        }
        
        this.checklistItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'checklist-item';
            div.dataset.itemId = item.id;
            
            // 自動チェック結果
            const autoChecked = item.check(content);
            // 手動チェック状態（優先）または自動チェック結果
            const isChecked = this.manualChecks[item.id] !== undefined ? this.manualChecks[item.id] : autoChecked;
            
            div.innerHTML = `
                <div class="checklist-checkbox">
                    <span class="material-icons-round ${isChecked ? 'checked' : ''}" data-checked="${isChecked}">${isChecked ? 'check_circle' : 'radio_button_unchecked'}</span>
                </div>
                <div class="checklist-content">
                    <div class="checklist-label">${item.label}</div>
                    <div class="checklist-guidance">${item.guidance}</div>
                </div>
            `;
            
            // チェックボックスのクリックイベント（手動チェック切り替え）
            const checkbox = div.querySelector('.checklist-checkbox');
            console.log('[DEBUG] Checklist checkbox found:', !!checkbox, item.id);
            if (checkbox) {
                checkbox.addEventListener('click', (e) => {
                    console.log('[DEBUG] Checklist checkbox clicked:', item.id, e);
                    e.stopPropagation();
                    try {
                        const currentChecked = this.manualChecks[item.id] !== undefined ? this.manualChecks[item.id] : autoChecked;
                        const newChecked = !currentChecked;
                        this.manualChecks[item.id] = newChecked;
                        this.updateChecklistItem(div, item.id, newChecked);
                        this.updateScore();
                        console.log('[DEBUG] Checklist updated:', item.id, newChecked);
                    } catch (error) {
                        console.error('[ERROR] Error updating checklist:', error);
                    }
                });
            } else {
                console.error('[ERROR] Checkbox not found for item:', item.id);
            }
            
            // 項目全体のクリックイベント（ガイダンス表示）
            div.addEventListener('click', (e) => {
                if (e.target.closest('.checklist-checkbox')) return; // チェックボックスクリック時はスキップ
                
                const guidanceDiv = document.getElementById('aiGuidance');
                if (guidanceDiv) {
                    const currentChecked = this.manualChecks[item.id] !== undefined ? this.manualChecks[item.id] : autoChecked;
                    guidanceDiv.innerHTML = `
                        <h4><span class="material-icons-round" style="color: ${currentChecked ? 'var(--success-color)' : 'var(--danger-color)'}">${currentChecked ? 'check_circle' : 'error'}</span> ${item.label}</h4>
                        <p>${item.guidance}</p>
                    `;
                }
            });
            
            container.appendChild(div);
        });
        
        // スコアを更新
        this.updateScore();
    }

    updateChecklistItem(itemElement, itemId, isChecked) {
        const icon = itemElement.querySelector('.material-icons-round');
        if (icon) {
            icon.textContent = isChecked ? 'check_circle' : 'radio_button_unchecked';
            icon.classList.toggle('checked', isChecked);
            icon.dataset.checked = isChecked;
        }
    }

    updateScore() {
        const totalItems = this.checklistItems.length;
        let checkedCount = 0;
        
        this.checklistItems.forEach(item => {
            const isChecked = this.manualChecks && this.manualChecks[item.id] !== undefined 
                ? this.manualChecks[item.id] 
                : item.check(this.getCurrentContent());
            if (isChecked) checkedCount++;
        });
        
        const score = Math.round((checkedCount / totalItems) * 100);
        const rank = this.getRank(score);
        
        // スコア表示を更新
        const scoreNumber = document.getElementById('scoreNumber');
        const scoreRank = document.getElementById('scoreRank');
        const checkedCountEl = document.getElementById('checkedCount');
        const totalCountEl = document.getElementById('totalCount');
        const scoreBarFill = document.getElementById('scoreBarFill');
        
        if (scoreNumber) scoreNumber.textContent = score;
        if (scoreRank) {
            scoreRank.textContent = rank;
            scoreRank.className = `rank-value rank-${rank.toLowerCase()}`;
        }
        if (checkedCountEl) checkedCountEl.textContent = checkedCount;
        if (totalCountEl) totalCountEl.textContent = totalItems;
        if (scoreBarFill) scoreBarFill.style.width = `${score}%`;
    }

    getRank(score) {
        if (score >= 90) return 'S';
        if (score >= 80) return 'A';
        if (score >= 70) return 'B';
        if (score >= 60) return 'C';
        return 'D';
    }

    getCurrentContent() {
        // 現在のエディタの内容を取得
        const visualContainer = document.getElementById('visualEditorContainer');
        const isVisualMode = visualContainer && visualContainer.classList.contains('active');
        
        if (isVisualMode && this.quill) {
            const quillEditor = this.quill.root.querySelector('.ql-editor');
            const htmlContent = quillEditor ? quillEditor.innerHTML : this.quill.root.innerHTML;
            return this.htmlToMarkdown(htmlContent);
        } else {
            const htmlEditor = document.getElementById('htmlEditor');
            if (htmlEditor && htmlEditor.value) {
                return this.htmlToMarkdown(htmlEditor.value);
            }
        }
        return '';
    }

    updateChecklist(article, content) {
        // 手動チェックが設定されていない項目のみ自動チェックを更新
        this.checklistItems.forEach(item => {
            const div = document.querySelector(`[data-item-id="${item.id}"]`);
            if (!div) return;
            
            // 手動チェックが設定されている場合はスキップ
            if (this.manualChecks && this.manualChecks[item.id] !== undefined) {
                return;
            }
            
            const checked = item.check(content);
            this.updateChecklistItem(div, item.id, checked);
        });
        
        // スコアを更新
        this.updateScore();
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
        let html = markdown.trim();
        
        // 既にHTMLタグが含まれている場合は変換をスキップ（重複を防ぐ）
        // より厳密にチェック：H1タグや画像タグが既に存在する場合
        const hasH1 = /<h1[^>]*>.*?<\/h1>/i.test(html);
        const hasImg = /<img[^>]*>/i.test(html);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:894',message:'markdownToHtml: Checking for existing HTML tags',data:{hasH1:hasH1,hasImg:hasImg,htmlPreview:html.substring(0,300),h1Count:(html.match(/<h1[^>]*>/gi)||[]).length,imgCount:(html.match(/<img[^>]*>/gi)||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'J'})}).catch(()=>{});
        // #endregion
        if (hasH1 || hasImg) {
            // HTMLタグが既にある場合は、そのまま返す（重複変換を防ぐ）
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:900',message:'markdownToHtml: Returning existing HTML without conversion',data:{htmlLength:html.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'K'})}).catch(()=>{});
            // #endregion
            return html;
        }
        
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

    async exportArticle(format) {
        console.log('exportArticle called with format:', format);
        
        if (!this.currentArticle) {
            alert('記事が選択されていません。');
            return;
        }

        // 現在の編集モードに応じてコンテンツを取得
        const visualContainer = document.getElementById('visualEditorContainer');
        const isVisualMode = visualContainer && visualContainer.classList.contains('active');
        
        let htmlContent;
        let title;
        
        try {
            if (isVisualMode && this.quill) {
                // Quillエディタから直接取得（.ql-editorの内容）
                const quillEditor = this.quill.root.querySelector('.ql-editor');
                htmlContent = quillEditor ? quillEditor.innerHTML : this.quill.root.innerHTML;
                title = this.currentArticle.title;
                
                console.log('Visual mode - HTML content length:', htmlContent ? htmlContent.length : 0);
                
                // 空のコンテンツチェック
                if (!htmlContent || htmlContent.trim() === '' || htmlContent === '<p><br></p>' || htmlContent === '<p></p>') {
                    alert('エクスポートするコンテンツがありません。記事を編集してください。');
                    return;
                }
            } else {
                const htmlEditor = document.getElementById('htmlEditor');
                if (htmlEditor && htmlEditor.value) {
                    htmlContent = htmlEditor.value.trim();
                    title = this.currentArticle.title;
                    
                    console.log('HTML mode - HTML content length:', htmlContent ? htmlContent.length : 0);
                    
                    if (!htmlContent) {
                        alert('エクスポートするコンテンツがありません。記事を編集してください。');
                        return;
                    }
                } else {
                    alert('エクスポートするコンテンツがありません。記事を編集してください。');
                    return;
                }
            }

            const slug = this.getSlugFromUrl(this.currentArticle.url);
            const filename = `${slug || 'article'}`;

            console.log('Exporting:', format, 'Title:', title, 'Filename:', filename);

            switch (format) {
                case 'pdf':
                    await this.exportToPDF(htmlContent, title, filename);
                    break;
                case 'docx':
                    await this.exportToWord(htmlContent, title, filename);
                    break;
                case 'html':
                    this.exportToHTML(htmlContent, title, filename);
                    break;
                default:
                    alert('不明な形式です。');
            }
        } catch (error) {
            console.error('エクスポートエラー:', error);
            alert('エクスポートに失敗しました: ' + (error.message || error.toString()));
        }
    }

    async exportToPDF(htmlContent, title, filename) {
        try {
            if (typeof html2pdf === 'undefined') {
                alert('PDFエクスポート機能が利用できません。ページをリロードしてください。');
                return;
            }

            // HTMLを整形してPDF化
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert('ポップアップがブロックされています。ブラウザの設定を確認してください。');
                return;
            }

            // HTMLコンテンツをクリーンアップ（Quillの不要な要素を削除）
            let cleanedHtml = htmlContent
                .replace(/<p><br><\/p>/g, '')
                .replace(/<p>\s*<\/p>/g, '')
                .trim();

            printWindow.document.write(`
                <!DOCTYPE html>
                <html lang="ja">
                <head>
                    <meta charset="UTF-8">
                    <title>${title}</title>
                    <style>
                        body {
                            font-family: 'Noto Sans JP', sans-serif;
                            padding: 2rem;
                            line-height: 1.8;
                            color: #333;
                        }
                        h1 { font-size: 2rem; margin-top: 2rem; margin-bottom: 1rem; }
                        h2 { font-size: 1.5rem; margin-top: 1.5rem; margin-bottom: 0.8rem; }
                        h3 { font-size: 1.25rem; margin-top: 1.25rem; margin-bottom: 0.6rem; }
                        h4 { font-size: 1.1rem; margin-top: 1rem; margin-bottom: 0.5rem; }
                        p { margin-bottom: 1rem; }
                        img { max-width: 100%; height: auto; }
                        ul, ol { margin-left: 2rem; margin-bottom: 1rem; }
                    </style>
                </head>
                <body>
                    <h1>${title}</h1>
                    ${cleanedHtml}
                </body>
                </html>
            `);
            printWindow.document.close();

            await new Promise(resolve => setTimeout(resolve, 1000));

            const element = printWindow.document.body;
            const opt = {
                margin: 1,
                filename: `${filename}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            };
            
            await html2pdf().set(opt).from(element).save();
            printWindow.close();
        } catch (error) {
            console.error('PDFエクスポートエラー:', error);
            alert('PDFエクスポートに失敗しました: ' + error.message);
        }
    }

    async exportToWord(htmlContent, title, filename) {
        // docx.jsを動的インポートで読み込む（ES6モジュール形式）
        let docxLib;
        try {
            // jsdelivrのESM形式を使用
            const docxModule = await import('https://cdn.jsdelivr.net/npm/docx@8.5.0/+esm');
            // docx.jsは名前付きエクスポートを使用
            docxLib = docxModule;
            console.log('[DEBUG] exportToWord: docx.js loaded via jsdelivr ESM');
            console.log('[DEBUG] exportToWord: docxModule keys:', Object.keys(docxModule));
        } catch (importError) {
            console.error('[ERROR] exportToWord: jsdelivr import failed:', importError);
            // フォールバック: skypackを試す
            try {
                const docxModule2 = await import('https://cdn.skypack.dev/docx@8.5.0');
                docxLib = docxModule2.default || docxModule2;
                console.log('[DEBUG] exportToWord: docx.js loaded via skypack');
            } catch (importError2) {
                console.error('[ERROR] exportToWord: skypack import failed:', importError2);
                // 最後のフォールバック: esm.shを試す
                try {
                    const docxModule3 = await import('https://esm.sh/docx@8.5.0');
                    docxLib = docxModule3.default || docxModule3;
                    console.log('[DEBUG] exportToWord: docx.js loaded via esm.sh');
                } catch (importError3) {
                    console.error('[ERROR] exportToWord: All import methods failed:', importError3);
                    alert('Word形式のエクスポートにはdocx.jsライブラリが必要です。\n\n現在、docx.jsの読み込みに失敗しています。\n\n別の方法として、HTML形式またはPDF形式でのエクスポートをお試しください。\n\nHTML形式でエクスポートしたファイルは、Microsoft Wordで開いて保存することでWord形式に変換できます。');
                    return;
                }
            }
        }
        
        // docx.jsのクラスを取得
        const Document = docxLib.Document || docxLib.default?.Document;
        const Paragraph = docxLib.Paragraph || docxLib.default?.Paragraph;
        const HeadingLevel = docxLib.HeadingLevel || docxLib.default?.HeadingLevel;
        const Packer = docxLib.Packer || docxLib.default?.Packer;
        const TextRun = docxLib.TextRun || docxLib.default?.TextRun;
        
        // Documentクラスが利用可能か確認
        if (!Document) {
            console.error('[ERROR] exportToWord: Document not found. docxLib:', docxLib);
            console.error('[ERROR] exportToWord: Available keys:', Object.keys(docxLib));
            alert('Word形式のエクスポートに失敗しました。docx.jsライブラリが正しく読み込まれていません。\n\nHTML形式またはPDF形式でのエクスポートをお試しください。');
            return;
        }
        
        console.log('[DEBUG] exportToWord: Document found:', typeof Document);
        
        if (!Paragraph || !HeadingLevel || !Packer || !TextRun) {
            console.error('[ERROR] exportToWord: Required classes not found');
            console.error('[ERROR] exportToWord: Paragraph:', !!Paragraph, 'HeadingLevel:', !!HeadingLevel, 'Packer:', !!Packer, 'TextRun:', !!TextRun);
            alert('Word形式のエクスポートに失敗しました。docx.jsライブラリが正しく読み込まれていません。\n\nHTML形式またはPDF形式でのエクスポートをお試しください。');
            return;
        }
        
        // HTMLをパースしてdocx形式に変換
        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({
                        text: title,
                        heading: HeadingLevel.HEADING_1,
                        spacing: { after: 400 }
                    }),
                    ...this.htmlToDocxElements(htmlContent, { Paragraph, HeadingLevel, TextRun })
                ]
            }]
        });

        try {
            const blob = await Packer.toBlob(doc);
            if (typeof saveAs !== 'undefined') {
                saveAs(blob, `${filename}.docx`);
            } else {
                // フォールバック
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${filename}.docx`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Wordエクスポートエラー:', error);
            alert('Word形式のエクスポートに失敗しました。HTML形式をお試しください。');
        }
    }

    htmlToDocxElements(html, docxLib) {
        // 簡易的なHTML→docx要素変換
        const { Paragraph, HeadingLevel, TextRun } = docxLib;
        const elements = [];
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        const processNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    return new TextRun(text);
                }
                return null;
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                
                switch (tagName) {
                    case 'h1':
                        return new Paragraph({
                            text: node.textContent,
                            heading: HeadingLevel.HEADING_1,
                            spacing: { after: 400 }
                        });
                    case 'h2':
                        return new Paragraph({
                            text: node.textContent,
                            heading: HeadingLevel.HEADING_2,
                            spacing: { after: 300 }
                        });
                    case 'h3':
                        return new Paragraph({
                            text: node.textContent,
                            heading: HeadingLevel.HEADING_3,
                            spacing: { after: 200 }
                        });
                    case 'p':
                        const runs = Array.from(node.childNodes)
                            .map(processNode)
                            .filter(n => n !== null);
                        return new Paragraph({
                            children: runs.length > 0 ? runs : [new TextRun('')],
                            spacing: { after: 200 }
                        });
                    case 'strong':
                    case 'b':
                        return new TextRun({
                            text: node.textContent,
                            bold: true
                        });
                    case 'em':
                    case 'i':
                        return new TextRun({
                            text: node.textContent,
                            italics: true
                        });
                    case 'ul':
                    case 'ol':
                        const listItems = Array.from(node.querySelectorAll('li'))
                            .map(li => new Paragraph({
                                text: li.textContent,
                                bullet: { level: 0 }
                            }));
                        return listItems;
                    case 'li':
                        return new Paragraph({
                            text: node.textContent,
                            bullet: { level: 0 }
                        });
                    default:
                        // 子要素を処理
                        const children = Array.from(node.childNodes)
                            .map(processNode)
                            .filter(n => n !== null);
                        return children.length > 0 ? children : null;
                }
            }
            return null;
        };

        const result = Array.from(tempDiv.childNodes)
            .map(processNode)
            .filter(n => n !== null)
            .flat();

        return result.length > 0 ? result : [new Paragraph({ text: '' })];
    }

    exportToHTML(htmlContent, title, filename) {
        // HTMLファイルとしてダウンロード（Googleドキュメントにインポート可能）
        const fullHTML = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: 'Noto Sans JP', sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.8;
            color: #333;
        }
        h1 { font-size: 2rem; margin-top: 2rem; margin-bottom: 1rem; }
        h2 { font-size: 1.5rem; margin-top: 1.5rem; margin-bottom: 0.8rem; }
        h3 { font-size: 1.25rem; margin-top: 1.25rem; margin-bottom: 0.6rem; }
        h4 { font-size: 1.1rem; margin-top: 1rem; margin-bottom: 0.5rem; }
        p { margin-bottom: 1rem; }
        img { max-width: 100%; height: auto; }
        ul, ol { margin-left: 2rem; margin-bottom: 1rem; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    ${htmlContent}
</body>
</html>`;

        const blob = new Blob([fullHTML], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.html`;
        a.click();
        URL.revokeObjectURL(url);
    }
}
