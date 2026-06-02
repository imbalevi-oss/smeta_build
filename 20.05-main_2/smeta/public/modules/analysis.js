// public/modules/analysis.js
// Модуль анализа смет (без КС-2)

import { AppState, updateState } from './state.js';
import { showLoading, hideLoading, showError, showSuccess } from './ui-notifications.js';
import { safeArray, safeNumber, safeObject, computeCategory } from '../utils/helpers.js';
import { filterAndDisplayResults } from './results-renderer.js';
import { loadProjectHistory } from './projects.js';

// Вспомогательная функция для определения МР
function isMR(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase().trim();
    if (lowerText === 'мр') return true;
    if (lowerText.startsWith('мр') || lowerText.startsWith('мр ')) return true;
    if (/\bмр\b/.test(lowerText)) return true;
    if (lowerText.includes('материал')) return true;
    return false;
}

/**
 * Отображение статистики по МР
 */
function displayMrStats(positions, stats, totalMrAmount) {
    const positionsWithMr = positions.filter(p => {
        const mrDetails = p.mrDetails || (p.details || []).filter(d => isMR(d.type)) || [];
        return mrDetails.length > 0 || (p.mrTotalAmount > 0);
    }).length;
    
    const totalMrRows = positions.reduce((sum, p) => {
        const mrDetails = p.mrDetails || (p.details || []).filter(d => isMR(d.type)) || [];
        return sum + mrDetails.length;
    }, 0);
    
    const warningCount = positions.filter(p => p.statusCategory === 'warning').length;
    const notAllowedCount = positions.filter(p => p.statusCategory === 'notallowed').length;
    const textCount = positions.filter(p => p.statusCategory === 'text' || p.isTextPosition === true).length;
    
    const statsHtml = `
        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:20px;padding:24px;margin-bottom:24px;">
            <div style="color:rgba(255,255,255,0.8);font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                📊 ИТОГОВАЯ СУММА МАТЕРИАЛЬНЫХ РЕСУРСОВ (МР)
            </div>
            <div style="color:white;font-size:36px;font-weight:800;">
                ${(totalMrAmount || 0).toLocaleString('ru-RU')} ₽
            </div>
            <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:8px;">
                📦 МР строк: ${totalMrRows} | 📋 Позиций с МР: ${positionsWithMr}
            </div>
        </div>
        
        <div class="stats-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;">
            <div class="stat-item" style="background:white;border-radius:16px;padding:20px;text-align:center;">
                <div style="font-size:28px;font-weight:800;color:#f59e0b;">${warningCount}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:4px;">⚠️ Требуют внимания</div>
            </div>
            <div class="stat-item" style="background:white;border-radius:16px;padding:20px;text-align:center;">
                <div style="font-size:28px;font-weight:800;color:#ef4444;">${notAllowedCount}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:4px;">❌ Нельзя применять</div>
            </div>
            <div class="stat-item" style="background:white;border-radius:16px;padding:20px;text-align:center;">
                <div style="font-size:28px;font-weight:800;color:#8b5cf6;">${textCount}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:4px;">📝 Цена поставщика</div>
            </div>
        </div>
    `;
    
    const statsEl = document.getElementById('stats');
    if (statsEl) {
        statsEl.innerHTML = statsHtml;
        statsEl.classList.remove('hidden');
        statsEl.style.display = 'block';
    }
}

/**
 * Загрузка новой версии файла в проект и выполнение анализа (ТОЛЬКО СМЕТА)
 */
/**
 * Загрузка новой версии файла в проект и выполнение анализа (ТОЛЬКО СМЕТА)
 * Результат: показываем только проблемные позиции (warning, notallowed, text),
 * но детали (включая МР) остаются в объектах этих позиций и доступны для раскрытия.
 */
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
        if (!data || typeof data !== 'object') {
            throw new Error('Некорректный ответ от сервера');
        }
        if (!data.success) {
            throw new Error(data.error || 'Ошибка анализа');
        }

        const positions = safeArray(data.positions);
        const stats = safeObject(data.stats);
        const totalMrAmount = safeNumber(data.totalMrAmount || data.totalAmount, 0);
        const sessionId = data.sessionId || null;

        // Сохраняем все позиции (с деталями) для возможного использования в отчётах
        updateState('detailedPositionsData', positions);
        if (sessionId) updateState('lastSessionId', sessionId);

        // Формируем список проблемных позиций:
        // - warning (коэффициент завышен/занижен, не найден код, обратить внимание)
        // - notallowed (реставрационные, запрещённые)
        // - text (цена поставщика)
        // НЕ добавляем позиции только на основании наличия МР
        const problemPositions = positions.filter(pos => {
            if (!pos) return false;
            // Текстовая позиция – всегда в выдаче
            if (pos.isTextPosition === true) return true;
            // Проблемные категории
            return pos.statusCategory === 'warning' ||
                   pos.statusCategory === 'notallowed' ||
                   pos.statusCategory === 'text';
        });

        updateState('currentResults', problemPositions);

        // Отображаем статистику (сумма МР, количество строк и т.д.) на основе ВСЕХ позиций
        displayMrStats(positions, stats, totalMrAmount);

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
            // Применяем текущий фильтр (по умолчанию 'all', который показывает все problemPositions)
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
                `;
            }
        }

        // Показываем кнопки отчётов и сброса
        const fullReportBtn = document.getElementById('fullReportBtn');
        const excelReportBtn = document.getElementById('excelReportBtn');
        const resetBtn = document.getElementById('resetBtn');
        if (fullReportBtn) fullReportBtn.classList.remove('hidden');
        if (excelReportBtn) excelReportBtn.classList.remove('hidden');
        if (resetBtn) resetBtn.classList.remove('hidden');

        // Устанавливаем фильтр по умолчанию
        updateState('currentFilter', 'all');
        filterAndDisplayResults();

        // Обновляем историю проектов
        if (window.loadProjectHistory) await window.loadProjectHistory();
        updateState('projectsLoaded', false);

        const warningCount = stats.warningCount || 0;
        const notAllowedCount = stats.notAllowedCount || 0;
        const mrRows = stats.totalMrRows || 0;
        const positionsWithMr = stats.positionsWithMr || 0;

        let successMessage = `Анализ завершён: ⚠️ ${warningCount}, ❌ ${notAllowedCount}`;
        if (mrRows > 0) {
            successMessage += `, 📦 МР: ${mrRows} строк (${positionsWithMr} позиций)`;
        }
        showSuccess(successMessage);

    } catch (error) {
        console.error('❌ Ошибка анализа:', error);
        showError(error.message || 'Ошибка при выполнении анализа');
    } finally {
        hideLoading();
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
}

export function displayResultsFromSession(session) {
    if (!session || !session.codes || !session.codes.length) {
        const tableBody = document.getElementById('tableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 60px;">Нет данных для отображения</td></tr>';
        }
        return;
    }

    // Сохраняем в глобальное состояние
    updateState('currentResults', session.codes);
    updateState('lastSessionId', session.session_id);

    // Пересчитываем статусы строго по правилам клиентской фильтрации
    const warningCount = session.codes.filter(c => c.category === 'warning').length;
    const notAllowedCount = session.codes.filter(c => c.category === 'notallowed' || c.is_restoration).length;
    const hasProblems = (warningCount + notAllowedCount) > 0;

    // Формируем HTML статистики
    let statsHtml = `
        <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
            <div class="stat-item">
                <div class="stat-header">
                    <span class="stat-label">⚠️ Требуют внимания</span>
                    <i class="fas fa-exclamation-triangle" style="color: #f59e0b;"></i>
                </div>
                <div class="stat-value" style="color: #f59e0b;">${warningCount}</div>
            </div>
            <div class="stat-item">
                <div class="stat-header">
                    <span class="stat-label">❌ Нельзя применить</span>
                    <i class="fas fa-ban" style="color: #ef4444;"></i>
                </div>
                <div class="stat-value" style="color: #ef4444;">${notAllowedCount}</div>
            </div>
        </div>
    `;

    // Итоговая сумма (если есть)
    if (session.total_amount) {
        statsHtml += `
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 20px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <div style="color: rgba(255,255,255,0.8); font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Итоговая сумма</div>
                <div style="color: white; font-size: 36px; font-weight: 800;">${Number(session.total_amount).toLocaleString('ru-RU')} ₽</div>
            </div>
        `;
    }

    // Обновляем DOM
    const statsEl = document.getElementById('stats');
    const resultsEl = document.getElementById('results');
    const emptyStateEl = document.getElementById('emptyState');

    if (statsEl) {
        statsEl.innerHTML = statsHtml;
        statsEl.classList.remove('hidden');
        statsEl.style.display = 'block';
    }

    if (!hasProblems) {
        if (resultsEl) {
            resultsEl.classList.add('hidden');
            resultsEl.style.display = 'none';
        }
        if (emptyStateEl) {
            emptyStateEl.classList.remove('hidden');
            emptyStateEl.style.display = 'block';
            emptyStateEl.innerHTML = `
                <div class="empty-icon">
                    <i class="fas fa-check-circle" style="color: #10b981; font-size: 48px;"></i>
                </div>
                <h3 style="font-size: 18px; font-weight: 600; color: #059669; margin-bottom: 8px;">✅ Ошибок не найдено</h3>
                <p style="color: #6b7280;">Все коды доступны для применения</p>
            `;
        }
    } else {
        if (resultsEl) {
            resultsEl.classList.remove('hidden');
            resultsEl.style.display = 'block';
        }
        if (emptyStateEl) {
            emptyStateEl.classList.add('hidden');
            emptyStateEl.style.display = 'none';
        }
    }

    // Показываем кнопки действий
    const fullReportBtn = document.getElementById('fullReportBtn');
    const resetBtn = document.getElementById('resetBtn');
    if (fullReportBtn) fullReportBtn.classList.remove('hidden');
    if (resetBtn) resetBtn.classList.remove('hidden');

    // Устанавливаем фильтр «⚠️ Обратите внимание» и отображаем результаты
    updateState('currentFilter', 'warning');
    filterAndDisplayResults();

    // Активируем чип «warning»
    document.querySelectorAll('.chip').forEach(chip => chip.classList.remove('active'));
    const warningChip = document.querySelector('.chip[data-status="warning"]');
    if (warningChip) warningChip.classList.add('active');
}

function displaySessionStats(session, problemCodes) {
    const warningCount = problemCodes.filter(c => c.category === 'warning').length;
    const notAllowedCount = problemCodes.filter(c => c.category === 'notallowed').length;
    const textCount = problemCodes.filter(c => c.category === 'text').length;
    const totalAmount = safeNumber(session.total_amount, 0);
    
    let mrRows = 0;
    let positionsWithMr = 0;
    
    for (const code of session.codes || []) {
        if (code.mrCount > 0) {
            mrRows += code.mrCount;
            positionsWithMr++;
        }
    }
    
    const statsHtml = `
        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:20px;padding:24px;margin-bottom:24px;">
            <div style="color:rgba(255,255,255,0.8);font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                📊 ИТОГОВАЯ СУММА
            </div>
            <div style="color:white;font-size:36px;font-weight:800;">
                ${totalAmount.toLocaleString('ru-RU')} ₽
            </div>
            ${mrRows > 0 ? `
            <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:8px;">
                📦 МР строк: ${mrRows} | 📋 Позиций с МР: ${positionsWithMr}
            </div>
            ` : ''}
        </div>
        
        <div class="stats-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;">
            <div class="stat-item" style="background:white;border-radius:16px;padding:20px;text-align:center;">
                <div style="font-size:28px;font-weight:800;color:#f59e0b;">${warningCount}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:4px;">⚠️ Требуют внимания</div>
            </div>
            <div class="stat-item" style="background:white;border-radius:16px;padding:20px;text-align:center;">
                <div style="font-size:28px;font-weight:800;color:#ef4444;">${notAllowedCount}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:4px;">❌ Нельзя применять</div>
            </div>
            <div class="stat-item" style="background:white;border-radius:16px;padding:20px;text-align:center;">
                <div style="font-size:28px;font-weight:800;color:#8b5cf6;">${textCount}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:4px;">📝 Цена поставщика</div>
            </div>
        </div>
    `;
    
    const statsEl = document.getElementById('stats');
    if (statsEl) {
        statsEl.innerHTML = statsHtml;
        statsEl.classList.remove('hidden');
        statsEl.style.display = 'block';
    }
}

/**
 * Отображение унифицированных результатов (если используется)
 */
export function displayUnifiedResults(data) {
    if (!data) {
        console.warn('displayUnifiedResults: data is undefined');
        showError('Нет данных для отображения');
        showEmptyState();
        return;
    }
    
    if (!data.success) {
        console.warn('displayUnifiedResults: data.success is false', data);
        showError(data.error || 'Ошибка получения данных');
        showEmptyState();
        return;
    }
    
    const positions = safeArray(data.positions);
    const stats = safeObject(data.stats);
    const totalMrAmount = safeNumber(stats.totalMrAmount || data.totalMrAmount || 0, 0);
    
    updateState('detailedPositionsData', positions);
    
    if (data.sessionId) {
        updateState('lastSessionId', data.sessionId);
    }
    
    // СОХРАНЯЕМ ВСЕ ПОЗИЦИИ
    updateState('currentResults', positions);
    
    displayMrStats(positions, stats, totalMrAmount);
    
    const hasProblems = positions.filter(p => p && (p.statusCategory === 'warning' || p.statusCategory === 'notallowed' || p.isTextPosition)).length > 0;
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
            `;
        }
    }
    
    const fullReportBtn = document.getElementById('fullReportBtn');
    const excelReportBtn = document.getElementById('excelReportBtn');
    const resetBtn = document.getElementById('resetBtn');
    
    if (fullReportBtn) fullReportBtn.classList.remove('hidden');
    if (excelReportBtn) excelReportBtn.classList.remove('hidden');
    if (resetBtn) resetBtn.classList.remove('hidden');
    
    updateState('currentFilter', 'all');
}

/**
 * Показ пустого состояния
 */
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
    
    if (fullReportBtn) fullReportBtn.classList.add('hidden');
    if (excelReportBtn) excelReportBtn.classList.add('hidden');
    if (resetBtn) resetBtn.classList.add('hidden');
}

// Экспорт для использования в navigation.js
export { uploadNewVersionToProject as analyzeEstimate };