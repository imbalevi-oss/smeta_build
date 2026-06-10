// routes/analyze.js
// Полностью переписанный маршрут для анализа смет и КС-2
// С единой логикой проверки коэффициентов и пропуском некорректных строк

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseKS2 } = require('../../shareds/ks2-parser');
const logsDb = require('../../shareds/logs-db');
const usersDb = require('../../shareds/users-db');
const codesDb = require('../../shareds/codes-db');
const { parseEstimate, extractCodeFromStrings } = require('../../shareds/estimate-parser');
const { evaluateCoefficientAnalysis, encodeCoefficientMatch } = require('../../shareds/coefficient-analyzer');
const router = express.Router();

// ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С ИМЕНАМИ ФАЙЛОВ ====================
function saveWithOriginalName(file) {
    let originalName = file.originalname;
    if (/[Ðà-ÿ]/i.test(originalName) && !/[а-яА-ЯёЁ]/.test(originalName)) {
        try {
            const buffer = Buffer.from(originalName, 'latin1');
            const decoded = buffer.toString('utf8');
            if (/[а-яА-ЯёЁ]/.test(decoded)) originalName = decoded;
        } catch(e) {}
    }
    originalName = originalName.replace(/[<>:"|?*\\/]/g, '_');
    const timestamp = Date.now();
    const ext = path.extname(originalName);
    const nameWithoutExt = path.basename(originalName, ext);
    return `${timestamp}-${nameWithoutExt}${ext}`;
}

function getOriginalDisplayName(filename) {
    if (!filename) return '';
    let name = path.basename(filename);
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

// ==================== НАСТРОЙКА ЗАГРУЗКИ ====================
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, saveWithOriginalName(file))
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ==================== ПРОВЕРКА НЕКОРРЕКТНЫХ СТРОК ====================

/**
 * Проверяет, является ли строка НЕКОРРЕКТНОЙ для анализа
 * Возвращает объект с результатом и причиной
 */
function checkInvalidCodeString(str) {
    if (!str || typeof str !== 'string') {
        return { isInvalid: true, reason: 'Пустое значение' };
    }
    
    const trimmed = str.trim();
    
    // Пустые строки
    if (trimmed === '') {
        return { isInvalid: true, reason: 'Пустая строка шифра' };
    }
    
    // Служебный код
    if (trimmed === '9999990001') {
        return { isInvalid: true, reason: 'Служебный код 9999990001 (пропускаем)' };
    }
    
    // Длинный текст (>50 символов)
    if (trimmed.length > 50) {
        return { isInvalid: true, reason: `Слишком длинная строка (>50 символов): "${trimmed.substring(0, 50)}..." - техническое описание` };
    }
    
    // Одиночные цифры: "1", "2", "3"
    if (/^\d$/.test(trimmed)) {
        return { isInvalid: true, reason: `Одиночная цифра "${trimmed}" - не может быть шифром расценки` };
    }
    
    // Двузначные числа без спецсимволов
    if (/^\d{2}$/.test(trimmed)) {
        return { isInvalid: true, reason: `Двузначное число "${trimmed}" - не может быть шифром расценки` };
    }
    
    // Трёхзначные числа без спецсимволов
    if (/^\d{3}$/.test(trimmed)) {
        return { isInvalid: true, reason: `Трёхзначное число "${trimmed}" - ошибочные данные, пропускаем` };
    }
    
    // Строки, состоящие только из цифр и запятых (без точек/дефисов)
    if (/^[\d,]+$/.test(trimmed) && trimmed.length < 10 && !trimmed.includes(',')) {
        return { isInvalid: true, reason: `Число без разделителей "${trimmed}" - не похоже на шифр расценки` };
    }
    
    // Примечания и сноски
    const lowerTrimmed = trimmed.toLowerCase();
    if (lowerTrimmed.includes('примечание') || lowerTrimmed.includes('сноска') || 
        lowerTrimmed.includes('в том числе') || lowerTrimmed.includes('в т.ч.')) {
        return { isInvalid: true, reason: `Служебная строка: "${trimmed}" - примечание/сноска` };
    }
    
    // ВСЁ ОСТАЛЬНОЕ анализируем
    return { isInvalid: false, reason: null };
}

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
     
            const parseResult = parseEstimate(fileBuffer, displayName);
            if (!parseResult.success) throw new Error(`Ошибка парсинга: ${parseResult.error}`);

            const parsedPositions = parseResult.items;
           

            const sessionCodeCache = new Map();
            const analyzedPositions = [];
            
            // Статистика
            let textCount = 0, warningCount = 0, notAllowedCount = 0, notFoundCount = 0, foundCount = 0;
            let coefficientMatches = 0, coefficientMismatches = 0;
            let skippedCount = 0;
            
            // Детальное логирование пропусков
            const skippedReasons = [];
            const skippedReasonGroups = {};

            for (const pos of parsedPositions) {
                const positionNumber = pos.positionNumber;
                const codeRaw = pos.code;
                
                // ========== ПРОВЕРКА НА НЕКОРРЕКТНОСТЬ ==========
                const invalidCheck = checkInvalidCodeString(codeRaw);
                
                if (invalidCheck.isInvalid) {
                    skippedCount++;
                    
                    // Группировка по причинам
                    skippedReasonGroups[invalidCheck.reason] = (skippedReasonGroups[invalidCheck.reason] || 0) + 1;
                    
                    // Сохраняем детали пропуска
                    skippedReasons.push({
                        positionNumber: positionNumber,
                        code: codeRaw,
                        reason: invalidCheck.reason,
                        name: pos.name || '—',
                        totalAmount: pos.totalAmount || 0,
                        rowNumber: pos.rowNumber
                    });
                    
                    // Логируем в консоль с деталями
          
                    
                    continue;
                }
                
                const totalAmount = pos.totalAmount;
                const actualCoefficientRaw = pos.coefficient;
                let actualCoefficient = actualCoefficientRaw !== null && actualCoefficientRaw !== undefined
                    ? Math.round(actualCoefficientRaw * 100) / 100
                    : null;
                const quantity = pos.quantity;
                const unit = pos.unit;
                const name = pos.name;
                const volume = pos.volume;
                const formattedVolume = pos.formattedVolume;
                const price = pos.price;

                const { code: extractedCode } = extractCodeFromStrings(codeRaw);
                const isTextPosition = pos.isTextPosition || (!extractedCode && codeRaw && codeRaw.length > 0);

                // ========== ТЕКСТОВАЯ СТРОКА (ЦЕНА ПОСТАВЩИКА) ==========
                if (isTextPosition) {
                    textCount++;
                    analyzedPositions.push({
                        positionNumber: positionNumber,
                        code: codeRaw,
                        extractedCode: null,
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

                // ========== НЕ УДАЛОСЬ ИЗВЛЕЧЬ КОД ==========
                if (!extractedCode) {
                    notFoundCount++;
                    analyzedPositions.push({
                        positionNumber: positionNumber,
                        code: codeRaw,
                        extractedCode: null,
                        name: name,
                        status: 'НЕ НАЙДЕН',
                        statusCategory: 'warning',
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

                // ========== ПОИСК КОДА В БД ==========
                const found = await codesDb.findHierarchicalMatch(extractedCode, sessionCodeCache);
                if (found) foundCount++;
                
                // Единая логика анализа коэффициента
                const analysis = evaluateCoefficientAnalysis({
                    actualCoefficient: actualCoefficient,
                    expectedCoefficient: found?.coefficient_value,
                    isRestoration: (found?.matchType === 'restoration'),
                    found: !!found,
                    baseStatus: found?.status || 'Доступен',
                    baseDescription: found?.description || ''
                });

                if (analysis.coefficientMatch === true) coefficientMatches++;
                if (analysis.coefficientMatch === false) coefficientMismatches++;
                if (analysis.statusCategory === 'warning') warningCount++;
                if (analysis.statusCategory === 'notallowed') notAllowedCount++;
                if (!found && analysis.statusCategory !== 'text') notFoundCount++;

                // ========== ФОРМИРОВАНИЕ РЕЗУЛЬТАТА ==========
                analyzedPositions.push({
                    positionNumber: positionNumber,
                    code: codeRaw,
                    extractedCode: extractedCode,
                    name: name,
                    status: analysis.status,
                    statusCategory: analysis.statusCategory,
                    matchType: found?.matchType || 'none',
                    description: analysis.description,
                    totalAmount: totalAmount,
                    quantity: quantity,
                    unit: unit,
                    price: price,
                    actualCoefficient: actualCoefficient,
                    expectedCoefficient: analysis.expectedCoefficient,
                    coefficientMatch: analysis.coefficientMatch,
                    isText: false,
                    isRestoration: (found?.matchType === 'restoration'),
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
                    coefficientType: found?.coefficient_type || 'none',
                    rowNumber: pos.rowNumber,
                    fileName: displayName,
                    positionName: name
                });
            }

            // ========== ВЫВОД СТАТИСТИКИ ПРОПУСКОВ ==========
        
            
            if (skippedCount > 0) {
       
                for (const [reason, count] of Object.entries(skippedReasonGroups)) {
                
                }
                
            
                for (let i = 0; i < Math.min(10, skippedReasons.length); i++) {
                    const s = skippedReasons[i];

                }
            }
            
      

            // ========== СОХРАНЕНИЕ СЕССИИ ==========
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
                coefficientMatches,
                coefficientMismatches,
                status: 'completed',
                project_id: projectId
            });

            await logsDb.addCodeDetailsBatch(sessionId, analyzedPositions);

            if (projectId) {
                await logsDb.updateProjectSession(projectId, userId, sessionId, estimateName, displayName);
            }

            // ========== ОТВЕТ ==========
            res.json({
                success: true,
                sessionId,
                estimateName: parseResult.sheetName,
                totalAmount: parseResult.totalAmount,
                totalMrAmount,
                totalAmountFormatted: parseResult.totalAmountFormatted,
                stats: {
                    totalPositions: parsedPositions.length,
                    analyzedPositions: analyzedPositions.length,
                    skippedCount: skippedCount,
                    skippedReasonGroups: skippedReasonGroups,
                    skippedExamples: skippedReasons.slice(0, 15),
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

// ==================== АНАЛИЗ КС-2 ====================

/**
 * Проверка некорректных строк для КС-2
 */
function checkInvalidKs2CodeString(str) {
    if (!str || typeof str !== 'string') {
        return { isInvalid: true, reason: 'Пустое значение' };
    }
    
    const trimmed = str.trim();
    
    if (trimmed === '') {
        return { isInvalid: true, reason: 'Пустая строка шифра' };
    }
    
    if (trimmed === '9999990001') {
        return { isInvalid: true, reason: 'Служебный код 9999990001' };
    }
    
    if (/^\d$/.test(trimmed)) {
        return { isInvalid: true, reason: `Одиночная цифра "${trimmed}"` };
    }
    
    if (/^\d{2}$/.test(trimmed)) {
        return { isInvalid: true, reason: `Двузначное число "${trimmed}"` };
    }
    
    if (/^\d{3}$/.test(trimmed)) {
        return { isInvalid: true, reason: `Трёхзначное число "${trimmed}"` };
    }
    
    if (trimmed.length > 50) {
        return { isInvalid: true, reason: `Слишком длинная строка (>50 символов)` };
    }
    
    return { isInvalid: false, reason: null };
}

async function enrichKs2Items(items) {
    const sessionCodeCache = new Map();
    let coefficientMatches = 0;
    let coefficientMismatches = 0;
    let warningCount = 0;
    let notAllowedCount = 0;
    let skippedCount = 0;
    const skippedItems = [];

    const enriched = [];

    for (const item of items) {
        const extractedCode = item.code || null;
        
        // Проверяем на некорректность
        const invalidCheck = checkInvalidKs2CodeString(extractedCode);
        
        if (invalidCheck.isInvalid) {
            skippedCount++;
            skippedItems.push({
                position: item.ks2_position_number || item.position || '?',
                code: extractedCode,
                reason: invalidCheck.reason,
                name: item.name,
                total: item.total
            });
            
    
            
            enriched.push({
                ...item,
                details: Array.isArray(item.details) ? item.details : [],
                extractedCode: null,
                matchType: 'invalid',
                status: 'Обратите внимание',
                statusCategory: 'warning',
                description: `⚠️ Некорректное значение в колонке шифра: ${invalidCheck.reason}`,
                coefficientMatch: null,
                expectedCoefficient: null,
                hasDetails: Array.isArray(item.details) && item.details.length > 0
            });
            continue;
        }
        
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

    // Выводим статистику пропусков КС-2
    if (skippedCount > 0) {
    
        for (let i = 0; i < Math.min(10, skippedItems.length); i++) {
            const s = skippedItems[i];
        
        }
    }

    return {
        items: enriched,
        coefficientMatches,
        coefficientMismatches,
        warningCount,
        notAllowedCount,
        skippedCount,
        skippedItems
    };
}

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
        let totalSkippedCount = 0;
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
                
                totalSkippedCount += enriched.skippedCount;
                totalItems += parseResult.totalItems;
                totalAmount += parseResult.totalAmount;

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

                if (projectId) {
                    await logsDb.updateProjectSession(projectId, userId, sessionId, estimateName, displayName);
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
                        notAllowedCount: enriched.notAllowedCount,
                        skippedCount: enriched.skippedCount,
                        skippedItems: enriched.skippedItems.slice(0, 10)
                    },
                    detectedColumns: parseResult.detectedColumns,
                    startRow: parseResult.startRow
                });

            } catch (err) {
                console.error(`[analyze-ks2] Ошибка обработки ${displayName}:`, err);
                allResults.push({ fileName: displayName, error: err.message, success: false });
            } finally {
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}
            }
        }

        // Общая сводка по КС-2


        res.json({
            success: true,
            filesCount: ks2Files.length,
            totalItems,
            totalAmount,
            totalAmountFormatted: totalAmount.toLocaleString('ru-RU'),
            totalSkippedCount,
            results: allResults,
            savedCount: totalSavedCount,
            sessionIds
        });

    } catch (error) {
        console.error('[analyze-ks2] Ошибка:', error);
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
        if (!sessionId) return res.status(400).json({ error: 'sessionId обязателен' });
        
        const session = await logsDb.getOne(`SELECT * FROM sessions WHERE session_id = @p0`, [sessionId]);
        if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
        
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
        console.error('[ks2-sessions] Ошибка:', error);
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
        worksheet['!cols'] = [
            { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, 
            { wch: 50 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
        ];
        
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'КС-2');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName || 'ks2_export'}.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('[export-ks2] Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;