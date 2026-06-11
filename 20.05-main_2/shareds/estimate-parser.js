// shareds/estimate-parser.js
// ЕДИНЫЙ ПАРСЕР СМЕТ (ИСПРАВЛЕННАЯ ВЕРСИЯ С ПОДРОБНЫМ ЛОГИРОВАНИЕМ)

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
    str = str.replace(/^[*хx≈~=<>+\\/|:;₽руб\s]+/i, '');
    
    if (str === '') return null;
    
    let result;
    
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
    
    const cleaned = result.replace(/[^\d.\-]/g, '');
    let num = parseFloat(cleaned);
    
    if (isNaN(num)) return null;
    
    if (num > 0.01 && num < 100 && num !== Math.floor(num)) {
        const normalized = Math.round(num * 100) / 100;
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

// ==================== ИЗВЛЕЧЕНИЕ КОДА ====================

const STOP_WORDS = [
    'цена поставщика', 'поставщик', 'приложение', 'письмо', 'разъяснение',
    'минстрой', 'поправка', 'примечание', 'сноска', 'цена поставщака'
];

function containsStopWords(str) {
    const lowerStr = str.toLowerCase();
    for (const word of STOP_WORDS) {
        if (lowerStr.includes(word)) {
            return true;
        }
    }
    return false;
}

/**
 * ИСПРАВЛЕННАЯ: извлечение кода из строки
 * Теперь более щадящая - не отбрасывает потенциально валидные коды
 */
function extractCodeFromStrings(str) {
    if (!str || typeof str !== 'string') return { code: null, comment: '' };
    const trimmed = str.trim();
    if (trimmed === '') return { code: null, comment: '' };
    
    // Если строка начинается с "цена поставщика" - это текстовая строка
    if (trimmed.toLowerCase().startsWith('цена поставщика')) {
        return { code: null, comment: trimmed };
    }
    
    // Паттерны кодов расценок
    const patterns = [
        // Полные шифры с нормативом
        /^(\d+\.\d+-\d+-\d+-\d+\/\d+)/,
        /^(\d+\.\d+-\d+-\d+-\d+)/,
        /^(\d+\.\d+-\d+-\d+)/,
        /^(\d{1,2}-\d{2}-\d{3}-\d{2}(?:\/\d+)?)/,
        /^(\d{1,2}-\d{2}-\d{3}-\d{2})/,
        /^(\d{1,2}\.\d{2}-\d{3}-\d{2})/,
        /^(\d{1,2}\.\d{2}\.\d{3}\.\d{2})/,
        
        // С префиксом
        /^(?:ГЭСН|ФЕР|ТЕР|СН|МТСН|ТСН|МРР|ГСН|СНиП)?\s*(\d{1,2}[.-]\d{2}[.-]\d{3}[.-]\d{2}(?:-\d+)?(?:\/\d+)?)/i,
        
        // Упрощённые форматы
        /^(\d+\.\d+\.\d+\.\d+)/,
        /^(\d+\.\d+-\d+-\d+)/,
        /^(\d+-\d+-\d+-\d+)/,
        
        // Сборники и разделы (только если есть несколько компонентов)
        /^(\d{2}\.\d{2}-\d{2,3})/,
        /^(\d{2}-\d{2}-\d{2,3})/,
        /^(\d+\.\d+\.\d+)/,
        
        // ВАЖНО: код из 5 цифр с точкой (например "11.01" - это сборник)
        /^(\d{2}\.\d{2})/,
        /^(\d{2}\.\d{1})/,
    ];
    
    // Ищем паттерн в НАЧАЛЕ строки
    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
            let code = match[1];
            // Пропускаем слишком короткие коды (одна-две цифры без точки)
            if (/^\d{1,2}$/.test(code)) {
                continue;
            }
            code = code.replace(/[^0-9.\-\/]/g, '');
            if (code && code.length >= 4) {
                const comment = trimmed.substring(match[0].length).trim();
                return { code, comment };
            }
        }
    }
    
    // Код не найден
    return { code: null, comment: trimmed };
}

// ==================== ФУНКЦИИ ПОИСКА ЗАГОЛОВКОВ И КОЛОНОК ====================

/**
 * ПОИСК СТРОК ЗАГОЛОВКОВ
 * Возвращает массив индексов строк, которые содержат заголовки таблицы
 */
function findHeaderRows(data) {
    const headerRows = [];
    const headerKeywords = PARSER_CONFIG.universal.headerKeywords;
    
 
    
    for (let i = 0; i < Math.min(50, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        let matchCount = 0;
        const matchedKeywords = [];
        
        // Проверяем первые 10 колонок
        for (let col = 0; col < Math.min(row.length, 10); col++) {
            const cell = String(row[col] || '').toLowerCase();
            for (const kw of headerKeywords) {
                if (cell.includes(kw)) {
                    matchCount++;
                    if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
                    break;
                }
            }
        }
        
        // Если нашли хотя бы 2 ключевых слова в строке - это строка заголовка
        if (matchCount >= 2) {
            headerRows.push(i);
            
        }
    }
    
    if (headerRows.length === 0) {
        
    } else {
 
    }
    
    return headerRows;
}

/**
 * ОПРЕДЕЛЕНИЕ КОЛОНОК ИЗ МНОГОСТРОЧНОГО ЗАГОЛОВКА
 * Объединяет все строки заголовков и ищет ключевые слова
 */
function detectColumnsFromMultiRowHeader(data, headerRows) {
    
    
    const columns = { position: -1, code: -1, coefficient: -1, amount: -1 };
    const keywords = PARSER_CONFIG.columnKeywords;
    const headerCells = [];
    

    
    // Объединяем все строки заголовков
    for (const rowIdx of headerRows) {
        const row = data[rowIdx];
        if (!row) continue;
        
        
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
            const cell = String(row[colIdx] || '').toLowerCase();
            if (!headerCells[colIdx]) headerCells[colIdx] = '';
            headerCells[colIdx] += ' ' + cell;
        }
    }
    
    // Анализируем объединённые заголовки
 
    
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
 * ДИАГНОСТИКА ПЕРВЫХ СТРОК ПОСЛЕ ЗАГОЛОВКА
 * Выводит содержимое первых 10 строк для отладки
 */
function diagnoseFirstRows(data, startRow, codeCol, positionCol, coeffCol) {

    
    for (let i = startRow; i < Math.min(startRow + 15, data.length); i++) {
        const row = data[i];
        if (!row) {

            continue;
        }
        
        const position = row[positionCol] ? String(row[positionCol]).trim() : '(пусто)';
        const code = row[codeCol] ? String(row[codeCol]).trim() : '(пусто)';
        const coeff = row[coeffCol] ? String(row[coeffCol]).trim() : '(пусто)';
        const name = row[2] ? String(row[2]).trim().substring(0, 40) : '(пусто)';

    }
    

}
/**
 * ПОИСК КОЛОНКИ С СУММАМИ
 * Сначала ищет по заголовкам, затем по содержимому
 */
function detectAmountColumnUniversal(data, headerRows) {

    
    let foundCol = null;
    
    // Сначала ищем по заголовкам
  
    
    for (const headerRowIdx of headerRows) {
        const headerRow = data[headerRowIdx];
        if (!headerRow) continue;
        
        for (let col = 0; col < headerRow.length; col++) {
            const cell = String(headerRow[col] || '').toLowerCase();
            // Ключевые слова для суммы
            if (cell.includes('всего затрат') || cell === 'всего затрат, руб.' || 
                cell.includes('итого затрат') || cell.includes('всего затрат, руб') || 
                cell === 'всего' || cell === 'итого' || cell.includes('сумма')) {
                foundCol = col;
                
                return foundCol;
            }
        }
    }
    
    // Если не нашли по заголовкам, ищем по содержимому
   
    
    const startSearchRow = headerRows.length > 0 ? Math.max(...headerRows) + 1 : 27;
    const columnSums = {};
    const columnCounts = {};
    
    for (let i = startSearchRow; i < Math.min(startSearchRow + 100, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        // Пропускаем итоговые строки
        const firstCell = row[0] ? String(row[0]).toLowerCase() : '';
        if (firstCell.includes('итого') || firstCell.includes('всего')) continue;
        
        for (let col = 5; col < Math.min(row.length, 15); col++) {
            const amount = parseNumberWithComma(row[col]);
            if (amount !== null && amount > 100 && amount < 10000000000) {
                if (!columnSums[col]) columnSums[col] = 0;
                if (!columnCounts[col]) columnCounts[col] = 0;
                columnSums[col] += amount;
                columnCounts[col]++;
            }
        }
    }
    

    for (let col = 5; col <= 12; col++) {
        const sum = columnSums[col] || 0;
        const count = columnCounts[col] || 0;
        if (count > 0) {
            
        }
    }
    
    let bestCol = 9; // колонка J по умолчанию
    let maxSum = 0;
    for (let col = 5; col <= 12; col++) {
        const sum = columnSums[col] || 0;
        const count = columnCounts[col] || 0;
        if (sum > maxSum && count > 2) {
            maxSum = sum;
            bestCol = col;
        }
    }
    
   
    return bestCol;
}

/**
 * ОПРЕДЕЛЕНИЕ СТРОКИ НАЧАЛА ДАННЫХ
 * Ищет первую строку после заголовка, которая содержит реальные данные (шифр или номер позиции)
 */
function findDataStartRow(data, headerRows) {

    
    if (!headerRows || headerRows.length === 0) {
     
        return 27;
    }
    
    const lastHeaderRow = Math.max(...headerRows);
   
    
    // Начинаем поиск со следующей строки после заголовка
    let startSearchRow = lastHeaderRow + 1;

    
    // Пропускаем пустые строки
    let emptySkipped = 0;
    while (startSearchRow < data.length) {
        const row = data[startSearchRow];
        if (!row || row.length === 0 || row.every(cell => !cell || String(cell).trim() === '')) {
        
            startSearchRow++;
            emptySkipped++;
            continue;
        }
        break;
    }
    
    if (emptySkipped > 0) {
     
    }
    
    // Ищем первую строку, которая содержит ШИФР (код расценки)
    // Это более надёжно, чем поиск номера позиции
    for (let i = startSearchRow; i < Math.min(startSearchRow + 30, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        // Проверяем колонки B, C, D (индексы 1, 2, 3) на наличие шифра
        for (let col = 1; col <= 4; col++) {
            const cell = row[col];
            if (!cell) continue;
            
            const cellStr = String(cell).trim();
            // Шифр обычно содержит цифры, точки и дефисы
            if (/^\d+\.\d+/.test(cellStr) || /^\d+-\d+/.test(cellStr)) {
              
                return i;
            }
        }
        
        // Если не нашли шифр, проверяем номер позиции в колонке A
        const positionCell = row[0];
        if (positionCell && isPositionNumber(positionCell)) {
          
            return i;
        }
    }
    
    // Если ничего не нашли, возвращаем первую непустую строку после заголовка
  
    return startSearchRow;
}

/**
 * ПРОВЕРКА ЯВЛЯЕТСЯ ЛИ СТРОКА НОМЕРОМ ПОЗИЦИИ
 * Форматы: 1, 2, 3, 1.1, 2.1, 1.1.1
 */
function isPositionNumber(str) {
    if (!str && str !== 0) return false;
    const trimmed = String(str).trim();
    if (trimmed === '') return false;
    
    // Номера позиций: только цифры и точки
    const pattern = /^\d+(\.\d+)*$/;
    const result = pattern.test(trimmed);
    
    // Дополнительная проверка: номер позиции не должен содержать букв
    const hasLetters = /[а-яА-Яa-zA-Z]/.test(trimmed);
    
    // Логируем результат для отладки (только первые 10)
    if (result && !hasLetters) {

    }
    
    return result && !hasLetters;
}
/**
 * ПРОВЕРКА ЯВЛЯЕТСЯ ЛИ СТРОКА ЗАГОЛОВКОМ ТАБЛИЦЫ
 */
function isHeaderRow(str) {
    if (!str) return false;
    const lowerStr = String(str).toLowerCase();
    const headerWords = ['№', 'п/п', 'шифр', 'расценки', 'наименование', 'ед.изм', 'количество', 'цена', 'сумма', 'итого'];
    return headerWords.some(word => lowerStr.includes(word));
}
/**
 * ИСПРАВЛЕННАЯ: проверка на чистый текст
 * Только явные признаки "цены поставщика"
 */
/**
 * ПРОВЕРКА ЯВЛЯЕТСЯ ЛИ СТРОКА ТЕКСТОВОЙ (ЦЕНА ПОСТАВЩИКА)
 * Только явные маркеры считаются текстом
 */
function isPureText(str) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (trimmed === '') return false;
    
    // Явные маркеры текстовой строки
    const lowerTrimmed = trimmed.toLowerCase();
    if (lowerTrimmed.startsWith('цена поставщика')) return true;
    if (lowerTrimmed.startsWith('материал по цене поставщика')) return true;
    if (lowerTrimmed.startsWith('стоимость материала по')) return true;
    if (lowerTrimmed.startsWith('прайс лист')) return true;
    if (lowerTrimmed.startsWith('прайс-лист')) return true;
    if (lowerTrimmed.startsWith('прайс-лист ')) return true;
    if (lowerTrimmed.startsWith('цена поставщака')) return true;
    if (lowerTrimmed.startsWith('цена поставшика')) return true;

    // Если есть код - точно не текст
    const { code } = extractCodeFromStrings(str);
    if (code !== null) return false;
    
    // Если строка длинная и нет кода - вероятно текст
    if (trimmed.length > 30 && !code) return true;
    
    return false;
}

// ==================== ОСНОВНАЯ ФУНКЦИЯ ПАРСИНГА (ИСПРАВЛЕННАЯ) ====================

function parseFullEstimate(fileBuffer) {


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
        const coeffCol = 6;          // Всегда колонка G (7-я в Excel)
        const positionCol = columns.position !== -1 ? columns.position : 0;    // A

       

        // ==================== ДИАГНОСТИКА КОЭФФИЦИЕНТОВ ====================
       
        
        let coeffFound = false;
        for (let i = startRow; i < Math.min(startRow + 50, data.length); i++) {
            const row = data[i];
            if (!row) continue;
            
            const cell = row[coeffCol];
            if (cell && String(cell).trim() !== '') {
                const val = parseNumberWithComma(cell);
                if (val !== null && val !== 0 && val !== 1 && val > 0.01 && val < 100) {
                    coeffFound = true;
                   
                }
            }
        }

        if (!coeffFound) {
            
        }

        // ==================== СБОР ПОЗИЦИЙ (ИСПРАВЛЕННАЯ ЛОГИКА) ====================
        const positions = [];
        let i = startRow;
        let positionCounter = 0;
        let skippedZeroSum = 0;
        let debugPositions = [];

   

        while (i < data.length) {
            const row = data[i];
            if (!row || row.length === 0) { 
                i++; 
                continue; 
            }

            const codeRaw = row[codeCol] ? String(row[codeCol]).trim() : '';
            
            // Пропускаем пустые строки
            if (codeRaw === '') { 
                i++; 
                continue; 
            }
            
            // Пропускаем строки-заголовки
            const codeLower = codeRaw.toLowerCase();
            if (codeLower.includes('шифр') || codeLower.includes('расценки') || 
                codeLower.includes('наименование') || codeLower.includes('ед.изм')) {
                i++;
                continue;
            }

            // Проверяем конец документа
            const firstCell = row[0] ? String(row[0]).toLowerCase() : '';
            if (firstCell.includes('составил') || firstCell.includes('проверил') ||
                firstCell.includes('начальник') || firstCell.includes('главный инженер') ||
                firstCell.includes('руководитель')) {
               
                break;
            }

            positionCounter++;

            // Получаем номер позиции (если есть)
            const positionValue = row[positionCol] ? String(row[positionCol]).trim() : '';
            const hasPositionNumber = positionValue && isPositionNumber(positionValue);
            const positionNumber = hasPositionNumber ? positionValue : String(positionCounter);

            // Извлекаем код
            const { code: extractedCode, comment: codeComment } = extractCodeFromStrings(codeRaw);
            const isTextPos = !extractedCode && isPureText(codeRaw);
            
            // Логируем найденную позицию
         

            // ========== ПАРСИНГ КОЭФФИЦИЕНТА ==========
            let coeffValue = null;
            let coeffSource = '';
            
            // Проверяем текущую строку
            const coeffCellRaw = row[coeffCol];
            if (coeffCellRaw !== undefined && coeffCellRaw !== null && String(coeffCellRaw).trim() !== '') {
                const parsed = parseNumberWithComma(coeffCellRaw);
                if (parsed !== null && parsed !== 0 && parsed !== 1 && parsed > 0.01 && parsed < 100) {
                    coeffValue = parsed;
                    coeffSource = `строка ${i+1}`;
                }
            }
            
            // Если не нашли, ищем в следующих 2 строках (но не дальше следующей позиции)
            if (!coeffValue) {
                let maxOffset = 1;
                for (let offset = 1; offset <= maxOffset; offset++) {
                    const nextRow = data[i + offset];
                    if (!nextRow) break;
                    
                    // Проверяем, не началась ли новая позиция
                    const nextCodeRaw = nextRow[codeCol] ? String(nextRow[codeCol]).trim() : '';
                    const nextPositionVal = nextRow[positionCol] ? String(nextRow[positionCol]).trim() : '';
                    if (nextCodeRaw !== '' && (isPositionNumber(nextPositionVal) || extractCodeFromStrings(nextCodeRaw).code)) {
                        break; // Новая позиция, прекращаем поиск
                    }
                    
                    const nextCoeff = nextRow[coeffCol];
                    if (nextCoeff !== undefined && nextCoeff !== null && String(nextCoeff).trim() !== '') {
                        const parsed = parseNumberWithComma(nextCoeff);
                        if (parsed !== null && parsed !== 0 && parsed !== 1 && parsed > 0.01 && parsed < 100) {
                            coeffValue = parsed;
                            coeffSource = `строка ${i+offset+1}`;
                            break;
                        }
                    }
                }
            }
            
            if (coeffValue) {

            } else {
             
            }

            // Нормализация коэффициента
            const finalCoeff = (coeffValue !== null && coeffValue !== 0 && coeffValue !== 1) 
                ? Math.round(coeffValue * 100) / 100 
                : null;

            // ========== СБОР ДЕТАЛЕЙ (ЗП, ЭМ, МР, НР, СП) ==========
            let details = [];
            let j = i + 1;
            let detailCount = 0;
            
           
            
            while (j < data.length) {
                const nextRow = data[j];
                if (!nextRow) break;

                const nextCodeRaw = nextRow[codeCol] ? String(nextRow[codeCol]).trim() : '';
                const nextPositionVal = nextRow[positionCol] ? String(nextRow[positionCol]).trim() : '';
                const nextExtracted = extractCodeFromStrings(nextCodeRaw).code;
                
                // УСЛОВИЯ ДЛЯ ЗАВЕРШЕНИЯ ПОЗИЦИИ:
                // 1. Следующая строка имеет номер позиции (начинается новая позиция)
                if (nextPositionVal && isPositionNumber(nextPositionVal)) {
                
                    break;
                }
                
                // 2. Следующая строка содержит другой код (не деталь)
                if (nextExtracted && nextExtracted !== extractedCode) {
         
                    break;
                }
                
                // 3. Следующая строка - текстовая позиция
                if (isPureText(nextCodeRaw)) {
           
                    break;
                }

                const detailName = nextRow[nameCol] ? String(nextRow[nameCol]).trim() : '';
                if (detailName === '') { 
                    j++; 
                    continue; 
                }
                
                // Проверяем, является ли строка детальной (ЗП, ЭМ, МР, НР, СП)
                const detailNameLower = detailName.toLowerCase();
                const isDetail = detailNameLower === 'зп' || detailNameLower === 'эм' || 
                                detailNameLower === 'мр' || detailNameLower === 'нр' || 
                                detailNameLower === 'сп' || detailNameLower === 'зтр' ||
                                detailNameLower.startsWith('зп ') || detailNameLower.startsWith('эм ') ||
                                detailNameLower.startsWith('мр ') || detailNameLower.startsWith('нр ') ||
                                detailNameLower.startsWith('сп ');
                
                if (!isDetail) {
                    // Не деталь - возможно, это описание или комментарий
   
                    j++;
                    continue;
                }

                detailCount++;
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
            const name = row[nameCol] ? String(row[nameCol]).trim() : '';
            const unit = row[unitCol] ? String(row[unitCol]).trim() : '';
            const quantity = parseNumber(row[quantityCol]);
            const price = parseNumber(row[priceCol]);

            const amountFromRow = parseNumber(row[amountCol]);
            const sumDetails = details.reduce((s, d) => s + d.amount, 0);
            const totalAmount = amountFromRow + sumDetails;

 

            // ⭐ ПРОПУСКАЕМ ПОЗИЦИИ С НУЛЕВОЙ СУММОЙ
            if (totalAmount === 0) {
             
                skippedZeroSum++;
                i = j;
                continue;
            }

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


        return {
            success: true,
            estimateName: workbook.SheetNames[0],
            totalAmount: totalFullAmount,
            totalMrAmount: totalMrAmount,
            totalAmountFormatted: totalFullAmount.toLocaleString('ru-RU'),
            positions: positions,
            stats: {
                totalPositions: positions.length,
                skippedZeroSum: skippedZeroSum,
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

    // Фильтруем позиции с нулевой суммой (дополнительная страховка)
    const items = result.positions
        .filter(pos => pos.totalAmount !== 0)
        .map(pos => ({
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
            price: pos.price,
            rowNumber: pos.rowNumber
        }));

    // Пересчитываем общую сумму с учётом фильтрации
    const filteredTotalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);

    return {
        success: true,
        items: items,
        totalAmount: filteredTotalAmount,
        totalAmountFormatted: filteredTotalAmount.toLocaleString('ru-RU'),
        sheetName: result.estimateName,
        detectedColumns: { position: 0, code: 1, amount: 9, coefficient: 6 }
    };
}

function buildCoefficientIndex(data, coeffCol) {
    const coefficientIndex = new Map();
    
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        
        const coeffVal = parseNumberWithComma(row[coeffCol]);
        if (coeffVal !== null && coeffVal !== 0 && coeffVal !== 1) {
            coefficientIndex.set(i, coeffVal);
        }
    }
    
    return coefficientIndex;
}

function findCoefficientFromIndex(coefficientIndex, startRow, maxLinesDown) {
    if (coefficientIndex.has(startRow)) {
        return {
            value: coefficientIndex.get(startRow),
            found: true,
            offset: 0
        };
    }
    
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

/**
 * ПОИСК КОЛОНКИ С НОМЕРАМИ ПОЗИЦИЙ
 * Проверяет колонки A, B, C на наличие номеров позиций
 */
function detectPositionColumn(data, startRow) {

    
    // Проверяем первые 20 строк данных
    for (let i = startRow; i < Math.min(startRow + 20, data.length); i++) {
        const row = data[i];
        if (!row) continue;

        
        // Проверяем колонки A, B, C (индексы 0, 1, 2)
        for (let col = 0; col <= 3; col++) {
            const cell = row[col];
            if (!cell) continue;
            
            const cellStr = String(cell).trim();
            const isPosition = isPositionNumber(cellStr);
            
          
            
            // Номер позиции - это число, часто с точкой (1, 2, 3 или 1.1, 2.1)
            if (isPosition) {
                // Дополнительная проверка: номер позиции обычно не содержит букв
                if (!/[а-яА-Я]/.test(cellStr)) {
                   
                    return col;
                }
            }
        }
    }
    

    return 0;
}

/**
 * ПОИСК КОЛОНКИ С ШИФРАМИ РАСЦЕНОК
 * Проверяет колонки B, C, D, E на наличие шифров (цифры с точками/дефисами)
 */
function detectCodeColumn(data, startRow) {

    
    let foundCol = null;
    let foundRow = null;
    let foundCode = null;
    
    // Проверяем первые 30 строк данных
    for (let i = startRow; i < Math.min(startRow + 30, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        // Проверяем колонки B, C, D, E (индексы 1, 2, 3, 4)
        for (let col = 1; col <= 4; col++) {
            const cell = row[col];
            if (!cell) continue;
            
            const cellStr = String(cell).trim();
            // Шифр расценки: цифры, точки, дефисы, часто с префиксом
            const isCode = /^\d+\.\d+/.test(cellStr) || /^\d+-\d+/.test(cellStr);
            
            if (isCode && cellStr.length >= 5) {
                foundCol = col;
                foundRow = i;
                foundCode = cellStr;
                break;
            }
        }
        
        if (foundCol !== null) break;
    }
    
    if (foundCol !== null) {
      
        return foundCol;
    }
    

    return 1;
}

/**
 * ПОИСК КОЛОНКИ С КОЭФФИЦИЕНТАМИ
 * Сначала ищет по заголовкам, затем по содержимому
 */
function detectCoefficientColumn(data, startRow) {

    
    const coeffKeywords = ['поправоч', 'коэфф', 'коэффициент', 'coeff', 'k', 'зимн', 'удорож', 'пересчет'];
    
    // Сначала ищем по заголовкам в первых 30 строках
    
    
    for (let i = 0; i < Math.min(30, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        for (let col = 0; col < row.length; col++) {
            const cell = String(row[col] || '').toLowerCase();
            // Проверяем на точное совпадение
            if (cell.includes('попра-вочные') || cell.includes('поправочные')) {
  ;
                return col;
            }
            for (const kw of coeffKeywords) {
                if (cell.includes(kw)) {
                   
                    return col;
                }
            }
        }
    }
    
 
    
    for (let col = 6; col <= 9; col++) { // колонки G, H, I, J
        let coeffCount = 0;
        let coeffValues = [];
        
        for (let i = startRow; i < Math.min(startRow + 50, data.length); i++) {
            const row = data[i];
            if (!row) continue;
            const val = parseNumberWithComma(row[col]);
            if (val !== null && val !== 0 && val !== 1 && val > 0.01 && val < 100) {
                coeffCount++;
                coeffValues.push(val);
            }
        }
        
        if (coeffCount >= 3) {

            return col;
        }
    }
    
 
    return 6;
}

function extractTotalAmount(data, amountCol) {
    let totalAmount = 0;
    let foundRow = null;
    const totalKeywords = ['итого', 'всего', 'всего по смете', 'всего с ндс'];
    for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
        if (!row) continue;
        const firstCell = String(row[0] || '').toLowerCase();
        if (totalKeywords.some(kw => firstCell.includes(kw))) {
            const amount = parseNumberWithComma(row[amountCol]);
            if (amount !== null && amount > 0) {
                totalAmount = amount;
                foundRow = i + 1;
                break;
            }
        }
    }
    if (totalAmount === 0 && data.length > 0) {
        const lastRow = data[data.length - 1];
        if (lastRow && lastRow[amountCol]) {
            totalAmount = parseNumberWithComma(lastRow[amountCol]);
            foundRow = data.length;
        }
    }
    return { totalAmount, foundRow };
}

function normalizePositionNumber(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function formatNumber(num) {
    if (num === null || num === undefined) return '';
    return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    findHeaderRows,
    detectColumnsFromMultiRowHeader,
    detectAmountColumnUniversal,
    findDataStartRow,
    isPositionNumber,
    isPureText, 
    detectPositionColumn,
    detectCodeColumn,
    detectCoefficientColumn,
    extractTotalAmount,
    formatNumber,
    normalizePositionNumber    
};