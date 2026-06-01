// public/modules/analysis-ks2.js
// Модуль анализа и отображения КС-2 (акты выполненных работ)

import { AppState, updateState } from './state.js';
import { showLoading, hideLoading, showError, showSuccess } from './ui-notifications.js';
import { resetKs2 } from './file-handler.js';
import { escapeHtml } from '../utils/helpers.js';

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
        console.error('❌ Ошибка анализа КС-2:', err);
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
    const tableBody = document.getElementById('tableBody');
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
    
    // ТАБЛИЦА: № п/п | Шифр | Наименование | Коэффициент | Сумма
    let tableHtml = '';
    for (let idx = 0; idx < allItems.length; idx++) {
        const item = allItems[idx];
        
        // Объём под наименованием
        let volumeHtml = '';
        if (item.volume) {
            volumeHtml = `<div style="font-size: 11px; color: #059669; margin-top: 4px;">
                <i class="fas fa-calculator"></i> ${escapeHtml(item.volume)}
            </div>`;
        }
        
        // Коэффициент (отдельная колонка)
        let coefficientHtml = '<span style="color: #9ca3af;">—</span>';
        if (item.coefficient && item.coefficient !== 0 && item.coefficient !== 1) {
            const coeffValue = item.coefficient.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
            // Цвет коэффициента: красный если > 1, зелёный если < 1
            const coeffColor = item.coefficient > 1 ? '#ef4444' : '#10b981';
            coefficientHtml = `
                <div style="display: inline-flex; align-items: center; gap: 6px; background: ${coeffColor}10; padding: 4px 12px; border-radius: 20px; border-left: 3px solid ${coeffColor};">
                    <i class="fas fa-chart-line" style="color: ${coeffColor}; font-size: 12px;"></i>
                    <span style="font-weight: 700; color: ${coeffColor};">${coeffValue}</span>
                </div>
            `;
        }
        
        const hasDetails = item.details && item.details.length > 0;
        const details = item.details || [];
        
        tableHtml += `
            <tr class="position-row" data-idx="${idx}" data-position="${item.ks2_position_number}" style="cursor:pointer; border-bottom:1px solid #e2e8f0;">
                <td style="padding: 12px; vertical-align: middle; width: 100px;">
                    ${hasDetails ? `<i class="fas fa-chevron-right toggle-icon" id="toggle-icon-${idx}" style="margin-right:6px; transition:transform 0.2s;"></i>` : '<span style="display:inline-block; width:20px;"></span>'}
                    <span class="position-badge" style="background: #f1f5f9; padding: 4px 10px; border-radius: 20px; font-size: 12px;">${escapeHtml(item.ks2_position_number)}</span>
                    ${item.estimate_position_number ? 
                        `<div style="font-size: 10px; color: #6b7280; margin-top: 4px;">поз. ${escapeHtml(item.estimate_position_number)}</div>` : ''}
                </td>
                <td style="padding: 12px; vertical-align: middle;">
                    <code style="font-family: monospace; font-size: 13px; background: #f3f4f6; padding: 4px 8px; border-radius: 6px;">${escapeHtml(item.code || '—')}</code>
                 </td>
                <td style="padding: 12px; vertical-align: middle;">
                    <div style="font-weight: 500;">${escapeHtml(item.name || '—')}</div>
                    ${volumeHtml}
                 </td>
                <td style="padding: 12px; vertical-align: middle; width: 120px; text-align: center;">
                    ${coefficientHtml}
                 </td>
                <td style="padding: 12px; text-align: right; vertical-align: middle; font-weight: 700; ${item.total === 0 ? 'color: #ef4444;' : 'color: #059669;'} white-space: nowrap;">
                    ${item.total.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                 </td>
             <tr>
        `;
        
        // ДЕТАЛИ (ЗП, ЭМ, МР, НР, СП) - выпадающий список
        if (hasDetails) {
            let detailsHtml = '';
            let detailsTotal = 0;
            
            // Группируем детали по типу
            const grouped = {
                'ЗП': { amount: 0, items: [], color: '#2563eb', icon: 'fa-user-hard-hat' },
                'ЭМ': { amount: 0, items: [], color: '#d97706', icon: 'fa-industry' },
                'МР': { amount: 0, items: [], color: '#059669', icon: 'fa-cubes' },
                'НР': { amount: 0, items: [], color: '#db2777', icon: 'fa-percent' },
                'СП': { amount: 0, items: [], color: '#7c3aed', icon: 'fa-chart-simple' },
                'ЗТР': { amount: 0, items: [], color: '#4b5563', icon: 'fa-clock' },
                'Прочие': { amount: 0, items: [], color: '#6b7280', icon: 'fa-gear' }
            };
            
            for (const detail of details) {
                const type = detail.type.toUpperCase();
                let group = 'Прочие';
                if (type === 'ЗП' || type.startsWith('ЗП ')) group = 'ЗП';
                else if (type === 'ЭМ' || type.startsWith('ЭМ ')) group = 'ЭМ';
                else if (type === 'МР' || type.startsWith('МР ')) group = 'МР';
                else if (type === 'НР' || type.startsWith('НР ')) group = 'НР';
                else if (type === 'СП' || type.startsWith('СП ')) group = 'СП';
                else if (type === 'ЗТР' || type.startsWith('ЗТР ')) group = 'ЗТР';
                
                grouped[group].amount += detail.amount;
                grouped[group].items.push(detail);
                detailsTotal += detail.amount;
            }
            
            let groupedHtml = '';
            for (const [groupName, groupData] of Object.entries(grouped)) {
                if (groupData.amount === 0) continue;
                groupedHtml += `
                    <div style="background: ${groupData.color}08; border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; border-left: 3px solid ${groupData.color};">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-weight: 600; color: ${groupData.color};">
                                <i class="fas ${groupData.icon}" style="margin-right: 6px;"></i>
                                ${groupName}
                            </span>
                            <span style="font-weight: 700; color: ${groupData.color};">
                                ${groupData.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                            </span>
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: #4b5563;">
                            ${groupData.items.map(d => `
                                <span>${escapeHtml(d.type)}: ${d.amount.toLocaleString('ru-RU')} ₽</span>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            tableHtml += `
                <tr id="details-row-${idx}" style="display: none; background: #f8fafc;">
                    <td colspan="5" style="padding: 0;">
                        <div style="margin: 8px 12px 12px 50px; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #eef2f6;">
                            <div style="background: #f1f5f9; padding: 10px 16px; font-weight: 600; font-size: 13px; border-bottom: 1px solid #e2e8f0;">
                                <i class="fas fa-list-ul" style="margin-right: 8px; color: #667eea;"></i> 
                                Состав работ и затрат (ЗП, ЭМ, МР, НР, СП)
                                <span style="float: right; color: #10b981;">
                                    Итого: ${detailsTotal.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                                </span>
                            </div>
                            <div style="padding: 12px;">
                                ${groupedHtml}
                            </div>
                            <div style="background: #eef2ff; padding: 8px 12px; border-top: 1px solid #e2e8f0; text-align: right;">
                                <span style="font-weight: 600;">ВСЕГО ПОЗИЦИЯ:</span>
                                <span style="font-weight: 700; color: #667eea; margin-left: 12px;">
                                    ${item.total.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                                </span>
                            </div>
                        </div>
                      </td>
                  </tr>
            `;
        }
    }
    
    tableBody.innerHTML = tableHtml;
    
    // ЗАГОЛОВКИ ТАБЛИЦЫ
    const thead = document.querySelector('.data-table thead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th style="width: 100px;">№ п/п</th>
                <th style="width: 180px;">Шифр</th>
                <th>Наименование работ</th>
                <th style="width: 120px; text-align: center;">Коэффициент</th>
                <th style="width: 150px; text-align: right;">Сумма, ₽</th>
            </tr>
        `;
    }
    
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
    
    attachRowClickHandlers();
    
    console.log(`📊 Отображено ${allItems.length} позиций КС-2 из ${filesInfo.length} файлов`);
}

/**
 * Прикрепление обработчиков клика для строк
 */
function attachRowClickHandlers() {
    const rows = document.querySelectorAll('.position-row');
    rows.forEach(row => {
        row.removeEventListener('click', handleRowClick);
        row.addEventListener('click', handleRowClick);
    });
}

/**
 * Обработчик клика по строке (раскрытие/скрытие деталей)
 */
function handleRowClick(event) {
    const row = event.currentTarget;
    const idx = row.dataset.idx;
    
    if (idx !== undefined) {
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
    }
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
        console.error('Ошибка экспорта:', err);
        showError(err.message);
    } finally {
        hideLoading();
    }
}