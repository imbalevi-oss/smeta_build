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

export async function loadProjectHistory() {
    if (!AppState.currentProjectId) return;
    
    const historyList = document.getElementById('historyList');
    if (historyList) {
        historyList.innerHTML = `<div style="padding:20px;text-align:center;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i> Загрузка истории...</div>`;
    }
    
    try {
        const response = await fetch(`/api/projects/${AppState.currentProjectId}/sessions`, {
            headers: { 'X-User-Id': AppState.currentUser?.id || '' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateState('projectSessions', safeArray(data.sessions));
            renderHistoryList(data.sessions, data.current_session_id);
        }
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        if (historyList) {
            historyList.innerHTML = `<div style="padding:20px;text-align:center;color:#ef4444;"><i class="fas fa-exclamation-circle"></i> Ошибка загрузки истории</div>`;
        }
    }
}

function renderHistoryList(sessions, currentSessionId) {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
    const safeSessions = safeArray(sessions);
    
    if (!safeSessions.length) {
        historyList.innerHTML = `<div style="padding:40px;text-align:center;"><i class="fas fa-folder-open" style="font-size:32px;color:#cbd5e1;margin-bottom:12px;"></i><p style="color:#6b7280;">История анализов пуста</p><p style="color:#9ca3af;font-size:13px;margin-top:4px;">Загрузите файл для анализа</p></div>`;
        return;
    }
    
    const sortedSessions = [...safeSessions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    let html = '';
    
    for (const session of sortedSessions) {
        const date = formatMoscowDate(session.created_at);
        const isCurrent = session.session_id === currentSessionId;
        const isActive = session.session_id === AppState.currentViewSessionId;
        const statusIcon = session.status === 'completed' ? '✅' : (session.status === 'error' ? '❌' : '⏳');
        const amountFormatted = session.total_amount ? Number(session.total_amount).toLocaleString('ru-RU') + ' ₽' : '—';
        
        html += `
            <div class="history-item ${isActive ? 'active' : ''}" onclick="window.viewSessionFromHistory('${session.session_id}')">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;">
                    <div>
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                            <span style="font-size:20px;">${statusIcon}</span>
                            <div>
                                <div style="font-weight:600;color:#1f2937;">Анализ от ${date}</div>
                                <div style="font-size:12px;color:#6b7280;">${escapeHtml(session.filename || 'Без имени')}</div>
                            </div>
                        </div>
                        <div style="display:flex;gap:16px;font-size:12px;">
                            <span>📊 ${session.total_codes || 0} позиций</span>
                            <span>🎯 ${session.found_codes || 0}/${session.total_codes || 0}</span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700;color:#1f2937;">${amountFormatted}</div>
                        ${isCurrent ? '<div class="position-badge" style="background:#10b981;color:white;font-size:10px;margin-top:4px;">Текущий</div>' : ''}
                        ${session.is_revised ? '<div class="position-badge" style="background:#f59e0b;color:white;font-size:10px;margin-top:4px;">Исправленный</div>' : ''}
                    </div>
                </div>
            </div>
        `;
    }
    
    historyList.innerHTML = html;
}

export async function viewSessionFromHistory(sessionId) {
    try {
        showLoading();
        updateState('currentViewSessionId', sessionId);
        
        const response = await fetch(`/api/projects/${AppState.currentProjectId}/sessions/${sessionId}`, {
            headers: { 'X-User-Id': AppState.currentUser?.id || '' }
        });
        
        const data = await response.json();
        
        if (data.success && data.session) {
            displayResultsFromSession(data.session);
            await loadProjectHistory();
            showSuccess('Загружен результат анализа');
        } else {
            throw new Error(data.error || 'Ошибка загрузки сессии');
        }
    } catch (error) {
        console.error('Ошибка загрузки сессии:', error);
        showError('Ошибка загрузки результата анализа');
    } finally {
        hideLoading();
    }
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