// トースト通知を表示する関数
function showToast(message, type = 'normal') {
    // 既存のトーストがあれば削除
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check_circle';
    if (type === 'error') icon = 'error';

    toast.innerHTML = `
        <span class="material-icons-round" style="font-size: 20px;">${icon}</span>
        ${message}
    `;

    document.body.appendChild(toast);

    // アニメーション用
    setTimeout(() => {
        toast.classList.add('active');
    }, 10);

    // 3秒後に消える
    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => {
            toast.remove();
        }, 400);
    }, 3000);
}

