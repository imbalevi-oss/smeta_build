// modules/projects.js

import { AppState, updateState } from './state.js';
import { showLoading, hideLoading, showError, showSuccess } from './ui-notifications.js';
import { safeArray, safeObject, escapeHtml, formatMoscowDate, formatMoscowDateOnly, formatRelativeTime } from '../utils/helpers.js';
import { switchToWorkspaceTab } from '../components/navigation.js';
import { showEmptyState, displayResultsFromSession } from './analysis.js';

export async function loadAllProjects() {
    try {
        const projectsContainer = document.getElementById('projectsList');
        if (projectsContainer) {
            projectsContainer.innerHTML = `<div class="empty-projects"><i class="fas fa-spinner fa-spin"></i><p>Загрузка проектов...</p></div>`;
        }
        
        const response = await fetch('/api/projects', {
            headers: { 'X-User-Id': AppState.currentUser?.id || '' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateState('allProjects', safeArray(data.projects));
            updateState('projectsLoaded', true);
            applyProjectFilter();
        } else {
            throw new Error(data.error || 'Ошибка загрузки');
        }
    } catch (error) {
        console.error('Ошибка загрузки проектов:', error);
        showError('Ошибка загрузки проектов');
        
        const projectsContainer = document.getElementById('projectsList');
        if (projectsContainer) {
            projectsContainer.innerHTML = `<div class="empty-projects"><i class="fas fa-exclamation-triangle"></i><p>Ошибка загрузки проектов</p><button onclick="window.loadAllProjects()" class="btn-purple"><i class="fas fa-sync-alt"></i> Повторить</button></div>`;
        }
    }
}
// public/modules/projects.js - в самое начало, после импортов

// Функция декодирования имени файла для отображения
function decodeFilename(filename) {
    if (!filename) return '';
    try {
        // Пробуем декодировать URI компоненты
        let decoded = decodeURIComponent(filename);
        if (decoded !== filename && /[а-яА-Я]/.test(decoded)) {
            return decoded;
        }
    } catch (e) {}
    
    // Убираем типичные кракозябры
    let result = filename;
    const replacements = {
        'Ð': 'С', 'µ': 'м', '°': ' ', 'Ñ': 'С', '': '',
        'â': '-', 'â': '\'', 'â': '"', 'â': '"'
    };
    for (const [from, to] of Object.entries(replacements)) {
        result = result.split(from).join(to);
    }
    
    // Если после замен всё ещё есть кракозябры, показываем как есть
    if (result !== filename) return result;
    return filename;
}
export function applyProjectFilter() {
    if (AppState.currentProjectFilter === 'all') {
        updateState('filteredProjects', [...AppState.allProjects]);
    } else {
        updateState('filteredProjects', AppState.allProjects.filter(p => p.status === AppState.currentProjectFilter));
    }
    
    updateFilterCounts();
    renderProjectsList();
    
    document.querySelectorAll('.project-filter-chip').forEach(chip => {
        chip.classList.remove('active');
        if (chip.dataset.filter === AppState.currentProjectFilter) {
            chip.classList.add('active');
        }
    });
}

function updateFilterCounts() {
    const activeCount = AppState.allProjects.filter(p => p.status === 'active').length;
    const archivedCount = AppState.allProjects.filter(p => p.status === 'archived').length;
    
    const allCountSpan = document.getElementById('filterCountAll');
    const activeCountSpan = document.getElementById('filterCountActive');
    const archivedCountSpan = document.getElementById('filterCountArchived');
    
    if (allCountSpan) allCountSpan.innerText = AppState.allProjects.length;
    if (activeCountSpan) activeCountSpan.innerText = activeCount;
    if (archivedCountSpan) archivedCountSpan.innerText = archivedCount;
}

export function filterProjectsByStatus(status) {
    updateState('currentProjectFilter', status);
    applyProjectFilter();
}

function renderProjectsList() {
    const container = document.getElementById('projectsList');
    if (!container) return;
    
    if (!AppState.filteredProjects.length) {
        let emptyMessage = 'У вас пока нет проектов';
        if (AppState.currentProjectFilter === 'archived') emptyMessage = 'В архиве пока нет проектов';
        if (AppState.currentProjectFilter === 'active') emptyMessage = 'Нет активных проектов';
        container.innerHTML = `<div class="empty-projects"><i class="fas fa-folder-open"></i><p>${emptyMessage}</p><button onclick="window.showNewProjectModal()" class="btn-purple"><i class="fas fa-plus"></i> Создать проект</button></div>`;
        return;
    }
    
    let html = '';
    for (const project of AppState.filteredProjects) {
        const stats = safeObject(project.stats);
        const statusIcon = project.status === 'archived' ? '📦' : '🔄';
        const statusText = project.status === 'archived' ? 'В архиве' : 'В работе';
        const isSelected = AppState.currentProjectId === project.id;
        const lastAnalysis = stats.lastAnalysisDate ? formatRelativeTime(stats.lastAnalysisDate) : 'нет данных';
        
        html += `
            <div class="project-card ${isSelected ? 'selected' : ''}" data-project-id="${project.id}" onclick="window.selectProject(${project.id})">
                <div class="project-header">
                    <div class="project-name"><i class="fas fa-file-alt"></i><span>${escapeHtml(project.project_name)}</span>${isSelected ? '<span class="selected-project-indicator" style="margin-left: 8px;"><i class="fas fa-check-circle"></i> Выбран</span>' : ''}</div>
                    <div class="project-status ${project.status}">${statusIcon} ${statusText}</div>
                </div>
                <div class="project-details">
                    <div class="project-meta"><span><i class="far fa-calendar-alt"></i> ${formatMoscowDateOnly(project.created_at)}</span><span><i class="fas fa-chart-line"></i> ${stats.totalCodes || 0} позиций</span></div>
                    ${project.estimate_name ? `<div class="project-meta"><span><i class="fas fa-tag"></i> ${escapeHtml(project.estimate_name)}</span></div>` : ''}
                    <div class="project-last-analysis"><i class="far fa-clock"></i><span>Последняя загрузка: ${lastAnalysis}</span></div>
                </div>
                <div class="project-actions" onclick="event.stopPropagation()">
                    <button onclick="window.openProject(${project.id})" class="btn-sm btn-primary"><i class="fas fa-eye"></i> Открыть</button>
                    ${project.status !== 'archived' ? 
                        `<button onclick="window.archiveProject(${project.id})" class="btn-sm btn-secondary"><i class="fas fa-archive"></i> В архив</button>` : 
                        `<button onclick="window.restoreProject(${project.id})" class="btn-sm btn-secondary"><i class="fas fa-undo"></i> Восстановить</button>
                         <button onclick="window.deleteProject(${project.id})" class="btn-sm btn-danger"><i class="fas fa-trash"></i> Удалить</button>`
                    }
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

export async function selectProject(projectId) {
    const project = AppState.allProjects.find(p => p.id === projectId);
    if (!project) return;
    
    updateState('currentProjectId', projectId);
    updateState('currentProject', project);
    applyProjectFilter();
    await openProject(projectId);
    showSuccess(`Проект «${project.project_name}» выбран`);
}

export async function openProject(projectId) {
    try {
        showLoading();
        
        const response = await fetch(`/api/projects/${projectId}`, {
            headers: { 'X-User-Id': AppState.currentUser?.id || '' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateState('currentProjectId', projectId);
            updateState('currentProject', data.project);
            switchToWorkspaceTab();
            showProjectWorkspace(data.project, data.currentSession);
            await loadProjectHistory();
        } else {
            throw new Error(data.error || 'Ошибка открытия проекта');
        }
    } catch (error) {
        console.error('Ошибка открытия проекта:', error);
        showError('Ошибка открытия проекта');
    } finally {
        hideLoading();
    }
}

export function showProjectWorkspace(project, session) {
    const noProjectSelected = document.getElementById('noProjectSelected');
    const workspaceContent = document.getElementById('workspaceContent');
    
    if (noProjectSelected) {
        noProjectSelected.classList.add('hidden');
        noProjectSelected.style.display = 'none';
    }
    if (workspaceContent) {
        workspaceContent.classList.remove('hidden');
        workspaceContent.style.display = 'block';
    }
    
    const workspaceHeader = document.querySelector('.project-workspace-header');
    if (workspaceHeader) {
        workspaceHeader.innerHTML = `
            <button class="back-to-projects" onclick="window.backToProjects()"><i class="fas fa-arrow-left"></i> К списку проектов</button>
            <h2><i class="fas fa-folder-open"></i> ${escapeHtml(project.project_name)}</h2>
            <p>Статус: ${project.status === 'archived' ? 'В архиве (только чтение)' : 'В работе'} | Смета: ${escapeHtml(project.estimate_name || '—')}</p>
        `;
    }
    
    const isArchived = project.status === 'archived';
    const fileInput = document.getElementById('fileInput');
    const dropArea = document.getElementById('dropArea');
    const submitBtn = document.getElementById('submitBtn');
    
    if (fileInput) fileInput.disabled = isArchived;
    if (dropArea) {
        if (isArchived) {
            dropArea.classList.add('disabled');
            dropArea.style.cursor = 'not-allowed';
            dropArea.style.opacity = '0.6';
        } else {
            dropArea.classList.remove('disabled');
            dropArea.style.cursor = 'pointer';
            dropArea.style.opacity = '1';
        }
    }
    if (submitBtn) {
        submitBtn.disabled = isArchived || !AppState.currentFile;
        if (isArchived) submitBtn.title = 'Архивные проекты доступны только для чтения';
    }
    
    // Сбрасываем файл
    updateState('currentFile', null);
    if (fileInput) fileInput.value = '';
    if (window.updateFileDisplay) window.updateFileDisplay();
    
    if (session && session.codes && safeArray(session.codes).length > 0) {
        displayResultsFromSession(session);
    } else {
        showEmptyState();
    }
    
    updateState('lastSessionId', session ? session.session_id : null);
    updateState('currentResults', session && session.codes ? safeArray(session.codes) : []);
    updateState('currentViewSessionId', null);
}

// public/modules/projects.js

export async function loadProjectHistory() {
    if (!AppState.currentProjectId) {
        console.warn('⚠️ loadProjectHistory: нет выбранного проекта');
        return;
    }
    
    const historyList = document.getElementById('historyList');
    if (historyList) {
        historyList.innerHTML = `<div style="padding:20px;text-align:center;color:#9ca3af;">
            <i class="fas fa-spinner fa-spin"></i> Загрузка истории...
        </div>`;
    }
    
    try {
        console.log(`📡 Загрузка истории для проекта ${AppState.currentProjectId}`);
        
        const response = await fetch(`/api/projects/${AppState.currentProjectId}/sessions`, {
            headers: { 'X-User-Id': AppState.currentUser?.id || '' }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📊 Получены данные истории:', data);
        
        if (data.success) {
            updateState('projectSessions', safeArray(data.sessions));
            // ВАЖНО: передаём data.sessions напрямую
            renderHistoryList(data.sessions, data.current_session_id);
        } else {
            throw new Error(data.error || 'Ошибка загрузки истории');
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки истории:', error);
        if (historyList) {
            historyList.innerHTML = `
                <div style="padding:40px;text-align:center;">
                    <i class="fas fa-exclamation-circle" style="font-size:32px;color:#ef4444;margin-bottom:12px;"></i>
                    <p style="color:#6b7280;">Ошибка загрузки истории</p>
                    <p style="color:#9ca3af;font-size:13px;margin-top:4px;">${error.message}</p>
                    <button onclick="window.loadProjectHistory()" class="btn-sm btn-primary" style="margin-top:16px;">
                        <i class="fas fa-sync-alt"></i> Повторить
                    </button>
                </div>
            `;
        }
    }
}

// modules/projects.js

// public/modules/projects.js

// public/modules/projects.js

// public/modules/projects.js - функция renderHistoryList

function renderHistoryList(sessions, currentSessionId) {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
    const safeSessions = safeArray(sessions);
    
    if (!safeSessions.length) {
        historyList.innerHTML = `<div style="padding:40px;text-align:center;color:#6b7280;">История анализов пуста</div>`;
        return;
    }
    
    const sortedSessions = [...safeSessions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    let html = '';
    
    for (const session of sortedSessions) {
        const date = formatMoscowDate(session.created_at);
        const isCurrent = session.session_id === currentSessionId;
        const isActive = session.session_id === AppState.currentViewSessionId;
        
        // ОПРЕДЕЛЯЕМ ТИП СЕССИИ
        const isKs2 = session.is_ks2 === 1;
        const sessionType = isKs2 ? '📄 КС-2' : '📊 Смета';
        const sessionTypeBg = isKs2 ? '#fef3c7' : '#e0e7ff';
        const sessionTypeColor = isKs2 ? '#d97706' : '#4f46e5';
        
        // Иконка статуса
        let statusIcon = '✅';
        if (session.status === 'error') statusIcon = '❌';
        else if (session.status === 'started') statusIcon = '⏳';
        
        // Форматируем сумму
        let amountFormatted = '—';
        if (session.total_amount && session.total_amount > 0) {
            amountFormatted = session.total_amount.toLocaleString('ru-RU', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }) + ' ₽';
        }
        
        // Сокращаем имя файла
        let filename = session.filename || 'Без имени';
        if (filename.length > 50) filename = filename.substring(0, 47) + '...';
        
        html += `
            <div class="history-item ${isActive ? 'active' : ''}" 
                 data-session-id="${session.session_id}"
                 data-is-ks2="${isKs2}"
                 onclick="window.viewSessionFromHistory('${session.session_id}')"
                 style="cursor:pointer; border-bottom:1px solid #e5e7eb; transition:all 0.2s; background: ${isActive ? '#eef2ff' : 'white'};">
                <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 16px;">
                    <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
                        <span style="font-size:20px;">${statusIcon}</span>
                        <div style="min-width:0; flex:1;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                                <span style="background:${sessionTypeBg}; color:${sessionTypeColor}; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:600;">
                                    ${sessionType}
                                </span>
                                <span style="font-weight:500; color:#1f2937; font-size:13px; word-break:break-word;">
                                    ${escapeHtml(filename)}
                                </span>
                            </div>
                            <div style="display:flex; gap:12px; font-size:11px; color:#6b7280;">
                                <span>📅 ${date}</span>
                                <span>📊 ${session.total_codes || 0} позиций</span>
                            </div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; font-size:15px; color:#059669; white-space:nowrap;">
                            ${amountFormatted}
                        </div>
                        ${isCurrent ? '<div style="background:#10b981; color:white; padding:2px 8px; border-radius:12px; font-size:9px; margin-top:4px;">Текущий</div>' : ''}
                    </div>
                </div>
            </div>
        `;
    }
    
    historyList.innerHTML = html;
}

// public/modules/projects.js

// public/modules/projects.js

// public/modules/projects.js

// public/modules/projects.js

// public/modules/projects.js

export async function viewSessionFromHistory(sessionId) {
    if (!sessionId) {
        showError('ID сессии не указан');
        return;
    }
    
    console.log(`🔍 Просмотр сессии из истории: ${sessionId}`);
    
    try {
        showLoading();
        updateState('currentViewSessionId', sessionId);
        
        const projectId = AppState.currentProjectId;
        if (!projectId) throw new Error('ID проекта не найден');
        
        // Получаем информацию о сессии
        const sessionInfoResponse = await fetch(`/api/projects/${projectId}/sessions/${sessionId}`, {
            headers: { 'X-User-Id': AppState.currentUser?.id.toString() || '' }
        });
        
        const sessionInfo = await sessionInfoResponse.json();
        
        if (!sessionInfo.success || !sessionInfo.session) {
            throw new Error('Сессия не найдена');
        }
        
        const isKs2 = sessionInfo.session.is_ks2 === 1;
        console.log(`📋 Тип сессии: ${isKs2 ? 'КС-2' : 'Смета'}`);
        
        if (isKs2) {
            // Загружаем КС-2 сессию
            console.log(`📡 Загрузка КС-2 сессии: /api/ks2-sessions/${sessionId}`);
            
            const response = await fetch(`/api/ks2-sessions/${sessionId}`, {
                headers: { 
                    'X-User-Id': AppState.currentUser?.id.toString() || ''
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('📊 Данные КС-2:', data);
            
            if (data.success) {
                // Отображаем КС-2 результаты
                if (window.displayKs2Session) {
                    window.displayKs2Session(data);
                } else {
                    // Fallback отображение
                    displayKs2SessionFallback(data);
                }
                showSuccess(`Загружен КС-2: ${data.session?.filename || 'Без имени'}`);
            } else {
                throw new Error(data.error || 'Ошибка загрузки КС-2 сессии');
            }
        } else {
            // Загружаем сметную сессию
            const response = await fetch(`/api/projects/${projectId}/sessions/${sessionId}`, {
                headers: { 'X-User-Id': AppState.currentUser?.id.toString() || '' }
            });
            
            const data = await response.json();
            
            if (data.success && data.session) {
                if (window.displayResultsFromSession) {
                    window.displayResultsFromSession(data.session);
                }
                showSuccess(`Загружена смета: ${data.session.filename || 'Без имени'}`);
            } else {
                throw new Error(data.error || 'Ошибка загрузки сессии');
            }
        }
        
        updateHistoryActiveState(sessionId);
        
    } catch (error) {
        console.error('❌ Ошибка загрузки сессии:', error);
        showError(`Ошибка загрузки: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// projects.js - в функции displayKs2SessionFallback

function displayKs2SessionFallback(data) {
    console.log('🔄 Используем fallback для отображения КС-2');
    
    const statsEl = document.getElementById('stats');
    const resultsEl = document.getElementById('results');
    const emptyStateEl = document.getElementById('emptyState');
    
    if (statsEl) {
        statsEl.innerHTML = `
            <div style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);border-radius:20px;padding:24px;margin-bottom:24px;">
                <div style="color:rgba(255,255,255,0.8);font-size:13px;">📊 ИТОГОВАЯ СУММА ПО КС-2</div>
                <div style="color:white;font-size:36px;font-weight:800;">${(data.totalAmount || 0).toLocaleString('ru-RU')} ₽</div>
                <div style="color:rgba(255,255,255,0.6);font-size:12px;">📋 Позиций: ${data.items?.length || 0}</div>
            </div>
        `;
        statsEl.classList.remove('hidden');
    }
    
    if (resultsEl) {
        resultsEl.classList.remove('hidden');
        resultsEl.style.display = 'block';
    }
    if (emptyStateEl) {
        emptyStateEl.classList.add('hidden');
        emptyStateEl.style.display = 'none';
    }
    
    // Отображаем таблицу КС-2
    if (typeof window.renderKs2Table === 'function') {
        window.renderKs2Table(data.items);
        console.log('✅ Таблица КС-2 отображена');
    } else {
        console.error('❌ renderKs2Table не определена');
        // Показываем простую таблицу как fallback
        displaySimpleKs2Table(data.items);
    }
}

function displaySimpleKs2Table(items) {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return;
    
    let html = '';
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        html += `
            <tr>
                <td>${item.ks2_position_number || i+1}</td>
                <td>${escapeHtml(item.code || '—')}</td>
                <td>${escapeHtml(item.name || '—')}</td>
                <td>—</td>
                <td style="text-align:right">${(item.total || 0).toLocaleString('ru-RU')} ₽</td>
            </tr>
        `;
    }
    tableBody.innerHTML = html;
}
// Вспомогательная функция для получения проблемных позиций
function getProblemPositions(codes) {
    if (!codes || !codes.length) return [];
    
    return codes.filter(code => {
        if (!code) return false;
        // Текстовая позиция
        if (code.isText === true || code.is_text === 1 || code.matchType === 'text') return true;
        // Запрещённая
        if (code.status === 'Нельзя применять' || code.isRestoration === true || code.is_restoration === 1) return true;
        // Требует внимания
        if (code.status === 'Обратите внимание') return true;
        // Коэффициент не совпадает
        if (code.coefficientMatch === false) return true;
        // Не найден
        if (code.found === false && code.status !== 'Доступен') return true;
        return false;
    });
}

// Вспомогательная функция для отображения статистики сессии
function displaySessionStats(session) {
    const statsEl = document.getElementById('stats');
    if (!statsEl) return;
    
    const codes = session.codes || [];
    const warningCount = codes.filter(c => c.status === 'Обратите внимание' || c.coefficientMatch === false).length;
    const notAllowedCount = codes.filter(c => c.status === 'Нельзя применять' || c.isRestoration).length;
    const textCount = codes.filter(c => c.isText || c.matchType === 'text').length;
    const foundCount = codes.filter(c => c.found !== false && c.status !== 'Нельзя применять' && !c.isText).length;
    
    statsEl.innerHTML = `
        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:20px;padding:24px;margin-bottom:24px;">
            <div style="color:rgba(255,255,255,0.8);font-size:13px;text-transform:uppercase;letter-spacing:1px;">📊 ИТОГОВАЯ СУММА</div>
            <div style="color:white;font-size:36px;font-weight:800;">${(session.total_amount || 0).toLocaleString('ru-RU')} ₽</div>
            <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:8px;">📋 Всего позиций: ${codes.length}</div>
        </div>
        <div class="stats-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
            <div class="stat-item"><div class="stat-value" style="color:#10b981;">${foundCount}</div><div class="stat-label">✅ Найдено</div></div>
            <div class="stat-item"><div class="stat-value" style="color:#f59e0b;">${warningCount}</div><div class="stat-label">⚠️ Внимание</div></div>
            <div class="stat-item"><div class="stat-value" style="color:#ef4444;">${notAllowedCount}</div><div class="stat-label">❌ Запрещены</div></div>
            <div class="stat-item"><div class="stat-value" style="color:#8b5cf6;">${textCount}</div><div class="stat-label">📝 Цена поставщика</div></div>
        </div>
    `;
    statsEl.classList.remove('hidden');
    statsEl.style.display = 'block';
}

// Вспомогательная функция для показа таблицы результатов
function showResultsTable() {
    const resultsEl = document.getElementById('results');
    const emptyStateEl = document.getElementById('emptyState');
    
    if (resultsEl) {
        resultsEl.classList.remove('hidden');
        resultsEl.style.display = 'block';
    }
    if (emptyStateEl) {
        emptyStateEl.classList.add('hidden');
        emptyStateEl.style.display = 'none';
    }
}

// Вспомогательная функция для показа пустого состояния
function showEmptyStateMessage(message) {
    const resultsEl = document.getElementById('results');
    const emptyStateEl = document.getElementById('emptyState');
    
    if (resultsEl) {
        resultsEl.classList.add('hidden');
        resultsEl.style.display = 'none';
    }
    if (emptyStateEl) {
        emptyStateEl.classList.remove('hidden');
        emptyStateEl.style.display = 'block';
        emptyStateEl.innerHTML = `
            <div class="empty-icon"><i class="fas fa-check-circle" style="color:#10b981;font-size:48px;"></i></div>
            <h3 style="font-size:18px;font-weight:600;color:#059669;margin-bottom:8px;">${message}</h3>
        `;
    }
}

// Обновление активного состояния в списке истории
function updateHistoryActiveState(sessionId) {
    const historyItems = document.querySelectorAll('.history-item');
    historyItems.forEach(item => {
        const itemSessionId = item.dataset.sessionId;
        if (itemSessionId === sessionId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

export async function archiveProject(projectId) {
    if (!confirm('Отправить проект в архив?')) return;
    try {
        const response = await fetch(`/api/projects/${projectId}/archive`, {
            method: 'POST',
            headers: { 'X-User-Id': AppState.currentUser?.id || '' }
        });
        const data = await response.json();
        if (data.success) {
            showSuccess('Проект отправлен в архив');
            const project = AppState.allProjects.find(p => p.id === projectId);
            if (project) project.status = 'archived';
            if (AppState.currentProjectId === projectId) {
                updateState('currentProjectId', null);
                updateState('currentProject', null);
            }
            applyProjectFilter();
        }
    } catch (error) {
        showError('Ошибка архивации проекта');
    }
}

export async function restoreProject(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}/restore`, {
            method: 'POST',
            headers: { 'X-User-Id': AppState.currentUser?.id || '' }
        });
        const data = await response.json();
        if (data.success) {
            showSuccess('Проект восстановлен');
            const project = AppState.allProjects.find(p => p.id === projectId);
            if (project) project.status = 'active';
            applyProjectFilter();
        }
    } catch (error) {
        showError('Ошибка восстановления проекта');
    }
}

export async function deleteProject(projectId) {
    if (!confirm('Удалить проект? Это действие нельзя отменить.')) return;
    try {
        const response = await fetch(`/api/projects/${projectId}`, {
            method: 'DELETE',
            headers: { 'X-User-Id': AppState.currentUser?.id || '' }
        });
        const data = await response.json();
        if (data.success) {
            showSuccess('Проект удален');
            updateState('allProjects', AppState.allProjects.filter(p => p.id !== projectId));
            if (AppState.currentProjectId === projectId) {
                updateState('currentProjectId', null);
                updateState('currentProject', null);
            }
            applyProjectFilter();
        }
    } catch (error) {
        showError('Ошибка удаления проекта');
    }
}

export function showNewProjectModal() {
    const modal = document.getElementById('newProjectModal');
    const input = document.getElementById('newProjectName');
    if (modal) {
        if (input) input.value = '';
        modal.style.display = 'flex';
    }
}

export function closeNewProjectModal() {
    const modal = document.getElementById('newProjectModal');
    if (modal) modal.style.display = 'none';
}

export async function createNewProject() {
    const projectName = document.getElementById('newProjectName')?.value.trim();
    if (!projectName) {
        showError('Введите название проекта');
        return;
    }
    closeNewProjectModal();
    
    try {
        const response = await fetch('/api/projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': AppState.currentUser?.id || ''
            },
            body: JSON.stringify({ projectName })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Проект создан. Выберите его и загрузите файл.');
            updateState('projectsLoaded', false);
            updateState('currentProjectFilter', 'all');
            
            document.querySelectorAll('.project-filter-chip').forEach(chip => chip.classList.remove('active'));
            const allChip = document.querySelector('.project-filter-chip[data-filter="all"]');
            if (allChip) allChip.classList.add('active');
            
            await loadAllProjects();
        } else {
            throw new Error(data.error || 'Ошибка создания');
        }
    } catch (error) {
        showError('Ошибка создания проекта');
    }
}