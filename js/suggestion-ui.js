/**
 * 提案モードUI管理
 * Googleドキュメントの提案モードのようなUIを提供
 */

class SuggestionUIManager {
    constructor() {
        this.currentArticleId = null;
    }

    /**
     * 記事の提案一覧を表示
     */
    async renderSuggestions(articleId) {
        this.currentArticleId = articleId;
        const suggestionsList = document.getElementById('suggestionsList');
        if (!suggestionsList) return;

        if (!editHistoryManager) {
            suggestionsList.innerHTML = '<div style="padding: 1rem; color: #6b7280; font-size: 0.9rem;">編集履歴機能を利用するにはGoogleログインが必要です。</div>';
            return;
        }

        try {
            const suggestions = await editHistoryManager.getSuggestions(articleId);
            
            if (!suggestions || suggestions.length === 0) {
                suggestionsList.innerHTML = '<div style="padding: 1rem; color: #6b7280; font-size: 0.9rem;">まだ編集履歴がありません。</div>';
                return;
            }

            suggestionsList.innerHTML = suggestions.map((suggestion, index) => {
                const statusClass = suggestion.status === 'approved' ? 'approved' : 
                                  suggestion.status === 'rejected' ? 'rejected' : 'pending';
                const statusText = suggestion.status === 'approved' ? '承認済み' : 
                                  suggestion.status === 'rejected' ? '却下済み' : '保留中';
                const statusColor = suggestion.status === 'approved' ? '#10b981' : 
                                   suggestion.status === 'rejected' ? '#ef4444' : '#f59e0b';
                
                const createdAt = suggestion.createdAt?.toDate ? 
                    suggestion.createdAt.toDate().toLocaleString('ja-JP') : 
                    (suggestion.createdAt ? new Date(suggestion.createdAt).toLocaleString('ja-JP') : '不明');
                
                return `
                    <div class="suggestion-item ${statusClass}" data-suggestion-id="${suggestion.id}">
                        <div class="suggestion-header">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                ${suggestion.userAvatar ? 
                                    `<img src="${suggestion.userAvatar}" alt="" style="width: 24px; height: 24px; border-radius: 50%;">` : 
                                    `<span class="material-icons-round" style="font-size: 20px;">account_circle</span>`
                                }
                                <div>
                                    <div style="font-weight: 600; font-size: 0.85rem;">${suggestion.userName || suggestion.userEmail || '不明'}</div>
                                    <div style="font-size: 0.75rem; color: #6b7280;">${createdAt}</div>
                                </div>
                            </div>
                            <span class="suggestion-status" style="background: ${statusColor}; color: white; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem;">
                                ${statusText}
                            </span>
                        </div>
                        <div class="suggestion-stats" style="margin-top: 0.5rem; font-size: 0.8rem; color: #6b7280;">
                            <span>追加: ${suggestion.diff?.addedLines || 0}行</span>
                            <span style="margin-left: 0.5rem;">削除: ${suggestion.diff?.deletedLines || 0}行</span>
                            <span style="margin-left: 0.5rem;">変更: ${suggestion.diff?.modifiedLines || 0}行</span>
                        </div>
                        ${suggestion.status === 'pending' ? `
                            <div class="suggestion-actions" style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">
                                <button class="btn-approve" onclick="suggestionUIManager.approveSuggestion('${suggestion.id}')" 
                                    style="flex: 1; padding: 0.4rem; background: #10b981; color: white; border: none; border-radius: 0.25rem; cursor: pointer; font-size: 0.8rem;">
                                    <span class="material-icons-round" style="font-size: 16px; vertical-align: middle;">check</span>
                                    承認
                                </button>
                                <button class="btn-reject" onclick="suggestionUIManager.rejectSuggestion('${suggestion.id}')" 
                                    style="flex: 1; padding: 0.4rem; background: #ef4444; color: white; border: none; border-radius: 0.25rem; cursor: pointer; font-size: 0.8rem;">
                                    <span class="material-icons-round" style="font-size: 16px; vertical-align: middle;">close</span>
                                    却下
                                </button>
                            </div>
                        ` : ''}
                        <button class="btn-view-diff" onclick="suggestionUIManager.showDiff('${suggestion.id}')" 
                            style="margin-top: 0.5rem; width: 100%; padding: 0.4rem; background: #f3f4f6; color: #374151; border: 1px solid var(--border-color); border-radius: 0.25rem; cursor: pointer; font-size: 0.8rem;">
                            <span class="material-icons-round" style="font-size: 16px; vertical-align: middle;">visibility</span>
                            変更内容を確認
                        </button>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('提案の取得エラー:', error);
            suggestionsList.innerHTML = '<div style="padding: 1rem; color: #ef4444; font-size: 0.9rem;">編集履歴の取得に失敗しました。</div>';
        }
    }

    /**
     * 提案を承認
     */
    async approveSuggestion(suggestionId) {
        if (!confirm('この提案を承認しますか？承認すると変更が反映されます。')) {
            return;
        }

        // 提案情報を取得
        const suggestions = await editHistoryManager.getSuggestions(this.currentArticleId);
        const suggestion = suggestions.find(s => s.id === suggestionId);
        
        if (!suggestion) {
            alert('提案が見つかりません');
            return;
        }

        try {
            // 変更を適用（rewriteManagerを使用）
            if (window.rewriteManager || typeof rewriteManager !== 'undefined') {
                const manager = window.rewriteManager || rewriteManager;
                await manager.applyApprovedContent(suggestion.newContent);
            } else {
                console.error('rewriteManagerが見つかりません');
                alert('変更の適用に失敗しました: エディタが見つかりません');
                return;
            }

            // 提案ステータスを承認済みに更新
            const success = await editHistoryManager.approveSuggestion(suggestionId);
            if (success) {
                if (typeof showToast === 'function') showToast('提案を承認し、変更を反映しました', 'success');
                else alert('提案を承認し、変更を反映しました');
                await this.renderSuggestions(this.currentArticleId);
            } else {
                alert('提案の承認ステータス更新に失敗しました');
            }
        } catch (error) {
            console.error('提案の承認エラー:', error);
            alert('提案の承認に失敗しました: ' + error.message);
        }
    }

    /**
     * 提案を却下
     */
    async rejectSuggestion(suggestionId) {
        if (!confirm('この提案を却下しますか？')) {
            return;
        }

        try {
            const success = await editHistoryManager.rejectSuggestion(suggestionId);
            if (success) {
                if (typeof showToast === 'function') showToast('提案を却下しました', 'success');
                else alert('提案を却下しました');
                await this.renderSuggestions(this.currentArticleId);
            } else {
                alert('提案の却下に失敗しました');
            }
        } catch (error) {
            console.error('提案の却下エラー:', error);
            alert('提案の却下に失敗しました: ' + error.message);
        }
    }

    /**
     * 変更差分を表示
     */
    async showDiff(suggestionId) {
        const suggestions = await editHistoryManager.getSuggestions(this.currentArticleId);
        const suggestion = suggestions.find(s => s.id === suggestionId);
        
        if (!suggestion) {
            alert('提案が見つかりません');
            return;
        }

        // 差分表示モーダルを作成
        this.createDiffModal(suggestion);
    }

    /**
     * 差分表示モーダルを作成
     */
    async createDiffModal(suggestion) {
        // 既存のモーダルを削除
        const existingModal = document.getElementById('diffModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'diffModal';
        modal.className = 'modal active';
        
        const commentsHtml = this.renderComments(suggestion);
        const diffHtml = await this.renderVisualDiff(suggestion.originalContent, suggestion.newContent);

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>変更内容の確認</h2>
                    <button class="modal-close" onclick="document.getElementById('diffModal').remove()">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>
                <div class="modal-body" style="padding: 1.5rem; display: flex; flex-direction: column;">
                    <div style="margin-bottom: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                            ${suggestion.userAvatar ? 
                                `<img src="${suggestion.userAvatar}" alt="" style="width: 32px; height: 32px; border-radius: 50%;">` : 
                                `<span class="material-icons-round">account_circle</span>`
                            }
                            <div>
                                <div style="font-weight: 600;">${suggestion.userName || suggestion.userEmail || '不明'}</div>
                                <div style="font-size: 0.85rem; color: #6b7280;">
                                    ${suggestion.createdAt?.toDate ? 
                                        suggestion.createdAt.toDate().toLocaleString('ja-JP') : 
                                        (suggestion.createdAt ? new Date(suggestion.createdAt).toLocaleString('ja-JP') : '不明')
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <h4 style="margin: 1rem 0 0.5rem 0; font-size: 1rem;">変更内容（赤：削除、緑：追加）</h4>
                    <div id="diffContent" class="diff-content" style="background: white; padding: 1.5rem; border-radius: 0.5rem; border: 1px solid #e2e8f0; font-size: 1rem; line-height: 1.8; white-space: pre-wrap; overflow-y: auto; max-height: 400px; margin-bottom: 1.5rem;">
                        ${diffHtml}
                    </div>

                    <div class="suggestion-comments">
                        <h4 style="margin: 0 0 0.5rem 0; font-size: 1rem;">コメント・やり取り</h4>
                        <div id="commentList_${suggestion.id}" class="comment-list">
                            ${commentsHtml}
                        </div>
                        <div class="comment-input-area">
                            <input type="text" id="commentInput_${suggestion.id}" class="comment-input" placeholder="コメントを入力...">
                            <button onclick="suggestionUIManager.submitComment('${suggestion.id}')" class="comment-submit-btn">
                                <span class="material-icons-round">send</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    /**
     * 視覚的な差分レンダリング（赤字・取り消し線 / 緑字・太字）
     */
    async renderVisualDiff(original, modified) {
        // diff-match-patchを使用した詳細な差分表示
        // originalContentとnewContentが渡される想定（suggestion.diffオブジェクトではなく、生テキストから計算する方が柔軟）
        // ただし、editHistoryManager.saveSuggestionで既に計算済みのdiffがあればそれを使ってもいいが、
        // calculateDiffが非同期かつライブラリロードを含むようになったため、ここで再計算するのが確実。
        
        const result = await editHistoryManager.calculateDiff(original, modified);
        const diffs = result.diffs;
        
        return diffs.map(diff => {
            const [operation, text] = diff;
            const escapedText = this.escapeHtml(text);
            
            if (operation === 1) { // INSERT
                return `<ins>${escapedText}</ins>`;
            } else if (operation === -1) { // DELETE
                return `<del>${escapedText}</del>`;
            } else { // EQUAL
                return `<span>${escapedText}</span>`;
            }
        }).join('');
    }

    /**
     * コメントリストをレンダリング
     */
    renderComments(suggestion) {
        if (!suggestion.comments || suggestion.comments.length === 0) {
            return '<div style="font-size: 0.85rem; color: #9ca3af; text-align: center; padding: 0.5rem;">コメントはまだありません</div>';
        }

        return suggestion.comments.map(comment => `
            <div class="comment-item">
                <div class="comment-user">${comment.userName} <span style="font-weight:normal; color:#9ca3af; font-size:0.7rem; margin-left:0.5rem;">${new Date(comment.createdAt).toLocaleString('ja-JP')}</span></div>
                <div class="comment-text">${this.escapeHtml(comment.text)}</div>
            </div>
        `).join('');
    }

    /**
     * コメントを送信
     */
    async submitComment(suggestionId) {
        const input = document.getElementById(`commentInput_${suggestionId}`);
        const text = input.value;
        
        if (!text.trim()) return;
        
        if (!authManager.isAuthenticated()) {
            alert('コメントするにはログインが必要です');
            return;
        }

        const user = authManager.getCurrentUser();
        const success = await editHistoryManager.addComment(suggestionId, text, user);
        
        if (success) {
            input.value = '';
            // コメントリストを再描画するために現在の提案データを再取得
            const suggestions = await editHistoryManager.getSuggestions(this.currentArticleId);
            const suggestion = suggestions.find(s => s.id === suggestionId);
            
            const commentList = document.getElementById(`commentList_${suggestionId}`);
            if (commentList && suggestion) {
                commentList.innerHTML = this.renderComments(suggestion);
            }
        } else {
            alert('コメントの送信に失敗しました');
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
}

// グローバルインスタンス
let suggestionUIManager;

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
    suggestionUIManager = new SuggestionUIManager();
});
