// utils/helpers.js

export function safeArray(arr) {
    return Array.isArray(arr) ? arr : [];
}

export function safeObject(obj, defaultValue = {}) {
    return obj && typeof obj === 'object' ? obj : defaultValue;
}

export function safeString(str, defaultValue = '') {
    return str && typeof str === 'string' ? str : defaultValue;
}

export function safeNumber(num, defaultValue = 0) {
    const n = parseFloat(num);
    return isNaN(n) ? defaultValue : n;
}

export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function formatNumber(num) {
    if (num === null || num === undefined) return '—';
    return String(num).replace('.', ',');
}

export function formatMoscowDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return String(dateString);
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        return `${day}.${month}.${year}, ${hours}:${minutes}:${seconds}`;
    } catch (e) {
        return String(dateString);
    }
}

export function formatMoscowDateOnly(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return String(dateString);
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day}.${month}.${year}`;
    } catch (e) {
        return String(dateString);
    }
}

export function formatRelativeTime(dateStr) {
    if (!dateStr) return 'нет данных';
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return 'сегодня';
        if (days === 1) return 'вчера';
        if (days < 7) return `${days} дн. назад`;
        return formatMoscowDateOnly(dateStr);
    } catch (e) {
        return 'нет данных';
    }
}

export function computeCategory(code) {
    if (!code) return 'ok';
    
    if (code.isText === true || code.is_text === 1 || code.matchType === 'text') return 'text';
    
    if (code.status === 'Нельзя применять' || code.isRestoration === true || code.is_restoration === 1 || code.matchType === 'restoration') return 'notallowed';
    
    const actual = safeNumber(code.actualCoefficient || code.actual_coefficient || code.coefficient_value, 1);
    const expected = safeNumber(code.expectedCoefficient || code.expected_coefficient, 1);
    
    if (actual > 1) return 'warning';
    if (expected > 1 && code.coefficientMatch === false) return 'warning';
    if (code.status === 'Обратите внимание') {
        if (code.description && code.description.includes('Понижающий коэффициент')) {
            return 'ok';
        }
        return 'warning';
    }
    return 'ok';
}

export function getProblemReason(code) {
    if (!code || typeof code !== 'object') {
        return {
            type: 'unknown',
            icon: '❓',
            title: 'Ошибка данных',
            message: 'Не удалось определить проблему',
            severity: 'warning'
        };
    }
    
    const isRestoration = code.isRestoration === true || 
                          code.isRestoration === 1 || 
                          code.matchType === 'restoration' || 
                          code.is_restoration === 1;
    
    if (isRestoration) {
        return {
            type: 'restoration',
            icon: '❌',
            title: 'Возможно применение только к ОКН, Реставрационные работы',
            message: 'Код относится к реставрационным работам (отделы 51-59). Применение запрещено.',
            severity: 'error'
        };
    }
    
    if (code.status === 'Нельзя применять') {
        return {
            type: 'forbidden',
            icon: '❌',
            title: 'Запрещён к применению',
            message: code.description || 'Данный код нельзя использовать в сметах.',
            severity: 'error'
        };
    }
    
    const actualCoeff = parseFloat(code.actualCoefficient || code.actual_coefficient || code.coefficient_value || 1);
    const expectedCoeff = parseFloat(code.expectedCoefficient || code.expected_coefficient || 1);
    
    if (actualCoeff > 1) {
        if (code.coefficientMatch === true && Math.abs(actualCoeff - expectedCoeff) <= 0.01) {
            return {
                type: 'info',
                icon: 'ℹ️',
                title: 'Информация',
                message: `Коэффициент ${formatNumber(actualCoeff)} соответствует ожидаемому (${formatNumber(expectedCoeff)})`,
                severity: 'info'
            };
        }
        
        let message = `Коэффициент завышен, требуется обоснование.`;
        if (expectedCoeff !== 1 && expectedCoeff !== actualCoeff) {
            message = `Коэффициент ${formatNumber(actualCoeff)} превышает допустимый (${formatNumber(expectedCoeff)}). Требуется обоснование.`;
        }
        
        return {
            type: 'coefficient_high',
            icon: '📈',
            title: 'Коэффициент завышен',
            message: message,
            severity: 'warning',
            actualCoeff: actualCoeff,
            expectedCoeff: expectedCoeff
        };
    }
    
    if (code.coefficientMatch === false && expectedCoeff > 1) {
        if (actualCoeff < expectedCoeff) {
            return {
                type: 'coefficient_low',
                icon: '📉',
                title: 'Коэффициент занижен',
                message: `Коэффициент ${formatNumber(actualCoeff)} ниже ожидаемого (${formatNumber(expectedCoeff)}). Проверьте правильность применения.`,
                severity: 'warning',
                actualCoeff: actualCoeff,
                expectedCoeff: expectedCoeff
            };
        }
        
        return {
            type: 'coefficient_mismatch',
            icon: '⚠️',
            title: 'Коэффициент не соответствует',
            message: `Коэффициент ${formatNumber(actualCoeff)} не соответствует ожидаемому (${formatNumber(expectedCoeff)}).`,
            severity: 'warning',
            actualCoeff: actualCoeff,
            expectedCoeff: expectedCoeff
        };
    }
    
    if (code.coefficientRequired === true && !code.hasCoefficient && expectedCoeff > 1) {
        return {
            type: 'coefficient_missing',
            icon: '❓',
            title: 'Коэффициент не указан',
            message: `Для этого кода требуется проверка коэффициента, но он не указан в смете. Ожидается: ${formatNumber(expectedCoeff)}`,
            severity: 'warning'
        };
    }
    
    if (code.isText === true || code.is_text === 1 || code.matchType === 'text') {
        return {
            type: 'text',
            icon: '📝',
            title: 'Цена поставщика',
            message: 'Текстовая строка. Рекомендуется проверить цену в других источниках.',
            severity: 'warning'
        };
    }
    
    if (code.found === false) {
        if (actualCoeff < 1) {
            return {
                type: 'info',
                icon: 'ℹ️',
                title: 'Информация',
                message: `Код не найден в базе, но коэффициент ${formatNumber(actualCoeff)} (понижающий, допустимо)`,
                severity: 'info'
            };
        }
        
        if (actualCoeff === 1) {
            return {
                type: 'info',
                icon: 'ℹ️',
                title: 'Информация',
                message: 'Код не найден в базе, но коэффициент в норме (1)',
                severity: 'info'
            };
        }
        
        return {
            type: 'not_found',
            icon: '🔍',
            title: 'Код не найден',
            message: 'Данный код отсутствует в базе. Требуется ручная проверка.',
            severity: 'warning'
        };
    }
    
    if (code.status === 'Обратите внимание') {
        if (code.description && code.description.includes('Понижающий коэффициент')) {
            return {
                type: 'info',
                icon: 'ℹ️',
                title: 'Информация',
                message: code.description,
                severity: 'info'
            };
        }
        
        return {
            type: 'warning',
            icon: '⚠️',
            title: 'Требует внимания',
            message: code.description || 'Проверьте корректность применения данного кода.',
            severity: 'warning'
        };
    }
    
    if (code.description && code.description.includes('Понижающий коэффициент')) {
        return {
            type: 'info',
            icon: 'ℹ️',
            title: 'Информация',
            message: code.description,
            severity: 'info'
        };
    }
    
    return {
        type: 'ok',
        icon: '✅',
        title: 'Норма',
        message: code.description || 'Код в порядке',
        severity: 'info'
    };
}