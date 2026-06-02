// shareds/estimate-parser.js
// ЕДИНЫЙ ПАРСЕР СМЕТ (с поддержкой всех деталей, объёмов и динамического определения колонок)

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

function extractNumericValue(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    const match = String(str).match(/(\d+(?:[.,]\d+)?)/);
    if (match) {
        return parseFloat(match[1].replace(',', '.'));
    }
    return 0;
}

function extractUnit(str) {
    if (!str) return '';
    const strClean = String(str).trim();
    // Если строка состоит только из букв и допустимых символов – это единица
    if (/^[а-яА-ЯёЁa-zA-Z][а-яА-ЯёЁa-zA-Z\/\.²³]*$/.test(strClean)) {
        return strClean.replace('2', '²').replace('3', '³');
    }
    // Ищем единицу после числа
    const match = strClean.match(/\d+(?:[.,]\d+)?\s*([а-яА-ЯёЁa-zA-Z0-9\/\.²³]+)/);
    if (match && match[1]) {
        let unit = match[1].trim();
        unit = unit.replace('2', '²').replace('3', '³');
        return unit;
    }
    // Если строка не похожа на число – возвращаем её как единицу
    if (!/^[\d\s.,-]+$/.test(strClean) && strClean.length > 0) {
        return strClean;
    }
    return '';
}

function calculateVolume(quantity, unitStr) {
    const qty = parseNumber(quantity);
    const unitValue = extractNumericValue(unitStr);
    let result;
    if (unitValue > 0 && qty > 0) {
        result = qty * unitValue;
        console.log(`📐 calculateVolume: ${qty} × ${unitValue} = ${result} (unitStr: "${unitStr}")`);
    } else {
        result = qty;
        console.log(`📐 calculateVolume: unitValue=${unitValue}, qty=${qty} → result=${result}`);
    }
    return result;
}

function formatVolume(volume, unitStr) {
    if (volume === 0) return '';
    const unit = extractUnit(unitStr);
    const formattedVolume = volume.toLocaleString('ru-RU', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 3 
    });
    let result;
    if (unit && unit.length > 0) {
        result = `${formattedVolume} ${unit}`;
    } else {
        result = formattedVolume;
    }
    console.log(`📐 formatVolume: volume=${volume}, unitStr="${unitStr}" → "${result}"`);
    return result;
}

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

function isMR(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase().trim();
    if (lowerText === 'мр') return true;
    if (lowerText.startsWith('мр') || lowerText.startsWith('мр ')) return true;
    if (/\bмр\b/.test(lowerText)) return true;
    if (lowerText.includes('материал')) return true;
    return false;
}

// ==================== ИЗВЛЕЧЕНИЕ КОДА (РАСШИРЕННОЕ) ====================

function extractCodeFromStrings(str) {
    if (!str || typeof str !== 'string') return { code: null, comment: '' };
    const trimmed = str.trim();
    if (trimmed === '') return { code: null, comment: '' };
    if (trimmed.toLowerCase().startsWith('цена поставщика')) {
        return { code: trimmed, comment: '' };
    }
    const patterns = [
        /^(\d+\.\d+-\d+-\d+-\d+\/\d+)/,
        /^(\d+\.\d+-\d+-\d+-\d+)/,
        /^(\d+\.\d+-\d+-\d+)/,
        /^(\d{1,2}-\d{2}-\d{3}-\d{2}(?:\/\d+)?)/,
        /^(\d{1,2}-\d{2}-\d{3}-\d{2})/,
        /^(\d{1,2}\.\d{2}-\d{3}-\d{2})/,
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

// ==================== ФУНКЦИИ ПОИСКА ЗАГОЛОВКОВ И КОЛОНОК ====================

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
        if (hasHeaderWord) headerRows.push(i);
    }
    return headerRows;
}

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
        if (columns.position === -1 && keywords.position.some(kw => cellStr.includes(kw))) columns.position = index;
        if (columns.code === -1 && keywords.code.some(kw => cellStr.includes(kw))) columns.code = index;
        if (columns.coefficient === -1 && keywords.coefficient.some(kw => cellStr.includes(kw))) columns.coefficient = index;
        if (columns.amount === -1 && keywords.amount.some(kw => cellStr.includes(kw))) columns.amount = index;
    });
    return columns;
}

function detectAmountColumnUniversal(data, headerRows) {
    for (const headerRowIdx of headerRows) {
        const headerRow = data[headerRowIdx];
        if (!headerRow) continue;
        for (let col = 0; col < headerRow.length; col++) {
            const cell = String(headerRow[col] || '').toLowerCase();
            if (cell.includes('всего затрат') || cell === 'всего затрат, руб.' || cell.includes('итого затрат') ||
                cell.includes('всего затрат, руб') || cell === 'всего' || cell === 'итого') {
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
    return bestCol;
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

function isPositionNumber(str) {
    if (!str && str !== 0) return false;
    const trimmed = String(str).trim();
    if (trimmed === '') return false;
    const normalized = trimmed.replace(/,/g, '.');
    return /^\d+(\.\d+)*$/.test(normalized);
}

function isPureText(str) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (trimmed.length === 0) return false;
    const { code } = extractCodeFromStrings(str);
    if (code) return false;
    const textPhrases = ['цена поставщика', 'поправка', 'примечание', 'сн-2012', 'сн2012', 'письмо', 'разъяснение', 'минстрой'];
    const lowerTrimmed = trimmed.toLowerCase();
    if (textPhrases.some(phrase => lowerTrimmed.includes(phrase))) return true;
    if (/^[a-zA-Zа-яА-ЯёЁ]/.test(trimmed)) return true;
    return false;
}

// ==================== ОСНОВНАЯ ФУНКЦИЯ ПАРСИНГА (УЛУЧШЕННАЯ) ====================

function parseFullEstimate(fileBuffer) {
    console.log('\n' + '='.repeat(70));
    console.log('🔍 FULL ESTIMATE PARSER - УЛУЧШЕННАЯ ВЕРСИЯ');
    console.log('='.repeat(70));

    try {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        console.log(`📄 Лист: ${workbook.SheetNames[0]}, строк: ${data.length}`);

        // Определяем структуру файла
        const headerRows = findHeaderRows(data);
        const startRow = findDataStartRow(data, headerRows);
        const columns = detectColumnsFromMultiRowHeader(data, headerRows);
        const amountCol = detectAmountColumnUniversal(data, headerRows);

        const codeCol = columns.code !== -1 ? columns.code : 1;      // B
        const nameCol = 2;           // C
        const unitCol = 3;           // D
        const quantityCol = 4;       // E
        const priceCol = 5;          // F
        const coeffCol = columns.coefficient !== -1 ? columns.coefficient : 6; // G
        const positionCol = columns.position !== -1 ? columns.position : 0;    // A

        console.log(`\n📊 Определённые колонки:`);
        console.log(`   Позиция: ${positionCol+1} (${String.fromCharCode(65+positionCol)})`);
        console.log(`   Код: ${codeCol+1} (${String.fromCharCode(65+codeCol)})`);
        console.log(`   Коэффициент: ${coeffCol+1} (${String.fromCharCode(65+coeffCol)})`);
        console.log(`   Сумма: ${amountCol+1} (${String.fromCharCode(65+amountCol)})`);
        console.log(`   Начало данных: строка ${startRow+1}`);

        const positions = [];
        let i = startRow;
        let positionCounter = 0;

        while (i < data.length) {
            const row = data[i];
            if (!row || row.length === 0) { i++; continue; }

            const codeRaw = row[codeCol] ? String(row[codeCol]).trim() : '';
            if (codeRaw === '') { i++; continue; }

            const { code: extractedCode } = extractCodeFromStrings(codeRaw);
            const isTextPos = !extractedCode && isPureText(codeRaw);

            if (!extractedCode && !isTextPos) { i++; continue; }

            positionCounter++;
            console.log(`\n📍 Позиция ${positionCounter} (строка ${i+1})`);

            // Собираем все детали (строки, идущие следом, пока не появится новая позиция)
            let details = [];
            let j = i + 1;
            while (j < data.length) {
                const nextRow = data[j];
                if (!nextRow) break;

                const nextCodeRaw = nextRow[codeCol] ? String(nextRow[codeCol]).trim() : '';
                const nextExtracted = extractCodeFromStrings(nextCodeRaw).code;
                // Если в следующей строке есть код (или текстовая позиция) – это новая позиция
                if ((nextExtracted && nextExtracted !== extractedCode) || isPureText(nextCodeRaw)) break;

                const detailName = nextRow[nameCol] ? String(nextRow[nameCol]).trim() : '';
                if (detailName === '') { j++; continue; }

                const detailAmount = parseNumber(nextRow[amountCol]);
                const detailQuantity = parseNumber(nextRow[quantityCol]);
                const detailPrice = parseNumber(nextRow[priceCol]);
                const detailUnit = nextRow[unitCol] ? String(nextRow[unitCol]).trim() : '';

                details.push({
                    type: detailName,
                    amount: detailAmount,
                    quantity: detailQuantity,
                    price: detailPrice,
                    unit: detailUnit,
                    rowNumber: j + 1
                });
                j++;
            }

            // Основные данные позиции
            const positionNumber = row[positionCol] ? String(row[positionCol]).trim() : String(positionCounter);
            const name = row[nameCol] ? String(row[nameCol]).trim() : '';
            const unit = row[unitCol] ? String(row[unitCol]).trim() : '';
            const quantity = parseNumber(row[quantityCol]);
            const price = parseNumber(row[priceCol]);
            const coefficient = parseNumber(row[coeffCol]);
            const finalCoeff = (coefficient !== 0 && coefficient !== 1) ? coefficient : null;

            const amountFromRow = parseNumber(row[amountCol]);
            const sumDetails = details.reduce((s, d) => s + d.amount, 0);
            const totalAmount = amountFromRow + sumDetails;

            // Объём
            const volume = calculateVolume(quantity, unit);
            const formattedVolume = formatVolume(volume, unit);

            // Детали только МР (для обратной совместимости с фронтендом)
            const mrDetails = details.filter(d => isMR(d.type));
            const mrTotalAmount = mrDetails.reduce((s, d) => s + d.amount, 0);

            positions.push({
                positionNumber: positionNumber,
                code: codeRaw,
                extractedCode: extractedCode,
                name: name,
                unit: unit,
                quantity: quantity,
                price: price,
                coefficient: finalCoeff,
                volume: volume,
                formattedVolume: formattedVolume,
                totalAmount: totalAmount,
                amountFromRow: amountFromRow,
                details: details,           // все детали (ЗП, ЭМ, МР, НР, СП, ...)
                mrDetails: mrDetails,
                mrTotalAmount: mrTotalAmount,
                sumAllDetails: sumDetails,
                isTextPosition: isTextPos,
                hasDetails: details.length > 0
            });

            i = j;
        }

        const totalFullAmount = positions.reduce((s, p) => s + p.totalAmount, 0);
        const totalMrAmount = positions.reduce((s, p) => s + p.mrTotalAmount, 0);

        console.log(`\n📊 РЕЗУЛЬТАТЫ ПАРСИНГА:`);
        console.log(`   Всего позиций: ${positions.length}`);
        console.log(`   ОБЩАЯ СУММА: ${totalFullAmount.toLocaleString('ru-RU')} ₽`);
        console.log(`   МР: ${totalMrAmount.toLocaleString('ru-RU')} ₽`);

        return {
            success: true,
            estimateName: workbook.SheetNames[0],
            totalAmount: totalFullAmount,
            totalMrAmount: totalMrAmount,
            totalAmountFormatted: totalFullAmount.toLocaleString('ru-RU'),
            positions: positions,
            stats: {
                totalPositions: positions.length,
                textPositions: positions.filter(p => p.isTextPosition).length,
                totalMrAmount: totalMrAmount,
                totalDetailRows: positions.reduce((s, p) => s + p.details.length, 0),
                totalMrRows: positions.reduce((s, p) => s + p.mrDetails.length, 0)
            }
        };
    } catch (error) {
        console.error('❌ Ошибка в parseFullEstimate:', error);
        return {
            success: false,
            error: error.message,
            estimateName: 'Ошибка',
            totalAmount: 0,
            totalMrAmount: 0,
            totalAmountFormatted: '0',
            positions: [],
            stats: {}
        };
    }
}

/**
 * Упрощённый интерфейс для analyze.js
 */
function parseEstimate(fileBuffer, originalName) {
    const result = parseFullEstimate(fileBuffer);
    if (!result.success) {
        return {
            success: false,
            error: result.error,
            items: [],
            totalAmount: 0,
            totalAmountFormatted: '0',
            sheetName: 'Ошибка',
            detectedColumns: { position: 0, code: 1, amount: 9, coefficient: 6 }
        };
    }
    const items = result.positions.map(pos => ({
        positionNumber: pos.positionNumber,
        code: pos.code,
        name: pos.name,
        totalAmount: pos.totalAmount,
        quantity: pos.quantity,
        unit: pos.unit,
        coefficient: pos.coefficient,
        isTextPosition: pos.isTextPosition,
        details: pos.details,
        mrDetails: pos.mrDetails,
        mrTotalAmount: pos.mrTotalAmount,
        volume: pos.volume,
        formattedVolume: pos.formattedVolume,
        rowNumber: pos.rowNumber
    }));
    return {
        success: true,
        items: items,
        totalAmount: result.totalAmount,
        totalAmountFormatted: result.totalAmountFormatted,
        sheetName: result.estimateName,
        detectedColumns: { position: 0, code: 1, amount: 9, coefficient: 6 }
    };
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    parseFullEstimate,
    parseEstimate,
    extractCodeFromStrings,
    parseNumber,
    parseNumberWithComma,
    extractUnit,
    calculateVolume,
    formatVolume,
    isMR,
    findHeaderRows,
    detectColumnsFromMultiRowHeader,
    detectAmountColumnUniversal,
    findDataStartRow,
    isPositionNumber,
    isPureText
};