// js/executive-dashboard.js

let currentPeriod = 30;
let currentUsers = [];
let currentErrors = [];

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

async function initDashboard() {
    await Promise.all([
        loadKPIs(),
        loadTopUsers(),
        loadTopErrors(),
        loadErrorTree()
    ]);
}

// ==================== KPI ЗАГРУЗКА ====================

async function loadKPIs() {
    try {
        const res = await fetch(`/api/analytics?days=${currentPeriod}`);
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('activeUsers').innerText = data.users?.length || 0;
            document.getElementById('avgAccuracy').innerText = `${(data.overview?.avg_accuracy || 0).toFixed(1)}%`;
            document.getElementById('totalErrors').innerText = data.overview?.not_found_codes || 0;
            document.getElementById('totalAmount').innerText = `${(data.overview?.total_amount || 0).toLocaleString()} ₽`;
            
            // Тренд точности (сравнение с прошлым периодом)
            const prevRes = await fetch(`/api/analytics?days=${currentPeriod * 2}`);
            const prevData = await prevRes.json();
            const trend = (data.overview?.avg_accuracy || 0) - (prevData.overview?.avg_accuracy || 0);
            const trendEl = document.getElementById('accuracyTrend');
            if (trend > 0) {
                trendEl.innerHTML = `▲ +${trend.toFixed(1)}%`;
                trendEl.className = 'kpi-trend up';
            } else if (trend < 0) {
                trendEl.innerHTML = `▼ ${trend.toFixed(1)}%`;
                trendEl.className = 'kpi-trend down';
            } else {
                trendEl.innerHTML = '→ 0%';
            }
        }
    } catch (err) {
        console.error('Error loading KPIs:', err);
    }
}

// ==================== ТОП ПОЛЬЗОВАТЕЛЕЙ ====================

async function loadTopUsers() {
    const sortBy = document.getElementById('usersSortBy')?.value || 'rating';
    const container = document.getElementById('topUsersContainer');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    try {
        const res = await fetch(`/api/executive/top-users?days=${currentPeriod}&limit=10&sortBy=${sortBy}`);
        const data = await res.json();
        
        if (!data.success || !data.users.length) {
            container.innerHTML = '<div class="loading">Нет данных</div>';
            return;
        }
        
        currentUsers = data.users;
        
        container.innerHTML = currentUsers.map((user, idx) => `
            <div class="user-card" onclick="showUserProjects(${user.user_id}, '${escapeHtml(user.user_name)}')">
                <div class="user-avatar">${getInitials(user.user_name)}</div>
                <div class="user-info">
                    <div class="user-name">
                        ${escapeHtml(user.user_name)}
                        ${user.trend > 0 ? '<span class="trend-up">▲</span>' : user.trend < 0 ? '<span class="trend-down">▼</span>' : ''}
                    </div>
                    <div class="user-institution">${escapeHtml(user.user_institution || '—')}</div>
                    <div class="user-stats">
                        <span><i class="fas fa-chart-line"></i> ${user.avg_accuracy}%</span>
                        <span><i class="fas fa-calendar"></i> ${user.sessions_count} сесс.</span>
                        <span><i class="fas fa-rupee-sign"></i> ${(user.total_amount || 0).toLocaleString()} ₽</span>
                    </div>
                </div>
                <div class="user-rating">
                    <div class="rating-badge">${user.rating || 0}</div>
                    <div style="font-size: 10px; margin-top: 4px;">рейтинг</div>
                </div>
            </div>
        `).join('');
        
    } catch (err) {
        console.error('Error loading top users:', err);
        container.innerHTML = '<div class="loading">Ошибка загрузки</div>';
    }
}

// ==================== ТОП ОШИБОК ====================

async function loadTopErrors() {
    const status = document.getElementById('errorsFilter')?.value || 'all';
    const container = document.getElementById('topErrorsContainer');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    try {
        const res = await fetch(`/api/executive/top-errors?days=${currentPeriod}&limit=20&status=${status}`);
        const data = await res.json();
        
        if (!data.success || !data.errors.length) {
            container.innerHTML = '<div class="loading">Нет ошибок за выбранный период</div>';
            return;
        }
        
        currentErrors = data.errors;
        
        container.innerHTML = currentErrors.map(error => `
            <div class="error-card" onclick="showErrorDetails('${escapeHtml(error.code)}')">
                <div class="error-code">
                    <code><strong>${escapeHtml(error.code)}</strong></code>
                    <span class="error-badge ${error.status === 'Нельзя применять' || error.is_restoration ? 'forbidden' : 'warning'}">
                        ${error.is_restoration ? '🏛️ Реставрация' : error.status}
                    </span>
                </div>
                <div class="error-stats">
                    <span><i class="fas fa-hashtag"></i> ${error.occurrence_count} раз</span>
                    <span><i class="fas fa-folder"></i> ${error.projects_count} проектов</span>
                    <span><i class="fas fa-clock"></i> ${formatDate(error.last_seen)}</span>
                </div>
                <div class="error-description">${escapeHtml(error.description || '—')}</div>
                <div class="error-projects">
                    ${error.projects?.slice(0, 5).map(p => `
                        <span class="project-pill" onclick="event.stopPropagation(); showProjectDetails(${p.id})">
                            📁 ${escapeHtml(p.project_name?.substring(0, 30))}
                        </span>
                    `).join('') || ''}
                    ${error.projects?.length > 5 ? `<span class="project-pill">+${error.projects.length - 5}</span>` : ''}
                </div>
            </div>
        `).join('');
        
    } catch (err) {
        console.error('Error loading top errors:', err);
        container.innerHTML = '<div class="loading">Ошибка загрузки</div>';
    }
}

// ==================== ДРЕВО ОШИБОК ====================

async function loadErrorTree() {
    const container = document.getElementById('errorTreeContainer');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    try {
        const res = await fetch(`/api/executive/error-tree?days=${currentPeriod}`);
        const data = await res.json();
        
        if (!data.success) {
            container.innerHTML = '<div class="loading">Нет данных</div>';
            return;
        }
        
        container.innerHTML = renderTree(data.tree);
        
    } catch (err) {
        console.error('Error loading error tree:', err);
        container.innerHTML = '<div class="loading">Ошибка загрузки</div>';
    }
}

function renderTree(node, level = 0) {
    if (!node || Object.keys(node).length === 0) {
        return '<div class="loading">Нет данных по иерархии</div>';
    }
    
    let html = '<div class="error-tree">';
    
    for (const [key, value] of Object.entries(node)) {
        const hasChildren = Object.keys(value.children || {}).length > 0;
        const nodeId = `tree-node-${Date.now()}-${Math.random()}`;
        
        html += `
            <div class="tree-node" data-level="${level}">
                <div class="tree-node-header" onclick="toggleTreeNode('${nodeId}')">
                    <span class="tree-toggle">${hasChildren ? '▶' : '•'}</span>
                    <span class="tree-icon">${getLevelIcon(value.level)}</span>
                    <span class="tree-name">${escapeHtml(value.name)}</span>
                    <span class="tree-count">${value.total_errors} ошибок</span>
                </div>
                <div id="${nodeId}" class="tree-children" style="display: none;">
                    ${hasChildren ? renderTree(value.children, level + 1) : renderCodeList(value.codes)}
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    return html;
}

function renderCodeList(codes) {
    if (!codes || codes.length === 0) return '';
    
    return `
        <div class="code-list">
            ${codes.map(code => `
                <div class="code-item" onclick="showErrorDetails('${escapeHtml(code.code)}')">
                    <code>${escapeHtml(code.code)}</code>
                    <span class="error-count">${code.count} раз</span>
                </div>
            `).join('')}
        </div>
    `;
}

function getLevelIcon(level) {
    const icons = { 1: '📖', 2: '📚', 3: '📁', 4: '📋' };
    return icons[level] || '🔍';
}

function toggleTreeNode(nodeId) {
    const el = document.getElementById(nodeId);
    if (el) {
        const isOpen = el.style.display !== 'none';
        el.style.display = isOpen ? 'none' : 'block';
        const toggle = el.previousElementSibling?.querySelector('.tree-toggle');
        if (toggle) toggle.textContent = isOpen ? '▶' : '▼';
    }
}

function toggleErrorTree() {
    document.querySelectorAll('.tree-children').forEach(el => {
        el.style.display = 'block';
        const toggle = el.previousElementSibling?.querySelector('.tree-toggle');
        if (toggle) toggle.textContent = '▼';
    });
}

// ==================== МОДАЛЬНЫЕ ОКНА ====================

async function showUserProjects(userId, userName) {
    const modal = document.getElementById('userProjectsModal');
    const title = document.getElementById('userProjectsTitle');
    const body = document.getElementById('userProjectsBody');
    
    title.innerText = `Проекты: ${escapeHtml(userName)}`;
    body.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    try {
        const res = await fetch(`/api/executive/user-projects/${userId}?days=${currentPeriod}`);
        const data = await res.json();
        
        if (!data.success || !data.projects?.length) {
            body.innerHTML = '<div class="loading">Нет проектов с проблемами</div>';
            return;
        }
        
        body.innerHTML = `
            <div class="projects-list">
                ${data.projects.map(proj => `
                    <div class="project-card" onclick="window.location.href='/projects.html?projectId=${proj.id}'">
                        <div class="project-header">
                            <strong>📁 ${escapeHtml(proj.project_name)}</strong>
                            <span class="project-status ${proj.status}">${proj.status === 'active' ? 'Активен' : 'Архив'}</span>
                        </div>
                        <div class="project-stats">
                            <div><i class="fas fa-chart-line"></i> Точность: ${proj.total_codes > 0 ? ((proj.found_codes / proj.total_codes) * 100).toFixed(1) : 0}%</div>
                            <div><i class="fas fa-exclamation-triangle"></i> Ошибок: ${proj.coefficient_errors + proj.restoration_errors + proj.not_found_errors}</div>
                            <div><i class="fas fa-calendar"></i> Обновлён: ${formatDate(proj.updated_at)}</div>
                        </div>
                        <div class="project-problems">
                            <strong>Проблемные коды:</strong>
                            <div class="problem-codes">${escapeHtml(proj.problem_codes_sample || '—')}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <style>
                .project-card {
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .project-card:hover {
                    background: #f9fafb;
                    border-color: #8b5cf6;
                }
                .project-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 12px;
                }
                .project-status {
                    padding: 2px 8px;
                    border-radius: 20px;
                    font-size: 11px;
                }
                .project-status.active { background: #dcfce7; color: #166534; }
                .project-status.archived { background: #f3f4f6; color: #4b5563; }
                .project-stats {
                    display: flex;
                    gap: 24px;
                    font-size: 13px;
                    color: #6b7280;
                    margin-bottom: 12px;
                }
                .problem-codes {
                    font-family: monospace;
                    font-size: 12px;
                    background: #f3f4f6;
                    padding: 8px;
                    border-radius: 8px;
                    margin-top: 6px;
                    word-break: break-all;
                }
            </style>
        `;
        
    } catch (err) {
        console.error('Error loading user projects:', err);
        body.innerHTML = '<div class="loading">Ошибка загрузки</div>';
    }
}

async function showErrorDetails(errorCode) {
    const modal = document.getElementById('errorDetailsModal');
    const title = document.getElementById('errorDetailsTitle');
    const body = document.getElementById('errorDetailsBody');
    
    title.innerText = `Детали ошибки: ${escapeHtml(errorCode)}`;
    body.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    try {
        const res = await fetch(`/api/executive/error-details/${encodeURIComponent(errorCode)}`);
        const data = await res.json();
        
        if (!data.success) {
            body.innerHTML = '<div class="loading">Ошибка загрузки деталей</div>';
            return;
        }
        
        body.innerHTML = `
            <div class="error-stats-summary">
                <div class="stat-item"><strong>📊 Всего вхождений:</strong> ${data.stats.total_occurrences}</div>
                <div class="stat-item"><strong>📁 Проектов:</strong> ${data.stats.unique_projects}</div>
                <div class="stat-item"><strong>👥 Сметчиков:</strong> ${data.stats.unique_users}</div>
                <div class="stat-item"><strong>📅 Первое появление:</strong> ${formatDate(data.stats.first_seen)}</div>
                <div class="stat-item"><strong>🕒 Последнее появление:</strong> ${formatDate(data.stats.last_seen)}</div>
            </div>
            <h4 style="margin: 20px 0 12px;">📋 Список вхождений</h4>
            <div class="sessions-list">
                ${data.sessions.map(sess => `
                    <div class="session-row" onclick="window.location.href='/session-details.html?sessionId=${sess.session_id}'">
                        <div class="session-info">
                            <div><strong>📄 ${escapeHtml(sess.filename || '—')}</strong></div>
                            <div class="session-meta">
                                <span><i class="fas fa-user"></i> ${escapeHtml(sess.user_name || '—')}</span>
                                <span><i class="fas fa-folder"></i> ${escapeHtml(sess.project_name || 'Без проекта')}</span>
                                <span><i class="fas fa-calendar"></i> ${formatDate(sess.created_at)}</span>
                            </div>
                        </div>
                        <div class="session-details">
                            <span class="position-badge">Поз. ${sess.position || '—'}</span>
                            ${sess.coefficient_value ? `<span class="coeff-badge">Коэф: ${sess.coefficient_value}</span>` : ''}
                            <button class="btn-sm" onclick="event.stopPropagation(); window.open('/api/analytics/session-export/${sess.session_id}')">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <style>
                .error-stats-summary {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 12px;
                    background: #f9fafb;
                    padding: 16px;
                    border-radius: 12px;
                    margin-bottom: 16px;
                }
                .stat-item {
                    font-size: 13px;
                }
                .session-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    margin-bottom: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .session-row:hover {
                    background: #f9fafb;
                    border-color: #8b5cf6;
                }
                .session-meta {
                    display: flex;
                    gap: 16px;
                    font-size: 12px;
                    color: #6b7280;
                    margin-top: 4px;
                }
                .session-details {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                }
                .position-badge, .coeff-badge {
                    padding: 2px 8px;
                    border-radius: 20px;
                    font-size: 11px;
                    background: #f3f4f6;
                }
                .btn-sm {
                    padding: 4px 10px;
                    background: #e5e7eb;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                }
                .btn-sm:hover {
                    background: #8b5cf6;
                    color: white;
                }
            </style>
        `;
        
    } catch (err) {
        console.error('Error loading error details:', err);
        body.innerHTML = '<div class="loading">Ошибка загрузки</div>';
    }
}

function showProjectDetails(projectId) {
    window.location.href = `/projects.html?projectId=${projectId}`;
}

// ==================== УТИЛИТЫ ====================

function getInitials(name) {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function formatDate(dateString) {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return dateString;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function refreshDashboard() {
    Promise.all([loadKPIs(), loadTopUsers(), loadTopErrors(), loadErrorTree()]);
}

function exportDashboard() {
    // Экспорт текущего дашборда в PDF
    window.print();
}

function closeUserProjectsModal() {
    const modal = document.getElementById('userProjectsModal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
}

function closeErrorDetailsModal() {
    const modal = document.getElementById('errorDetailsModal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
}

// ==================== ЗАПУСК ====================

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    
    // Период
    const periodSelect = document.getElementById('periodSelect');
    if (periodSelect) {
        periodSelect.addEventListener('change', () => {
            currentPeriod = parseInt(periodSelect.value);
            refreshDashboard();
        });
    }
});

// Глобальные функции для HTML
window.showUserProjects = showUserProjects;
window.showErrorDetails = showErrorDetails;
window.showProjectDetails = showProjectDetails;
window.toggleTreeNode = toggleTreeNode;
window.toggleErrorTree = toggleErrorTree;
window.refreshDashboard = refreshDashboard;
window.exportDashboard = exportDashboard;
window.closeUserProjectsModal = closeUserProjectsModal;
window.closeErrorDetailsModal = closeErrorDetailsModal;