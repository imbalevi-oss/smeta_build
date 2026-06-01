// shareds/estimate-parser-config.js
// Конфигурация парсера сметных файлов

const PARSER_CONFIG = {
    columnKeywords: {
        position: ['№', 'п/п', 'пп', 'номер', 'поз', 'pos', 'num'],
        code: ['шифр', 'расценки', 'код', 'ресурс', 'норматив', 'code'],
        name: ['наименование', 'работ', 'затрат', 'name'],
        unit: ['единица', 'измерения', 'ед.изм', 'unit'],
        quantity: ['кол-во', 'количество', 'quantity', 'объем'],
        price: ['цена', 'стоимость', 'price', 'расценка'],
        coefficient: ['поправоч', 'коэф', 'зимн', 'удорож', 'пересчет', 'k', 'коэффициент', 'coeff'],
        amount: ['всего', 'итого', 'сумма', 'затрат', 'amount', 'total']
    },
    
    standard: {
        name: 'Стандартный',
        description: 'A-позиция, B-код, G-коэф, I-сумма',
        columns: {
            position: 0,
            code: 1,
            coefficient: 6,
            amount: 8
        },
        headerRow: 26,
        startRow: 27,
        searchCoefficientLines: 7,
        hasCoefficients: true
    },
    
    shifted: {
        name: 'Смещенный',
        description: 'B-позиция, C-код, H-коэф, J-сумма',
        columns: {
            position: 1,
            code: 2,
            coefficient: 7,
            amount: 9
        },
        headerRow: 26,
        startRow: 27,
        searchCoefficientLines: 7,
        hasCoefficients: true
    },
    
    universal: {
        name: 'Универсальный',
        description: 'Автоматическое определение колонок по заголовкам',
        columns: null,
        headerRow: null,
        startRow: null,
        searchCoefficientLines: 7,
        hasCoefficients: true,
        
        columnKeywords: {
            position: ['№', 'п/п', 'пп', 'номер', 'поз', 'pos', 'num'],
            code: ['шифр', 'расценки', 'код', 'ресурс', 'норматив', 'code'],
            coefficient: ['поправоч', 'коэф', 'зимн', 'удорож', 'пересчет', 'k', 'коэффициент', 'coeff', 'к='],
            amount: ['всего', 'итого', 'сумма', 'стоимость', 'цена', 'затрат', 'amount', 'total']
        },
        
        headerKeywords: [
            '№', 'п/п', 'пп', 'шифр', 'расценки', 'код', 'ресурс',
            'наименование', 'работ', 'затрат', 'ед', 'изм', 'единица',
            'кол-во', 'количество', 'цена', 'стоимость', 'поправоч',
            'коэф', 'коэффициент', 'зимн', 'удорож', 'пересчет',
            'пересчёт', 'всего', 'итого', 'затрат'
        ],
        
        codePatterns: [
            /^\d+\.\d+-\d+-\d+-\d+\/\d+$/,
            /^\d+\.\d+-\d+-\d+-\d+$/,
            /^\d+\.\d+-\d+-\d+$/,
            /^\d+\.\d+-\d+$/,
            /^\d+\.\d+$/,
            /^\d+$/
        ]
    },
    
    defect: {
        name: 'Дефектный акт',
        description: 'A-№пп, C-код (C+D+E), R/S/U/W-коэф, X-сумма',
        columns: {
            position: 0,
            code: 2,
            codeExtra1: 3,
            codeExtra2: 4,
            name: 6,
            unit: 10,
            quantity: 12,
            price: 15,
            coeffMain1: 17,
            coeffMain2: 18,
            coeffWinter: 20,
            coeffRecalc: 22,
            amount: 23
        },
        coefficientColumns: [17, 18, 20, 22],
        headerRow: 18,
        startRow: 21,
        searchCoefficientLines: 7,
        hasCoefficients: true,
        totalKeywords: ['всего', 'итого', 'итог', 'ндс', 'всего по смете', 'всего с ндс']
    }
};

// ==================== ИЗВЛЕЧЕНИЕ КОДА (ИГНОРИРУЕМ ТЕКСТ ПОСЛЕ) ====================

/**
 * Извлечение кода из строки (игнорируем весь текст после кода)
 * Пример: "11-01-001-01 Текст после кода" -> код "11-01-001-01"
 */
// shareds/estimate-parser-config.js - обновлённая функция extractCodeFromString

/**
 * Извлечение кода из строки (игнорируем весь текст после кода)
 * Поддерживает форматы:
 * - 1.49-9201-1-3/1
 * - 11-01-001-01
 * - 11.01-001-01
 * - 11.01.001.01
 * - ГЭСН 11-01-001-01
 */
function extractCodeFromString(str) {
    if (!str || typeof str !== 'string') return { code: null, comment: '' };
    
    const trimmed = str.trim();
    if (trimmed === '') return { code: null, comment: '' };
    
    // Паттерны для поиска кода в начале строки (от более специфичных к общим)
    const patterns = [
        // Формат: 1.49-9201-1-3/1 (цифра.цифры-цифры-цифра-цифра/цифра)
        /^(\d+\.\d+-\d+-\d+-\d+\/\d+)/,
        // Формат: 1.49-9201-1-3 (цифра.цифры-цифры-цифра-цифра)
        /^(\d+\.\d+-\d+-\d+-\d+)/,
        // Формат: 1.49-9201-1 (цифра.цифры-цифры-цифра)
        /^(\d+\.\d+-\d+-\d+)/,
        // Формат: 11-01-001-01/1
        /^(\d{1,2}-\d{2}-\d{3}-\d{2}(?:\/\d+)?)/,
        // Формат: 11-01-001-01
        /^(\d{1,2}-\d{2}-\d{3}-\d{2})/,
        // Формат: 11.01-001-01
        /^(\d{1,2}\.\d{2}-\d{3}-\d{2}(?:-\d+)?)/,
        // Формат: 11.01.001.01
        /^(\d{1,2}\.\d{2}\.\d{3}\.\d{2})/,
        // Формат: ГЭСН 11-01-001-01, ФЕР, ТЕР, СН
        /^(?:ГЭСН|ФЕР|ТЕР|СН|МТСН|ТСН|МРР)?\s*(\d{1,2}[.-]\d{2}[.-]\d{3}[.-]\d{2}(?:-\d+)?(?:\/\d+)?)/i,
        // Формат: 1.2.3.4
        /^(\d+\.\d+\.\d+\.\d+)/,
        // Формат: 1.2-3-4
        /^(\d+\.\d+-\d+-\d+)/,
        // Формат: 1-2-3-4
        /^(\d+-\d+-\d+-\d+)/,
        // Формат: просто число
        /^(\d+)/
    ];
    
    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
            let code = match[1];
            // Очищаем код от недопустимых символов (оставляем цифры, точки, дефисы, слэши)
            code = code.replace(/[^0-9.\-\/]/g, '');
            if (code && code.length > 2) {
                const comment = trimmed.substring(match[0].length).trim();
                return { code, comment };
            }
        }
    }
    
    // Если код не найден, проверяем: может быть строка начинается с кода без пробела
    const codeOnlyMatch = trimmed.match(/^(\d{1,2}[.-]\d{2}[.-]\d{3}[.-]\d{2}(?:\/\d+)?)/);
    if (codeOnlyMatch) {
        return { code: codeOnlyMatch[1], comment: trimmed.substring(codeOnlyMatch[1].length).trim() };
    }
    
    return { code: null, comment: trimmed };
}

// ==================== ФУНКЦИИ ПОИСКА ЗАГОЛОВКОВ ====================

function findHeaderRows(data) {
    const headerRows = [];
    const headerKeywords = PARSER_CONFIG.universal.headerKeywords;
    
    for (let i = 0; i < Math.min(50, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
        let hasHeaderWord = false;
        
        for (const kw of headerKeywords) {
            if (rowStr.includes(kw)) {
                hasHeaderWord = true;
                break;
            }
        }
        
        if (hasHeaderWord) {
            headerRows.push(i);
        }
    }
    
    return headerRows;
}

function findHeaderRow(data) {
    const headerKeywords = PARSER_CONFIG.universal.headerKeywords;
    
    let bestRowIndex = -1;
    let maxMatches = 0;
    
    for (let i = 0; i < Math.min(50, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
        let matchCount = 0;
        
        for (const kw of headerKeywords) {
            if (rowStr.includes(kw)) {
                matchCount++;
            }
        }
        
        if (matchCount > maxMatches) {
            maxMatches = matchCount;
            bestRowIndex = i;
        }
    }
    
    if (maxMatches >= 3) return bestRowIndex;
    
    for (let i = 0; i < Math.min(50, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
        if ((rowStr.includes('№') && rowStr.includes('п/п')) || 
            rowStr.includes('шифр') || rowStr.includes('расценки')) {
            return i;
        }
    }
    
    return 26;
}

function detectColumnsFromMultiRowHeader(data, headerRows) {
    const columns = { position: -1, code: -1, coefficient: -1, amount: -1 };
    const keywords = PARSER_CONFIG.universal.columnKeywords;
    
    const headerCells = [];
    
    for (const rowIdx of headerRows) {
        const row = data[rowIdx];
        if (!row) continue;
        
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
            const cell = String(row[colIdx] || '').toLowerCase();
            if (!headerCells[colIdx]) headerCells[colIdx] = '';
            headerCells[colIdx] += ' ' + cell;
        }
    }
    
    headerCells.forEach((cellStr, index) => {
        if (!cellStr) return;
        
        if (columns.position === -1 && keywords.position.some(kw => cellStr.includes(kw))) {
            columns.position = index;
        }
        if (columns.code === -1 && keywords.code.some(kw => cellStr.includes(kw))) {
            columns.code = index;
        }
        if (columns.coefficient === -1 && keywords.coefficient.some(kw => cellStr.includes(kw))) {
            columns.coefficient = index;
        }
        if (columns.amount === -1 && keywords.amount.some(kw => cellStr.includes(kw))) {
            columns.amount = index;
        }
    });
    
    return columns;
}

function detectColumnsFromHeader(headerRow) {
    if (!headerRow || !Array.isArray(headerRow)) {
        return { position: -1, code: -1, coefficient: -1, amount: -1 };
    }
    
    const columns = { position: -1, code: -1, coefficient: -1, amount: -1 };
    const keywords = PARSER_CONFIG.universal.columnKeywords;
    
    headerRow.forEach((cell, index) => {
        if (!cell) return;
        const cellStr = String(cell).toLowerCase();
        
        if (columns.position === -1 && keywords.position.some(kw => cellStr.includes(kw))) {
            columns.position = index;
        }
        if (columns.code === -1 && keywords.code.some(kw => cellStr.includes(kw))) {
            columns.code = index;
        }
        if (columns.coefficient === -1 && keywords.coefficient.some(kw => cellStr.includes(kw))) {
            columns.coefficient = index;
        }
        if (columns.amount === -1 && keywords.amount.some(kw => cellStr.includes(kw))) {
            columns.amount = index;
        }
    });
    
    return columns;
}

function findDataStartRow(data, headerRows) {
    if (!headerRows || headerRows.length === 0) return 27;
    
    const lastHeaderRow = Math.max(...headerRows);
    
    for (let i = lastHeaderRow + 1; i < Math.min(lastHeaderRow + 15, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        for (let j = 0; j < Math.min(5, row.length); j++) {
            if (isPositionNumber(row[j])) return i;
        }
    }
    
    return lastHeaderRow + 1;
}

function detectPositionColumn(data, startRow) {
    for (let i = startRow; i < Math.min(startRow + 30, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        for (let j = 0; j < Math.min(5, row.length); j++) {
            if (isPositionNumber(row[j])) return j;
        }
    }
    return 0;
}

function detectCodeColumn(data, startRow) {
    const codePatterns = PARSER_CONFIG.universal.codePatterns;
    
    for (let i = startRow; i < Math.min(startRow + 30, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        for (let j = 0; j < row.length; j++) {
            const cell = String(row[j] || '').trim();
            const extracted = extractCodeFromString(cell);
            if (extracted.code) return j;
        }
    }
    return 1;
}

function detectCoefficientColumn(data, startRow) {
    for (let i = startRow; i < Math.min(startRow + 30, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        for (let j = 3; j < Math.min(13, row.length); j++) {
            const coeffVal = parseNumberWithComma(row[j]);
            if (coeffVal !== null && coeffVal > 0.1 && coeffVal < 100) {
                return j;
            }
        }
    }
    return 6;
}

function detectAmountColumn(data, startRow) {
    console.log(`   🔍 Поиск колонки суммы...`);
    
    const totalKeywords = ['всего затрат', 'итого затрат', 'всего', 'итого', 'сумма', 'amount', 'total'];
    
    for (let i = 0; i < Math.min(50, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        for (let col = 0; col < Math.min(row.length, 20); col++) {
            const cell = String(row[col] || '').toLowerCase();
            for (const kw of totalKeywords) {
                if (cell.includes(kw)) {
                    console.log(`   ✅ Найдена колонка суммы по заголовку: ${col + 1} (${String.fromCharCode(65 + col)}) - "${row[col]}"`);
                    return col;
                }
            }
        }
    }
    
    const totalRowKeywords = ['всего по смете', 'итого по смете', 'всего', 'итого', 'ндс'];
    
    for (let i = data.length - 1; i >= Math.max(0, data.length - 100); i--) {
        const row = data[i];
        if (!row) continue;
        
        const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
        let hasTotalKeyword = false;
        for (const kw of totalRowKeywords) {
            if (rowStr.includes(kw)) {
                hasTotalKeyword = true;
                break;
            }
        }
        
        if (hasTotalKeyword) {
            let maxAmount = 0;
            let maxCol = -1;
            for (let col = 0; col < Math.min(row.length, 15); col++) {
                const amount = parseNumberWithComma(row[col]);
                if (amount !== null && amount > maxAmount && amount > 1000) {
                    maxAmount = amount;
                    maxCol = col;
                }
            }
            if (maxCol !== -1) {
                console.log(`   ✅ Найдена колонка суммы по итоговой строке: ${maxCol + 1} (${String.fromCharCode(65 + maxCol)})`);
                return maxCol;
            }
        }
    }
    
    const columnSums = {};
    const columnCounts = {};
    
    for (let i = startRow; i < Math.min(startRow + 200, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        const firstCell = row[0] ? String(row[0]).toLowerCase() : '';
        if (firstCell.includes('итого') || firstCell.includes('раздел')) continue;
        
        for (let col = 3; col < Math.min(row.length, 15); col++) {
            const amount = parseNumberWithComma(row[col]);
            if (amount !== null && amount > 1000 && amount < 1000000000) {
                if (!columnSums[col]) columnSums[col] = 0;
                if (!columnCounts[col]) columnCounts[col] = 0;
                columnSums[col] += amount;
                columnCounts[col]++;
            }
        }
    }
    
    let bestCol = 8;
    let maxSum = 0;
    
    for (let col = 3; col <= 12; col++) {
        const sum = columnSums[col] || 0;
        const count = columnCounts[col] || 0;
        if (count > 3 && sum > maxSum) {
            maxSum = sum;
            bestCol = col;
        }
    }
    
    for (let col of [8, 9, 10, 11, 12]) {
        const sum = columnSums[col] || 0;
        const count = columnCounts[col] || 0;
        if (count > 3 && sum > maxSum) {
            maxSum = sum;
            bestCol = col;
        }
    }
    
    console.log(`   📍 Колонка суммы определена по содержанию: ${bestCol + 1} (${String.fromCharCode(65 + bestCol)})`);
    return bestCol;
}

function detectAmountColumnUniversal(data, headerRows) {
    console.log(`   🔍 Поиск колонки суммы (универсальный)...`);
    
    for (const headerRowIdx of headerRows) {
        const headerRow = data[headerRowIdx];
        if (!headerRow) continue;
        for (let col = 0; col < headerRow.length; col++) {
            const cell = String(headerRow[col] || '').toLowerCase();
            if (cell.includes('всего затрат') || 
                cell === 'всего затрат, руб.' || 
                cell.includes('итого затрат') ||
                cell.includes('всего затрат, руб') ||
                cell === 'всего' ||
                cell === 'итого') {
                console.log(`   ✅ Найдена колонка суммы по заголовку: ${col + 1} (${String.fromCharCode(65 + col)})`);
                return col;
            }
        }
    }
    
    const startRow = headerRows.length > 0 ? Math.max(...headerRows) + 1 : 27;
    
    for (let i = data.length - 1; i >= Math.max(0, data.length - 100); i--) {
        const row = data[i];
        if (!row) continue;
        
        const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
        if (rowStr.includes('всего по смете') || rowStr.includes('итого по смете')) {
            for (let col = 5; col < Math.min(row.length, 15); col++) {
                const amount = parseNumberWithComma(row[col]);
                if (amount !== null && amount > 1000) {
                    console.log(`   ✅ Найдена колонка суммы по итоговой строке: ${col + 1} (${String.fromCharCode(65 + col)})`);
                    return col;
                }
            }
        }
    }
    
    const columnSums = {};
    for (let i = startRow; i < Math.min(startRow + 300, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        const firstCell = row[0] ? String(row[0]).toLowerCase() : '';
        if (firstCell.includes('итого')) continue;
        
        for (let col = 5; col < Math.min(row.length, 15); col++) {
            const amount = parseNumberWithComma(row[col]);
            if (amount !== null && amount > 1000 && amount < 1000000000) {
                if (!columnSums[col]) columnSums[col] = 0;
                columnSums[col] += amount;
            }
        }
    }
    
    let bestCol = 9;
    let maxSum = 0;
    for (let col = 5; col <= 12; col++) {
        const sum = columnSums[col] || 0;
        if (sum > maxSum) {
            maxSum = sum;
            bestCol = col;
        }
    }
    
    console.log(`   📍 Колонка суммы определена по содержанию: ${bestCol + 1} (${String.fromCharCode(65 + bestCol)})`);
    return bestCol;
}

function detectAmountColumnByData(data, startSearchRow) {
    for (let i = startSearchRow; i < Math.min(startSearchRow + 50, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        if (row[9] && parseNumberWithComma(row[9]) !== 0) return 9;
        if (row[10] && parseNumberWithComma(row[10]) !== 0) return 10;
    }
    return 9;
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function isPositionNumber(str) {
    if (!str && str !== 0) return false;
    const trimmed = String(str).trim();
    if (trimmed === '') return false;
    const normalized = trimmed.replace(/,/g, '.');
    return /^\d+(\.\d+)*$/.test(normalized);
}

function normalizePositionNumber(str) {
    if (!str && str !== 0) return '';
    const trimmed = String(str).trim();
    if (trimmed === '') return '';
    return trimmed.replace(/,/g, '.');
}

function isHeaderRow(str) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim().toLowerCase();
    return trimmed === 'шифр стоимостного норматива и коды ресурсов' ||
           trimmed === 'шифр стоимостного норматива и коды ресурсов:' ||
           trimmed.includes('шифр стоимостного норматива');
}

function isPureText(str) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (trimmed.length === 0) return false;
    
    const { code } = extractCodeFromString(str);
    if (code) return false;
    
    const textPhrases = ['цена поставщика', 'поправка', 'примечание', 'сн-2012', 'сн2012', 'письмо', 'разъяснение', 'минстрой'];
    const lowerTrimmed = trimmed.toLowerCase();
    if (textPhrases.some(phrase => lowerTrimmed.includes(phrase))) return true;
    if (/^[a-zA-Zа-яА-ЯёЁ]/.test(trimmed)) return true;
    
    return false;
}

function extractTotalAmount(data, amountColumn) {
    const totalKeywords = ['всего', 'итого', 'итог', 'ндс', 'всего по смете', 'всего с ндс'];
    let totalAmount = null;
    let foundRow = null;
    
    for (let i = data.length - 1; i >= Math.max(0, data.length - 100); i--) {
        const row = data[i];
        if (!row) continue;
        
        const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
        const hasTotalKeyword = totalKeywords.some(kw => rowStr.includes(kw));
        
        if (!hasTotalKeyword) continue;
        
        const numbersInRow = [];
        
        if (amountColumn !== undefined && amountColumn < row.length) {
            const cell = row[amountColumn];
            if (cell !== undefined && cell !== null && cell !== '') {
                const amount = parseNumberWithComma(cell);
                if (amount !== null && amount > 0) {
                    numbersInRow.push({ col: amountColumn, value: amount });
                }
            }
        }
        
        for (let j = 0; j < row.length; j++) {
            if (j === amountColumn) continue;
            const cell = row[j];
            if (cell !== undefined && cell !== null && cell !== '') {
                const amount = parseNumberWithComma(cell);
                if (amount !== null && amount > 0) {
                    numbersInRow.push({ col: j, value: amount });
                }
            }
        }
        
        if (numbersInRow.length === 0) continue;
        
        let maxNumber = numbersInRow[0];
        for (const num of numbersInRow) {
            if (num.value > maxNumber.value) maxNumber = num;
        }
        
        totalAmount = maxNumber.value;
        foundRow = i + 1;
        return { totalAmount, foundRow, actualColumn: maxNumber.col };
    }
    
    let maxAmount = 0;
    let maxRow = null;
    
    for (let i = data.length - 1; i >= Math.max(0, data.length - 50); i--) {
        const row = data[i];
        if (!row) continue;
        
        for (let j = 5; j < Math.min(15, row.length); j++) {
            const cell = row[j];
            if (cell !== undefined && cell !== null && cell !== '') {
                const amount = parseNumberWithComma(cell);
                if (amount !== null && amount > maxAmount) {
                    maxAmount = amount;
                    maxRow = i + 1;
                }
            }
        }
    }
    
    if (maxAmount > 0) {
        return { totalAmount: maxAmount, foundRow: maxRow };
    }
    
    return { totalAmount: null, foundRow: null };
}

function parseNumberWithComma(value) {
    if (value === null || value === undefined || value === '') return null;
    let str = String(value).trim();
    if (str === '') return null;
    
    str = str.replace(/\s/g, '');
    str = str.replace(/^[*хx≈~=<>+\\/|:;]+/, '');
    if (str === '') return null;
    
    let result;
    if (str.includes(',') && !str.includes('.')) {
        result = str.replace(',', '.');
    } else if (str.includes(',') && str.includes('.')) {
        const lastComma = str.lastIndexOf(',');
        const lastDot = str.lastIndexOf('.');
        if (lastComma > lastDot) {
            result = str.replace(/\./g, '').replace(',', '.');
        } else {
            result = str.replace(/,/g, '');
        }
    } else {
        result = str;
    }
    
    const cleaned = result.replace(/[^\d.\-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

function findCoefficientInRange(data, startRow, maxLinesDown, coefficientIndex) {
    for (let offset = 0; offset <= maxLinesDown; offset++) {
        const rowIdx = startRow + offset;
        if (rowIdx >= data.length) break;
        if (coefficientIndex.has(rowIdx)) {
            const value = coefficientIndex.get(rowIdx);
            return { value, row: rowIdx + 1, cellValue: String(value), found: true, linesDown: offset };
        }
    }
    return { value: null, row: null, cellValue: null, found: false, linesDown: null };
}

function formatNumber(num) {
    if (num === null || num === undefined) return '—';
    return num.toString().replace('.', ',');
}

function shouldShowInReport(code) {
    const status = (code.status || '').toLowerCase();
    const isRestoration = code.is_restoration === 1 || code.isRestoration === true;
    if (isRestoration) return true;
    if (status === 'обратите внимание') return true;
    if (status === 'нельзя применять') return true;
    return false;
}

function shouldShowInReportWithCoeff(item) {
    const status = (item.status || '').toLowerCase();
    const isRestoration = item.is_restoration === 1 || item.isRestoration === true;
    if (isRestoration) return true;
    if (status === 'обратите внимание') return true;
    if (status === 'нельзя применять') return true;
    if (item.isText) return true;
    if (item.coefficientProblem) return true;
    return false;
}

// ==================== ФУНКЦИИ ДЛЯ РЕЖИМА DEFECT ====================

function extractDefectCode(row, config) {
    if (!row) return { code: null, fullInfo: '' };
    
    const codeParts = [];
    
    if (config.columns.code >= 0 && config.columns.code < row.length) {
        const mainCode = String(row[config.columns.code] || '').trim();
        if (mainCode) codeParts.push(mainCode);
    }
    
    if (config.columns.codeExtra1 >= 0 && config.columns.codeExtra1 < row.length) {
        const extra1 = String(row[config.columns.codeExtra1] || '').trim();
        if (extra1) codeParts.push(extra1);
    }
    
    if (config.columns.codeExtra2 >= 0 && config.columns.codeExtra2 < row.length) {
        const extra2 = String(row[config.columns.codeExtra2] || '').trim();
        if (extra2) codeParts.push(extra2);
    }
    
    const fullInfo = codeParts.join(' ').trim();
    
    const codePatterns = PARSER_CONFIG.universal.codePatterns;
    for (const pattern of codePatterns) {
        const match = fullInfo.match(pattern);
        if (match) return { code: match[0], fullInfo };
    }
    
    const firstPart = fullInfo.split(' ')[0];
    return { code: firstPart, fullInfo };
}

function extractDefectCoefficients(row, config) {
    const coefficients = [];
    if (!row) return coefficients;
    
    for (const col of config.coefficientColumns) {
        if (col >= 0 && col < row.length) {
            const cell = row[col];
            if (cell !== undefined && cell !== null && cell !== '') {
                const coeff = parseNumberWithComma(cell);
                if (coeff !== null) {
                    coefficients.push({ column: col, value: coeff, raw: String(cell) });
                }
            }
        }
    }
    
    return coefficients;
}

function findDefectCoefficientsInRange(data, startRow, maxLinesDown, config) {
    const results = [];
    
    for (let offset = 0; offset <= maxLinesDown; offset++) {
        const rowIdx = startRow + offset;
        if (rowIdx >= data.length) break;
        
        const row = data[rowIdx];
        if (!row) continue;
        
        for (const col of config.coefficientColumns) {
            if (col >= 0 && col < row.length) {
                const cell = row[col];
                if (cell !== undefined && cell !== null && cell !== '') {
                    const coeff = parseNumberWithComma(cell);
                    if (coeff !== null) {
                        results.push({
                            value: coeff,
                            column: col,
                            row: rowIdx + 1,
                            linesDown: offset,
                            raw: String(cell)
                        });
                    }
                }
            }
        }
    }
    
    return results;
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    PARSER_CONFIG,
    extractCodeFromString,
    detectColumnsFromHeader,
    findHeaderRow,
    findHeaderRows,
    detectColumnsFromMultiRowHeader,
    findDataStartRow,
    detectCodeColumn,
    detectPositionColumn,
    detectCoefficientColumn,
    detectAmountColumn,
    detectAmountColumnUniversal,
    detectAmountColumnByData,
    extractDefectCode,
    extractDefectCoefficients,
    findDefectCoefficientsInRange,
    isPositionNumber,
    normalizePositionNumber,
    isHeaderRow,
    isPureText,
    extractTotalAmount,
    parseNumberWithComma,
    findCoefficientInRange,
    formatNumber,
    shouldShowInReport,
    shouldShowInReportWithCoeff
};