/**
 * Firebase Authentication管理
 * Googleログイン機能を提供
 */

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.authStateListener = null;
    }

    async init() {
        // Firebase Authが読み込まれるまで待つ
        await this.waitForFirebase();
        
        // 認証状態の監視
        this.setupAuthStateListener();
        
        // UIの初期化
        this.setupAuthUI();
    }

    async waitForFirebase() {
        let attempts = 0;
        const maxAttempts = 100; // 10秒待機
        
        // Firebase設定が未完了の場合、nullが設定されるまで待つ
        while (window.firebaseAuth === undefined && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        // nullが設定された場合（エラー時）も待機を終了
        if (window.firebaseAuth === null || window.firebaseAuth === undefined) {
            console.log('ℹ️ Firebase Authが設定されていません。ログイン機能は無効です。');
            // Firebase未設定でもUIは表示する（ログインボタンは非表示）
            this.updateAuthUI(null);
            return false;
        }
        
        // googleProviderも確認
        if (!window.googleProvider) {
            console.warn('⚠️ GoogleProviderが設定されていません');
            return false;
        }
        
        console.log('✅ Firebase Authの準備が完了しました');
        return true;
    }

    setupAuthStateListener() {
        if (!window.firebaseAuth) {
            // Firebase未設定の場合はログインボタンを非表示
            this.updateAuthUI(null);
            return;
        }
        
        this.authStateListener = window.firebaseAuth.onAuthStateChanged((user) => {
            this.currentUser = user;
            this.updateAuthUI(user);
            
            if (user) {
                console.log('ユーザーがログインしました:', user.email);
            } else {
                console.log('ユーザーがログアウトしました');
            }
        });
    }

    setupAuthUI() {
        const googleLoginBtn = document.getElementById('googleLoginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (googleLoginBtn) {
            googleLoginBtn.addEventListener('click', () => {
                this.signInWithGoogle();
            });
        }
        
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.signOut();
            });
        }
    }

    async signInWithGoogle() {
        try {
            // Firebase Authの準備を確認
            if (!window.firebaseAuth || !window.googleProvider) {
                console.error('Firebase Auth未初期化:', {
                    firebaseAuth: !!window.firebaseAuth,
                    googleProvider: !!window.googleProvider
                });
                alert('Firebaseが正しく読み込まれていません。ページをリロードしてください。');
                return;
            }
            
            // Firebase Authモジュールを動的にインポート
            const firebaseAuthModule = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            const { signInWithPopup } = firebaseAuthModule;
            
            console.log('Googleログインを開始...');
            const result = await signInWithPopup(window.firebaseAuth, window.googleProvider);
            console.log('✅ ログイン成功:', result.user.email);
            
            // ログイン成功時はupdateAuthUIが自動的に呼ばれる（onAuthStateChanged経由）
        } catch (error) {
            console.error('❌ ログインエラー:', error);
            if (error.code === 'auth/popup-closed-by-user') {
                console.log('ログインがキャンセルされました');
                // キャンセル時はアラートを出さない
            } else if (error.code === 'auth/unauthorized-domain') {
                alert('このドメインは認証されていません。Firebase Consoleでドメインを追加してください。\nエラー: ' + error.message);
            } else {
                alert('ログインに失敗しました: ' + (error.message || error.code || '不明なエラー'));
            }
        }
    }

    async signOut() {
        try {
            if (!window.firebaseAuth) {
                console.warn('Firebase Authが初期化されていません');
                return;
            }
            
            const firebaseAuthModule = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            const { signOut } = firebaseAuthModule;
            await signOut(window.firebaseAuth);
            console.log('✅ ログアウト成功');
        } catch (error) {
            console.error('❌ ログアウトエラー:', error);
            alert('ログアウトに失敗しました: ' + (error.message || '不明なエラー'));
        }
    }

    updateAuthUI(user) {
        const googleLoginBtn = document.getElementById('googleLoginBtn');
        const userInfo = document.getElementById('userInfo');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        
        if (!googleLoginBtn || !userInfo) return;
        
        // Firebase未設定の場合はログインボタンを非表示
        if (!window.firebaseAuth) {
            googleLoginBtn.style.display = 'none';
            userInfo.style.display = 'none';
            return;
        }
        
        if (user) {
            // ログイン中
            googleLoginBtn.style.display = 'none';
            userInfo.style.display = 'flex';
            
            if (userAvatar && user.photoURL) {
                userAvatar.src = user.photoURL;
            }
            
            if (userName) {
                userName.textContent = user.displayName || user.email;
            }
        } else {
            // ログアウト中
            googleLoginBtn.style.display = 'block';
            userInfo.style.display = 'none';
        }
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }
}

// グローバルインスタンス
let authManager;

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', async () => {
    authManager = new AuthManager();
    
    // グローバルに公開（他のスクリプトからアクセス可能に）
    window.authManager = authManager;
    
    // 初期化を実行
    try {
        await authManager.init();
        console.log('✅ AuthManagerの初期化が完了しました');
    } catch (error) {
        console.error('❌ AuthManagerの初期化エラー:', error);
    }
});

