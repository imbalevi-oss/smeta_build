// shareds/estimate-parser.js
// ЕДИНЫЙ МОДУЛЬ ПАРСИНГА СМЕТНЫХ ФАЙЛОВ
// Объединяет estimate-parser-config.js и full-estimate-parser.js

const XLSX = require('xlsx');

// ==================== КОНФИГУРАЦИЯ ====================

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
    
    universal: {
        name: 'Универсальный',
        headerKeywords: [
            '№', 'п/п', 'пп', 'шифр', 'расценки', 'код', 'ресурс',
            'наименование', 'работ', 'затрат', 'ед', 'изм', 'единица',
            'кол-во', 'количество', 'цена', 'стоимость', 'поправоч',
            'коэф', 'коэффициент', 'зимн', 'удорож', 'пересчет',
            'пересчёт', 'всего', 'итого', 'затрат'
        ],
        searchCoefficientLines: 7
    },
    
    defect: {
        name: 'Дефектный акт',
        coefficientColumns: [17, 18, 20, 22],
        headerRow: 18,
        startRow: 21,
        totalKeywords: ['всего', 'итого', 'итог', 'ндс', 'всего по смете', 'всего с ндс']
    }
};

// ==================== БАЗОВЫЕ УТИЛИТЫ ====================

/**
 * Парсинг числа из строки (с запятой и пробелами)
 */
function parseNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return value;
    let str = String(value).trim();
    if (str === '') return 0;
    str = str.replace(/\s/g, '').replace(',', '.');
    const match = str.match(/-?\d+(?:\.\d+)?/);
    if (match) {
        const num = parseFloat(match[0]);
        return isNaN(num) ? 0 : num;
    }
    return 0;
}

/**
 * Парсинг числа с запятой (возвращает null если не число)
 */
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

/**
 * Извлечение числового значения из строки
 */
function extractNumericValue(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    const match = String(str).match(/(\d+(?:[.,]\d+)?)/);
    if (match) {
        return parseFloat(match[1].replace(',', '.'));
    }
    return 0;
}

/**
 * Извлечение единицы измерения из строки
 */
function extractUnit(str) {
    if (!str) return '';
    const strClean = String(str).trim();
    
    if (/^[а-яА-ЯёЁa-zA-Z][а-яА-ЯёЁa-zA-Z\/\.²³]*$/.test(strClean)) {
        return strClean.replace('2', '²').replace('3', '³');
    }
    
    const match = strClean.match(/\d+(?:[.,]\d+)?\s*([а-яА-ЯёЁa-zA-Z0-9\/\.²³]+)/);
    if (match && match[1]) {
        let unit = match[1].trim();
        unit = unit.replace('2', '²').replace('3', '³');
        return unit;
    }
    
    if (!/^[\d\s.,-]+$/.test(strClean) && strClean.length > 0) {
        return strClean;
    }
    
    return '';
}

/**
 * Форматирование числа
 */
function formatNumber(num) {
    if (num === null || num === undefined) return '—';
    return num.toString().replace('.', ',');
}

// ==================== РАБОТА С КОДАМИ ====================

/**
 * Извлечение кода из строки (игнорируем текст после кода)
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
    
    const patterns = [
        /^(\d+\.\d+-\d+-\d+-\d+\/\d+)/,
        /^(\d+\.\d+-\d+-\d+-\d+)/,
        /^(\d+\.\d+-\d+-\d+)/,
        /^(\d{1,2}-\d{2}-\d{3}-\d{2}(?:\/\d+)?)/,
        /^(\d{1,2}-\d{2}-\d{3}-\d{2})/,
        /^(\d{1,2}\.\d{2}-\d{3}-\d{2}(?:-\d+)?)/,
        /^(\d{1,2}\.\d{2}\.\d{3}\.\d{2})/,
        /^(?:ГЭСН|ФЕР|ТЕР|СН|МТСН|ТСН|МРР)?\s*(\d{1,2}[.-]\d{2}[.-]\d{3}[.-]\d{2}(?:-\d+)?(?:\/\d+)?)/i,
        /^(\d+\.\d+\.\d+\.\d+)/,
        /^(\d+\.\d+-\d+-\d+)/,
        /^(\d+-\d+-\d+-\d+)/,
        /^(\d+)/
    ];
    
    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
            let code = match[1];
            code = code.replace(/[^0-9.\-\/]/g, '');
            if (code && code.length > 2) {
                const comment = trimmed.substring(match[0].length).trim();
                return { code, comment };
            }
        }
    }
    
    return { code: null, comment: trimmed };
}

/**
 * Проверка, является ли строка чистым текстом (без кода)
 */
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

/**
 * Проверка, является ли код реставрационным
 */
function isRestorationCode(code) {
    if (!code) return false;
    const normCode = normalizeCode(code);
    const patterns = [
        /^\d+\.\d+-5[1-9]\d{2}/,
        /[-\/]5[1-9]\d{2}[-\/]/
    ];
    return patterns.some(pattern => pattern.test(normCode));
}

/**
 * Нормализация кода (удаление пробелов, замена спецсимволов)
 */
function normalizeCode(code) {
    if (!code) return '';
    return String(code)
        .trim()
        .replace(/\s+/g, '')
        .replace(/[‑–—]/g, '-')
        .replace(/[\\/]/g, '/')
        .toLowerCase();
}

// ==================== РАБОТА С ПОЗИЦИЯМИ ====================

/**
 * Проверка, является ли значение номером позиции
 */
function isPositionNumber(str) {
    if (!str && str !== 0) return false;
    const trimmed = String(str).trim();
    if (trimmed === '') return false;
    const normalized = trimmed.replace(/,/g, '.');
    return /^\d+(\.\d+)*$/.test(normalized);
}

/**
 * Нормализация номера позиции
 */
function normalizePositionNumber(str) {
    if (!str && str !== 0) return '';
    const trimmed = String(str).trim();
    if (trimmed === '') return '';
    return trimmed.replace(/,/g, '.');
}

/**
 * Проверка, является ли строка заголовком
 */
function isHeaderRow(str) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim().toLowerCase();
    return trimmed === 'шифр стоимостного норматива и коды ресурсов' ||
           trimmed === 'шифр стоимостного норматива и коды ресурсов:' ||
           trimmed.includes('шифр стоимостного норматива');
}

// ==================== ПОИСК ЗАГОЛОВКОВ И КОЛОНОК ====================

/**
 * Поиск строк-заголовков в файле
 */
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

/**
 * Определение колонок по многострочному заголовку
 */
function detectColumnsFromMultiRowHeader(data, headerRows) {
    const columns = { position: -1, code: -1, coefficient: -1, amount: -1 };
    const keywords = PARSER_CONFIG.columnKeywords;
    
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

/**
 * Определение колонки позиций
 */
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

/**
 * Определение колонки кодов
 */
function detectCodeColumn(data, startRow) {
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

/**
 * Определение колонки коэффициентов
 */
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

/**
 * Определение колонки суммы (универсальный)
 */
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
                console.log(`   ✅ Найдена колонка суммы по заголовку: ${col + 1}`);
                return col;
            }
        }
    }
    
    const startRow = headerRows.length > 0 ? Math.max(...headerRows) + 1 : 27;
    
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
    
    console.log(`   📍 Колонка суммы определена по содержанию: ${bestCol + 1}`);
    return bestCol;
}

/**
 * Определение строки начала данных
 */
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

/**
 * Извлечение итоговой суммы
 */
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
    
    return { totalAmount: null, foundRow: null };
}

// ==================== РАБОТА С МАТЕРИАЛЬНЫМИ РЕСУРСАМИ (МР) ====================

/**
 * Проверка, является ли строка МР (материальные ресурсы)
 */
function isMR(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase().trim();
    if (lowerText === 'мр') return true;
    if (lowerText.startsWith('мр') || lowerText.startsWith('мр ')) return true;
    if (/\bмр\b/.test(lowerText)) return true;
    if (lowerText.includes('материал')) return true;
    return false;
}

/**
 * Расчет объема (количество × единица измерения)
 */
function calculateVolume(quantity, unitStr) {
    const qty = parseNumber(quantity);
    const unitValue = extractNumericValue(unitStr);
    
    if (unitValue > 0 && qty > 0) {
        return qty * unitValue;
    }
    return qty;
}

/**
 * Форматирование объема с единицей измерения
 */
function formatVolume(volume, unitStr) {
    if (volume === 0) return '';
    
    const unit = extractUnit(unitStr);
    const formattedVolume = volume.toLocaleString('ru-RU', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 3 
    });
    
    if (unit && unit.length > 0) {
        return `${formattedVolume} ${unit}`;
    }
    
    return formattedVolume;
}

// ==================== ОСНОВНАЯ ФУНКЦИЯ ПАРСИНГА ====================

/**
 * Полный парсинг сметного файла (с детализацией и МР)
 */
function parseFullEstimate(fileBuffer) {
    console.log('\n' + '='.repeat(70));
    console.log('🔍 FULL ESTIMATE PARSER - ЕДИНАЯ ВЕРСИЯ');
    console.log('='.repeat(70));
    
    try {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        
        console.log(`📄 Лист: ${workbook.SheetNames[0]}, строк: ${data.length}`);
        
        // Вывод структуры для отладки
        console.log('\n📋 СТРУКТУРА ФАЙЛА (первые 10 строк):');
        for (let idx = 0; idx < Math.min(10, data.length); idx++) {
            const row = data[idx];
            if (row) {
                console.log(`  Строка ${idx + 1}: [0]=${row[0] || '""'}, [1]=${row[1] || '""'}, [2]=${(row[2] || '""').substring(0, 40)}`);
            }
        }
        
        const positions = [];
        let i = 0;
        const totalRows = data.length;
        
        // Поиск заголовков и начало данных
        const headerRows = findHeaderRows(data);
        const startRow = findDataStartRow(data, headerRows);
        
        console.log(`\n🔍 Начало парсинга с строки ${startRow + 1}...`);
        i = startRow;
        
        while (i < totalRows) {
            const row = data[i];
            if (!row) { i++; continue; }
            
            const positionNumber = row[0] ? String(row[0]).trim() : '';
            const codeCell = row[1] ? String(row[1]).trim() : '';
            const nameCell = row[2] ? String(row[2]).trim() : '';
            const unitCell = row[3] ? String(row[3]).trim() : '';
            const quantityFromRow = parseNumber(row[4]);
            const priceFromRow = parseNumber(row[5]);
            const amountFromRow = parseNumber(row[9]);
            
            // Пропускаем служебные строки
            const firstCellLower = (row[0] || '').toString().toLowerCase();
            if (firstCellLower.includes('итого') || 
                firstCellLower.includes('раздел') ||
                firstCellLower.includes('составил') ||
                firstCellLower.includes('проверил')) {
                i++;
                continue;
            }
            
            // Проверка на наличие номера позиции
            if (!positionNumber || !/^\d+/.test(positionNumber)) {
                i++;
                continue;
            }
            
            const isTextPosition = codeCell.toLowerCase().includes('цена поставщика') || codeCell === '';
            
            // Сбор деталей (строки после позиции)
            let details = [];
            let sumAllDetails = 0;
            let mrTotal = 0;
            let mrDetails = [];
            let j = i + 1;
            
            while (j < totalRows) {
                const nextRow = data[j];
                if (!nextRow) { j++; continue; }
                
                const nextPositionNum = nextRow[0] ? String(nextRow[0]).trim() : '';
                const isNewPosition = nextPositionNum && /^\d+/.test(nextPositionNum);
                
                if (isNewPosition) break;
                
                const detailText = nextRow[2] ? String(nextRow[2]).trim() : '';
                if (detailText === '') { j++; continue; }
                
                let detailAmount = parseNumber(nextRow[9]);
                const quantity = parseNumber(nextRow[4]);
                const price = parseNumber(nextRow[5]);
                const unit = nextRow[3] ? String(nextRow[3]).trim() : '';
                
                if (detailAmount === 0 && quantity !== 0 && price !== 0) {
                    const coeffMain = parseNumber(nextRow[6]) || 1;
                    const coeffWinter = parseNumber(nextRow[7]) || 1;
                    const coeffRecalc = parseNumber(nextRow[8]) || 1;
                    detailAmount = quantity * price * coeffMain * coeffWinter * coeffRecalc;
                }
                
                sumAllDetails += detailAmount;
                
                const volume = calculateVolume(quantity, unit);
                const formattedVolume = formatVolume(volume, unit);
                
                details.push({
                    type: detailText,
                    amount: detailAmount,
                    quantity: quantity,
                    price: price,
                    unit: unit,
                    volume: volume,
                    formattedVolume: formattedVolume,
                    rowNumber: j + 1
                });
                
                if (isMR(detailText)) {
                    mrTotal += detailAmount;
                    mrDetails.push({
                        type: 'МР',
                        originalType: detailText,
                        amount: detailAmount,
                        quantity: quantity,
                        price: price,
                        unit: unit,
                        volume: volume,
                        formattedVolume: formattedVolume,
                        rowNumber: j + 1
                    });
                }
                
                j++;
            }
            
            // Расчет общей суммы
            let totalAmount = sumAllDetails;
            if (totalAmount === 0 && quantityFromRow !== 0 && priceFromRow !== 0) {
                totalAmount = quantityFromRow * priceFromRow;
            }
            if (totalAmount === 0 && amountFromRow !== 0) {
                totalAmount = amountFromRow;
            }
            
            const textPositionFlag = isTextPosition || details.length > 0;
            
            positions.push({
                positionNumber: positionNumber,
                code: codeCell || nameCell,
                extractedCode: isTextPosition ? null : extractCodeFromString(codeCell).code,
                name: nameCell,
                unit: unitCell,
                quantity: quantityFromRow,
                price: priceFromRow,
                volume: calculateVolume(quantityFromRow, unitCell),
                formattedVolume: formatVolume(calculateVolume(quantityFromRow, unitCell), unitCell),
                totalAmount: totalAmount,
                amountFromRow: amountFromRow,
                details: details,
                mrDetails: mrDetails,
                mrTotalAmount: mrTotal,
                sumAllDetails: sumAllDetails,
                isTextPosition: textPositionFlag,
                isText: textPositionFlag,
                hasDetails: details.length > 0
            });
            
            i = j;
        }
        
        // Итоговая статистика
        const totalFullAmount = positions.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
        const totalMrAmount = positions.reduce((sum, p) => sum + (p.mrTotalAmount || 0), 0);
        const textPositions = positions.filter(p => p.isTextPosition).length;
        
        console.log('\n' + '='.repeat(70));
        console.log(`📊 РЕЗУЛЬТАТЫ ПАРСИНГА:`);
        console.log(`   Всего позиций: ${positions.length}`);
        console.log(`   Из них текстовых: ${textPositions}`);
        console.log(`   ОБЩАЯ СУММА: ${totalFullAmount.toLocaleString('ru-RU')} ₽`);
        console.log(`   ОБЩАЯ СУММА МР: ${totalMrAmount.toLocaleString('ru-RU')} ₽`);
        console.log('='.repeat(70) + '\n');
        
        return {
            success: true,
            totalAmount: totalFullAmount,
            totalMrAmount: totalMrAmount,
            totalAmountFormatted: totalFullAmount.toLocaleString('ru-RU'),
            positions: positions,
            stats: {
                totalPositions: positions.length,
                textPositions: textPositions,
                totalMrAmount: totalMrAmount,
                totalMrRows: positions.reduce((sum, p) => sum + (p.mrDetails || []).length, 0)
            }
        };
        
    } catch (error) {
        console.error('❌ Ошибка в parseFullEstimate:', error);
        return {
            success: false,
            error: error.message,
            totalAmount: 0,
            totalMrAmount: 0,
            totalAmountFormatted: '0',
            positions: [],
            stats: {
                totalPositions: 0,
                textPositions: 0,
                totalMrAmount: 0,
                totalMrRows: 0
            }
        };
    }
}

// ==================== ЭКСПОРТ ====================

module.exports = {
    // Конфигурация
    PARSER_CONFIG,
    
    // Базовые утилиты
    parseNumber,
    parseNumberWithComma,
    extractNumericValue,
    extractUnit,
    formatNumber,
    
    // Работа с кодами
    extractCodeFromString,
    isPureText,
    isRestorationCode,
    normalizeCode,
    
    // Работа с позициями
    isPositionNumber,
    normalizePositionNumber,
    isHeaderRow,
    
    // Поиск колонок
    findHeaderRows,
    detectColumnsFromMultiRowHeader,
    detectPositionColumn,
    detectCodeColumn,
    detectCoefficientColumn,
    detectAmountColumnUniversal,
    findDataStartRow,
    extractTotalAmount,
    
    // Работа с МР
    isMR,
    calculateVolume,
    formatVolume,
    
    // Основная функция
    parseFullEstimate
};