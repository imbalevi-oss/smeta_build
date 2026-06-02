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

    // Реставрационные работы
    const isRestoration = code.isRestoration === true || code.isRestoration === 1 || code.matchType === 'restoration' || code.is_restoration === 1;
    if (isRestoration) {
        return {
            type: 'restoration',
            icon: '❌',
            title: 'Реставрационные работы',
            message: 'Код относится к реставрационным работам (отделы 51-59). Применение запрещено.',
            severity: 'error'
        };
    }

    // Запрещённый код
    if (code.status === 'Нельзя применять') {
        return {
            type: 'forbidden',
            icon: '❌',
            title: 'Запрещён к применению',
            message: code.description || 'Данный код нельзя использовать в сметах.',
            severity: 'error'
        };
    }

    // Текстовая строка
    if (code.isText === true || code.is_text === 1 || code.matchType === 'text') {
        return {
            type: 'text',
            icon: '📝',
            title: 'Цена поставщика',
            message: code.description || 'Текстовая строка. Рекомендуется проверить цену.',
            severity: 'warning'
        };
    }

    // Код не найден
    if (code.found === false) {
        return {
            type: 'not_found',
            icon: '🔍',
            title: 'Код не найден',
            message: code.description || 'Данный код отсутствует в базе. Требуется ручная проверка.',
            severity: 'warning'
        };
    }

    // Работа с коэффициентом
    const actualCoeff = parseFloat(code.actualCoefficient || code.actual_coefficient || 1);
    const expectedCoeff = parseFloat(code.expectedCoefficient || code.expected_coefficient || 1);
    const isMatch = code.coefficientMatch === true;

    if (actualCoeff < 1) {
        return {
            type: 'info',
            icon: 'ℹ️',
            title: 'Понижающий коэффициент',
            message: `Коэффициент ${actualCoeff.toFixed(3)} (понижающий, допустимо)${expectedCoeff !== 1 ? `, ожидался ${expectedCoeff.toFixed(3)}` : ''}`,
            severity: 'info'
        };
    }

    if (code.coefficientMatch === false) {
        if (actualCoeff > expectedCoeff) {
            return {
                type: 'coefficient_high',
                icon: '⚠️',
                title: 'Коэффициент завышен',
                message: `Коэффициент ${actualCoeff.toFixed(3)} превышает допустимый (${expectedCoeff.toFixed(3)}). Требуется обоснование.`,
                severity: 'warning'
            };
        } else if (actualCoeff < expectedCoeff) {
            return {
                type: 'coefficient_low',
                icon: 'ℹ️',
                title: 'Коэффициент занижен',
                message: `Коэффициент ${actualCoeff.toFixed(3)} ниже ожидаемого (${expectedCoeff.toFixed(3)}), но допустимо.`,
                severity: 'info'
            };
        }
        return {
            type: 'coefficient_mismatch',
            icon: '⚠️',
            title: 'Коэффициент не соответствует',
            message: code.description || `Коэффициент ${actualCoeff.toFixed(3)} не соответствует ожидаемому (${expectedCoeff.toFixed(3)}).`,
            severity: 'warning'
        };
    }

    if (code.status === 'Обратите внимание' && code.description && !code.description.includes('Понижающий')) {
        return {
            type: 'warning',
            icon: '⚠️',
            title: 'Требует внимания',
            message: code.description,
            severity: 'warning'
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