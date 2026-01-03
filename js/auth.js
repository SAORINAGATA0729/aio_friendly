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
        while (!window.firebaseAuth && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!window.firebaseAuth) {
            console.error('Firebase Authが読み込まれませんでした');
            return false;
        }
        return true;
    }

    setupAuthStateListener() {
        if (!window.firebaseAuth) return;
        
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
            if (!window.firebaseAuth || !window.googleProvider) {
                alert('Firebaseが正しく読み込まれていません。ページをリロードしてください。');
                return;
            }
            
            const { signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            const result = await signInWithPopup(window.firebaseAuth, window.googleProvider);
            console.log('ログイン成功:', result.user);
        } catch (error) {
            console.error('ログインエラー:', error);
            if (error.code === 'auth/popup-closed-by-user') {
                alert('ログインがキャンセルされました');
            } else {
                alert('ログインに失敗しました: ' + error.message);
            }
        }
    }

    async signOut() {
        try {
            if (!window.firebaseAuth) return;
            
            const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            await signOut(window.firebaseAuth);
            console.log('ログアウト成功');
        } catch (error) {
            console.error('ログアウトエラー:', error);
            alert('ログアウトに失敗しました: ' + error.message);
        }
    }

    updateAuthUI(user) {
        const googleLoginBtn = document.getElementById('googleLoginBtn');
        const userInfo = document.getElementById('userInfo');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        
        if (!googleLoginBtn || !userInfo) return;
        
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
document.addEventListener('DOMContentLoaded', () => {
    authManager = new AuthManager();
    authManager.init();
});

