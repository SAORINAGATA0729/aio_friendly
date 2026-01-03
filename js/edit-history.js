/**
 * 編集履歴管理
 */

class EditHistoryManager {
    constructor() {
        this.currentEdit = null;
        this.originalContent = null;
    }

    startEdit(articleId, originalContent) {
        this.currentEdit = {
            articleId: articleId,
            originalContent: originalContent,
            startTime: new Date().toISOString()
        };
    }

    /**
     * 変更差分を計算
     */
    async calculateDiff(original, modified) {
        // diff_match_patchのロードを試みる
        if (typeof diff_match_patch === 'undefined') {
            await this.loadDiffLibrary();
        }

        if (typeof diff_match_patch !== 'undefined') {
            try {
                const dmp = new diff_match_patch();
                const diffs = dmp.diff_main(original, modified);
                dmp.diff_cleanupSemantic(diffs);
                
                let addedLines = 0;
                let deletedLines = 0;
                diffs.forEach(diff => {
                    if (diff[0] === 1) addedLines++;
                    if (diff[0] === -1) deletedLines++;
                });

                return {
                    diffs: diffs,
                    addedLines: addedLines,
                    deletedLines: deletedLines,
                    modifiedLines: Math.max(addedLines, deletedLines)
                };
            } catch (e) {
                console.error('Diff calculation failed:', e);
            }
        }

        // フォールバック（簡易行単位Diff）
        return this.calculateSimpleDiff(original, modified);
    }

    async loadDiffLibrary() {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/diff_match_patch/20121119/diff_match_patch.js';
            script.onload = resolve;
            script.onerror = () => {
                console.warn('Failed to load diff_match_patch from CDN');
                resolve(); // 失敗してもresolveしてフォールバックさせる
            };
            document.head.appendChild(script);
        });
    }

    calculateSimpleDiff(original, modified) {
        // 行単位の簡易Diff
        const originalLines = original.split('\n');
        const modifiedLines = modified.split('\n');
        const diffs = [];
        
        // 非常に単純な比較（本来はLCSなどを使うべきだがコード量削減のため）
        // 変更前と変更後を単純に比較
        if (original === modified) {
            diffs.push([0, original]);
        } else {
            // 全削除＆全追加として扱う
            if (original) diffs.push([-1, original]);
            if (modified) diffs.push([1, modified]);
        }

        return {
            diffs: diffs,
            addedLines: modifiedLines.length,
            deletedLines: originalLines.length,
            modifiedLines: Math.max(modifiedLines.length, originalLines.length)
        };
    }

    /**
     * 変更を記録（提案として保存）
     */
    async saveSuggestion(articleId, newContent, userId, userName, userEmail) {
        // currentEditが存在しない場合は、元のコンテンツを取得してから開始
        if (!this.currentEdit || !this.currentEdit.originalContent) {
            console.warn('currentEditが存在しません。元のコンテンツを取得します...');
            // 保存済みのコンテンツを取得（フォールバック）
            try {
                const savedContent = localStorage.getItem(`article_${articleId}_content`);
                if (savedContent) {
                    this.startEdit(articleId, savedContent);
                } else {
                    console.error('元のコンテンツが見つかりません。編集履歴を記録できません。');
                    return null;
                }
            } catch (e) {
                console.error('元のコンテンツの取得に失敗:', e);
                return null;
            }
        }
        
        const originalContent = this.currentEdit.originalContent;
        const diff = await this.calculateDiff(originalContent, newContent);
        
        // 変更がない場合はnullを返す
        if (diff.diffs.length <= 1 && diff.diffs[0] && diff.diffs[0][0] === 0) {
            console.log('変更がないため編集履歴は記録されませんでした');
            return null;
        }

        const suggestionData = {
            articleId: articleId,
            userId: userId,
            userName: userName,
            userEmail: userEmail,
            userAvatar: authManager?.currentUser?.photoURL || null,
            originalContent: originalContent,
            newContent: newContent,
            diff: diff,
            status: 'pending',
            comments: [],
            createdAt: new Date().toISOString(), // Firestore/LocalStorage両対応のためISO文字列
            updatedAt: new Date().toISOString()
        };

        if (window.firebaseDb) {
            try {
                const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                suggestionData.createdAt = serverTimestamp();
                suggestionData.updatedAt = serverTimestamp();
                
                const docRef = await addDoc(collection(window.firebaseDb, 'articleSuggestions'), suggestionData);
                console.log('提案を保存しました:', docRef.id);
                
                // メール通知（非同期）
                this.sendNotificationEmail({
                    articleId: articleId,
                    userName: userName,
                    userEmail: userEmail,
                    diffSummary: `追加: ${diff.addedLines}箇所, 削除: ${diff.deletedLines}箇所`
                }).catch(e => console.error('メール通知エラー:', e));

                return docRef.id;
            } catch (error) {
                console.error('Firestoreへの保存失敗:', error);
                // フォールバックへ続く
            }
        }

        // LocalStorageへの保存
        return this.saveSuggestionToLocalStorage(articleId, suggestionData);
    }

    saveSuggestionToLocalStorage(articleId, data) {
        const key = `suggestion_${articleId}_${Date.now()}`;
        const suggestions = JSON.parse(localStorage.getItem('articleSuggestions') || '[]');
        suggestions.push({ id: key, ...data });
        localStorage.setItem('articleSuggestions', JSON.stringify(suggestions));
        return key;
    }

    async getSuggestions(articleId) {
        if (window.firebaseDb) {
            try {
                const { collection, query, where, getDocs, orderBy } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                const q = query(
                    collection(window.firebaseDb, 'articleSuggestions'),
                    where('articleId', '==', articleId),
                    orderBy('createdAt', 'desc')
                );
                const snapshot = await getDocs(q);
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.error('Firestoreからの取得失敗:', e);
            }
        }
        return this.getSuggestionsFromLocalStorage(articleId);
    }

    getSuggestionsFromLocalStorage(articleId) {
        const suggestions = JSON.parse(localStorage.getItem('articleSuggestions') || '[]');
        return suggestions.filter(s => s.articleId === articleId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    async approveSuggestion(suggestionId) {
        if (window.firebaseDb) {
            try {
                const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                await updateDoc(doc(window.firebaseDb, 'articleSuggestions', suggestionId), {
                    status: 'approved',
                    approvedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                return true;
            } catch (e) { console.error(e); }
        }
        return this.updateLocalStorageStatus(suggestionId, 'approved');
    }

    async rejectSuggestion(suggestionId) {
        if (window.firebaseDb) {
            try {
                const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                await updateDoc(doc(window.firebaseDb, 'articleSuggestions', suggestionId), {
                    status: 'rejected',
                    rejectedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                return true;
            } catch (e) { console.error(e); }
        }
        return this.updateLocalStorageStatus(suggestionId, 'rejected');
    }

    updateLocalStorageStatus(suggestionId, status) {
        const suggestions = JSON.parse(localStorage.getItem('articleSuggestions') || '[]');
        const index = suggestions.findIndex(s => s.id === suggestionId);
        if (index !== -1) {
            suggestions[index].status = status;
            suggestions[index][status + 'At'] = new Date().toISOString();
            localStorage.setItem('articleSuggestions', JSON.stringify(suggestions));
            return true;
        }
        return false;
    }

    async addComment(suggestionId, text, user) {
        const comment = {
            id: 'comment_' + Date.now(),
            text: text,
            userId: user.uid,
            userName: user.displayName || user.email,
            userAvatar: user.photoURL || null,
            createdAt: new Date().toISOString()
        };

        if (window.firebaseDb) {
            try {
                const { doc, updateDoc, arrayUnion, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                await updateDoc(doc(window.firebaseDb, 'articleSuggestions', suggestionId), {
                    comments: arrayUnion(comment),
                    updatedAt: serverTimestamp()
                });
                return true;
            } catch (e) { console.error(e); }
        }
        return this.addCommentToLocalStorage(suggestionId, comment);
    }

    addCommentToLocalStorage(suggestionId, comment) {
        const suggestions = JSON.parse(localStorage.getItem('articleSuggestions') || '[]');
        const index = suggestions.findIndex(s => s.id === suggestionId);
        if (index !== -1) {
            if (!suggestions[index].comments) suggestions[index].comments = [];
            suggestions[index].comments.push(comment);
            localStorage.setItem('articleSuggestions', JSON.stringify(suggestions));
            return true;
        }
        return false;
    }

    async sendNotificationEmail(data) {
        try {
            const response = await fetch('/api/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!response.ok) console.warn('通知送信失敗');
        } catch (e) { console.warn('通知送信エラー', e); }
    }
}

let editHistoryManager;
document.addEventListener('DOMContentLoaded', () => {
    editHistoryManager = new EditHistoryManager();
    // グローバルに公開（他のスクリプトからアクセス可能にする）
    window.editHistoryManager = editHistoryManager;
});
