// shareds/coefficient-analyzer.js
// Логика проверки коэффициентов

function roundTo2(num) {
    if (num === null || num === undefined) return null;
    return Math.round(parseFloat(num) * 100) / 100;
}

function evaluateCoefficientAnalysis({
    actualCoefficient,
    expectedCoefficient,
    isRestoration = false,
    found = true,
    baseStatus = 'Доступен',
    baseDescription = ''
}) {
    // Нормализуем коэффициенты
    let actual = (actualCoefficient !== null && actualCoefficient !== undefined)
        ? roundTo2(actualCoefficient)
        : null;
    
    let expected = (expectedCoefficient !== null && expectedCoefficient !== undefined)
        ? roundTo2(expectedCoefficient)
        : null;
    
    let status = found ? (baseStatus || 'Доступен') : 'НЕ НАЙДЕН';
    let description = '';
    let statusCategory = found ? 'ok' : 'warning';
    let coefficientMatch = null;
    
    // Случай 1: реставрация
    if (isRestoration) {
        statusCategory = 'notallowed';
        status = 'Нельзя применять';
        description = 'Реставрационные работы (отделы 51-59). Применение запрещено.';
        return {
            status,
            description,
            statusCategory,
            coefficientMatch,
            expectedCoefficient: expected,
            actualCoefficient: actual
        };
    }
    
    // Случай 2: код не найден в БД
    if (!found) {
        description = '❌ Код отсутствует в базе данных';
        return {
            status,
            description,
            statusCategory,
            coefficientMatch,
            expectedCoefficient: expected,
            actualCoefficient: actual
        };
    }
    
    // Если фактический коэффициент отсутствует или равен 0, считаем его = 1
    const effectiveActual = (actual === null || actual === 0) ? 1 : actual;
    
    // Случай 3: в БД есть ожидаемый коэффициент
    if (expected !== null && expected !== undefined) {
        // Сравниваем с ожидаемым коэффициентом из БД
        if (Math.abs(effectiveActual - expected) <= 0.01) {
            // Коэффициент соответствует ожидаемому
            coefficientMatch = true;
            description = `✅ Коэффициент ${effectiveActual.toFixed(2)} соответствует ожидаемому (${expected.toFixed(2)})`;
            status = 'Доступен';
            statusCategory = 'ok';
        } else {
            // Коэффициент НЕ соответствует ожидаемому
            coefficientMatch = false;
            if (effectiveActual < expected) {
                description = ``;
            } else {
                description = ``;
            }
            status = 'Обратите внимание';
            statusCategory = 'warning';
        }
        
        // Добавляем описание из БД, если оно есть
        if (baseDescription && baseDescription.trim() && baseDescription !== '—') {
            let cleanBaseDesc = baseDescription.replace(/^[⚠️✅ℹ️❌📝]\s*/, '').trim();
            if (cleanBaseDesc) {
                description = `${cleanBaseDesc}\n${description}`;
            }
        }
        
        return {
            status,
            description,
            statusCategory,
            coefficientMatch,
            expectedCoefficient: expected,
            actualCoefficient: effectiveActual
        };
    }
    
    // Случай 4: в БД НЕТ ожидаемого коэффициента - сравниваем с 1
    if (effectiveActual > 1) {
        coefficientMatch = false;
        description = ``;
        status = 'Обратите внимание';
        statusCategory = 'warning';
    } else if (effectiveActual < 1) {
        description = `📉 Понижающий коэффициент: ${effectiveActual.toFixed(2)} (допустимо)`;
        status = 'Доступен';
        statusCategory = 'ok';
        coefficientMatch = null;
    } else {
        description = `✅ Коэффициент 1 (норма)`;
        status = 'Доступен';
        statusCategory = 'ok';
        coefficientMatch = true;
    }
    
    // Добавляем описание из БД, если оно есть
    if (baseDescription && baseDescription.trim() && baseDescription !== '—' && effectiveActual !== 1) {
        let cleanBaseDesc = baseDescription.replace(/^[⚠️✅ℹ️❌📝]\s*/, '').trim();
        if (cleanBaseDesc) {
            description = `${cleanBaseDesc}\n${description}`;
        }
    }
    
    return {
        status,
        description,
        statusCategory,
        coefficientMatch,
        expectedCoefficient: expected,
        actualCoefficient: effectiveActual
    };
}

function encodeCoefficientMatch(value) {
    if (value === true) return 1;
    if (value === false) return -1;
    return 0;
}

function decodeCoefficientMatch(value) {
    if (value === 1) return true;
    if (value === -1) return false;
    return null;
}

module.exports = {
    evaluateCoefficientAnalysis,
    encodeCoefficientMatch,
    decodeCoefficientMatch
};