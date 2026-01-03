/**
 * リライト機能
 * AIフレンドリーな記事リライトをサポート
 */

// トースト通知を表示する関数
window.showToast = function(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'check_circle';
    if (type === 'error') icon = 'error';
    
    toast.innerHTML = `
        <span class="material-icons-round">${icon}</span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // アニメーション用
    setTimeout(() => {
        toast.classList.add('active');
    }, 10);
    
    // 3秒後に消去
    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => {
            if (toast.parentNode) {
                document.body.removeChild(toast);
            }
        }, 400);
    }, 3000);
};

class RewriteSystem {
    constructor() {
        this.currentArticle = null;
        this.progressData = null;
        this.quill = null; // Quillエディタインスタンス
        this.checklistScoreObserver = null; // MutationObserver for checklistScore
        this.currentEditMode = 'normal'; // 'normal' or 'suggestion'
        this.suggestionBaseContent = null; // 提案モード開始時のベースコンテンツ
        this.suggestionChanges = []; // 変更履歴
        this.checklistItems = [
            {
                id: 'h1',
                label: 'H1タグが1つだけ存在する',
                check: (content) => {
                    // Markdown形式とHTML形式の両方をチェック
                    const markdownH1Matches = content.match(/^#\s+.+$/gm);
                    const htmlH1Matches = content.match(/<h1[^>]*>.*?<\/h1>/gi);
                    
                    // Markdown形式のH1をカウント
                    const markdownH1Count = markdownH1Matches ? markdownH1Matches.length : 0;
                    // HTML形式のH1をカウント
                    const htmlH1Count = htmlH1Matches ? htmlH1Matches.length : 0;
                    
                    // どちらかの形式でH1が1つだけ存在するかチェック
                    const totalH1Count = markdownH1Count + htmlH1Count;
                    return totalH1Count === 1;
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

        // 既存のイベントリスナーを削除するために、ボタンをクローンして置き換える
        if (autoFetchBtn && !autoFetchBtn.dataset.listenerAttached) {
            autoFetchBtn.dataset.listenerAttached = 'true';
        }

        if (closeBtn) {
            // 既存のリスナーを削除してから追加
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }

        if (closeUrlBtn) {
            // 既存のリスナーを削除してから追加
            const newCloseUrlBtn = closeUrlBtn.cloneNode(true);
            closeUrlBtn.parentNode.replaceChild(newCloseUrlBtn, closeUrlBtn);
            newCloseUrlBtn.addEventListener('click', () => {
                urlModal.classList.remove('active');
            });
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal();
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
            // 既存のリスナーを削除してから追加
            const newOpenUrlBtn = openUrlBtn.cloneNode(true);
            openUrlBtn.parentNode.replaceChild(newOpenUrlBtn, openUrlBtn);
            newOpenUrlBtn.addEventListener('click', () => {
                const url = document.getElementById('articleUrlInput').value;
                if (url) {
                    window.open(url, '_blank');
                }
            });
        }

        if (proceedBtn) {
            // 既存のリスナーを削除してから追加
            const newProceedBtn = proceedBtn.cloneNode(true);
            proceedBtn.parentNode.replaceChild(newProceedBtn, proceedBtn);
            newProceedBtn.addEventListener('click', () => {
                urlModal.classList.remove('active');
                this.openRewriteModal(this.currentArticle);
            });
        }

        // 自動取得ボタンの処理
        if (autoFetchBtn && !autoFetchBtn.dataset.listenerAttached) {
            this.setupAutoFetchButton(autoFetchBtn);
        }

        // 検索機能のイベントリスナー設定
        const searchToggleBtn = document.getElementById('searchToggleBtn');
        const searchCloseBtn = document.getElementById('searchCloseBtn');
        const searchPrevBtn = document.getElementById('searchPrevBtn');
        const searchNextBtn = document.getElementById('searchNextBtn');
        const searchInput = document.getElementById('searchInput');

        if (searchToggleBtn) {
            searchToggleBtn.addEventListener('click', () => this.toggleSearch());
        }
        
        if (searchCloseBtn) {
            searchCloseBtn.addEventListener('click', () => this.closeSearch());
        }
        
        if (searchPrevBtn) {
            searchPrevBtn.addEventListener('click', () => this.navigateSearch(-1));
        }
        
        if (searchNextBtn) {
            searchNextBtn.addEventListener('click', () => this.navigateSearch(1));
        }
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.performSearch(e.target.value));
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (e.shiftKey) {
                        this.navigateSearch(-1);
                    } else {
                        this.navigateSearch(1);
                    }
                    e.preventDefault();
                } else if (e.key === 'Escape') {
                    this.closeSearch();
                    e.preventDefault();
                    // フォーカスをエディタに戻す
                    if (this.quill && document.getElementById('visualEditorContainer').classList.contains('active')) {
                        this.quill.focus();
                    } else {
                        document.getElementById('htmlEditor').focus();
                    }
                }
            });
        }
        
        // キーボードショートカット (Cmd+F / Ctrl+F)
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                if (modal.classList.contains('active')) {
                    e.preventDefault();
                    this.toggleSearch(true);
                }
            }
        });
    }

    // 検索機能関連メソッド
    toggleSearch(forceOpen = false) {
        const searchBar = document.getElementById('searchBar');
        const searchInput = document.getElementById('searchInput');
        
        if (!searchBar) return;
        
        if (forceOpen || searchBar.style.display === 'none') {
            searchBar.style.display = 'flex';
            this.searchState.isActive = true;
            setTimeout(() => {
                if (searchInput) searchInput.focus();
            }, 50);
            
            // 既にテキストがある場合は検索実行
            if (searchInput && searchInput.value) {
                this.performSearch(searchInput.value);
            }
        } else {
            this.closeSearch();
        }
    }
    
    closeSearch() {
        const searchBar = document.getElementById('searchBar');
        if (searchBar) {
            searchBar.style.display = 'none';
        }
        this.searchState.isActive = false;
    }
    
    performSearch(query) {
        this.searchState.query = query;
        this.searchState.matches = [];
        this.searchState.currentIndex = -1;
        
        if (!query) {
            const countEl = document.getElementById('searchCount');
            if (countEl) countEl.textContent = '';
            return;
        }
        
        const visualContainer = document.getElementById('visualEditorContainer');
        const isVisualMode = visualContainer && visualContainer.classList.contains('active');
        
        if (isVisualMode && this.quill) {
            const text = this.quill.getText();
            let index = text.toLowerCase().indexOf(query.toLowerCase());
            while (index !== -1) {
                this.searchState.matches.push({ index, length: query.length });
                index = text.toLowerCase().indexOf(query.toLowerCase(), index + 1);
            }
        } else {
            const htmlEditor = document.getElementById('htmlEditor');
            if (htmlEditor) {
                const text = htmlEditor.value;
                let index = text.toLowerCase().indexOf(query.toLowerCase());
                while (index !== -1) {
                    this.searchState.matches.push({ index, length: query.length });
                    index = text.toLowerCase().indexOf(query.toLowerCase(), index + 1);
                }
            }
        }
        
        this.updateSearchDisplay();
        
        if (this.searchState.matches.length > 0) {
            this.navigateSearch(1);
        }
    }
    
    navigateSearch(direction) {
        if (this.searchState.matches.length === 0) return;
        
        if (direction > 0) {
            this.searchState.currentIndex = (this.searchState.currentIndex + 1) % this.searchState.matches.length;
        } else {
            this.searchState.currentIndex = (this.searchState.currentIndex - 1 + this.searchState.matches.length) % this.searchState.matches.length;
        }
        
        this.updateSearchDisplay();
        this.highlightCurrentMatch();
    }
    
    updateSearchDisplay() {
        const countEl = document.getElementById('searchCount');
        if (countEl) {
            if (this.searchState.matches.length > 0) {
                countEl.textContent = `${this.searchState.currentIndex + 1} / ${this.searchState.matches.length}`;
            } else if (this.searchState.query) {
                countEl.textContent = 'なし';
            } else {
                countEl.textContent = '';
            }
        }
    }
    
    highlightCurrentMatch() {
        const match = this.searchState.matches[this.searchState.currentIndex];
        if (!match) return;
        
        const visualContainer = document.getElementById('visualEditorContainer');
        const isVisualMode = visualContainer && visualContainer.classList.contains('active');
        
        if (isVisualMode && this.quill) {
            this.quill.setSelection(match.index, match.length);
        } else {
            const htmlEditor = document.getElementById('htmlEditor');
            if (htmlEditor) {
                htmlEditor.focus();
                htmlEditor.setSelectionRange(match.index, match.index + match.length);
                
                const textBefore = htmlEditor.value.substring(0, match.index);
                const lines = textBefore.split('\n').length;
                const lineHeight = 20; 
                htmlEditor.scrollTop = (lines - 5) * lineHeight;
            }
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
            
            // 提案マーカーのカスタムBlotを作成
            const Inline = Quill.import('blots/inline');
            
            class SuggestionMarker extends Inline {
                static create(value) {
                    const node = super.create();
                    node.setAttribute('class', 'suggestion-marker');
                    node.setAttribute('data-suggestion-id', value?.suggestionId || '');
                    node.setAttribute('data-user-id', value?.userId || '');
                    node.setAttribute('data-user-name', value?.userName || '');
                    node.setAttribute('title', `提案: ${value?.userName || '不明'}`);
                    
                    // アイコンを追加
                    const icon = document.createElement('span');
                    icon.className = 'material-icons-round suggestion-icon';
                    icon.textContent = 'rate_review';
                    icon.style.cssText = 'font-size: 14px; vertical-align: middle; margin-left: 4px; color: #f59e0b; cursor: pointer;';
                    
                    node.appendChild(icon);
                    return node;
                }
                
                static formats(node) {
                    return {
                        suggestionId: node.getAttribute('data-suggestion-id'),
                        userId: node.getAttribute('data-user-id'),
                        userName: node.getAttribute('data-user-name')
                    };
                }
            }
            
            SuggestionMarker.blotName = 'suggestion';
            SuggestionMarker.tagName = 'span';
            SuggestionMarker.className = 'suggestion-marker';
            
            Quill.register(SuggestionMarker, true);
            
            // 削除マーカー（取り消し線）のカスタムBlot
            class DeletionMarker extends Inline {
                static create(value) {
                    const node = super.create();
                    node.setAttribute('class', 'suggestion-deletion');
                    const commentId = value?.commentId || (typeof value === 'string' ? value : `del_${Date.now()}`);
                    node.setAttribute('data-comment-id', commentId);
                    node.setAttribute('data-change-type', 'deletion');
                    return node;
                }
                
                static formats(node) {
                    return node.getAttribute('data-comment-id') || true;
                }
            }
            
            DeletionMarker.blotName = 'deletion';
            DeletionMarker.tagName = 'del';
            DeletionMarker.className = 'suggestion-deletion';
            
            // 追加マーカー（赤背景）のカスタムBlot
            class AdditionMarker extends Inline {
                static create(value) {
                    const node = super.create();
                    node.setAttribute('class', 'suggestion-addition');
                    const commentId = value?.commentId || (typeof value === 'string' ? value : `add_${Date.now()}`);
                    node.setAttribute('data-comment-id', commentId);
                    node.setAttribute('data-change-type', 'addition');
                    return node;
                }
                
                static formats(node) {
                    return node.getAttribute('data-comment-id') || true;
                }
            }
            
            AdditionMarker.blotName = 'addition';
            AdditionMarker.tagName = 'ins';
            AdditionMarker.className = 'suggestion-addition';

            // コメントマーカー（青背景）のカスタムBlot
            class CommentMarker extends Inline {
                static create(value) {
                    const node = super.create();
                    node.setAttribute('class', 'suggestion-comment');
                    const commentId = value?.commentId || (typeof value === 'string' ? value : `comment_${Date.now()}`);
                    node.setAttribute('data-comment-id', commentId);
                    node.setAttribute('data-change-type', 'comment');
                    return node;
                }
                
                static formats(node) {
                    return node.getAttribute('data-comment-id') || true;
                }
            }
            
            CommentMarker.blotName = 'comment';
            CommentMarker.tagName = 'span';
            CommentMarker.className = 'suggestion-comment';
            
            Quill.register(DeletionMarker, true);
            Quill.register(AdditionMarker, true);
            Quill.register(CommentMarker, true);
            
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
                formats: ['header', 'bold', 'italic', 'underline', 'strike', 'list', 'bullet', 'color', 'background', 'link', 'image', 'blockquote', 'code-block', 'suggestion', 'deletion', 'addition', 'comment']
            });
            
            // 画像をクリックしたときにALTタグを編集できるように
            this.quill.root.addEventListener('click', (e) => {
                if (e.target.tagName === 'IMG') {
                    this.editImageAlt(e.target);
                }
                
                // 提案アイコンをクリックしたとき
                if (e.target.classList.contains('suggestion-icon') || e.target.closest('.suggestion-marker')) {
                    const marker = e.target.closest('.suggestion-marker') || e.target.parentElement;
                    if (marker) {
                        const suggestionId = marker.getAttribute('data-suggestion-id');
                        const userName = marker.getAttribute('data-user-name');
                        this.showSuggestionTooltip(marker, suggestionId, userName);
                    }
                }
                
                // 削除マーカーまたは追加マーカーをクリック
                const deletionMarker = e.target.closest('.suggestion-deletion');
                const additionMarker = e.target.closest('.suggestion-addition');
                
                if (deletionMarker || additionMarker) {
                    const marker = deletionMarker || additionMarker;
                    const commentId = marker.getAttribute('data-comment-id') || `comment_${Date.now()}`;
                    const changeType = marker.getAttribute('data-change-type') || (deletionMarker ? 'deletion' : 'addition');
                    this.showCommentDialog(marker, commentId, changeType);
                }
            });
            
            // 提案モード時の変更を追跡
            this.setupSuggestionTracking();
            
            // 提案モード用のツールバーボタンのイベントリスナー
            this.setupSuggestionToolbarButtons();
            
            // キーボードショートカット
            this.setupSuggestionKeyboardShortcuts();
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
        
        // 編集モード切り替えタブ（通常編集｜提案モード）
        const normalEditTab = document.getElementById('normalEditTab');
        const suggestionEditTab = document.getElementById('suggestionEditTab');
        
        if (normalEditTab && suggestionEditTab) {
            normalEditTab.addEventListener('click', () => {
                this.switchEditMode('normal');
            });
            
            suggestionEditTab.addEventListener('click', () => {
                this.switchEditMode('suggestion');
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

        // プレビューボタンのイベントリスナー
        const previewBtn = document.getElementById('previewBtn');
        const previewModal = document.getElementById('previewModal');
        const closePreviewModal = document.getElementById('closePreviewModal');
        
        if (previewBtn && previewModal) {
            previewBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showPreview();
            });
        }
        
        if (closePreviewModal && previewModal) {
            closePreviewModal.addEventListener('click', () => {
                previewModal.classList.remove('active');
            });
        }
        
        if (previewModal) {
            previewModal.addEventListener('click', (e) => {
                if (e.target === previewModal) {
                    previewModal.classList.remove('active');
                }
            });
        }
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
            htmlContainer?.classList.remove('active');
            // インラインスタイルを削除してCSSクラスで制御
            htmlContainer?.style.removeProperty('display');
            
            // 編集モードタブを表示
            const editModeTabs = document.getElementById('editModeTabs');
            if (editModeTabs) {
                editModeTabs.style.display = 'flex';
            }
            
            // コンテンツの同期をスキップしない場合のみ、HTMLエディタの内容をQuillに反映
            if (!skipContentSync && this.quill && htmlEditor && htmlEditor.value) {
                const htmlContent = htmlEditor.value.trim();
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:363',message:'switchEditorMode: Syncing HTML to Quill',data:{skipContentSync:skipContentSync,mode:mode,htmlContentLength:htmlContent.length,htmlContentPreview:htmlContent.substring(0,300),h1Count:(htmlContent.match(/<h1[^>]*>/gi)||[]).length,imgCount:(htmlContent.match(/<img[^>]*>/gi)||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
                if (htmlContent) {
                    // QuillのAPIを使ってHTMLコンテンツを設定
                    // dangerouslyPasteHTMLを使用することで、HTMLタグを正しく解釈してDeltaに変換
                    this.quill.clipboard.dangerouslyPasteHTML(0, htmlContent);
                    
                    // #region agent log
                    const quillEditor = this.quill.root.querySelector('.ql-editor');
                    fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:377',message:'switchEditorMode: After setting Quill content',data:{quillEditorInnerHTML:quillEditor?.innerHTML?.substring(0,500),quillContentLength:quillEditor?.innerHTML?.length,h1Count:(quillEditor?.innerHTML?.match(/<h1[^>]*>/gi)||[]).length,imgCount:(quillEditor?.innerHTML?.match(/<img[^>]*>/gi)||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H'})}).catch(()=>{});
                    // #endregion
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
            htmlContainer?.classList.add('active');
            visualContainer?.classList.remove('active');
            // インラインスタイルを削除してCSSクラスで制御
            htmlContainer?.style.removeProperty('display');
            
            // 編集モードタブを非表示（HTMLモードでは使用しない）
            const editModeTabs = document.getElementById('editModeTabs');
            if (editModeTabs) {
                editModeTabs.style.display = 'none';
            }
            
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

    /**
     * 編集モードを切り替え（通常編集｜提案モード）
     */
    switchEditMode(mode) {
        this.currentEditMode = mode;
        
        const normalEditTab = document.getElementById('normalEditTab');
        const suggestionEditTab = document.getElementById('suggestionEditTab');
        
        if (mode === 'normal') {
            normalEditTab?.classList.add('active');
            suggestionEditTab?.classList.remove('active');
            normalEditTab?.classList.remove('suggestion-mode');
            suggestionEditTab?.classList.remove('suggestion-mode');
            
            // 提案マーカーを削除
            this.removeSuggestionMarkers();
            this.suggestionBaseContent = null;
            this.suggestionChanges = [];
            
            // フロートボタンを非表示
            const floatButtons = document.getElementById('suggestionFloatButtons');
            if (floatButtons) {
                floatButtons.style.display = 'none';
            }
        } else if (mode === 'suggestion') {
            suggestionEditTab?.classList.add('active');
            normalEditTab?.classList.remove('active');
            suggestionEditTab?.classList.add('suggestion-mode');
            
            // フロートボタンを表示
            const floatButtons = document.getElementById('suggestionFloatButtons');
            if (floatButtons) {
                floatButtons.style.display = 'flex';
            }
            
            // コメント履歴を更新
            this.updateCommentHistory();
            
            // 提案モードに切り替えた時、編集履歴を開始
            if (this.currentArticle && window.editHistoryManager) {
                const content = this.quill ? this.quill.root.innerHTML : '';
                const markdownContent = this.htmlToMarkdown(content);
                
                // ベースコンテンツを保存
                this.suggestionBaseContent = markdownContent;
                
                window.editHistoryManager.startEdit(this.currentArticle.id, markdownContent);
                console.log('提案モード: 編集履歴を開始しました');
            }
            
            // 既存の提案をマーカーで表示
            this.markExistingSuggestions();
        }
    }
    
    /**
     * 提案モード時の変更追跡を設定（改良版）
     */
    setupSuggestionTracking() {
        if (!this.quill) return;
        
        let lastContent = '';
        let isProcessing = false;
        let debounceTimer = null;
        
        // テキスト変更を監視
        this.quill.on('text-change', async () => {
            if (this.currentEditMode !== 'suggestion' || isProcessing) return;
            
            // デバウンス処理（500ms後に実行）
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                isProcessing = true;
                
                try {
                    const currentHtml = this.quill.root.innerHTML;
                    const currentMarkdown = this.htmlToMarkdown(currentHtml);
                    
                    if (this.suggestionBaseContent && currentMarkdown !== this.suggestionBaseContent) {
                        // 変更を検出してマーカーを追加
                        await this.markChanges(this.suggestionBaseContent, currentMarkdown);
                    }
                    
                    lastContent = currentMarkdown;
                } catch (e) {
                    console.error('変更追跡エラー:', e);
                } finally {
                    isProcessing = false;
                }
            }, 500);
        });
    }
    
    /**
     * 提案モード用のツールバーボタンを設定
     */
    setupSuggestionToolbarButtons() {
        // ツールバーのボタン
        const deletionBtn = document.getElementById('addDeletionMarkerBtn');
        const additionBtn = document.getElementById('addAdditionMarkerBtn');
        
        if (deletionBtn) {
            deletionBtn.addEventListener('click', () => {
                this.addDeletionMarker();
            });
        }
        
        if (additionBtn) {
            additionBtn.addEventListener('click', () => {
                this.addAdditionMarker();
            });
        }
        
        // フロートボタン
        const floatDeletionBtn = document.getElementById('floatDeletionBtn');
        const floatCommentBtn = document.getElementById('floatCommentBtn');
        
        if (floatDeletionBtn) {
            floatDeletionBtn.addEventListener('click', () => {
                this.addDeletionMarker();
            });
        }
        
        if (floatCommentBtn) {
            floatCommentBtn.addEventListener('click', () => {
                this.addCommentToSelection();
            });
        }
    }
    
    /**
     * 提案モード用のキーボードショートカットを設定
     */
    setupSuggestionKeyboardShortcuts() {
        if (!this.quill) return;
        
        this.quill.root.addEventListener('keydown', (e) => {
            if (this.currentEditMode !== 'suggestion') return;
            
            // Ctrl+Shift+D: 削除マーカー
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.addDeletionMarker();
            }
            
            // Ctrl+Shift+A: 追加マーカー
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                this.addAdditionMarker();
            }
        });
    }
    
    /**
     * 削除マーカーを追加（確実に動作する方法）
     */
    addDeletionMarker() {
        if (!this.quill || this.currentEditMode !== 'suggestion') {
            if (typeof showToast === 'function') {
                showToast('提案モードを選択してください', 'error');
            }
            return;
        }
        
        const selection = this.quill.getSelection(true);
        if (!selection || selection.length === 0) {
            if (typeof showToast === 'function') {
                showToast('テキストを選択してください', 'error');
            } else {
                alert('テキストを選択してください');
            }
            return;
        }
        
        try {
            const commentId = `del_${Date.now()}_${selection.index}`;
            
            // formatTextを使用（値はtrueで有効化）
            this.quill.formatText(selection.index, selection.length, 'deletion', true);
            
            // コメントIDを属性に設定
            setTimeout(() => {
                const leaf = this.quill.getLeaf(selection.index);
                if (leaf && leaf[0] && leaf[0].domNode) {
                    const node = leaf[0].domNode.closest('.suggestion-deletion') || leaf[0].domNode;
                    if (node) {
                        node.setAttribute('data-comment-id', commentId);
                        node.setAttribute('data-change-type', 'deletion');
                    }
                }
            }, 100);
            
            console.log('削除マーカーを追加しました:', selection);
            
            if (typeof showToast === 'function') {
                showToast('削除マーカーを追加しました', 'success');
            }
        } catch (e) {
            console.error('削除マーカー追加エラー:', e);
            if (typeof showToast === 'function') {
                showToast('削除マーカーの追加に失敗しました', 'error');
            }
        }
    }
    
    /**
     * 追加マーカーを追加（確実に動作する方法）
     */
    addAdditionMarker() {
        if (!this.quill || this.currentEditMode !== 'suggestion') {
            if (typeof showToast === 'function') {
                showToast('提案モードを選択してください', 'error');
            }
            return;
        }
        
        const selection = this.quill.getSelection(true);
        if (!selection || selection.length === 0) {
            if (typeof showToast === 'function') {
                showToast('テキストを選択してください', 'error');
            } else {
                alert('テキストを選択してください');
            }
            return;
        }
        
        try {
            const commentId = `add_${Date.now()}_${selection.index}`;
            
            // formatTextを使用（値はtrueで有効化）
            this.quill.formatText(selection.index, selection.length, 'addition', true);
            
            // コメントIDを属性に設定
            setTimeout(() => {
                const leaf = this.quill.getLeaf(selection.index);
                if (leaf && leaf[0] && leaf[0].domNode) {
                    const node = leaf[0].domNode.closest('.suggestion-addition') || leaf[0].domNode;
                    if (node) {
                        node.setAttribute('data-comment-id', commentId);
                        node.setAttribute('data-change-type', 'addition');
                    }
                }
            }, 100);
            
            console.log('追加マーカーを追加しました:', selection);
            
            if (typeof showToast === 'function') {
                showToast('追加マーカーを追加しました', 'success');
            }
        } catch (e) {
            console.error('追加マーカー追加エラー:', e);
            if (typeof showToast === 'function') {
                showToast('追加マーカーの追加に失敗しました', 'error');
            }
        }
    }
    
    /**
     * 選択範囲に提案マーカーを追加
     */
    addSuggestionMarker(range) {
        if (!this.quill || this.currentEditMode !== 'suggestion') return;
        
        const authMgr = window.authManager || authManager;
        if (!authMgr || !authMgr.isAuthenticated()) return;
        
        const user = authMgr.getCurrentUser();
        if (!user) return;
        
        try {
            // 選択範囲に提案マーカーを適用
            this.quill.formatText(range.index, range.length, 'suggestion', true);
        } catch (e) {
            console.error('提案マーカーの追加エラー:', e);
        }
    }
    
    /**
     * 既存の提案をマーカーで表示
     */
    async markExistingSuggestions() {
        if (!this.currentArticle || !window.editHistoryManager) return;
        
        try {
            const suggestions = await window.editHistoryManager.getSuggestions(this.currentArticle.id);
            const pendingSuggestions = suggestions.filter(s => s.status === 'pending');
            
            // 各提案の変更箇所をマーカーで表示
            // これは簡易実装で、実際の変更箇所の特定は複雑なので、
            // 保存時にマーカーを追加する方式に変更する方が良いかもしれません
        } catch (e) {
            console.error('既存提案のマーカー表示エラー:', e);
        }
    }
    
    /**
     * 変更箇所をマーカーで表示（改良版：選択範囲ベース）
     */
    async markChanges(originalContent, currentContent) {
        if (!window.editHistoryManager || !this.quill || this.currentEditMode !== 'suggestion') return;
        
        try {
            console.log('変更を検出しました。マーカーを追加します...');
            
            // 選択範囲がある場合は、その範囲にマーカーを追加
            const selection = this.quill.getSelection(true);
            if (selection && selection.length > 0) {
                const range = { index: selection.index, length: selection.length };
                
                // 選択範囲のテキストを取得
                const selectedText = this.quill.getText(range.index, range.length);
                
                // 選択範囲が元のコンテンツに存在するかチェック
                const isDeletion = originalContent.includes(selectedText);
                const isAddition = !isDeletion && selectedText.trim().length > 0;
                
                if (isDeletion) {
                    // 削除マーカーを追加
                    const commentId = `del_${Date.now()}_${range.index}`;
                    this.quill.formatText(range.index, range.length, 'deletion', {
                        commentId: commentId
                    });
                    console.log('削除マーカーを追加:', range);
                } else if (isAddition) {
                    // 追加マーカーを追加
                    const commentId = `add_${Date.now()}_${range.index}`;
                    this.quill.formatText(range.index, range.length, 'addition', {
                        commentId: commentId
                    });
                    console.log('追加マーカーを追加:', range);
                }
            } else {
                // 選択範囲がない場合は、diffを計算してマーカーを追加
                const diff = await window.editHistoryManager.calculateDiff(originalContent, currentContent);
                
                if (!diff || !diff.diffs || diff.diffs.length === 0) {
                    console.log('変更が検出されませんでした');
                    return;
                }
                
                console.log('Diff結果:', diff.diffs.length, '箇所の変更を検出');
                
                // Quillのテキストを取得
                const quillText = this.quill.getText();
                let textIndex = 0;
                
                // 変更箇所をQuillエディタに反映
                for (const [operation, text] of diff.diffs) {
                    if (operation === -1) {
                        // 削除: 取り消し線を追加
                        if (textIndex < quillText.length && text.trim().length > 0) {
                            const range = { 
                                index: textIndex, 
                                length: Math.min(text.length, quillText.length - textIndex) 
                            };
                            const commentId = `del_${Date.now()}_${textIndex}`;
                            try {
                                this.quill.formatText(range.index, range.length, 'deletion', {
                                    commentId: commentId
                                });
                                console.log('削除マーカーを追加:', range);
                            } catch (e) {
                                console.error('削除マーカー追加エラー:', e);
                            }
                        }
                    } else if (operation === 1) {
                        // 追加: 赤背景を追加
                        if (textIndex < quillText.length && text.trim().length > 0) {
                            const range = { 
                                index: textIndex, 
                                length: Math.min(text.length, quillText.length - textIndex) 
                            };
                            const commentId = `add_${Date.now()}_${textIndex}`;
                            try {
                                this.quill.formatText(range.index, range.length, 'addition', {
                                    commentId: commentId
                                });
                                console.log('追加マーカーを追加:', range);
                            } catch (e) {
                                console.error('追加マーカー追加エラー:', e);
                            }
                        }
                        textIndex += text.length;
                    } else {
                        // 変更なし
                        textIndex += text.length;
                    }
                }
            }
        } catch (e) {
            console.error('変更マーカー追加エラー:', e);
            console.error('エラー詳細:', e.stack);
        }
    }
    
    /**
     * コメントダイアログを表示
     */
    showCommentDialog(marker, commentId, changeType) {
        // 既存のコメントダイアログを削除
        const existingDialog = document.querySelector('.comment-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }
        
        const dialog = document.createElement('div');
        dialog.className = 'comment-dialog';
        dialog.innerHTML = `
            <div class="comment-dialog-content">
                <div class="comment-dialog-header">
                    <h4>コメントを追加</h4>
                    <button class="comment-dialog-close">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>
                <div class="comment-dialog-body">
                    <textarea class="comment-input-textarea" placeholder="コメントを入力してください..." rows="4"></textarea>
                </div>
                <div class="comment-dialog-footer">
                    <button class="btn-cancel">キャンセル</button>
                    <button class="btn-save-comment">保存</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // マーカーの位置にダイアログを配置
        const rect = marker.getBoundingClientRect();
        const dialogContent = dialog.querySelector('.comment-dialog-content');
        dialogContent.style.position = 'absolute';
        dialogContent.style.left = `${rect.right + 10}px`;
        dialogContent.style.top = `${rect.top}px`;
        dialogContent.style.zIndex = '10001';
        
        // イベントリスナー
        const closeBtn = dialog.querySelector('.comment-dialog-close');
        const cancelBtn = dialog.querySelector('.btn-cancel');
        const saveBtn = dialog.querySelector('.btn-save-comment');
        const textarea = dialog.querySelector('.comment-input-textarea');
        
        const closeDialog = () => dialog.remove();
        
        closeBtn?.addEventListener('click', closeDialog);
        cancelBtn?.addEventListener('click', closeDialog);
        
        saveBtn?.addEventListener('click', async () => {
            const commentText = textarea.value.trim();
            if (!commentText) return;
            
            // コメントを保存
            await this.saveComment(commentId, commentText, changeType);
            closeDialog();
        });
        
        // ダイアログ外をクリックで閉じる
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                closeDialog();
            }
        });
        
        // テキストエリアにフォーカス
        setTimeout(() => textarea?.focus(), 100);
    }
    
    /**
     * 選択範囲にコメントを追加
     */
    addCommentToSelection() {
        if (!this.quill || this.currentEditMode !== 'suggestion') {
            if (typeof showToast === 'function') {
                showToast('提案モードを選択してください', 'error');
            }
            return;
        }
        
        const selection = this.quill.getSelection(true);
        if (!selection || selection.length === 0) {
            if (typeof showToast === 'function') {
                showToast('テキストを選択してください', 'error');
            } else {
                alert('テキストを選択してください');
            }
            return;
        }
        
        // 選択範囲のテキストを取得
        const selectedText = this.quill.getText(selection.index, selection.length);
        const commentId = `comment_${Date.now()}_${selection.index}`;
        
        // コメントダイアログを表示
        this.showCommentDialogForSelection(selection, selectedText, commentId);
    }
    
    /**
     * 選択範囲用のコメントダイアログを表示
     */
    showCommentDialogForSelection(selection, selectedText, commentId) {
        // 既存のコメントダイアログを削除
        const existingDialog = document.querySelector('.comment-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }
        
        const dialog = document.createElement('div');
        dialog.className = 'comment-dialog';
        dialog.innerHTML = `
            <div class="comment-dialog-content">
                <div class="comment-dialog-header">
                    <h4>コメントを追加</h4>
                    <button class="comment-dialog-close">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>
                <div class="comment-dialog-body">
                    <div style="margin-bottom: 0.5rem; font-size: 0.85rem; color: #6b7280;">
                        選択範囲: "${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}"
                    </div>
                    <textarea class="comment-input-textarea" placeholder="コメントを入力してください..." rows="4"></textarea>
                </div>
                <div class="comment-dialog-footer">
                    <button class="btn-cancel">キャンセル</button>
                    <button class="btn-save-comment">保存</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // フロートボタンの位置にダイアログを配置
        const floatButtons = document.getElementById('suggestionFloatButtons');
        const rect = floatButtons ? floatButtons.getBoundingClientRect() : { right: window.innerWidth - 20, top: window.innerHeight - 200 };
        const dialogContent = dialog.querySelector('.comment-dialog-content');
        dialogContent.style.position = 'absolute';
        dialogContent.style.right = `${window.innerWidth - rect.right}px`;
        dialogContent.style.bottom = `${window.innerHeight - rect.top + 10}px`;
        dialogContent.style.zIndex = '10001';
        
        // イベントリスナー
        const closeBtn = dialog.querySelector('.comment-dialog-close');
        const cancelBtn = dialog.querySelector('.btn-cancel');
        const saveBtn = dialog.querySelector('.btn-save-comment');
        const textarea = dialog.querySelector('.comment-input-textarea');
        
        const closeDialog = () => dialog.remove();
        
        closeBtn?.addEventListener('click', closeDialog);
        cancelBtn?.addEventListener('click', closeDialog);
        
        saveBtn?.addEventListener('click', async () => {
            const commentText = textarea.value.trim();
            if (!commentText) return;
            
            // コメントを保存
            await this.saveComment(commentId, commentText, 'comment', selection, selectedText);
            closeDialog();
        });
        
        // ダイアログ外をクリックで閉じる
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                closeDialog();
            }
        });
        
        // テキストエリアにフォーカス
        setTimeout(() => textarea?.focus(), 100);
    }
    
    /**
     * コメントを保存
     */
    async saveComment(commentId, commentText, changeType, selection = null, selectedText = '') {
        if (!this.currentArticle || !window.editHistoryManager) return;
        
        const authMgr = window.authManager || authManager;
        if (!authMgr || !authMgr.isAuthenticated()) {
            if (typeof showToast === 'function') {
                showToast('コメントするにはログインが必要です', 'error');
            } else {
                alert('コメントするにはログインが必要です');
            }
            return;
        }
        
        const user = authMgr.getCurrentUser();
        
        // 選択範囲がある場合はマーカー（青背景）を適用
        if (selection && changeType === 'comment') {
            try {
                this.quill.formatText(selection.index, selection.length, 'comment', {
                    commentId: commentId
                });
            } catch (e) {
                console.error('コメントマーカーの適用に失敗:', e);
            }
        }
        
        // コメントデータを作成
        const commentData = {
            id: commentId,
            type: changeType, // 'deletion', 'addition', or 'comment'
            comment: commentText,
            userId: user.uid,
            userName: user.displayName || user.email,
            userAvatar: user.photoURL || null,
            timestamp: new Date().toISOString(),
            selection: selection ? { index: selection.index, length: selection.length } : null,
            selectedText: selectedText,
            replies: [] // 返信リストを初期化
        };
        
        // コメントを変更履歴に保存
        this.suggestionChanges.push(commentData);
        
        // コメント履歴を更新
        this.updateCommentHistory();
        
        console.log('コメントを保存しました:', commentId, commentText);
        
        if (typeof showToast === 'function') {
            showToast('コメントを追加しました', 'success');
        }
    }
    
    /**
     * 返信を保存
     */
    async saveReply(commentId, replyText) {
        if (!this.currentArticle) return;
        
        const authMgr = window.authManager || authManager;
        if (!authMgr || !authMgr.isAuthenticated()) {
            if (typeof showToast === 'function') {
                showToast('返信するにはログインが必要です', 'error');
            }
            return;
        }
        
        const user = authMgr.getCurrentUser();
        
        // コメントを検索
        const commentIndex = this.suggestionChanges.findIndex(c => c.id === commentId);
        if (commentIndex === -1) {
            console.error('コメントが見つかりません:', commentId);
            return;
        }
        
        // 返信データを作成
        const reply = {
            id: `reply_${Date.now()}`,
            text: replyText,
            userId: user.uid,
            userName: user.displayName || user.email,
            userAvatar: user.photoURL || null,
            timestamp: new Date().toISOString()
        };
        
        // 返信を追加
        if (!this.suggestionChanges[commentIndex].replies) {
            this.suggestionChanges[commentIndex].replies = [];
        }
        this.suggestionChanges[commentIndex].replies.push(reply);
        
        // UI更新
        this.updateCommentHistory();
        
        if (typeof showToast === 'function') {
            showToast('返信を追加しました', 'success');
        }
    }

    /**
     * コメント箇所へスクロール
     */
    scrollToComment(commentId) {
        if (!this.quill) return;
        
        // コメントIDを持つ要素を検索
        // data-comment-id属性を持つ要素を探す（標準的な方法）
        const selector = `[data-comment-id="${commentId}"]`;
        const element = this.quill.root.querySelector(selector);
        
        if (element) {
            // 要素が見つかった場合はスクロール
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // ハイライト表示（一時的にクラスを追加）
            element.classList.add('active');
            setTimeout(() => {
                element.classList.remove('active');
            }, 2000);
        } else {
            // 要素が見つからない場合、選択範囲情報から位置を特定してスクロール
            const comment = this.suggestionChanges.find(c => c.id === commentId);
            if (comment && comment.selection) {
                this.quill.setSelection(comment.selection.index, comment.selection.length);
                this.quill.scrollIntoView();
            }
        }
    }
    
    /**
     * コメント履歴を更新
     */
    updateCommentHistory() {
        const historyList = document.getElementById('commentHistoryList');
        if (!historyList) return;
        
        // コメントを時系列順にソート（新しい順）
        const sortedComments = [...this.suggestionChanges].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
        
        if (sortedComments.length === 0) {
            historyList.innerHTML = '<div class="comment-history-empty">コメントはまだありません</div>';
            return;
        }
        
        historyList.innerHTML = sortedComments.map(comment => {
            const date = new Date(comment.timestamp);
            const dateStr = date.toLocaleString('ja-JP', { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            // 返信のHTML生成
            const repliesHtml = (comment.replies || []).map(reply => {
                const rDate = new Date(reply.timestamp);
                const rDateStr = rDate.toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                return `
                    <div class="comment-reply-item">
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #6b7280; margin-bottom: 2px;">
                            <span>${reply.userName}</span>
                            <span>${rDateStr}</span>
                        </div>
                        <div>${this.escapeHtml(reply.text)}</div>
                    </div>
                `;
            }).join('');
            
            return `
                <div class="comment-history-item" data-comment-id="${comment.id}" onclick="if(!event.target.closest('.reply-input-container')) window.rewriteSystem.scrollToComment('${comment.id}')">
                    <div class="comment-history-user">
                        ${comment.userAvatar ? 
                            `<img src="${comment.userAvatar}" alt="" class="comment-user-avatar">` : 
                            `<span class="material-icons-round">account_circle</span>`
                        }
                        <span class="comment-user-name">${comment.userName || '不明'}</span>
                        <span class="comment-date">${dateStr}</span>
                    </div>
                    <div class="comment-history-text">${this.escapeHtml(comment.comment)}</div>
                    ${comment.selectedText ? `<div class="comment-selected-text">選択範囲: "${this.escapeHtml(comment.selectedText.substring(0, 30))}${comment.selectedText.length > 30 ? '...' : ''}"</div>` : ''}
                    
                    <div class="comment-reply-list">
                        ${repliesHtml}
                        <div class="reply-input-container">
                            <input type="text" class="reply-input" placeholder="返信を入力..." onclick="event.stopPropagation()">
                            <button class="reply-btn" onclick="event.stopPropagation(); window.rewriteSystem.handleReply('${comment.id}', this)">返信</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 返信ボタンハンドラ
     */
    handleReply(commentId, btnElement) {
        const container = btnElement.closest('.reply-input-container');
        const input = container.querySelector('.reply-input');
        const text = input.value.trim();
        
        if (text) {
            this.saveReply(commentId, text);
            input.value = ''; // 入力をクリア
        }
    }
    
    /**
     * HTMLエスケープ
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 提案マーカーを削除
     */
    removeSuggestionMarkers() {
        if (!this.quill) return;
        
        // 提案マーカーを削除
        const markers = this.quill.root.querySelectorAll('.suggestion-marker');
        markers.forEach(marker => {
            const range = this.quill.getBounds(marker);
            if (range) {
                this.quill.formatText(range.index, range.length, 'suggestion', false);
            }
        });
        
        // 削除マーカーと追加マーカーも削除
        const deletionMarkers = this.quill.root.querySelectorAll('.suggestion-deletion');
        deletionMarkers.forEach(marker => {
            const range = this.quill.getBounds(marker);
            if (range) {
                this.quill.formatText(range.index, range.length, 'deletion', false);
            }
        });
        
        const additionMarkers = this.quill.root.querySelectorAll('.suggestion-addition');
        additionMarkers.forEach(marker => {
            const range = this.quill.getBounds(marker);
            if (range) {
                this.quill.formatText(range.index, range.length, 'addition', false);
            }
        });
    }
    
    /**
     * 提案ツールチップを表示
     */
    showSuggestionTooltip(marker, suggestionId, userName) {
        // 既存のツールチップを削除
        const existingTooltip = document.querySelector('.suggestion-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
        
        const tooltip = document.createElement('div');
        tooltip.className = 'suggestion-tooltip';
        tooltip.innerHTML = `
            <div class="tooltip-header">
                <span class="material-icons-round" style="font-size: 16px; color: #f59e0b;">rate_review</span>
                <strong>提案</strong>
            </div>
            <div class="tooltip-content">
                <div>編集者: ${userName || '不明'}</div>
                <div style="font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem;">
                    クリックして詳細を表示
                </div>
            </div>
        `;
        
        document.body.appendChild(tooltip);
        
        // マーカーの位置にツールチップを配置
        const rect = marker.getBoundingClientRect();
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.top = `${rect.bottom + 5}px`;
        
        // 3秒後に自動で削除
        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.remove();
            }
        }, 3000);
        
        // クリックで詳細を表示
        tooltip.addEventListener('click', () => {
            if (suggestionId && window.suggestionUIManager) {
                window.suggestionUIManager.showDiff(suggestionId);
            }
            tooltip.remove();
        });
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
        
        // 保存済みのMarkdownがあるかチェック
        const slug = this.getSlugFromUrl(article.url);
        const savedContent = await dataManager.loadMarkdown(`${slug}.md`);
        const hasSavedContent = !!savedContent;
        
        // UIを更新
        this.updateUrlModalUI(hasSavedContent);
        
        if (urlModal) {
            urlModal.classList.add('active');
        }
    }

    updateUrlModalUI(hasSavedContent) {
        const autoFetchBtn = document.getElementById('autoFetchBtn');
        const openUrlBtn = document.getElementById('openUrlBtn');
        const proceedToEditorBtn = document.getElementById('proceedToEditorBtn');
        const buttonContainer = autoFetchBtn?.parentElement;
        
        // 「空のエディタで開く」と「ブラウザで開く」を非表示
        if (openUrlBtn) openUrlBtn.style.display = 'none';
        if (proceedToEditorBtn) proceedToEditorBtn.style.display = 'none';
        
        // 「または」のdivを非表示
        const orDiv = buttonContainer?.querySelector('.or-divider');
        if (orDiv) orDiv.style.display = 'none';
        
        // 既存の保存済みボタンを削除（存在する場合）
        const existingLoadSavedBtn = document.getElementById('loadSavedBtn');
        if (existingLoadSavedBtn) existingLoadSavedBtn.remove();
        
        if (hasSavedContent) {
            // 保存済みがある場合：選択肢を表示
            let currentAutoFetchBtn = autoFetchBtn;
            if (autoFetchBtn) {
                // イベントリスナーを再設定（ボタンの内容も更新）
                // setupAutoFetchButtonはボタンを置き換えるため、新しい参照を取得
                const newBtn = this.setupAutoFetchButton(autoFetchBtn);
                if (newBtn) {
                    currentAutoFetchBtn = newBtn; // 置き換え後のボタン参照を保存
                    newBtn.innerHTML = `
                        <span class="material-icons-round">auto_fix_high</span>
                        記事内容を自動取得して編集（一からやり直す）
                    `;
                }
            }
            
            // 保存済みを引き継ぐボタンを追加（置き換え後のボタンの前に挿入）
            if (buttonContainer && currentAutoFetchBtn && !document.getElementById('loadSavedBtn')) {
                const loadSavedBtn = document.createElement('button');
                loadSavedBtn.id = 'loadSavedBtn';
                loadSavedBtn.className = 'btn btn-primary';
                loadSavedBtn.style.cssText = 'padding: 1rem; font-size: 1.1rem; justify-content: center; background: linear-gradient(135deg, #3b82f6, #2563eb); box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);';
                loadSavedBtn.innerHTML = `
                    <span class="material-icons-round">history</span>
                    保存済み内容を引き継いで編集
                `;
                
                // insertBeforeを使用する前に、currentAutoFetchBtnがbuttonContainerの子要素であることを確認
                if (currentAutoFetchBtn.parentNode === buttonContainer) {
                    buttonContainer.insertBefore(loadSavedBtn, currentAutoFetchBtn);
                } else {
                    // 親要素が異なる場合は、先頭に追加
                    buttonContainer.insertBefore(loadSavedBtn, buttonContainer.firstChild);
                }
                
                loadSavedBtn.addEventListener('click', async () => {
                    await this.loadSavedAndOpenEditor();
                });
            }
        } else {
            // 保存済みがない場合：通常の表示
            if (autoFetchBtn) {
                // イベントリスナーを再設定（ボタンの内容も更新）
                const newBtn = this.setupAutoFetchButton(autoFetchBtn);
                if (newBtn) {
                    newBtn.innerHTML = `
                        <span class="material-icons-round">auto_fix_high</span>
                        記事内容を自動取得して編集
                    `;
                }
            }
        }
    }
    
    setupAutoFetchButton(autoFetchBtn) {
        // 既存のイベントリスナーを削除してから追加（innerHTML変更でリスナーが削除されるため）
        const urlModal = document.getElementById('urlModal');
        
        // ボタンをクローンして置き換える（既存のリスナーを削除）
        const newBtn = autoFetchBtn.cloneNode(true);
        autoFetchBtn.parentNode.replaceChild(newBtn, autoFetchBtn);
        newBtn.dataset.listenerAttached = 'true';
        
        newBtn.addEventListener('click', async (e) => {
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
            
            console.log('[DEBUG] 記事取得開始:', url);
            
            // ローカル環境かVercel環境かを自動検出（スコープ外で定義）
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            try {
                const apiUrl = isLocal 
                    ? `http://localhost:8000/api/fetch?url=${encodeURIComponent(url)}`
                    : `/api/fetch?url=${encodeURIComponent(url)}`;
                
                console.log(`[DEBUG] Fetching from: ${apiUrl}`);
                console.log(`[DEBUG] isLocal: ${isLocal}, hostname: ${window.location.hostname}`);
                
                // タイムアウト設定（30秒）
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    console.error('[DEBUG] タイムアウト発生（30秒経過）');
                    controller.abort();
                }, 30000);
                
                let response;
                try {
                    console.log('[DEBUG] fetch開始...');
                    response = await fetch(apiUrl, {
                        signal: controller.signal
                    });
                    console.log('[DEBUG] fetch完了, status:', response.status, response.statusText);
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    console.error('[DEBUG] fetchエラー:', fetchError);
                    console.error('[DEBUG] fetchエラー詳細:', {
                        name: fetchError.name,
                        message: fetchError.message,
                        stack: fetchError.stack
                    });
                    if (fetchError.name === 'AbortError') {
                        throw new Error('リクエストがタイムアウトしました（30秒）。サーバーが応答していない可能性があります。');
                    }
                    // ネットワークエラーの詳細を取得
                    if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError')) {
                        throw new Error('サーバーに接続できません。ローカルサーバーが起動しているか確認してください。\n\n起動方法:\npython3 server.py');
                    }
                    throw fetchError;
                }
                clearTimeout(timeoutId);
                
                console.log('[DEBUG] レスポンスステータス確認:', response.ok);
                
                if (!response.ok) {
                    console.error('[DEBUG] レスポンスエラー:', response.status, response.statusText);
                    // エラーレスポンスのJSONを取得
                    let errorMessage = `HTTPエラー: ${response.status}`;
                    try {
                        const errorData = await response.json();
                        console.error('[DEBUG] エラーデータ:', errorData);
                        if (errorData.error) {
                            errorMessage = `${errorMessage} - ${errorData.error}`;
                        }
                    } catch (e) {
                        console.error('[DEBUG] JSONパースエラー:', e);
                        // JSONパースに失敗した場合はテキストを取得
                        try {
                            const errorText = await response.text();
                            console.error('[DEBUG] エラーテキスト:', errorText.substring(0, 500));
                            if (errorText) {
                                errorMessage = `${errorMessage} - ${errorText.substring(0, 200)}`;
                            }
                        } catch (e2) {
                            console.error('[DEBUG] テキスト取得エラー:', e2);
                        }
                    }
                    throw new Error(errorMessage);
                }
                
                console.log('[DEBUG] JSONパース開始...');
                const data = await response.json();
                console.log('[DEBUG] JSONパース完了, success:', data.success, 'content length:', data.content?.length);

                if (data.success && data.content) {
                    console.log('[DEBUG] コンテンツ取得成功、エディタを開きます');
                    statusDiv.innerHTML = '<span style="color: var(--success-color);">✓ 取得成功！エディタを開きます...</span>';
                    
                    // URLモーダルを閉じる
                    if (urlModal) urlModal.classList.remove('active');
                    
                    // 少し待ってからエディタを開く（アニメーション完了を待つ）
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    // エディタを開く
                    try {
                        await this.openRewriteModal(this.currentArticle, data.content);
                        console.log('[DEBUG] エディタを開きました');
                    } catch (modalError) {
                        console.error('エディタを開く際にエラー:', modalError);
                        alert('エディタを開く際にエラーが発生しました。ページをリロードして再試行してください。');
                    }
                } else {
                    console.error('[DEBUG] データが不正:', data);
                    throw new Error(data.error || 'コンテンツを取得できませんでした');
                }
            } catch (error) {
                console.error('[DEBUG] ===== エラー発生 =====');
                console.error('Fetch error:', error);
                console.error('Error details:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                    url: url,
                    isLocal: isLocal
                });
                
                // より詳細なエラーメッセージを表示
                let errorMsg = error.message;
                if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ERR_CONNECTION_REFUSED')) {
                    errorMsg = 'サーバーに接続できません。ローカルサーバーが起動しているか確認してください。\n\n起動方法:\npython3 server.py\nまたは\n./start_local.sh';
                } else if (error.message.includes('500')) {
                    errorMsg = `サーバーエラー: ${error.message}\n\nサーバーのログを確認してください。`;
                } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
                    errorMsg = 'ネットワークエラーが発生しました。サーバーが起動しているか確認してください。';
                }
                
                statusDiv.innerHTML = `<span style="color: var(--danger-color);">⚠ エラー: ${errorMsg}<br><br><button id="retryFetchBtn" style="margin-top: 10px; padding: 8px 16px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">再試行</button><br><br>手動でコピーする場合は「次へ進む」ボタンをクリックしてください。</span>`;
                
                // 再試行ボタンのイベントリスナーを追加
                const retryBtn = document.getElementById('retryFetchBtn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        newBtn.click();
                    });
                }
            }
        });
        
        // グローバル参照を更新（updateUrlModalUIで使用するため）
        return newBtn;
    }

    async loadSavedAndOpenEditor() {
        const slug = this.getSlugFromUrl(this.currentArticle.url);
        const savedContent = await dataManager.loadMarkdown(`${slug}.md`);
        
        if (!savedContent) {
            alert('保存済みの内容が見つかりませんでした。');
            return;
        }
        
        // URLモーダルを閉じる
        const urlModal = document.getElementById('urlModal');
        if (urlModal) urlModal.classList.remove('active');
        
        // 保存済み内容でエディタを開く
        await this.openRewriteModal(this.currentArticle, savedContent);
    }

    async openRewriteModal(article, fetchedContent = null) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:674',message:'openRewriteModal: Entry',data:{articleTitle:article.title,hasFetchedContent:!!fetchedContent},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        
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
        
        // モーダルを開く
        modal.classList.add('active');
        
        // モーダルが開いたことを確認してから処理を続行
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // #region agent log
        const checklistScore = document.getElementById('checklistScore');
        const scoreRank = document.getElementById('scoreRank');
        const scoreNumber = document.getElementById('scoreNumber');
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:692',message:'openRewriteModal: Modal opened, checking HTML structure',data:{checklistScoreExists:!!checklistScore,checklistScoreHTML:checklistScore?.innerHTML?.substring(0,500),scoreRankExists:!!scoreRank,scoreNumberExists:!!scoreNumber},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
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

        // 保存ボタンのイベントリスナーを再設定（モーダルが開かれた後に設定）
        const saveBtn = document.querySelector('[data-action="save"]');
        if (saveBtn) {
            // 既存のイベントリスナーを削除（重複を防ぐ）
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            
            newSaveBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    await this.saveArticle();
                } catch (error) {
                    console.error('保存エラー:', error);
                    alert('保存に失敗しました: ' + error.message);
                }
            });
        }

        const slug = this.getSlugFromUrl(article.url);
        let content = null;
        
        // fetchedContentが存在する場合は、それを優先的に使用（実際のWebサイトから取得した最新の内容）
        if (fetchedContent) {
            // fetchedContentをそのまま使用（H1の追加はしない）
            // removeDuplicateH1AndEyeCatchで処理されるため、ここでは追加しない
            content = fetchedContent;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:510',message:'openRewriteModal: Using fetchedContent (priority)',data:{fetchedContentLength:fetchedContent.length,fetchedContentPreview:fetchedContent.substring(0,200),h1Count:(fetchedContent.match(/^#\s+/gm)||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
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
        
        // 編集履歴の開始（元のコンテンツを保存）
        const historyManager = window.editHistoryManager || editHistoryManager;
        if (historyManager && article) {
            console.log('編集履歴を開始します:', article.id, content.substring(0, 100) + '...');
            historyManager.startEdit(article.id, content);
        } else {
            if (!historyManager) {
                console.warn('editHistoryManagerが見つかりません');
            }
            if (!article) {
                console.warn('articleが設定されていません');
            }
        }
        
        // 提案履歴を表示
        if (suggestionUIManager) {
            await suggestionUIManager.renderSuggestions(article.id);
        }
        
        // リフレッシュボタンのイベントリスナー
        const refreshSuggestionsBtn = document.getElementById('refreshSuggestionsBtn');
        if (refreshSuggestionsBtn) {
            refreshSuggestionsBtn.addEventListener('click', async () => {
                if (suggestionUIManager && article.id) {
                    await suggestionUIManager.renderSuggestions(article.id);
                }
            });
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:531',message:'openRewriteModal: Content before markdownToHtml',data:{contentLength:content.length,contentPreview:content.substring(0,300),h1Count:(content.match(/^#\s+/gm)||[]).length,imgCount:(content.match(/!\[.*?\]\(.*?\)/g)||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
        // #endregion

        // コンテンツをMarkdownからHTMLに変換
        let htmlContent = this.markdownToHtml(content);
        
        // HTML変換後も重複するH1とアイキャッチ画像を削除（念のため）
        htmlContent = this.removeDuplicateH1AndEyeCatchFromHtml(htmlContent);
        
        // 画像URLを絶対URLに変換（相対URLの場合）
        htmlContent = this.convertImageUrlsToAbsolute(htmlContent, article.url);
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:540',message:'openRewriteModal: HTML content after markdownToHtml and cleanup',data:{htmlContentLength:htmlContent.length,htmlContentPreview:htmlContent.substring(0,500),h1Count:(htmlContent.match(/<h1[^>]*>/gi)||[]).length,imgCount:(htmlContent.match(/<img[^>]*>/gi)||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        // HTMLエディタにコンテンツを設定（先に設定）
        // HTMLを整形して改行を追加（見やすくするため）
        // より読みやすい形式に整形
        const formattedHtml = htmlContent
            .replace(/></g, '>\n<') // タグの間に改行を追加
            .replace(/\n\n+/g, '\n\n') // 連続する改行を2つに統一
            .replace(/\n<h/g, '\n\n<h') // 見出しタグの前に空行を追加
            .replace(/\n<p/g, '\n\n<p') // 段落タグの前に空行を追加
            .replace(/\n<ul/g, '\n\n<ul') // リストタグの前に空行を追加
            .replace(/<\/h[1-6]>\n/g, '</h$1>\n\n') // 見出しタグの後に空行を追加
            .replace(/<\/p>\n/g, '</p>\n\n') // 段落タグの後に空行を追加
            .replace(/<\/ul>\n/g, '</ul>\n\n') // リストタグの後に空行を追加
            .replace(/\n\n\n+/g, '\n\n') // 3つ以上の連続する改行を2つに
            .trim();
        
        const htmlEditor = document.getElementById('htmlEditor');
        if (htmlEditor) {
            htmlEditor.value = '';
            htmlEditor.value = formattedHtml;
        }
        
        // デフォルトでビジュアルモードを表示（先に切り替え、同期をスキップ）
        this.switchEditorMode('visual', true);
        
        // エディタの初期化を確実に行うために少し待つ
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Quillエディタをクリアしてからコンテンツを設定（モード切り替え後）
        if (this.quill) {
            // 既存のイベントリスナーを削除（重複を防ぐ）
            this.quill.off('text-change');
            
            // エディタを完全にクリア
            this.quill.setText('');
            
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:548',message:'openRewriteModal: Before setting Quill content',data:{htmlContentLength:htmlContent.length,htmlContentPreview:htmlContent.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            
            // QuillのAPIを使ってHTMLコンテンツを設定
            // dangerouslyPasteHTMLはHTMLをDeltaに変換して挿入する正規の方法
            this.quill.clipboard.dangerouslyPasteHTML(0, htmlContent);
            
            // #region agent log
            const quillEditor = this.quill.root.querySelector('.ql-editor');
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:551',message:'openRewriteModal: After setting Quill content',data:{quillEditorInnerHTML:quillEditor?.innerHTML?.substring(0,500),quillContentLength:quillEditor?.innerHTML?.length,h1Count:(quillEditor?.innerHTML?.match(/<h1[^>]*>/gi)||[]).length,imgCount:(quillEditor?.innerHTML?.match(/<img[^>]*>/gi)||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
            // #endregion
            
            // Quillエディタの変更を監視してチェックリストを更新
            this.quill.on('text-change', () => {
                const htmlContent = this.quill.root.innerHTML;
                const markdownContent = this.htmlToMarkdown(htmlContent);
                this.updateChecklist(article, markdownContent);
            });
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:827',message:'openRewriteModal: Before renderChecklist',data:{articleTitle:article.title,contentLength:content?.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
        
        this.renderChecklist(article, content);
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:853',message:'openRewriteModal: After renderChecklist, before updateChecklist',data:{checklistItemsLength:this.checklistItems?.length,checklistScoreHTML:document.getElementById('checklistScore')?.innerHTML?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'I'})}).catch(()=>{});
        // #endregion
        
        this.updateChecklist(article, content);
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:859',message:'openRewriteModal: After updateChecklist',data:{checklistScoreHTML:document.getElementById('checklistScore')?.innerHTML?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'J'})}).catch(()=>{});
        // #endregion
        
        // エディタが正しく表示されているか確認
        const visualEditor = document.querySelector('.ql-editor');
        // htmlEditorは既に586行目で宣言済み
        
        if (!visualEditor && !htmlEditor) {
            console.warn('エディタ要素が見つかりません');
        } else {
            console.log('[DEBUG] エディタモーダルが正常に開きました');
        }
        
        // アコーディオンのイベントリスナーを設定
        const improvementAccordionHeader = document.getElementById('improvementAccordionHeader');
        const checklistItems = document.getElementById('checklistItems');
        
        if (improvementAccordionHeader && checklistItems) {
            // デフォルトで開いた状態にする
            improvementAccordionHeader.classList.add('active');
            checklistItems.classList.add('active');
            
            // クリックで開閉
            improvementAccordionHeader.addEventListener('click', () => {
                const isActive = improvementAccordionHeader.classList.contains('active');
                if (isActive) {
                    improvementAccordionHeader.classList.remove('active');
                    checklistItems.classList.remove('active');
                } else {
                    improvementAccordionHeader.classList.add('active');
                    checklistItems.classList.add('active');
                }
            });
        }
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
        
        // #region agent log
        const initialH1Count = (content.match(/^#\s+/gm) || []).length;
        const initialImgCount = (content.match(/^!\[.*?\]\(.*?\)/gm) || []).length;
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:595',message:'removeDuplicateH1AndEyeCatch: Before processing',data:{contentLength:content.length,initialH1Count:initialH1Count,initialImgCount:initialImgCount,contentPreview:content.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'L'})}).catch(()=>{});
        // #endregion
        
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
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:610',message:'removeDuplicateH1AndEyeCatch: First H1 found',data:{lineNumber:i,line:line},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'M'})}).catch(()=>{});
                    // #endregion
                } else {
                    // 2つ目以降のH1はH2に変換
                    const h2Line = line.replace(/^#\s+/, '## ');
                    result.push(h2Line);
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:616',message:'removeDuplicateH1AndEyeCatch: Duplicate H1 converted to H2',data:{lineNumber:i,originalLine:line,convertedLine:h2Line},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'N'})}).catch(()=>{});
                    // #endregion
                }
            }
            // アイキャッチ画像のチェック（Markdown形式: ![alt](url)）
            else if (trimmedLine.match(/^!\[.*?\]\(.*?\)/)) {
                if (!eyeCatchFound && h1Found) {
                    // H1の直後の最初の画像をアイキャッチとして保持
                    result.push(line);
                    eyeCatchFound = true;
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:625',message:'removeDuplicateH1AndEyeCatch: First eye-catch image found',data:{lineNumber:i,line:line},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'O'})}).catch(()=>{});
                    // #endregion
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
        
        const processedContent = result.join('\n');
        // #region agent log
        const finalH1Count = (processedContent.match(/^#\s+/gm) || []).length;
        const finalImgCount = (processedContent.match(/^!\[.*?\]\(.*?\)/gm) || []).length;
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:645',message:'removeDuplicateH1AndEyeCatch: After processing',data:{processedContentLength:processedContent.length,finalH1Count:finalH1Count,finalImgCount:finalImgCount,processedContentPreview:processedContent.substring(0,500),h1Found:h1Found,eyeCatchFound:eyeCatchFound},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'P'})}).catch(()=>{});
        // #endregion
        
        return processedContent;
    }

    /**
     * HTML形式のコンテンツから重複するH1とアイキャッチ画像を削除（最初の1つだけを保持）
     */
    removeDuplicateH1AndEyeCatchFromHtml(htmlContent) {
        if (!htmlContent) return htmlContent;
        
        // #region agent log
        const initialH1Count = (htmlContent.match(/<h1[^>]*>/gi) || []).length;
        const initialImgCount = (htmlContent.match(/<img[^>]*>/gi) || []).length;
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:668',message:'removeDuplicateH1AndEyeCatchFromHtml: Before processing',data:{htmlContentLength:htmlContent.length,initialH1Count:initialH1Count,initialImgCount:initialImgCount},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'Q'})}).catch(()=>{});
        // #endregion
        
        // H1タグをすべて取得
        const h1Matches = htmlContent.match(/<h1[^>]*>.*?<\/h1>/gi);
        if (h1Matches && h1Matches.length > 1) {
            // 最初のH1以外をH2に変換
            let h1Count = 0;
            htmlContent = htmlContent.replace(/<h1[^>]*>(.*?)<\/h1>/gi, (match, text) => {
                h1Count++;
                if (h1Count === 1) {
                    return match; // 最初のH1はそのまま
                } else {
                    return `<h2>${text.trim()}</h2>`; // 2つ目以降はH2に変換
                }
            });
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:678',message:'removeDuplicateH1AndEyeCatchFromHtml: Converted duplicate H1 tags to H2',data:{convertedH1Count:h1Matches.length-1},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'R'})}).catch(()=>{});
            // #endregion
        }
        
        // 画像タグをすべて取得（最初の1つだけを保持）
        const imgMatches = [...htmlContent.matchAll(/<img[^>]*>/gi)];
        if (imgMatches.length > 1) {
            // 最初の画像の位置
            const firstImgIndex = imgMatches[0].index;
            
            // 削除する画像を特定（最初の画像から1000文字以内の重複画像）
            // より広い範囲で重複を検出
            const imagesToRemove = [];
            for (let i = 1; i < imgMatches.length; i++) {
                const currentImgIndex = imgMatches[i].index;
                // 最初の画像から1000文字以内、または最初のH1から1000文字以内の画像を削除
                if (currentImgIndex < firstImgIndex + 1000) {
                    imagesToRemove.push(imgMatches[i]);
                }
            }
            
            // 後ろから削除することで、インデックスのずれを防ぐ
            for (const imgToRemove of imagesToRemove.reverse()) {
                // 正確にマッチするように、エスケープされた文字列を使用
                const escapedMatch = imgToRemove[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                htmlContent = htmlContent.substring(0, imgToRemove.index) + 
                             htmlContent.substring(imgToRemove.index + imgToRemove[0].length);
            }
            
            // #region agent log
            if (imagesToRemove.length > 0) {
                fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:692',message:'removeDuplicateH1AndEyeCatchFromHtml: Removed duplicate images',data:{removedImgCount:imagesToRemove.length,initialImgCount:imgMatches.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'S'})}).catch(()=>{});
            }
            // #endregion
        }
        
        // #region agent log
        const finalH1Count = (htmlContent.match(/<h1[^>]*>/gi) || []).length;
        const finalImgCount = (htmlContent.match(/<img[^>]*>/gi) || []).length;
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:700',message:'removeDuplicateH1AndEyeCatchFromHtml: After processing',data:{htmlContentLength:htmlContent.length,finalH1Count:finalH1Count,finalImgCount:finalImgCount},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'T'})}).catch(()=>{});
        // #endregion
        
        return htmlContent;
    }

    convertImageUrlsToAbsolute(htmlContent, articleUrl) {
        if (!htmlContent || !articleUrl) return htmlContent;
        
        try {
            // 記事URLからベースURLを取得
            const articleUrlObj = new URL(articleUrl);
            const baseUrl = `${articleUrlObj.protocol}//${articleUrlObj.host}`;
            
            // 画像タグのsrc属性を絶対URLに変換
            htmlContent = htmlContent.replace(/<img([^>]*)\ssrc="([^"]*)"([^>]*)>/gi, (match, before, src, after) => {
                // すでに絶対URLの場合はそのまま
                if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
                    return match;
                }
                
                // 相対URLを絶対URLに変換
                let absoluteUrl;
                if (src.startsWith('/')) {
                    // ルート相対URL
                    absoluteUrl = baseUrl + src;
                } else {
                    // 相対URL（記事URLを基準に解決）
                    try {
                        absoluteUrl = new URL(src, articleUrl).href;
                    } catch (e) {
                        // URL解決に失敗した場合は元のURLをそのまま使用
                        absoluteUrl = src;
                    }
                }
                
                return `<img${before} src="${absoluteUrl}"${after}>`;
            });
            
            // #region agent log
            const convertedImgCount = (htmlContent.match(/<img[^>]*>/gi) || []).length;
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1262',message:'convertImageUrlsToAbsolute: Converted image URLs',data:{baseUrl:baseUrl,articleUrl:articleUrl,convertedImgCount:convertedImgCount},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'U'})}).catch(()=>{});
            // #endregion
        } catch (error) {
            console.error('[ERROR] Failed to convert image URLs to absolute:', error);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1275',message:'convertImageUrlsToAbsolute: Error',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'U'})}).catch(()=>{});
            // #endregion
        }
        
        return htmlContent;
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
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1027',message:'renderChecklist: Entry',data:{articleTitle:article.title,contentLength:content?.length,checklistItemsLength:this.checklistItems?.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'K'})}).catch(()=>{});
        // #endregion
        
        const container = document.getElementById('checklistItems');
        if (!container) {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1032',message:'renderChecklist: checklistItems container NOT FOUND',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'K'})}).catch(()=>{});
            // #endregion
            return;
        }

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
            
            container.appendChild(div);
        });
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1080',message:'renderChecklist: Calling updateScore',data:{checklistItemsCount:this.checklistItems.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'G'})}).catch(()=>{});
        // #endregion
        
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
        // checklistScore要素が存在しない場合は何もしない
        const checklistScore = document.getElementById('checklistScore');
        if (!checklistScore) {
            return;
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1085',message:'updateScore: Entry',data:{checklistItemsLength:this.checklistItems.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
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
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1097',message:'updateScore: Calculated score',data:{score:score,rank:rank,checkedCount:checkedCount,totalItems:totalItems},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // #region agent log
        const initialHTML = checklistScore.innerHTML;
        const initialText = checklistScore.textContent;
        const hasChildNodes = checklistScore.hasChildNodes();
        const childNodesCount = checklistScore.childNodes.length;
        const firstChildType = checklistScore.firstChild?.nodeType;
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1410',message:'updateScore: Before HTML structure check',data:{checklistScoreHTML:initialHTML.substring(0,500),checklistScoreText:initialText?.substring(0,200),hasChildNodes:hasChildNodes,childNodesCount:childNodesCount,firstChildType:firstChildType},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // HTML構造が正しくない場合（単純なテキストになっている場合）、正しい構造を再構築
        const scoreNumber = document.getElementById('scoreNumber');
        const scoreRank = document.getElementById('scoreRank');
        const checkedCountEl = document.getElementById('checkedCount');
        const totalCountEl = document.getElementById('totalCount');
        const scoreBarFill = document.getElementById('scoreBarFill');
        
        // HTML構造が正しくないかどうかを判定
        // 1. 必要な要素が存在しない
        // 2. checklistScoreの直接の子要素がdiv.score-statusでない
        // 3. 単純なテキストノードのみ（子要素が存在しない、またはテキストノードのみ）
        const hasCorrectStructure = scoreNumber && scoreRank && checkedCountEl && totalCountEl && scoreBarFill;
        const hasScoreStatus = checklistScore.querySelector('.score-status') !== null;
        const isPlainText = !hasChildNodes || (childNodesCount === 1 && firstChildType === Node.TEXT_NODE);
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1423',message:'updateScore: Element existence check',data:{scoreNumberExists:!!scoreNumber,scoreRankExists:!!scoreRank,checkedCountExists:!!checkedCountEl,totalCountExists:!!totalCountEl,scoreBarFillExists:!!scoreBarFill,hasCorrectStructure:hasCorrectStructure,hasScoreStatus:hasScoreStatus,isPlainText:isPlainText},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        // HTML構造が正しくない場合、再構築
        if (!hasCorrectStructure || !hasScoreStatus || isPlainText) {
            // #region agent log
            const reason = !hasCorrectStructure ? 'missing elements' : !hasScoreStatus ? 'missing score-status' : isPlainText ? 'plain text' : 'unknown';
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1426',message:'updateScore: Rebuilding HTML structure',data:{oldHTML:initialHTML.substring(0,500),reason:reason},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            checklistScore.innerHTML = `
                <div class="score-status">
                    <div class="score-main">
                        <span class="score-label">現状</span>
                        <span id="scoreNumber">0</span>
                        <span class="score-unit">点</span>
                        <span class="score-separator">/</span>
                        <span class="score-total">100点</span>
                    </div>
                    <div class="score-rank-display">
                        <span class="rank-label">RANK</span>
                        <span id="scoreRank" class="rank-value">-</span>
                    </div>
                </div>
                <div class="score-progress">
                    <div class="score-bar">
                        <div class="score-bar-fill" id="scoreBarFill" style="width: 0%"></div>
                    </div>
                    <div class="score-text">
                        <span id="checkedCount">0</span> / <span id="totalCount">0</span> 項目
                    </div>
                </div>
            `;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1199',message:'updateScore: After rebuilding HTML structure',data:{newHTML:checklistScore.innerHTML.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
        }
        
        // 要素を再取得
        const scoreNumberEl = document.getElementById('scoreNumber');
        const scoreRankEl = document.getElementById('scoreRank');
        const checkedCountElNew = document.getElementById('checkedCount');
        const totalCountElNew = document.getElementById('totalCount');
        const scoreBarFillEl = document.getElementById('scoreBarFill');
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1207',message:'updateScore: Before updating values',data:{scoreNumberElExists:!!scoreNumberEl,scoreRankElExists:!!scoreRankEl,scoreRankElClassName:scoreRankEl?.className,score:score,rank:rank},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        if (scoreNumberEl) scoreNumberEl.textContent = score;
        if (scoreRankEl) {
            scoreRankEl.textContent = rank;
            // rank-valueクラスを維持しつつ、rank-{rank}クラスを追加
            scoreRankEl.className = 'rank-value';
            scoreRankEl.classList.add(`rank-${rank}`);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1489',message:'updateScore: After updating scoreRank',data:{scoreRankText:scoreRankEl.textContent,scoreRankClassName:scoreRankEl.className,rank:rank},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        }
        if (checkedCountElNew) checkedCountElNew.textContent = checkedCount;
        if (totalCountElNew) totalCountElNew.textContent = totalItems;
        if (scoreBarFillEl) scoreBarFillEl.style.width = `${score}%`;
        
        // 最終的なHTML構造を確認し、必要に応じて再構築
        const finalCheck = document.getElementById('scoreNumber');
        const finalRankCheck = document.getElementById('scoreRank');
        const finalHasScoreStatus = checklistScore.querySelector('.score-status') !== null;
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1498',message:'updateScore: Final state check',data:{checklistScoreHTML:checklistScore.innerHTML.substring(0,500),scoreRankFinalText:scoreRankEl?.textContent,scoreRankFinalClassName:scoreRankEl?.className,finalCheckExists:!!finalCheck,finalRankCheckExists:!!finalRankCheck,finalHasScoreStatus:finalHasScoreStatus},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        
        // 最終チェック：HTML構造が失われている場合は再構築
        if (!finalCheck || !finalRankCheck || !finalHasScoreStatus) {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1557',message:'updateScore: Final structure check failed, rebuilding',data:{finalCheckExists:!!finalCheck,finalRankCheckExists:!!finalRankCheck,finalHasScoreStatus:finalHasScoreStatus},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'G'})}).catch(()=>{});
            // #endregion
            // HTML構造を再構築してから値を設定
            checklistScore.innerHTML = `
                <div class="score-status">
                    <div class="score-main">
                        <span class="score-label">現状</span>
                        <span id="scoreNumber">${score}</span>
                        <span class="score-unit">点</span>
                        <span class="score-separator">/</span>
                        <span class="score-total">100点</span>
                    </div>
                    <div class="score-rank-display">
                        <span class="rank-label">RANK</span>
                        <span id="scoreRank" class="rank-value rank-${rank}">${rank}</span>
                    </div>
                </div>
                <div class="score-progress">
                    <div class="score-bar">
                        <div class="score-bar-fill" id="scoreBarFill" style="width: ${score}%"></div>
                    </div>
                    <div class="score-text">
                        <span id="checkedCount">${checkedCount}</span> / <span id="totalCount">${totalItems}</span> 項目
                    </div>
                </div>
            `;
        }
        
        // HTML構造が失われないように保護（MutationObserverを使用）
        // 既存のobserverがあれば削除
        if (this.checklistScoreObserver) {
            this.checklistScoreObserver.disconnect();
        }
        
        // 新しいobserverを作成
        this.checklistScoreObserver = new MutationObserver((mutations) => {
            const scoreStatus = checklistScore.querySelector('.score-status');
            if (!scoreStatus) {
                // HTML構造が失われている場合は再構築
                const currentScoreEl = document.getElementById('scoreNumber');
                const currentRankEl = document.getElementById('scoreRank');
                const currentCheckedEl = document.getElementById('checkedCount');
                const currentTotalEl = document.getElementById('totalCount');
                const currentBarFillEl = document.getElementById('scoreBarFill');
                
                const currentScore = currentScoreEl?.textContent || score;
                const currentRank = currentRankEl?.textContent || rank;
                const currentChecked = currentCheckedEl?.textContent || checkedCount;
                const currentTotal = currentTotalEl?.textContent || totalItems;
                const currentBarWidth = currentBarFillEl?.style.width || `${score}%`;
                
                checklistScore.innerHTML = `
                    <div class="score-status">
                        <div class="score-main">
                            <span class="score-label">現状</span>
                            <span id="scoreNumber">${currentScore}</span>
                            <span class="score-unit">点</span>
                            <span class="score-separator">/</span>
                            <span class="score-total">100点</span>
                        </div>
                        <div class="score-rank-display">
                            <span class="rank-label">RANK</span>
                            <span id="scoreRank" class="rank-value rank-${currentRank}">${currentRank}</span>
                        </div>
                    </div>
                    <div class="score-progress">
                        <div class="score-bar">
                            <div class="score-bar-fill" id="scoreBarFill" style="width: ${currentBarWidth}"></div>
                        </div>
                        <div class="score-text">
                            <span id="checkedCount">${currentChecked}</span> / <span id="totalCount">${currentTotal}</span> 項目
                        </div>
                    </div>
                `;
            }
        });
        
        // observerを開始
        this.checklistScoreObserver.observe(checklistScore, {
            childList: true,
            subtree: true,
            characterData: false
        });
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
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1183',message:'updateChecklist: Entry',data:{articleTitle:article.title,contentLength:content?.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'L'})}).catch(()=>{});
        // #endregion
        
        // 手動チェックが設定されていない項目のみ自動チェックを更新
        // contentがHTML形式の場合は、Markdown形式に変換してからチェック
        let contentToCheck = content;
        
        // HTML形式かどうかを判定（<h1>タグや<img>タグが含まれている場合）
        const isHtml = /<h[1-6][^>]*>|<img[^>]*>|<p[^>]*>/i.test(content);
        if (isHtml) {
            // HTML形式の場合はMarkdownに変換
            contentToCheck = this.htmlToMarkdown(content);
        }
        
        this.checklistItems.forEach(item => {
            const div = document.querySelector(`[data-item-id="${item.id}"]`);
            if (!div) return;
            
            // 手動チェックが設定されている場合はスキップ
            if (this.manualChecks && this.manualChecks[item.id] !== undefined) {
                return;
            }
            
            const checked = item.check(contentToCheck);
            this.updateChecklistItem(div, item.id, checked);
        });
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1275',message:'updateChecklist: Before calling updateScore',data:{checklistScoreHTML:document.getElementById('checklistScore')?.innerHTML?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
        
        // スコアを更新
        this.updateScore();
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5e579a2f-9640-4462-b017-57a5ca31c061',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewrite.js:1280',message:'updateChecklist: After calling updateScore',data:{checklistScoreHTML:document.getElementById('checklistScore')?.innerHTML?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
    }

    /**
     * コンテンツをストレージに保存（内部用）
     */
    async _saveContentToStorage(content) {
        const slug = this.getSlugFromUrl(this.currentArticle.url);
        
        try {
            const saved = await dataManager.saveMarkdown(`${slug}.md`, content);
            if (!saved) {
                console.warn('ファイルの保存に失敗しましたが、ローカルストレージには保存されている可能性があります');
            }
        } catch (saveError) {
            console.error('保存エラー:', saveError);
            throw saveError;
        }
        
        // 進捗を更新
        if (this.progressData && this.progressData.articles) {
            const article = this.progressData.articles.find(a => a.id === this.currentArticle.id);
            if (article) {
                article.status = '完了';
                article.lastModified = new Date().toISOString();
                await dataManager.saveProgress(this.progressData);
            }
        }
    }

    /**
     * 承認されたコンテンツを適用
     */
    async applyApprovedContent(content) {
        // エディタの内容を更新
        if (this.quill) {
            // MarkdownをHTMLに変換（簡易的）
            const html = this.markdownToHtml(content);
            this.quill.clipboard.dangerouslyPasteHTML(0, html);
        }
        const htmlEditor = document.getElementById('htmlEditor');
        if (htmlEditor) {
            // MarkdownからHTMLへの変換は簡易的なものなので、本来はオリジナルのHTMLがあればそれが望ましいが、
            // ここではMarkdownから復元する形になる
             const html = this.markdownToHtml(content);
            htmlEditor.value = html;
        }

        // ストレージに保存
        await this._saveContentToStorage(content);

        // ダッシュボードを更新
        if (typeof dashboard !== 'undefined') {
            await dashboard.renderArticleList();
        }
    }

    /**
     * MarkdownをHTMLに変換（簡易版）
     */
    markdownToHtml(markdown) {
        if (!markdown) return '';
        
        let html = markdown;
        
        // 見出し
        html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
        
        // 太字
        html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
        
        // リスト
        html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
        html = html.replace(/<\/ul><ul>/gim, '');
        
        // 段落（空行で区切る）
        html = html.replace(/\n\n/gim, '</p><p>');
        html = html.replace(/^((?!<h|<ul|<li|<p).+)$/gim, '<p>$1</p>');
        
        return html;
    }

    async saveArticle() {
        if (!this.currentArticle) {
            alert('記事が選択されていません');
            return;
        }

        // ログイン確認
        if (!authManager || !authManager.isAuthenticated()) {
            const proceed = confirm('編集履歴を記録するにはGoogleログインが必要です。\n\nログインせずに保存しますか？（編集履歴は記録されません）');
            if (!proceed) {
                return;
            }
        }

        try {
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
                    alert('保存するコンテンツがありません');
                    return;
                }
            }
            
            if (!content || content.trim().length === 0) {
                alert('保存するコンテンツが空です');
                return;
            }
            
            // 編集履歴を記録（ログインしている場合）
            const historyManager = window.editHistoryManager || editHistoryManager;
            const authMgr = window.authManager || authManager;
            
            // 提案モードの時だけではなく、ログインしていれば常に編集履歴を保存
            if (authMgr && authMgr.isAuthenticated() && historyManager) {
                const user = authMgr.getCurrentUser();
                try {
                    // editHistoryManagerのcurrentEditが存在するか確認
                    if (!historyManager.currentEdit || !historyManager.currentEdit.originalContent) {
                        console.warn('⚠️ 編集履歴が開始されていません。開始します...');
                        // 編集履歴を開始（フォールバック）
                        const savedContent = localStorage.getItem(`article_${this.currentArticle.id}_content`);
                        if (savedContent) {
                            historyManager.startEdit(this.currentArticle.id, savedContent);
                        } else {
                            // 現在のコンテンツをベースとして使用
                            historyManager.startEdit(this.currentArticle.id, content);
                        }
                    }
                    
                    console.log('編集履歴を保存します...', {
                        articleId: this.currentArticle.id,
                        contentLength: content.length,
                        userId: user.uid,
                        userName: user.displayName || user.email,
                        editMode: this.currentEditMode,
                        hasCurrentEdit: !!historyManager.currentEdit,
                        originalContentLength: historyManager.currentEdit?.originalContent?.length || 0
                    });
                    
                    const suggestionId = await historyManager.saveSuggestion(
                        this.currentArticle.id,
                        content,
                        user.uid,
                        user.displayName || user.email,
                        user.email
                    );
                    
                    if (suggestionId) {
                        console.log('✅ 編集履歴を記録しました:', suggestionId);
                        if (typeof showToast === 'function') {
                            showToast('保存・提案を記録しました', 'success');
                        }
                    } else {
                        console.log('ℹ️ 変更がないため編集履歴は記録されませんでした');
                        if (typeof showToast === 'function') {
                            showToast('保存しました（変更なし）', 'success');
                        }
                    }
                } catch (historyError) {
                    console.error('❌ 編集履歴の記録エラー:', historyError);
                    console.error('エラー詳細:', historyError.stack);
                    console.error('エラーオブジェクト:', historyError);
                    // エラーがあっても保存は続行
                    if (typeof showToast === 'function') {
                        showToast('保存しました（履歴記録に失敗）', 'warning');
                    }
                }
            } else {
                if (!authMgr || !authMgr.isAuthenticated()) {
                    console.log('ℹ️ ログインしていないため編集履歴は記録されません');
                } else if (!historyManager) {
                    console.warn('⚠️ editHistoryManagerが見つかりません');
                    console.warn('window.editHistoryManager:', window.editHistoryManager);
                    console.warn('editHistoryManager:', editHistoryManager);
                }
            }
            
            await this._saveContentToStorage(content);

            // トースト通知を表示
            if (typeof showToast === 'function') {
                showToast(authManager && authManager.isAuthenticated() ? '保存・提案を記録しました' : '保存しました', 'success');
            } else {
                alert('保存しました！' + (authManager && authManager.isAuthenticated() ? '\n編集履歴を記録しました。' : ''));
            }
            
            // 提案履歴を更新
            if (window.suggestionUIManager && this.currentArticle) {
                await window.suggestionUIManager.renderSuggestions(this.currentArticle.id);
            } else if (typeof suggestionUIManager !== 'undefined' && this.currentArticle) {
                await suggestionUIManager.renderSuggestions(this.currentArticle.id);
            }
            
            // ダッシュボードを更新
            if (typeof dashboard !== 'undefined') {
                await dashboard.renderArticleList();
            }
        } catch (error) {
            console.error('保存エラー:', error);
            if (typeof showToast === 'function') {
                showToast('保存に失敗しました: ' + error.message, 'error');
            } else {
                alert('保存に失敗しました: ' + error.message);
            }
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
        
        // 段落とリストを分けて処理（リストを先に処理）
        // まず、リスト項目を一時的にマーク
        html = html.replace(/^-\s+(.+)$/gm, '___LIST_ITEM___$1___END_LIST___');
        html = html.replace(/^(\d+)\.\s+(.+)$/gm, '___LIST_ITEM___$2___END_LIST___');
        
        // 段落（空行で区切る）
        html = html.split('\n\n').map(para => {
            para = para.trim();
            if (!para) return '';
            
            // リスト項目を含む段落を処理
            if (para.includes('___LIST_ITEM___')) {
                const listItems = [];
                const parts = para.split('___LIST_ITEM___');
                for (let i = 1; i < parts.length; i++) {
                    const item = parts[i].split('___END_LIST___')[0];
                    listItems.push(`<li>${item.trim()}</li>`);
                }
                if (listItems.length > 0) {
                    return `<ul>${listItems.join('')}</ul>`;
                }
            }
            
            // 見出しやリストタグはそのまま
            if (para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<ol') || para.startsWith('<li')) {
                return para;
            }
            
            // その他は段落として処理
            return `<p>${para}</p>`;
        }).join('\n');
        
        // 改行をbrに変換（段落内の改行のみ）
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
                case 'md':
                    this.exportToMarkdown(htmlContent, title, filename);
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
        try {
            const elements = this.htmlToDocxElements(htmlContent, { Paragraph, HeadingLevel, TextRun });
            
            // 要素が空でないことを確認
            if (!elements || elements.length === 0) {
                throw new Error('変換された要素が空です');
            }
            
            // 要素をフラット化（ネストされた配列を展開）
            const flatElements = [];
            elements.forEach(el => {
                if (Array.isArray(el)) {
                    flatElements.push(...el.filter(e => e !== null && e !== undefined));
                } else if (el !== null && el !== undefined) {
                    flatElements.push(el);
                }
            });
            
            if (flatElements.length === 0) {
                throw new Error('変換された要素が空です');
            }
            
            // 最初の要素がH1の場合はタイトルを追加しない（重複を防ぐ）
            const firstElement = flatElements[0];
            const isFirstH1 = firstElement && 
                             firstElement.heading === HeadingLevel.HEADING_1;
            
            const children = isFirstH1 
                ? flatElements 
                : [
                    new Paragraph({
                        text: title || '無題',
                        heading: HeadingLevel.HEADING_1,
                        spacing: { after: 400 }
                    }),
                    ...flatElements
                ];
            
            // Documentを作成（より明示的な構造）
            const doc = new Document({
                sections: [{
                    properties: {},
                    children: children.filter(child => {
                        // Paragraphオブジェクトであることを確認
                        return child && typeof child === 'object' && child.constructor === Paragraph;
                    })
                }]
            });

            // Packerを使用してBlobを生成
            const blob = await Packer.toBlob(doc);
            
            // Blobのサイズを確認（空でないことを確認）
            if (!blob || blob.size === 0) {
                throw new Error('生成されたWordファイルが空です');
            }
            
            console.log('[DEBUG] exportToWord: Blob size:', blob.size, 'bytes');
            
            // ファイルをダウンロード
            if (typeof saveAs !== 'undefined') {
                saveAs(blob, `${filename}.docx`);
            } else {
                // フォールバック
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${filename}.docx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 100);
            }
            
            console.log('[DEBUG] exportToWord: File downloaded successfully');
        } catch (error) {
            console.error('Wordエクスポートエラー:', error);
            console.error('エラー詳細:', error.stack);
            console.error('エラー発生時の要素:', elements);
            alert(`Word形式のエクスポートに失敗しました。\n\nエラー: ${error.message}\n\nHTML形式またはMarkdown形式でのエクスポートをお試しください。`);
        }
    }

    htmlToDocxElements(html, docxLib) {
        // HTML→docx要素変換（より堅牢な実装）
        const { Paragraph, HeadingLevel, TextRun } = docxLib;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        const processTextNode = (node) => {
            const text = node.textContent.trim();
            return text ? new TextRun(text) : null;
        };

        const processInlineNode = (node) => {
            const tagName = node.tagName.toLowerCase();
            const text = node.textContent.trim();
            
            if (!text) return null;
            
            switch (tagName) {
                case 'strong':
                case 'b':
                    return new TextRun({ text, bold: true });
                case 'em':
                case 'i':
                    return new TextRun({ text, italics: true });
                case 'u':
                    return new TextRun({ text, underline: {} });
                case 's':
                case 'strike':
                    return new TextRun({ text, strike: true });
                case 'a':
                    const href = node.getAttribute('href') || '';
                    return new TextRun({ 
                        text: text + (href ? ` (${href})` : ''), 
                        color: '0563C1',
                        underline: {}
                    });
                default:
                    return new TextRun(text);
            }
        };

        const processBlockNode = (node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
            
            const tagName = node.tagName.toLowerCase();
            
            switch (tagName) {
                case 'h1':
                    return new Paragraph({
                        text: node.textContent.trim() || ' ',
                        heading: HeadingLevel.HEADING_1,
                        spacing: { after: 400 }
                    });
                case 'h2':
                    return new Paragraph({
                        text: node.textContent.trim() || ' ',
                        heading: HeadingLevel.HEADING_2,
                        spacing: { after: 300 }
                    });
                case 'h3':
                    return new Paragraph({
                        text: node.textContent.trim() || ' ',
                        heading: HeadingLevel.HEADING_3,
                        spacing: { after: 200 }
                    });
                case 'h4':
                    return new Paragraph({
                        text: node.textContent.trim() || ' ',
                        heading: HeadingLevel.HEADING_4,
                        spacing: { after: 200 }
                    });
                case 'p':
                    const pRuns = [];
                    Array.from(node.childNodes).forEach(child => {
                        if (child.nodeType === Node.TEXT_NODE) {
                            const text = child.textContent.trim();
                            if (text) {
                                pRuns.push(new TextRun(text));
                            }
                        } else if (child.nodeType === Node.ELEMENT_NODE) {
                            const inlineTag = child.tagName.toLowerCase();
                            if (['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'a', 'span'].includes(inlineTag)) {
                                const run = processInlineNode(child);
                                if (run) pRuns.push(run);
                            } else if (inlineTag === 'br') {
                                pRuns.push(new TextRun({ text: '\n', break: 1 }));
                            } else {
                                const text = child.textContent.trim();
                                if (text) pRuns.push(new TextRun(text));
                            }
                        }
                    });
                    
                    // childrenがある場合はchildrenを使用、ない場合はtextを使用
                    if (pRuns.length === 0) {
                        return new Paragraph({ text: ' ', spacing: { after: 200 } });
                    }
                    return new Paragraph({ children: pRuns, spacing: { after: 200 } });
                
                case 'ul':
                case 'ol':
                    const listItems = [];
                    Array.from(node.children).forEach(child => {
                        if (child.tagName.toLowerCase() === 'li') {
                            const liRuns = [];
                            Array.from(child.childNodes).forEach(liChild => {
                                if (liChild.nodeType === Node.TEXT_NODE) {
                                    const text = liChild.textContent.trim();
                                    if (text) {
                                        liRuns.push(new TextRun(text));
                                    }
                                } else if (liChild.nodeType === Node.ELEMENT_NODE) {
                                    const inlineTag = liChild.tagName.toLowerCase();
                                    if (['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'a', 'span'].includes(inlineTag)) {
                                        const run = processInlineNode(liChild);
                                        if (run) liRuns.push(run);
                                    } else if (inlineTag === 'br') {
                                        liRuns.push(new TextRun({ text: '\n', break: 1 }));
                                    } else {
                                        const text = liChild.textContent.trim();
                                        if (text) liRuns.push(new TextRun(text));
                                    }
                                }
                            });
                            
                            const liText = child.textContent.trim();
                            if (liRuns.length > 0) {
                                listItems.push(new Paragraph({
                                    children: liRuns,
                                    bullet: { level: 0 }
                                }));
                            } else if (liText) {
                                listItems.push(new Paragraph({
                                    text: liText,
                                    bullet: { level: 0 }
                                }));
                            }
                        }
                    });
                    return listItems.length > 0 ? listItems : null;
                
                case 'li':
                    return null;
                
                case 'br':
                    return new Paragraph({ text: ' ', spacing: { after: 200 } });
                
                case 'img':
                    const altText = node.getAttribute('alt') || '画像';
                    return new Paragraph({ 
                        text: `[画像: ${altText}]`, 
                        spacing: { after: 200 } 
                    });
                
                case 'div':
                case 'section':
                case 'article':
                case 'main':
                case 'body':
                    const divChildren = [];
                    Array.from(node.childNodes).forEach(child => {
                        if (child.nodeType === Node.ELEMENT_NODE) {
                            const result = processBlockNode(child);
                            if (Array.isArray(result)) {
                                divChildren.push(...result.filter(r => r !== null && r !== undefined));
                            } else if (result !== null) {
                                divChildren.push(result);
                            }
                        } else if (child.nodeType === Node.TEXT_NODE) {
                            const text = child.textContent.trim();
                            if (text) {
                                divChildren.push(new Paragraph({ text, spacing: { after: 200 } }));
                            }
                        }
                    });
                    return divChildren.length > 0 ? divChildren : null;
                
                default:
                    const text = node.textContent.trim();
                    return text ? new Paragraph({ text, spacing: { after: 200 } }) : null;
            }
        };

        // メイン処理
        const elements = [];
        Array.from(tempDiv.childNodes).forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE) {
                const result = processBlockNode(child);
                if (Array.isArray(result)) {
                    elements.push(...result.filter(r => r !== null && r !== undefined));
                } else if (result !== null) {
                    elements.push(result);
                }
            } else if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent.trim();
                if (text) {
                    elements.push(new Paragraph({ text, spacing: { after: 200 } }));
                }
            }
        });

        if (elements.length === 0) {
            return [new Paragraph({ text: ' ', spacing: { after: 200 } })];
        }

        return elements.filter(el => el !== null && el !== undefined);
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

    exportToMarkdown(htmlContent, title, filename) {
        // HTMLをMarkdownに変換
        let markdown = this.htmlToMarkdown(htmlContent);
        
        // タイトルを先頭に追加（H1として）
        markdown = `# ${title}\n\n${markdown}`;
        
        // Markdownファイルとしてダウンロード
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    showPreview() {
        const previewModal = document.getElementById('previewModal');
        const previewContent = document.getElementById('previewContent');
        
        if (!previewModal || !previewContent) {
            console.error('プレビューモーダルが見つかりません');
            return;
        }
        
        // 現在のエディタモードに応じて内容を取得
        const currentMode = this.getCurrentEditorMode();
        let htmlContent = '';
        
        if (currentMode === 'visual') {
            // ビジュアルモード：QuillのHTMLを取得
            const quillEditor = document.querySelector('.ql-editor');
            if (quillEditor) {
                htmlContent = quillEditor.innerHTML;
            }
        } else {
            // HTMLモード：HTMLエディタの内容を取得
            const htmlEditor = document.getElementById('htmlEditor');
            if (htmlEditor) {
                htmlContent = htmlEditor.value;
            }
        }
        
        // HTMLが空の場合は警告
        if (!htmlContent || htmlContent.trim() === '') {
            alert('プレビューする内容がありません。');
            return;
        }
        
        // HTMLを整形してプレビュー表示
        const formattedHtml = this.formatHtmlForPreview(htmlContent);
        previewContent.innerHTML = formattedHtml;
        
        // モーダルを開く
        previewModal.classList.add('active');
    }

    getCurrentEditorMode() {
        const visualTab = document.getElementById('visualModeTab');
        if (visualTab && visualTab.classList.contains('active')) {
            return 'visual';
        }
        return 'html';
    }

    formatHtmlForPreview(html) {
        // HTMLを整形してプレビュー用に最適化
        // スタイルを追加して読みやすくする
        
        // 基本的なHTML構造を確保
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

