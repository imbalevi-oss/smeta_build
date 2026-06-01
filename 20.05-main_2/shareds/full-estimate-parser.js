// shareds/full-estimate-parser.js - ПОЛНОСТЬЮ ПЕРЕПИСАН

const XLSX = require('xlsx');

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
    
    if (unitValue > 0 && qty > 0) {
        return qty * unitValue;
    }
    return qty;
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

function isHeaderRow(row) {
    if (!row || row.length === 0) return false;
    const firstCell = row[0] ? String(row[0]).trim() : '';
    return firstCell === '№№ п/п' || firstCell === '№ п/п';
}

function isPositionRow(row) {
    if (!row || row.length < 2) return false;
    const numCell = row[0];
    const codeCell = row[1];
    if (!numCell && numCell !== 0) return false;
    const numStr = String(numCell).trim();
    if (!/^\d+([,.-]\d+)?$/.test(numStr)) return false;
    const code = codeCell ? String(codeCell).trim() : '';
    if (code === '') return false;
    if (code.toLowerCase().includes('цена поставщика')) return false;
    if (code.toLowerCase().includes('всего')) return false;
    return true;
}

function isTextPositionRow(row) {
    if (!row || row.length < 2) return false;
    const numCell = row[0];
    const codeCell = row[1];
    if (!numCell && numCell !== 0) return false;
    const numStr = String(numCell).trim();
    if (!/^\d+([,.-]\d+)?$/.test(numStr)) return false;
    const code = codeCell ? String(codeCell).trim() : '';
    if (code.toLowerCase().includes('цена поставщика')) return true;
    if (code === '') return true;
    return false;
}

function isSkippableRow(row) {
    if (!row || row.length === 0) return true;
    const firstCell = row[0] ? String(row[0]).toLowerCase() : '';
    if (firstCell.includes('итого') || firstCell.includes('подраздел') || firstCell.includes('раздел')) return true;
    if (firstCell.includes('составил') || firstCell.includes('проверил')) return true;
    if (firstCell.includes('ндс')) return true;
    if (firstCell.includes('всего с ндс')) return true;
    if (firstCell.includes('всего по смете')) return true;
    if (firstCell === '') return false;
    return false;
}

function findDataSheet(workbook) {
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        for (let i = 0; i < Math.min(50, data.length); i++) {
            const row = data[i];
            if (row && (row[0] === '№№ п/п' || row[0] === '№ п/п')) {
                return { sheetName, startRow: i + 1 };
            }
        }
    }
    return { sheetName: workbook.SheetNames[0], startRow: 0 };
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

function parseFullEstimate(fileBuffer) {
    console.log('\n' + '='.repeat(70));
    console.log('🔍 FULL ESTIMATE PARSER - ВЕРСИЯ 2.0');
    console.log('='.repeat(70));
    
    try {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
        const { sheetName, startRow: headerRowIndex } = findDataSheet(workbook);
        console.log(`📄 Лист: ${sheetName}, заголовок на строке ${headerRowIndex + 1}`);

        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        // Вывод структуры первых строк для отладки
        console.log('\n📋 СТРУКТУРА ФАЙЛА (первые 15 строк):');
        for (let idx = 0; idx < Math.min(15, data.length); idx++) {
            const row = data[idx];
            if (row) {
                console.log(`  Строка ${idx + 1}: [0]=${row[0] || '""'}, [1]=${row[1] || '""'}, [2]=${(row[2] || '""').substring(0, 40)}, [9]=${row[9] || '""'}`);
            }
        }

        const positions = [];
        let i = headerRowIndex + 1;
        const totalRows = data.length;
        
        console.log(`\n🔍 Начало парсинга с строки ${i + 1}...`);

        while (i < totalRows) {
            const row = data[i];
            if (!row) { i++; continue; }
            
            // Пропускаем служебные строки
            if (isSkippableRow(row)) { 
                console.log(`⏭️ Пропуск служебной строки ${i + 1}`);
                i++; 
                continue; 
            }

            // ==================== ОБЫЧНАЯ ПОЗИЦИЯ ====================
            if (isPositionRow(row)) {
                const positionNumber = String(row[0]).trim();
                const codeCell = row[1] ? String(row[1]).trim() : '';
                const nameCell = row[2] ? String(row[2]).trim() : '';
                const unitCell = row[3] ? String(row[3]).trim() : '';
                const quantityFromRow = parseNumber(row[4]);
                const priceFromRow = parseNumber(row[5]);
                
                const mainVolume = calculateVolume(quantityFromRow, unitCell);
                const formattedMainVolume = formatVolume(mainVolume, unitCell);
                
                console.log(`\n📌 ОБЫЧНАЯ ПОЗИЦИЯ ${positionNumber}: ${codeCell}`);
                console.log(`   Наименование: ${nameCell.substring(0, 60)}`);
                
                // Сбор деталей
                let details = [];
                let sumAllDetails = 0;
                let mrTotal = 0;
                let mrDetails = [];
                let j = i + 1;
                
                while (j < totalRows) {
                    const nextRow = data[j];
                    if (!nextRow) { j++; continue; }
                    
                    // Проверка на новую позицию
                    if (isPositionRow(nextRow) || isTextPositionRow(nextRow)) {
                        break;
                    }
                    
                    if (isSkippableRow(nextRow)) { j++; continue; }
                    
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
                
                let totalAmount = sumAllDetails;
                
                if (totalAmount === 0 && quantityFromRow !== 0 && priceFromRow !== 0) {
                    const coeffMain = parseNumber(row[6]) || 1;
                    const coeffWinter = parseNumber(row[7]) || 1;
                    const coeffRecalc = parseNumber(row[8]) || 1;
                    totalAmount = quantityFromRow * priceFromRow * coeffMain * coeffWinter * coeffRecalc;
                }
                
                console.log(`   💰 Сумма: ${totalAmount.toLocaleString('ru-RU')} ₽`);
                console.log(`   📊 Деталей: ${details.length}, МР: ${mrDetails.length}`);
                
                positions.push({
                    positionNumber: positionNumber,
                    code: codeCell,
                    name: nameCell,
                    unit: unitCell,
                    quantity: quantityFromRow,
                    price: priceFromRow,
                    volume: mainVolume,
                    formattedVolume: formattedMainVolume,
                    totalAmount: totalAmount,
                    details: details,
                    mrDetails: mrDetails,
                    mrTotalAmount: mrTotal,
                    sumAllDetails: sumAllDetails,
                    isTextPosition: false
                });
                
                i = j;
                continue;
            }
            
            // ==================== ТЕКСТОВАЯ ПОЗИЦИЯ ====================
            if (isTextPositionRow(row)) {
                const positionNumber = String(row[0]).trim();
                const codeCell = row[1] ? String(row[1]).trim() : '';
                const nameCell = row[2] ? String(row[2]).trim() : '';
                const unitCell = row[3] ? String(row[3]).trim() : '';
                const quantityFromRow = parseNumber(row[4]);
                const priceFromRow = parseNumber(row[5]);
                const amountFromRow = parseNumber(row[9]);
                
                const textVolume = calculateVolume(quantityFromRow, unitCell);
                const formattedTextVolume = formatVolume(textVolume, unitCell);
                
                console.log(`\n📝 ТЕКСТОВАЯ ПОЗИЦИЯ ${positionNumber}`);
                console.log(`   Наименование: ${nameCell.substring(0, 60)}`);
                console.log(`   Сумма в строке (колонка J): ${amountFromRow.toLocaleString('ru-RU')} ₽`);
                console.log(`   Кол-во: ${quantityFromRow}, Цена: ${priceFromRow}, Ед.изм: "${unitCell}"`);
                
                // СБОР ДЕТАЛЕЙ ДЛЯ ТЕКСТОВОЙ ПОЗИЦИИ
                let details = [];
                let sumAllDetails = 0;
                let mrTotal = 0;
                let mrDetails = [];
                let j = i + 1;
                
                console.log(`   🔍 Сбор деталей с строки ${j + 1}:`);
                
                while (j < totalRows) {
                    const nextRow = data[j];
                    if (!nextRow) { 
                        console.log(`      Строка ${j + 1} - пустая, пропускаем`);
                        j++; 
                        continue; 
                    }
                    
                    // Проверка на начало новой позиции (останавливаем сбор)
                    const isNewPosition = isPositionRow(nextRow);
                    const isNewTextPosition = isTextPositionRow(nextRow);
                    
                    if (isNewPosition || isNewTextPosition) {
                        console.log(`      🛑 Остановка на строке ${j + 1} (начало новой позиции)`);
                        break;
                    }
                    
                    // Пропускаем служебные строки
                    if (isSkippableRow(nextRow)) {
                        console.log(`      ⏭️ Строка ${j + 1} - служебная, пропускаем`);
                        j++; 
                        continue; 
                    }
                    
                    const detailText = nextRow[2] ? String(nextRow[2]).trim() : '';
                    
                    if (detailText === '') {
                        console.log(`      ⏭️ Строка ${j + 1} - пустое наименование, пропускаем`);
                        j++; 
                        continue; 
                    }
                    
                    // Получаем сумму из колонки J (индекс 9)
                    let detailAmount = parseNumber(nextRow[9]);
                    const quantity = parseNumber(nextRow[4]);
                    const price = parseNumber(nextRow[5]);
                    const unit = nextRow[3] ? String(nextRow[3]).trim() : '';
                    
                    console.log(`      📄 Строка ${j + 1}: "${detailText.substring(0, 40)}"`);
                    console.log(`         Сумма из колонки J: ${detailAmount.toLocaleString('ru-RU')} ₽`);
                    
                    // Если сумма не указана, пытаемся рассчитать
                    if (detailAmount === 0 && quantity !== 0 && price !== 0) {
                        const coeffMain = parseNumber(nextRow[6]) || 1;
                        const coeffWinter = parseNumber(nextRow[7]) || 1;
                        const coeffRecalc = parseNumber(nextRow[8]) || 1;
                        detailAmount = quantity * price * coeffMain * coeffWinter * coeffRecalc;
                        console.log(`         🔄 Рассчитано: ${detailAmount.toLocaleString('ru-RU')} ₽`);
                    }
                    
                    if (detailAmount !== 0) {
                        sumAllDetails += detailAmount;
                        console.log(`         ✅ Добавлено к сумме деталей. Теперь сумма деталей: ${sumAllDetails.toLocaleString('ru-RU')} ₽`);
                    } else {
                        console.log(`         ⚠️ Сумма = 0, не добавлена`);
                    }
                    
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
                        console.log(`         🏷️ Помечено как МР! Сумма МР: ${mrTotal.toLocaleString('ru-RU')} ₽`);
                    }
                    
                    j++;
                }
                
                // ВАЖНО: Суммируем сумму из строки и суммы из деталей
                let totalAmount = amountFromRow + sumAllDetails;
                
                console.log(`\n   ${'='.repeat(40)}`);
                console.log(`   📊 ИТОГИ ПО ТЕКСТОВОЙ ПОЗИЦИИ ${positionNumber}:`);
                console.log(`      Сумма из строки (колонка J): ${amountFromRow.toLocaleString('ru-RU')} ₽`);
                console.log(`      Сумма из деталей: ${sumAllDetails.toLocaleString('ru-RU')} ₽`);
                console.log(`      Количество деталей: ${details.length}`);
                console.log(`      ✅ ИТОГОВАЯ СУММА: ${totalAmount.toLocaleString('ru-RU')} ₽`);
                
                // Если ничего нет - пробуем рассчитать из кол-во × цена
                if (totalAmount === 0 && quantityFromRow !== 0 && priceFromRow !== 0) {
                    totalAmount = quantityFromRow * priceFromRow;
                    console.log(`      🔄 Рассчитано из кол-во×цена: ${totalAmount.toLocaleString('ru-RU')} ₽`);
                }
                
                // Проверка на МР для самой строки
                const isMrRow = isMR(nameCell) || isMR(codeCell);
                let mrTotalAmount = mrTotal;
                if (isMrRow) {
                    mrTotalAmount += amountFromRow;
                    console.log(`      🏷️ Строка помечена как МР, добавлено ${amountFromRow.toLocaleString('ru-RU')} ₽ к МР`);
                }
                console.log(`      📦 ИТОГО МР: ${mrTotalAmount.toLocaleString('ru-RU')} ₽`);
                console.log(`   ${'='.repeat(40)}`);
                
                const textPosition = {
                    positionNumber: positionNumber,
                    code: codeCell || nameCell,
                    extractedCode: null,
                    name: nameCell,
                    unit: unitCell,
                    quantity: quantityFromRow,
                    price: priceFromRow,
                    volume: textVolume,
                    formattedVolume: formattedTextVolume,
                    totalAmount: totalAmount,
                    amountFromRow: amountFromRow,
                    details: details,
                    mrDetails: mrDetails,
                    mrTotalAmount: mrTotalAmount,
                    sumAllDetails: sumAllDetails,
                    isTextPosition: true,
                    isText: true,
                    hasDetails: details.length > 0,
                    status: 'Обратите внимание',
                    statusCategory: 'text',
                    description: details.length > 0 
                        ? `📝 Текстовая позиция с детализацией (${details.length} строк, сумма деталей: ${sumAllDetails.toLocaleString('ru-RU')} ₽)`
                        : '📝 Текстовая позиция (цена поставщика)'
                };
                
                positions.push(textPosition);
                i = j;
                continue;
            }
            
            // Неопознанная строка - пропускаем
            i++;
        }

        // Подсчет итогов
        const totalFullAmount = positions.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
        const totalMrAmount = positions.reduce((sum, p) => sum + (p.mrTotalAmount || 0), 0);
        const totalDetailRows = positions.reduce((sum, p) => sum + (p.details || []).length, 0);
        const positionsWithMr = positions.filter(p => (p.mrDetails || []).length > 0).length;
        const textPositions = positions.filter(p => p.isTextPosition === true).length;
        const positionsWithZeroSum = positions.filter(p => p.totalAmount === 0).length;

        console.log('\n' + '='.repeat(70));
        console.log(`📊 РЕЗУЛЬТАТЫ ПАРСИНГА:`);
        console.log(`   Всего позиций: ${positions.length}`);
        console.log(`   Из них текстовых: ${textPositions}`);
        console.log(`   Позиций с нулевой суммой: ${positionsWithZeroSum}`);
        console.log(`   ОБЩАЯ СУММА: ${totalFullAmount.toLocaleString('ru-RU')} ₽`);
        console.log(`   ОБЩАЯ СУММА МР: ${totalMrAmount.toLocaleString('ru-RU')} ₽`);
        console.log('='.repeat(70) + '\n');

        // Вывод текстовых позиций с нулевой суммой для диагностики
        if (positionsWithZeroSum > 0) {
            console.log(`⚠️ ВНИМАНИЕ: Найдены позиции с нулевой суммой:`);
            positions.filter(p => p.totalAmount === 0).forEach(p => {
                console.log(`   - ${p.positionNumber}: ${p.name?.substring(0, 50)}`);
            });
        }

        return {
            success: true,
            estimateName: sheetName || 'Неизвестно',
            totalAmount: totalFullAmount,
            totalMrAmount: totalMrAmount,
            totalAmountFormatted: totalFullAmount.toLocaleString('ru-RU'),
            totalMrAmountFormatted: totalMrAmount.toLocaleString('ru-RU'),
            positions: positions,
            stats: {
                totalPositions: positions.length,
                positionsWithCode: positions.length - textPositions,
                textPositions: textPositions,
                positionsWithMr: positionsWithMr,
                totalDetailRows: totalDetailRows,
                totalMrRows: positions.reduce((sum, p) => sum + (p.mrDetails || []).length, 0),
                totalMrAmount: totalMrAmount
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
            totalMrAmountFormatted: '0',
            positions: [],
            stats: {
                totalPositions: 0,
                positionsWithCode: 0,
                textPositions: 0,
                positionsWithMr: 0,
                totalDetailRows: 0,
                totalMrRows: 0,
                totalMrAmount: 0
            }
        };
    }
}

module.exports = { parseFullEstimate };