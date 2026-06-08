// shareds/ks2-parser.js - С ПОДРОБНЫМИ КОНСОЛЬ ЛОГАМИ
// СУММА ПОЗИЦИИ БЕРЁТСЯ ИЗ КОЛОНКИ K: СУММИРУЕМ ЗНАЧЕНИЯ В СТРОКЕ ШИФРА И ВО ВСЕХ СТРОКАХ-ДЕТАЛЯХ

const XLSX = require('xlsx');
const iconv = require('iconv-lite');

/**
 * Парсинг числа
 */
function parseNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') {
        // ИСПРАВЛЕНИЕ: для чисел округляем до 2 знаков
        if (value > 0.01 && value < 100 && value !== Math.floor(value)) {
            return Math.round(value * 100) / 100;
        }
        return value;
    }
    let str = String(value).trim();
    if (str === '') return 0;
    str = str.replace(/\s/g, '').replace(',', '.');
    const match = str.match(/-?\d+(?:\.\d+)?/);
    if (match) {
        let num = parseFloat(match[0]);
        if (isNaN(num)) return 0;
        // ИСПРАВЛЕНИЕ: округляем до 2 знаков
        if (num > 0.01 && num < 100 && num !== Math.floor(num)) {
            num = Math.round(num * 100) / 100;
        }
        return num;
    }
    return 0;
}

// ИСПРАВЛЕНИЕ: parseCoefficient использует parseNumber
function parseCoefficient(value) {
    const num = parseNumber(value);
    if (num !== 0 && num !== 1) {
        return num;
    }
    return null;
}

/**
 * Извлечение коэффициента из строки (колонка I)
 */
function parseCoefficient(value) {
    const num = parseNumber(value);
    if (num !== 0 && num !== 1) {
        return num;
    }
    return null;
}

/**
 * Извлечение шифра из строки
 */
function extractCodeFromString(str) {
    if (!str || typeof str !== 'string') return null;
    
    const trimmed = str.trim();
    if (trimmed === '') return null;
    
    if (trimmed.toLowerCase().startsWith('цена поставщика')) {
        return trimmed;
    }
    
    const patterns = [
        /^(\d+\.\d+-\d+-\d+-\d+\/\d+)/,
        /^(\d+\.\d+-\d+-\d+-\d+)/,
        /^(\d+\.\d+-\d+-\d+)/,
        /^(\d{1,2}-\d{2}-\d{3}-\d{2}(?:\/\d+)?)/,
        /^(\d{1,2}-\d{2}-\d{3}-\d{2})/,
        /^(\d{1,2}\.\d{2}-\d{3}-\d{2})/,
        /^(\d{1,2}\.\d{2}\.\d{3}\.\d{2})/,
        /^(?:ГЭСН|ФЕР|ТЕР|СН)?\s*(\d{1,2}[.-]\d{2}[.-]\d{3}[.-]\d{2})/i,
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
                return code;
            }
        }
    }
    
    return null;
}

/**
 * Проверка, является ли строка детальной (ЗП, ЭМ, МР, НР, СП)
 */
function isDetailRow(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase().trim();
    const detailKeywords = ['зп', 'эм', 'мр', 'нр', 'сп', 'зтр', 'в т.ч.', 'в тч', 'зпм'];
    return detailKeywords.some(kw => lowerText === kw || lowerText.startsWith(kw + ' ') || lowerText.startsWith(kw));
}

/**
 * Фикс кодировки
 */
function fixFilename(filename) {
    if (!filename) return filename;
    try {
        const buffer = Buffer.from(filename, 'latin1');
        const decoded = iconv.decode(buffer, 'utf8');
        if (/[а-яА-Я]/.test(decoded)) return decoded;
    } catch (e) {}
    return filename;
}

/**
 * Основная функция парсинга КС-2
 * Сумма позиции = сумма всех значений в колонке K для строки с шифром и всех её строк-деталей
 */
function parseKS2(fileBuffer, fileName = '') {
    fileName = fixFilename(fileName);
    
 
    
    try {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        
       
        
        // ==================== ВЫВОД СТРУКТУРЫ ФАЙЛА ====================
    
        
        for (let i = 0; i < Math.min(30, data.length); i++) {
            const row = data[i];
            if (row) {
                const a = row[0] ? String(row[0]).substring(0, 10) : '';
                const b = row[1] ? String(row[1]).substring(0, 10) : '';
                const c = row[2] ? String(row[2]).substring(0, 35) : '';
                const i_coeff = row[8] ? String(row[8]).substring(0, 10) : '';
                const k_total = row[10] ? String(row[10]).substring(0, 12) : '';
               
            }
        }

        
        // Определяем колонки
        const codeCol = 2;           // C - шифр
        const positionCol1 = 0;      // A - № п/п
        const positionCol2 = 1;      // B - поз. по смете
        const nameCol = 3;           // D - наименование
        const unitCol = 4;           // E - ед.изм.
        const quantityCol = 5;       // F - количество
        const coeffCol = 8;          // I - коэффициент (колонка 9 в Excel)
        const totalCol = 10;         // K - сумма
        

        
        // ==================== СБОР ПОЗИЦИЙ ====================
        const positions = [];
        let i = 0;
        let positionCounter = 1;
        let totalAmount = 0;
        let skippedCount = 0;
        
    
        
        while (i < data.length) {
            const row = data[i];
            if (!row) { i++; continue; }
            
            // Получаем шифр
            const codeCell = row[codeCol] ? String(row[codeCol]).trim() : '';
            if (!codeCell) { i++; skippedCount++; continue; }
            
            const code = extractCodeFromString(codeCell);
            if (!code) { i++; skippedCount++; continue; }
            
            // Пропускаем строки-заголовки
            const codeLower = codeCell.toLowerCase();
            if (codeLower.includes('шифр') || codeLower.includes('расценки') || 
                codeLower.includes('итого') || codeLower.includes('раздел') ||
                codeLower.includes('подраздел')) {
               
                i++;
                continue;
            }
            
            // Проверяем на конец документа
            const firstCell = String(row[0] || '').toLowerCase();
            if (firstCell.includes('составил') || firstCell.includes('проверил') ||
                firstCell.includes('начальник') || firstCell.includes('главный инженер')) {
              
                break;
            }
            
            // Номера позиций
            const ks2Position = row[positionCol1] ? String(row[positionCol1]).trim() : String(positionCounter);
            const estimatePosition = row[positionCol2] ? String(row[positionCol2]).trim() : '';
            
            // Основные данные
            const name = row[nameCol] ? String(row[nameCol]).trim() : '';
            const unit = row[unitCol] ? String(row[unitCol]).trim() : '';
            const quantity = parseNumber(row[quantityCol]);
            const coefficient = parseCoefficient(row[coeffCol]);
            let positionTotal = parseNumber(row[totalCol]); // сумма в строке шифра (колонка K)
            
            // ===== ЛОГИРОВАНИЕ СУММЫ ИЗ КОЛОНКИ K =====

            
            // ==================== СБОР ДЕТАЛЕЙ ====================
            let details = [];
            let detailsTotal = 0;
            let detailSumLog = [];
            let j = i + 1;
            let detailCount = 0;
            
            while (j < data.length) {
                const nextRow = data[j];
                if (!nextRow) { j++; continue; }
                
                // Проверяем, не началась ли новая позиция
                const nextCodeCell = nextRow[codeCol] ? String(nextRow[codeCol]).trim() : '';
                const nextCode = extractCodeFromString(nextCodeCell);
                
                if (nextCode && nextCode !== code) {
                 
                    break;
                }
                
                // Получаем текст из колонки наименования
                const detailName = nextRow[nameCol] ? String(nextRow[nameCol]).trim() : '';
                if (detailName === '') { j++; continue; }
                
                // Проверяем, является ли строка детальной
                if (isDetailRow(detailName)) {
                    detailCount++;
                    // Сумма детали ТОЛЬКО из колонки K (не используем количество)
                    let detailTotal = parseNumber(nextRow[totalCol]);
                    
                    
                    
                    detailsTotal += detailTotal;
                    detailSumLog.push(`${detailName}=${detailTotal}`);
                    
                    details.push({
                        type: detailName,
                        amount: detailTotal,
                        quantity: parseNumber(nextRow[quantityCol]), // сохраняем для информации
                        unit: nextRow[unitCol] ? String(nextRow[unitCol]).trim() : '',
                        rowNumber: j + 1
                    });
                    
                   
                }
                
                j++;
            }
            
            
            if (detailSumLog.length) {
             
            }
            
            // ИТОГОВАЯ СУММА ПОЗИЦИИ = сумма из строки шифра + суммы из всех деталей
            let total = positionTotal + detailsTotal;
           
            if (positionTotal === 0 && detailsTotal === 0) {
                
            }
            
            // Вычисляем объём (для информации)
            let volume = '';
            if (quantity > 0 && unit) {
                const unitMatch = unit.match(/(\d+(?:[.,]\d+)?)/);
                if (unitMatch) {
                    const unitValue = parseFloat(unitMatch[1].replace(',', '.'));
                    if (unitValue > 0 && unitValue !== 1) {
                        const vol = quantity * unitValue;
                        const unitName = unit.replace(/\d+(?:[.,]\d+)?\s*/, '');
                        volume = `${vol.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unitName}`;
                       
                    } else {
                        volume = `${quantity.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unit}`;
                       
                    }
                } else {
                    volume = `${quantity.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unit}`;
                    
                }
            }
            
            totalAmount += total;
           
            
            positions.push({
                position: positionCounter++,
                ks2_position_number: ks2Position,
                estimate_position_number: estimatePosition,
                code: code,
                name: name,
                unit: unit,
                quantity: quantity,
                volume: volume,
                coefficient: coefficient,
                total: total,
                details: details,
                detailsTotal: detailsTotal,
                row_number: i + 1
            });
            
            i = j;
        }
        
        // ==================== ИТОГИ ====================

        const sumOfTotals = positions.reduce((sum, p) => sum + p.total, 0);
   
        
        // Детальный вывод по каждой позиции
        if (positions.length > 0) {

            for (const pos of positions) {
              
                if (pos.details.length > 0) {
                    
                    for (const d of pos.details) {
                        
                    }
                }
            }
           
        }
        
        return {
            success: positions.length > 0,
            fileName: fileName,
            sheetName: sheetName,
            totalItems: positions.length,
            totalAmount: totalAmount,
            totalAmountFormatted: totalAmount.toLocaleString('ru-RU'),
            items: positions,
            detectedColumns: {
                ks2Position: positionCol1 + 1,
                estimatePosition: positionCol2 + 1,
                code: codeCol + 1,
                name: nameCol + 1,
                unit: unitCol + 1,
                quantity: quantityCol + 1,
                coefficient: coeffCol + 1,
                total: totalCol + 1
            }
        };
        
    } catch (error) {
      
        return {
            success: false,
            error: error.message,
            fileName: fileName,
            items: [],
            totalAmount: 0,
            totalItems: 0
        };
    }
}

module.exports = { parseKS2, extractCodeFromString, parseNumber, parseCoefficient, fixFilename };