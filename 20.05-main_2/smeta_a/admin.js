// admin.js - ПОЛНАЯ ВЕРСИЯ
// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let currentExactCodes = [];
let currentParentCodes = [];
let currentHierarchicalCodes = [];
let currentRelations = [];
let currentUsers = [];
let currentProjects = [];
let autoRefresh = true;
let refreshInterval;
let statusChart = null;
let currentAdmin = null;
let currentPeriod = 30;
let currentAnalyticsProjectId = null;
let currentProjectFilter = 'all';

// ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С МОСКОВСКИМ ВРЕМЕНЕМ ====================
function formatMoscowDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        return `${day}.${month}.${year}, ${hours}:${minutes}:${seconds}`;
    } catch (e) {
        return dateString;
    }
}

function getCurrentMoscowTime() {
    const date = new Date();
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${day}.${month}.${year}, ${hours}:${minutes}:${seconds}`;
}

// ==================== БЕЗОПАСНЫЕ ФУНКЦИИ ====================
function safeInnerHTML(elementId, html, defaultValue = '') {
    const el = document.getElementById(elementId);
    if (el) el.innerHTML = html;
    return !!el;
}

function safeText(elementId, text, defaultValue = '') {
    const el = document.getElementById(elementId);
    if (el) el.innerText = text;
    return !!el;
}

// ==================== АУТЕНТИФИКАЦИЯ ====================
function adminLogout() {
    localStorage.removeItem('admin_user');
    showSuccess('Выход выполнен');
    setTimeout(() => window.location.href = '/login.html', 500);
}

// ==================== МОДАЛЬНЫЕ ОКНА ====================
function openModalElement(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        document.body.style.paddingRight = '15px';
    }
}

function closeModalElement(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }
}

function openModal(title) {
    const titleEl = document.getElementById('modalTitle');
    if (titleEl) titleEl.innerText = title;
    openModalElement('modal');
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

function closeSessionModal() {
    closeModalElement('sessionModal');
}

function closeUserSessionsModal() {
    closeModalElement('userSessionsModal');
}

function closeProjectDetailModal() {
    closeModalElement('projectDetailModal');
}

// ==================== УВЕДОМЛЕНИЯ ====================
function showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification toast-success';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification toast-error';
    toast.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== ЗАГРУЗКА ДАННЫХ ====================
async function loadExactCodes() {
    try {
        const res = await fetch('/api/codes/exact');
        currentExactCodes = await res.json();
        renderExactTable(currentExactCodes);
        updateDashboard();
        safeInnerHTML('lastUpdate', `<i class="fas fa-clock"></i> ${getCurrentMoscowTime()}`);
    } catch (error) {
        console.error(error);
        showError('Ошибка загрузки точных кодов');
    }
}

async function loadParentCodes() {
    try {
        const res = await fetch('/api/codes/parent');
        currentParentCodes = await res.json();
        renderParentTable(currentParentCodes);
        updateDashboard();
    } catch (error) {
        console.error(error);
        showError('Ошибка загрузки родительских кодов');
    }
}

async function loadHierarchicalCodes() {
    try {
        const res = await fetch('/api/codes/hierarchical');
        currentHierarchicalCodes = await res.json();
        renderHierarchicalTable(currentHierarchicalCodes);
        updateDashboard();
    } catch (error) {
        console.error(error);
        showError('Ошибка загрузки иерархических кодов');
    }
}

async function loadRelations() {
    try {
        const res = await fetch('/api/codes/relations');
        currentRelations = await res.json();
        renderRelationsTable(currentRelations);
    } catch (error) {
        console.error(error);
        showError('Ошибка загрузки связей');
    }
}

async function loadUsers() {
    try {
        const res = await fetch('/api/users');
        currentUsers = await res.json();
        renderUsersTable(currentUsers);
    } catch (error) {
        console.error(error);
        showError('Ошибка загрузки пользователей');
    }
}

async function loadProjects() {
    try {
        const res = await fetch('/api/admin/projects');
        currentProjects = await res.json();
        renderProjectsTable();
    } catch (error) {
        console.error(error);
        showError('Ошибка загрузки проектов');
    }
}

async function loadAnalytics() {
    try {
        const projectId = currentAnalyticsProjectId || null;
        const url = `/api/analytics?days=${currentPeriod}${projectId ? '&project_id=' + projectId : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.success) throw new Error(data.error || 'Ошибка загрузки');
        
        renderUserAnalyticsTable(data.users);
        
        safeText('totalSessions', data.overview?.total_sessions || 0);
        safeText('totalCodesCount', data.overview?.total_codes || 0);
        safeText('avgAccuracy', `${(data.overview?.avg_accuracy || 0).toFixed(1)}%`);
        safeText('totalAmount', `${(data.overview?.total_amount || 0).toLocaleString()} ₽`);
        
        const projectSelect = document.getElementById('analyticsProjectSelect');
        if (projectSelect) {
            projectSelect.innerHTML = '<option value="">🌐 Все проекты</option>' +
                (data.projects || []).map(p => `<option value="${p.id}">📁 ${escapeHtml(p.project_name)}</option>`).join('');
            projectSelect.value = currentAnalyticsProjectId || '';
        }
        
        safeInnerHTML('analyticsLastUpdate', `<i class="fas fa-clock"></i> ${getCurrentMoscowTime()}`);
    } catch (err) {
        console.error(err);
        showError('Ошибка загрузки аналитики');
    }
}

// ==================== ОТРИСОВКА ТАБЛИЦ ====================
function renderExactTable(codes) {
    const tbody = document.getElementById('exactTableBody');
    if (!tbody) return;
    
    if (!codes || codes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">Нет данных</td></tr>';
        return;
    }
    
    const sorted = [...codes].sort((a, b) => b.id - a.id);
    tbody.innerHTML = sorted.map(code => {
        const statusClass = (code.status || '').replace(/[^а-яёa-z0-9]/gi, '-');
        let coeffDisplay = '-';
        if (code.has_coefficient) {
            coeffDisplay = code.coefficient_value ? `${code.coefficient_value} (${code.coefficient_type === 'increasing' ? '↑' : '↓'})` : (code.coefficient_type === 'increasing' ? 'Повышающий' : 'Понижающий');
        }
        return `
            <tr>
                <td class="font-mono">${code.id}</td>
                <td class="font-mono">${escapeHtml(code.code)}${code.is_restoration ? '<span class="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">🏛️ Реставрация</span>' : ''}</td>
                <td>${escapeHtml(code.description || '-')}</td>
                <td><span class="status-badge status-${statusClass}">${code.status}</span></td>
                <td class="text-center">${code.is_exact ? '✅' : '❌'}</td>
                <td class="text-center">${code.has_coefficient ? '✅' : '❌'}</td>
                <td class="text-center">${coeffDisplay}</td>
                <td class="text-center">
                    <button onclick="openEditExactModal(${code.id})" class="text-indigo-600"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteExactCode(${code.id})" class="text-red-600 ml-2"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderParentTable(codes) {
    const tbody = document.getElementById('parentTableBody');
    if (!tbody) return;
    
    if (!codes || codes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">Нет данных</td></tr>';
        return;
    }
    
    const sorted = [...codes].sort((a, b) => b.id - a.id);
    tbody.innerHTML = sorted.map(code => {
        const statusClass = (code.status || '').replace(/[^а-яёa-z0-9]/gi, '-');
        let coeffDisplay = '-';
        if (code.has_coefficient) {
            coeffDisplay = code.coefficient_value ? `${code.coefficient_value} (${code.coefficient_type === 'increasing' ? '↑' : '↓'})` : (code.coefficient_type === 'increasing' ? 'Повышающий' : 'Понижающий');
        }
        return `
            <tr>
                <td class="font-mono">${code.id}</td>
                <td class="font-mono">${escapeHtml(code.code)}</td>
                <td>${escapeHtml(code.description || '-')}</td>
                <td><span class="status-badge status-${statusClass}">${code.status}</span></td>
                <td class="text-center">${code.has_coefficient ? '✅' : '❌'}</td>
                <td class="text-center">${coeffDisplay}</td>
                <td class="text-center">
                    <button onclick="openEditParentModal(${code.id})" class="text-indigo-600"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteParentCode(${code.id})" class="text-red-600 ml-2"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderHierarchicalTable(codes) {
    const tbody = document.getElementById('hierarchicalTableBody');
    if (!tbody) return;
    
    if (!codes || codes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">Нет данных</td></tr>';
        return;
    }
    
    const levelNames = { 1: '📖 Глава', 2: '📚 Сборник', 3: '📁 Отдел', 4: '📋 Таблица' };
    const sorted = [...codes].sort((a, b) => a.level - b.level);
    tbody.innerHTML = sorted.map(code => {
        const statusClass = (code.status || '').replace(/[^а-яёa-z0-9]/gi, '-');
        let coeffDisplay = '-';
        if (code.has_coefficient) {
            coeffDisplay = code.coefficient_value ? `${code.coefficient_value} (${code.coefficient_type === 'increasing' ? '↑' : '↓'})` : (code.coefficient_type === 'increasing' ? 'Повышающий' : 'Понижающий');
        }
        return `
            <tr>
                <td class="font-mono">${code.id}</td>
                <td>${levelNames[code.level]}</td>
                <td class="font-mono">${escapeHtml(code.code)}</td>
                <td>${escapeHtml(code.description || '-')}</td>
                <td><span class="status-badge status-${statusClass}">${code.status}</span></td>
                <td class="text-center">${code.has_coefficient ? '✅' : '❌'}</td>
                <td class="text-center">${coeffDisplay}</td>
                <td class="text-center">
                    <button onclick="openEditHierarchicalModal(${code.id})" class="text-indigo-600"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteHierarchicalCode(${code.id})" class="text-red-600 ml-2"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderRelationsTable(relations) {
    const tbody = document.getElementById('relationsTableBody');
    if (!tbody) return;
    
    if (!relations || relations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">Нет связей</td></tr>';
        return;
    }
    
    tbody.innerHTML = relations.map(rel => `
        <tr>
            <td>${rel.id}</td>
            <td class="font-mono">${escapeHtml(rel.source_code)}</td>
            <td class="font-mono">${escapeHtml(rel.target_code)}</td>
            <td><span class="status-badge" style="background:#e0e7ff; color:#4338ca;">${rel.relation_type === 'duplicate' ? '🔄 Дублирующий' : '🔗 Связанный'}</span></td>
            <td>${escapeHtml(rel.description || '-')}</td>
            <td class="text-center"><button onclick="deleteRelation(${rel.id})" class="text-red-600"><i class="fas fa-trash"></i></button></td>
        </tr>
    `).join('');
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">Нет пользователей</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.id}</td>
            <td class="font-mono">${escapeHtml(user.username)}</td>
            <td>${escapeHtml(user.fullname || '-')}</td>
            <td>${escapeHtml(user.institution || '-')}</td>
            <td><span class="status-badge" style="background:${user.role === 'admin' ? '#e0e7ff' : '#dcfce7'}; color:${user.role === 'admin' ? '#4338ca' : '#166534'}">${user.role === 'admin' ? '👑 Админ' : '👤 Пользователь'}</span></td>
            <td><span class="status-badge" style="background:${user.is_active ? '#dcfce7' : '#fee2e2'}; color:${user.is_active ? '#166534' : '#991b1b'}">${user.is_active ? '✅ Активен' : '❌ Заблокирован'}</span></td>
            <td>${formatMoscowDate(user.last_login)}</td>
            <td class="text-center">
                <button onclick="openEditUserModal(${user.id})" class="text-indigo-600"><i class="fas fa-edit"></i></button>
                <button onclick="deleteUser(${user.id})" class="text-red-600 ml-2" ${user.role === 'admin' ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function renderUserAnalyticsTable(users) {
    const tbody = document.getElementById('usersAnalyticsTableBody');
    if (!tbody) return;
    
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-8 text-gray-500">Нет данных</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map((user, idx) => {
        const accuracy = user.accuracy || 0;
        const accuracyClass = accuracy >= 80 ? 'text-green-600' : (accuracy >= 50 ? 'text-yellow-600' : 'text-red-600');
        return `
            <tr class="cursor-pointer" onclick="showUserSessions('${escapeHtml(user.user_name)}')">
                <td>${idx + 1}</td>
                <td class="font-medium">${escapeHtml(user.user_name)}</td>
                <td class="text-xs text-gray-500">${escapeHtml(user.user_institution || '—')}</td>
                <td class="whitespace-nowrap">${formatMoscowDate(user.last_activity)}</td>
                <td class="text-center">${user.sessions_count || 0}</td>
                <td class="text-center">${user.files_count || 0}</td>
                <td class="text-center">${user.total_codes || 0}</td>
                <td class="text-center">${user.found_codes || 0}</td>
                <td class="text-center font-semibold ${accuracyClass}">${accuracy}%</td>
                <td class="text-center text-xs">
                    <span title="Точные">✅${user.exact_matches || 0}</span>
                    <span title="Таблицы" class="ml-1">📋${user.table_matches || 0}</span>
                    <span title="Связи" class="ml-1">🔗${user.relation_matches || 0}</span>
                    <span title="Коэффициенты" class="ml-1">📊${user.coeff_matches || 0}/${user.coeff_mismatches || 0}</span>
                </td>
                <td class="text-center">
                    <button onclick="event.stopPropagation(); showUserSessions('${escapeHtml(user.user_name)}')" class="text-indigo-600">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}
// ==================== ДАШБОРД ====================
async function updateDashboard() {
    try {
        const res = await fetch('/api/codes/stats');
        const stats = await res.json();
        
        safeText('totalCodes', stats.total || 0);
        safeText('exactCodesCount', stats.exact || 0);
        safeText('parentCodesCount', stats.parent || 0);
        safeText('hierarchicalCodesCount', stats.hierarchical || 0);
        safeText('relationsCount', stats.relations || 0);
        safeText('restorationCodes', stats.restoration || 0);
        safeText('availableCodes', stats.available || 0);
        safeText('warningCodes', stats.warning || 0);
        safeText('chaptersCount', stats.chapters || 0);
        safeText('collectionsCount', stats.collections || 0);
        safeText('sectionsCount', stats.sections || 0);
        safeText('tablesCount', stats.tables || 0);
        
        updateStatusChart();
        updateRecentCodes();
    } catch (e) {
        console.error(e);
    }
}

function updateStatusChart() {
    const ctx = document.getElementById('statusChart')?.getContext('2d');
    if (!ctx) return;
    
    const available = currentExactCodes.filter(c => c.status === 'Доступен').length + 
                      currentHierarchicalCodes.filter(c => c.status === 'Доступен').length +
                      currentParentCodes.filter(c => c.status === 'Доступен').length;
    const warning = currentExactCodes.filter(c => c.status === 'Обратите внимание').length + 
                    currentHierarchicalCodes.filter(c => c.status === 'Обратите внимание').length +
                    currentParentCodes.filter(c => c.status === 'Обратите внимание').length;
    const notAllowed = currentExactCodes.filter(c => c.status === 'Нельзя применять').length + 
                       currentHierarchicalCodes.filter(c => c.status === 'Нельзя применять').length +
                       currentParentCodes.filter(c => c.status === 'Нельзя применять').length;
    
    if (statusChart) statusChart.destroy();
    
    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['✅ Доступен', '⚠️ Обратите внимание', '❌ Нельзя применять'],
            datasets: [{
                data: [available, warning, notAllowed],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 15, font: { size: 12 } } }
            }
        }
    });
}

function updateRecentCodes() {
    const recent = [...currentExactCodes, ...currentHierarchicalCodes, ...currentParentCodes]
        .sort((a, b) => b.id - a.id)
        .slice(0, 5);
    
    const container = document.getElementById('recentCodesList');
    if (!container) return;
    
    if (!recent.length) {
        container.innerHTML = '<p class="text-center py-8 text-gray-500">Нет данных</p>';
        return;
    }
    
    container.innerHTML = recent.map(code => `
        <div class="session-item" style="background: #f9fafb; border-radius: 12px; padding: 12px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <code class="font-mono" style="font-size: 13px;">${escapeHtml(code.code)}</code>
                    ${code.has_coefficient ? '<span class="ml-2 text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">📊 Коэф.</span>' : ''}
                    <p class="text-xs text-gray-500 mt-1">${escapeHtml(code.description || 'Без описания')}</p>
                </div>
                <span class="status-badge status-${(code.status || '').replace(/[^а-яёa-z0-9]/gi, '-')}">${code.status}</span>
            </div>
        </div>
    `).join('');
}

// ==================== ТОЧНЫЕ КОДЫ - ДЕЙСТВИЯ ====================
async function deleteExactCode(id) {
    if (confirm('Удалить этот код?')) {
        const res = await fetch('/api/codes/exact', { 
            method: 'DELETE', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify([id]) 
        });
        if (res.ok) { 
            loadExactCodes(); 
            refreshAnalytics();
            showSuccess('Код удален');
        }
    }
}

// admin.js - ДОБАВИТЬ В ФУНКЦИЮ openAddExactModal()

function openAddExactModal() {
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;
    
    modalBody.innerHTML = `
        <div class="form-group">
            <label>Код *</label>
            <input type="text" id="newExactCode" placeholder="Например: 1.21-1303-33-6/1" class="font-mono" style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px;">
        </div>
        <div class="form-group">
            <label>Описание</label>
            <textarea id="newExactDesc" rows="2" placeholder="Описание работы" style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px;"></textarea>
        </div>
        <div class="form-group">
            <label>Статус</label>
            <select id="newExactStatus" style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px;">
                <option value="Доступен">✅ Доступен</option>
                <option value="Обратите внимание">⚠️ Обратите внимание</option>
                <option value="Нельзя применять">❌ Нельзя применять</option>
            </select>
        </div>
        <div class="form-group">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="newExactRestoration"> Реставрационный код
            </label>
        </div>
        <div class="form-group">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="newExactHasCoefficient"> Имеет коэффициент
            </label>
        </div>
        <div id="newCoefficientContainer" style="display:none;">
            <div class="form-group">
                <label>Числовое значение коэффициента</label>
                <input type="number" id="newExactCoefficientValue" step="0.01" placeholder="Например: 0.82, 1.15" style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px;">
            </div>
            <div class="form-group">
                <label>Тип коэффициента</label>
                <select id="newExactCoefficientType" style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px;">
                    <option value="increasing">Повышающий (>1)</option>
                    <option value="decreasing">Понижающий (<1)</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="newExactCheckCoefficient"> 
                <span><i class="fas fa-check-double"></i> Проверять коэффициент при анализе</span>
            </label>
            <p style="font-size:11px; color:#6b7280; margin-top:4px; margin-left:24px;">Если включено, система будет проверять соответствие коэффициента в смете указанному значению</p>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
            <button onclick="closeModal()" class="btn-outline" style="padding:8px 16px; background:transparent; border:1px solid #e5e7eb; border-radius:10px; cursor:pointer;">Отмена</button>
            <button onclick="saveExactCode()" class="btn-primary" style="padding:8px 16px; background:linear-gradient(135deg, #8b5cf6, #7c3aed); border:none; border-radius:10px; color:white; cursor:pointer;">Сохранить</button>
        </div>
    `;
    
    // Обработчик для показа/скрытия блока коэффициента
    const coeffCheckbox = document.getElementById('newExactHasCoefficient');
    const coeffContainer = document.getElementById('newCoefficientContainer');
    if (coeffCheckbox && coeffContainer) {
        coeffCheckbox.onclick = function() {
            coeffContainer.style.display = this.checked ? 'block' : 'none';
        };
    }
    
    openModal('Добавление точного кода');
}

function validateCodeInput(code) {
    const validationDiv = document.getElementById('newCodeValidation');
    if (!validationDiv) return;
    
    if (!code || code.length < 3) {
        validationDiv.innerHTML = '';
        return;
    }
    
    // Проверка существующего кода
    const existing = currentExactCodes.find(c => c.code === code);
    if (existing) {
        validationDiv.innerHTML = '<span class="text-red-600"><i class="fas fa-exclamation-triangle"></i> Такой код уже существует!</span>';
        validationDiv.style.color = '#dc2626';
    } else {
        validationDiv.innerHTML = '<span class="text-green-600"><i class="fas fa-check-circle"></i> Код уникален</span>';
        validationDiv.style.color = '#10b981';
    }
}

async function saveExactCode() {
    const codeInput = document.getElementById('newExactCode');
    const descInput = document.getElementById('newExactDesc');
    const statusSelect = document.getElementById('newExactStatus');
    const restorationCheckbox = document.getElementById('newExactRestoration');
    const hasCoeffCheckbox = document.getElementById('newExactHasCoefficient');
    const checkCoeffCheckbox = document.getElementById('newExactCheckCoefficient');
    const coeffValueInput = document.getElementById('newExactCoefficientValue');
    const coeffTypeSelect = document.getElementById('newExactCoefficientType');
    
    if (!codeInput) {
        console.error('Element newExactCode not found');
        alert('Ошибка: элемент формы не найден');
        return;
    }
    
    const code = codeInput.value.trim();
    const description = descInput ? descInput.value : '';
    const status = statusSelect ? statusSelect.value : 'Доступен';
    const isRestoration = restorationCheckbox ? restorationCheckbox.checked : false;
    const hasCoefficient = hasCoeffCheckbox ? hasCoeffCheckbox.checked : false;
    const checkCoefficient = checkCoeffCheckbox ? checkCoeffCheckbox.checked : false;
    
    let coefficientValue = null;
    let coefficientType = 'none';
    
    if (hasCoefficient) {
        if (!coeffValueInput) {
            alert('Ошибка: поле значения коэффициента не найдено');
            return;
        }
        coefficientValue = parseFloat(coeffValueInput.value);
        coefficientType = coeffTypeSelect ? coeffTypeSelect.value : 'none';
        if (isNaN(coefficientValue)) {
            alert('Введите числовое значение коэффициента');
            return;
        }
    }
    
    if (!code) {
        alert('Введите код');
        return;
    }
    
    // Проверка на дубликат
    if (currentExactCodes && currentExactCodes.some(c => c.code === code)) {
        alert('Такой код уже существует в базе!');
        return;
    }
    
    try {
        const response = await fetch('/api/codes/exact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                Code: code, 
                Description: description, 
                Status: status,
                IsRestoration: isRestoration, 
                HasCoefficient: hasCoefficient,
                CoefficientValue: coefficientValue, 
                CoefficientType: coefficientType,
                CheckCoefficient: checkCoefficient,
                IsExact: true, 
                adminName: currentAdmin?.username || 'admin'
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            closeModal();
            await loadExactCodes();
            if (typeof refreshAnalytics === 'function') refreshAnalytics();
            alert('Код успешно добавлен');
        } else {
            alert(data.error || 'Ошибка при добавлении кода');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при добавлении кода: ' + error.message);
    }
}

// Обновить openEditExactModal
async function openEditExactModal(id) {
    const code = currentExactCodes.find(c => c.id === id);
    if (!code) return;
    
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;
    
    modalBody.innerHTML = `
        <input type="hidden" id="editExactId" value="${code.id}">
        <div class="form-group">
            <label>Код</label>
            <input type="text" id="editExactCode" value="${escapeHtml(code.code)}" class="font-mono">
        </div>
        <div class="form-group">
            <label>Описание</label>
            <textarea id="editExactDesc" rows="3">${escapeHtml(code.description || '')}</textarea>
        </div>
        <div class="form-group">
            <label>Статус</label>
            <select id="editExactStatus">
                <option value="Доступен" ${code.status === 'Доступен' ? 'selected' : ''}>✅ Доступен</option>
                <option value="Обратите внимание" ${code.status === 'Обратите внимание' ? 'selected' : ''}>⚠️ Обратите внимание</option>
                <option value="Нельзя применять" ${code.status === 'Нельзя применять' ? 'selected' : ''}>❌ Нельзя применять</option>
            </select>
        </div>
        <div class="form-group">
            <label class="flex items-center">
                <input type="checkbox" id="editExactRestoration" ${code.is_restoration ? 'checked' : ''}> Реставрационный код
            </label>
        </div>
        <div class="form-group">
            <label class="flex items-center">
                <input type="checkbox" id="editExactHasCoefficient" ${code.has_coefficient ? 'checked' : ''}> Имеет коэффициент
            </label>
        </div>
        <div id="editCoefficientContainer" class="${code.has_coefficient ? '' : 'hidden'}">
            <div class="form-group">
                <label>Числовое значение коэффициента</label>
                <input type="number" id="editExactCoefficientValue" step="0.01" value="${code.coefficient_value || ''}">
            </div>
            <div class="form-group">
                <label>Тип коэффициента</label>
                <select id="editExactCoefficientType">
                    <option value="increasing" ${code.coefficient_type === 'increasing' ? 'selected' : ''}>Повышающий</option>
                    <option value="decreasing" ${code.coefficient_type === 'decreasing' ? 'selected' : ''}>Понижающий</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label class="flex items-center">
                <input type="checkbox" id="editExactCheckCoefficient" ${code.check_coefficient ? 'checked' : ''}> 
                <span><i class="fas fa-check-double"></i> Проверять коэффициент при анализе</span>
            </label>
            <p class="text-xs text-gray-500 mt-1 ml-6">Если включено, система будет проверять соответствие коэффициента в смете</p>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
            <button onclick="closeModal()" class="btn-outline">Отмена</button>
            <button onclick="updateExactCode()" class="btn-primary">Обновить</button>
        </div>
    `;
    
    // Обработчик для показа/скрытия блока коэффициента
    const coeffCheckbox = document.getElementById('editExactHasCoefficient');
    const coeffContainer = document.getElementById('editCoefficientContainer');
    if (coeffCheckbox && coeffContainer) {
        coeffCheckbox.addEventListener('change', function() {
            coeffContainer.classList.toggle('hidden', !this.checked);
        });
    }
    
    openModal('Редактирование точного кода');
}

async function updateExactCode() {
    const id = document.getElementById('editExactId')?.value;
    const code = document.getElementById('editExactCode')?.value.trim();
    const description = document.getElementById('editExactDesc')?.value || '';
    const status = document.getElementById('editExactStatus')?.value || 'Доступен';
    const isRestoration = document.getElementById('editExactRestoration')?.checked || false;
    const hasCoefficient = document.getElementById('editExactHasCoefficient')?.checked || false;
    const checkCoefficient = document.getElementById('editExactCheckCoefficient')?.checked || false;
    
    let coefficientValue = null;
    let coefficientType = 'none';
    
    if (hasCoefficient) {
        coefficientValue = parseFloat(document.getElementById('editExactCoefficientValue')?.value);
        coefficientType = document.getElementById('editExactCoefficientType')?.value || 'none';
        if (isNaN(coefficientValue)) {
            showError('Введите числовое значение коэффициента');
            return;
        }
    }
    
    if (!code) {
        showError('Введите код');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch(`/api/codes/exact/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                Code: code, 
                Description: description, 
                Status: status, 
                IsRestoration: isRestoration, 
                HasCoefficient: hasCoefficient, 
                CoefficientValue: coefficientValue, 
                CoefficientType: coefficientType,
                CheckCoefficient: checkCoefficient,
                adminName: currentAdmin?.username 
            })
        });
        
        if (response.ok) {
            closeModal();
            await loadExactCodes();
            refreshAnalytics();
            showSuccess('Код обновлен');
        } else {
            const error = await response.json();
            showError(error.error || 'Ошибка при обновлении');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showError('Ошибка при обновлении кода');
    } finally {
        hideLoading();
    }
}

// Аналогично обновить для Родительских кодов (openAddParentModal, saveParentCode, openEditParentModal, updateParentCode)
// Аналогично обновить для Иерархических кодов (openAddHierarchicalModal, saveHierarchicalCode, openEditHierarchicalModal, updateHierarchicalCode)

async function saveExactCode() {
    const code = document.getElementById('newExactCode')?.value.trim();
    const description = document.getElementById('newExactDesc')?.value || '';
    const status = document.getElementById('newExactStatus')?.value || 'Доступен';
    const isRestoration = document.getElementById('newExactRestoration')?.checked || false;
    const hasCoefficient = document.getElementById('newExactHasCoefficient')?.checked || false;
    const checkCoefficient = document.getElementById('newExactCheckCoefficient')?.checked || false;
    
    let coefficientValue = null;
    let coefficientType = 'none';
    
    if (hasCoefficient) {
        coefficientValue = parseFloat(document.getElementById('newExactCoefficientValue')?.value);
        coefficientType = document.getElementById('newExactCoefficientType')?.value || 'none';
        if (isNaN(coefficientValue)) {
            showError('Введите числовое значение коэффициента');
            return;
        }
    }
    
    if (!code) {
        showError('Введите код');
        return;
    }
    
    // Проверка на дубликат
    const existing = currentExactCodes.find(c => c.code === code);
    if (existing) {
        showError('Такой код уже существует в базе!');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch('/api/codes/exact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                Code: code, 
                Description: description, 
                Status: status,
                IsRestoration: isRestoration, 
                HasCoefficient: hasCoefficient,
                CoefficientValue: coefficientValue, 
                CoefficientType: coefficientType,
                CheckCoefficient: checkCoefficient,
                IsExact: true, 
                adminName: currentAdmin?.username
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            closeModal();
            await loadExactCodes();
            refreshAnalytics();
            showSuccess('Код успешно добавлен');
        } else {
            showError(data.error || 'Ошибка при добавлении кода');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showError('Ошибка при добавлении кода');
    } finally {
        hideLoading();
    }
}
/*
async function openEditExactModal(id) {
    const code = currentExactCodes.find(c => c.id === id);
    if (!code) return;
    
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <input type="hidden" id="editExactId" value="${code.id}">
        <div class="form-group">
            <label>Код</label>
            <input type="text" id="editExactCode" value="${escapeHtml(code.code)}" class="font-mono">
        </div>
        <div class="form-group">
            <label>Описание</label>
            <textarea id="editExactDesc" rows="3">${escapeHtml(code.description || '')}</textarea>
        </div>
        <div class="form-group">
            <label>Статус</label>
            <select id="editExactStatus">
                <option value="Доступен" ${code.status === 'Доступен' ? 'selected' : ''}>✅ Доступен</option>
                <option value="Обратите внимание" ${code.status === 'Обратите внимание' ? 'selected' : ''}>⚠️ Обратите внимание</option>
                <option value="Нельзя применять" ${code.status === 'Нельзя применять' ? 'selected' : ''}>❌ Нельзя применять</option>
            </select>
        </div>
        <div class="form-group">
            <label class="flex items-center">
                <input type="checkbox" id="editExactRestoration" ${code.is_restoration ? 'checked' : ''}> Реставрационный код
            </label>
        </div>
        <div class="form-group">
            <label class="flex items-center">
                <input type="checkbox" id="editExactHasCoefficient" ${code.has_coefficient ? 'checked' : ''}> Имеет коэффициент
            </label>
        </div>
        <div id="editCoefficientContainer" class="${code.has_coefficient ? '' : 'hidden'}">
            <div class="form-group">
                <label>Числовое значение коэффициента</label>
                <input type="number" id="editExactCoefficientValue" step="0.01" value="${code.coefficient_value || ''}">
            </div>
            <div class="form-group">
                <label>Тип коэффициента</label>
                <select id="editExactCoefficientType">
                    <option value="increasing" ${code.coefficient_type === 'increasing' ? 'selected' : ''}>Повышающий</option>
                    <option value="decreasing" ${code.coefficient_type === 'decreasing' ? 'selected' : ''}>Понижающий</option>
                </select>
            </div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
            <button onclick="closeModal()" class="btn-outline">Отмена</button>
            <button onclick="updateExactCode()" class="btn-primary">Обновить</button>
        </div>
    `;
    
    const coeffCheckbox = document.getElementById('editExactHasCoefficient');
    const coeffContainer = document.getElementById('editCoefficientContainer');
    coeffCheckbox.addEventListener('change', () => coeffContainer.classList.toggle('hidden', !coeffCheckbox.checked));
    
    openModal('Редактирование точного кода');
}*/
/*
async function updateExactCode() {
    const id = document.getElementById('editExactId').value;
    const code = document.getElementById('editExactCode').value;
    const description = document.getElementById('editExactDesc').value;
    const status = document.getElementById('editExactStatus').value;
    const isRestoration = document.getElementById('editExactRestoration').checked;
    const hasCoefficient = document.getElementById('editExactHasCoefficient').checked;
    
    let coefficientValue = null, coefficientType = 'none';
    if (hasCoefficient) {
        coefficientValue = parseFloat(document.getElementById('editExactCoefficientValue').value);
        coefficientType = document.getElementById('editExactCoefficientType').value;
        if (isNaN(coefficientValue)) { alert('Введите значение'); return; }
    }
    
    const res = await fetch(`/api/codes/exact/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Code: code, Description: description, Status: status, IsRestoration: isRestoration, HasCoefficient: hasCoefficient, CoefficientValue: coefficientValue, CoefficientType: coefficientType, adminName: currentAdmin?.username })
    });
    
    if (res.ok) { closeModal(); loadExactCodes(); refreshAnalytics(); showSuccess('Код обновлен'); }
    else { alert('Ошибка при обновлении'); }
}*/

function openDeleteExactModal() {
    let checkboxes = '';
    currentExactCodes.forEach(c => {
        checkboxes += `<div class="form-group"><label class="flex items-center"><input type="checkbox" class="delete-exact-checkbox" value="${c.id}"> <span class="font-mono">${escapeHtml(c.code)}</span> <span class="text-xs text-gray-500 ml-2">${escapeHtml(c.description || '')}</span></label></div>`;
    });
    document.getElementById('modalBody').innerHTML = `
        <p>Выберите коды для удаления:</p>
        <div class="max-h-64 overflow-y-auto border rounded-lg p-4 my-4">${checkboxes}</div>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
            <button onclick="closeModal()" class="btn-outline">Отмена</button>
            <button onclick="confirmDeleteExact()" class="btn-danger">Удалить выбранные</button>
        </div>
    `;
    openModal('Удаление точных кодов');
}

async function confirmDeleteExact() {
    const checkboxes = document.querySelectorAll('.delete-exact-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
    if (ids.length === 0) { alert('Выберите коды'); return; }
    const res = await fetch('/api/codes/exact', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids) });
    if (res.ok) { closeModal(); loadExactCodes(); refreshAnalytics(); showSuccess('Коды удалены'); }
}

// ==================== РОДИТЕЛЬСКИЕ КОДЫ - ДЕЙСТВИЯ ====================
async function deleteParentCode(id) {
    if (confirm('Удалить этот родительский код?')) {
        const res = await fetch('/api/codes/parent', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([id]) });
        if (res.ok) { loadParentCodes(); refreshAnalytics(); showSuccess('Код удален'); }
    }
}

function openAddParentModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="form-group">
            <label>Родительский код *</label>
            <input type="text" id="newParentCode" placeholder="Например: 1.21-1303" class="font-mono">
        </div>
        <div class="form-group">
            <label>Описание</label>
            <textarea id="newParentDesc" rows="2"></textarea>
        </div>
        <div class="form-group">
            <label>Статус</label>
            <select id="newParentStatus">
                <option value="Доступен">✅ Доступен</option>
                <option value="Обратите внимание">⚠️ Обратите внимание</option>
                <option value="Нельзя применять">❌ Нельзя применять</option>
            </select>
        </div>
        <div class="form-group">
            <label class="flex items-center">
                <input type="checkbox" id="newParentHasCoefficient"> Имеет коэффициент
            </label>
        </div>
        <div id="newParentCoefficientContainer" class="hidden">
            <div class="form-group"><input type="number" id="newParentCoefficientValue" step="0.01" placeholder="Значение"></div>
            <div class="form-group"><select id="newParentCoefficientType"><option value="increasing">Повышающий</option><option value="decreasing">Понижающий</option></select></div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
            <button onclick="closeModal()" class="btn-outline">Отмена</button>
            <button onclick="saveParentCode()" class="btn-primary">Сохранить</button>
        </div>
    `;
    const coeffCheckbox = document.getElementById('newParentHasCoefficient');
    const coeffContainer = document.getElementById('newParentCoefficientContainer');
    coeffCheckbox.addEventListener('change', () => coeffContainer.classList.toggle('hidden', !coeffCheckbox.checked));
    openModal('Добавление родительского кода');
}

async function saveParentCode() {
    const code = document.getElementById('newParentCode').value.trim();
    const description = document.getElementById('newParentDesc').value;
    const status = document.getElementById('newParentStatus').value;
    const hasCoefficient = document.getElementById('newParentHasCoefficient').checked;
    let coefficientValue = null, coefficientType = 'none';
    if (hasCoefficient) {
        coefficientValue = parseFloat(document.getElementById('newParentCoefficientValue').value);
        coefficientType = document.getElementById('newParentCoefficientType').value;
        if (isNaN(coefficientValue)) { alert('Введите значение'); return; }
    }
    if (!code) { alert('Введите код'); return; }
    const res = await fetch('/api/codes/parent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Code: code, Description: description, Status: status, HasCoefficient: hasCoefficient, CoefficientValue: coefficientValue, CoefficientType: coefficientType, adminName: currentAdmin?.username }) });
    if (res.ok) { closeModal(); loadParentCodes(); refreshAnalytics(); showSuccess('Код добавлен'); }
    else { const err = await res.json(); alert(err.error || 'Ошибка'); }
}

async function openEditParentModal(id) {
    const code = currentParentCodes.find(c => c.id === id);
    if (!code) return;
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <input type="hidden" id="editParentId" value="${code.id}">
        <div class="form-group"><input type="text" id="editParentCode" value="${escapeHtml(code.code)}" class="font-mono"></div>
        <div class="form-group"><textarea id="editParentDesc" rows="3">${escapeHtml(code.description || '')}</textarea></div>
        <div class="form-group"><select id="editParentStatus"><option value="Доступен" ${code.status === 'Доступен' ? 'selected' : ''}>Доступен</option><option value="Обратите внимание" ${code.status === 'Обратите внимание' ? 'selected' : ''}>Обратите внимание</option><option value="Нельзя применять" ${code.status === 'Нельзя применять' ? 'selected' : ''}>Нельзя применять</option></select></div>
        <div class="form-group"><label class="flex items-center"><input type="checkbox" id="editParentHasCoefficient" ${code.has_coefficient ? 'checked' : ''}> Имеет коэффициент</label></div>
        <div id="editParentCoefficientContainer" class="${code.has_coefficient ? '' : 'hidden'}"><div class="form-group"><input type="number" id="editParentCoefficientValue" step="0.01" value="${code.coefficient_value || ''}"></div><div class="form-group"><select id="editParentCoefficientType"><option value="increasing" ${code.coefficient_type === 'increasing' ? 'selected' : ''}>Повышающий</option><option value="decreasing" ${code.coefficient_type === 'decreasing' ? 'selected' : ''}>Понижающий</option></select></div></div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;"><button onclick="closeModal()" class="btn-outline">Отмена</button><button onclick="updateParentCode()" class="btn-primary">Обновить</button></div>
    `;
    const coeffCheckbox = document.getElementById('editParentHasCoefficient');
    const coeffContainer = document.getElementById('editParentCoefficientContainer');
    coeffCheckbox.addEventListener('change', () => coeffContainer.classList.toggle('hidden', !coeffCheckbox.checked));
    openModal('Редактирование родительского кода');
}

async function updateParentCode() {
    const id = document.getElementById('editParentId').value;
    const code = document.getElementById('editParentCode').value;
    const description = document.getElementById('editParentDesc').value;
    const status = document.getElementById('editParentStatus').value;
    const hasCoefficient = document.getElementById('editParentHasCoefficient').checked;
    let coefficientValue = null, coefficientType = 'none';
    if (hasCoefficient) {
        coefficientValue = parseFloat(document.getElementById('editParentCoefficientValue').value);
        coefficientType = document.getElementById('editParentCoefficientType').value;
        if (isNaN(coefficientValue)) { alert('Введите значение'); return; }
    }
    const res = await fetch(`/api/codes/parent/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Code: code, Description: description, Status: status, HasCoefficient: hasCoefficient, CoefficientValue: coefficientValue, CoefficientType: coefficientType, adminName: currentAdmin?.username }) });
    if (res.ok) { closeModal(); loadParentCodes(); refreshAnalytics(); showSuccess('Код обновлен'); }
    else { alert('Ошибка'); }
}

function openDeleteParentModal() {
    let checkboxes = '';
    currentParentCodes.forEach(c => {
        checkboxes += `<div class="form-group"><label class="flex items-center"><input type="checkbox" class="delete-parent-checkbox" value="${c.id}"> <span class="font-mono">${escapeHtml(c.code)}</span> <span class="text-xs text-gray-500 ml-2">${escapeHtml(c.description || '')}</span></label></div>`;
    });
    document.getElementById('modalBody').innerHTML = `<p>Выберите коды для удаления:</p><div class="max-h-64 overflow-y-auto border rounded-lg p-4 my-4">${checkboxes}</div><div style="display: flex; justify-content: flex-end; gap: 12px;"><button onclick="closeModal()" class="btn-outline">Отмена</button><button onclick="confirmDeleteParent()" class="btn-danger">Удалить выбранные</button></div>`;
    openModal('Удаление родительских кодов');
}

async function confirmDeleteParent() {
    const checkboxes = document.querySelectorAll('.delete-parent-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
    if (ids.length === 0) { alert('Выберите коды'); return; }
    const res = await fetch('/api/codes/parent', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids) });
    if (res.ok) { closeModal(); loadParentCodes(); refreshAnalytics(); showSuccess('Коды удалены'); }
}

// ==================== ИЕРАРХИЧЕСКИЕ КОДЫ - ДЕЙСТВИЯ ====================
async function deleteHierarchicalCode(id) {
    if (confirm('Удалить этот иерархический код?')) {
        const res = await fetch(`/api/codes/hierarchical/${id}`, { method: 'DELETE' });
        if (res.ok) { loadHierarchicalCodes(); refreshAnalytics(); showSuccess('Код удален'); }
    }
}

function openAddHierarchicalModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="form-group">
            <label>Уровень кода</label>
            <select id="newHierarchicalLevel" onchange="updateHierarchicalCodeExample()">
                <option value="1">Глава (1)</option>
                <option value="2">Сборник (1.21)</option>
                <option value="3">Отдел (1.21-1303)</option>
                <option value="4">Таблица (1.21-1303-33)</option>
            </select>
        </div>
        <div class="form-group">
            <label>Код</label>
            <input type="text" id="newHierarchicalCode" placeholder="Например: 1.21-1303-33" class="font-mono">
            <p class="text-xs text-gray-500 mt-1" id="codeExampleHint">Пример: 1.21-1303-33</p>
        </div>
        <div class="form-group">
            <label>Описание</label>
            <textarea id="newHierarchicalDesc" rows="2"></textarea>
        </div>
        <div class="form-group">
            <label>Статус</label>
            <select id="newHierarchicalStatus">
                <option value="Доступен">✅ Доступен</option>
                <option value="Обратите внимание">⚠️ Обратите внимание</option>
                <option value="Нельзя применять">❌ Нельзя применять</option>
            </select>
        </div>
        <div class="form-group">
            <label class="flex items-center"><input type="checkbox" id="newHierarchicalHasCoefficient"> Имеет коэффициент</label>
        </div>
        <div id="newHierarchicalCoefficientContainer" class="hidden">
            <div class="form-group"><input type="number" id="newHierarchicalCoefficientValue" step="0.01" placeholder="Значение"></div>
            <div class="form-group"><select id="newHierarchicalCoefficientType"><option value="increasing">Повышающий</option><option value="decreasing">Понижающий</option></select></div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
            <button onclick="closeModal()" class="btn-outline">Отмена</button>
            <button onclick="saveHierarchicalCode()" class="btn-primary">Сохранить</button>
        </div>
    `;
    const coeffCheckbox = document.getElementById('newHierarchicalHasCoefficient');
    const coeffContainer = document.getElementById('newHierarchicalCoefficientContainer');
    coeffCheckbox.addEventListener('change', () => coeffContainer.classList.toggle('hidden', !coeffCheckbox.checked));
    openModal('Добавление иерархического кода');
}

function updateHierarchicalCodeExample() {
    const level = document.getElementById('newHierarchicalLevel').value;
    const hint = document.getElementById('codeExampleHint');
    const examples = { 1: 'Пример: 1 (глава)', 2: 'Пример: 1.21 (сборник)', 3: 'Пример: 1.21-1303 (отдел)', 4: 'Пример: 1.21-1303-33 (таблица)' };
    hint.textContent = examples[level];
}

async function saveHierarchicalCode() {
    const level = parseInt(document.getElementById('newHierarchicalLevel').value);
    const code = document.getElementById('newHierarchicalCode').value.trim();
    const description = document.getElementById('newHierarchicalDesc').value;
    const status = document.getElementById('newHierarchicalStatus').value;
    const hasCoefficient = document.getElementById('newHierarchicalHasCoefficient').checked;
    let coefficientValue = null, coefficientType = 'none';
    if (hasCoefficient) {
        coefficientValue = parseFloat(document.getElementById('newHierarchicalCoefficientValue').value);
        coefficientType = document.getElementById('newHierarchicalCoefficientType').value;
        if (isNaN(coefficientValue)) { alert('Введите значение'); return; }
    }
    if (!code) { alert('Введите код'); return; }
    
    const patterns = { 1: /^\d+$/, 2: /^\d+\.\d+$/, 3: /^\d+\.\d+-\d+$/, 4: /^\d+\.\d+-\d+-\d+$/ };
    if (!patterns[level].test(code)) {
        const hints = { 1: 'Только номер главы', 2: 'Формат: глава.сборник', 3: 'Формат: глава.сборник-отдел', 4: 'Формат: глава.сборник-отдел-таблица' };
        alert(`Неверный формат. ${hints[level]}`);
        return;
    }
    
    const res = await fetch('/api/codes/hierarchical', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Code: code, Level: level, Description: description, Status: status, HasCoefficient: hasCoefficient, CoefficientValue: coefficientValue, CoefficientType: coefficientType, adminName: currentAdmin?.username })
    });
    if (res.ok) { closeModal(); loadHierarchicalCodes(); refreshAnalytics(); showSuccess('Код добавлен'); }
    else { const err = await res.json(); alert(err.error || 'Ошибка'); }
}

async function openEditHierarchicalModal(id) {
    const code = currentHierarchicalCodes.find(c => c.id === id);
    if (!code) return;
    const levelNames = { 1: 'Глава', 2: 'Сборник', 3: 'Отдел', 4: 'Таблица' };
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <input type="hidden" id="editHierarchicalId" value="${code.id}">
        <div class="form-group"><input type="text" value="${levelNames[code.level]} (${code.code})" class="bg-gray-100" readonly disabled></div>
        <div class="form-group"><textarea id="editHierarchicalDesc" rows="3">${escapeHtml(code.description || '')}</textarea></div>
        <div class="form-group"><select id="editHierarchicalStatus"><option value="Доступен" ${code.status === 'Доступен' ? 'selected' : ''}>Доступен</option><option value="Обратите внимание" ${code.status === 'Обратите внимание' ? 'selected' : ''}>Обратите внимание</option><option value="Нельзя применять" ${code.status === 'Нельзя применять' ? 'selected' : ''}>Нельзя применять</option></select></div>
        <div class="form-group"><label class="flex items-center"><input type="checkbox" id="editHierarchicalHasCoefficient" ${code.has_coefficient ? 'checked' : ''}> Имеет коэффициент</label></div>
        <div id="editHierarchicalCoefficientContainer" class="${code.has_coefficient ? '' : 'hidden'}"><div class="form-group"><input type="number" id="editHierarchicalCoefficientValue" step="0.01" value="${code.coefficient_value || ''}"></div><div class="form-group"><select id="editHierarchicalCoefficientType"><option value="increasing" ${code.coefficient_type === 'increasing' ? 'selected' : ''}>Повышающий</option><option value="decreasing" ${code.coefficient_type === 'decreasing' ? 'selected' : ''}>Понижающий</option></select></div></div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;"><button onclick="closeModal()" class="btn-outline">Отмена</button><button onclick="updateHierarchicalCode()" class="btn-primary">Обновить</button></div>
    `;
    const coeffCheckbox = document.getElementById('editHierarchicalHasCoefficient');
    const coeffContainer = document.getElementById('editHierarchicalCoefficientContainer');
    coeffCheckbox.addEventListener('change', () => coeffContainer.classList.toggle('hidden', !coeffCheckbox.checked));
    openModal('Редактирование иерархического кода');
}

async function updateHierarchicalCode() {
    const id = document.getElementById('editHierarchicalId').value;
    const description = document.getElementById('editHierarchicalDesc').value;
    const status = document.getElementById('editHierarchicalStatus').value;
    const hasCoefficient = document.getElementById('editHierarchicalHasCoefficient').checked;
    let coefficientValue = null, coefficientType = 'none';
    if (hasCoefficient) {
        coefficientValue = parseFloat(document.getElementById('editHierarchicalCoefficientValue').value);
        coefficientType = document.getElementById('editHierarchicalCoefficientType').value;
        if (isNaN(coefficientValue)) { alert('Введите значение'); return; }
    }
    const res = await fetch(`/api/codes/hierarchical/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Description: description, Status: status, HasCoefficient: hasCoefficient, CoefficientValue: coefficientValue, CoefficientType: coefficientType, adminName: currentAdmin?.username }) });
    if (res.ok) { closeModal(); loadHierarchicalCodes(); refreshAnalytics(); showSuccess('Код обновлен'); }
}
// admin.js - ДОБАВИТЬ НОВЫЕ ФУНКЦИИ

// ==================== РАСШИРЕННЫЕ СВЯЗИ ====================

// Типы расширенных связей с описанием
const EXTENDED_RELATION_TYPES = {
    'must_be_together': {
        name: '🤝 Должны быть вместе',
        icon: 'fa-handshake',
        color: '#10b981',
        description: 'Расценки должны использоваться вместе в одной смете',
        hint: 'Если есть расценка A, обязательно должна быть расценка B',
        conditions: false
    },
    'conflict': {
        name: '⚡ Противоречат друг другу',
        icon: 'fa-bolt',
        color: '#ef4444',
        description: 'Расценки не могут использоваться одновременно',
        hint: 'Расценки конфликтуют и не могут быть в одной позиции',
        conditions: false
    },
    'check_coefficient': {
        name: '📊 Проверить коэффициенты',
        icon: 'fa-calculator',
        color: '#f59e0b',
        description: 'При использовании нужно проверить коэффициенты',
        hint: 'Проверяет, что коэффициент находится в заданном диапазоне',
        conditions: true
    },
    'conditional': {
        name: '🔍 Условное использование',
        icon: 'fa-code-branch',
        color: '#8b5cf6',
        description: 'Можно использовать только при определённых условиях',
        hint: 'Проверяет условия использования (реставрация, коэффициент и т.д.)',
        conditions: true
    }
};

function openAddExtendedRelationModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="form-group">
            <label>Тип связи *</label>
            <select id="relationExtendedType" onchange="toggleRelationConditions()" class="filter-select" style="width:100%">
                <option value="must_be_together">🤝 Должны быть вместе</option>
                <option value="conflict">⚡ Противоречат друг другу</option>
                <option value="check_coefficient">📊 Проверить коэффициенты</option>
                <option value="conditional">🔍 Условное использование</option>
            </select>
            <div id="relationTypeHint" class="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded">
                <i class="fas fa-info-circle"></i> 
                <span id="typeHintText">Расценки должны использоваться вместе в одной смете</span>
            </div>
        </div>
        
        <div class="form-group">
            <label>Исходный код *</label>
            <div class="input-wrapper">
                <i class="fas fa-code"></i>
                <input type="text" id="relationSourceCodeExtended" class="form-control font-mono" placeholder="Например: 1.21-1303-33-6/1">
            </div>
            <div id="sourceCodePreview" class="text-xs text-gray-400 mt-1 hidden"></div>
        </div>
        
        <div class="form-group">
            <label>Целевой код *</label>
            <div class="input-wrapper">
                <i class="fas fa-code"></i>
                <input type="text" id="relationTargetCodeExtended" class="form-control font-mono" placeholder="Например: 1.21-1303-33-7/1">
            </div>
            <div id="targetCodePreview" class="text-xs text-gray-400 mt-1 hidden"></div>
        </div>
        
        <div id="conditionsContainer" class="hidden">
            <div class="form-group">
                <label><i class="fas fa-sliders-h"></i> Условия использования</label>
                <div id="conditionsFields" class="bg-gray-50 p-3 rounded-lg"></div>
            </div>
        </div>
        
        <div class="form-group">
            <label>Описание связи</label>
            <textarea id="relationDescriptionExtended" rows="3" class="form-control" placeholder="Опишите, когда и почему используется эта связь, какие коэффициенты должны быть и т.д."></textarea>
        </div>
        
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
            <button onclick="closeModal()" class="btn-outline"><i class="fas fa-times"></i> Отмена</button>
            <button onclick="saveExtendedRelation()" class="btn-primary"><i class="fas fa-save"></i> Сохранить связь</button>
        </div>
    `;
    
    // Добавляем валидацию кодов на лету
    const sourceInput = document.getElementById('relationSourceCodeExtended');
    const targetInput = document.getElementById('relationTargetCodeExtended');
    
    sourceInput.addEventListener('input', () => validateCodePreview(sourceInput, 'sourceCodePreview'));
    targetInput.addEventListener('input', () => validateCodePreview(targetInput, 'targetCodePreview'));
    
    openModal('➕ Добавление расширенной связи');
    toggleRelationConditions();
}

async function validateCodePreview(input, previewId) {
    const code = input.value.trim();
    const preview = document.getElementById(previewId);
    
    if (!code || code.length < 3) {
        preview.classList.add('hidden');
        return;
    }
    
    try {
        const res = await fetch('/api/validate-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        
        if (data.inDatabase) {
            preview.innerHTML = `<i class="fas fa-check-circle text-green-500"></i> Найден: ${data.matchType || 'код'} (${data.status || 'статус'})`;
            preview.classList.remove('hidden');
            preview.style.color = '#10b981';
        } else {
            preview.innerHTML = `<i class="fas fa-question-circle text-yellow-500"></i> Не найден в базе. Будет создан как новая связь`;
            preview.classList.remove('hidden');
            preview.style.color = '#f59e0b';
        }
    } catch (e) {
        preview.innerHTML = `<i class="fas fa-exclamation-triangle text-red-500"></i> Не удалось проверить код`;
        preview.classList.remove('hidden');
        preview.style.color = '#ef4444';
    }
}

function toggleRelationConditions() {
    const typeSelect = document.getElementById('relationExtendedType');
    const type = typeSelect ? typeSelect.value : 'must_be_together';
    const container = document.getElementById('conditionsContainer');
    const hintText = document.getElementById('typeHintText');
    const conditionsFields = document.getElementById('conditionsFields');
    
    const typeInfo = EXTENDED_RELATION_TYPES[type];
    if (typeInfo) {
        hintText.innerHTML = `<i class="fas ${typeInfo.icon}"></i> ${typeInfo.description}: ${typeInfo.hint}`;
    }
    
    if (typeInfo && typeInfo.conditions) {
        container.classList.remove('hidden');
        
        if (type === 'check_coefficient') {
            conditionsFields.innerHTML = `
                <div class="grid grid-cols-2 gap-3" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                        <label class="text-xs font-medium">Мин. коэффициент</label>
                        <input type="number" id="coeffMin" step="0.01" value="0.8" class="form-control" placeholder="0.8">
                    </div>
                    <div>
                        <label class="text-xs font-medium">Макс. коэффициент</label>
                        <input type="number" id="coeffMax" step="0.01" value="1.2" class="form-control" placeholder="1.2">
                    </div>
                </div>
                <div class="mt-2">
                    <label class="text-xs font-medium">Точный коэффициент (опционально)</label>
                    <input type="number" id="coeffRequired" step="0.01" class="form-control" placeholder="Например: 1.15">
                    <p class="text-xs text-gray-400 mt-1">Если указан, проверяет точное совпадение</p>
                </div>
            `;
        } else if (type === 'conditional') {
            conditionsFields.innerHTML = `
                <div class="form-group mb-2">
                    <label class="flex items-center cursor-pointer">
                        <input type="checkbox" id="condRestorationOnly" class="mr-2"> 
                        <span><i class="fas fa-landmark"></i> Только для реставрационных работ</span>
                    </label>
                </div>
                <div class="grid grid-cols-2 gap-3" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                        <label class="text-xs font-medium">Коэффициент должен быть ></label>
                        <input type="number" id="condCoeffGreater" step="0.01" class="form-control" placeholder="Например: 1">
                        <p class="text-xs text-gray-400 mt-1">Расценка применяется только если коэффициент выше</p>
                    </div>
                    <div>
                        <label class="text-xs font-medium">Коэффициент должен быть <</label>
                        <input type="number" id="condCoeffLess" step="0.01" class="form-control" placeholder="Например: 2">
                        <p class="text-xs text-gray-400 mt-1">Расценка применяется только если коэффициент ниже</p>
                    </div>
                </div>
                <div class="mt-2 text-xs text-gray-500 bg-blue-50 p-2 rounded">
                    <i class="fas fa-lightbulb"></i> Пример: для работ в стеснённых условиях коэффициент должен быть > 1.05
                </div>
            `;
        }
    } else {
        container.classList.add('hidden');
    }
}

async function saveExtendedRelation() {
    const sourceCode = document.getElementById('relationSourceCodeExtended').value.trim();
    const targetCode = document.getElementById('relationTargetCodeExtended').value.trim();
    const relationType = document.getElementById('relationExtendedType').value;
    const description = document.getElementById('relationDescriptionExtended').value;
    
    if (!sourceCode) {
        showError('Введите исходный код');
        return;
    }
    if (!targetCode) {
        showError('Введите целевой код');
        return;
    }
    if (sourceCode === targetCode) {
        showError('Нельзя создать связь кода с самим собой');
        return;
    }
    
    let conditions = null;
    
    if (relationType === 'check_coefficient') {
        const coeffMin = parseFloat(document.getElementById('coeffMin').value);
        const coeffMax = parseFloat(document.getElementById('coeffMax').value);
        const coeffRequired = document.getElementById('coeffRequired').value;
        
        if (isNaN(coeffMin) || isNaN(coeffMax)) {
            showError('Введите корректные значения коэффициентов');
            return;
        }
        
        conditions = {
            expectedCoefficientRange: { min: coeffMin, max: coeffMax }
        };
        if (coeffRequired && !isNaN(parseFloat(coeffRequired))) {
            conditions.requiredCoefficient = parseFloat(coeffRequired);
        }
    } else if (relationType === 'conditional') {
        conditions = {};
        const restorationOnly = document.getElementById('condRestorationOnly').checked;
        const coeffGreater = document.getElementById('condCoeffGreater').value;
        const coeffLess = document.getElementById('condCoeffLess').value;
        
        if (restorationOnly) conditions.restorationOnly = true;
        if (coeffGreater && !isNaN(parseFloat(coeffGreater))) {
            conditions.onlyIfCoefficientGreaterThan = parseFloat(coeffGreater);
        }
        if (coeffLess && !isNaN(parseFloat(coeffLess))) {
            conditions.onlyIfCoefficientLessThan = parseFloat(coeffLess);
        }
        
        if (Object.keys(conditions).length === 0) {
            showError('Укажите хотя бы одно условие для условной связи');
            return;
        }
    }
    
    try {
        const res = await fetch('/api/codes/relations/extended', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                sourceCode, 
                targetCode, 
                relationType, 
                conditions, 
                description,
                adminName: currentAdmin?.username 
            })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            closeModal();
            loadRelations();
            const typeNames = {
                'must_be_together': '🤝 Должны быть вместе',
                'conflict': '⚡ Противоречат',
                'check_coefficient': '📊 Проверить коэф.',
                'conditional': '🔍 Условный'
            };
            showSuccess(`✅ Расширенная связь добавлена: ${typeNames[relationType] || relationType}`);
        } else {
            showError(data.error || 'Ошибка при добавлении связи');
        }
    } catch (error) {
        console.error('Error saving extended relation:', error);
        showError('Ошибка при добавлении связи: ' + error.message);
    }
}

// Обновляем отображение таблицы связей для поддержки расширенных связей
function renderRelationsTable(relations) {
    const tbody = document.getElementById('relationsTableBody');
    if (!tbody) return;
    
    if (!relations || relations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">Нет связей</td></tr>';
        return;
    }
    
    const relationIcons = {
        'duplicate': '🔄',
        'related': '🔗',
        'must_be_together': '🤝',
        'conflict': '⚡',
        'check_coefficient': '📊',
        'conditional': '🔍'
    };
    
    const relationLabels = {
        'duplicate': 'Дублирующий',
        'related': 'Связанный',
        'must_be_together': 'Должны быть вместе',
        'conflict': 'Противоречат',
        'check_coefficient': 'Проверить коэф.',
        'conditional': 'Условный'
    };
    
    const relationColors = {
        'duplicate': '#e0e7ff',
        'related': '#e0e7ff',
        'must_be_together': '#d1fae5',
        'conflict': '#fee2e2',
        'check_coefficient': '#fef3c7',
        'conditional': '#ede9fe'
    };
    
    const relationTextColors = {
        'duplicate': '#4338ca',
        'related': '#4338ca',
        'must_be_together': '#065f46',
        'conflict': '#991b1b',
        'check_coefficient': '#92400e',
        'conditional': '#6d28d9'
    };
    
    tbody.innerHTML = relations.map(rel => {
        const icon = relationIcons[rel.relation_type] || '🔗';
        const label = relationLabels[rel.relation_type] || rel.relation_type;
        const isExtended = rel.extended_type === 1;
        const bgColor = relationColors[rel.relation_type] || '#f3f4f6';
        const textColor = relationTextColors[rel.relation_type] || '#374151';
        
        let conditionsHtml = '';
        if (isExtended && rel.conditions) {
            try {
                const conds = JSON.parse(rel.conditions);
                if (Object.keys(conds).length > 0) {
                    conditionsHtml = '<div class="text-xs text-gray-500 mt-1">⚙️ ';
                    if (conds.expectedCoefficientRange) {
                        conditionsHtml += `коэф. от ${conds.expectedCoefficientRange.min} до ${conds.expectedCoefficientRange.max}`;
                    }
                    if (conds.requiredCoefficient) {
                        conditionsHtml += `, точный коэф. ${conds.requiredCoefficient}`;
                    }
                    if (conds.restorationOnly) {
                        conditionsHtml += `, только реставрация`;
                    }
                    if (conds.onlyIfCoefficientGreaterThan) {
                        conditionsHtml += `, коэф. > ${conds.onlyIfCoefficientGreaterThan}`;
                    }
                    if (conds.onlyIfCoefficientLessThan) {
                        conditionsHtml += `, коэф. < ${conds.onlyIfCoefficientLessThan}`;
                    }
                    conditionsHtml += '</div>';
                }
            } catch(e) {}
        }
        
        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3 font-mono text-sm">${rel.id}</td>
                <td class="px-4 py-3 font-mono text-sm font-medium">${escapeHtml(rel.source_code)}</td>
                <td class="px-4 py-3 font-mono text-sm font-medium">${escapeHtml(rel.target_code)}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" 
                          style="background:${bgColor}; color:${textColor}">
                        ${icon} ${label} ${isExtended ? '<span class="ml-1 text-[10px] opacity-70">(расшир.)</span>' : ''}
                    </span>
                    ${conditionsHtml}
                </td>
                <td class="px-4 py-3 text-sm text-gray-600 max-w-md">${escapeHtml(rel.description || '-')}</td>
                <td class="px-4 py-3 text-center">
                    <button onclick="deleteRelation(${rel.id})" class="text-red-500 hover:text-red-700 transition-colors" title="Удалить связь">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}
// admin.js - ДОБАВИТЬ ФУНКЦИИ ЗАГРУЗКИ

// ==================== ФУНКЦИИ ЗАГРУЗКИ ====================
// ==================== УВЕДОМЛЕНИЯ И ЗАГРУЗКА ====================

function showLoading() {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            display: none;
        `;
        overlay.innerHTML = `
            <div style="background: white; padding: 24px; border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                <div style="width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #8b5cf6; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                <p style="color: #4b5563;">Загрузка...</p>
            </div>
        `;
        document.head.insertAdjacentHTML('beforeend', '<style>@keyframes spin { to { transform: rotate(360deg); } }</style>');
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function showError(message) {
    // Удаляем существующий тост
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification toast-error';
    toast.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 12px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
        font-size: 14px;
        font-weight: 500;
        z-index: 1100;
        animation: slideInRight 0.3s ease;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function showError(message) {
    // Проверяем, есть ли уже тост
    let toast = document.querySelector('.toast-notification');
    if (toast) toast.remove();
    
    toast = document.createElement('div');
    toast.className = 'toast-notification toast-error';
    toast.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
// admin.js - НОВАЯ ФУНКЦИЯ ДЛЯ ГРУППОВЫХ СВЯЗЕЙ

let targetCodesList = [];

function openAddGroupRelationModal() {
    targetCodesList = [];
    
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="form-group">
            <label>Тип связи *</label>
            <select id="groupRelationType" onchange="updateGroupRelationHint()" class="filter-select" style="width:100%">
                <option value="must_be_together">🤝 Должны быть вместе</option>
                <option value="conflict">⚡ Противоречат друг другу</option>
                <option value="check_coefficient">📊 Проверить коэффициенты</option>
                <option value="conditional">🔍 Условное использование</option>
            </select>
            <div id="groupRelationHint" class="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded"></div>
        </div>
        
        <div class="form-group">
            <label>Исходный код *</label>
            <div class="input-wrapper">
                <i class="fas fa-code"></i>
                <input type="text" id="groupSourceCode" class="form-control font-mono" placeholder="Например: 1.21-1303-33-6/1">
            </div>
        </div>
        
        <div class="form-group">
            <label>Целевые коды *</label>
            <div id="targetCodesContainer">
                <div class="target-code-row" style="display:flex; gap:8px; margin-bottom:8px;">
                    <input type="text" class="target-code-input form-control font-mono flex-grow" placeholder="Код">
                    <select class="target-type-select filter-select" style="width:120px;">
                        <option value="required">Обязательный</option>
                        <option value="optional">Опциональный</option>
                        <option value="any_of">Один из</option>
                    </select>
                    <button type="button" class="btn-outline" onclick="removeTargetCode(this)" style="padding:8px 12px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <button type="button" onclick="addTargetCodeRow()" class="btn-outline btn-sm mt-2">
                <i class="fas fa-plus"></i> Добавить целевой код
            </button>
            <p class="text-xs text-gray-500 mt-2">
                <i class="fas fa-info-circle"></i> 
                <strong>Обязательный</strong> - должен присутствовать всегда<br>
                <strong>Опциональный</strong> - может отсутствовать<br>
                <strong>Один из</strong> - достаточно хотя бы одного из группы
            </p>
        </div>
        
        <div id="groupConditionsContainer" class="hidden">
            <div class="form-group">
                <label><i class="fas fa-sliders-h"></i> Условия использования</label>
                <div id="groupConditionsFields" class="bg-gray-50 p-3 rounded-lg"></div>
            </div>
        </div>
        
        <div class="form-group">
            <label>Описание связи</label>
            <textarea id="groupDescription" rows="3" class="form-control" placeholder="Опишите, когда и почему используется эта связь"></textarea>
        </div>
        
        <div class="form-group">
            <label>Название группы (опционально)</label>
            <input type="text" id="groupName" class="form-control" placeholder="Например: Группа демонтажных работ">
        </div>
        
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
            <button onclick="closeModal()" class="btn-outline"><i class="fas fa-times"></i> Отмена</button>
            <button onclick="saveGroupRelation()" class="btn-primary"><i class="fas fa-save"></i> Сохранить группу связей</button>
        </div>
    `;
    
    updateGroupRelationHint();
    openModal('➕ Создание группы расширенных связей');
}

function addTargetCodeRow(targetCode = '', targetType = 'required') {
    const container = document.getElementById('targetCodesContainer');
    const row = document.createElement('div');
    row.className = 'target-code-row';
    row.style.cssText = 'display:flex; gap:8px; margin-bottom:8px;';
    row.innerHTML = `
        <input type="text" class="target-code-input form-control font-mono flex-grow" placeholder="Код" value="${escapeHtml(targetCode)}">
        <select class="target-type-select filter-select" style="width:120px;">
            <option value="required" ${targetType === 'required' ? 'selected' : ''}>Обязательный</option>
            <option value="optional" ${targetType === 'optional' ? 'selected' : ''}>Опциональный</option>
            <option value="any_of" ${targetType === 'any_of' ? 'selected' : ''}>Один из</option>
        </select>
        <button type="button" class="btn-outline" onclick="removeTargetCode(this)" style="padding:8px 12px;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(row);
}

function removeTargetCode(button) {
    const row = button.closest('.target-code-row');
    if (document.querySelectorAll('.target-code-row').length > 1) {
        row.remove();
    } else {
        showError('Должен быть хотя бы один целевой код');
    }
}

function updateGroupRelationHint() {
    const type = document.getElementById('groupRelationType').value;
    const hintDiv = document.getElementById('groupRelationHint');
    const conditionsContainer = document.getElementById('groupConditionsContainer');
    const conditionsFields = document.getElementById('groupConditionsFields');
    
    const hints = {
        'must_be_together': '📌 Если есть исходный код, должны присутствовать ВСЕ обязательные целевые коды',
        'conflict': '⚠️ Исходный код НЕ может использоваться вместе с любым из целевых кодов в одной позиции',
        'check_coefficient': '📊 Проверяет коэффициенты исходного кода на соответствие диапазону',
        'conditional': '🔍 Проверяет условия использования (реставрация, значения коэффициентов)'
    };
    hintDiv.innerHTML = `<i class="fas fa-lightbulb"></i> ${hints[type]}`;
    
    if (type === 'check_coefficient' || type === 'conditional') {
        conditionsContainer.classList.remove('hidden');
        
        if (type === 'check_coefficient') {
            conditionsFields.innerHTML = `
                <div class="grid grid-cols-2 gap-3" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                        <label class="text-xs font-medium">Мин. коэффициент</label>
                        <input type="number" id="groupCoeffMin" step="0.01" value="0.8" class="form-control">
                    </div>
                    <div>
                        <label class="text-xs font-medium">Макс. коэффициент</label>
                        <input type="number" id="groupCoeffMax" step="0.01" value="1.2" class="form-control">
                    </div>
                </div>
                <div class="mt-2">
                    <label class="text-xs font-medium">Точный коэффициент (опционально)</label>
                    <input type="number" id="groupCoeffRequired" step="0.01" class="form-control" placeholder="Например: 1.15">
                </div>
            `;
        } else if (type === 'conditional') {
            conditionsFields.innerHTML = `
                <div class="form-group mb-2">
                    <label class="flex items-center cursor-pointer">
                        <input type="checkbox" id="groupCondRestorationOnly" class="mr-2"> 
                        <span><i class="fas fa-landmark"></i> Только для реставрационных работ</span>
                    </label>
                </div>
                <div class="grid grid-cols-2 gap-3" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                        <label class="text-xs font-medium">Коэффициент должен быть ></label>
                        <input type="number" id="groupCondCoeffGreater" step="0.01" class="form-control" placeholder="Например: 1">
                    </div>
                    <div>
                        <label class="text-xs font-medium">Коэффициент должен быть <</label>
                        <input type="number" id="groupCondCoeffLess" step="0.01" class="form-control" placeholder="Например: 2">
                    </div>
                </div>
            `;
        }
    } else {
        conditionsContainer.classList.add('hidden');
    }
}

async function saveGroupRelation() {
    const sourceCode = document.getElementById('groupSourceCode').value.trim();
    const relationType = document.getElementById('groupRelationType').value;
    const description = document.getElementById('groupDescription').value;
    const groupName = document.getElementById('groupName').value.trim();
    
    if (!sourceCode) {
        showError('Введите исходный код');
        return;
    }
    
    // Собираем целевые коды
    const targetRows = document.querySelectorAll('.target-code-row');
    const targets = [];
    
    for (const row of targetRows) {
        const code = row.querySelector('.target-code-input').value.trim();
        const targetType = row.querySelector('.target-type-select').value;
        
        if (!code) {
            showError('Заполните все целевые коды');
            return;
        }
        
        targets.push({ code, targetType, priority: targets.length });
    }
    
    if (targets.length === 0) {
        showError('Добавьте хотя бы один целевой код');
        return;
    }
    
    let conditions = null;
    
    if (relationType === 'check_coefficient') {
        const coeffMin = parseFloat(document.getElementById('groupCoeffMin').value);
        const coeffMax = parseFloat(document.getElementById('groupCoeffMax').value);
        const coeffRequired = document.getElementById('groupCoeffRequired').value;
        
        if (isNaN(coeffMin) || isNaN(coeffMax)) {
            showError('Введите корректные значения коэффициентов');
            return;
        }
        
        conditions = { expectedCoefficientRange: { min: coeffMin, max: coeffMax } };
        if (coeffRequired && !isNaN(parseFloat(coeffRequired))) {
            conditions.requiredCoefficient = parseFloat(coeffRequired);
        }
    } else if (relationType === 'conditional') {
        conditions = {};
        const restorationOnly = document.getElementById('groupCondRestorationOnly').checked;
        const coeffGreater = document.getElementById('groupCondCoeffGreater').value;
        const coeffLess = document.getElementById('groupCondCoeffLess').value;
        
        if (restorationOnly) conditions.restorationOnly = true;
        if (coeffGreater && !isNaN(parseFloat(coeffGreater))) {
            conditions.onlyIfCoefficientGreaterThan = parseFloat(coeffGreater);
        }
        if (coeffLess && !isNaN(parseFloat(coeffLess))) {
            conditions.onlyIfCoefficientLessThan = parseFloat(coeffLess);
        }
        
        if (Object.keys(conditions).length === 0) {
            showError('Укажите хотя бы одно условие');
            return;
        }
    }
    
    showLoading();
    
    try {
        const res = await fetch('/api/codes/relations/group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourceCode,
                relationType,
                targets,
                conditions,
                description,
                groupName: groupName || null,
                adminName: currentAdmin?.username
            })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            closeModal();
            loadRelations();
            showSuccess(`✅ Группа связей создана: ${targets.length} целевых кодов`);
        } else {
            showError(data.error || 'Ошибка при создании группы');
        }
    } catch (error) {
        console.error('Error saving group relation:', error);
        showError('Ошибка при создании группы: ' + error.message);
    } finally {
        hideLoading();
    }
}
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Также добавим showError и showSuccess если их нет
function showError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification toast-error';
    toast.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification toast-success';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
// Обновляем функцию deleteRelation для лучшего UX
async function deleteRelation(id) {
    // Находим связь для отображения информации
    const relation = currentRelations.find(r => r.id === id);
    const relationName = relation ? `${relation.source_code} → ${relation.target_code}` : `ID ${id}`;
    
    if (!confirm(`Удалить связь "${relationName}"?${relation?.extended_type === 1 ? ' Это расширенная связь с условиями.' : ''}`)) {
        return;
    }
    
    try {
        const res = await fetch(`/api/codes/relations/${id}`, { 
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminName: currentAdmin?.username })
        });
        
        if (res.ok) { 
            loadRelations(); 
            showSuccess(`Связь "${relationName}" удалена`);
        } else {
            const err = await res.json();
            showError(err.error || 'Ошибка при удалении связи');
        }
    } catch (error) {
        console.error('Error deleting relation:', error);
        showError('Ошибка при удалении связи');
    }
}

// Добавляем кнопку в интерфейс для расширенных связей
function addExtendedRelationButton() {
    const cardActions = document.querySelector('#relationsTab .card-actions');
    if (cardActions && !document.getElementById('extendedRelationBtn')) {
        const btn = document.createElement('button');
        btn.id = 'extendedRelationBtn';
        btn.className = 'btn-primary';
        btn.style.background = 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
        btn.innerHTML = '<i class="fas fa-brain"></i> Расширенная связь';
        btn.onclick = openAddExtendedRelationModal;
        cardActions.appendChild(btn);
    }
}

// Вызываем при инициализации
// Добавьте вызов addExtendedRelationButton() в функцию initApp() после загрузки табов
// ==================== СВЯЗИ - ДЕЙСТВИЯ ====================
async function deleteRelation(id) {
    if (confirm('Удалить эту связь?')) {
        const res = await fetch(`/api/codes/relations/${id}`, { method: 'DELETE' });
        if (res.ok) { loadRelations(); showSuccess('Связь удалена'); }
    }
}

function openAddRelationModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="form-group"><input type="text" id="relationSourceCode" placeholder="Исходный код" class="font-mono"></div>
        <div class="form-group"><input type="text" id="relationTargetCode" placeholder="Целевой код" class="font-mono"></div>
        <div class="form-group"><select id="relationType"><option value="duplicate">🔄 Дублирующий</option><option value="related">🔗 Связанный</option></select></div>
        <div class="form-group"><textarea id="relationDescription" rows="2" placeholder="Описание"></textarea></div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;"><button onclick="closeModal()" class="btn-outline">Отмена</button><button onclick="saveRelation()" class="btn-primary">Сохранить</button></div>
    `;
    openModal('Добавление связи');
}

async function saveRelation() {
    const sourceCode = document.getElementById('relationSourceCode').value.trim();
    const targetCode = document.getElementById('relationTargetCode').value.trim();
    const relationType = document.getElementById('relationType').value;
    const description = document.getElementById('relationDescription').value;
    if (!sourceCode || !targetCode) { alert('Заполните оба поля'); return; }
    const res = await fetch('/api/codes/relations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceCode, targetCode, relationType, description, adminName: currentAdmin?.username }) });
    if (res.ok) { closeModal(); loadRelations(); showSuccess('Связь добавлена'); }
    else { const err = await res.json(); alert(err.error || 'Ошибка'); }
}
// ==================== ПОЛЬЗОВАТЕЛИ - ДЕЙСТВИЯ ====================
function openAddUserModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="form-group"><label>Логин *</label><input type="text" id="newUsername" placeholder="Введите логин"></div>
        <div class="form-group"><label>Пароль *</label><input type="password" id="newPassword" placeholder="Минимум 4 символа"></div>
        <div class="form-group"><label>ФИО</label><input type="text" id="newFullname" placeholder="ФИО пользователя"></div>
        <div class="form-group"><label>Учреждение</label><input type="text" id="newInstitution" placeholder="Название учреждения"></div>
        <div class="form-group"><label>Роль</label><select id="newRole"><option value="user">👤 Пользователь</option><option value="admin">👑 Администратор</option></select></div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
            <button onclick="closeModal()" class="btn-outline">Отмена</button>
            <button onclick="createUser()" class="btn-primary">Создать</button>
        </div>
    `;
    openModal('Добавление пользователя');
}

async function createUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const fullname = document.getElementById('newFullname').value.trim();
    const institution = document.getElementById('newInstitution').value.trim();
    const role = document.getElementById('newRole').value;
    
    if (!username) { alert('Введите логин'); return; }
    if (!password || password.length < 4) { alert('Пароль должен быть минимум 4 символа'); return; }
    
    const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, fullname, institution, role, adminName: currentAdmin?.username })
    });
    
    if (res.ok) { closeModal(); loadUsers(); showSuccess('Пользователь создан'); }
    else { const err = await res.json(); alert(err.error || 'Ошибка'); }
}

async function openEditUserModal(userId) {
    const user = currentUsers.find(u => u.id === userId);
    if (!user) return;
    
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <input type="hidden" id="editUserId" value="${user.id}">
        <div class="form-group"><label>Логин</label><input type="text" value="${escapeHtml(user.username)}" class="bg-gray-100" readonly disabled></div>
        <div class="form-group"><label>Новый пароль</label><input type="password" id="editPassword" placeholder="Оставьте пустым если не менять"></div>
        <div class="form-group"><label>ФИО</label><input type="text" id="editFullname" value="${escapeHtml(user.fullname || '')}"></div>
        <div class="form-group"><label>Учреждение</label><input type="text" id="editInstitution" value="${escapeHtml(user.institution || '')}"></div>
        <div class="form-group"><label>Роль</label><select id="editRole" ${user.role === 'admin' ? 'disabled' : ''}><option value="user" ${user.role === 'user' ? 'selected' : ''}>Пользователь</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Администратор</option></select></div>
        <div class="form-group"><label>Статус</label><select id="editStatus"><option value="1" ${user.is_active ? 'selected' : ''}>Активен</option><option value="0" ${!user.is_active ? 'selected' : ''}>Заблокирован</option></select></div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
            <button onclick="closeModal()" class="btn-outline">Отмена</button>
            <button onclick="updateUser()" class="btn-primary">Сохранить</button>
        </div>
    `;
    openModal('Редактирование пользователя');
}

async function updateUser() {
    const userId = document.getElementById('editUserId').value;
    const password = document.getElementById('editPassword').value;
    const fullname = document.getElementById('editFullname').value;
    const institution = document.getElementById('editInstitution').value;
    const role = document.getElementById('editRole').value;
    const is_active = document.getElementById('editStatus').value === '1';
    
    const data = { fullname, institution, role, is_active, adminName: currentAdmin?.username };
    if (password) data.password = password;
    
    const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    
    if (res.ok) { closeModal(); loadUsers(); showSuccess('Пользователь обновлен'); }
    else { const err = await res.json(); alert(err.error || 'Ошибка'); }
}

async function deleteUser(userId) {
    const user = currentUsers.find(u => u.id === userId);
    if (user.role === 'admin') { alert('Нельзя удалить администратора'); return; }
    if (confirm(`Удалить пользователя "${user.username}"?`)) {
        const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
        if (res.ok) { loadUsers(); showSuccess('Пользователь удален'); }
        else { alert('Ошибка при удалении'); }
    }
}

// ==================== ПРОЕКТЫ - ДЕЙСТВИЯ ====================
function renderProjectsTable() {
    const tbody = document.getElementById('projectsTableBody');
    if (!tbody) return;
    
    let filtered = currentProjects;
    if (currentProjectFilter !== 'all') {
        filtered = currentProjects.filter(p => p.status === currentProjectFilter);
    }
    
    if (!filtered || filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-8 text-gray-500">Нет проектов</td></tr>';
        return;
    }
    
    tbody.innerHTML = filtered.map(proj => `
        <tr>
            <td class="font-mono">${proj.id}</td>
            <td class="font-medium">${escapeHtml(proj.project_name)}</td>
            <td>${escapeHtml(proj.user_name || '—')}</td>
            <td class="text-sm text-gray-500">${escapeHtml(proj.user_institution || '—')}</td>
            <td><span class="status-badge" style="background:${proj.status === 'active' ? '#dcfce7' : '#f3f4f6'}; color:${proj.status === 'active' ? '#166534' : '#4b5563'}">${proj.status === 'active' ? '✅ Активен' : '📦 Архив'}</span></td>
            <td class="text-center">${proj.session_count || 0}</td>
            <td class="text-center">${proj.total_codes || 0}</td>
            <td class="text-center">
                ${proj.warning_count > 0 ? `<span class="text-yellow-600">⚠️ ${proj.warning_count}</span>` : ''}
                ${proj.not_allowed_count > 0 ? `<span class="text-red-600 ml-1">❌ ${proj.not_allowed_count}</span>` : ''}
                ${!proj.warning_count && !proj.not_allowed_count ? '<span class="text-green-600">✅</span>' : ''}
            </td>
            <td class="text-sm">${formatMoscowDate(proj.created_at)}</td>
            <td class="text-sm">${formatMoscowDate(proj.updated_at)}</td>
            <td class="text-center">
                <button onclick="showProjectDetails(${proj.id})" class="text-indigo-600" title="Просмотр"><i class="fas fa-eye"></i></button>
                ${proj.status === 'active' ? 
                    `<button onclick="adminArchiveProject(${proj.id})" class="text-orange-600 ml-2" title="Архивировать"><i class="fas fa-archive"></i></button>` : 
                    `<button onclick="adminRestoreProject(${proj.id})" class="text-green-600 ml-2" title="Восстановить"><i class="fas fa-undo"></i></button>
                     <button onclick="adminDeleteProject(${proj.id})" class="text-red-600 ml-2" title="Удалить"><i class="fas fa-trash"></i></button>`}
            </td>
        </tr>
    `).join('');
}

function filterProjects() {
    currentProjectFilter = document.getElementById('projectStatusFilter').value;
    renderProjectsTable();
}

function refreshProjects() { loadProjects(); }

async function showProjectDetails(projectId) {
    try {
        const res = await fetch(`/api/admin/projects/${projectId}/sessions`);
        const sessions = await res.json();
        const project = currentProjects.find(p => p.id === projectId);
        
        const modalTitle = document.getElementById('projectDetailTitle');
        if (modalTitle) modalTitle.innerText = `Сессии: ${escapeHtml(project?.project_name || '')}`;
        
        const body = document.getElementById('projectDetailBody');
        if (!sessions || sessions.length === 0) {
            body.innerHTML = '<p class="text-center py-8 text-gray-500">Нет сессий в этом проекте</p>';
        } else {
            body.innerHTML = sessions.map(sess => `
                <div class="session-item" style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                        <div><strong>📄 ${escapeHtml(sess.filename)}</strong><br><small class="text-gray-500">${formatMoscowDate(sess.created_at)}</small></div>
                        <span class="status-badge" style="background:#e0e7ff; color:#4338ca">${sess.is_revised ? '🔄 Исправлен' : '✨ Новый'}</span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:12px;">
                        <div><span class="text-gray-500">Кодов:</span> ${sess.total_codes || 0}</div>
                        <div><span class="text-gray-500">Найдено:</span> ${sess.found_codes || 0}</div>
                        <div><span class="text-gray-500">Сумма:</span> ${sess.total_amount ? Number(sess.total_amount).toLocaleString() + ' ₽' : '—'}</div>
                        <div><button onclick="closeProjectDetailModal(); showSessionDetails('${sess.session_id}')" class="text-indigo-600">📋 Подробнее</button></div>
                    </div>
                    <div class="text-sm">
                        ${sess.warning_count > 0 ? `<span class="text-yellow-600">⚠️ Внимание: ${sess.warning_count}</span> ` : ''}
                        ${sess.not_allowed_count > 0 ? `<span class="text-red-600">❌ Запрещено: ${sess.not_allowed_count}</span> ` : ''}
                        ${sess.coefficient_mismatches > 0 ? `<span class="text-orange-600">📊 Коэф.: ${sess.coefficient_mismatches}</span>` : ''}
                    </div>
                </div>
            `).join('');
        }
        openModalElement('projectDetailModal');
    } catch (error) {
        console.error(error);
        showError('Ошибка загрузки данных проекта');
    }
}

async function adminArchiveProject(projectId) {
    if (!confirm('Отправить проект в архив?')) return;
    const res = await fetch(`/api/admin/projects/${projectId}/archive`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ adminName: currentAdmin?.username }) 
    });
    if (res.ok) { showSuccess('Проект архивирован'); loadProjects(); }
}

async function adminRestoreProject(projectId) {
    if (!confirm('Восстановить проект?')) return;
    const res = await fetch(`/api/admin/projects/${projectId}/restore`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ adminName: currentAdmin?.username }) 
    });
    if (res.ok) { showSuccess('Проект восстановлен'); loadProjects(); }
}

async function adminDeleteProject(projectId) {
    if (!confirm('Удалить проект безвозвратно? Все данные будут потеряны!')) return;
    const res = await fetch(`/api/admin/projects/${projectId}`, { 
        method: 'DELETE', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ adminName: currentAdmin?.username }) 
    });
    if (res.ok) { showSuccess('Проект удалён'); loadProjects(); }
}

// ==================== СЕССИИ ПОЛЬЗОВАТЕЛЕЙ ====================
async function showUserSessions(userName) {
    try {
        const params = new URLSearchParams({ user_name: userName, days: currentPeriod });
        if (currentAnalyticsProjectId) params.append('project_id', currentAnalyticsProjectId);
        
        const res = await fetch(`/api/analytics/user-sessions?${params}`);
        const sessions = await res.json();
        
        const modalTitle = document.getElementById('userSessionsModalTitle');
        if (modalTitle) modalTitle.innerText = `Сессии: ${escapeHtml(userName)}`;
        
        const body = document.getElementById('userSessionsModalBody');
        if (!sessions || sessions.length === 0) {
            body.innerHTML = '<p class="text-center py-8 text-gray-500">Нет сессий за выбранный период</p>';
        } else {
            body.innerHTML = sessions.map(sess => {
                const total = sess.total_codes || 0;
                const found = sess.found_codes || 0;
                const accuracy = total > 0 ? ((found / total) * 100).toFixed(1) : 0;
                const accuracyClass = accuracy >= 80 ? '#10b981' : (accuracy >= 50 ? '#f59e0b' : '#ef4444');
                const problems = [];
                if (sess.not_found_codes > 0) problems.push(`🔍 ${sess.not_found_codes} не найдено`);
                if (sess.coefficient_mismatches > 0) problems.push(`📊 ${sess.coefficient_mismatches} коэф.`);
                
                return `
                    <div class="session-item" onclick="showSessionDetails('${sess.session_id}')" style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:12px; cursor:pointer;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                            <div><strong>📄 ${escapeHtml(sess.filename || 'Без имени')}</strong><br><small class="text-gray-500">${formatMoscowDate(sess.created_at)}</small></div>
                            <div><span class="status-badge" style="background:#e0e7ff; color:#4338ca">${sess.is_revised ? '🔄 Исправлен' : '✨ Новый'}</span>
                            <button onclick="event.stopPropagation(); exportSession('${sess.session_id}')" class="btn-outline ml-2" style="padding:4px 8px;"><i class="fas fa-download"></i></button></div>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px;">
                            <div><span class="text-gray-500">Коды:</span> ${found}/${total}</div>
                            <div><span class="text-gray-500">Точность:</span> <span style="color:${accuracyClass}">${accuracy}%</span></div>
                            <div><span class="text-gray-500">Сумма:</span> ${sess.total_amount ? Number(sess.total_amount).toLocaleString() + ' ₽' : '—'}</div>
                            <div class="text-red-600">${problems.join(', ') || '✅'}</div>
                        </div>
                        ${sess.estimate_name ? `<div class="text-xs text-gray-400 mt-2">📊 Смета: ${escapeHtml(sess.estimate_name)}</div>` : ''}
                    </div>
                `;
            }).join('');
        }
        openModalElement('userSessionsModal');
    } catch (error) {
        console.error(error);
        showError('Не удалось загрузить сессии');
    }
}

async function showSessionDetails(sessionId) {
    try {
        const res = await fetch(`/api/logs/sessions/${sessionId}`);
        const session = await res.json();
        const modalBody = document.getElementById('sessionModalBody');
        
        let codesHtml = '';
        if (session.codes && session.codes.length > 0) {
            codesHtml = `
                <div style="max-height:400px; overflow-y:auto;">
                    <table class="data-table" style="width:100%; font-size:12px;">
                        <thead style="position:sticky; top:0; background:#f8fafc;">
                            <tr><th>№</th><th>Строка</th><th>Код</th><th>Тип</th><th>Статус</th><th>Коэф.</th><th>Описание</th></tr>
                        </thead>
                        <tbody>
                            ${session.codes.map(c => {
                                const matchTypes = { exact:'Точный', table:'Таблица', section:'Отдел', collection:'Сборник', chapter:'Глава', relation_duplicate:'Дубль', relation_related:'Связ.', parent:'Родит.', restoration:'Реставр.' };
                                let coeffHtml = '-';
                                if (c.hasCoefficient) {
                                    if (c.expectedCoefficient && c.coefficientValue) {
                                        coeffHtml = `${c.coefficientMatch === true ? '✅' : '⚠️'} ${c.expectedCoefficient}/${c.coefficientValue}`;
                                    } else if (c.coefficientValue) {
                                        coeffHtml = `📊 ${c.coefficientValue}`;
                                    } else {
                                        coeffHtml = `📊 ${c.coefficientType === 'increasing' ? '↑' : '↓'}`;
                                    }
                                }
                                const statusClass = (c.status || '').replace(/[^а-яёa-z0-9]/gi, '-');
                                return `<tr><td>${c.position}</td><td>${c.rowNumber || '-'}</td><td class="font-mono">${escapeHtml(c.code)}</td><td>${matchTypes[c.matchType] || '-'}</td><td><span class="status-badge status-${statusClass}">${c.isRestoration ? '🏛️ ' : ''}${c.status}</span></td><td>${coeffHtml}</td><td class="text-gray-600">${escapeHtml(c.description || '-')}</td></tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            codesHtml = '<p class="text-center py-8 text-gray-500">Нет данных о кодах</p>';
        }
        
        modalBody.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:20px;">
                <div style="background:#f8fafc; padding:12px; border-radius:8px;"><small class="text-gray-500">📅 Дата</small><br><strong>${formatMoscowDate(session.created_at)}</strong></div>
                <div style="background:#f8fafc; padding:12px; border-radius:8px;"><small class="text-gray-500">👤 Пользователь</small><br><strong>${escapeHtml(session.user_name || '-')}</strong></div>
                <div style="background:#f8fafc; padding:12px; border-radius:8px;"><small class="text-gray-500">📄 Файл</small><br><strong>${escapeHtml(session.filename || '-')}</strong></div>
                <div style="background:#f8fafc; padding:12px; border-radius:8px;"><small class="text-gray-500">💰 Сумма</small><br><strong>${(session.total_amount || 0).toLocaleString()} ₽</strong></div>
                <div style="background:#f8fafc; padding:12px; border-radius:8px;"><small class="text-gray-500">🔢 Коды</small><br><strong>${session.found_codes || 0}/${session.total_codes || 0}</strong></div>
                <div style="background:#f8fafc; padding:12px; border-radius:8px;"><small class="text-gray-500">🎯 Точность</small><br><strong style="color:${session.total_codes > 0 && ((session.found_codes / session.total_codes) * 100) >= 80 ? '#10b981' : '#f59e0b'}">${session.total_codes > 0 ? ((session.found_codes / session.total_codes) * 100).toFixed(1) : 0}%</strong></div>
            </div>
            <div style="margin-bottom:16px; text-align:right;">
                <button onclick="exportSession('${sessionId}')" class="btn-outline"><i class="fas fa-download"></i> Экспорт CSV</button>
            </div>
            <h4 style="margin-bottom:12px;">📋 Детали кодов</h4>
            ${codesHtml}
        `;
        openModalElement('sessionModal');
    } catch (error) {
        console.error(error);
        showError('Не удалось загрузить детали сессии');
    }
}

function exportSession(sessionId) {
    window.open(`/api/analytics/session-export/${sessionId}`, '_blank');
}

// ==================== ДАШБОРД РУКОВОДИТЕЛЯ ====================
async function loadManagerDashboard() {
    try {
        const res = await fetch(`/api/analytics/manager-dashboard?days=${currentPeriod}`);
        const data = await res.json();
        
        safeText('todaySessions', data.today?.sessions || 0);
        safeText('todayAccuracy', `${data.today?.accuracy?.toFixed(1) || 0}%`);
        safeText('todayAmount', `${(data.today?.totalAmount || 0).toLocaleString()} ₽`);
        safeText('todayCodes', `${data.today?.codes || 0}/${data.today?.found || 0}`);
        
        const topUsersDiv = document.getElementById('topUsersWidget');
        if (topUsersDiv && data.topUsers?.length) {
            topUsersDiv.innerHTML = data.topUsers.map(u => `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #e5e7eb;">
                    <div><strong>${escapeHtml(u.user_name)}</strong><br><small class="text-gray-500">${escapeHtml(u.user_institution || '')}</small></div>
                    <div><span class="text-green-600">${u.avg_accuracy?.toFixed(1)}%</span><br><small>${u.sessions_count} сесс.</small></div>
                </div>
            `).join('');
        } else if (topUsersDiv) {
            topUsersDiv.innerHTML = '<p class="text-gray-500">Нет данных</p>';
        }
        
        const topProblemsDiv = document.getElementById('topProblemsWidget');
        if (topProblemsDiv && data.topProblems) {
            let problemsHtml = '<h5 style="color:#dc2626; margin-bottom:8px;">❌ Нельзя применять</h5>';
            if (data.topProblems.notAllowed?.length) {
                problemsHtml += data.topProblems.notAllowed.map(p => `<div class="text-sm mb-1"><code>${escapeHtml(p.code)}</code> (${p.count})</div>`).join('');
            } else {
                problemsHtml += '<p class="text-gray-400 text-sm">Нет</p>';
            }
            problemsHtml += '<h5 style="color:#d97706; margin:12px 0 8px;">⚠️ Обратите внимание</h5>';
            if (data.topProblems.warning?.length) {
                problemsHtml += data.topProblems.warning.map(p => `<div class="text-sm mb-1"><code>${escapeHtml(p.code)}</code> (${p.count})</div>`).join('');
            } else {
                problemsHtml += '<p class="text-gray-400 text-sm">Нет</p>';
            }
            topProblemsDiv.innerHTML = problemsHtml;
        }
    } catch (e) {
        console.error(e);
        showError('Ошибка загрузки дашборда');
    }
}

async function loadTopProblemCodes() {
    try {
        const res = await fetch(`/api/analytics/problem-codes?days=${currentPeriod}&limit=20`);
        const data = await res.json();
        
        let html = '<h3 style="color:#dc2626; margin-bottom:12px;">❌ Нельзя применять</h3>';
        if (data.notAllowed?.length) {
            html += data.notAllowed.map(c => `<div style="display:flex; justify-content:space-between; background:#fee2e2; padding:8px; border-radius:8px; margin-bottom:8px;"><code>${escapeHtml(c.code)}</code> <span>${c.count} раз</span></div>`).join('');
        } else {
            html += '<p class="text-gray-500">Нет</p>';
        }
        html += '<h3 style="color:#d97706; margin:16px 0 12px;">⚠️ Обратите внимание</h3>';
        if (data.warning?.length) {
            html += data.warning.map(c => `<div style="display:flex; justify-content:space-between; background:#fef3c7; padding:8px; border-radius:8px; margin-bottom:8px;"><code>${escapeHtml(c.code)}</code> <span>${c.count} раз</span></div>`).join('');
        } else {
            html += '<p class="text-gray-500">Нет</p>';
        }
        
        document.getElementById('modalBody').innerHTML = html;
        openModal('Топ проблемных кодов');
    } catch (e) {
        console.error(e);
        showError('Ошибка загрузки');
    }
}

// ==================== АНАЛИТИКА - ДЕЙСТВИЯ ====================
function filterByProject() {
    const select = document.getElementById('analyticsProjectSelect');
    currentAnalyticsProjectId = select.value ? parseInt(select.value) : null;
    loadAnalytics();
}

function changePeriod() {
    const select = document.getElementById('periodSelect');
    currentPeriod = parseInt(select.value);
    loadAnalytics();
    if (document.getElementById('managerDashboardTab') && !document.getElementById('managerDashboardTab').classList.contains('hidden')) {
        loadManagerDashboard();
    }
}

async function refreshAnalytics() {
    await loadAnalytics();
    showSuccess('Аналитика обновлена');
}

function exportSessionsCSV() {
    const rows = [['№','Пользователь','Учреждение','Последняя активность','Сессий','Файлов','Кодов всего','Найдено','Точность','Детали']];
    document.querySelectorAll('#usersAnalyticsTableBody tr').forEach((row, idx) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 10) {
            rows.push([idx+1, cells[1]?.innerText, cells[2]?.innerText, cells[3]?.innerText, cells[4]?.innerText, cells[5]?.innerText, cells[6]?.innerText, cells[7]?.innerText, cells[8]?.innerText, cells[9]?.innerText]);
        }
    });
    const csvContent = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.download = `аналитика_${new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    showSuccess('CSV экспортирован');
}

function downloadUsageReport() {
    showSuccess('Генерация отчёта...');
    window.open('/api/reports/usage', '_blank');
}

// ==================== ПОИСК ====================
function searchExactCodes() {
    const term = document.getElementById('searchExactInput')?.value.toLowerCase() || '';
    if (!term) { renderExactTable(currentExactCodes); return; }
    const filtered = currentExactCodes.filter(c => c.code.toLowerCase().includes(term) || (c.description && c.description.toLowerCase().includes(term)));
    renderExactTable(filtered);
}

function searchParentCodes() {
    const term = document.getElementById('searchParentInput')?.value.toLowerCase() || '';
    if (!term) { renderParentTable(currentParentCodes); return; }
    const filtered = currentParentCodes.filter(c => c.code.toLowerCase().includes(term) || (c.description && c.description.toLowerCase().includes(term)));
    renderParentTable(filtered);
}

function searchHierarchicalCodes() {
    const term = document.getElementById('searchHierarchicalInput')?.value.toLowerCase() || '';
    if (!term) { renderHierarchicalTable(currentHierarchicalCodes); return; }
    const filtered = currentHierarchicalCodes.filter(c => c.code.toLowerCase().includes(term) || (c.description && c.description.toLowerCase().includes(term)));
    renderHierarchicalTable(filtered);
}

// ==================== ВАЛИДАТОР ====================
async function validateCode() {
    const code = document.getElementById('validatorCodeInput').value;
    if (!code) { alert('Введите код'); return; }
    
    const res = await fetch('/api/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });
    const data = await res.json();
    const resultDiv = document.getElementById('validationResult');
    resultDiv.classList.remove('hidden');
    
    let structureHtml = '';
    if (data.structure) {
        structureHtml = `<div style="margin-top:12px; padding:12px; background:#f8fafc; border-radius:8px;">
            <strong>📐 Структура:</strong><br>
            Глава: ${data.structure.chapter} | Сборник: ${data.structure.collection} | Отдел: ${data.structure.section} | Таблица: ${data.structure.table}
            ${data.structure.standard ? ` | Норматив: ${data.structure.standard}` : ''}
        </div>`;
    }
    
    const matchLabels = { exact:'✅ Точный код', table:'📋 Таблица', section:'📁 Отдел', collection:'📚 Сборник', chapter:'📖 Глава', relation_duplicate:'🔗 Дубликат', relation_related:'🔗 Связанный', parent:'📚 Родительский', restoration:'🏛️ Реставрация', none:'❌ Не найден' };
    
    resultDiv.innerHTML = `
        <div style="border-left:4px solid ${data.isRestoration ? '#10b981' : '#8b5cf6'}; background:#f8fafc; padding:16px; border-radius:12px;">
            <p><strong>Код:</strong> <code>${escapeHtml(data.code)}</code></p>
            <p><strong>Нормализованный:</strong> <code>${escapeHtml(data.normalized)}</code></p>
            <p><strong>Реставрационный:</strong> ${data.isRestoration ? '✅ Да' : '❌ Нет'}</p>
            <p><strong>В базе:</strong> ${data.inDatabase ? '✅ Есть' : '❌ Нет'}</p>
            ${data.matchType !== 'none' ? `<p><strong>Тип:</strong> ${matchLabels[data.matchType] || data.matchType}</p>` : ''}
            ${data.status ? `<p><strong>Статус:</strong> <span class="status-badge status-${(data.status || '').replace(/[^а-яёa-z0-9]/gi, '-')}">${data.status}</span></p>` : ''}
            ${data.description ? `<p><strong>Описание:</strong> ${escapeHtml(data.description)}</p>` : ''}
            ${structureHtml}
        </div>
    `;
}

function setExampleCode(code) {
    document.getElementById('validatorCodeInput').value = code;
    validateCode();
}
// ==================== ТАБЫ И НАВИГАЦИЯ ====================
function switchTab(tab) {
    // Скрываем все табы
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
    });
    
    // Показываем выбранный таб
    const activeTab = document.getElementById(`${tab}Tab`);
    if (activeTab) {
        activeTab.classList.remove('hidden');
    }
    
    // Обновляем активный класс в навигации
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-tab') === tab) {
            item.classList.add('active');
        }
    });
    
    // Обновляем заголовок страницы
    const titles = {
        dashboard: '📊 Дашборд',
        exactCodes: '🎯 Точные коды',
        parentCodes: '📚 Родительские коды',
        hierarchicalCodes: '🗂️ Иерархические коды',
        relations: '🔗 Связи кодов',
        templates: '📋 Шаблоны',
        validator: '✅ Валидатор',
        analytics: '📈 Аналитика',
        managerDashboard: '📊 Дашборд руководителя',
        projects: '📁 Проекты',
        users: '👥 Пользователи'
    };
    
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.innerText = titles[tab] || 'Дашборд';
    }
    
    // Загружаем данные для выбранного таба
    switch(tab) {
        case 'exactCodes':
            loadExactCodes();
            break;
        case 'parentCodes':
            loadParentCodes();
            break;
        case 'hierarchicalCodes':
            loadHierarchicalCodes();
            break;
        case 'relations':
            loadRelations();
            break;
        case 'users':
            loadUsers();
            break;
        case 'projects':
            loadProjects();
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'managerDashboard':
            loadManagerDashboard();
            break;
        case 'dashboard':
            updateDashboard();
            break;
    }
}

// ==================== ОБНОВЛЕНИЕ ДАННЫХ ====================
function refreshData() {
    const btn = document.getElementById('globalRefreshBtn');
    if (btn) {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;
        
        Promise.all([
            loadExactCodes(),
            loadParentCodes(),
            loadHierarchicalCodes(),
            loadRelations(),
            loadAnalytics(),
            loadUsers(),
            loadProjects()
        ]).then(() => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            showSuccess('Данные обновлены');
        }).catch(() => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            showError('Ошибка обновления');
        });
    } else {
        loadExactCodes();
        loadParentCodes();
        loadHierarchicalCodes();
        loadRelations();
        loadAnalytics();
        loadUsers();
        loadProjects();
    }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function initApp() {
    // Проверяем авторизацию
    const savedAdmin = localStorage.getItem('admin_user');
    if (!savedAdmin) {
        window.location.href = '/login.html';
        return;
    }
    
    try {
        currentAdmin = JSON.parse(savedAdmin);
    } catch (e) {
        console.error('Ошибка чтения данных администратора');
        localStorage.removeItem('admin_user');
        window.location.href = '/login.html';
        return;
    }
    
    // Показываем интерфейс
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
        appContainer.classList.remove('hidden');
    }
    
    // Устанавливаем данные администратора
    const adminNameEl = document.getElementById('adminName');
    const adminLoginEl = document.getElementById('adminLogin');
    if (adminNameEl) adminNameEl.innerText = currentAdmin.fullname || currentAdmin.username;
    if (adminLoginEl) adminLoginEl.innerText = currentAdmin.username;
    
    // Загружаем все данные
    loadExactCodes();
    loadParentCodes();
    loadHierarchicalCodes();
    loadRelations();
    loadAnalytics();
    loadUsers();
    loadProjects();
    loadManagerDashboard();
    
    // Настройка автообновления
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        if (autoRefresh && currentAdmin) {
            loadExactCodes();
            loadParentCodes();
            loadHierarchicalCodes();
        }
    }, 30000);
    
    // Настройка поиска
    const searchExact = document.getElementById('searchExactInput');
    if (searchExact) searchExact.addEventListener('input', searchExactCodes);
    
    const searchParent = document.getElementById('searchParentInput');
    if (searchParent) searchParent.addEventListener('input', searchParentCodes);
    
    const searchHierarchical = document.getElementById('searchHierarchicalInput');
    if (searchHierarchical) searchHierarchical.addEventListener('input', searchHierarchicalCodes);
    
    // Настройка закрытия модалок по клику на оверлей
    setupModalOverlayClose();
    
    // Обновляем время последнего обновления
    const lastUpdateEl = document.getElementById('lastUpdate');
    if (lastUpdateEl) {
        lastUpdateEl.innerHTML = `<i class="fas fa-clock"></i> ${getCurrentMoscowTime()}`;
    }
    
    console.log('✅ Админ-панель инициализирована');
}

// ==================== ЗАКРЫТИЕ МОДАЛОК ПО КЛИКУ НА ОВЕРЛЕЙ ====================
function setupModalOverlayClose() {
    const modals = ['modal', 'sessionModal', 'projectDetailModal', 'userSessionsModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    closeModalElement(modalId);
                }
            });
        }
    });
}

// ==================== ЗАПУСК ПРИЛОЖЕНИЯ ====================
// Ждем полной загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// ==================== ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЕ ИЕРАРХИЧЕСКИХ КОДОВ ====================
// Эта функция вызывается из модалки при изменении уровня
window.updateHierarchicalCodeExample = function() {
    const levelSelect = document.getElementById('newHierarchicalLevel');
    const hintEl = document.getElementById('codeExampleHint');
    if (levelSelect && hintEl) {
        const level = levelSelect.value;
        const examples = {
            '1': 'Пример: 1 (глава)',
            '2': 'Пример: 1.21 (сборник)',
            '3': 'Пример: 1.21-1303 (отдел)',
            '4': 'Пример: 1.21-1303-33 (таблица)'
        };
        hintEl.textContent = examples[level] || 'Введите код';
    }
};

// Экспортируем функции в глобальную область видимости для доступа из HTML
window.adminLogout = adminLogout;
window.switchTab = switchTab;
window.refreshData = refreshData;
window.openAddExactModal = openAddExactModal;
window.openDeleteExactModal = openDeleteExactModal;
window.openEditExactModal = openEditExactModal;
window.deleteExactCode = deleteExactCode;
window.openAddParentModal = openAddParentModal;
window.openDeleteParentModal = openDeleteParentModal;
window.openEditParentModal = openEditParentModal;
window.deleteParentCode = deleteParentCode;
window.openAddHierarchicalModal = openAddHierarchicalModal;
window.openEditHierarchicalModal = openEditHierarchicalModal;
window.deleteHierarchicalCode = deleteHierarchicalCode;
window.openAddRelationModal = openAddRelationModal;
window.deleteRelation = deleteRelation;
window.openAddUserModal = openAddUserModal;
window.openEditUserModal = openEditUserModal;
window.deleteUser = deleteUser;
window.showUserSessions = showUserSessions;
window.showSessionDetails = showSessionDetails;
window.showProjectDetails = showProjectDetails;
window.closeSessionModal = closeSessionModal;
window.closeUserSessionsModal = closeUserSessionsModal;
window.closeProjectDetailModal = closeProjectDetailModal;
window.closeModal = closeModal;
window.adminArchiveProject = adminArchiveProject;
window.adminRestoreProject = adminRestoreProject;
window.adminDeleteProject = adminDeleteProject;
window.filterProjects = filterProjects;
window.refreshProjects = refreshProjects;
window.validateCode = validateCode;
window.setExampleCode = setExampleCode;
window.exportSession = exportSession;
window.exportSessionsCSV = exportSessionsCSV;
window.downloadUsageReport = downloadUsageReport;
window.filterByProject = filterByProject;
window.changePeriod = changePeriod;
window.refreshAnalytics = refreshAnalytics;
window.loadTopProblemCodes = loadTopProblemCodes;
window.searchExactCodes = searchExactCodes;
window.searchParentCodes = searchParentCodes;
window.searchHierarchicalCodes = searchHierarchicalCodes;

// Функция для мобильного меню
window.toggleMobileMenu = function() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.toggle('mobile-open');
    }
};