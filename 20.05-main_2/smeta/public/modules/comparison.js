// public/modules/comparison.js

import { AppState, updateState } from './state.js';
import { showLoading, hideLoading, showError, showSuccess } from './ui-notifications.js';
import { escapeHtml } from '../utils/helpers.js';

export async function compareEstimateWithKs2() {
    console.log('🔍 compareEstimateWithKs2 вызвана');
    
    if (!AppState.currentProjectId) {
        showError('Сначала выберите проект');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`/api/compare/${AppState.currentProjectId}`, {
            headers: { 'X-User-Id': AppState.currentUser?.id || '' }
        });
        
        const data = await response.json();
        console.log('📊 Результат сравнения:', data);
        
        if (!data.success) {
            throw new Error(data.error || 'Ошибка сравнения');
        }
        
        displayComparisonResults(data);
        showSuccess(`Сравнение завершено: ${data.stats.match_count} совпадений из ${data.stats.total_codes}`);
        
    } catch (err) {
        console.error('Ошибка сравнения:', err);
        showError(err.message);
    } finally {
        hideLoading();
    }
}

export async function exportComparisonToExcel() {
    const items = AppState.currentResults;
    
    if (!items || items.length === 0) {
        showError('Нет данных для экспорта');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch('/api/compare/export-excel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': AppState.currentUser?.id || ''
            },
            body: JSON.stringify({ items: items })
        });
        
        if (!response.ok) {
            throw new Error('Ошибка экспорта');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comparison_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
        showSuccess('Экспорт выполнен');
        
    } catch (err) {
        console.error('Ошибка экспорта:', err);
        showError(err.message);
    } finally {
        hideLoading();
    }
}

function displayComparisonResults(data) {
    const resultsContainer = document.getElementById('results');
    const statsContainer = document.getElementById('stats');
    const emptyState = document.getElementById('emptyState');
    const tableBody = document.getElementById('tableBody');
    const fullReportBtn = document.getElementById('fullReportBtn');
    const excelReportBtn = document.getElementById('excelReportBtn');
    const resetBtn = document.getElementById('resetBtn');
    
    // Статистика
    const statsHtml = `
        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); border-radius: 20px; padding: 24px; margin-bottom: 24px;">
            <div style="color: rgba(255,255,255,0.8); font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                📊 СРАВНЕНИЕ СМЕТЫ И КС-2
            </div>
            <div style="color: white; font-size: 36px; font-weight: 800;">
                ${data.stats.match_count}/${data.stats.total_codes} совпадений
            </div>
            <div style="color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 8px;">
                Смета: ${escapeHtml(data.estimate_name || '—')} | Файлов КС-2: ${data.ks2_count}
            </div>
        </div>
        
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
            <div class="stat-item" style="background: white; border-radius: 16px; padding: 20px; text-align: center;">
                <div style="font-size: 28px; font-weight: 800; color: #10b981;">${data.stats.match_count}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">✅ Совпадают</div>
            </div>
            <div class="stat-item" style="background: white; border-radius: 16px; padding: 20px; text-align: center;">
                <div style="font-size: 28px; font-weight: 800; color: #f59e0b;">${data.stats.only_in_estimate}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">⚠️ Только в смете</div>
            </div>
            <div class="stat-item" style="background: white; border-radius: 16px; padding: 20px; text-align: center;">
                <div style="font-size: 28px; font-weight: 800; color: #ef4444;">${data.stats.only_in_ks2}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">❌ Только в КС-2</div>
            </div>
        </div>
    `;
    
    if (statsContainer) {
        statsContainer.innerHTML = statsHtml;
        statsContainer.classList.remove('hidden');
        statsContainer.style.display = 'block';
    }
    
    // Таблица сравнения
    let tableHtml = '<tbody>';
    
    for (const item of data.comparison) {
        let statusHtml = '';
        
        switch (item.status) {
            case 'match':
                statusHtml = '<span class="badge badge-success">✅ Совпадает</span>';
                break;
            case 'only_in_estimate':
                statusHtml = '<span class="badge badge-warning">⚠️ Только в смете</span>';
                break;
            case 'only_in_ks2':
                statusHtml = '<span class="badge badge-danger">❌ Только в КС-2</span>';
                break;
            default:
                statusHtml = '<span class="badge badge-secondary">—</span>';
        }
        
        const estimateAmount = item.estimate_total ? Number(item.estimate_total).toLocaleString('ru-RU') + ' ₽' : '—';
        const ks2Amount = item.ks2_total ? Number(item.ks2_total).toLocaleString('ru-RU') + ' ₽' : '—';
        
        tableHtml += `
            <tr>
                <td style="padding: 12px;">
                    <code style="font-family: monospace; font-size: 13px; background: #f3f4f6; padding: 4px 8px; border-radius: 6px;">${escapeHtml(item.code)}</code>
                 </td>
                <td style="padding: 12px;">${escapeHtml(item.name || '—')}</td>
                <td style="padding: 12px; text-align: right; font-weight: 500;">${estimateAmount}</td>
                <td style="padding: 12px; text-align: right; font-weight: 500;">${ks2Amount}</td>
                <td style="padding: 12px; text-align: center;">${statusHtml}</td>
            </tr>
        `;
    }
    
    tableHtml += '</tbody>';
    
    // Обновляем заголовок таблицы
    const thead = document.querySelector('.data-table thead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th style="width: 200px;">Шифр</th>
                <th>Наименование</th>
                <th style="width: 150px; text-align: center;">Смета, ₽</th>
                <th style="width: 150px; text-align: center;">КС-2, ₽</th>
                <th style="width: 130px; text-align: center;">Статус</th>
            </tr>
        `;
    }
    
    if (tableBody) {
        tableBody.innerHTML = tableHtml;
    }
    
    // Показываем результаты
    if (resultsContainer) {
        resultsContainer.classList.remove('hidden');
        resultsContainer.style.display = 'block';
    }
    if (emptyState) {
        emptyState.classList.add('hidden');
        emptyState.style.display = 'none';
    }
    
    // Показываем кнопки
    if (fullReportBtn) fullReportBtn.classList.add('hidden');
    if (excelReportBtn) {
        excelReportBtn.classList.remove('hidden');
        excelReportBtn.onclick = () => exportComparisonToExcel();
    }
    if (resetBtn) resetBtn.classList.remove('hidden');
    
    // Сохраняем данные для экспорта
    updateState('currentResults', data.comparison);
    updateState('currentResultsType', 'comparison');
}