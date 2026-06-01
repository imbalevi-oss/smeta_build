// modules/reports.js

import { AppState } from './state.js';
import { showError, showSuccess } from './ui-notifications.js';

export function generateFullReport() {
    if (!AppState.lastSessionId) {
        showError('Нет данных для отчета');
        return;
    }
    window.open(`/api/report/${AppState.lastSessionId}/html`, '_blank');
}

export function downloadExcelReport() {
    if (!AppState.lastSessionId) {
        showError('Нет данных для отчёта');
        return;
    }
    
    fetch(`/api/report/${AppState.lastSessionId}/excel`, { method: 'POST' })
        .then(response => {
            if (!response.ok) throw new Error('Ошибка генерации Excel');
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `report_${AppState.lastSessionId}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showSuccess('Excel-отчёт скачан');
        })
        .catch(error => showError(error.message));
}