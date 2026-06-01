// lib/analysis-engine.js
// Движок анализа сметных файлов

const xlsx = require('xlsx');
const fs = require('fs');
const iconv = require('iconv-lite');

const codesDb = require('../../shareds/codes-db');
const logsDb = require('../../shareds/logs-db');
const usersDb = require('../../shareds/users-db');
const { parseFullEstimate } = require('../../shareds/full-estimate-parser');

const { 
    PARSER_CONFIG, 
    findHeaderRows,
    detectColumnsFromMultiRowHeader,
    detectPositionColumn,
    detectCodeColumn,
    detectCoefficientColumn,
    detectAmountColumnUniversal,
    findDataStartRow,
    isPositionNumber, 
    normalizePositionNumber, 
    isHeaderRow, 
    isPureText, 
    extractCodeFromString, 
    extractTotalAmount, 
    parseNumberWithComma, 
    formatNumber
} = require('../../shareds/estimate-parser-config');

// Фикс кодировки имени файла
function fixFilename(filename) {
    if (!filename) return filename;
    try {
        const buffer = Buffer.from(filename, 'latin1');
        const decoded = iconv.decode(buffer, 'utf8');
        if (/[а-яА-Я]/.test(decoded)) return decoded;
    } catch (e) {}
    return filename;
}

// Глобальный кэш (будет установлен из server.js)
let globalCodesMap = new Map();
let globalHierarchicalMap = new Map();
let globalRelationsMap = new Map();

function setGlobalMaps(codesMap, hierarchicalMap, relationsMap) {
    globalCodesMap = codesMap;
    globalHierarchicalMap = hierarchicalMap;
    globalRelationsMap = relationsMap;
    codesDb.setGlobalMaps(codesMap, hierarchicalMap, relationsMap, new Map());
}

/**
 * ОСНОВНАЯ ФУНКЦИЯ АНАЛИЗА (УНИВЕРСАЛЬНЫЙ РЕЖИМ)
 */
async function performAnalysis(filePath, originalName, userId, isRevised, projectId = null) {
    const ip = 'local';
    const sessionId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 8);
    const user = await usersDb.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден');

    const fixedName = fixFilename(originalName);
    
    const moscowTime = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${moscowTime}] 📁 АНАЛИЗ ФАЙЛА: ${fixedName}`);
    console.log(`👤 Пользователь: ${user.fullname} (${user.institution})`);
    console.log(`🔄 Исправленная смета: ${isRevised ? 'Да' : 'Нет'}`);
    console.log(`🔧 Режим проверки: УНИВЕРСАЛЬНЫЙ`);
    console.log(`${'='.repeat(80)}`);
    
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    console.log(`📊 Всего строк в файле: ${data.length}`);
    
    // ==================== УНИВЕРСАЛЬНОЕ ОПРЕДЕЛЕНИЕ КОЛОНОК ====================
    console.log('🔍 Универсальный режим: автоопределение колонок...');
    
    const headerRows = findHeaderRows(data);
    console.log(`   Найдено строк-заголовков: ${headerRows.length}`);
    
    let positionCol, codeCol, coeffCol, amountCol, startRow, searchCoefficientLines;
    
    if (headerRows.length > 0) {
        const detectedColumns = detectColumnsFromMultiRowHeader(data, headerRows);
        const lastHeaderRow = Math.max(...headerRows);
        
        positionCol = detectedColumns.position !== -1 ? detectedColumns.position : detectPositionColumn(data, lastHeaderRow + 1);
        codeCol = detectedColumns.code !== -1 ? detectedColumns.code : detectCodeColumn(data, lastHeaderRow + 1);
        coeffCol = detectedColumns.coefficient !== -1 ? detectedColumns.coefficient : detectCoefficientColumn(data, lastHeaderRow + 1);
        amountCol = detectAmountColumnUniversal(data, headerRows);
        startRow = findDataStartRow(data, headerRows);
    } else {
        startRow = 27;
        positionCol = detectPositionColumn(data, startRow);
        codeCol = detectCodeColumn(data, startRow);
        coeffCol = detectCoefficientColumn(data, startRow);
        amountCol = detectAmountColumnUniversal(data, []);
    }
    
    searchCoefficientLines = PARSER_CONFIG.universal.searchCoefficientLines || 7;
    
    console.log(`\n📌 ОПРЕДЕЛЁННЫЕ КОЛОНКИ:`);
    console.log(`   Позиция: ${positionCol + 1} (${String.fromCharCode(65 + positionCol)})`);
    console.log(`   Код: ${codeCol + 1} (${String.fromCharCode(65 + codeCol)})`);
    console.log(`   Коэффициент: ${coeffCol + 1} (${String.fromCharCode(65 + coeffCol)})`);
    console.log(`   Сумма: ${amountCol + 1} (${String.fromCharCode(65 + amountCol)})`);
    console.log(`   Начало данных: строка ${startRow + 1}`);
    
    // Название сметы
    let estimateName = '';
    for (let i = 0; i < Math.min(30, data.length); i++) {
        if (data[i] && data[i][0]) {
            const cellText = String(data[i][0]).trim();
            if (cellText.length > 5 && cellText.length < 200 && 
                (cellText.toLowerCase().includes('смета') || cellText.toLowerCase().includes('расчёт'))) {
                estimateName = cellText;
                break;
            }
        }
    }
    if (!estimateName && data.length > 14 && data[14] && data[14][0]) {
        estimateName = String(data[14][0]).trim();
    }
    console.log(`\n📝 Название сметы: ${estimateName || 'не определено'}`);
    
    // Итоговая сумма
    const totalAmountInfo = extractTotalAmount(data, amountCol);
    const totalAmount = totalAmountInfo.totalAmount || 0;
    const foundRow = totalAmountInfo.foundRow;
    if (totalAmount) {
        console.log(`💰 Итоговая сумма: ${totalAmount.toLocaleString('ru-RU')} ₽`);
    }
    
    // Индекс коэффициентов
    const coefficientIndex = new Map();
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        const coeffVal = parseNumberWithComma(row[coeffCol]);
        if (coeffVal !== null && coeffVal !== 0 && coeffVal !== 1) {
            coefficientIndex.set(i, coeffVal);
        }
    }
    console.log(`\n📊 Найдено коэффициентов: ${coefficientIndex.size}`);
    
    // Сбор позиций
    const positionRows = [];
    const END_PHRASES = ['составил', 'проверил', 'начальник', 'главный инженер', 'руководитель'];
    
    console.log(`\n🔍 Сбор позиций с ${startRow + 1} строки...`);
    
    for (let i = startRow; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        
        const firstCell = row[0] ? String(row[0]).toLowerCase() : '';
        const fullRowText = row.map(cell => String(cell || '').toLowerCase()).join(' ');
        
        const isDocumentEnd = END_PHRASES.some(phrase => 
            firstCell.includes(phrase) || fullRowText.includes(phrase)
        );
        
        if (isDocumentEnd) {
            console.log(`   🏁 Конец документа на строке ${i + 1}`);
            break;
        }
        
        if (firstCell && isHeaderRow(firstCell)) continue;
        
        const positionValue = row[positionCol];
        if (positionValue && isPositionNumber(positionValue)) {
            positionRows.push(i);
            if (positionRows.length <= 20) {
                console.log(`   ✅ Позиция ${normalizePositionNumber(positionValue)} на строке ${i + 1}`);
            }
        }
    }
    
    console.log(`\n🔢 Найдено позиций: ${positionRows.length}`);
    
    // Результаты анализа
    const results = [];
    const unknownSet = new Set();
    const matchTypeCount = {
        exact: 0, table: 0, section: 0, collection: 0, chapter: 0,
        relation: 0, parent: 0, text: 0, restoration: 0, none: 0
    };
    
    let coefficientMatches = 0;
    let coefficientMismatches = 0;
    let coefficientRequiredButMissing = 0;
    
    const statusCounts = {
        available: 0,
        warning: 0,
        notAllowed: 0,
        notFound: 0
    };
    
    const sessionCodeCache = new Map();
    const COEFF_TOLERANCE = 0.01;
    let textLines = 0;
    
    console.log(`\n🔍 Начало анализа позиций...`);
    console.log(`${'='.repeat(80)}`);
    
    for (let idx = 0; idx < positionRows.length; idx++) {
        const currentRow = positionRows[idx];
        const nextPositionRow = positionRows[idx + 1] ?? null;
        const row = data[currentRow];
        
        if (!row) continue;
        
        const positionNumber = normalizePositionNumber(row[positionCol]);
        const rowNumber = currentRow + 1;
        
        const rawCell = row[codeCol];
        if (!rawCell && rawCell !== 0) continue;
        
        const fullCell = String(rawCell).trim();
        if (!fullCell || fullCell === '9999990001') continue;
        
        const codeData = extractCodeFromString(fullCell);
        const extractedCode = codeData.code;
        
        // Текстовая строка
        if (!extractedCode) {
            if (isPureText(fullCell)) {
                textLines++;
                matchTypeCount.text++;
                statusCounts.warning++;
                results.push({
                    code: fullCell,
                    extractedCode: null,
                    status: 'Обратите внимание',
                    description: '📝 Текстовая строка - цена поставщика, требуется проверка',
                    found: false,
                    matchType: 'text',
                    matchedLevel: 'text',
                    isRestoration: false,
                    hasCoefficient: false,
                    coefficientType: 'none',
                    expectedCoefficient: null,
                    actualCoefficient: null,
                    coefficientMatch: null,
                    coefficientRequired: false,
                    coefficientChecked: false,
                    isText: true,
                    hasComment: false,
                    positionNumber: positionNumber,
                    rowNumber: rowNumber,
                    fullRow: (row || []).map(cell => cell || '').join('\t'),
                    category: 'text'
                });
            }
            continue;
        }
        
        // Поиск коэффициента
        let actualCoefficient = null;
        let coeffSearchLimit = searchCoefficientLines;
        
        if (nextPositionRow !== null) {
            const distanceToNext = nextPositionRow - currentRow - 1;
            coeffSearchLimit = Math.min(searchCoefficientLines, distanceToNext);
        }
        
        if (coefficientIndex.has(currentRow)) {
            actualCoefficient = coefficientIndex.get(currentRow);
        } else {
            for (let offset = 1; offset <= coeffSearchLimit; offset++) {
                const checkRow = currentRow + offset;
                if (coefficientIndex.has(checkRow)) {
                    actualCoefficient = coefficientIndex.get(checkRow);
                    break;
                }
            }
        }
        
        // Поиск в БД
        const found = await codesDb.findHierarchicalMatch(extractedCode, sessionCodeCache);
        
        // Определение статуса
        let status = 'Доступен';
        let description = '';
        let matchType = 'none';
        let matchedLevel = 'none';
        let hasCoefficient = false;
        let coefficientType = 'none';
        let expectedCoefficient = null;
        let coefficientMatch = null;
        let isRestoration = false;
        let showInWarning = false;
        let category = 'ok';
        
        const isRestorationCode = (found && found.matchType === 'restoration') || 
                                  (extractedCode && /^5[1-9]\./.test(extractedCode));
        const isForbidden = (found && found.status === 'Нельзя применять');
        const isCoefficientHigh = (actualCoefficient !== null && actualCoefficient > 1);
        const isCoefficientLow = (actualCoefficient !== null && actualCoefficient < 1);
        const hasDbCoefficient = (found && found.coefficient_value !== null && found.coefficient_value !== undefined);
        const checkRequired = (found && (found.check_coefficient === 1 || found.check_coefficient === true));
        
        if (found) {
            status = found.status || 'Доступен';
            description = found.description || '';
            matchType = found.matchType;
            matchedLevel = found.matchedLevel || matchType;
            isRestoration = (found.matchType === 'restoration');
            
            if (hasDbCoefficient) {
                expectedCoefficient = found.coefficient_value;
                hasCoefficient = true;
                coefficientType = found.coefficient_type || 'none';
            }
            
            if (matchTypeCount[matchType] !== undefined) matchTypeCount[matchType]++;
        } else {
            matchTypeCount.none++;
            statusCounts.notFound++;
            status = 'НЕ НАЙДЕН';
            description = 'Код отсутствует в базе данных';
        }
        
        // Логика определения проблем
        if (isRestorationCode) {
            category = 'notallowed';
            status = 'Нельзя применять';
            description = '🏛️ Реставрационные работы (отделы 51-59). Применение запрещено.';
            showInWarning = true;
            statusCounts.notAllowed++;
        } else if (isForbidden) {
            category = 'notallowed';
            status = 'Нельзя применять';
            showInWarning = true;
            statusCounts.notAllowed++;
        } else if (isCoefficientHigh) {
            category = 'warning';
            status = 'Обратите внимание';
            if (hasDbCoefficient && expectedCoefficient !== null) {
                if (Math.abs(actualCoefficient - expectedCoefficient) <= COEFF_TOLERANCE) {
                    coefficientMatch = true;
                    coefficientMatches++;
                    description = `✅ Коэффициент ${formatNumber(actualCoefficient)} соответствует ожидаемому (${formatNumber(expectedCoefficient)})`;
                    category = 'ok';
                    status = 'Доступен';
                    showInWarning = false;
                } else {
                    coefficientMatch = false;
                    coefficientMismatches++;
                    description = " Завышения коэфицента Требуется обоснование.";
                    showInWarning = true;
                }
            } else {
                coefficientMatch = false;
                coefficientMismatches++;
                description = " Завышения коэфицента Требуется обоснование.";
                showInWarning = true;
            }
        } else if (isCoefficientLow) {
            category = 'ok';
            status = 'Доступен';
            description = `📉 Понижающий коэффициент: ${formatNumber(actualCoefficient)} (допустимо)`;
            showInWarning = false;
            coefficientMatch = null;
        } else if (checkRequired && hasDbCoefficient && actualCoefficient !== null) {
            if (Math.abs(actualCoefficient - expectedCoefficient) > COEFF_TOLERANCE) {
                category = 'warning';
                status = 'Обратите внимание';
                coefficientMatch = false;
                coefficientMismatches++;
                description = `⚠️ Коэффициент ${formatNumber(actualCoefficient)} не соответствует ожидаемому (${formatNumber(expectedCoefficient)}).`;
                showInWarning = true;
            } else {
                coefficientMatch = true;
                coefficientMatches++;
            }
        } else {
            category = 'ok';
            status = found ? (status || 'Доступен') : 'НЕ НАЙДЕН';
            showInWarning = false;
        }
        
        if (category === 'notallowed') {
            statusCounts.notAllowed++;
        } else if (category === 'warning') {
            statusCounts.warning++;
        } else if (category === 'ok' && found) {
            statusCounts.available++;
        } else if (!found && category !== 'text') {
            statusCounts.notFound++;
        }
        
        results.push({
            code: fullCell,
            extractedCode: extractedCode,
            status: status,
            description: description,
            found: !!found,
            matchType: matchType,
            matchedLevel: matchedLevel,
            isRestoration: isRestorationCode,
            hasCoefficient: (actualCoefficient !== null && actualCoefficient !== 1) || hasCoefficient,
            coefficientType: coefficientType,
            expectedCoefficient: expectedCoefficient,
            actualCoefficient: actualCoefficient,
            coefficientMatch: coefficientMatch,
            coefficientRequired: checkRequired,
            coefficientChecked: checkRequired,
            isText: false,
            hasComment: false,
            positionNumber: positionNumber,
            rowNumber: rowNumber,
            fullRow: (row || []).map(cell => cell || '').join('\t'),
            category: category
        });
    }
    
    const foundCount = results.filter(r => r.found && !r.isText).length;
    const notFoundCount = results.filter(r => !r.found && !r.isText && !r.isRestoration).length;
    const problemResults = results.filter(r => r.category === 'warning' || r.category === 'notallowed');
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📈 РЕЗУЛЬТАТЫ АНАЛИЗА:`);
    console.log(`   Всего позиций: ${results.length}`);
    console.log(`   Найдено в БД: ${foundCount}`);
    console.log(`   Не найдено в БД: ${notFoundCount}`);
    console.log(`   ⚠️ Требуют внимания: ${results.filter(r => r.category === 'warning').length}`);
    console.log(`   ❌ Нельзя применять: ${results.filter(r => r.category === 'notallowed').length}`);
    console.log(`   📝 Текстовые строки: ${textLines}`);
    console.log(`   Коэффициентов верно: ${coefficientMatches}`);
    console.log(`   Коэффициентов НЕверно: ${coefficientMismatches}`);
    console.log(`${'='.repeat(80)}\n`);
    
    // Сохранение в БД
    await logsDb.createSession(sessionId, {
        user: { fullname: user.fullname, institution: user.institution },
        ip: ip,
        filename: fixedName,
        estimateName: estimateName,
        isRevised: isRevised,
        totalCodes: results.length,
        foundCodes: foundCount,
        notFoundCodes: notFoundCount,
        exactMatches: matchTypeCount.exact,
        tableMatches: matchTypeCount.table,
        sectionMatches: matchTypeCount.section,
        collectionMatches: matchTypeCount.collection,
        chapterMatches: matchTypeCount.chapter,
        relationMatches: matchTypeCount.relation,
        parentMatches: matchTypeCount.parent,
        textLines: textLines,
        restorationCodes: matchTypeCount.restoration,
        hasCoefficientCount: results.filter(r => r.hasCoefficient).length,
        coefficientMatches: coefficientMatches,
        coefficientMismatches: coefficientMismatches,
        totalAmount: totalAmount,
        status: 'completed',
        project_id: projectId
    });
    
    await logsDb.addCodeDetailsBatch(sessionId, results);
    
    return {
        sessionId: sessionId,
        results: results,
        problemCodes: problemResults,
        unknownCodes: Array.from(unknownSet),
        total: results.length,
        found: foundCount,
        notFound: notFoundCount,
        matchTypeStats: matchTypeCount,
        coefficientStats: {
            total: results.filter(r => r.hasCoefficient).length,
            matches: coefficientMatches,
            mismatches: coefficientMismatches,
            requiredButMissing: coefficientRequiredButMissing
        },
        statusCounts: {
            available: statusCounts.available,
            warning: results.filter(r => r.category === 'warning').length,
            notAllowed: results.filter(r => r.category === 'notallowed').length,
            text: textLines
        },
        fileName: fixedName,
        estimateName: estimateName,
        user: {
            fullname: user.fullname,
            institution: user.institution
        },
        isRevised: isRevised,
        totalAmount: totalAmount,
        totalAmountFormatted: totalAmount ? totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null,
        totalAmountRow: foundRow,
        checkMode: 'universal',
        detectedColumns: {
            positionCol: positionCol + 1,
            codeCol: codeCol + 1,
            coeffCol: coeffCol + 1,
            amountCol: amountCol + 1,
            startRow: startRow + 1
        }
    };
}

module.exports = { performAnalysis, setGlobalMaps, fixFilename };