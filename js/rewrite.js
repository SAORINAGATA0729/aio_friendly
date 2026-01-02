// ... (previous code) ...

    setupModal() {
        const modal = document.getElementById('rewriteModal');
        const closeBtn = document.getElementById('closeRewriteModal');
        const urlModal = document.getElementById('urlModal');
        const closeUrlBtn = document.getElementById('closeUrlModal');
        const openUrlBtn = document.getElementById('openUrlBtn');
        const proceedBtn = document.getElementById('proceedToEditorBtn');
        const autoFetchBtn = document.getElementById('autoFetchBtn'); // 追加

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

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });

        urlModal.addEventListener('click', (e) => {
            if (e.target === urlModal) {
                urlModal.classList.remove('active');
            }
        });

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
                this.openRewriteModal(this.currentArticle); // コンテンツなしで開く
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
                
                statusDiv.innerHTML = '<span style="color: var(--primary-color);"><span class="material-icons-round" style="font-size:14px; vertical-align:middle;">sync</span> 記事を取得中...</span>';
                
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
                            this.openRewriteModal(this.currentArticle, data.content); // 取得したコンテンツを渡す
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

    async openUrlModal(article) {
        this.currentArticle = article;
        const urlModal = document.getElementById('urlModal');
        const urlInput = document.getElementById('articleUrlInput');
        const statusDiv = document.getElementById('fetchStatus'); // ステータスリセット
        if (statusDiv) statusDiv.innerHTML = '';
        
        // URLを自動入力（https://を追加）
        let url = article.url;
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        
        urlInput.value = url;
        urlModal.classList.add('active');
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

        // 記事データを読み込む
        const slug = this.getSlugFromUrl(article.url);
        let content = await dataManager.loadMarkdown(`${slug}.md`);
        
        // 保存済みデータがない場合
        if (!content) {
            if (fetchedContent) {
                // 自動取得したコンテンツを使用
                content = `# ${article.title}\n\n${fetchedContent}`;
            } else {
                // 空のテンプレートを使用
                content = this.createArticleTemplate(article);
            }
        }

        // エディタに設定
        const editor = document.getElementById('markdownEditor');
        if (editor) {
            editor.value = content;

            // チェックリストを表示
            this.renderChecklist(article, content);

            // エディタの変更を監視（既存のリスナーを削除してから追加）
            const newEditor = editor.cloneNode(true);
            editor.parentNode.replaceChild(newEditor, editor);
            newEditor.addEventListener('input', () => {
                this.updateChecklist(article, newEditor.value);
            });
            
            // 初回チェック実行
            this.updateChecklist(article, content);
        }
    }

// ... (rest of the code) ...
