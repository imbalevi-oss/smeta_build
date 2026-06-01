// modules/results-renderer.js
// Рендеринг результатов анализа (с поддержкой МР, текстовых позиций и объёмов)

import { AppState, updateState } from './state.js';
import { safeArray, safeNumber, escapeHtml, formatNumber, getProblemReason, safeString } from '../utils/helpers.js';

// Глобальные переменные
let activePopup = null;

/**
 * Форматирование коэффициента (убираем лишние нули)
 */
function formatCoefficient(value) {
    if (value === null || value === undefined) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return String(value);
    let formatted = num.toFixed(3).replace(/\.?0+$/, '');
    if (formatted === '') formatted = '0';
    return formatted;
}

/**
 * Получение HTML для отображения коэффициента
 */
function getCoefficientStatusHtml(actualCoeff, expectedCoeff, code, position) {
    if (!actualCoeff && actualCoeff !== 0) return '';
    
    const actual = parseFloat(actualCoeff);
    const actualFormatted = formatCoefficient(actual);
    
    if (!expectedCoeff || expectedCoeff === 1) {
        if (actual === 1) {
            return `<div style="margin-top: 6px; font-size: 11px; color: #10b981;">
                        <i class="fas fa-check"></i> Коэф: ${actualFormatted}
                    </div>`;
        } else if (actual > 1) {
            return `<div style="margin-top: 6px; font-size: 11px; color: #ef4444;">
                        <i class="fas fa-exclamation-triangle"></i> Коэф: ${actualFormatted} (норма 1)
                    </div>`;
        } else {
            return `<div style="margin-top: 6px; font-size: 11px; color: #f59e0b;">
                        <i class="fas fa-arrow-down"></i> Коэф: ${actualFormatted} (норма 1)
                    </div>`;
        }
    }
    
    const expected = parseFloat(expectedCoeff);
    const expectedFormatted = formatCoefficient(expected);
    const isMatch = Math.abs(actual - expected) <= 0.01;
    
    if (isMatch) {
        return `<div style="margin-top: 6px; font-size: 11px; color: #10b981;">
                    <i class="fas fa-check-circle"></i> Коэф: ${actualFormatted} = ${expectedFormatted}
                </div>`;
    } else {
        const diff = actual - expected;
        const sign = diff > 0 ? '+' : '';
        const diffFormatted = formatCoefficient(Math.abs(diff));
        return `<div class="coefficient-status" data-actual="${actual}" data-expected="${expected}" data-code="${escapeHtml(String(code))}" data-position="${position}" style="margin-top: 6px; font-size: 11px; cursor: pointer;">
                    <span style="color: #ef4444; font-weight: 500;">⚠️ Коэф: ${actualFormatted}</span>
                    <span style="color: #64748b;"> (норма ${expectedFormatted})</span>
                    <span style="color: ${diff > 0 ? '#ef4444' : '#f59e0b'}; margin-left: 4px;">(${sign}${diffFormatted})</span>
                </div>`;
    }
}

/**
 * Закрытие активного попапа
 */
function closeActivePopup() {
    if (activePopup) {
        activePopup.remove();
        activePopup = null;
    }
}

/**
 * Показ детального попапа с визуализацией коэффициента
 */
function showCoefficientPopup(event, actual, expected, code, position) {
    event.stopPropagation();
    closeActivePopup();
    
    const actualFormatted = formatCoefficient(actual);
    const expectedFormatted = expected ? formatCoefficient(expected) : '1';
    const isMatch = expected ? Math.abs(actual - expected) <= 0.01 : actual === 1;
    
    let severityClass = '';
    let severityText = '';
    let recommendation = '';
    
    if (!expected || expected === 1) {
        if (actual > 1.3) {
            severityClass = 'critical';
            severityText = 'КРИТИЧЕСКОЕ ЗАВЫШЕНИЕ';
            recommendation = 'Коэффициент значительно превышает норму. Требуется срочное обоснование.';
        } else if (actual > 1.1) {
            severityClass = 'warning';
            severityText = 'ЗНАЧИТЕЛЬНОЕ ЗАВЫШЕНИЕ';
            recommendation = 'Рекомендуется предоставить обоснование применения повышенного коэффициента.';
        } else if (actual > 1.01) {
            severityClass = 'warning';
            severityText = 'НЕБОЛЬШОЕ ЗАВЫШЕНИЕ';
            recommendation = 'Убедитесь, что применение обосновано условиями работ.';
        } else if (actual < 0.9) {
            severityClass = 'info';
            severityText = 'ПОНИЖАЮЩИЙ КОЭФФИЦИЕНТ';
            recommendation = 'Понижающий коэффициент применен. Проверьте корректность.';
        } else {
            severityClass = 'perfect';
            severityText = 'В НОРМЕ';
            recommendation = 'Коэффициент соответствует норме, обоснование не требуется.';
        }
    } else {
        const deviation = ((actual - expected) / expected) * 100;
        
        if (deviation > 30) {
            severityClass = 'critical';
            severityText = 'КРИТИЧЕСКОЕ ОТКЛОНЕНИЕ';
            recommendation = `Коэффициент превышает норму на ${deviation.toFixed(1)}%. Требуется срочная проверка.`;
        } else if (deviation > 15) {
            severityClass = 'critical';
            severityText = 'СИЛЬНОЕ ОТКЛОНЕНИЕ';
            recommendation = `Коэффициент превышает норму на ${deviation.toFixed(1)}%. Необходимо обоснование.`;
        } else if (deviation > 5) {
            severityClass = 'warning';
            severityText = 'УМЕРЕННОЕ ОТКЛОНЕНИЕ';
            recommendation = `Коэффициент отличается от нормы на ${deviation.toFixed(1)}%. Рекомендуется проверка.`;
        } else if (deviation < -15) {
            severityClass = 'warning';
            severityText = 'ЗНАЧИТЕЛЬНОЕ ЗАНИЖЕНИЕ';
            recommendation = `Коэффициент ниже нормы на ${Math.abs(deviation).toFixed(1)}%. Проверьте полноту применения коэффициентов.`;
        } else if (deviation < -5) {
            severityClass = 'info';
            severityText = 'НЕБОЛЬШОЕ ЗАНИЖЕНИЕ';
            recommendation = `Коэффициент ниже нормы на ${Math.abs(deviation).toFixed(1)}%.`;
        } else if (isMatch) {
            severityClass = 'perfect';
            severityText = 'ТОЧНО СООТВЕТСТВУЕТ';
            recommendation = 'Коэффициент полностью соответствует норме.';
        } else {
            severityClass = 'perfect';
            severityText = 'В ДОПУСТИМЫХ ПРЕДЕЛАХ';
            recommendation = 'Отклонение в пределах допустимого (до 5%).';
        }
    }
    
    const colors = {
        perfect: { bg: '#dcfce7', border: '#10b981', text: '#166534' },
        good: { bg: '#d1fae5', border: '#34d399', text: '#065f46' },
        warning: { bg: '#fed7aa', border: '#f59e0b', text: '#9a3412' },
        critical: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
        info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }
    };
    
    const color = colors[severityClass] || colors.info;
    
    let deviationHtml = '';
    if (expected && expected !== 1 && !isMatch) {
        const diff = actual - expected;
        const diffPercent = (diff / expected) * 100;
        const sign = diff > 0 ? '+' : '';
        deviationHtml = `
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0;">
                <span style="font-size: 12px; color: #475569;">Отклонение:</span>
                <span style="font-weight: 600; color: ${diff > 0 ? '#ef4444' : '#f59e0b'};">
                    ${sign}${formatCoefficient(Math.abs(diff))} (${sign}${diffPercent.toFixed(1)}%)
                </span>
            </div>
        `;
    }
    
    const popup = document.createElement('div');
    popup.className = 'coefficient-popup';
    popup.style.cssText = `
        position: fixed;
        z-index: 10000;
        background: white;
        border-radius: 16px;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
        padding: 16px 20px;
        min-width: 280px;
        max-width: 360px;
        animation: fadeIn 0.2s ease;
        border: 1px solid #e2e8f0;
    `;
    
    popup.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-chart-line" style="color: #667eea;"></i>
                <span style="font-weight: 600; font-size: 14px;">Анализ коэффициента</span>
            </div>
            <button class="close-popup-btn" style="background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 16px;">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        ${code ? `<div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">Код: <code style="font-family: monospace;">${escapeHtml(String(code))}</code></div>` : ''}
        ${position ? `<div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">Позиция: №${escapeHtml(String(position))}</div>` : ''}
        
        <div style="background: ${color.bg}; border-radius: 12px; padding: 12px; margin-bottom: 12px; border-left: 3px solid ${color.border};">
            <div style="font-size: 13px; font-weight: 600; color: ${color.text}; margin-bottom: 8px;">
                ${severityText}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span style="font-size: 12px; color: #475569;">Фактический:</span>
                <span style="font-weight: 700; font-size: 20px; color: ${color.text};">${actualFormatted}</span>
            </div>
            ${expected ? `
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px;">
                <span style="font-size: 12px; color: #475569;">Ожидаемый:</span>
                <span style="font-weight: 500; font-size: 14px;">${expectedFormatted}</span>
            </div>
            ` : ''}
            ${deviationHtml}
        </div>
        
        <div style="font-size: 12px; color: #475569; line-height: 1.5;">
            ${recommendation}
        </div>
    `;
    
    const rect = event.target.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
    
    let top = rect.bottom + scrollTop + 8;
    let left = rect.left + scrollLeft;
    
    const popupHeight = 320;
    const viewportHeight = window.innerHeight;
    if (top + popupHeight > scrollTop + viewportHeight) {
        top = rect.top + scrollTop - popupHeight - 8;
    }
    
    if (left + 360 > scrollLeft + window.innerWidth) {
        left = scrollLeft + window.innerWidth - 380;
    }
    if (left < scrollLeft) left = scrollLeft + 10;
    
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
    
    const closeBtn = popup.querySelector('.close-popup-btn');
    closeBtn.addEventListener('click', () => {
        closeActivePopup();
    });
    
    document.body.appendChild(popup);
    activePopup = popup;
    
    const clickOutsideHandler = (e) => {
        if (!popup.contains(e.target) && !event.target.contains(e.target)) {
            closeActivePopup();
            document.removeEventListener('click', clickOutsideHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', clickOutsideHandler), 100);
}

/**
 * Основная функция рендеринга таблицы
 */
/**
 * Основная функция рендеринга таблицы
 */
export function renderUnifiedTable(positions) {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return;
    
    const safePositions = safeArray(positions);
    
    if (safePositions.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:60px;color:#9ca3af;">✅ Проблемные позиции не найдены</td></tr>';
        return;
    }
    
    let html = '';
    for (let idx = 0; idx < safePositions.length; idx++) {
        const pos = safePositions[idx];
        if (!pos) continue;
        
        // Полная сумма позиции
        const totalCost = safeNumber(pos.totalAmount, 0);
        const positionNumber = pos.positionNumber || (idx + 1);
        const code = pos.code || '—';
        const name = safeString(pos.name || pos.description || '', '').substring(0, 100);
        
        const totalFormatted = totalCost.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        // ОТОБРАЖАЕМ ВЫЧИСЛЕННЫЙ ОБЪЁМ (количество × единица измерения)
        const volumeDisplay = pos.formattedVolume || '';
        const volumeHtml = volumeDisplay ? `<div style="font-size:11px; color:#059669; margin-top:4px;">
            <i class="fas fa-calculator"></i> ${volumeDisplay}
        </div>` : '';
        
        // Определяем статус (для текстовых позиций свой)
        let reason = getProblemReason(pos);
        let statusColor = '#f59e0b';
        let statusBg = '#fef3c7';
        
        if (pos.isTextPosition || pos.isText) {
            let messageText = '📝 Текстовая строка - цена поставщика';
            if (pos.hasDetails && pos.sumAllDetails > 0) {
                messageText = `📝 Текстовая позиция с детализацией: ${(pos.amountFromRow || 0).toLocaleString('ru-RU')} ₽ (строка) + ${(pos.sumAllDetails || 0).toLocaleString('ru-RU')} ₽ (детали) = ${totalCost.toLocaleString('ru-RU')} ₽`;
            } else if (pos.amountFromRow > 0) {
                messageText = `📝 Цена поставщика: ${totalCost.toLocaleString('ru-RU')} ₽`;
            } else if (pos.sumAllDetails > 0) {
                messageText = `📝 Цена поставщика (из деталей): ${totalCost.toLocaleString('ru-RU')} ₽`;
            }
            
            reason = {
                severity: 'info',
                type: 'text',
                icon: '📝',
                title: pos.hasDetails ? `Цена поставщика (${pos.details?.length || 0} дет.)` : 'Цена поставщика',
                message: messageText
            };
            statusColor = '#8b5cf6';
            statusBg = '#ede9fe';
        } else if (reason.severity === 'error') {
            statusColor = '#dc2626';
            statusBg = '#fee2e2';
        } else if (reason.severity === 'info') {
            statusColor = '#3b82f6';
            statusBg = '#dbeafe';
        }
        
        const actualCoeff = pos.actualCoefficient || pos.actual_coefficient || null;
        const expectedCoeff = pos.expectedCoefficient || pos.expected_coefficient || null;
        
        // ❌ УБРАНО: отображение количества МР
        const mrBadge = '';
        
        // ❌ УБРАНО: отображение суммы МР
        const mrAmountHtml = '';
        
        let coefficientHtml = '';
        if (!pos.isTextPosition && !pos.isText) {
            if (actualCoeff && actualCoeff !== 1) {
                coefficientHtml = getCoefficientStatusHtml(actualCoeff, expectedCoeff, code, positionNumber);
            } else if (actualCoeff === 1) {
                coefficientHtml = `<div style="margin-top: 6px; font-size: 11px; color: #10b981;">
                                        <i class="fas fa-check"></i> Коэф: 1
                                    </div>`;
            }
        }
        
        const hasDetails = pos.mrDetails && pos.mrDetails.length > 0;
        
        html += `
            <tr class="position-row" data-idx="${idx}" data-position="${positionNumber}" data-code="${escapeHtml(code)}" style="cursor:pointer; border-bottom:1px solid #e2e8f0;">
                <td style="padding:12px; vertical-align:middle; width:100px;">
                    ${hasDetails ? `<i class="fas fa-chevron-right toggle-icon" id="toggle-icon-${idx}" style="margin-right:6px; transition:transform 0.2s;"></i>` : '<span style="display:inline-block; width:20px;"></span>'}
                    <span class="position-badge">${escapeHtml(String(positionNumber))}</span>
                   </td>
                <td style="padding:12px; font-family:monospace; font-weight:500; vertical-align:middle; word-break:break-word;">
                    ${escapeHtml(code)}
                   </td>
                <td style="padding:12px; vertical-align:middle;">
                    <div style="font-weight:500; margin-bottom: 4px;">
                        ${escapeHtml(name)}${mrBadge}
                    </div>
                    ${volumeHtml}
                    ${mrAmountHtml}
                   </td>
                <td style="padding:12px; vertical-align:middle;">
                    <div>
                        <span style="display:inline-flex; align-items:center; gap:6px; background:${statusBg}; color:${statusColor}; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600;">
                            ${reason.icon} ${reason.title}
                        </span>
                        ${coefficientHtml}
                    </div>
                   </td>
                <td style="padding:12px; vertical-align:middle; max-width:350px;">
                    <div style="font-size:12px; color:#4b5563; line-height:1.4;">${escapeHtml(reason.message)}</div>
                   </td>
                <td style="padding:12px; text-align:right; font-weight:700; white-space:nowrap;">
                    ${totalFormatted} ₽
                   </td>
               </tr>
        `;
        
        // Детальные строки (только МР) - оставляем без изменений
        const details = safeArray(pos.mrDetails);
        if (details.length > 0) {
            let detailsHtml = '';
            let mrTotalAmount = 0;
            
            for (const detail of details) {
                const amount = safeNumber(detail.amount);
                const qty = safeNumber(detail.quantity);
                const unit = detail.unit || '';
                const materialName = detail.originalType || detail.type || 'Материал';
                
                let detailVolume = '';
                if (qty > 0 && unit) {
                    const unitMatch = unit.match(/(\d+(?:[.,]\d+)?)/);
                    if (unitMatch) {
                        const unitValue = parseFloat(unitMatch[1].replace(',', '.'));
                        const volume = qty * unitValue;
                        const unitName = unit.replace(/\d+(?:[.,]\d+)?\s*/, '');
                        detailVolume = `${volume.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unitName}`;
                    } else {
                        detailVolume = `${qty.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unit}`;
                    }
                }
                
                mrTotalAmount += amount;
                
                detailsHtml += `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:10px 12px 10px 40px;">
                            <span style="display:inline-block; width:28px;">
                                <i class="fas fa-cube" style="color:#667eea;"></i>
                            </span>
                           </td>
                        <td style="padding:10px 12px; font-size:12px; color:#334155;">
                            ${escapeHtml(materialName.substring(0, 80))}
                           </td>
                        <td style="padding:10px 12px; text-align:right; font-size:12px;">
                            ${detailVolume || '-'}
                           </td>
                        <td style="padding:10px 12px; text-align:right; font-weight:600; font-size:12px;">
                            ${amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                           </td>
                       </tr>
                `;
            }
            
            html += `
                <tr id="details-row-${idx}" style="display:none; background:#f8fafc;">
                    <td colspan="6" style="padding:0;">
                        <div style="margin:8px 12px 12px 60px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #eef2f6;">
                            <div style="background:#f1f5f9; padding:10px 16px; font-weight:600; font-size:13px; border-bottom:1px solid #e2e8f0;">
                                <i class="fas fa-boxes" style="margin-right:8px; color:#667eea;"></i> 
                                Материальные ресурсы (МР) — ${details.length} позиций
                                <span style="float:right; color:#10b981;">
                                    Итого МР: ${mrTotalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                                </span>
                            </div>
                            <div style="overflow-x: auto;">
                                <table style="width:100%; border-collapse:collapse; font-size:12px;">
                                    <thead>
                                        <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                                            <th style="padding:10px 12px; text-align:left; width:40px;"></th>
                                            <th style="padding:10px 12px; text-align:left;">Наименование материала</th>
                                            <th style="padding:10px 12px; text-align:right;">Объём</th>
                                            <th style="padding:10px 12px; text-align:right;">Сумма, ₽</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${detailsHtml}
                                    </tbody>
                                    <tfoot style="background:#f1f5f9; border-top:2px solid #e2e8f0;">
                                        <tr>
                                            <td colspan="3" style="padding:10px 12px; text-align:right; font-weight:600;">ВСЕГО МАТЕРИАЛОВ:</td>
                                            <td style="padding:10px 12px; text-align:right; font-weight:700; color:#10b981;">
                                                ${mrTotalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                                              </td>
                                        </tr>
                                        <tr style="background:#eef2ff;">
                                            <td colspan="3" style="padding:10px 12px; text-align:right; font-weight:600;">ИТОГО ПОЗИЦИЯ (с другими затратами):</td>
                                            <td style="padding:10px 12px; text-align:right; font-weight:700; color:#667eea;">
                                                ${totalFormatted} ₽
                                              </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                       </td>
                    </tr>
            `;
        }
    }
    
    tableBody.innerHTML = html;
    
    setTimeout(() => {
        attachCoefficientClickHandlers();
        attachRowClickHandlers();
    }, 50);
}

/**
 * Прикрепление обработчиков клика для коэффициентов
 */
function attachCoefficientClickHandlers() {
    const coeffElements = document.querySelectorAll('.coefficient-status');
    coeffElements.forEach(el => {
        el.removeEventListener('click', handleCoefficientClick);
        el.addEventListener('click', handleCoefficientClick);
    });
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
 * Обработчик клика по коэффициенту
 */
function handleCoefficientClick(event) {
    event.stopPropagation();
    const el = event.currentTarget;
    const actual = parseFloat(el.dataset.actual);
    const expected = el.dataset.expected ? parseFloat(el.dataset.expected) : null;
    const code = el.dataset.code || '';
    const position = el.dataset.position || '';
    
    if (!isNaN(actual)) {
        showCoefficientPopup(event, actual, expected, code, position);
    }
}

/**
 * Обработчик клика по строке (раскрытие/скрытие деталей)
 */
function handleRowClick(event) {
    if (event.target.closest('.coefficient-status')) {
        return;
    }
    
    const row = event.currentTarget;
    const idx = row.dataset.idx;
    
    if (idx !== undefined) {
        window.togglePositionDetails(parseInt(idx));
    }
}

/**
 * Фильтрация и отображение результатов
 */
export function filterAndDisplayResults() {
    if (!AppState.currentResults) {
        updateState('currentResults', []);
    }
    
    if (!Array.isArray(AppState.currentResults) || AppState.currentResults.length === 0) {
        const tableBody = document.getElementById('tableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:60px;color:#9ca3af;">Нет данных для отображения</td></tr>';
        }
        return;
    }
    
    let filtered = [...AppState.currentResults];
    
    switch (AppState.currentFilter) {
        case 'warning':
            filtered = AppState.currentResults.filter(c => {
                if (!c) return false;
                // Исключаем текстовые из фильтра warning
                if (c.isTextPosition === true) return false;
                const reason = getProblemReason(c);
                return reason.severity === 'warning' && reason.type !== 'text' && reason.type !== 'not_found';
            });
            break;
        case 'notallowed':
            filtered = AppState.currentResults.filter(c => {
                if (!c) return false;
                if (c.isTextPosition === true) return false;
                const reason = getProblemReason(c);
                return reason.severity === 'error' || c.isRestoration || c.status === 'Нельзя применять';
            });
            break;
        case 'textonly':
            // ФИКС: показываем ВСЕ текстовые позиции, даже с нулевой суммой
            filtered = AppState.currentResults.filter(c => {
                if (!c) return false;
                return c.isTextPosition === true || c.isText === true || c.statusCategory === 'text';
            });
            break;
        case 'all':
        default:
            filtered = AppState.currentResults.filter(c => c);
            break;
    }
    
    console.log(`📊 Фильтр ${AppState.currentFilter}: показано ${filtered.length} из ${AppState.currentResults.length} позиций`);
    
    renderUnifiedTable(filtered);
    showReasonsSummary(filtered);
    updateFilterChipsActive();
}

/**
 * Обновление активных фильтров
 */
function updateFilterChipsActive() {
    document.querySelectorAll('.chip').forEach(chip => {
        chip.classList.remove('active');
        if (chip.dataset.status === AppState.currentFilter) {
            chip.classList.add('active');
        }
    });
}

/**
 * Отображение сводки по причинам проблем
 */
function showReasonsSummary(positions) {
    const safePositions = safeArray(positions);
    
    let summaryContainer = document.getElementById('reasonsSummary');
    if (!summaryContainer) {
        const resultsCard = document.querySelector('.results-card');
        if (resultsCard) {
            summaryContainer = document.createElement('div');
            summaryContainer.id = 'reasonsSummary';
            summaryContainer.style.cssText = 'margin-bottom: 16px;';
            const filterBar = resultsCard.querySelector('.filter-bar');
            if (filterBar) {
                filterBar.insertAdjacentElement('afterend', summaryContainer);
            } else {
                resultsCard.insertBefore(summaryContainer, resultsCard.firstChild);
            }
        }
    }
    
    if (!summaryContainer) return;
    
    if (safePositions.length === 0) {
        summaryContainer.classList.add('hidden');
        return;
    }
    
    const reasonsCount = {
        restoration: 0,
        forbidden: 0,
        coefficient_high: 0,
        coefficient_low: 0,
        text: 0,
        not_found: 0,
        warning: 0
    };
    
    for (const pos of safePositions) {
        if (!pos) continue;
        
        if (pos.isTextPosition || pos.isText) {
            reasonsCount.text++;
            continue;
        }
        
        const reason = getProblemReason(pos);
        if (reasonsCount[reason.type] !== undefined) {
            reasonsCount[reason.type]++;
        } else {
            reasonsCount.warning++;
        }
    }
    
    const summaryHtml = `
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px; padding:8px 0;">
            ${reasonsCount.coefficient_high > 0 ? `
                <div style="background:#fef3c7; border-radius:10px; padding:8px 14px; display:flex; align-items:center; gap:8px;">
                    <span>📈</span>
                    <div>
                        <div style="font-weight:700; color:#92400e;">${reasonsCount.coefficient_high}</div>
                        <div style="font-size:10px; color:#78350f;">Коэф. завышен</div>
                    </div>
                </div>
            ` : ''}
            ${reasonsCount.coefficient_low > 0 ? `
                <div style="background:#fef3c7; border-radius:10px; padding:8px 14px; display:flex; align-items:center; gap:8px;">
                    <span>📉</span>
                    <div>
                        <div style="font-weight:700; color:#92400e;">${reasonsCount.coefficient_low}</div>
                        <div style="font-size:10px; color:#78350f;">Коэф. занижен</div>
                    </div>
                </div>
            ` : ''}
            ${reasonsCount.restoration > 0 ? `
                <div style="background:#fee2e2; border-radius:10px; padding:8px 14px; display:flex; align-items:center; gap:8px;">
                    <span>🏛️</span>
                    <div>
                        <div style="font-weight:700; color:#991b1b;">${reasonsCount.restoration}</div>
                        <div style="font-size:10px; color:#7f1d1d;">Реставрационные</div>
                    </div>
                </div>
            ` : ''}
            ${reasonsCount.forbidden > 0 ? `
                <div style="background:#fee2e2; border-radius:10px; padding:8px 14px; display:flex; align-items:center; gap:8px;">
                    <span>❌</span>
                    <div>
                        <div style="font-weight:700; color:#991b1b;">${reasonsCount.forbidden}</div>
                        <div style="font-size:10px; color:#7f1d1d;">Запрещены</div>
                    </div>
                </div>
            ` : ''}
            ${reasonsCount.text > 0 ? `
                <div style="background:#ede9fe; border-radius:10px; padding:8px 14px; display:flex; align-items:center; gap:8px;">
                    <span>📝</span>
                    <div>
                        <div style="font-weight:700; color:#6d28d9;">${reasonsCount.text}</div>
                        <div style="font-size:10px; color:#4c1d95;">Цена поставщика</div>
                    </div>
                </div>
            ` : ''}
            ${reasonsCount.not_found > 0 ? `
                <div style="background:#fef3c7; border-radius:10px; padding:8px 14px; display:flex; align-items:center; gap:8px;">
                    <span>🔍</span>
                    <div>
                        <div style="font-weight:700; color:#92400e;">${reasonsCount.not_found}</div>
                        <div style="font-size:10px; color:#78350f;">Код не найден</div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    summaryContainer.innerHTML = summaryHtml;
    summaryContainer.classList.remove('hidden');
}

// Глобальная функция для переключения деталей
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