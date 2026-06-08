// public/modules/analysis-ks2.js
// Модуль анализа и отображения КС-2 (акты выполненных работ)

import { AppState, updateState } from './state.js';
import { showLoading, hideLoading, showError, showSuccess } from './ui-notifications.js';
import { resetKs2 } from './file-handler.js';
import { escapeHtml } from '../utils/helpers.js';
import { renderKs2Table } from './results-renderer.js';

/**
 * Анализ загруженных файлов КС-2
 */
export async function analyzeKs2() {
    if (!AppState.ks2Files || AppState.ks2Files.length === 0) {
        showError('Выберите хотя бы один файл КС-2');
        return;
    }
    
    if (!AppState.currentProjectId) {
        showError('Сначала выберите проект');
        return;
    }
    
    const formData = new FormData();
    for (const file of AppState.ks2Files) {
        formData.append('ks2Files', file);
    }
    formData.append('projectId', AppState.currentProjectId);
    
    const btn = document.getElementById('analyzeKs2Btn');
    const originalText = btn?.innerHTML || 'Анализировать КС-2';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Анализ КС-2...';
    }
    
    showLoading();
    
    try {
        const response = await fetch('/api/analyze-ks2', {
            method: 'POST',
            headers: { 'X-User-Id': AppState.currentUser?.id || '' },
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Ошибка анализа КС-2');
        }
        
        const successCount = data.results.filter(r => r.success).length;
        const errorCount = data.results.filter(r => !r.success).length;
        
        let message = `Анализ КС-2 завершён: ${successCount} файлов обработано`;
        if (errorCount > 0) message += `, ${errorCount} с ошибками`;
        message += `, всего позиций ${data.totalItems}, общая сумма ${data.totalAmountFormatted} ₽`;
        
        showSuccess(message);
        
        displayKs2Results(data.results, data.totalAmount);
        
        if (window.loadProjectHistory) {
            await window.loadProjectHistory();
        }
        
        resetKs2();
        
        updateState('currentResultsType', 'ks2');
        updateState('lastKs2SessionId', data.sessionIds?.[0] || null);
        
    } catch (err) {
      
        showError(err.message);
    } finally {
        hideLoading();
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

/**
 * Отображение результатов анализа КС-2
 * Колонки: № п/п | Шифр | Наименование | Коэффициент | Сумма
 * Детали (ЗП, ЭМ, МР, НР, СП) - в выпадающем списке
 */
function displayKs2Results(results, totalAmount) {
    const resultsContainer = document.getElementById('results');
    const statsContainer = document.getElementById('stats');
    const emptyState = document.getElementById('emptyState');
    const fullReportBtn = document.getElementById('fullReportBtn');
    const excelReportBtn = document.getElementById('excelReportBtn');
    const resetBtn = document.getElementById('resetBtn');
    
    let allItems = [];
    let filesInfo = [];
    let errorFiles = [];
    
    for (const fileResult of results) {
        if (!fileResult.success) {
            errorFiles.push({ name: fileResult.fileName, error: fileResult.error || 'Ошибка парсинга' });
            continue;
        }
        
        filesInfo.push({
            name: fileResult.fileName,
            itemsCount: fileResult.totalItems,
            amount: fileResult.totalAmount,
            startRow: fileResult.startRow,
            detectedColumns: fileResult.detectedColumns
        });
        
        if (fileResult.items && fileResult.items.length) {
            allItems.push(...fileResult.items);
        }
    }
    
    if (allItems.length === 0) {
        if (emptyState) {
            emptyState.classList.remove('hidden');
            emptyState.innerHTML = `
                <div class="empty-icon">
                    <i class="fas fa-file-excel"></i>
                </div>
                <h3 style="font-size: 18px; font-weight: 600; color: #4b5563; margin-bottom: 8px;">
                    Нет данных КС-2
                </h3>
                <p style="color: #9ca3af;">Загрузите файлы КС-2 для анализа</p>
                ${errorFiles.length ? 
                    `<div style="margin-top: 16px; padding: 12px; background: #fee2e2; border-radius: 12px;">
                        <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                        <strong style="color: #991b1b;"> Ошибки при обработке:</strong>
                        <div style="margin-top: 8px; font-size: 13px;">
                            ${errorFiles.map(f => `<div>📄 ${escapeHtml(f.name)}: ${escapeHtml(f.error)}</div>`).join('')}
                        </div>
                    </div>` : ''
                }
            `;
            emptyState.style.display = 'block';
        }
        if (resultsContainer) resultsContainer.classList.add('hidden');
        if (statsContainer) statsContainer.classList.add('hidden');
        return;
    }
    
    const zeroSumCount = allItems.filter(i => i.total === 0).length;
    const withCodeCount = allItems.filter(i => i.code && i.code !== '').length;
    const withDetailsCount = allItems.filter(i => i.details && i.details.length > 0).length;
    const withCoefficientCount = allItems.filter(i => i.coefficient && i.coefficient !== 0 && i.coefficient !== 1).length;
    const coeffMismatchCount = allItems.filter(i => i.coefficientMatch === false).length;
    
    const statsHtml = `
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 20px; padding: 24px; margin-bottom: 24px;">
            <div style="color: rgba(255,255,255,0.8); font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                📊 ИТОГОВАЯ СУММА ПО КС-2
            </div>
            <div style="color: white; font-size: 36px; font-weight: 800;">
                ${totalAmount.toLocaleString('ru-RU')} ₽
            </div>
            <div style="color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 8px;">
                📄 Файлов: ${filesInfo.length} | 📋 Позиций: ${allItems.length}
                ${zeroSumCount > 0 ? ` | ⚠️ С нулевой суммой: ${zeroSumCount}` : ''}
                ${withDetailsCount > 0 ? ` | 📦 С детализацией: ${withDetailsCount}` : ''}
                ${withCoefficientCount > 0 ? ` | 📊 С коэффициентом: ${withCoefficientCount}` : ''}
                ${coeffMismatchCount > 0 ? ` | ⚠️ Расхождения: ${coeffMismatchCount}` : ''}
            </div>
        </div>
        
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
            <div class="stat-item" style="background: white; border-radius: 16px; padding: 20px; text-align: center; border: 1px solid #e5e7eb;">
                <div style="font-size: 28px; font-weight: 800; color: #f59e0b;">${filesInfo.length}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">📄 Файлов</div>
            </div>
            <div class="stat-item" style="background: white; border-radius: 16px; padding: 20px; text-align: center; border: 1px solid #e5e7eb;">
                <div style="font-size: 28px; font-weight: 800; color: #10b981;">${allItems.length}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">📋 Позиций</div>
            </div>
            <div class="stat-item" style="background: white; border-radius: 16px; padding: 20px; text-align: center; border: 1px solid #e5e7eb;">
                <div style="font-size: 28px; font-weight: 800; color: #3b82f6;">${withCodeCount}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">🔢 С шифром</div>
            </div>
            <div class="stat-item" style="background: white; border-radius: 16px; padding: 20px; text-align: center; border: 1px solid #e5e7eb;">
                <div style="font-size: 28px; font-weight: 800; color: ${zeroSumCount > 0 ? '#ef4444' : '#10b981'};">${zeroSumCount}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">⚠️ Сумма = 0</div>
            </div>
        </div>
    `;
    
    statsContainer.innerHTML = statsHtml;
    statsContainer.classList.remove('hidden');
    statsContainer.style.display = 'block';

    renderKs2Table(allItems);
    
    resultsContainer.classList.remove('hidden');
    resultsContainer.style.display = 'block';
    emptyState.classList.add('hidden');
    emptyState.style.display = 'none';

    if (fullReportBtn) fullReportBtn.classList.add('hidden');
    if (excelReportBtn) excelReportBtn.classList.remove('hidden');
    if (resetBtn) resetBtn.classList.remove('hidden');
    
    updateState('currentResults', allItems);
    updateState('currentFilter', 'all');
    updateState('currentResultsType', 'ks2');
    
    // Информация о файлах
    const resultsHeader = document.querySelector('.results-header');
    if (resultsHeader && filesInfo.length > 0) {
        const existingInfo = document.querySelector('.files-info');
        if (existingInfo) existingInfo.remove();
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'files-info';
        infoDiv.style.cssText = 'margin-top: 12px; font-size: 12px; color: #6b7280; display: flex; flex-wrap: wrap; gap: 12px;';
        
        infoDiv.innerHTML = filesInfo.map(f => `
            <span style="background: #f3f4f6; padding: 6px 14px; border-radius: 20px; display: inline-flex; align-items: center; gap: 8px;">
                📄 ${escapeHtml(f.name.length > 35 ? f.name.substring(0, 32) + '…' : f.name)}
                <span style="background: white; padding: 2px 8px; border-radius: 16px; font-weight: 600;">${f.itemsCount} поз.</span>
                <span style="background: white; padding: 2px 8px; border-radius: 16px; font-weight: 600; color: #059669;">${(f.amount || 0).toLocaleString('ru-RU')} ₽</span>
            </span>
        `).join('');
        
        resultsHeader.appendChild(infoDiv);
    }
    
    if (errorFiles.length > 0) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'margin-top: 16px; padding: 12px 16px; background: #fee2e2; border-radius: 12px; border-left: 4px solid #ef4444;';
        errorDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                <strong style="color: #991b1b;">Ошибки при обработке файлов:</strong>
            </div>
            <div style="margin-top: 8px; font-size: 13px; display: flex; flex-direction: column; gap: 4px;">
                ${errorFiles.map(f => `<div>📄 ${escapeHtml(f.name)}: <span style="color: #dc2626;">${escapeHtml(f.error)}</span></div>`).join('')}
            </div>
        `;
        
        const statsGrid = document.querySelector('.stats-grid');
        if (statsGrid && statsGrid.parentNode) {
            statsGrid.parentNode.insertBefore(errorDiv, statsGrid.nextSibling);
        }
    }
    
}

/**
 * Отображение КС-2 сессии из истории
 */
export function displayKs2Session(data) {
    if (!data || !data.success) {
        showError('Не удалось загрузить сессию КС-2');
        return;
    }

    const items = data.items || [];
    const totalAmount = data.totalAmount ?? data.session?.total_amount ?? items.reduce((sum, i) => sum + (i.total || 0), 0);
    const fileName = data.session?.filename || data.session?.estimate_name || 'КС-2';

    displayKs2Results([{
        success: true,
        fileName,
        items,
        totalItems: items.length,
        totalAmount
    }], totalAmount);

    updateState('currentResults', items);
    updateState('currentResultsType', 'ks2');
    updateState('lastSessionId', data.session?.session_id || null);
    updateState('currentViewSessionId', data.session?.session_id || null);
}

/**
 * Экспорт результатов КС-2 в Excel
 */
export async function exportKs2ToExcel() {
    const items = AppState.currentResults;
    
    if (!items || items.length === 0) {
        showError('Нет данных для экспорта');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch('/api/export-ks2-excel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': AppState.currentUser?.id || ''
            },
            body: JSON.stringify({
                items: items,
                fileName: `ks2_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`
            })
        });
        
        if (!response.ok) {
            throw new Error('Ошибка экспорта');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ks2_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
        showSuccess('Экспорт КС-2 выполнен');
        
    } catch (err) {
   
        showError(err.message);
    } finally {
        hideLoading();
    }
}