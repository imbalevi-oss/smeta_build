// components/navigation.js
import { AppState, updateState } from '../modules/state.js';
import { applyProjectFilter, openProject } from '../modules/projects.js';
import { showError } from '../modules/ui-notifications.js';
import { uploadNewVersionToProject as analyzeEstimate } from '../modules/analysis.js';
import { analyzeKs2 } from '../modules/analysis-ks2.js';
import { updateFileDisplay, updateKs2Display, resetKs2, resetWorkspace } from '../modules/file-handler.js';

export function switchToProjectsTab() {
    const projectsTab = document.getElementById('projectsTab');
    const workspaceTab = document.getElementById('workspaceTab');
    const tabProjects = document.getElementById('tabProjects');
    const tabWorkspace = document.getElementById('tabWorkspace');
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
    });
    
    if (tabProjects) tabProjects.classList.add('active');
    if (projectsTab) {
        projectsTab.classList.add('active');
        projectsTab.style.display = 'block';
    }
    if (workspaceTab) {
        workspaceTab.classList.remove('active');
        workspaceTab.style.display = 'none';
    }
    updateState('currentTab', 'projects');
}

export function switchToWorkspaceTab() {
    const projectsTab = document.getElementById('projectsTab');
    const workspaceTab = document.getElementById('workspaceTab');
    const tabProjects = document.getElementById('tabProjects');
    const tabWorkspace = document.getElementById('tabWorkspace');
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
    });
    
    if (tabWorkspace) tabWorkspace.classList.add('active');
    if (workspaceTab) {
        workspaceTab.classList.add('active');
        workspaceTab.style.display = 'block';
    }
    if (projectsTab) {
        projectsTab.classList.remove('active');
        projectsTab.style.display = 'none';
    }
    updateState('currentTab', 'workspace');
}

export function backToProjects() {
    switchToProjectsTab();
    if (applyProjectFilter) applyProjectFilter();
}

export function initFilters() {
    const filterBtns = document.querySelectorAll('.chip');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const status = btn.getAttribute('data-status');
            if (status) {
                updateState('currentFilter', status);
                if (window.filterAndDisplayResults) window.filterAndDisplayResults();
            }
        });
    });
}

export function switchCheckMode(mode) {
    updateState('currentCheckMode', 'universal');
    const modeUniversal = document.getElementById('modeUniversal');
    if (modeUniversal) modeUniversal.classList.add('active');
    const modeDescriptionSpan = document.querySelector('#modeDescription span');
    if (modeDescriptionSpan) {
        modeDescriptionSpan.textContent = 'Универсальный режим: автоматическое определение колонок по заголовкам';
    }
}

export function initEventListeners() {
    // Переключение вкладок
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            if (!tabName) return;
            if (tab.classList.contains('disabled')) {
                if (tabName === 'workspace') showError('Сначала выберите проект из списка');
                return;
            }
            if (tabName === 'projects') {
                switchToProjectsTab();
            } else if (tabName === 'workspace') {
                if (AppState.currentProjectId && AppState.currentProject) {
                    if (openProject) openProject(AppState.currentProjectId);
                } else {
                    showError('Сначала выберите проект из списка');
                    switchToProjectsTab();
                }
            }
        });
    });
    
    // Кнопка анализа сметы
    const analyzeEstimateBtn = document.getElementById('analyzeEstimateBtn');
    if (analyzeEstimateBtn) analyzeEstimateBtn.addEventListener('click', analyzeEstimate);
    
    // Кнопка анализа КС-2
    const analyzeKs2Btn = document.getElementById('analyzeKs2Btn');
    if (analyzeKs2Btn) analyzeKs2Btn.addEventListener('click', analyzeKs2);
    
    // Зона сметы
    const fileInput = document.getElementById('fileInput');
    const dropArea = document.getElementById('dropArea');
    if (dropArea && fileInput) {
        const stopPropagation = (e) => { e.preventDefault(); e.stopPropagation(); };
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dropArea.addEventListener(ev, stopPropagation));
        ['dragenter', 'dragover'].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.add('drag-over')));
        ['dragleave', 'drop'].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.remove('drag-over')));
        dropArea.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                updateState('currentFile', files[0]);
                if (fileInput) fileInput.files = files;
                updateFileDisplay();
            }
        });
        dropArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files.length > 0) {
                updateState('currentFile', fileInput.files[0]);
                updateFileDisplay();
            }
        });
    }
    
    // Зона КС-2
    const ks2Input = document.getElementById('ks2Input');
    const ks2Area = document.getElementById('ks2Area');
    if (ks2Area && ks2Input) {
        const stopPropagation = (e) => { e.preventDefault(); e.stopPropagation(); };
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => ks2Area.addEventListener(ev, stopPropagation));
        ['dragenter', 'dragover'].forEach(ev => ks2Area.addEventListener(ev, () => ks2Area.classList.add('drag-over')));
        ['dragleave', 'drop'].forEach(ev => ks2Area.addEventListener(ev, () => ks2Area.classList.remove('drag-over')));
        ks2Area.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const newFiles = [...AppState.ks2Files];
                for (const file of files) newFiles.push(file);
                updateState('ks2Files', newFiles);
                updateKs2Display();
            }
        });
        ks2Area.addEventListener('click', (e) => {
            if (e.target === ks2Area || e.target.closest('.upload-icon, .upload-title, .upload-subtitle')) {
                ks2Input.click();
            }
        });
        ks2Input.addEventListener('change', () => {
            if (ks2Input.files && ks2Input.files.length > 0) {
                const newFiles = [...AppState.ks2Files];
                for (const file of ks2Input.files) newFiles.push(file);
                updateState('ks2Files', newFiles);
                updateKs2Display();
                ks2Input.value = '';
            }
        });
    }
    
    // Модальное окно проекта
    const newProjectModal = document.getElementById('newProjectModal');
    if (newProjectModal) {
        newProjectModal.addEventListener('click', (e) => {
            if (e.target === newProjectModal && window.closeNewProjectModal) window.closeNewProjectModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && newProjectModal.style.display === 'flex' && window.closeNewProjectModal) window.closeNewProjectModal();
        });
    }
    
    // Кнопки отчётов
    const resetBtn = document.getElementById('resetBtn');
    const fullReportBtn = document.getElementById('fullReportBtn');
    const excelReportBtn = document.getElementById('excelReportBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => { if (window.resetWorkspace) window.resetWorkspace(); });
    if (fullReportBtn) fullReportBtn.addEventListener('click', () => { if (window.generateFullReport) window.generateFullReport(); });
    if (excelReportBtn) excelReportBtn.addEventListener('click', () => { if (window.downloadExcelReport) window.downloadExcelReport(); });
    
    // Фильтры проектов
    document.querySelectorAll('.project-filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const filter = chip.dataset.filter;
            if (filter && window.filterProjectsByStatus) window.filterProjectsByStatus(filter);
        });
    });
    
    // Режим проверки
    const modeUniversal = document.getElementById('modeUniversal');
    if (modeUniversal) modeUniversal.addEventListener('click', () => { if (window.switchCheckMode) window.switchCheckMode('universal'); });
    
    // Логин
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    if (loginUsername) loginUsername.addEventListener('keypress', (e) => { if (e.key === 'Enter' && window.login) window.login(); });
    if (loginPassword) loginPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter' && window.login) window.login(); });
}