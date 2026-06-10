// public/modules/analysis.js
// Модуль анализа смет (без КС-2)

import { AppState, updateState } from './state.js';
import { showLoading, hideLoading, showError, showSuccess } from './ui-notifications.js';
import { safeArray, safeNumber, safeObject, escapeHtml } from '../utils/helpers.js';
import { filterAndDisplayResults, showEstimateResultsView } from './results-renderer.js';
import { loadProjectHistory } from './projects.js';

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function isProblemPosition(pos) {
    if (!pos) return false;
    if (pos.isTextPosition === true || pos.isText === true || pos.is_text === 1) return true;
    if (pos.statusCategory === 'text') return true;
    return pos.statusCategory === 'warning' || pos.statusCategory === 'notallowed';
}

/**
 * Отображение общей статистики (главная сумма – общая по смете)
 * Дополнительно показывает количество МР строк и позиций с МР.
 */
function displayStats(positions, stats, totalAmount, skippedInfo = null) {
    const totalMrRows = stats.totalMrRows || 0;
    const positionsWithMr = stats.positionsWithMr || 0;
    const warningCount = positions.filter(p => p.statusCategory === 'warning').length;
    const notAllowedCount = positions.filter(p => p.statusCategory === 'notallowed').length;
    const textCount = positions.filter(p => p.statusCategory === 'text' || p.isTextPosition === true).length;

    let skippedHtml = '';
    if (skippedInfo && skippedInfo.skippedCount > 0) {
        skippedHtml = `
           
        `;
    }

    const statsHtml = `
        ${skippedHtml}
     
        
    
    `;
    
    const statsEl = document.getElementById('stats');
    if (statsEl) {
        statsEl.innerHTML = statsHtml;
        statsEl.classList.remove('hidden');
        statsEl.style.display = 'block';
    }
}

// ==================== ЗАГРУЗКА НОВОЙ ВЕРСИИ ФАЙЛА ====================

export async function uploadNewVersionToProject() {
    if (!AppState.currentProjectId) {
        showError('Сначала выберите проект');
        return;
    }
    if (!AppState.currentFile) {
        showError('Выберите файл сметы');
        return;
    }
    const ext = AppState.currentFile.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
        showError('Только Excel файлы (.xlsx, .xls)');
        return;
    }

    const formData = new FormData();
    formData.append('file', AppState.currentFile);
    formData.append('projectId', AppState.currentProjectId);
    formData.append('isRevised', 'false');

    const submitBtn = document.getElementById('analyzeEstimateBtn');
    const originalText = submitBtn?.innerHTML || 'Анализировать';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка и анализ...';
    }
    showLoading();

    try {
        const response = await fetch('/api/detailed-analyze-unified', {
            method: 'POST',
            headers: { 'X-User-Id': AppState.currentUser?.id || '' },
            body: formData
        });

        if (!response.ok) {
            let errorMessage = `Ошибка сервера: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
                const errorText = await response.text();
                errorMessage = errorText.substring(0, 200);
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        if (!data || typeof data !== 'object') throw new Error('Некорректный ответ от сервера');
        if (!data.success) throw new Error(data.error || 'Ошибка анализа');

        const positions = safeArray(data.positions);
        // Нормализуем коэффициенты
        positions.forEach(pos => {
            if (pos.actualCoefficient !== null && pos.actualCoefficient !== undefined) {
                pos.actualCoefficient = Math.round(pos.actualCoefficient * 100) / 100;
            }
            if (pos.expectedCoefficient !== null && pos.expectedCoefficient !== undefined) {
                pos.expectedCoefficient = Math.round(pos.expectedCoefficient * 100) / 100;
            }
            if (pos.coefficient !== null && pos.coefficient !== undefined) {
                pos.coefficient = Math.round(pos.coefficient * 100) / 100;
            }
        });

        const stats = safeObject(data.stats);
        const totalAmount = safeNumber(data.totalAmount, 0);
        const sessionId = data.sessionId || null;

        updateState('detailedPositionsData', positions);
        if (sessionId) updateState('lastSessionId', sessionId);

        // Проблемные позиции для отображения
        const problemPositions = positions.filter(isProblemPosition);
        updateState('currentResults', problemPositions);

        // Информация о пропущенных позициях
        const skippedInfo = {
            skippedCount: stats.skippedCount || 0,
            skippedReasonGroups: stats.skippedReasonGroups || {},
            skippedExamples: stats.skippedExamples || []
        };

        // Логируем в консоль информацию о пропусках
        if (skippedInfo.skippedCount > 0) {

        }

        // Отображаем статистику: общая сумма + дополнительная информация о МР и пропусках
        displayStats(positions, stats, totalAmount, skippedInfo);

        const hasProblems = problemPositions.length > 0;
        const resultsEl = document.getElementById('results');
        const emptyEl = document.getElementById('emptyState');

        if (hasProblems) {
            if (resultsEl) {
                resultsEl.classList.remove('hidden');
                resultsEl.style.display = 'block';
            }
            if (emptyEl) {
                emptyEl.classList.add('hidden');
                emptyEl.style.display = 'none';
            }
            showEstimateResultsView();
            filterAndDisplayResults();
        } else {
            if (resultsEl) {
                resultsEl.classList.add('hidden');
                resultsEl.style.display = 'none';
            }
            if (emptyEl) {
                emptyEl.classList.remove('hidden');
                emptyEl.style.display = 'block';
                emptyEl.innerHTML = `
                    <div class="empty-icon">
                        <i class="fas fa-check-circle" style="color:#10b981;font-size:48px;"></i>
                    </div>
                    <h3 style="font-size:18px;font-weight:600;color:#4b5563;margin-bottom:8px;">
                        ✅ Ошибок не найдено
                    </h3>
                    <p style="color:#9ca3af;">Все коды в порядке</p>
                    ${skippedInfo.skippedCount > 0 ? `
                    <div style="margin-top: 16px; padding: 12px; background: #fef3c7; border-radius: 12px; max-width: 400px; margin-left: auto; margin-right: auto;">
                        <i class="fas fa-info-circle" style="color: #d97706;"></i>
                        <span style="color: #92400e; font-size: 13px;">Пропущено ${skippedInfo.skippedCount} позиций с некорректными шифрами</span>
                    </div>
                    ` : ''}
                `;
            }
        }

        // Показываем кнопки отчётов
        const fullReportBtn = document.getElementById('fullReportBtn');
        const excelReportBtn = document.getElementById('excelReportBtn');
        const resetBtn = document.getElementById('resetBtn');
        const copyLetterBtn = document.getElementById('copyLetterBtn');
        if (fullReportBtn) fullReportBtn.classList.remove('hidden');
        if (excelReportBtn) excelReportBtn.classList.remove('hidden');
        if (resetBtn) resetBtn.classList.remove('hidden');
        if (copyLetterBtn) copyLetterBtn.classList.remove('hidden');

        updateState('currentFilter', 'all');
        filterAndDisplayResults();

        if (window.loadProjectHistory) await window.loadProjectHistory();
        updateState('projectsLoaded', false);

        const warningCount = stats.warningCount || 0;
        const notAllowedCount = stats.notAllowedCount || 0;
        const mrRows = stats.totalMrRows || 0;
        const positionsWithMr = stats.positionsWithMr || 0;
        const skipped = stats.skippedCount || 0;

        let successMessage = `Анализ завершён: ⚠️ ${warningCount}, ❌ ${notAllowedCount}`;
        if (mrRows > 0) successMessage += `, 📦 МР: ${mrRows} строк (${positionsWithMr} позиций)`;
        if (skipped > 0) successMessage += `, ⏭️ пропущено: ${skipped} (некорректные шифры)`;
        showSuccess(successMessage);

    } catch (error) {
      
        showError(error.message || 'Ошибка при выполнении анализа');
    } finally {
        hideLoading();
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
}

// ==================== ОТОБРАЖЕНИЕ РЕЗУЛЬТАТОВ ИЗ СЕССИИ ====================

export function displayResultsFromSession(session) {
    if (!session || !session.codes || !session.codes.length) {
        showEmptyState();
        return;
    }

    const allPositions = safeArray(session.codes);
    updateState('lastSessionId', session.session_id);
    updateState('currentResultsType', null);
    updateState('detailedPositionsData', allPositions);

    // Общая сумма берётся из сессии (total_amount) или вычисляется
    const totalAmount = safeNumber(session.total_amount, allPositions.reduce((sum, p) => sum + safeNumber(p.total_amount || p.totalAmount, 0), 0));
    const totalMrRows = session.total_mr_rows ?? allPositions.reduce((sum, p) => sum + (p.mrDetails?.length || 0), 0);
    const positionsWithMr = session.positions_with_mr ?? allPositions.filter(p => (p.mrDetails?.length || 0) > 0).length;

    const stats = {
        totalMrRows,
        positionsWithMr,
        warningCount: allPositions.filter(p => p.statusCategory === 'warning').length,
        notAllowedCount: allPositions.filter(p => p.statusCategory === 'notallowed').length,
        textCount: allPositions.filter(p => p.statusCategory === 'text' || p.isTextPosition).length,
        skippedCount: 0, // Из сессии нет информации о пропусках
        skippedReasonGroups: {},
        skippedExamples: []
    };

    const problemPositions = allPositions.filter(isProblemPosition);
    updateState('currentResults', problemPositions);

    // Отображаем общую сумму
    displayStats(allPositions, stats, totalAmount, null);

    const hasProblems = problemPositions.length > 0;
    const resultsEl = document.getElementById('results');
    const emptyStateEl = document.getElementById('emptyState');

    if (hasProblems) {
        showEstimateResultsView();
        if (resultsEl) {
            resultsEl.classList.remove('hidden');
            resultsEl.style.display = 'block';
        }
        if (emptyStateEl) {
            emptyStateEl.classList.add('hidden');
            emptyStateEl.style.display = 'none';
        }
        updateState('currentFilter', 'all');
        filterAndDisplayResults();
        document.querySelectorAll('.chip').forEach(chip => chip.classList.remove('active'));
        const allChip = document.querySelector('.chip[data-status="all"]');
        if (allChip) allChip.classList.add('active');
    } else {
        if (resultsEl) {
            resultsEl.classList.add('hidden');
            resultsEl.style.display = 'none';
        }
        if (emptyStateEl) {
            emptyStateEl.classList.remove('hidden');
            emptyStateEl.style.display = 'block';
            emptyStateEl.innerHTML = `
                <div class="empty-icon">
                    <i class="fas fa-check-circle" style="color:#10b981;font-size:48px;"></i>
                </div>
                <h3 style="font-size:18px;font-weight:600;color:#4b5563;margin-bottom:8px;">
                    ✅ Ошибок не найдено
                </h3>
                <p style="color:#9ca3af;">Все коды в порядке</p>
            `;
        }
    }

    const fullReportBtn = document.getElementById('fullReportBtn');
    const excelReportBtn = document.getElementById('excelReportBtn');
    const resetBtn = document.getElementById('resetBtn');
    const copyLetterBtn = document.getElementById('copyLetterBtn');
    if (fullReportBtn) fullReportBtn.classList.remove('hidden');
    if (excelReportBtn) excelReportBtn.classList.remove('hidden');
    if (resetBtn) resetBtn.classList.remove('hidden');
    if (copyLetterBtn) copyLetterBtn.classList.remove('hidden');
}

export function showEmptyState() {
    const emptyState = document.getElementById('emptyState');
    const results = document.getElementById('results');
    const stats = document.getElementById('stats');
    
    if (emptyState) {
        emptyState.classList.remove('hidden');
        emptyState.style.display = 'block';
        emptyState.innerHTML = `
            <div class="empty-icon">
                <i class="fas fa-file-excel"></i>
            </div>
            <h3 style="font-size:18px;font-weight:600;color:#4b5563;margin-bottom:8px;">
                Нет данных
            </h3>
            <p style="color:#9ca3af;">Загрузите файл сметы и нажмите «Анализировать»</p>
        `;
    }
    
    if (results) {
        results.classList.add('hidden');
        results.style.display = 'none';
    }
    
    if (stats) {
        stats.classList.add('hidden');
        stats.style.display = 'none';
    }
    
    const fullReportBtn = document.getElementById('fullReportBtn');
    const excelReportBtn = document.getElementById('excelReportBtn');
    const resetBtn = document.getElementById('resetBtn');
    const copyLetterBtn = document.getElementById('copyLetterBtn');
    
    if (fullReportBtn) fullReportBtn.classList.add('hidden');
    if (excelReportBtn) excelReportBtn.classList.add('hidden');
    if (resetBtn) resetBtn.classList.add('hidden');
    if (copyLetterBtn) copyLetterBtn.classList.add('hidden');
}

// Экспорт для совместимости
export { uploadNewVersionToProject as analyzeEstimate };