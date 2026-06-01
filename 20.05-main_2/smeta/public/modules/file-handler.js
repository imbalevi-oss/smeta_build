// modules/file-handler.js

import { AppState, updateState } from './state.js';
import { showError } from './ui-notifications.js';
import { escapeHtml } from '../utils/helpers.js';
import { filterAndDisplayResults } from './results-renderer.js';

// ========== ФУНКЦИИ ДЛЯ СМЕТЫ ==========
function updateEstimateButton() {
    const btn = document.getElementById('analyzeEstimateBtn');
    if (btn) btn.disabled = !AppState.currentFile;
}

export function updateFileDisplay() {
    const dropText = document.getElementById('dropText');
    const uploadCard = document.getElementById('dropArea');
    
    if (AppState.currentFile) {
        if (dropText) dropText.innerHTML = `<i class="fas fa-check-circle" style="color:#10b981;"></i> ${escapeHtml(AppState.currentFile.name)}`;
        if (uploadCard) {
            uploadCard.style.borderColor = '#10b981';
            uploadCard.style.background = '#f0fdf4';
        }
    } else {
        if (dropText) dropText.innerHTML = 'Перетащите файл сметы сюда';
        if (uploadCard) {
            uploadCard.style.borderColor = '#e5e7eb';
            uploadCard.style.background = 'white';
        }
    }
    updateEstimateButton();
}

export function resetFile() {
    updateState('currentFile', null);
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    updateFileDisplay();
    
    const resultsEl = document.getElementById('results');
    const emptyEl = document.getElementById('emptyState');
    const statsEl = document.getElementById('stats');
    const fullReportBtn = document.getElementById('fullReportBtn');
    const resetBtn = document.getElementById('resetBtn');
    const excelReportBtn = document.getElementById('excelReportBtn');
    
    if (resultsEl) {
        resultsEl.classList.add('hidden');
        resultsEl.style.display = 'none';
    }
    if (emptyEl) {
        emptyEl.classList.remove('hidden');
        emptyEl.style.display = 'block';
        emptyEl.innerHTML = `<div class="empty-icon"><i class="fas fa-file-excel"></i></div><h3 style="font-size:18px;font-weight:600;color:#4b5563;margin-bottom:8px;">Нет данных</h3><p style="color:#9ca3af;">Загрузите файл сметы и нажмите «Анализировать»</p>`;
    }
    if (statsEl) {
        statsEl.classList.add('hidden');
        statsEl.style.display = 'none';
    }
    if (fullReportBtn) fullReportBtn.classList.add('hidden');
    if (excelReportBtn) excelReportBtn.classList.add('hidden');
    if (resetBtn) resetBtn.classList.add('hidden');
    
    updateState('lastSessionId', null);
    updateState('currentResults', []);
    updateState('detailedPositionsData', null);
    
    const summaryContainer = document.getElementById('reasonsSummary');
    if (summaryContainer) summaryContainer.classList.add('hidden');
}

// ========== ФУНКЦИИ ДЛЯ КС‑2 ==========
function updateKs2Button() {
    const btn = document.getElementById('analyzeKs2Btn');
    if (btn) btn.disabled = !AppState.ks2Files || AppState.ks2Files.length === 0;
}

export function updateKs2Display() {
    const ks2DropText = document.getElementById('ks2DropText');
    const ks2Card = document.getElementById('ks2Area');
    const ks2FileList = document.getElementById('ks2FileList');
    const hasFiles = AppState.ks2Files && AppState.ks2Files.length > 0;
    
    if (hasFiles) {
        if (ks2DropText) ks2DropText.innerHTML = `<i class="fas fa-check-circle" style="color:#10b981;"></i> Выбрано файлов: ${AppState.ks2Files.length}`;
        if (ks2Card) {
            ks2Card.style.borderColor = '#10b981';
            ks2Card.style.background = '#f0fdf4';
        }
        ks2FileList.innerHTML = AppState.ks2Files.map((file, idx) => `
            <div class="ks2-file-item" data-idx="${idx}">
                <i class="fas fa-file-excel"></i>
                <span class="ks2-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                <button class="ks2-file-remove" data-idx="${idx}"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
        
        document.querySelectorAll('.ks2-file-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                removeKs2File(idx);
            });
        });
    } else {
        if (ks2DropText) ks2DropText.innerHTML = 'Перетащите файлы КС-2 сюда';
        if (ks2Card) {
            ks2Card.style.borderColor = '#fde047';
            ks2Card.style.background = '#fefce8';
        }
        ks2FileList.innerHTML = '';
    }
    updateKs2Button();
}

function removeKs2File(idx) {
    const newFiles = [...AppState.ks2Files];
    newFiles.splice(idx, 1);
    updateState('ks2Files', newFiles);
    updateKs2Display();
}

export function resetKs2() {
    updateState('ks2Files', []);
    const ks2Input = document.getElementById('ks2Input');
    if (ks2Input) ks2Input.value = '';
    updateKs2Display();
}

// ========== ОБЩИЙ СБРОС ==========
export function resetWorkspace() {
    resetFile();
    resetKs2();
    updateState('currentViewSessionId', null);
    if (window.loadProjectHistory) window.loadProjectHistory();
    updateState('detailedPositionsData', null);
    updateState('currentFilter', 'all');
    
    document.querySelectorAll('.chip').forEach(chip => {
        chip.classList.remove('active');
        if (chip.dataset.status === 'all') chip.classList.add('active');
    });
    
    const summaryContainer = document.getElementById('reasonsSummary');
    if (summaryContainer) summaryContainer.classList.add('hidden');
}