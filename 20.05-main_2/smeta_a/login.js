// login.js
if (localStorage.getItem('admin_user')) {
    window.location.href = '/index.html';
}

async function adminLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    const errorDiv = document.getElementById('loginError');

    if (!username || !password) {
        showLoginError('Введите логин и пароль');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span> Вход...</span>';

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Ошибка входа');
        }

        localStorage.setItem('admin_user', JSON.stringify(data.user));
        showLoginSuccess();
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 500);

    } catch (err) {
        showLoginError(err.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span> Войти</span>';
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    setTimeout(() => {
        errorDiv.classList.remove('show');
    }, 4000);
}

function showLoginSuccess() {
    const btn = document.getElementById('loginBtn');
    btn.innerHTML = '<i class="fas fa-check"></i><span> Успешно!</span>';
    btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
}

// Enter key support
document.getElementById('loginUsername')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') adminLogin();
});
document.getElementById('loginPassword')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') adminLogin();
});