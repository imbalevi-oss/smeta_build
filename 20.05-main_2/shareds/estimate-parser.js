// shareds/estimate-parser.js
// ПАРСЕР СМЕТНЫХ ФАЙЛОВ – ПОЛНАЯ ВЕРСИЯ
// - Автоопределение колонок
// - Коэффициенты (в строке или следующих строках)
// - Детали (ЗП, ЭМ, МР, НР, СП) с расчётом сумм
// - Выделение МР (материальные ресурсы)
// - Расчёт объёма (количество × единица измерения)

const XLSX = require('xlsx');
const { detectCoefficientColumn } = require('./estimate-parser-config');

// ======================== БАЗОВЫЕ УТИЛИТЫ ========================

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
    if (typeof value === 'number') {
        if (isNaN(value)) return null;
        return value;
    }
    if (typeof value === 'object') {
        if (value.v !== undefined) value = value.v;
        else if (value.f !== undefined) value = value.f;
        else return null;
        if (typeof value === 'number') return value;
        if (typeof value !== 'string') return null;
    }
    let str = String(value).trim();
    if (str === '') return null;
    str = str.replace(/^[*хx≈~=<>+\\/|:;]+/, '').replace(/\s/g, '');
    if (str === '') return null;
    let normalized = str;
    if (normalized.includes(',') && normalized.includes('.')) {
        normalized = normalized.replace(/,/g, '');
    } else if (normalized.includes(',') && !normalized.includes('.')) {
        normalized = normalized.replace(',', '.');
    }
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (match) {
        const num = parseFloat(match[0]);
        return isNaN(num) ? null : num;
    }
    return null;
}

// Извлечение числового множителя из единицы измерения (например, "1000 м3" → 1000)
function extractUnitNumber(unitStr) {
    if (!unitStr) return 1;
    const match = String(unitStr).match(/(\d+(?:[.,]\d+)?)/);
    if (match) return parseFloat(match[1].replace(',', '.'));
    return 1;
}

// Нормализация названия единицы измерения (убирает число)
function normalizeUnitName(unitStr) {
    if (!unitStr) return '';
    return String(unitStr).replace(/^\d+(?:[.,]\d+)?\s*/, '').trim();
}

// Форматирование объёма: количество × числовой множитель единицы измерения
function formatVolume(quantity, unitStr) {
    const qty = parseNumber(quantity);
    const unitNumber = extractUnitNumber(unitStr);
    const volume = qty * unitNumber;
    if (volume === 0) return '';
    const unitName = normalizeUnitName(unitStr);
    const formatted = volume.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    return unitName ? `${formatted} ${unitName}` : formatted;
}

function extractCodeFromString(str) {
    if (!str || typeof str !== 'string') return { code: null, comment: '' };
    const trimmed = str.trim();
    if (trimmed === '') return { code: null, comment: '' };
    if (trimmed.toLowerCase().startsWith('цена поставщика')) return { code: trimmed, comment: '' };
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
                const comment = trimmed.substring(match[0].length).trim();
                return { code, comment };
            }
        }
    }
    return { code: null, comment: trimmed };
}

function isDetailRow(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase().trim();
    const detailKeywords = ['зп', 'эм', 'мр', 'нр', 'сп', 'зтр', 'в т.ч.', 'в тч', 'зпм'];
    return detailKeywords.some(kw => lowerText === kw || lowerText.startsWith(kw + ' ') || lowerText.startsWith(kw));
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

function isPositionNumber(str) {
    if (!str && str !== 0) return false;
    const trimmed = String(str).trim();
    if (trimmed === '') return false;
    return /^\d+(\.\d+)?$/.test(trimmed.replace(',', '.'));
}

function normalizePositionNumber(str) {
    if (!str && str !== 0) return '';
    return String(str).trim().replace(',', '.');
}

// ======================== ОПРЕДЕЛЕНИЕ КОЛОНОК ========================

function findHeaderRow(data) {
    for (let i = 0; i < Math.min(100, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
        if (rowStr.includes('поправоч') || rowStr.includes('коэф') || rowStr.includes('коэффициент')) {
            console.log(`   🔍 Заголовок с коэффициентом найден в строке ${i+1}`);
            return i;
        }
    }
    for (let i = 0; i < Math.min(100, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
        if (rowStr.includes('№') && rowStr.includes('п/п') && rowStr.includes('шифр')) {
            console.log(`   🔍 Заголовок (альтернативный) найден в строке ${i+1}`);
            return i;
        }
    }
    console.log(`   ⚠️ Заголовок не найден, используем строку 27`);
    return 27;
}

function detectColumnsFromHeader(headerRow) {
    const columns = { position: -1, code: -1, coefficient: -1, amount: -1 };
    if (!headerRow) return columns;
    for (let col = 0; col < headerRow.length; col++) {
        const cell = String(headerRow[col] || '').toLowerCase();
        if (columns.position === -1 && (cell.includes('№') || cell.includes('п/п') || cell === 'пп'))
            columns.position = col;
        if (columns.code === -1 && (cell === 'код' || cell.includes('шифр') || cell === 'ресурс'))
            columns.code = col;
        if (columns.coefficient === -1 && (cell.includes('коэф') || cell === 'k' || cell.includes('поправоч')))
            columns.coefficient = col;
        if (columns.amount === -1 && (cell.includes('всего') || cell.includes('итого') || cell === 'сумма'))
            columns.amount = col;
    }
    return columns;
}

function findDataStartRow(data, headerRowIdx) {
    for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 30, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        if (isPositionNumber(row[0]) && row[1] && String(row[1]).trim().length > 0) return i;
    }
    return headerRowIdx + 1;
}

// ======================== ОСНОВНАЯ ФУНКЦИЯ ПАРСИНГА ========================

function parseEstimate(fileBuffer, fileName = '') {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 ПАРСИНГ СМЕТЫ: ${fileName || 'файл'}`);
    console.log(`${'='.repeat(80)}`);

    try {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        console.log(`   📄 Лист: ${sheetName}`);
        console.log(`   📊 Всего строк: ${data.length}`);

        const headerRowIdx = findHeaderRow(data);
        const headerRow = data[headerRowIdx];
        let columns = detectColumnsFromHeader(headerRow);
        const startRow = findDataStartRow(data, headerRowIdx);

        if (columns.position === -1) columns.position = 0;
        if (columns.code === -1) columns.code = 2;
        if (columns.coefficient === -1) {
            const detectedCoeffCol = detectCoefficientColumn(data, startRow);
            if (detectedCoeffCol !== -1) {
                columns.coefficient = detectedCoeffCol;
                console.log(`   🔍 Колонка коэффициента автоматически определена: ${columns.coefficient + 1} (${String.fromCharCode(65 + columns.coefficient)})`);
            } else {
                columns.coefficient = 8;
                console.log(`   ⚠️ Колонка коэффициента не найдена, используем по умолчанию 9 (I)`);
            }
        }
        if (columns.amount === -1) columns.amount = 9;

        console.log(`\n📌 ОПРЕДЕЛЁННЫЕ КОЛОНКИ:`);
        console.log(`   Позиция: ${columns.position + 1} (${String.fromCharCode(65 + columns.position)})`);
        console.log(`   Код: ${columns.code + 1} (${String.fromCharCode(65 + columns.code)})`);
        console.log(`   Коэффициент: ${columns.coefficient + 1} (${String.fromCharCode(65 + columns.coefficient)})`);
        console.log(`   Сумма: ${columns.amount + 1} (${String.fromCharCode(65 + columns.amount)})`);
        console.log(`   Начало данных: строка ${startRow + 1}`);

        // Вывод структуры файла (первые 30 строк)
        console.log(`\n${'─'.repeat(80)}`);
        console.log(`📋 СТРУКТУРА ФАЙЛА (первые 30 строк):`);
        console.log(`${'─'.repeat(80)}`);
        console.log(`   Row | Поз      | Код                       | Наименование             | Коэф     | Сумма       |`);
        console.log(`${'─'.repeat(80)}`);
        for (let i = 0; i < Math.min(30, data.length); i++) {
            const row = data[i];
            if (row) {
                const pos = (row[columns.position] || '').toString().substring(0, 8);
                const code = (row[columns.code] || '').toString().substring(0, 25);
                const name = (row[2] || '').toString().substring(0, 25);
                const coeffRaw = row[columns.coefficient];
                const coeff = coeffRaw !== undefined && coeffRaw !== null && coeffRaw !== '' ? String(coeffRaw).substring(0, 8) : '';
                const amount = (row[columns.amount] || '').toString().substring(0, 12);
                console.log(`   ${String(i+1).padStart(3)} | ${pos.padEnd(8)} | ${code.padEnd(25)} | ${name.padEnd(25)} | ${coeff.padEnd(8)} | ${amount.padEnd(10)} |`);
            }
        }
        console.log(`${'─'.repeat(80)}`);

        const positions = [];
        let i = startRow;
        let positionCounter = 1;
        let totalAmount = 0;
        let skippedCount = 0;

        console.log(`\n🔍 НАЧАЛО СБОРА ПОЗИЦИЙ (сумма из колонки суммы)`);
        console.log(`${'─'.repeat(80)}`);

        while (i < data.length) {
            const row = data[i];
            if (!row) { i++; continue; }

            const firstCell = (row[0] || '').toString().toLowerCase();
            if (firstCell.includes('итого') || firstCell.includes('раздел') ||
                firstCell.includes('подраздел') || firstCell.includes('составил') ||
                firstCell.includes('проверил') || firstCell.includes('ндс')) {
                console.log(`   ⏭️ Пропуск служебной строки ${i+1}: "${firstCell.substring(0, 40)}"`);
                i++;
                skippedCount++;
                continue;
            }

            const positionValue = row[columns.position];
            if (!positionValue || !isPositionNumber(positionValue)) { i++; continue; }

            const codeRaw = row[columns.code] ? String(row[columns.code]).trim() : '';
            if (/^\d+$/.test(codeRaw) && codeRaw.length <= 3) {
                console.log(`   ⏭️ Пропуск строки ${i+1}: код "${codeRaw}" – вероятно, не шифр`);
                i++;
                skippedCount++;
                continue;
            }

            const positionNumber = normalizePositionNumber(positionValue);
            const codeCell = codeRaw;
            const { code: extractedCode } = extractCodeFromString(codeCell);
            const name = row[2] ? String(row[2]).trim() : '';
            const unit = row[3] ? String(row[3]).trim() : '';
            const quantity = parseNumber(row[4]);
            const volume = formatVolume(quantity, unit);
            
            // Коэффициент
            let coefficient = null;
            const coeffCell = row[columns.coefficient];
            if (coeffCell !== undefined && coeffCell !== null && coeffCell !== '') {
                coefficient = parseNumberWithComma(coeffCell);
                if (coefficient !== null && coefficient !== 1) {
                    console.log(`      🔍 Коэффициент в строке позиции ${i+1}: сырое = ${JSON.stringify(coeffCell)}, значение = ${coefficient}`);
                }
            }
            if (coefficient === null || coefficient === 1) {
                let searchLimit = 5;
                let j = i + 1;
                while (j < data.length && j - i <= searchLimit) {
                    const nextRow = data[j];
                    if (!nextRow) { j++; continue; }
                    const nextPos = nextRow[columns.position];
                    if (nextPos && isPositionNumber(nextPos)) break;
                    const nextCoeffCell = nextRow[columns.coefficient];
                    if (nextCoeffCell !== undefined && nextCoeffCell !== null && nextCoeffCell !== '') {
                        const nextCoeff = parseNumberWithComma(nextCoeffCell);
                        if (nextCoeff !== null && nextCoeff !== 0 && nextCoeff !== 1) {
                            coefficient = nextCoeff;
                            console.log(`      🔍 Коэффициент найден в строке ${j+1}: ${coefficient}`);
                            break;
                        }
                    }
                    j++;
                }
                if (coefficient === null) console.log(`      ⚠️ Коэффициент не найден ни в строке позиции, ни в следующих строках`);
            }
            
            let positionTotal = parseNumber(row[columns.amount]);

            console.log(`\n${'─'.repeat(80)}`);
            console.log(`📍 ПОЗИЦИЯ ${positionCounter} (строка ${i+1})`);
            console.log(`   № п/п: ${positionNumber}`);
            console.log(`   Код: ${extractedCode || codeCell || '—'}`);
            console.log(`   Наименование: ${name.substring(0, 80)}${name.length>80?'…':''}`);
            console.log(`   Ед.изм.: ${unit || '—'}`);
            console.log(`   Количество: ${quantity}`);
            console.log(`   Объём: ${volume || '—'}`);
            console.log(`   Коэффициент: ${coefficient !== null ? coefficient : '—'}`);
            console.log(`   🔍 СУММА В СТРОКЕ (колонка ${String.fromCharCode(65+columns.amount)}): исходное = "${row[columns.amount]}", parse = ${positionTotal}`);

            // Сбор деталей
            let details = [];
            let detailsTotal = 0;
            let detailSumLog = [];
            let mrTotalAmount = 0;
            let mrDetails = [];
            let j = i + 1;
            let detailCount = 0;

            while (j < data.length) {
                const nextRow = data[j];
                if (!nextRow) { j++; continue; }

                const nextPos = nextRow[columns.position];
                if (nextPos && isPositionNumber(nextPos)) {
                    console.log(`   🔚 Конец деталей на строке ${j+1} (начало новой позиции ${normalizePositionNumber(nextPos)})`);
                    break;
                }

                const detailName = nextRow[2] ? String(nextRow[2]).trim() : '';
                if (detailName === '') { j++; continue; }

                if (isDetailRow(detailName)) {
                    detailCount++;
                    let detailAmount = parseNumber(nextRow[columns.amount]);
                    console.log(`      🔎 ДЕТАЛЬ ${detailCount}: тип="${detailName}", сырое значение суммы="${nextRow[columns.amount]}", parseNumber = ${detailAmount}`);
                    
                    if (detailAmount === 0 && parseNumber(nextRow[4]) !== 0 && parseNumber(nextRow[5]) !== 0) {
                        const q = parseNumber(nextRow[4]);
                        const p = parseNumber(nextRow[5]);
                        const c = parseNumberWithComma(nextRow[columns.coefficient]) || 1;
                        detailAmount = q * p * c;
                        console.log(`      🔄 Рассчитано из кол-во×цена×коэф: ${q} * ${p} * ${c} = ${detailAmount}`);
                    }
                    
                    detailsTotal += detailAmount;
                    detailSumLog.push(`${detailName}=${detailAmount}`);
                    
                    const detailQuantity = parseNumber(nextRow[4]);
                    const detailPrice = parseNumber(nextRow[5]);
                    const detailUnit = nextRow[3] ? String(nextRow[3]).trim() : '';
                    const detailVolume = formatVolume(detailQuantity, detailUnit);
                    
                    details.push({
                        type: detailName,
                        amount: detailAmount,
                        quantity: detailQuantity,
                        price: detailPrice,
                        unit: detailUnit,
                        volume: detailVolume,
                        rowNumber: j + 1
                    });
                    
                    if (isMR(detailName)) {
                        mrTotalAmount += detailAmount;
                        mrDetails.push({
                            type: 'МР',
                            originalType: detailName,
                            amount: detailAmount,
                            quantity: detailQuantity,
                            price: detailPrice,
                            unit: detailUnit,
                            volume: detailVolume,
                            rowNumber: j + 1
                        });
                        console.log(`      🏷️ Деталь помечена как МР! Сумма МР: ${mrTotalAmount.toLocaleString('ru-RU')} ₽`);
                    }
                    
                    console.log(`      📄 Деталь ${detailCount}: "${detailName}" | Сумма: ${detailAmount.toLocaleString('ru-RU')} ₽ | Строка: ${j+1}`);
                }
                j++;
            }

            // Проверка, является ли сама позиция МР
            const positionIsMR = isMR(name) || isMR(codeCell);
            let positionMrContribution = 0;
            if (positionIsMR) {
                positionMrContribution = positionTotal;
                mrTotalAmount += positionMrContribution;
                mrDetails.push({
                    type: 'МР',
                    originalType: 'Позиция (МР)',
                    amount: positionTotal,
                    quantity: quantity,
                    price: parseNumber(row[5]),
                    unit: unit,
                    volume: volume,
                    rowNumber: i + 1,
                    isMainRow: true
                });
                console.log(`      🏷️ Основная строка позиции помечена как МР! Добавлено к МР: ${positionMrContribution.toLocaleString('ru-RU')} ₽`);
            }

            console.log(`   📊 СУММА ДЕТАЛЕЙ (detailsTotal) = ${detailsTotal}`);
            if (detailSumLog.length) console.log(`      Расклад: ${detailSumLog.join(', ')}`);
            console.log(`   📦 СУММА МР (материальные ресурсы) = ${mrTotalAmount.toLocaleString('ru-RU')} ₽`);

            let total = positionTotal + detailsTotal;
            console.log(`   💰 ИТОГОВАЯ СУММА ПОЗИЦИИ: ${positionTotal} + ${detailsTotal} = ${total} ₽`);

            if (total === 0 && quantity !== 0 && parseNumber(row[5]) !== 0) {
                const price = parseNumber(row[5]);
                total = quantity * price * (coefficient || 1);
                console.log(`   🔄 Альтернативный расчёт (кол-во×цена×коэф): ${total} ₽`);
                if (positionIsMR && total !== 0) {
                    mrTotalAmount = mrTotalAmount - positionMrContribution + total;
                    const mainMrIndex = mrDetails.findIndex(d => d.isMainRow === true);
                    if (mainMrIndex !== -1) mrDetails[mainMrIndex].amount = total;
                    console.log(`      🔄 Пересчитана сумма МР для основной позиции: ${total.toLocaleString('ru-RU')} ₽`);
                }
            }

            totalAmount += total;
            console.log(`   💰 НАКОПЛЕННАЯ ОБЩАЯ СУММА после позиции ${positionCounter}: ${totalAmount}`);

            positions.push({
                positionNumber: positionNumber,
                code: extractedCode || codeCell,
                name: name,
                unit: unit,
                quantity: quantity,
                formattedVolume: volume,
                coefficient: coefficient,
                totalAmount: total,
                amountFromRow: positionTotal,
                details: details,
                detailsTotal: detailsTotal,
                rowNumber: i + 1,
                isTextPosition: (!extractedCode && !isDetailRow(name)) && (name.length > 0),
                mrTotalAmount: mrTotalAmount,
                mrDetails: mrDetails
            });

            positionCounter++;
            i = j;
        }

        console.log(`\n${'='.repeat(80)}`);
        console.log(`📊 ИТОГИ ПАРСИНГА СМЕТЫ:`);
        console.log(`   ✅ Всего позиций: ${positions.length}`);
        console.log(`   💰 Общая сумма: ${totalAmount.toLocaleString('ru-RU')} ₽`);
        console.log(`   📦 С детализацией: ${positions.filter(p => p.details.length > 0).length}`);
        const positionsWithMr = positions.filter(p => p.mrDetails.length > 0);
        console.log(`   🧱 Позиций с МР: ${positionsWithMr.length}`);
        const totalMr = positions.reduce((sum, p) => sum + (p.mrTotalAmount || 0), 0);
        console.log(`   🧱 Общая сумма МР: ${totalMr.toLocaleString('ru-RU')} ₽`);
        console.log(`   ⏭️ Пропущено строк: ${skippedCount}`);
        console.log(`${'='.repeat(80)}\n`);

        if (positions.length > 0) {
            console.log(`📋 ДЕТАЛЬНЫЙ СПИСОК ПОЗИЦИЙ:`);
            console.log(`${'='.repeat(80)}`);
            for (const pos of positions) {
                console.log(`\n   ${pos.positionNumber} | ${pos.code || '—'}`);
                console.log(`      Наименование: ${pos.name.substring(0, 70)}`);
                console.log(`      Объём: ${pos.formattedVolume || '—'}`);
                console.log(`      Коэффициент: ${pos.coefficient !== null ? pos.coefficient : '—'}`);
                console.log(`      Сумма: ${pos.totalAmount.toLocaleString('ru-RU')} ₽`);
                if (pos.mrDetails.length > 0) console.log(`      МР (${pos.mrDetails.length}): ${pos.mrTotalAmount.toLocaleString('ru-RU')} ₽`);
                if (pos.details.length > 0) {
                    console.log(`      Детали (${pos.details.length}):`);
                    for (const d of pos.details) console.log(`         - ${d.type}: ${d.amount.toLocaleString('ru-RU')} ₽`);
                }
            }
            console.log(`${'='.repeat(80)}\n`);
        }

        return {
            success: true,
            fileName: fileName,
            sheetName: sheetName,
            totalItems: positions.length,
            totalAmount: totalAmount,
            totalAmountFormatted: totalAmount.toLocaleString('ru-RU'),
            items: positions,
            detectedColumns: {
                position: columns.position + 1,
                code: columns.code + 1,
                coefficient: columns.coefficient + 1,
                amount: columns.amount + 1
            }
        };

    } catch (error) {
        console.error(`❌ Ошибка парсинга сметы:`, error);
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

module.exports = { parseEstimate };