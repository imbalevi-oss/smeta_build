// routes/analyze.js
// Полностью переписанные маршруты для анализа смет и КС-2
// Использует единые парсеры parseEstimate (смета) и parseKS2 (акты)

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseEstimate } = require('../../shareds/estimate-parser');
const { parseKS2 } = require('../../shareds/ks2-parser');
const logsDb = require('../../shareds/logs-db');
const usersDb = require('../../shareds/users-db');
const codesDb = require('../../shareds/codes-db');

const router = express.Router();

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
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
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

// ==================== КОПИЯ РАБОЧЕЙ ФУНКЦИИ ИЗ ks2-parser.js ====================
// (чтобы быть уверенными, что извлечение кода работает одинаково)
function extractCodeFromString(str) {
    if (!str || typeof str !== 'string') return { code: null, comment: '' };
    const trimmed = str.trim();
    if (trimmed === '') return { code: null, comment: '' };
    if (trimmed.toLowerCase().startsWith('цена поставщика')) {
        return { code: trimmed, comment: '' };
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
                const comment = trimmed.substring(match[0].length).trim();
                return { code, comment };
            }
        }
    }
    return { code: null, comment: trimmed };
}

// ==================== АНАЛИЗ СМЕТЫ (НОВЫЙ ЕДИНЫЙ ПАРСЕР) ====================
/**
 * POST /api/detailed-analyze-unified
 * Анализ сметы с проверкой кодов в БД
 * Использует parseEstimate -> сумма из колонки суммы (строка + детали)
 */
router.post('/detailed-analyze-unified', requireAuth, (req, res) => {
    upload.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'Нет файла' });

        const fileBuffer = fs.readFileSync(req.file.path);
        const originalName = req.file.originalname;
        const projectId = req.body.projectId ? parseInt(req.body.projectId) : null;
        const isRevised = req.body.isRevised === 'true';
        const userId = req.userId;

        try {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`📊 АНАЛИЗ СМЕТЫ (единый парсер parseEstimate): ${originalName}`);
            console.log(`👤 Пользователь ID: ${userId}, Проект ID: ${projectId || 'новый'}`);
            console.log(`🔄 Исправленная: ${isRevised}`);
            console.log(`${'='.repeat(80)}`);

            // ШАГ 1: Парсинг файла сметы
            const parseResult = parseEstimate(fileBuffer, originalName);
            if (!parseResult.success) {
                throw new Error(`Ошибка парсинга: ${parseResult.error}`);
            }

            const parsedPositions = parseResult.items;
            console.log(`✅ Распознано позиций: ${parsedPositions.length}`);
            console.log(`💰 Общая сумма по смете (по колонке суммы): ${parseResult.totalAmountFormatted} ₽`);
            if (parseResult.detectedColumns) {
                console.log(`📌 Определённые колонки: позиция=${parseResult.detectedColumns.position}, код=${parseResult.detectedColumns.code}, сумма=${parseResult.detectedColumns.amount}`);
            }

            // ШАГ 2: Анализ каждой позиции – поиск кода в БД, проверка коэффициента
            const sessionCodeCache = new Map();
            const COEFF_TOLERANCE = 0.01;
            const analyzedPositions = [];
            let textCount = 0;
            let warningCount = 0;
            let notAllowedCount = 0;
            let notFoundCount = 0;
            let foundCount = 0;
            let coefficientMatches = 0;
            let coefficientMismatches = 0;

            for (const pos of parsedPositions) {
                const positionNumber = pos.positionNumber;
                const codeRaw = pos.code;
                const totalAmount = pos.totalAmount;          // уже сумма из колонки суммы (строка + детали)
                const actualCoefficient = pos.coefficient;
                const quantity = pos.quantity;
                const unit = pos.unit;
                const name = pos.name;

                // Извлекаем чистый код из строки (используем нашу локальную функцию)
                const { code: extractedCode } = extractCodeFromString(codeRaw);
                const isTextPosition = pos.isTextPosition || (!extractedCode && codeRaw && codeRaw.length > 0 && !/^\d/.test(codeRaw));

                console.log(`\n🔍 Позиция ${positionNumber} (строка ${pos.rowNumber})`);
                console.log(`   Исходный код: ${codeRaw.substring(0, 60)}`);
                console.log(`   Извлечённый код: ${extractedCode || '—'}`);
                console.log(`   Сумма (из колонки суммы): ${totalAmount.toLocaleString('ru-RU')} ₽`);
                console.log(`   Коэффициент: ${actualCoefficient !== null ? actualCoefficient : '—'}`);

                // Обработка текстовых позиций
                if (isTextPosition) {
                    textCount++;
                    analyzedPositions.push({
                        positionNumber,
                        code: codeRaw,
                        extractedCode: null,
                        name,
                        status: 'Обратите внимание',
                        statusCategory: 'text',
                        matchType: 'text',
                        description: '📝 Текстовая строка - цена поставщика',
                        totalAmount,
                        quantity,
                        unit,
                        actualCoefficient: actualCoefficient,
                        expectedCoefficient: null,
                        coefficientMatch: null,
                        isText: true,
                        isRestoration: false,
                        hasDetails: (pos.details && pos.details.length > 0) || false,
                        details: pos.details || []
                    });
                    console.log(`   📝 Определена как ТЕКСТОВАЯ позиция`);
                    continue;
                }

                if (!extractedCode) {
                    notFoundCount++;
                    analyzedPositions.push({
                        positionNumber,
                        code: codeRaw,
                        extractedCode: null,
                        name,
                        status: 'НЕ НАЙДЕН',
                        statusCategory: 'notfound',
                        matchType: 'none',
                        description: 'Не удалось извлечь код из строки',
                        totalAmount,
                        quantity,
                        unit,
                        actualCoefficient,
                        expectedCoefficient: null,
                        coefficientMatch: null,
                        isText: false,
                        isRestoration: false,
                        hasDetails: false,
                        details: []
                    });
                    console.log(`   ❌ Не удалось извлечь код`);
                    continue;
                }

                // Поиск кода в БД
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

                    // Проверка коэффициента
                    if (actualCoefficient !== null && actualCoefficient !== 1) {
                        if (expectedCoefficient !== null && Math.abs(actualCoefficient - expectedCoefficient) <= COEFF_TOLERANCE) {
                            coefficientMatch = true;
                            coefficientMatches++;
                            description = `✅ Коэффициент ${actualCoefficient} соответствует норме (${expectedCoefficient})`;
                        } else {
                            coefficientMatch = false;
                            coefficientMismatches++;
                            category = 'warning';
                            status = 'Обратите внимание';
                            description = `⚠️ Коэффициент ${actualCoefficient} не соответствует норме${expectedCoefficient ? ` (${expectedCoefficient})` : ''}. Требуется обоснование.`;
                        }
                    } else if (expectedCoefficient !== null && expectedCoefficient !== 1) {
                        // Требуется коэффициент, но его нет
                        coefficientMatch = false;
                        coefficientMismatches++;
                        category = 'warning';
                        status = 'Обратите внимание';
                        description = `⚠️ Отсутствует обязательный коэффициент. Ожидается ${expectedCoefficient}.`;
                    } else {
                        coefficientMatch = null;
                    }

                    if (isRestoration) {
                        category = 'notallowed';
                        status = 'Нельзя применять';
                        description = '🏛️ Реставрационные работы. Применение запрещено.';
                        if (coefficientMatch === true) coefficientMatches--;
                        if (coefficientMatch === false) coefficientMismatches--;
                    }
                } else {
                    notFoundCount++;
                    category = 'warning';
                    status = 'НЕ НАЙДЕН';
                    description = 'Код отсутствует в базе данных';
                }

                if (category === 'warning') warningCount++;
                if (category === 'notallowed') notAllowedCount++;

                console.log(`   🔍 Результат поиска: ${found ? `найден (${matchType})` : 'НЕ НАЙДЕН'}`);
                if (coefficientMatch !== null) console.log(`   📊 Коэффициент: ${coefficientMatch ? '✅ верен' : '❌ неверен'}`);
                console.log(`   📋 Статус: ${status} (${category})`);

                analyzedPositions.push({
                    positionNumber,
                    code: codeRaw,
                    extractedCode,
                    name,
                    status,
                    statusCategory: category,
                    matchType,
                    description,
                    totalAmount,
                    quantity,
                    unit,
                    actualCoefficient,
                    expectedCoefficient,
                    coefficientMatch,
                    isText: false,
                    isRestoration,
                    hasDetails: (pos.details && pos.details.length > 0) || false,
                    details: pos.details || []
                });
            }

            // ШАГ 3: Сохранение сессии в БД
            const user = await usersDb.getUserById(userId);
            const sessionId = Date.now() + '-' + Math.random().toString(36).substr(2, 8);
            await logsDb.createSession(sessionId, {
                user: { fullname: user.fullname, institution: user.institution },
                ip: req.ip,
                filename: originalName,
                estimateName: parseResult.sheetName || 'Смета',
                isRevised,
                totalCodes: analyzedPositions.length,
                foundCodes: foundCount,
                notFoundCodes: notFoundCount,
                totalAmount: parseResult.totalAmount,
                status: 'completed',
                project_id: projectId
            });

            // ШАГ 4: Статистика для ответа
            const totalMrAmount = parsedPositions.reduce((sum, p) => sum + (p.mrTotalAmount || 0), 0);
            const totalMrRows = parsedPositions.reduce((sum, p) => sum + (p.mrDetails?.length || 0), 0);
            const positionsWithMr = parsedPositions.filter(p => (p.mrDetails?.length || 0) > 0).length;

            console.log(`\n${'='.repeat(80)}`);
            console.log(`📊 ИТОГИ АНАЛИЗА СМЕТЫ:`);
            console.log(`   Всего позиций: ${analyzedPositions.length}`);
            console.log(`   ✅ Найдено в БД: ${foundCount}`);
            console.log(`   ❌ Не найдено: ${notFoundCount}`);
            console.log(`   ⚠️ Требуют внимания: ${warningCount}`);
            console.log(`   🚫 Нельзя применять: ${notAllowedCount}`);
            console.log(`   📝 Текстовых: ${textCount}`);
            console.log(`   📈 Коэффициентов верно: ${coefficientMatches}`);
            console.log(`   📉 Коэффициентов неверно: ${coefficientMismatches}`);
            console.log(`   💰 ОБЩАЯ СУММА: ${parseResult.totalAmount.toLocaleString('ru-RU')} ₽`);
            console.log(`   📦 МР материалов: ${totalMrRows} строк, сумма ${totalMrAmount.toLocaleString('ru-RU')} ₽`);
            console.log(`${'='.repeat(80)}\n`);

            // ШАГ 5: Ответ клиенту
            res.json({
                success: true,
                sessionId,
                estimateName: parseResult.sheetName,
                totalAmount: parseResult.totalAmount,
                totalMrAmount,
                totalAmountFormatted: parseResult.totalAmountFormatted,
                stats: {
                    totalPositions: analyzedPositions.length,
                    foundCount,
                    notFoundCount,
                    warningCount,
                    notAllowedCount,
                    textCount,
                    coefficientMatches,
                    coefficientMismatches,
                    totalMrAmount,
                    totalMrRows,
                    positionsWithMr
                },
                positions: analyzedPositions,
                detectedColumns: parseResult.detectedColumns
            });

        } catch (error) {
            console.error('❌ Ошибка анализа сметы:', error);
            res.status(500).json({ error: error.message, details: process.env.NODE_ENV === 'development' ? error.stack : undefined });
        } finally {
            try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch(e) {}
        }
    });
});

// ==================== АНАЛИЗ КС-2 ====================
/**
 * POST /api/analyze-ks2
 * Анализ файлов КС-2 (без проверки в БД, только парсинг)
 */
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
            console.log(`\n📄 Обработка файла ${idx + 1}/${ks2Files.length}: ${file.originalname}`);

            try {
                const fileBuffer = fs.readFileSync(filePath);
                const parseResult = parseKS2(fileBuffer, file.originalname);

                if (!parseResult.success) {
                    console.error(`   ❌ Ошибка парсинга: ${parseResult.error}`);
                    allResults.push({ fileName: file.originalname, error: parseResult.error, success: false });
                    continue;
                }

                console.log(`   ✅ Распознано позиций: ${parseResult.totalItems}`);
                console.log(`   💰 Сумма: ${parseResult.totalAmountFormatted} ₽`);
                if (parseResult.detectedColumns) {
                    console.log(`   📊 Колонки: позиция=${parseResult.detectedColumns.ks2Position}, шифр=${parseResult.detectedColumns.code}, сумма=${parseResult.detectedColumns.total}`);
                }

                const sessionId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 8);
                sessionIds.push(sessionId);

                // Сохраняем сессию КС-2
                await logsDb.createSession(sessionId, {
                    user: { fullname: user.fullname, institution: user.institution },
                    ip: req.ip,
                    filename: file.originalname,
                    estimateName: `КС-2: ${file.originalname}`,
                    isRevised: false,
                    totalCodes: parseResult.totalItems,
                    foundCodes: parseResult.totalItems,
                    notFoundCodes: 0,
                    totalAmount: parseResult.totalAmount,
                    status: 'completed',
                    project_id: projectId,
                    is_ks2: 1
                });

                // Сохраняем позиции КС-2 (здесь нужно обновить метод logsDb.saveKs2Items, чтобы он соответствовал полям таблицы)
                const savedCount = await logsDb.saveKs2Items(sessionId, file.originalname, idx + 1, parseResult.items);
                totalSavedCount += savedCount;
                totalItems += parseResult.totalItems;
                totalAmount += parseResult.totalAmount;

                allResults.push({
                    fileName: file.originalname,
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
                console.error(`   ❌ Ошибка обработки файла ${file.originalname}:`, err.message);
                allResults.push({ fileName: file.originalname, error: err.message, success: false });
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

// ==================== ВСПОМОГАТЕЛЬНЫЕ МАРШРУТЫ ДЛЯ КС-2 ====================
/**
 * GET /api/ks2-sessions/:sessionId
 * Получение данных КС-2 по сессии
 */
router.get('/ks2-sessions/:sessionId', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await logsDb.getOne(`SELECT * FROM sessions WHERE session_id = @p0`, [sessionId]);
        if (!session) return res.status(404).json({ error: 'Сессия не найдена' });

        const user = await usersDb.findUserByUsername(session.user_name);
        if (!user || user.id !== req.userId) return res.status(403).json({ error: 'Доступ запрещён' });

        const items = await logsDb.getKs2Items(sessionId);
        res.json({
            success: true,
            session: {
                session_id: session.session_id,
                filename: session.filename,
                estimate_name: session.estimate_name,
                created_at: session.created_at,
                total_codes: session.total_codes,
                total_amount: session.total_amount,
                status: session.status
            },
            items,
            totalItems: items.length,
            totalAmount: session.total_amount
        });
    } catch (error) {
        console.error('Ошибка получения КС-2 сессии:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/export-ks2-excel
 * Экспорт результатов КС-2 в Excel
 */
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