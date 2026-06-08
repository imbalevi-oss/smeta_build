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
const { evaluateCoefficientAnalysis } = require('../../shareds/coefficient-analyzer');
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
            console.log(`\n========== АНАЛИЗ СМЕТЫ ==========`);
            console.log(`Файл: ${displayName}`);
            console.log(`Проект ID: ${projectId}`);

            const parseResult = parseEstimate(fileBuffer, displayName);
            
            if (!parseResult.success) {
                throw new Error(`Ошибка парсинга: ${parseResult.error}`);
            }

            const parsedPositions = parseResult.items;
            console.log(`Парсинг завершён. Найдено позиций: ${parsedPositions.length}`);

            const sessionCodeCache = new Map();
            const analyzedPositions = [];
            let textCount = 0, warningCount = 0, notAllowedCount = 0, notFoundCount = 0, foundCount = 0;
            let coefficientMatches = 0, coefficientMismatches = 0;

            for (const pos of parsedPositions) {
                const positionNumber = pos.positionNumber;
                const codeRaw = pos.code;
                const totalAmount = pos.totalAmount;
                
                // НОРМАЛИЗАЦИЯ КОЭФФИЦИЕНТА СМЕТЫ
                let actualCoefficient = pos.coefficient;
                console.log(`[analyze] Позиция ${positionNumber}: оригинальный коэффициент = ${actualCoefficient}`);
                
                if (actualCoefficient !== null && actualCoefficient !== undefined && actualCoefficient !== 1) {
                    const original = actualCoefficient;
                    actualCoefficient = Math.round(actualCoefficient * 100) / 100;
                    if (original !== actualCoefficient) {
                        console.log(`[analyze] Позиция ${positionNumber}: нормализация ${original} -> ${actualCoefficient}`);
                    }
                }
                
                const quantity = pos.quantity;
                const unit = pos.unit;
                const name = pos.name;
                const volume = pos.volume;
                const formattedVolume = pos.formattedVolume;
                const price = pos.price;

                const { code: extractedCode } = extractCodeFromStrings(codeRaw);
                const isTextPosition = pos.isTextPosition || (!extractedCode && codeRaw && codeRaw.length > 0 && !/^\d/.test(codeRaw));

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
                    
                    // НОРМАЛИЗАЦИЯ ОЖИДАЕМОГО КОЭФФИЦИЕНТА ИЗ БД
                    if (expectedCoefficient !== null && expectedCoefficient !== undefined && expectedCoefficient !== 1) {
                        expectedCoefficient = Math.round(expectedCoefficient * 100) / 100;
                        console.log(`[analyze] Позиция ${positionNumber}: ожидаемый коэффициент из БД = ${expectedCoefficient}`);
                    }
                }

                const actual = actualCoefficient !== null ? parseFloat(actualCoefficient) : null;
                const expected = expectedCoefficient ? parseFloat(expectedCoefficient) : null;
                const TOLERANCE = 0.01;

                console.log(`[analyze] Позиция ${positionNumber}: actual=${actual}, expected=${expected}`);

                if (actual !== null) {
                    if (actual < 1) {
                        category = 'ok';
                        status = 'Доступен';
                        coefficientMatch = null;
                        description = `📉 Понижающий коэффициент: ${actual.toFixed(2)} (допустимо)`;
                        if (expected && expected > 1 && actual < expected) {
                            description += `, ожидался ${expected.toFixed(2)}`;
                        }
                        console.log(`[analyze] Позиция ${positionNumber}: понижающий коэффициент ${actual}`);
                    } 
                    else if (actual === 1) {
                        if (expected && expected !== 1) {
                            category = 'warning';
                            status = 'Обратите внимание';
                            coefficientMatch = false;
                            description = `⚠️ Отсутствует обязательный коэффициент. Ожидается ${expected.toFixed(2)}.`;
                            coefficientMismatches++;
                            console.log(`[analyze] Позиция ${positionNumber}: ОТСУТСТВУЕТ обязательный коэффициент ${expected}`);
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
                                description = `⚠️ Коэффициент ${actual.toFixed(2)} превышает допустимый (${expected.toFixed(2)}).`;
                                coefficientMismatches++;
                                console.log(`[analyze] Позиция ${positionNumber}: ПРЕВЫШЕНИЕ ${actual} > ${expected}`);
                            } else if (Math.abs(actual - expected) <= TOLERANCE) {
                                coefficientMatch = true;
                                description = `✅ Коэффициент ${actual.toFixed(2)} соответствует норме (${expected.toFixed(2)})`;
                                coefficientMatches++;
                                console.log(`[analyze] Позиция ${positionNumber}: СОВПАДЕНИЕ ${actual} = ${expected}`);
                            } else {
                                coefficientMatch = null;
                                description = `ℹ️ Коэффициент ${actual.toFixed(2)} ниже ожидаемого (${expected.toFixed(2)}), но допустим.`;
                                console.log(`[analyze] Позиция ${positionNumber}: НИЖЕ ${actual} < ${expected}`);
                            }
                        } else {
                            category = 'warning';
                            status = 'Обратите внимание';
                            coefficientMatch = false;
                            description = `⚠️ Коэффициент ${actual.toFixed(2)} больше 1. Требуется обоснование.`;
                            coefficientMismatches++;
                            console.log(`[analyze] Позиция ${positionNumber}: КОЭФФИЦИЕНТ >1 без нормы ${actual}`);
                        }
                    }
                } else if (expected && expected !== 1) {
                    category = 'warning';
                    status = 'Обратите внимание';
                    coefficientMatch = false;
                    description = `⚠️ Отсутствует обязательный коэффициент. Ожидается ${expected.toFixed(2)}.`;
                    coefficientMismatches++;
                    console.log(`[analyze] Позиция ${positionNumber}: КОЭФФИЦИЕНТ ОТСУТСТВУЕТ, ожидается ${expected}`);
                }

                if (isRestoration) {
                    category = 'notallowed';
                    status = 'Нельзя применять';
                    description = '🏛️ Реставрационные работы (отделы 51-59). Применение запрещено.';
                    coefficientMatch = null;
                    console.log(`[analyze] Позиция ${positionNumber}: РЕСТАВРАЦИОННЫЙ КОД`);
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

            // ВЫВОД СТАТИСТИКИ ПО КОЭФФИЦИЕНТАМ
            console.log(`\n========== СТАТИСТИКА КОЭФФИЦИЕНТОВ ==========`);
            console.log(`Всего позиций: ${analyzedPositions.length}`);
            console.log(`С коэффициентами: ${analyzedPositions.filter(p => p.hasCoefficient).length}`);
            console.log(`Коэффициенты совпадают: ${coefficientMatches}`);
            console.log(`Коэффициенты НЕ совпадают: ${coefficientMismatches}`);
            console.log(`Предупреждений: ${warningCount}`);
            console.log(`Запрещено: ${notAllowedCount}`);
            console.log(`=============================================\n`);

            // ... остальной код без изменений (создание сессии, сохранение в БД, ответ)
            
            const totalMrAmount = parsedPositions.reduce((sum, p) => sum + (p.mrTotalAmount || 0), 0);
            const totalMrRows = parsedPositions.reduce((sum, p) => sum + (p.mrDetails?.length || 0), 0);
            const positionsWithMr = parsedPositions.filter(p => (p.mrDetails?.length || 0) > 0).length;

            const user = await usersDb.getUserById(userId);
            const sessionId = Date.now() + '-' + Math.random().toString(36).substr(2, 8);
            const estimateName = parseResult.sheetName || 'Смета';
            
            await logsDb.createSession(sessionId, {
                user: { fullname: user.fullname, institution: user.institution },
                ip: req.ip,
                filename: displayName,
                estimateName,
                isRevised,
                totalCodes: analyzedPositions.length,
                foundCodes: foundCount,
                notFoundCodes: notFoundCount,
                totalAmount: parseResult.totalAmount,
                totalMrAmount,
                totalMrRows,
                positionsWithMr,
                status: 'completed',
                project_id: projectId
            });
            
            await logsDb.addCodeDetailsBatch(sessionId, analyzedPositions);

            if (projectId) {
                await logsDb.updateProjectSession(
                    projectId,
                    userId,
                    sessionId,
                    estimateName,
                    displayName
                );
            }

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
            console.error(`[analyze] ОШИБКА: ${error.message}`);
            res.status(500).json({ error: error.message });
        } finally {
            try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch(e) {}
        }
    });
});

async function enrichKs2Items(items) {
    const sessionCodeCache = new Map();
    let coefficientMatches = 0;
    let coefficientMismatches = 0;
    let warningCount = 0;
    let notAllowedCount = 0;

    const enriched = [];

    for (const item of items) {
        const extractedCode = item.code || null;
        const found = extractedCode
            ? await codesDb.findHierarchicalMatch(extractedCode, sessionCodeCache)
            : null;

        const analysis = evaluateCoefficientAnalysis({
            actualCoefficient: item.coefficient,
            expectedCoefficient: found?.coefficient_value,
            isRestoration: found?.matchType === 'restoration',
            found: !!found,
            baseStatus: found?.status,
            baseDescription: found?.description
        });

        if (analysis.coefficientMatch === true) coefficientMatches++;
        if (analysis.coefficientMatch === false) coefficientMismatches++;
        if (analysis.statusCategory === 'warning') warningCount++;
        if (analysis.statusCategory === 'notallowed') notAllowedCount++;

        enriched.push({
            ...item,
            details: Array.isArray(item.details) ? item.details : [],
            extractedCode,
            matchType: found?.matchType || 'none',
            status: analysis.status,
            statusCategory: analysis.statusCategory,
            description: analysis.description,
            coefficientMatch: analysis.coefficientMatch,
            expectedCoefficient: analysis.expectedCoefficient,
            hasDetails: Array.isArray(item.details) && item.details.length > 0
        });
    }

    return {
        items: enriched,
        coefficientMatches,
        coefficientMismatches,
        warningCount,
        notAllowedCount
    };
}

// ==================== АНАЛИЗ КС-2 ====================
router.post('/analyze-ks2', requireAuth, upload.array('ks2Files', 10), async (req, res) => {
    const ks2Files = req.files || [];
    if (!ks2Files.length) return res.status(400).json({ error: 'Не загружены файлы КС-2' });

    const projectId = req.body.projectId ? parseInt(req.body.projectId) : null;
    const userId = req.userId;

    try {
        const user = await usersDb.getUserById(userId);
        if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

  

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
                    
                    allResults.push({ fileName: displayName, error: parseResult.error, success: false });
                    continue;
                }

                
                

                const sessionId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 8);
                sessionIds.push(sessionId);

                const enriched = await enrichKs2Items(parseResult.items);
                const estimateName = `КС-2: ${displayName}`;

                await logsDb.createSession(sessionId, {
                    user: { fullname: user.fullname, institution: user.institution },
                    ip: req.ip,
                    filename: displayName,
                    estimateName,
                    isRevised: false,
                    totalCodes: parseResult.totalItems,
                    foundCodes: parseResult.totalItems,
                    notFoundCodes: 0,
                    totalAmount: parseResult.totalAmount,
                    coefficientMatches: enriched.coefficientMatches,
                    coefficientMismatches: enriched.coefficientMismatches,
                    status: 'completed',
                    project_id: projectId,
                    is_ks2: 1
                });

                const savedCount = await logsDb.saveKs2Items(sessionId, displayName, idx + 1, enriched.items);
                totalSavedCount += savedCount;
                totalItems += parseResult.totalItems;
                totalAmount += parseResult.totalAmount;

                if (projectId) {
                    await logsDb.updateProjectSession(
                        projectId,
                        userId,
                        sessionId,
                        estimateName,
                        displayName
                    );
                }

                allResults.push({
                    fileName: displayName,
                    sessionId,
                    success: true,
                    totalItems: parseResult.totalItems,
                    totalAmount: parseResult.totalAmount,
                    totalAmountFormatted: parseResult.totalAmountFormatted,
                    items: enriched.items,
                    stats: {
                        coefficientMatches: enriched.coefficientMatches,
                        coefficientMismatches: enriched.coefficientMismatches,
                        warningCount: enriched.warningCount,
                        notAllowedCount: enriched.notAllowedCount
                    },
                    detectedColumns: parseResult.detectedColumns,
                    startRow: parseResult.startRow
                });

            } catch (err) {
               
                allResults.push({ fileName: displayName, error: err.message, success: false });
            } finally {
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}
            }
        }

      

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
        
     
        
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId обязателен' });
        }
        
        const session = await logsDb.getOne(`SELECT * FROM sessions WHERE session_id = @p0`, [sessionId]);
        
        if (!session) {
       
            return res.status(404).json({ error: 'Сессия не найдена' });
        }
        
        
        
        const items = await logsDb.getKs2Items(sessionId);
        const totalAmount = session.total_amount || items.reduce((sum, i) => sum + (i.total || 0), 0);
        
        res.json({
            success: true,
            session: {
                session_id: session.session_id,
                filename: session.filename,
                estimate_name: session.estimate_name,
                created_at: session.created_at,
                total_codes: session.total_codes || items.length,
                total_amount: totalAmount,
                coefficient_matches: session.coefficient_matches || 0,
                coefficient_mismatches: session.coefficient_mismatches || 0,
                status: session.status || 'completed',
                is_ks2: session.is_ks2 || 1
            },
            items,
            totalItems: items.length,
            totalAmount
        });
        
    } catch (error) {

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
    
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;