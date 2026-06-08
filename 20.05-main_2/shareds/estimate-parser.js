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
    
    // Удаляем пробелы
    str = str.replace(/\s/g, '');
    
    // Удаляем символы валют и другие нечисловые префиксы
    str = str.replace(/^[*хx≈~=<>+\\/|:;₽руб\s]+/i, '');
    
    if (str === '') return null;
    
    let result;
    
    // Обработка разных форматов чисел
    if (str.includes(',') && str.includes('.')) {
        const lastComma = str.lastIndexOf(',');
        const lastDot = str.lastIndexOf('.');
        if (lastComma > lastDot) {
            result = str.replace(/\./g, '').replace(',', '.');
        } else {
            result = str.replace(/,/g, '');
        }
    } 
    else if (str.includes(',')) {
        const parts = str.split(',');
        if (parts.length === 2 && parts[1].length === 3 && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[0])) {
            result = str.replace(',', '');
        } else {
            result = str.replace(',', '.');
        }
    }
    else if (str.includes('.')) {
        result = str;
    }
    else {
        result = str;
    }
    
    // Оставляем только цифры, минус и точку
    const cleaned = result.replace(/[^\d.\-]/g, '');
    let num = parseFloat(cleaned);
    
    if (isNaN(num)) return null;
    
    // КОНСОЛЬНЫЙ ВЫВОД оригинального значения
    console.log(`[parseNumberWithComma] Оригинал: "${value}" -> Распаршено: ${num}`);
    
    // Нормализация коэффициента - округление до 2 знаков
    if (num > 0.01 && num < 100 && num !== Math.floor(num)) {
        const normalized = Math.round(num * 100) / 100;
        console.log(`[parseNumberWithComma] Нормализация: ${num} -> ${normalized}`);
        return normalized;
    }
    
    return num;
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
  
    } else {
        result = qty;
        
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
    console.log(`\n========== ПАРСИНГ СМЕТЫ ==========`);

    try {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

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
        let coeffCol = columns.coefficient !== -1 ? columns.coefficient : 6; // G
        const positionCol = columns.position !== -1 ? columns.position : 0;    // A

        console.log(`Определённые колонки:`);
        console.log(`  Позиция: ${positionCol + 1} (${String.fromCharCode(65 + positionCol)})`);
        console.log(`  Код: ${codeCol + 1} (${String.fromCharCode(65 + codeCol)})`);
        console.log(`  Коэффициент: ${coeffCol + 1} (${String.fromCharCode(65 + coeffCol)})`);
        console.log(`  Сумма: ${amountCol + 1} (${String.fromCharCode(65 + amountCol)})`);
        console.log(`Начальная строка данных: ${startRow + 1}`);

        // ==================== ДИАГНОСТИКА КОЭФФИЦИЕНТОВ ====================
        console.log(`\n--- ДИАГНОСТИКА КОЭФФИЦИЕНТОВ ---`);
        
        // Сначала проверим, есть ли вообще какие-то числа в колонке коэффициентов
        let coeffFound = false;
        let actualCoeffCol = coeffCol;
        
        for (let i = startRow; i < Math.min(startRow + 50, data.length); i++) {
            const row = data[i];
            if (!row) continue;
            
            const cell = row[coeffCol];
            if (cell && String(cell).trim() !== '') {
                const val = parseNumberWithComma(cell);
                if (val !== null && val !== 0 && val !== 1 && val > 0.01 && val < 100) {
                    coeffFound = true;
                    console.log(`  ✅ Найден коэффициент в колонке ${coeffCol+1}, строка ${i+1}: "${cell}" -> ${val}`);
                }
            }
        }
        
        // Если не нашли в предполагаемой колонке, ищем в соседних
        if (!coeffFound) {
            console.log(`  В колонке ${coeffCol+1} коэффициенты не найдены. Ищем в соседних колонках...`);
            
            const searchCols = [4, 5, 6, 7, 8, 9]; // Колонки E, F, G, H, I, J
            let bestCol = -1;
            let maxCount = 0;
            
            for (const col of searchCols) {
                let count = 0;
                for (let i = startRow; i < Math.min(startRow + 50, data.length); i++) {
                    const row = data[i];
                    if (!row) continue;
                    const cell = row[col];
                    if (cell && String(cell).trim() !== '') {
                        const val = parseNumberWithComma(cell);
                        if (val !== null && val !== 0 && val !== 1 && val > 0.01 && val < 100) {
                            count++;
                        }
                    }
                }
                if (count > maxCount) {
                    maxCount = count;
                    bestCol = col;
                }
                if (count > 0) {
                    console.log(`    Колонка ${col+1} (${String.fromCharCode(65+col)}): найдено ${count} коэффициентов`);
                }
            }
            
            if (bestCol !== -1 && maxCount > 0) {
                coeffCol = bestCol;
                console.log(`  ✅ Выбрана колонка для коэффициентов: ${coeffCol+1} (${String.fromCharCode(65+coeffCol)}) с ${maxCount} коэффициентами`);
            } else {
                console.log(`  ⚠️ Коэффициенты не найдены ни в одной колонке!`);
            }
        }

        // ==================== СБОР ПОЗИЦИЙ ====================
        const positions = [];
        let i = startRow;
        let positionCounter = 0;
        let coeffDebugCount = 0;

        console.log(`\n--- ПАРСИНГ ПОЗИЦИЙ ---`);

        while (i < data.length) {
            const row = data[i];
            if (!row || row.length === 0) { i++; continue; }

            const codeRaw = row[codeCol] ? String(row[codeCol]).trim() : '';
            if (codeRaw === '') { i++; continue; }

            const { code: extractedCode } = extractCodeFromStrings(codeRaw);
            const isTextPos = !extractedCode && isPureText(codeRaw);

            if (!extractedCode && !isTextPos) { i++; continue; }

            positionCounter++;

            // ========== ПАРСИНГ КОЭФФИЦИЕНТА ==========
            let coeffValue = null;
            let coeffSource = '';
            
            // Проверяем текущую строку в колонке коэффициентов
            const coeffCellRaw = row[coeffCol];
            if (coeffCellRaw !== undefined && coeffCellRaw !== null && String(coeffCellRaw).trim() !== '') {
                const parsed = parseNumberWithComma(coeffCellRaw);
                if (parsed !== null && parsed !== 0 && parsed !== 1 && parsed > 0.01 && parsed < 100) {
                    coeffValue = parsed;
                    coeffSource = `строка ${i+1}, колонка ${coeffCol+1}`;
                }
            }
            
            // Если не нашли, ищем в следующих строках (до 5 строк)
            if (!coeffValue) {
                for (let offset = 1; offset <= 5; offset++) {
                    const nextRow = data[i + offset];
                    if (!nextRow) break;
                    
                    const nextCoeff = nextRow[coeffCol];
                    if (nextCoeff !== undefined && nextCoeff !== null && String(nextCoeff).trim() !== '') {
                        const parsed = parseNumberWithComma(nextCoeff);
                        if (parsed !== null && parsed !== 0 && parsed !== 1 && parsed > 0.01 && parsed < 100) {
                            coeffValue = parsed;
                            coeffSource = `строка ${i+offset+1}, колонка ${coeffCol+1}`;
                            break;
                        }
                    }
                }
            }
            
            // Если всё ещё не нашли, ищем в соседних колонках этой же строки
            if (!coeffValue) {
                const neighborCols = [coeffCol - 1, coeffCol - 2, coeffCol + 1, coeffCol + 2];
                for (const col of neighborCols) {
                    if (col >= 0 && col < row.length && row[col] !== undefined && row[col] !== null) {
                        const cell = row[col];
                        if (cell && String(cell).trim() !== '') {
                            const parsed = parseNumberWithComma(cell);
                            if (parsed !== null && parsed !== 0 && parsed !== 1 && parsed > 0.01 && parsed < 100) {
                                coeffValue = parsed;
                                coeffSource = `строка ${i+1}, колонка ${col+1}`;
                                break;
                            }
                        }
                    }
                }
            }
            
            // Логируем найденные коэффициенты (первые 20)
            if (coeffValue && coeffDebugCount < 20) {
                console.log(`  Позиция ${positionCounter}: найден коэффициент ${coeffValue} (${coeffSource})`);
                coeffDebugCount++;
            } else if (!coeffValue && coeffDebugCount < 20) {
                console.log(`  Позиция ${positionCounter}: коэффициент НЕ НАЙДЕН`);
                coeffDebugCount++;
            }

            // Нормализация коэффициента
            const finalCoeff = (coeffValue !== null && coeffValue !== 0 && coeffValue !== 1) 
                ? Math.round(coeffValue * 100) / 100 
                : null;

            // Собираем детали
            let details = [];
            let j = i + 1;
            while (j < data.length) {
                const nextRow = data[j];
                if (!nextRow) break;

                const nextCodeRaw = nextRow[codeCol] ? String(nextRow[codeCol]).trim() : '';
                const nextExtracted = extractCodeFromStrings(nextCodeRaw).code;
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

            const amountFromRow = parseNumber(row[amountCol]);
            const sumDetails = details.reduce((s, d) => s + d.amount, 0);
            const totalAmount = amountFromRow + sumDetails;

            const volume = calculateVolume(quantity, unit);
            const formattedVolume = formatVolume(volume, unit);

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
                details: details,
                mrDetails: mrDetails,
                mrTotalAmount: mrTotalAmount,
                sumAllDetails: sumDetails,
                isTextPosition: isTextPos,
                hasDetails: details.length > 0,
                positionName: name,
                fileName: null,
                rowNumber: i + 1
            });

            i = j;
        }

        const totalFullAmount = positions.reduce((s, p) => s + p.totalAmount, 0);
        const totalMrAmount = positions.reduce((s, p) => s + p.mrTotalAmount, 0);

        console.log(`\n--- РЕЗУЛЬТАТ ПАРСИНГА ---`);
        console.log(`Всего позиций: ${positions.length}`);
        console.log(`Позиций с коэффициентами: ${positions.filter(p => p.coefficient !== null).length}`);
        console.log(`Позиций без коэффициентов: ${positions.filter(p => p.coefficient === null).length}`);
        console.log(`Общая сумма: ${totalFullAmount.toLocaleString('ru-RU')} ₽`);
        console.log(`=========================================\n`);

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
        console.error(`Ошибка парсинга:`, error);
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
   
    if (result.positions && result.positions.length > 0) {
        const first = result.positions[0];

    }
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
    quantity: pos.quantity,           // ← должно быть
    unit: pos.unit,                   // ← должно быть
    coefficient: pos.coefficient,
    isTextPosition: pos.isTextPosition,
    details: pos.details,
    mrDetails: pos.mrDetails,
    mrTotalAmount: pos.mrTotalAmount,
    volume: pos.volume,               // ← ДОБАВИТЬ!
    formattedVolume: pos.formattedVolume, // ← ДОБАВИТЬ!
    price: pos.price,                 // ← ДОБАВИТЬ!
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
/**
 * Построение индекса всех коэффициентов в документе
 * @param {Array} data - данные из Excel
 * @param {number} coeffCol - номер колонки с коэффициентами
 * @returns {Map} Map где ключ - номер строки, значение - коэффициент
 */
function buildCoefficientIndex(data, coeffCol) {
    const coefficientIndex = new Map();
    
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        
        const coeffVal = parseNumberWithComma(row[coeffCol]);
        // Сохраняем только коэффициенты, отличные от 0 и 1
        if (coeffVal !== null && coeffVal !== 0 && coeffVal !== 1) {
            coefficientIndex.set(i, coeffVal);
        }
    }
    
    return coefficientIndex;
}

/**
 * Поиск коэффициента из индекса
 * @param {Map} coefficientIndex - индекс коэффициентов
 * @param {number} startRow - строка, с которой начинаем поиск
 * @param {number} maxLinesDown - максимальное количество строк для поиска вниз
 * @returns {Object} результат поиска
 */
function findCoefficientFromIndex(coefficientIndex, startRow, maxLinesDown) {
    // Сначала проверяем текущую строку
    if (coefficientIndex.has(startRow)) {
        return {
            value: coefficientIndex.get(startRow),
            found: true,
            offset: 0
        };
    }
    
    // Затем ищем вниз
    for (let offset = 1; offset <= maxLinesDown; offset++) {
        const checkRow = startRow + offset;
        if (coefficientIndex.has(checkRow)) {
            return {
                value: coefficientIndex.get(checkRow),
                found: true,
                offset: offset
            };
        }
    }
    
    return {
        value: null,
        found: false,
        offset: null
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
    buildCoefficientIndex,
    findCoefficientFromIndex,
    parseNumberWithComma,
    findHeaderRows,
    detectColumnsFromMultiRowHeader,
    detectAmountColumnUniversal,
    findDataStartRow,
    isPositionNumber,
    isPureText
};