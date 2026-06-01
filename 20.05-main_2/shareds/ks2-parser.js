// shareds/ks2-parser.js - С ПОДРОБНЫМИ КОНСОЛЬ ЛОГАМИ

const XLSX = require('xlsx');
const iconv = require('iconv-lite');

/**
 * Парсинг числа
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
 */
function parseKS2(fileBuffer, fileName = '') {
    fileName = fixFilename(fileName);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 ПАРСИНГ КС-2: ${fileName}`);
    console.log(`${'='.repeat(80)}`);
    
    try {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        
        console.log(`   📄 Лист: ${sheetName}`);
        console.log(`   📊 Всего строк: ${data.length}`);
        
        // ==================== ВЫВОД СТРУКТУРЫ ФАЙЛА ====================
        console.log(`\n${'─'.repeat(80)}`);
        console.log(`📋 СТРУКТУРА ФАЙЛА (первые 30 строк):`);
        console.log(`${'─'.repeat(80)}`);
        console.log(`   Row | A(№)     | B(поз)   | C(шифр)                    | I(коэф) | K(сумма)   |`);
        console.log(`${'─'.repeat(80)}`);
        
        for (let i = 0; i < Math.min(30, data.length); i++) {
            const row = data[i];
            if (row) {
                const a = row[0] ? String(row[0]).substring(0, 10) : '';
                const b = row[1] ? String(row[1]).substring(0, 10) : '';
                const c = row[2] ? String(row[2]).substring(0, 35) : '';
                const i_coeff = row[8] ? String(row[8]).substring(0, 10) : '';
                const k_total = row[10] ? String(row[10]).substring(0, 12) : '';
                console.log(`   ${String(i + 1).padStart(3)} | ${a.padEnd(10)} | ${b.padEnd(10)} | ${c.padEnd(35)} | ${i_coeff.padEnd(8)} | ${k_total.padEnd(10)} |`);
            }
        }
        console.log(`${'─'.repeat(80)}`);
        
        // Определяем колонки
        const codeCol = 2;           // C - шифр
        const positionCol1 = 0;      // A - № п/п
        const positionCol2 = 1;      // B - поз. по смете
        const nameCol = 3;           // D - наименование
        const unitCol = 4;           // E - ед.изм.
        const quantityCol = 5;       // F - количество
        const coeffCol = 8;          // I - коэффициент
        const totalCol = 10;         // K - сумма
        
        console.log(`\n📌 ИСПОЛЬЗУЕМЫЕ КОЛОНКИ:`);
        console.log(`   A (1): № п/п`);
        console.log(`   B (2): поз. по смете`);
        console.log(`   C (3): Шифр`);
        console.log(`   D (4): Наименование`);
        console.log(`   E (5): Ед.изм.`);
        console.log(`   F (6): Количество`);
        console.log(`   I (9): Коэффициент`);
        console.log(`   K (11): Сумма`);
        
        // ==================== СБОР ПОЗИЦИЙ ====================
        const positions = [];
        let i = 0;
        let positionCounter = 1;
        let totalAmount = 0;
        let skippedCount = 0;
        
        console.log(`\n${'─'.repeat(80)}`);
        console.log(`🔍 НАЧАЛО СБОРА ПОЗИЦИЙ`);
        console.log(`${'─'.repeat(80)}`);
        
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
                console.log(`   ⏭️ Пропуск заголовка: строка ${i + 1} - "${codeCell.substring(0, 40)}"`);
                i++;
                continue;
            }
            
            // Проверяем на конец документа
            const firstCell = String(row[0] || '').toLowerCase();
            if (firstCell.includes('составил') || firstCell.includes('проверил') ||
                firstCell.includes('начальник') || firstCell.includes('главный инженер')) {
                console.log(`   🏁 Конец документа на строке ${i + 1}`);
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
            let positionTotal = parseNumber(row[totalCol]);
            
            console.log(`\n${'─'.repeat(80)}`);
            console.log(`📍 ПОЗИЦИЯ ${positionCounter}:`);
            console.log(`   Строка: ${i + 1}`);
            console.log(`   № п/п: ${ks2Position}`);
            console.log(`   поз. по смете: ${estimatePosition || '—'}`);
            console.log(`   Шифр: ${code}`);
            console.log(`   Наименование: ${name.substring(0, 80)}${name.length > 80 ? '…' : ''}`);
            console.log(`   Ед.изм.: ${unit || '—'}`);
            console.log(`   Количество: ${quantity}`);
            console.log(`   Коэффициент (колонка I): ${coefficient || '—'}`);
            console.log(`   Сумма в строке (колонка K): ${positionTotal.toLocaleString('ru-RU')} ₽`);
            
            // ==================== СБОР ДЕТАЛЕЙ ====================
            let details = [];
            let detailsTotal = 0;
            let j = i + 1;
            let detailCount = 0;
            
            while (j < data.length) {
                const nextRow = data[j];
                if (!nextRow) { j++; continue; }
                
                // Проверяем, не началась ли новая позиция
                const nextCodeCell = nextRow[codeCol] ? String(nextRow[codeCol]).trim() : '';
                const nextCode = extractCodeFromString(nextCodeCell);
                
                if (nextCode && nextCode !== code) {
                    console.log(`   🔚 Конец деталей на строке ${j} (начало новой позиции: ${nextCode})`);
                    break;
                }
                
                // Получаем текст из колонки наименования
                const detailName = nextRow[nameCol] ? String(nextRow[nameCol]).trim() : '';
                if (detailName === '') { j++; continue; }
                
                // Проверяем, является ли строка детальной
                if (isDetailRow(detailName)) {
                    detailCount++;
                    let detailTotal = parseNumber(nextRow[totalCol]);
                    
                    if (detailTotal === 0) {
                        const detailQuantity = parseNumber(nextRow[quantityCol]);
                        if (detailQuantity !== 0) {
                            detailTotal = detailQuantity;
                        }
                    }
                    
                    detailsTotal += detailTotal;
                    
                    details.push({
                        type: detailName,
                        amount: detailTotal,
                        quantity: parseNumber(nextRow[quantityCol]),
                        unit: nextRow[unitCol] ? String(nextRow[unitCol]).trim() : '',
                        rowNumber: j + 1
                    });
                    
                    console.log(`      📄 Деталь ${detailCount}: "${detailName}" | Сумма: ${detailTotal.toLocaleString('ru-RU')} ₽ | Строка: ${j + 1}`);
                }
                
                j++;
            }
            
            // Итоговая сумма
            let total = positionTotal;
            if (total === 0 && detailsTotal > 0) {
                total = detailsTotal;
                console.log(`   💰 Сумма рассчитана из деталей: ${total.toLocaleString('ru-RU')} ₽`);
            } else if (total > 0) {
                console.log(`   💰 Сумма из строки: ${total.toLocaleString('ru-RU')} ₽`);
            } else {
                console.log(`   ⚠️ Сумма = 0 ₽ (возможно проблема с парсингом)`);
            }
            
            if (detailsTotal > 0) {
                console.log(`   📊 Сумма деталей: ${detailsTotal.toLocaleString('ru-RU')} ₽`);
            }
            
            // Вычисляем объём
            let volume = '';
            if (quantity > 0 && unit) {
                const unitMatch = unit.match(/(\d+(?:[.,]\d+)?)/);
                if (unitMatch) {
                    const unitValue = parseFloat(unitMatch[1].replace(',', '.'));
                    if (unitValue > 0 && unitValue !== 1) {
                        const vol = quantity * unitValue;
                        const unitName = unit.replace(/\d+(?:[.,]\d+)?\s*/, '');
                        volume = `${vol.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unitName}`;
                        console.log(`   📏 Объём (кол-во × ед.изм.): ${quantity} × ${unit} = ${volume}`);
                    } else {
                        volume = `${quantity.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unit}`;
                        console.log(`   📏 Объём: ${volume}`);
                    }
                } else {
                    volume = `${quantity.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unit}`;
                    console.log(`   📏 Объём: ${volume}`);
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
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📊 ИТОГИ ПАРСИНГА КС-2:`);
        console.log(`${'='.repeat(80)}`);
        console.log(`   ✅ Всего позиций: ${positions.length}`);
        console.log(`   💰 Общая сумма: ${totalAmount.toLocaleString('ru-RU')} ₽`);
        console.log(`   📊 С коэффициентом: ${positions.filter(p => p.coefficient).length}`);
        console.log(`   📦 С детализацией: ${positions.filter(p => p.details.length > 0).length}`);
        console.log(`   ⏭️ Пропущено строк: ${skippedCount}`);
        console.log(`${'='.repeat(80)}\n`);
        
        // Детальный вывод по каждой позиции
        if (positions.length > 0) {
            console.log(`📋 ДЕТАЛЬНЫЙ СПИСОК ПОЗИЦИЙ:`);
            console.log(`${'='.repeat(80)}`);
            for (const pos of positions) {
                console.log(`\n   ${pos.position}. ${pos.ks2_position_number} | ${pos.code}`);
                console.log(`      Наименование: ${pos.name.substring(0, 70)}`);
                console.log(`      Коэффициент: ${pos.coefficient || '—'}`);
                console.log(`      Сумма: ${pos.total.toLocaleString('ru-RU')} ₽`);
                if (pos.details.length > 0) {
                    console.log(`      Детали (${pos.details.length}):`);
                    for (const d of pos.details) {
                        console.log(`         - ${d.type}: ${d.amount.toLocaleString('ru-RU')} ₽`);
                    }
                }
            }
            console.log(`${'='.repeat(80)}\n`);
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
        console.error(`❌ Ошибка парсинга КС-2:`, error);
        console.error(`   Stack:`, error.stack);
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