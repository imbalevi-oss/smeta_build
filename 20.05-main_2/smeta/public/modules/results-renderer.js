// modules/results-renderer.js
// Рендеринг результатов анализа (с поддержкой всех деталей, группировка по типам)

import { AppState, updateState } from './state.js';
import { safeArray, safeNumber, escapeHtml, formatNumber, getProblemReason, safeString } from '../utils/helpers.js';

let activePopup = null;

export function showEstimateResultsView() {
    const estimateView = document.getElementById('estimateResultsView');
    const ks2View = document.getElementById('ks2ResultsView');
    if (estimateView) {
        estimateView.classList.remove('hidden');
        estimateView.style.display = 'block';
    }
    if (ks2View) {
        ks2View.classList.add('hidden');
        ks2View.style.display = 'none';
    }
    updateState('currentResultsType', 'estimate');
}

export function showKs2ResultsView() {
    const estimateView = document.getElementById('estimateResultsView');
    const ks2View = document.getElementById('ks2ResultsView');
    if (estimateView) {
        estimateView.classList.add('hidden');
        estimateView.style.display = 'none';
    }
    if (ks2View) {
        ks2View.classList.remove('hidden');
        ks2View.style.display = 'block';
    }
    updateState('currentResultsType', 'ks2');
}

function formatCoefficient(value) {
    if (value === null || value === undefined) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return String(value);
    // Округляем до 2 знаков и убираем лишние нули в конце
    let formatted = num.toFixed(2).replace(/\.?0+$/, '');
    if (formatted === '') formatted = '0';
    return formatted;
}

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

function closeActivePopup() {
    if (activePopup) {
        activePopup.remove();
        activePopup = null;
    }
}

function showCoefficientPopup(event, actual, expected, code, position) {
    event.stopPropagation();
    closeActivePopup();
    const actualFormatted = formatCoefficient(actual);
    const expectedFormatted = expected ? formatCoefficient(expected) : '1';
    const isMatch = expected ? Math.abs(actual - expected) <= 0.01 : actual === 1;
    let severityClass = '', severityText = '', recommendation = '';
    if (!expected || expected === 1) {
        if (actual > 1.3) {
            severityClass = 'critical'; severityText = 'КРИТИЧЕСКОЕ ЗАВЫШЕНИЕ';
            recommendation = 'Коэффициент значительно превышает норму. Требуется срочное обоснование.';
        } else if (actual > 1.1) {
            severityClass = 'warning'; severityText = 'ЗНАЧИТЕЛЬНОЕ ЗАВЫШЕНИЕ';
            recommendation = 'Рекомендуется предоставить обоснование применения повышенного коэффициента.';
        } else if (actual > 1.01) {
            severityClass = 'warning'; severityText = 'НЕБОЛЬШОЕ ЗАВЫШЕНИЕ';
            recommendation = 'Убедитесь, что применение обосновано условиями работ.';
        } else if (actual < 0.9) {
            severityClass = 'info'; severityText = 'ПОНИЖАЮЩИЙ КОЭФФИЦИЕНТ';
            recommendation = 'Понижающий коэффициент применен. Проверьте корректность.';
        } else {
            severityClass = 'perfect'; severityText = 'В НОРМЕ';
            recommendation = 'Коэффициент соответствует норме, обоснование не требуется.';
        }
    } else {
        const deviation = ((actual - expected) / expected) * 100;
        if (deviation > 30) {
            severityClass = 'critical'; severityText = 'КРИТИЧЕСКОЕ ОТКЛОНЕНИЕ';
            recommendation = `Коэффициент превышает норму на ${deviation.toFixed(1)}%. Требуется срочная проверка.`;
        } else if (deviation > 15) {
            severityClass = 'critical'; severityText = 'СИЛЬНОЕ ОТКЛОНЕНИЕ';
            recommendation = `Коэффициент превышает норму на ${deviation.toFixed(1)}%. Необходимо обоснование.`;
        } else if (deviation > 5) {
            severityClass = 'warning'; severityText = 'УМЕРЕННОЕ ОТКЛОНЕНИЕ';
            recommendation = `Коэффициент отличается от нормы на ${deviation.toFixed(1)}%. Рекомендуется проверка.`;
        } else if (deviation < -15) {
            severityClass = 'warning'; severityText = 'ЗНАЧИТЕЛЬНОЕ ЗАНИЖЕНИЕ';
            recommendation = `Коэффициент ниже нормы на ${Math.abs(deviation).toFixed(1)}%. Проверьте полноту применения коэффициентов.`;
        } else if (deviation < -5) {
            severityClass = 'info'; severityText = 'НЕБОЛЬШОЕ ЗАНИЖЕНИЕ';
            recommendation = `Коэффициент ниже нормы на ${Math.abs(deviation).toFixed(1)}%.`;
        } else if (isMatch) {
            severityClass = 'perfect'; severityText = 'ТОЧНО СООТВЕТСТВУЕТ';
            recommendation = 'Коэффициент полностью соответствует норме.';
        } else {
            severityClass = 'perfect'; severityText = 'В ДОПУСТИМЫХ ПРЕДЕЛАХ';
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
    closeBtn.addEventListener('click', () => closeActivePopup());
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

// Группировка деталей по типам (ЗП, ЭМ, МР, НР, СП, ЗТР, Прочие)
function groupDetailsByType(details) {
    const groups = {
        'ЗП': { amount: 0, items: [], icon: 'fa-user-hard-hat', color: '#2563eb' },
        'ЭМ': { amount: 0, items: [], icon: 'fa-industry', color: '#d97706' },
        'МР': { amount: 0, items: [], icon: 'fa-cubes', color: '#059669' },
        'НР': { amount: 0, items: [], icon: 'fa-percent', color: '#db2777' },
        'СП': { amount: 0, items: [], icon: 'fa-chart-simple', color: '#7c3aed' },
        'ЗТР': { amount: 0, items: [], icon: 'fa-clock', color: '#4b5563' },
        'Прочие': { amount: 0, items: [], icon: 'fa-gear', color: '#6b7280' }
    };

    for (const detail of details) {
        const typeRaw = (detail.type || '').toUpperCase();
        let groupKey = 'Прочие';
        if (typeRaw === 'ЗП' || typeRaw.startsWith('ЗП ') || typeRaw.includes('ЗАРАБОТНАЯ ПЛАТА')) groupKey = 'ЗП';
        else if (typeRaw === 'ЭМ' || typeRaw.startsWith('ЭМ ') || typeRaw.includes('ЭКСПЛУАТАЦИЯ МАШИН')) groupKey = 'ЭМ';
        else if (typeRaw === 'МР' || typeRaw.startsWith('МР ') || typeRaw.includes('МАТЕРИАЛЬНЫЕ РЕСУРСЫ') || typeRaw.includes('МАТЕРИАЛ')) groupKey = 'МР';
        else if (typeRaw === 'НР' || typeRaw.startsWith('НР ') || typeRaw.includes('НАКЛАДНЫЕ РАСХОДЫ')) groupKey = 'НР';
        else if (typeRaw === 'СП' || typeRaw.startsWith('СП ') || typeRaw.includes('СМЕТНАЯ ПРИБЫЛЬ')) groupKey = 'СП';
        else if (typeRaw === 'ЗТР' || typeRaw.startsWith('ЗТР ') || typeRaw.includes('ЗАТРАТЫ ТРУДА')) groupKey = 'ЗТР';

        groups[groupKey].amount += (detail.amount || 0);
        groups[groupKey].items.push(detail);
    }

    return groups;
}

// Рендеринг блока деталей для позиции
function renderDetailsBlock(details, totalAmount, idx) {
    if (!details || details.length === 0) return '';
    
    const groups = groupDetailsByType(details);
    let groupsHtml = '';
    let allDetailsTotal = 0;
    
    for (const [groupName, groupData] of Object.entries(groups)) {
        if (groupData.amount === 0) continue;
        allDetailsTotal += groupData.amount;
        groupsHtml += `
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
                    ${groupData.items.map(d => {
                        let detailText = d.type;
                        if (d.quantity && d.unit) {
                            detailText += ` (${d.quantity} ${d.unit})`;
                        }
                        return `<span>${escapeHtml(detailText)}: ${(d.amount || 0).toLocaleString('ru-RU')} ₽</span>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    return `
        <tr id="details-row-${idx}" style="display:none; background:#f8fafc;">
            <td colspan="6" style="padding:0;">
                <div style="margin:8px 12px 12px 50px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #eef2f6;">
                    <div style="background:#f1f5f9; padding:10px 16px; font-weight:600; font-size:13px; border-bottom:1px solid #e2e8f0;">
                        <i class="fas fa-list-ul" style="margin-right:8px; color:#667eea;"></i> 
                        Состав работ и затрат (ЗП, ЭМ, МР, НР, СП)
                        <span style="float:right; color:#10b981;">
                            Итого деталей: ${allDetailsTotal.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                        </span>
                    </div>
                    <div style="padding: 12px;">
                        ${groupsHtml}
                    </div>
                    <div style="background:#eef2ff; padding:8px 12px; border-top:1px solid #e2e8f0; text-align:right;">
                        <span style="font-weight:600;">ВСЕГО ПОЗИЦИЯ:</span>
                        <span style="font-weight:700; color:#667eea; margin-left:12px;">
                            ${totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                        </span>
                    </div>
                </div>
             </td>
         </tr>
    `;
}

// public/modules/results-renderer.js

export function renderUnifiedTable(positions) {
    showEstimateResultsView();
    const tableBody = document.getElementById('estimateTableBody');
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
        
        const totalCost = safeNumber(pos.total_amount || pos.totalAmount, 0);
        const positionNumber = pos.positionNumber || (idx + 1);
        const code = pos.code || '—';
        
        // ИСПРАВЛЕНИЕ: используем name (из сметы) вместо description (из БД)
    const name = safeString(pos.name || pos.original_name || pos.position_name || pos.description || pos.code, '').substring(0, 100);
        
        const totalFormatted = totalCost.toLocaleString('ru-RU', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
        
        let statusHtml = '';
        let reasonText = '';
        
        if (pos.isText || pos.isTextPosition) {
            statusHtml = '<span class="badge badge-warning">📝 Цена поставщика</span>';
            reasonText = pos.description || 'Текстовая строка, требуется проверка';
        } else if (pos.status === 'Нельзя применять' || pos.isRestoration) {
            statusHtml = '<span class="badge badge-danger">❌ Нельзя применять</span>';
            reasonText = pos.description || 'Код запрещён к применению';
        } else if (pos.coefficientMatch === false) {
            statusHtml = '<span class="badge badge-warning">Обартите внимаение</span>';
            reasonText = pos.description || `Коэффициент ${pos.actualCoefficient} превышает норму`;
        } else if (pos.status === 'Обратите внимание') {
            statusHtml = '<span class="badge badge-warning">Обартите внимаение</span>';
            reasonText = pos.description || 'Требуется проверка';
        } else if (pos.status === 'НЕ НАЙДЕН' || pos.found === false) {
            statusHtml = '<span class="badge badge-danger">❌ Не найден</span>';
            reasonText = pos.description || 'Код отсутствует в базе данных';
        } else {
            statusHtml = '<span class="badge badge-success">✅ Доступен</span>';
            reasonText = pos.description || '';
        }
        
        html += `
            <tr class="position-row" data-idx="${idx}" style="cursor:pointer;">
                <td style="padding:12px; vertical-align:middle;">
                    ${pos.hasDetails ? `<i class="fas fa-chevron-right toggle-icon" id="toggle-icon-${idx}" style="margin-right:8px;"></i>` : ''}
                    <span class="position-badge">${escapeHtml(String(positionNumber))}</span>
                </td>
                <td style="padding:12px; font-family:monospace;">${escapeHtml(code)}</td>
                <td style="padding:12px; max-width:400px;">
                    <div style="font-weight:500;">${escapeHtml(name)}</div>
                    ${pos.formattedVolume ? `<div style="font-size:11px; color:#059669; margin-top:4px;"><i class="fas fa-calculator"></i> ${escapeHtml(pos.formattedVolume)}</div>` : ''}
                </td>
                <td style="padding:12px;">${statusHtml}</td>
                <td style="padding:12px; max-width:300px; font-size:12px; color:#4b5563;">${escapeHtml(reasonText)}</td>
                <td style="padding:12px; text-align:right; font-weight:700;">${totalFormatted} ₽</td>
            </tr>
        `;
        
        // Детали (если есть)
        if (pos.hasDetails && pos.details && pos.details.length > 0) {
            html += renderDetailsBlock(pos.details, totalCost, idx);
        }
    }
    
    tableBody.innerHTML = html;
    
    // Прикрепляем обработчики
    setTimeout(() => {
        attachRowClickHandlers();
    }, 50);
}

function attachCoefficientClickHandlers() {
    const coeffElements = document.querySelectorAll('.coefficient-status');
    coeffElements.forEach(el => {
        el.removeEventListener('click', handleCoefficientClick);
        el.addEventListener('click', handleCoefficientClick);
    });
}

function attachRowClickHandlers() {
    const rows = document.querySelectorAll('#estimateResultsView .position-row');
    rows.forEach(row => {
        row.removeEventListener('click', handleRowClick);
        row.addEventListener('click', handleRowClick);
    });
}

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

function handleRowClick(event) {
    if (event.target.closest('.coefficient-status')) return;
    const row = event.currentTarget;
    const idx = row.dataset.idx;
    if (idx !== undefined) {
        window.togglePositionDetails(parseInt(idx));
    }
}

export function filterAndDisplayResults() {
    if (!AppState.currentResults) updateState('currentResults', []);
    if (!Array.isArray(AppState.currentResults) || AppState.currentResults.length === 0) {
        showEstimateResultsView();
        const tableBody = document.getElementById('estimateTableBody');
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
   
    renderUnifiedTable(filtered);
    showReasonsSummary(filtered);
    updateFilterChipsActive();
}

function updateFilterChipsActive() {
    document.querySelectorAll('.chip').forEach(chip => {
        chip.classList.remove('active');
        if (chip.dataset.status === AppState.currentFilter) chip.classList.add('active');
    });
}
// public/modules/results-renderer.js

/**
 * Рендеринг таблицы КС-2
 * @param {Array} items - Позиции КС-2
 */
export function renderKs2Table(items) {
    showKs2ResultsView();
    const tableBody = document.getElementById('ks2TableBody');
    if (!tableBody) return;
    
    const safeItems = safeArray(items);
    
    if (safeItems.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:60px;color:#9ca3af;">📄 Нет данных КС-2</td></tr>';
        return;
    }
    
    let html = '';
    
    for (let idx = 0; idx < safeItems.length; idx++) {
        const item = safeItems[idx];
        if (!item) continue;
        
        const positionNumber = item.ks2_position_number || item.position || (idx + 1);
        const code = item.code || '—';
        const name = item.name || '—';
        const totalAmount = item.total || 0;
        const coefficient = item.coefficient;
        
        const totalFormatted = totalAmount.toLocaleString('ru-RU', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
        
        const expected = item.expectedCoefficient;
        const mismatch = item.coefficientMatch === false;
        let coeffHtml = '—';
        if (coefficient && coefficient !== 0 && coefficient !== 1) {
            const coeffValue = coefficient.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
            const coeffColor = mismatch ? '#ef4444' : (coefficient > 1 ? '#ef4444' : '#10b981');
            coeffHtml = `<span style="color: ${coeffColor}; font-weight: 600;">${coeffValue}</span>`;
            if (expected && expected !== 1 && Math.abs(coefficient - expected) > 0.01) {
                coeffHtml += `<div style="font-size:10px;color:#6b7280;">норма ${expected.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</div>`;
            }
        } else if (expected && expected !== 1) {
            coeffHtml = `<span style="color:#ef4444;font-weight:600;">⚠️</span><div style="font-size:10px;">ожид. ${expected.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</div>`;
        }
        
        // Объём (если есть)
        let volumeHtml = '';
        if (item.volume) {
            volumeHtml = `<div style="font-size: 11px; color: #059669; margin-top: 4px;"><i class="fas fa-calculator"></i> ${escapeHtml(item.volume)}</div>`;
        }
        
        const details = Array.isArray(item.details) ? item.details : [];
        const hasDetails = details.length > 0 || item.hasDetails === true;
        
        html += `
            <tr class="position-row" data-idx="${idx}" data-is-ks2="true" style="cursor:pointer;">
                <td style="padding: 12px; vertical-align: middle;">
                    ${hasDetails ? `<i class="fas fa-chevron-right toggle-icon" id="toggle-icon-ks2-${idx}" style="margin-right: 8px;"></i>` : ''}
                    <span class="position-badge">${escapeHtml(String(positionNumber))}</span>
                    ${item.estimate_position_number ? `<div style="font-size:10px;color:#6b7280;margin-top:4px;">поз. ${escapeHtml(item.estimate_position_number)}</div>` : ''}
                </td>
                <td style="padding: 12px; font-family: monospace;">${escapeHtml(code)}</td>
                <td style="padding: 12px;">
                    <div style="font-weight: 500;">${escapeHtml(name)}</div>
                    ${volumeHtml}
                    ${mismatch && item.description ? `<div style="font-size:11px;color:#b45309;margin-top:4px;">${escapeHtml(String(item.description).substring(0, 80))}</div>` : ''}
                </td>
                <td style="padding: 12px; text-align: center;">${coeffHtml}</td>
                <td style="padding: 12px; text-align: right; font-weight: 700;">${totalFormatted} ₽</td>
            </tr>
        `;
        
        // Детали (ЗП, ЭМ, МР, НР, СП)
        if (hasDetails) {
            html += renderKs2DetailsBlock(details, item.total, idx);
        }
    }
    
    tableBody.innerHTML = html;
    
    // Прикрепляем обработчики для раскрытия деталей
    setTimeout(() => {
        attachKs2RowClickHandlers();
    }, 50);
}

/**
 * Рендеринг блока деталей для КС-2
 */
function renderKs2DetailsBlock(details, totalAmount, idx) {
    if (!details || details.length === 0) return '';
    
    // Группируем детали по типу
    const groups = {
        'ЗП': { amount: 0, items: [], icon: 'fa-user-hard-hat', color: '#2563eb' },
        'ЭМ': { amount: 0, items: [], icon: 'fa-industry', color: '#d97706' },
        'МР': { amount: 0, items: [], icon: 'fa-cubes', color: '#059669' },
        'НР': { amount: 0, items: [], icon: 'fa-percent', color: '#db2777' },
        'СП': { amount: 0, items: [], icon: 'fa-chart-simple', color: '#7c3aed' },
        'Прочие': { amount: 0, items: [], icon: 'fa-gear', color: '#6b7280' }
    };
    
    for (const detail of details) {
        const typeRaw = (detail.type || '').toUpperCase();
        let groupKey = 'Прочие';
        if (typeRaw === 'ЗП' || typeRaw.startsWith('ЗП ')) groupKey = 'ЗП';
        else if (typeRaw === 'ЭМ' || typeRaw.startsWith('ЭМ ')) groupKey = 'ЭМ';
        else if (typeRaw === 'МР' || typeRaw.startsWith('МР ')) groupKey = 'МР';
        else if (typeRaw === 'НР' || typeRaw.startsWith('НР ')) groupKey = 'НР';
        else if (typeRaw === 'СП' || typeRaw.startsWith('СП ')) groupKey = 'СП';
        
        groups[groupKey].amount += (detail.amount || 0);
        groups[groupKey].items.push(detail);
    }
    
    let groupsHtml = '';
    for (const [groupName, groupData] of Object.entries(groups)) {
        if (groupData.amount === 0) continue;
        groupsHtml += `
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
                    ${groupData.items.map(d => `<span>${escapeHtml(d.type)}: ${(d.amount || 0).toLocaleString('ru-RU')} ₽</span>`).join('')}
                </div>
            </div>
        `;
    }
    
    return `
        <tr id="details-row-ks2-${idx}" style="display: none; background: #f8fafc;">
            <td colspan="5" style="padding: 0;">
                <div style="margin: 8px 12px 12px 50px; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #eef2f6;">
                    <div style="background: #f1f5f9; padding: 10px 16px; font-weight: 600; font-size: 13px; border-bottom: 1px solid #e2e8f0;">
                        <i class="fas fa-list-ul" style="margin-right: 8px; color: #667eea;"></i> 
                        Состав работ и затрат (ЗП, ЭМ, МР, НР, СП)
                    </div>
                    <div style="padding: 12px;">
                        ${groupsHtml}
                    </div>
                    <div style="background: #eef2ff; padding: 8px 12px; border-top: 1px solid #e2e8f0; text-align: right;">
                        <span style="font-weight: 600;">ВСЕГО ПОЗИЦИЯ:</span>
                        <span style="font-weight: 700; color: #667eea; margin-left: 12px;">
                            ${totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                        </span>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

/**
 * Прикрепление обработчиков для строк КС-2
 */
function attachKs2RowClickHandlers() {
    const rows = document.querySelectorAll('#ks2ResultsView .position-row');
    rows.forEach(row => {
        row.removeEventListener('click', handleKs2RowClick);
        row.addEventListener('click', handleKs2RowClick);
    });
}

function handleKs2RowClick(event) {
    const row = event.currentTarget;
    const idx = row.dataset.idx;
    if (idx !== undefined) {
        const detailsRow = document.getElementById(`details-row-ks2-${idx}`);
        const icon = document.getElementById(`toggle-icon-ks2-${idx}`);
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
            if (filterBar) filterBar.insertAdjacentElement('afterend', summaryContainer);
            else resultsCard.insertBefore(summaryContainer, resultsCard.firstChild);
        }
    }
    if (!summaryContainer) return;
    if (safePositions.length === 0) {
        summaryContainer.classList.add('hidden');
        return;
    }
    const reasonsCount = {
        restoration: 0, forbidden: 0, coefficient_high: 0, coefficient_low: 0,
        text: 0, not_found: 0, warning: 0
    };
    for (const pos of safePositions) {
        if (!pos) continue;
        if (pos.isTextPosition || pos.isText) {
            reasonsCount.text++;
            continue;
        }
        const reason = getProblemReason(pos);
        if (reasonsCount[reason.type] !== undefined) reasonsCount[reason.type]++;
        else reasonsCount.warning++;
    }
    const summaryHtml = `
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px; padding:8px 0;">
            ${reasonsCount.coefficient_high > 0 ? `<div style="background:#fef3c7; border-radius:10px; padding:8px 14px; display:flex; align-items:center; gap:8px;"><span>📈</span><div><div style="font-weight:700; color:#92400e;">${reasonsCount.coefficient_high}</div><div style="font-size:10px; color:#78350f;">Обратите внимание</div></div></div>` : ''}
            ${reasonsCount.coefficient_low > 0 ? `<div style="background:#fef3c7; border-radius:10px; padding:8px 14px; display:flex; align-items:center; gap:8px;"><span>📉</span><div><div style="font-weight:700; color:#92400e;">${reasonsCount.coefficient_low}</div><div style="font-size:10px; color:#78350f;">Обратите внимание</div></div></div>` : ''}
            ${reasonsCount.restoration > 0 ? `<div style="background:#fee2e2; border-radius:10px; padding:8px 14px; display:flex; align-items:center; gap:8px;"><span>🏛️</span><div><div style="font-weight:700; color:#991b1b;">${reasonsCount.restoration}</div><div style="font-size:10px; color:#7f1d1d;">Реставрационные</div></div></div>` : ''}
            ${reasonsCount.forbidden > 0 ? `<div style="background:#fee2e2; border-radius:10px; padding:8px 14px; display:flex; align-items:center; gap:8px;"><span>❌</span><div><div style="font-weight:700; color:#991b1b;">${reasonsCount.forbidden}</div><div style="font-size:10px; color:#7f1d1d;">Запрещены</div></div></div>` : ''}
            ${reasonsCount.text > 0 ? `<div style="background:#ede9fe; border-radius:10px; padding:8px 14px; display:flex; align-items:center; gap:8px;"><span>📝</span><div><div style="font-weight:700; color:#6d28d9;">${reasonsCount.text}</div><div style="font-size:10px; color:#4c1d95;">Цена поставщика</div></div></div>` : ''}
            ${reasonsCount.not_found > 0 ? `<div style="background:#fef3c7; border-radius:10px; padding:8px 14px; display:flex; align-items:center; gap:8px;"><span>🔍</span><div><div style="font-weight:700; color:#92400e;">${reasonsCount.not_found}</div><div style="font-size:10px; color:#78350f;">Код не найден</div></div></div>` : ''}
        </div>
    `;
    summaryContainer.innerHTML = summaryHtml;
    summaryContainer.classList.remove('hidden');
}

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