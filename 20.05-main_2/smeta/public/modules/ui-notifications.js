// modules/ui-notifications.js

export function showLoading() {
    const overlay = document.getElementById('loading');
    if (overlay) overlay.style.display = 'flex';
}

export function hideLoading() {
    const overlay = document.getElementById('loading');
    if (overlay) overlay.style.display = 'none';
}

export function showError(message) {
    const errorDiv = document.getElementById('error');
    const messageSpan = document.getElementById('errorMessage');
    if (messageSpan) messageSpan.textContent = message;
    if (errorDiv) {
        errorDiv.style.display = 'flex';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

export function showSuccess(message) {
    const successDiv = document.getElementById('successNotification');
    const messageSpan = document.getElementById('successMessage');
    if (messageSpan) messageSpan.textContent = message;
    if (successDiv) {
        successDiv.style.display = 'flex';
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, 3000);
    }
}

export function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 3000);
    }
}