/**
 * 編集履歴管理
 * Googleドキュメントの提案モードのような機能を提供
 */

class EditHistoryManager {
    constructor() {
        this.currentEdit = null; // 現在編集中の記事
        this.originalContent = null; // 元のコンテンツ
    }

    /**
     * 編集開始時に元のコンテンツを保存
     */
    startEdit(articleId, originalContent) {
        this.currentEdit = {
            articleId: articleId,
            originalContent: originalContent,
            startTime: new Date().toISOString()
        };
    }

    /**
     * 変更を記録（提案として保存）
     */
    async saveSuggestion(articleId, newContent, userId, userName, userEmail) {
        if (!window.firebaseDb) {
            console.warn('Firestoreが利用できません。localStorageに保存します。');
            return this.saveSuggestionToLocalStorage(articleId, newContent, userId, userName, userEmail);
        }

        try {
            const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            // 変更差分を計算
            const diff = this.calculateDiff(this.currentEdit.originalContent, newContent);
            
            if (diff.changes.length === 0) {
                console.log('変更がありません');
                return null;
            }

            const suggestionData = {
                articleId: articleId,
                userId: userId,
                userName: userName,
                userEmail: userEmail,
                userAvatar: authManager?.currentUser?.photoURL || null,
                originalContent: this.currentEdit.originalContent,
                newContent: newContent,
                diff: diff,
                status: 'pending', // pending, approved, rejected
                comments: [], // コメント配列を追加
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            const docRef = await addDoc(collection(window.firebaseDb, 'articleSuggestions'), suggestionData);
            console.log('提案を保存しました:', docRef.id);
            
            return docRef.id;
        } catch (error) {
            console.error('提案の保存エラー:', error);
            // エラー時はlocalStorageにフォールバック
            return this.saveSuggestionToLocalStorage(articleId, newContent, userId, userName, userEmail);
        }
    }

    /**
     * localStorageにフォールバック保存
     */
    saveSuggestionToLocalStorage(articleId, newContent, userId, userName, userEmail) {
        const diff = this.calculateDiff(this.currentEdit.originalContent, newContent);
        
        if (diff.changes.length === 0) {
            return null;
        }

        const suggestionData = {
            articleId: articleId,
            userId: userId,
            userName: userName,
            userEmail: userEmail,
            originalContent: this.currentEdit.originalContent,
            newContent: newContent,
            diff: diff,
            status: 'pending',
            comments: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const key = `suggestion_${articleId}_${Date.now()}`;
        const suggestions = JSON.parse(localStorage.getItem('articleSuggestions') || '[]');
        suggestions.push({ id: key, ...suggestionData });
        localStorage.setItem('articleSuggestions', JSON.stringify(suggestions));
        
        return key;
    }

    /**
     * 変更差分を計算（簡易版）
     */
    calculateDiff(original, modified) {
        const originalLines = original.split('\n');
        const modifiedLines = modified.split('\n');
        
        const changes = [];
        let originalIndex = 0;
        let modifiedIndex = 0;
        
        while (originalIndex < originalLines.length || modifiedIndex < modifiedLines.length) {
            const originalLine = originalLines[originalIndex] || '';
            const modifiedLine = modifiedLines[modifiedIndex] || '';
            
            if (originalLine === modifiedLine) {
                originalIndex++;
                modifiedIndex++;
            } else {
                // 変更を検出
                const change = {
                    type: originalLine ? (modifiedLine ? 'modified' : 'deleted') : 'added',
                    lineNumber: modifiedIndex + 1,
                    originalLine: originalLine,
                    modifiedLine: modifiedLine
                };
                changes.push(change);
                
                if (originalLine && modifiedLine) {
                    // 両方ある場合は変更
                    originalIndex++;
                    modifiedIndex++;
                } else if (originalLine) {
                    // 削除
                    originalIndex++;
                } else {
                    // 追加
                    modifiedIndex++;
                }
            }
        }
        
        return {
            changes: changes,
            addedLines: changes.filter(c => c.type === 'added').length,
            deletedLines: changes.filter(c => c.type === 'deleted').length,
            modifiedLines: changes.filter(c => c.type === 'modified').length
        };
    }

    /**
     * 記事の提案一覧を取得
     */
    async getSuggestions(articleId) {
        if (!window.firebaseDb) {
            return this.getSuggestionsFromLocalStorage(articleId);
        }

        try {
            const { collection, query, where, getDocs, orderBy } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            const q = query(
                collection(window.firebaseDb, 'articleSuggestions'),
                where('articleId', '==', articleId),
                orderBy('createdAt', 'desc')
            );
            
            const querySnapshot = await getDocs(q);
            const suggestions = [];
            
            querySnapshot.forEach((doc) => {
                suggestions.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return suggestions;
        } catch (error) {
            console.error('提案の取得エラー:', error);
            return this.getSuggestionsFromLocalStorage(articleId);
        }
    }

    /**
     * localStorageから提案を取得
     */
    getSuggestionsFromLocalStorage(articleId) {
        const suggestions = JSON.parse(localStorage.getItem('articleSuggestions') || '[]');
        return suggestions.filter(s => s.articleId === articleId);
    }

    /**
     * 提案を承認
     */
    async approveSuggestion(suggestionId) {
        if (!window.firebaseDb) {
            return this.approveSuggestionInLocalStorage(suggestionId);
        }

        try {
            const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            await updateDoc(doc(window.firebaseDb, 'articleSuggestions', suggestionId), {
                status: 'approved',
                approvedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            
            return true;
        } catch (error) {
            console.error('提案の承認エラー:', error);
            return this.approveSuggestionInLocalStorage(suggestionId);
        }
    }

    /**
     * localStorageで提案を承認
     */
    approveSuggestionInLocalStorage(suggestionId) {
        const suggestions = JSON.parse(localStorage.getItem('articleSuggestions') || '[]');
        const index = suggestions.findIndex(s => s.id === suggestionId);
        
        if (index !== -1) {
            suggestions[index].status = 'approved';
            suggestions[index].approvedAt = new Date().toISOString();
            localStorage.setItem('articleSuggestions', JSON.stringify(suggestions));
            return true;
        }
        
        return false;
    }

    /**
     * 提案を却下
     */
    async rejectSuggestion(suggestionId) {
        if (!window.firebaseDb) {
            return this.rejectSuggestionInLocalStorage(suggestionId);
        }

        try {
            const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            await updateDoc(doc(window.firebaseDb, 'articleSuggestions', suggestionId), {
                status: 'rejected',
                rejectedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            
            return true;
        } catch (error) {
            console.error('提案の却下エラー:', error);
            return this.rejectSuggestionInLocalStorage(suggestionId);
        }
    }

    /**
     * localStorageで提案を却下
     */
    rejectSuggestionInLocalStorage(suggestionId) {
        const suggestions = JSON.parse(localStorage.getItem('articleSuggestions') || '[]');
        const index = suggestions.findIndex(s => s.id === suggestionId);
        
        if (index !== -1) {
            suggestions[index].status = 'rejected';
            suggestions[index].rejectedAt = new Date().toISOString();
            localStorage.setItem('articleSuggestions', JSON.stringify(suggestions));
            return true;
        }
        
        return false;
    }

    /**
     * コメントを追加
     */
    async addComment(suggestionId, commentText, user) {
        if (!commentText || !commentText.trim()) return false;

        const comment = {
            id: `comment_${Date.now()}`,
            text: commentText,
            userId: user.uid,
            userName: user.displayName || user.email,
            userAvatar: user.photoURL || null,
            createdAt: new Date().toISOString()
        };

        if (!window.firebaseDb) {
            return this.addCommentToLocalStorage(suggestionId, comment);
        }

        try {
            const { doc, updateDoc, arrayUnion } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            await updateDoc(doc(window.firebaseDb, 'articleSuggestions', suggestionId), {
                comments: arrayUnion(comment)
            });
            
            return true;
        } catch (error) {
            console.error('コメントの追加エラー:', error);
            return this.addCommentToLocalStorage(suggestionId, comment);
        }
    }

    /**
     * localStorageにコメントを追加
     */
    addCommentToLocalStorage(suggestionId, comment) {
        const suggestions = JSON.parse(localStorage.getItem('articleSuggestions') || '[]');
        const index = suggestions.findIndex(s => s.id === suggestionId);
        
        if (index !== -1) {
            if (!suggestions[index].comments) {
                suggestions[index].comments = [];
            }
            suggestions[index].comments.push(comment);
            localStorage.setItem('articleSuggestions', JSON.stringify(suggestions));
            return true;
        }
        return false;
    }
}

// グローバルインスタンス
let editHistoryManager;

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
    editHistoryManager = new EditHistoryManager();
});
