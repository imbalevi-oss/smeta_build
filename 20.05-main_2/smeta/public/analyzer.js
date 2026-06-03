// analyzer.js

import { AppState, updateState, resetState } from './modules/state.js';
import { 
    showLoading, hideLoading, showError, showSuccess, showLoginError 
} from './modules/ui-notifications.js';
import { login, logout, checkAuth } from './modules/auth.js';
import { 
    loadAllProjects, selectProject, openProject, archiveProject, restoreProject, 
    deleteProject, filterProjectsByStatus, viewSessionFromHistory, 
    showNewProjectModal, closeNewProjectModal, createNewProject, loadProjectHistory
} from './modules/projects.js';
import { updateFileDisplay, resetFile, resetWorkspace, updateKs2Display, resetKs2 } from './modules/file-handler.js';
import { uploadNewVersionToProject, displayResultsFromSession, displayUnifiedResults, showEmptyState } from './modules/analysis.js';
import { filterAndDisplayResults, renderUnifiedTable } from './modules/results-renderer.js';
import { generateFullReport, downloadExcelReport } from './modules/reports.js';
import { 
    switchToProjectsTab, switchToWorkspaceTab, backToProjects, 
    initFilters, switchCheckMode, initEventListeners 
} from './components/navigation.js';
import { analyzeKs2, exportKs2ToExcel } from './modules/analysis-ks2.js';
import { compareEstimateWithKs2, exportComparisonToExcel } from './modules/comparison.js';

// Глобальные функции
window.login = login;
window.logout = logout;
window.selectProject = selectProject;
window.openProject = openProject;
window.archiveProject = archiveProject;
window.restoreProject = restoreProject;
window.deleteProject = deleteProject;
window.showNewProjectModal = showNewProjectModal;
window.closeNewProjectModal = closeNewProjectModal;
window.createNewProject = createNewProject;
window.backToProjects = backToProjects;
window.filterProjectsByStatus = filterProjectsByStatus;
window.loadAllProjects = loadAllProjects;
window.generateFullReport = generateFullReport;
window.downloadExcelReport = downloadExcelReport;
window.resetWorkspace = resetWorkspace;
window.switchCheckMode = switchCheckMode;
window.viewSessionFromHistory = viewSessionFromHistory;
window.uploadNewVersionToProject = uploadNewVersionToProject;
window.updateFileDisplay = updateFileDisplay;
window.filterAndDisplayResults = filterAndDisplayResults;
window.loadProjectHistory = loadProjectHistory;
window.showEmptyState = showEmptyState;
window.checkAuth = checkAuth;
window.analyzeKs2 = analyzeKs2;
window.exportKs2ToExcel = exportKs2ToExcel;
window.compareEstimateWithKs2 = compareEstimateWithKs2;
window.exportComparisonToExcel = exportComparisonToExcel;
window.updateKs2Display = updateKs2Display;
window.resetKs2 = resetKs2;

// Функция для раскрытия деталей
window.togglePositionDetails = function(idx) {
    const detailsRow = document.getElementById(`details-row-${idx}`);
    const icon = document.getElementById(`toggle-icon-${idx}`);
    
    if (detailsRow && icon) {
        if (detailsRow.style.display === 'none' || detailsRow.style.display === '') {
            detailsRow.style.display = 'table-row';
            icon.classList.remove('fa-chevron-right');
            icon.classList.add('fa-chevron-down');
        } else {
            detailsRow.style.display = 'none';
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-right');
        }
    }
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Приложение загружено');
    checkAuth();
    initFilters();
    initEventListeners();
});