// routes/analyze.js
// Полностью переписанные маршруты для анализа смет и КС-2

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseKS2 } = require('../../shareds/ks2-parser');
const logsDb = require('../../shareds/logs-db');
const usersDb = require('../../shareds/users-db');
const codesDb = require('../../shareds/codes-db');
const { parseEstimate, extractCodeFromStrings } = require('../../shareds/estimate-parser');
const router = express.Router();
const iconv = require('iconv-lite');

// ==================== ЕДИНАЯ ФУНКЦИЯ ДЛЯ СОХРАНЕНИЯ ОРИГИНАЛЬНЫХ ИМЁН ====================
function saveWithOriginalName(file) {
    let originalName = file.originalname;
    
    // Если есть кракозябры - пробуем декодировать
    if (/[Ðà-ÿ]/i.test(originalName) && !/[а-яА-ЯёЁ]/.test(originalName)) {
        try {
            const buffer = Buffer.from(originalName, 'latin1');
            const decoded = buffer.toString('utf8');
            if (/[а-яА-ЯёЁ]/.test(decoded)) {
                originalName = decoded;
            }
        } catch(e) {}
    }
    
    // Замена опасных символов
    originalName = originalName.replace(/[<>:"|?*\\/]/g, '_');
    
    const timestamp = Date.now();
    const ext = path.extname(originalName);
    const nameWithoutExt = path.basename(originalName, ext);
    return `${timestamp}-${nameWithoutExt}${ext}`;
}

function getOriginalDisplayName(filename) {
    if (!filename) return '';
    // Убираем timestamp из имени файла для отображения
    let name = path.basename(filename);
    // Удаляем префикс вида 1234567890-
    name = name.replace(/^\d+-/, '');
    return name;
}

// ==================== МИДЛВАРЫ ====================
function getUserId(req) {
    const userId = req.headers['x-user-id'];
    if (userId && !isNaN(parseInt(userId))) return parseInt(userId);
    return null;
}

function requireAuth(req, res, next) {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизован' });
    req.userId = userId;
    next();
}

// ==================== НАСТРОЙКА ЗАГРУЗКИ ФАЙЛОВ ====================
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, saveWithOriginalName(file))
});

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.xls', '.xlsx', '.xlsm'].includes(ext)) cb(null, true);
        else cb(new Error('Разрешены только Excel файлы (.xls, .xlsx)'));
    }
});

// ==================== АНАЛИЗ СМЕТЫ ====================
router.post('/detailed-analyze-unified', requireAuth, (req, res) => {
    upload.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'Нет файла' });

        const fileBuffer = fs.readFileSync(req.file.path);
        const displayName = getOriginalDisplayName(req.file.filename);
        const projectId = req.body.projectId ? parseInt(req.body.projectId) : null;
        const isRevised = req.body.isRevised === 'true';
        const userId = req.userId;

        try {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`📊 АНАЛИЗ СМЕТЫ: ${displayName}`);
            console.log(`👤 Пользователь ID: ${userId}, Проект ID: ${projectId || 'новый'}`);
            console.log(`🔄 Исправленная: ${isRevised}`);
            console.log(`${'='.repeat(80)}`);

            const parseResult = parseEstimate(fileBuffer, displayName);
            
            if (!parseResult.success) {
                throw new Error(`Ошибка парсинга: ${parseResult.error}`);
            }

            const parsedPositions = parseResult.items;
            console.log(`✅ Распознано позиций: ${parsedPositions.length}`);
            console.log(`💰 Общая сумма по смете: ${parseResult.totalAmountFormatted} ₽`);

            const sessionCodeCache = new Map();
            const analyzedPositions = [];
            let textCount = 0, warningCount = 0, notAllowedCount = 0, notFoundCount = 0, foundCount = 0;
            let coefficientMatches = 0, coefficientMismatches = 0;

            for (const pos of parsedPositions) {
                const positionNumber = pos.positionNumber;
                const codeRaw = pos.code;
                const totalAmount = pos.totalAmount;
                const actualCoefficient = pos.coefficient;
                const quantity = pos.quantity;
                const unit = pos.unit;
                const name = pos.name;
                const volume = pos.volume;
                const formattedVolume = pos.formattedVolume;
                const price = pos.price;

                const { code: extractedCode } = extractCodeFromStrings(codeRaw);
                const isTextPosition = pos.isTextPosition || (!extractedCode && codeRaw && codeRaw.length > 0 && !/^\d/.test(codeRaw));

                console.log(`\n🔍 Позиция ${positionNumber} (строка ${pos.rowNumber})`);
                console.log(`   Исходный код: ${codeRaw?.substring(0, 60)}`);
                console.log(`   Извлечённый код: ${extractedCode || '—'}`);
                console.log(`   Сумма: ${totalAmount?.toLocaleString('ru-RU') || 0} ₽`);
                console.log(`   Коэффициент: ${actualCoefficient !== null ? actualCoefficient : '—'}`);
                console.log(`   Объём: ${formattedVolume || 'не задан'}`);

                if (isTextPosition) {
                    textCount++;
                    analyzedPositions.push({
                        positionNumber: positionNumber,
                        code: codeRaw,
                        extractedCode: extractedCode,
                        name: name,
                        original_name: name, 
                        status: 'Обратите внимание',
                        statusCategory: 'text',
                        matchType: 'text',
                        description: '📝 Текстовая строка - цена поставщика',
                        totalAmount: totalAmount,
                        quantity: quantity,
                        unit: unit,
                        price: price,
                        actualCoefficient: actualCoefficient,
                        expectedCoefficient: null,
                        coefficientMatch: null,
                        isText: true,
                        isRestoration: false,
                        hasDetails: (pos.details && pos.details.length > 0) || false,
                        details: pos.details || [],
                        mrDetails: pos.mrDetails || [],
                        mrTotalAmount: pos.mrTotalAmount || 0,
                        volume: volume,
                        formattedVolume: formattedVolume,
                        hasComment: false,
                        isDuplicate: false,
                        duplicateCount: 0,
                        hasCoefficient: (actualCoefficient !== null && actualCoefficient !== 1),
                        coefficientType: 'none',
                        rowNumber: pos.rowNumber,
                        fileName: displayName,
                        positionName: name
                    });
                    continue;
                }

                if (!extractedCode) {
                    notFoundCount++;
                    analyzedPositions.push({
                        positionNumber: positionNumber,
                        code: codeRaw,
                        extractedCode: null,
                        name: name,
                        status: 'НЕ НАЙДЕН',
                        statusCategory: 'notfound',
                        matchType: 'none',
                        description: 'Не удалось извлечь код из строки',
                        totalAmount: totalAmount,
                        quantity: quantity,
                        unit: unit,
                        price: price,
                        actualCoefficient: actualCoefficient,
                        expectedCoefficient: null,
                        coefficientMatch: null,
                        isText: false,
                        isRestoration: false,
                        hasDetails: false,
                        details: [],
                        volume: volume,
                        formattedVolume: formattedVolume,
                        hasComment: false,
                        isDuplicate: false,
                        duplicateCount: 0,
                        hasCoefficient: false,
                        coefficientType: 'none',
                        rowNumber: pos.rowNumber,
                        fileName: displayName,
                        positionName: name
                    });
                    continue;
                }

                const found = await codesDb.findHierarchicalMatch(extractedCode, sessionCodeCache);
                let status = 'Доступен';
                let description = '';
                let matchType = 'none';
                let expectedCoefficient = null;
                let coefficientMatch = null;
                let category = 'ok';
                let isRestoration = false;

                if (found) {
                    foundCount++;
                    status = found.status || 'Доступен';
                    description = found.description || '';
                    matchType = found.matchType;
                    isRestoration = (found.matchType === 'restoration');
                    expectedCoefficient = found.coefficient_value;
                }

                const actual = actualCoefficient !== null ? parseFloat(actualCoefficient) : null;
                const expected = expectedCoefficient ? parseFloat(expectedCoefficient) : null;
                const TOLERANCE = 0.01;

                if (actual !== null) {
                    if (actual < 1) {
                        category = 'ok';
                        status = 'Доступен';
                        coefficientMatch = null;
                        description = `📉 Понижающий коэффициент: ${actual.toFixed(3)} (допустимо)`;
                        if (expected && expected > 1 && actual < expected) {
                            description += `, ожидался ${expected.toFixed(3)}`;
                        }
                    } 
                    else if (actual === 1) {
                        if (expected && expected !== 1) {
                            category = 'warning';
                            status = 'Обратите внимание';
                            coefficientMatch = false;
                            description = `⚠️ Отсутствует обязательный коэффициент. Ожидается ${expected.toFixed(3)}.`;
                            coefficientMismatches++;
                        } else {
                            description = `✅ Коэффициент 1 (норма)`;
                        }
                    } 
                    else {
                        if (expected && expected !== 1) {
                            if (actual > expected + TOLERANCE) {
                                category = 'warning';
                                status = 'Обратите внимание';
                                coefficientMatch = false;
                                description = `⚠️ Коэффициент ${actual.toFixed(3)} превышает допустимый (${expected.toFixed(3)}).`;
                                coefficientMismatches++;
                            } else if (Math.abs(actual - expected) <= TOLERANCE) {
                                coefficientMatch = true;
                                description = `✅ Коэффициент ${actual.toFixed(3)} соответствует норме (${expected.toFixed(3)})`;
                                coefficientMatches++;
                            } else {
                                coefficientMatch = null;
                                description = `ℹ️ Коэффициент ${actual.toFixed(3)} ниже ожидаемого (${expected.toFixed(3)}), но допустим.`;
                            }
                        } else {
                            category = 'warning';
                            status = 'Обратите внимание';
                            coefficientMatch = false;
                            description = `⚠️ Коэффициент ${actual.toFixed(3)} больше 1. Требуется обоснование.`;
                            coefficientMismatches++;
                        }
                    }
                } else if (expected && expected !== 1) {
                    category = 'warning';
                    status = 'Обратите внимание';
                    coefficientMatch = false;
                    description = `⚠️ Отсутствует обязательный коэффициент. Ожидается ${expected.toFixed(3)}.`;
                    coefficientMismatches++;
                }

                if (isRestoration) {
                    category = 'notallowed';
                    status = 'Нельзя применять';
                    description = '🏛️ Реставрационные работы (отделы 51-59). Применение запрещено.';
                    coefficientMatch = null;
                }

                if (category === 'warning') warningCount++;
                if (category === 'notallowed') notAllowedCount++;
                if (!found && category !== 'text') notFoundCount++;

                analyzedPositions.push({
                    positionNumber: positionNumber,
                    code: codeRaw,
                    extractedCode: extractedCode,
                    name: name,
                    status: status,
                    statusCategory: category,
                    matchType: matchType,
                    description: description,
                    totalAmount: totalAmount,
                    quantity: quantity,
                    unit: unit,
                    price: price,
                    actualCoefficient: actualCoefficient,
                    expectedCoefficient: expectedCoefficient,
                    coefficientMatch: coefficientMatch,
                    isText: false,
                    isRestoration: isRestoration,
                    hasDetails: (pos.details && pos.details.length > 0) || false,
                    details: pos.details || [],
                    mrDetails: pos.mrDetails || [],
                    mrTotalAmount: pos.mrTotalAmount || 0,
                    volume: volume,
                    formattedVolume: formattedVolume,
                    hasComment: false,
                    isDuplicate: false,
                    duplicateCount: 0,
                    hasCoefficient: (actualCoefficient !== null && actualCoefficient !== 1),
                    coefficientType: 'none',
                    rowNumber: pos.rowNumber,
                    fileName: displayName,
                    positionName: name
                });
            }

            const user = await usersDb.getUserById(userId);
            const sessionId = Date.now() + '-' + Math.random().toString(36).substr(2, 8);
            
            await logsDb.createSession(sessionId, {
                user: { fullname: user.fullname, institution: user.institution },
                ip: req.ip,
                filename: displayName,
                estimateName: parseResult.sheetName || 'Смета',
                isRevised,
                totalCodes: analyzedPositions.length,
                foundCodes: foundCount,
                notFoundCodes: notFoundCount,
                totalAmount: parseResult.totalAmount,
                status: 'completed',
                project_id: projectId
            });

            console.log(`\n💾 СОХРАНЯЕМ ДЕТАЛИ КОДОВ: ${analyzedPositions.length} позиций`);
            
            await logsDb.addCodeDetailsBatch(sessionId, analyzedPositions);
            console.log(`✅ ДЕТАЛИ СОХРАНЕНЫ`);

            const totalMrAmount = parsedPositions.reduce((sum, p) => sum + (p.mrTotalAmount || 0), 0);
            const totalMrRows = parsedPositions.reduce((sum, p) => sum + (p.mrDetails?.length || 0), 0);
            const positionsWithMr = parsedPositions.filter(p => (p.mrDetails?.length || 0) > 0).length;

            console.log(`\n📊 ИТОГИ АНАЛИЗА СМЕТЫ:`);
            console.log(`   Всего позиций: ${analyzedPositions.length}`);
            console.log(`   ✅ Найдено в БД: ${foundCount}`);
            console.log(`   ❌ Не найдено: ${notFoundCount}`);
            console.log(`   ⚠️ Требуют внимания: ${warningCount}`);
            console.log(`   🚫 Нельзя применять: ${notAllowedCount}`);
            console.log(`   📝 Текстовых: ${textCount}`);
            console.log(`   📈 Коэффициентов верно: ${coefficientMatches}`);
            console.log(`   📉 Коэффициентов неверно: ${coefficientMismatches}`);
            console.log(`   💰 ОБЩАЯ СУММА: ${parseResult.totalAmount.toLocaleString('ru-RU')} ₽`);

            res.json({
                success: true,
                sessionId,
                estimateName: parseResult.sheetName,
                totalAmount: parseResult.totalAmount,
                totalMrAmount,
                totalAmountFormatted: parseResult.totalAmountFormatted,
                stats: {
                    totalPositions: analyzedPositions.length,
                    foundCount, notFoundCount, warningCount, notAllowedCount, textCount,
                    coefficientMatches, coefficientMismatches,
                    totalMrAmount, totalMrRows, positionsWithMr
                },
                positions: analyzedPositions,
                detectedColumns: parseResult.detectedColumns
            });

        } catch (error) {
            console.error('❌ Ошибка анализа сметы:', error);
            res.status(500).json({ error: error.message });
        } finally {
            try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch(e) {}
        }
    });
});

// ==================== АНАЛИЗ КС-2 ====================
router.post('/analyze-ks2', requireAuth, upload.array('ks2Files', 10), async (req, res) => {
    const ks2Files = req.files || [];
    if (!ks2Files.length) return res.status(400).json({ error: 'Не загружены файлы КС-2' });

    const projectId = req.body.projectId ? parseInt(req.body.projectId) : null;
    const userId = req.userId;

    try {
        const user = await usersDb.getUserById(userId);
        if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

        console.log(`\n${'='.repeat(80)}`);
        console.log(`📁 АНАЛИЗ КС-2 (parseKS2)`);
        console.log(`👤 Пользователь: ${user.fullname} (${user.institution})`);
        console.log(`📁 Проект ID: ${projectId || 'без проекта'}`);
        console.log(`📄 Файлов: ${ks2Files.length}`);
        console.log(`${'='.repeat(80)}`);

        const allResults = [];
        let totalItems = 0;
        let totalAmount = 0;
        let totalSavedCount = 0;
        const sessionIds = [];

        for (let idx = 0; idx < ks2Files.length; idx++) {
            const file = ks2Files[idx];
            const filePath = file.path;
            const displayName = getOriginalDisplayName(file.filename);

            try {
                const fileBuffer = fs.readFileSync(filePath);
                const parseResult = parseKS2(fileBuffer, displayName);

                if (!parseResult.success) {
                    console.error(`   ❌ Ошибка парсинга: ${parseResult.error}`);
                    allResults.push({ fileName: displayName, error: parseResult.error, success: false });
                    continue;
                }

                console.log(`   ✅ Распознано позиций: ${parseResult.totalItems}`);
                console.log(`   💰 Сумма: ${parseResult.totalAmountFormatted} ₽`);

                const sessionId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 8);
                sessionIds.push(sessionId);

                await logsDb.createSession(sessionId, {
                    user: { fullname: user.fullname, institution: user.institution },
                    ip: req.ip,
                    filename: displayName,
                    estimateName: `КС-2: ${displayName}`,
                    isRevised: false,
                    totalCodes: parseResult.totalItems,
                    foundCodes: parseResult.totalItems,
                    notFoundCodes: 0,
                    totalAmount: parseResult.totalAmount,
                    status: 'completed',
                    project_id: projectId,
                    is_ks2: 1
                });

                const savedCount = await logsDb.saveKs2Items(sessionId, displayName, idx + 1, parseResult.items);
                totalSavedCount += savedCount;
                totalItems += parseResult.totalItems;
                totalAmount += parseResult.totalAmount;

                allResults.push({
                    fileName: displayName,
                    sessionId,
                    success: true,
                    totalItems: parseResult.totalItems,
                    totalAmount: parseResult.totalAmount,
                    totalAmountFormatted: parseResult.totalAmountFormatted,
                    items: parseResult.items,
                    detectedColumns: parseResult.detectedColumns,
                    startRow: parseResult.startRow
                });

            } catch (err) {
                console.error(`   ❌ Ошибка обработки файла ${displayName}:`, err.message);
                allResults.push({ fileName: displayName, error: err.message, success: false });
            } finally {
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}
            }
        }

        console.log(`\n${'='.repeat(80)}`);
        console.log(`📊 ИТОГИ АНАЛИЗА КС-2:`);
        console.log(`   Обработано файлов: ${ks2Files.length}`);
        console.log(`   Успешно: ${allResults.filter(r => r.success).length}`);
        console.log(`   С ошибками: ${allResults.filter(r => !r.success).length}`);
        console.log(`   Сохранено позиций: ${totalSavedCount}`);
        console.log(`   Общая сумма: ${totalAmount.toLocaleString('ru-RU')} ₽`);
        console.log(`${'='.repeat(80)}\n`);

        res.json({
            success: true,
            filesCount: ks2Files.length,
            totalItems,
            totalAmount,
            totalAmountFormatted: totalAmount.toLocaleString('ru-RU'),
            results: allResults,
            savedCount: totalSavedCount,
            sessionIds
        });

    } catch (error) {
        console.error('❌ Ошибка анализа КС-2:', error);
        res.status(500).json({ error: error.message, success: false });
    } finally {
        for (const file of ks2Files) {
            try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch(e) {}
        }
    }
});

// ==================== ПОЛУЧЕНИЕ КС-2 СЕССИИ ====================
router.get('/ks2-sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        console.log(`🔍 GET /ks2-sessions/${sessionId}`);
        
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId обязателен' });
        }
        
        const session = await logsDb.getOne(`SELECT * FROM sessions WHERE session_id = @p0`, [sessionId]);
        
        if (!session) {
            console.log(`❌ Сессия ${sessionId} не найдена`);
            return res.status(404).json({ error: 'Сессия не найдена' });
        }
        
        console.log(`✅ Сессия найдена: is_ks2=${session.is_ks2}, filename=${session.filename}`);
        
        let items = [];
        try {
            if (typeof logsDb.getKs2Items === 'function') {
                items = await logsDb.getKs2Items(sessionId);
                console.log(`✅ Найдено ${items.length} позиций КС-2`);
            } else {
                items = await logsDb.query(`
                    SELECT * FROM ks2_items 
                    WHERE session_id = @p0 
                    ORDER BY position
                `, [sessionId]);
                console.log(`✅ Прямым запросом найдено ${items.length} позиций`);
            }
        } catch (itemsErr) {
            console.error(`❌ Ошибка получения позиций:`, itemsErr.message);
            items = [];
        }
        
        const totalAmount = session.total_amount || 0;
        
        res.json({
            success: true,
            session: {
                session_id: session.session_id,
                filename: session.filename,
                estimate_name: session.estimate_name,
                created_at: session.created_at,
                total_codes: session.total_codes || items.length,
                total_amount: totalAmount,
                status: session.status || 'completed',
                is_ks2: session.is_ks2 || 1
            },
            items: items,
            totalItems: items.length,
            totalAmount: totalAmount
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения КС-2 сессии:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== ЭКСПОРТ КС-2 В EXCEL ====================
router.post('/export-ks2-excel', requireAuth, async (req, res) => {
    try {
        const { items, fileName } = req.body;
        if (!items || items.length === 0) return res.status(400).json({ error: 'Нет данных для экспорта' });

        const XLSX = require('xlsx');
        const excelData = items.map((item, idx) => ({
            '№ п/п': idx + 1,
            'Позиция в КС-2': item.ks2_position_number || item.position || '',
            'Поз. по смете': item.estimate_position_number || '',
            'Шифр': item.code || '',
            'Наименование работ': item.name || '',
            'Единица измерения': item.unit || '',
            'Количество': item.quantity || 0,
            'Объём': item.volume || '',
            'Сумма, ₽': (item.total || 0).toFixed(2)
        }));
        const totalAmount = items.reduce((sum, i) => sum + (i.total || 0), 0);
        excelData.push({
            '№ п/п': '',
            'Позиция в КС-2': '',
            'Поз. по смете': '',
            'Шифр': '',
            'Наименование работ': 'ИТОГО:',
            'Единица измерения': '',
            'Количество': '',
            'Объём': '',
            'Сумма, ₽': totalAmount.toFixed(2)
        });
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        worksheet['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 50 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'КС-2');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName || 'ks2_export'}.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('Ошибка экспорта КС-2 в Excel:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;