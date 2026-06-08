// public/modules/auth.js

import { AppState, updateState } from './state.js';
import { showSuccess, showLoginError, showError } from './ui-notifications.js';
import { loadAllProjects } from './projects.js';
import { switchToProjectsTab } from '../components/navigation.js';
import { resetFile } from './file-handler.js';
import { escapeHtml } from '../utils/helpers.js';

// Получение токенов
export function getTokens() {
    return {
        accessToken: localStorage.getItem('analyzer_access_token'),
        refreshToken: localStorage.getItem('analyzer_refresh_token')
    };
}

// Сохранение токенов
function saveTokens(accessToken, refreshToken) {
    localStorage.setItem('analyzer_access_token', accessToken);
    localStorage.setItem('analyzer_refresh_token', refreshToken);
}

// Очистка токенов
function clearTokens() {
    localStorage.removeItem('analyzer_access_token');
    localStorage.removeItem('analyzer_refresh_token');
}

// Логин
export async function login() {
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    
    if (!usernameInput || !passwordInput) {
        showLoginError('Ошибка формы входа');
        return;
    }
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if (!username || !password) {
        showLoginError('Введите логин и пароль');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Сохраняем информацию о пользователе
            updateState('currentUser', data.user);
            
            // Обновляем UI
            const userNameSpan = document.getElementById('userName');
            if (userNameSpan) {
                userNameSpan.innerHTML = escapeHtml(data.user.fullname || data.user.username);
            }
            
            const loginScreen = document.getElementById('loginScreen');
            const appContainer = document.getElementById('appContainer');
            
            if (loginScreen) loginScreen.classList.add('hidden');
            if (appContainer) appContainer.classList.remove('hidden');
            
            await loadAllProjects();
            switchToProjectsTab();
            updateTabsState();
            
            showSuccess(`Добро пожаловать, ${data.user.fullname || data.user.username}!`);
        } else {
            showLoginError(data.message || 'Неверное имя пользователя или пароль');
        }
    } catch (err) {
        
        showLoginError(err.message || 'Ошибка соединения с сервером');
    }
}

// Выход
export async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (err) {
       
    }
    
    clearTokens();
    updateState('currentUser', null);
    updateState('currentProjectId', null);
    updateState('currentProject', null);
    updateState('currentProjectFilter', 'all');
    updateState('projectsLoaded', false);
    updateState('allProjects', []);
    updateState('filteredProjects', []);
    
    resetFile();
    
    const loginScreen = document.getElementById('loginScreen');
    const appContainer = document.getElementById('appContainer');
    
    if (loginScreen) loginScreen.classList.remove('hidden');
    if (appContainer) appContainer.classList.add('hidden');
    
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    
    showSuccess('Вы вышли из системы');
}

// Проверка аутентификации
export async function checkAuth() {
    // Просто проверяем, есть ли сохранённый пользователь
    const userId = localStorage.getItem('analyzer_user_id');
    
    if (userId) {
        try {
            const response = await fetch(`/api/users/${userId}`);
            
            if (response.ok) {
                const user = await response.json();
                updateState('currentUser', user);
                
                const userNameSpan = document.getElementById('userName');
                if (userNameSpan) {
                    userNameSpan.innerHTML = escapeHtml(user.fullname || user.username);
                }
                
                const loginScreen = document.getElementById('loginScreen');
                const appContainer = document.getElementById('appContainer');
                
                if (loginScreen) loginScreen.classList.add('hidden');
                if (appContainer) appContainer.classList.remove('hidden');
                
                await loadAllProjects();
                switchToProjectsTab();
                updateTabsState();
            } else {
                localStorage.removeItem('analyzer_user_id');
            }
        } catch (err) {
          
            localStorage.removeItem('analyzer_user_id');
        }
    }
}

function updateTabsState() {
    const tabWorkspace = document.getElementById('tabWorkspace');
    if (AppState.currentProjectId) {
        if (tabWorkspace) {
            tabWorkspace.classList.remove('disabled');
            tabWorkspace.removeAttribute('disabled');
        }
        
        const existingIndicator = document.querySelector('.selected-project-indicator');
        if (existingIndicator) existingIndicator.remove();
        
        if (AppState.currentProject) {
            const userNameSpan = document.getElementById('userName');
            if (userNameSpan) {
                const indicator = document.createElement('span');
                indicator.className = 'selected-project-indicator';
                indicator.innerHTML = `<i class="fas fa-check-circle"></i> Проект: ${escapeHtml(AppState.currentProject.project_name)}`;
                userNameSpan.appendChild(indicator);
            }
        }
    } else {
        if (tabWorkspace) {
            tabWorkspace.classList.add('disabled');
            tabWorkspace.setAttribute('disabled', 'disabled');
        }
        const indicator = document.querySelector('.selected-project-indicator');
        if (indicator) indicator.remove();
    }
}