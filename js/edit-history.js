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
     * 変更差分を計算（diff-match-patchを使用）
     */
    async calculateDiff(original, modified) {
        if (!window.diff_match_patch) {
            // ライブラリを動的ロード
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/diff_match_patch/20121119/diff_match_patch.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const dmp = new diff_match_patch();
        const diffs = dmp.diff_main(original, modified);
        dmp.diff_cleanupSemantic(diffs);

        // 統計情報を計算
        let addedLines = 0;
        let deletedLines = 0;
        let modifiedLines = 0;

        diffs.forEach(diff => {
            const [operation, text] = diff;
            if (operation === 1) addedLines++; // INSERT
            if (operation === -1) deletedLines++; // DELETE
        });

        // 変更行数は概算（操作数ベース）
        modifiedLines = Math.max(addedLines, deletedLines);

        return {
            diffs: diffs, // 生のdiffデータ [operation, text]
            changes: [], // 互換性のため残すが使用しない
            addedLines: addedLines,
            deletedLines: deletedLines,
            modifiedLines: modifiedLines
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
            const diff = await this.calculateDiff(this.currentEdit.originalContent, newContent);
            
            if (diff.diffs.length <= 1 && diff.diffs[0][0] === 0) {
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
            
            // 通知メールを送信（非同期で実行し、待機しない）
            this.sendNotificationEmail({
                articleId: articleId,
                userName: userName,
                userEmail: userEmail,
                diffSummary: `追加: ${diff.addedLines}行, 削除: ${diff.deletedLines}行`
            }).catch(e => console.error('メール通知エラー:', e));

            return docRef.id;
        } catch (error) {
            console.error('提案の保存エラー:', error);
            // エラー時はlocalStorageにフォールバック
            return this.saveSuggestionToLocalStorage(articleId, newContent, userId, userName, userEmail);
        }
    }

    /**
     * 通知メールを送信
     */
    async sendNotificationEmail(data) {
        try {
            const response = await fetch('/api/notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                console.warn('通知メール送信失敗:', errorData);
            }
        } catch (error) {
            console.warn('通知メール送信エラー:', error);
        }
    }

    /**
     * localStorageにフォールバック保存
     */
    async saveSuggestionToLocalStorage(articleId, newContent, userId, userName, userEmail) {
        const diff = await this.calculateDiff(this.currentEdit.originalContent, newContent);
        
        if (diff.diffs.length <= 1 && diff.diffs[0][0] === 0) {
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
    async addComment(suggestionId, text, user) {
        if (!window.firebaseDb) {
            return this.addCommentToLocalStorage(suggestionId, text, user);
        }

        try {
            const { doc, updateDoc, arrayUnion, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            const comment = {
                id: 'comment_' + Date.now(),
                text: text,
                userId: user.uid,
                userName: user.displayName || user.email,
                userAvatar: user.photoURL || null,
                createdAt: new Date().toISOString() // serverTimestamp()だと配列内で扱いにくいためISO文字
            };

            await updateDoc(doc(window.firebaseDb, 'articleSuggestions', suggestionId), {
                comments: arrayUnion(comment),
                updatedAt: serverTimestamp()
            });
            
            return true;
        } catch (error) {
            console.error('コメント追加エラー:', error);
            return this.addCommentToLocalStorage(suggestionId, text, user);
        }
    }

    /**
     * localStorageにコメントを追加
     */
    addCommentToLocalStorage(suggestionId, text, user) {
        const suggestions = JSON.parse(localStorage.getItem('articleSuggestions') || '[]');
        const index = suggestions.findIndex(s => s.id === suggestionId);
        
        if (index !== -1) {
            if (!suggestions[index].comments) {
                suggestions[index].comments = [];
            }
            suggestions[index].comments.push({
                id: 'comment_' + Date.now(),
                text: text,
                userId: user.uid,
                userName: user.displayName || user.email,
                createdAt: new Date().toISOString()
            });
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
