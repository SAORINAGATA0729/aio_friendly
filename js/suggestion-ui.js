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

        try {
            const success = await editHistoryManager.approveSuggestion(suggestionId);
            if (success) {
                alert('提案を承認しました');
                await this.renderSuggestions(this.currentArticleId);
            } else {
                alert('提案の承認に失敗しました');
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
                alert('提案を却下しました');
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
    createDiffModal(suggestion) {
        // 既存のモーダルを削除
        const existingModal = document.getElementById('diffModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'diffModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>変更内容の確認</h2>
                    <button class="modal-close" onclick="document.getElementById('diffModal').remove()">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>
                <div class="modal-body">
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
                    <div id="diffContent" style="background: #f9fafb; padding: 1rem; border-radius: 0.5rem; font-family: 'Courier New', monospace; font-size: 0.9rem; line-height: 1.6;">
                        ${this.renderDiff(suggestion.diff)}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    /**
     * 差分をレンダリング
     */
    renderDiff(diff) {
        if (!diff || !diff.changes || diff.changes.length === 0) {
            return '<div style="color: #6b7280;">変更はありません</div>';
        }

        return diff.changes.map(change => {
            if (change.type === 'added') {
                return `<div style="background: #d1fae5; padding: 0.25rem 0.5rem; margin: 0.25rem 0; border-left: 3px solid #10b981;">
                    <span style="color: #10b981; font-weight: 600;">+</span> ${this.escapeHtml(change.modifiedLine)}
                </div>`;
            } else if (change.type === 'deleted') {
                return `<div style="background: #fee2e2; padding: 0.25rem 0.5rem; margin: 0.25rem 0; border-left: 3px solid #ef4444;">
                    <span style="color: #ef4444; font-weight: 600;">-</span> ${this.escapeHtml(change.originalLine)}
                </div>`;
            } else if (change.type === 'modified') {
                return `
                    <div style="background: #fee2e2; padding: 0.25rem 0.5rem; margin: 0.25rem 0; border-left: 3px solid #ef4444;">
                        <span style="color: #ef4444; font-weight: 600;">-</span> ${this.escapeHtml(change.originalLine)}
                    </div>
                    <div style="background: #d1fae5; padding: 0.25rem 0.5rem; margin: 0.25rem 0; border-left: 3px solid #10b981;">
                        <span style="color: #10b981; font-weight: 600;">+</span> ${this.escapeHtml(change.modifiedLine)}
                    </div>
                `;
            }
            return '';
        }).join('');
    }

    /**
     * HTMLエスケープ
     */
    escapeHtml(text) {
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

