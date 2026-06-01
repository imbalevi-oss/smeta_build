// lib/analysis-engine.js
// Движок анализа сметных файлов (с использованием единого парсера)

const { parseEstimate } = require('../../shareds/estimate-parser');
const codesDb = require('../../shareds/codes-db');
const logsDb = require('../../shareds/logs-db');
const usersDb = require('../../shareds/users-db');

// Глобальные кэши (устанавливаются из server.js)
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
 * Основная функция анализа сметы
 * @param {Buffer} fileBuffer - содержимое файла
 * @param {string} originalName - исходное имя файла
 * @param {number} userId - ID пользователя
 * @param {boolean} isRevised - исправленная смета
 * @param {number|null} projectId - ID проекта
 */
async function performAnalysis(fileBuffer, originalName, userId, isRevised, projectId = null) {
    const ip = 'local';
    const sessionId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 8);
    const user = await usersDb.getUserById(userId);
    if (!user) throw new Error('Пользователь не найден');

    const fixedName = originalName; // имена уже нормализованы в парсере
    
    const moscowTime = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${moscowTime}] 📁 АНАЛИЗ СМЕТЫ: ${fixedName}`);
    console.log(`👤 Пользователь: ${user.fullname} (${user.institution})`);
    console.log(`🔄 Исправленная смета: ${isRevised ? 'Да' : 'Нет'}`);
    console.log(`${'='.repeat(80)}`);

    // ==================== ШАГ 1: ПАРСИНГ ФАЙЛА (единый парсер) ====================
    console.log('\n🔍 ЗАПУСК ЕДИНОГО ПАРСЕРА (parseEstimate)...');
    const parseResult = parseEstimate(fileBuffer, fixedName);
    
    if (!parseResult.success) {
        console.error('❌ Ошибка парсинга сметы:', parseResult.error);
        throw new Error(`Ошибка парсинга: ${parseResult.error}`);
    }

    const positions = parseResult.items;
    const totalAmount = parseResult.totalAmount;
    const detectedColumns = parseResult.detectedColumns;

    console.log(`\n✅ ПАРСИНГ ЗАВЕРШЁН:`);
    console.log(`   Всего позиций: ${positions.length}`);
    console.log(`   Общая сумма по смете: ${totalAmount.toLocaleString('ru-RU')} ₽`);
    console.log(`   Определённые колонки: позиция=${detectedColumns.position}, код=${detectedColumns.code}, коэфф=${detectedColumns.coefficient}, сумма=${detectedColumns.amount}`);

    // ==================== ШАГ 2: АНАЛИЗ КАЖДОЙ ПОЗИЦИИ ====================
    const results = [];
    const sessionCodeCache = new Map();
    const COEFF_TOLERANCE = 0.01;
    
    let matchTypeCount = {
        exact: 0, table: 0, section: 0, collection: 0, chapter: 0,
        relation: 0, parent: 0, text: 0, restoration: 0, none: 0
    };
    let coefficientMatches = 0;
    let coefficientMismatches = 0;
    let textLines = 0;
    let foundCount = 0;
    let notFoundCount = 0;
    let statusCounts = { available: 0, warning: 0, notAllowed: 0, text: 0 };

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🔍 НАЧАЛО АНАЛИЗА КОДОВ (${positions.length} позиций)`);
    console.log(`${'─'.repeat(80)}`);

    for (let idx = 0; idx < positions.length; idx++) {
        const pos = positions[idx];
        const positionNumber = pos.positionNumber;
        const rowNumber = pos.rowNumber;
        const codeRaw = pos.code || '';
        const total = pos.totalAmount; // уже рассчитано парсером (строка + детали)
        const actualCoefficient = pos.coefficient;
        
        // Извлечение чистого кода (игнорируем текст после)
        const { code: extractedCode } = codesDb.extractCodeFromString?.(codeRaw) || { code: null };
        const isTextPosition = pos.isTextPosition || (!extractedCode && codeRaw.length > 0 && !/^\d/.test(codeRaw));

        console.log(`\n${'─'.repeat(40)}`);
        console.log(`📍 ПОЗИЦИЯ ${idx+1} (№${positionNumber}, строка ${rowNumber})`);
        console.log(`   Код: ${codeRaw.substring(0, 60)}${codeRaw.length>60?'…':''}`);
        console.log(`   Извлечённый код: ${extractedCode || '—'}`);
        console.log(`   Сумма позиции (по колонке суммы): ${total.toLocaleString('ru-RU')} ₽`);
        console.log(`   Фактический коэффициент: ${actualCoefficient !== null ? actualCoefficient : '—'}`);

        if (isTextPosition) {
            textLines++;
            matchTypeCount.text++;
            statusCounts.text++;
            results.push({
                code: codeRaw,
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
                actualCoefficient: actualCoefficient,
                coefficientMatch: null,
                coefficientRequired: false,
                coefficientChecked: false,
                isText: true,
                hasComment: false,
                positionNumber: positionNumber,
                rowNumber: rowNumber,
                fullRow: '',
                category: 'text',
                totalAmount: total,
                quantity: pos.quantity,
                unit: pos.unit
            });
            console.log(`   📝 Определена как ТЕКСТОВАЯ позиция`);
            continue;
        }

        if (!extractedCode) {
            notFoundCount++;
            matchTypeCount.none++;
            statusCounts.notFound++;
            results.push({
                code: codeRaw,
                extractedCode: null,
                status: 'НЕ НАЙДЕН',
                description: 'Не удалось извлечь код из строки',
                found: false,
                matchType: 'none',
                matchedLevel: 'none',
                isRestoration: false,
                hasCoefficient: false,
                coefficientType: 'none',
                expectedCoefficient: null,
                actualCoefficient: actualCoefficient,
                coefficientMatch: null,
                coefficientRequired: false,
                coefficientChecked: false,
                isText: false,
                hasComment: false,
                positionNumber: positionNumber,
                rowNumber: rowNumber,
                fullRow: '',
                category: 'warning',
                totalAmount: total,
                quantity: pos.quantity,
                unit: pos.unit
            });
            console.log(`   ❌ Не удалось извлечь код`);
            continue;
        }

        // Поиск в БД
        const found = await codesDb.findHierarchicalMatch(extractedCode, sessionCodeCache);
        
        let status = 'Доступен';
        let description = '';
        let matchType = 'none';
        let matchedLevel = 'none';
        let hasCoefficient = false;
        let coefficientType = 'none';
        let expectedCoefficient = null;
        let coefficientMatch = null;
        let isRestoration = false;
        let category = 'ok';
        
        const isRestorationCode = (found && found.matchType === 'restoration') || 
                                  (extractedCode && /^5[1-9]\./.test(extractedCode));
        const isForbidden = (found && found.status === 'Нельзя применять');
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
            foundCount++;
        } else {
            matchTypeCount.none++;
            notFoundCount++;
            status = 'НЕ НАЙДЕН';
            description = 'Код отсутствует в базе данных';
            category = 'warning';
        }

        // Логика проверки коэффициента
        if (isRestorationCode) {
            category = 'notallowed';
            status = 'Нельзя применять';
            description = '🏛️ Реставрационные работы (отделы 51-59). Применение запрещено.';
            statusCounts.notAllowed++;
        } else if (isForbidden) {
            category = 'notallowed';
            status = 'Нельзя применять';
            statusCounts.notAllowed++;
        } else if (actualCoefficient !== null && actualCoefficient !== 1) {
            // Есть фактический коэффициент
            if (hasDbCoefficient && expectedCoefficient !== null) {
                if (Math.abs(actualCoefficient - expectedCoefficient) <= COEFF_TOLERANCE) {
                    coefficientMatch = true;
                    coefficientMatches++;
                    description = `✅ Коэффициент ${actualCoefficient} соответствует ожидаемому (${expectedCoefficient})`;
                    category = 'ok';
                    status = 'Доступен';
                } else {
                    coefficientMatch = false;
                    coefficientMismatches++;
                    description = `⚠️ Коэффициент ${actualCoefficient} не соответствует норме (${expectedCoefficient}). Требуется обоснование.`;
                    category = 'warning';
                    status = 'Обратите внимание';
                    statusCounts.warning++;
                }
            } else {
                coefficientMatch = false;
                coefficientMismatches++;
                description = `⚠️ Коэффициент ${actualCoefficient} больше 1. Требуется обоснование.`;
                category = 'warning';
                status = 'Обратите внимание';
                statusCounts.warning++;
            }
        } else if (checkRequired && hasDbCoefficient && actualCoefficient === null) {
            // Требуется коэффициент, но его нет
            coefficientMatch = false;
            coefficientMismatches++;
            description = `⚠️ Отсутствует обязательный коэффициент. Ожидается ${expectedCoefficient}.`;
            category = 'warning';
            status = 'Обратите внимание';
            statusCounts.warning++;
        } else {
            // Всё хорошо
            category = 'ok';
            status = found ? (status || 'Доступен') : 'НЕ НАЙДЕН';
            if (found && category === 'ok') statusCounts.available++;
        }

        console.log(`   🔍 Результат поиска: ${found ? `найден (${matchType})` : 'НЕ НАЙДЕН'}`);
        if (actualCoefficient !== null && actualCoefficient !== 1) {
            console.log(`   📊 Коэффициент: фактический=${actualCoefficient}, ожидаемый=${expectedCoefficient || '—'}, совпадение=${coefficientMatch ? '✅' : '❌'}`);
        }
        console.log(`   📋 Статус: ${status} (${category})`);
        console.log(`   💰 Сумма позиции (из парсера): ${total.toLocaleString('ru-RU')} ₽`);

        results.push({
            code: codeRaw,
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
            fullRow: '',
            category: category,
            totalAmount: total,
            quantity: pos.quantity,
            unit: pos.unit
        });
    }

    // ==================== ШАГ 3: СОХРАНЕНИЕ В БД ====================
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📈 РЕЗУЛЬТАТЫ АНАЛИЗА КОДОВ:`);
    console.log(`   Всего позиций: ${results.length}`);
    console.log(`   Найдено в БД: ${foundCount}`);
    console.log(`   Не найдено в БД: ${notFoundCount}`);
    console.log(`   ⚠️ Требуют внимания: ${statusCounts.warning}`);
    console.log(`   ❌ Нельзя применять: ${statusCounts.notAllowed}`);
    console.log(`   📝 Текстовые строки: ${textLines}`);
    console.log(`   Коэффициентов верно: ${coefficientMatches}`);
    console.log(`   Коэффициентов НЕверно: ${coefficientMismatches}`);
    console.log(`${'='.repeat(80)}\n`);

    await logsDb.createSession(sessionId, {
        user: { fullname: user.fullname, institution: user.institution },
        ip: ip,
        filename: fixedName,
        estimateName: parseResult.sheetName || 'Смета',
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

    return {
        sessionId: sessionId,
        results: results,
        problemCodes: results.filter(r => r.category !== 'ok'),
        unknownCodes: [],
        total: results.length,
        found: foundCount,
        notFound: notFoundCount,
        matchTypeStats: matchTypeCount,
        coefficientStats: {
            total: results.filter(r => r.hasCoefficient).length,
            matches: coefficientMatches,
            mismatches: coefficientMismatches,
            requiredButMissing: 0
        },
        statusCounts: {
            available: statusCounts.available,
            warning: statusCounts.warning,
            notAllowed: statusCounts.notAllowed,
            text: textLines
        },
        fileName: fixedName,
        estimateName: parseResult.sheetName || 'Смета',
        user: {
            fullname: user.fullname,
            institution: user.institution
        },
        isRevised: isRevised,
        totalAmount: totalAmount,
        totalAmountFormatted: totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        totalAmountRow: null,
        checkMode: 'unified_parser',
        detectedColumns: {
            positionCol: parseResult.detectedColumns.position,
            codeCol: parseResult.detectedColumns.code,
            coeffCol: parseResult.detectedColumns.coefficient,
            amountCol: parseResult.detectedColumns.amount,
            startRow: 1
        },
        positions: results  // для совместимости с клиентом
    };
}

module.exports = { performAnalysis, setGlobalMaps };