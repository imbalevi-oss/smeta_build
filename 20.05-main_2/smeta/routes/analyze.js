// routes/analyze.js
// Маршруты для анализа смет и КС-2

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const analysisEngine = require('../lib/analysis-engine');
const { parseFullEstimate } = require('../../shareds/full-estimate-parser');
const { parseKS2 } = require('../../shareds/ks2-parser');
const logsDb = require('../../shareds/logs-db');
const usersDb = require('../../shareds/users-db');

const router = express.Router();

// Middleware для получения userId из заголовка
function getUserId(req) {
    const userId = req.headers['x-user-id'];
    if (userId && !isNaN(parseInt(userId))) {
        return parseInt(userId);
    }
    return null;
}

function requireAuth(req, res, next) {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    req.userId = userId;
    next();
}

// Конфигурация multer
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.xls', '.xlsx', '.xlsm'].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Неверный формат файла. Разрешены только Excel (.xls, .xlsx)'));
        }
    }
});

/**
 * POST /api/detailed-analyze-unified
 * Анализ сметы с проверкой кодов в БД
 */
router.post('/detailed-analyze-unified', requireAuth, (req, res) => {
    upload.single('file')(req, res, async (err) => {
        if (err) {
            console.error('❌ Ошибка загрузки файла:', err);
            return res.status(400).json({ error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Нет файла' });
        }

        const filePath = req.file.path;
        const originalName = req.file.originalname;
        const projectId = req.body.projectId ? parseInt(req.body.projectId) : null;
        const isRevised = req.body.isRevised === 'false' ? false : req.body.isRevised === 'true';

        try {
            console.log(`\n${'='.repeat(70)}`);
            console.log(`🔍 АНАЛИЗ СМЕТЫ: ${originalName}`);
            console.log(`👤 Пользователь ID: ${req.userId}`);
            console.log(`📁 Проект ID: ${projectId || 'новый проект'}`);
            console.log(`🔄 Исправленная: ${isRevised}`);
            console.log(`${'='.repeat(70)}`);

            // ШАГ 1: ПАРСИНГ ДЕТАЛЬНЫХ ПОЗИЦИЙ
            console.log(`\n📋 ПАРСИНГ ДЕТАЛЬНЫХ ПОЗИЦИЙ (full-estimate-parser)`);
            const fileBuffer = fs.readFileSync(filePath);
            const fullParseResult = parseFullEstimate(fileBuffer);
            
            const positionDataMap = new Map();
            
            console.log(`\n📊 РЕЗУЛЬТАТЫ ПАРСИНГА:`);
            console.log(`   Успех: ${fullParseResult.success}`);
            console.log(`   Всего позиций: ${fullParseResult.positions?.length || 0}`);
            
            if (fullParseResult.success && fullParseResult.positions) {
                for (const pos of fullParseResult.positions) {
                    const key = String(pos.positionNumber);
                    
                    positionDataMap.set(key, {
                        totalAmount: pos.totalAmount || 0,
                        quantity: pos.quantity || 0,
                        unit: pos.unit || '',
                        price: pos.price || 0,
                        name: pos.name || '',
                        volume: pos.volume || 0,
                        formattedVolume: pos.formattedVolume || '',
                        isTextPosition: pos.isTextPosition === true,
                        amountFromRow: pos.amountFromRow || 0,
                        sumAllDetails: pos.sumAllDetails || 0,
                        hasDetails: pos.details && pos.details.length > 0,
                        details: pos.details || [],
                        mrTotalAmount: pos.mrTotalAmount || 0,
                        mrCount: pos.mrDetails?.length || 0,
                        mrDetails: pos.mrDetails || []
                    });
                }
            }

            // ШАГ 2: АНАЛИЗ КОДОВ
            console.log(`\n🔍 АНАЛИЗ КОДОВ (analysisEngine)`);
            const result = await analysisEngine.performAnalysis(
                filePath,
                originalName,
                req.userId,
                isRevised,
                projectId
            );
            
            console.log(`   Результатов анализа: ${result.results?.length || 0}`);

            // ШАГ 3: ОБЪЕДИНЯЕМ ДАННЫЕ
            console.log(`\n🔗 ОБЪЕДИНЕНИЕ ДАННЫХ:`);
            
            const positions = (result.results || []).map((item, idx) => {
                let key = String(item.positionNumber).trim();
                let posData = positionDataMap.get(key);
                
                if (!posData) {
                    const keys = Array.from(positionDataMap.keys());
                    if (idx < keys.length) {
                        key = keys[idx];
                        posData = positionDataMap.get(key);
                    }
                }
                
                const isTextPosition = item.isText === true || item.category === 'text' || (posData?.isTextPosition === true);
                let totalAmount = posData?.totalAmount || 0;
                
                const basePosition = {
                    positionNumber: item.positionNumber,
                    code: isTextPosition ? (posData?.name || item.code || item.extractedCode || '—') : (item.extractedCode || item.code || '—'),
                    originalCode: item.code || '',
                    name: posData?.name || item.description || '',
                    status: item.status || (isTextPosition ? 'Обратите внимание' : ''),
                    statusCategory: isTextPosition ? 'text' : (item.category || 'ok'),
                    matchType: item.matchType || (isTextPosition ? 'text' : ''),
                    matchedLevel: item.matchedLevel,
                    isRestoration: item.isRestoration || false,
                    isText: isTextPosition,
                    isTextPosition: isTextPosition,
                    hasCoefficient: item.hasCoefficient || false,
                    coefficientType: item.coefficientType,
                    actualCoefficient: item.actualCoefficient,
                    expectedCoefficient: item.expectedCoefficient,
                    coefficientMatch: item.coefficientMatch,
                    description: item.description || (isTextPosition ? '📝 Текстовая строка - цена поставщика' : ''),
                    totalAmount: totalAmount,
                    quantity: posData?.quantity || 0,
                    unit: posData?.unit || '',
                    price: posData?.price || 0,
                    volume: posData?.volume || 0,
                    formattedVolume: posData?.formattedVolume || '',
                    rowNumber: item.rowNumber || idx + 1,
                    amountFromRow: posData?.amountFromRow || 0,
                    sumAllDetails: posData?.sumAllDetails || 0,
                    hasDetails: posData?.hasDetails || false,
                    details: posData?.details || [],
                    mrTotalAmount: posData?.mrTotalAmount || 0,
                    mrCount: posData?.mrCount || 0,
                    mrDetails: posData?.mrDetails || []
                };
                
                return basePosition;
            });

            const warningCount = positions.filter(p => p.statusCategory === 'warning').length;
            const notAllowedCount = positions.filter(p => p.statusCategory === 'notallowed').length;
            const notFoundCount = positions.filter(p => p.statusCategory === 'notfound' || (p.matchType === 'not_found' && p.statusCategory !== 'text')).length;
            const textCount = positions.filter(p => p.isTextPosition).length;
            const totalMrAmount = positions.reduce((sum, p) => sum + (p.mrTotalAmount || 0), 0);
            const totalMrRows = positions.reduce((sum, p) => sum + (p.mrCount || 0), 0);
            const totalFullAmount = positions.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

            console.log(`\n📊 ИТОГИ АНАЛИЗА СМЕТЫ:`);
            console.log(`   Всего позиций: ${positions.length}`);
            console.log(`   ✅ Найдено в БД: ${positions.filter(p => p.matchType && p.matchType !== 'not_found' && !p.isTextPosition).length}`);
            console.log(`   ⚠️ Требуют внимания: ${warningCount}`);
            console.log(`   🚫 Запрещено: ${notAllowedCount}`);
            console.log(`   📝 Текстовых: ${textCount}`);
            console.log(`   💰 ОБЩАЯ СУММА: ${totalFullAmount.toLocaleString('ru-RU')} ₽`);
            console.log(`   📦 МР материалов: ${totalMrRows} строк, сумма ${totalMrAmount.toLocaleString('ru-RU')} ₽`);
            console.log(`${'='.repeat(70)}\n`);

            res.json({
                success: true,
                sessionId: result.sessionId,
                estimateName: result.estimateName,
                totalAmount: totalFullAmount,
                totalMrAmount: totalMrAmount,
                totalAmountFormatted: totalFullAmount.toLocaleString('ru-RU'),
                stats: {
                    totalPositions: positions.length,
                    foundCount: positions.filter(p => p.matchType && p.matchType !== 'not_found' && !p.isTextPosition).length,
                    notFoundCount: notFoundCount,
                    warningCount: warningCount,
                    notAllowedCount: notAllowedCount,
                    textCount: textCount,
                    coefficientMatches: positions.filter(p => p.coefficientMatch === true).length,
                    coefficientMismatches: positions.filter(p => p.coefficientMatch === false).length,
                    totalMrAmount: totalMrAmount,
                    totalMrRows: totalMrRows,
                    positionsWithMr: positions.filter(p => p.mrCount > 0).length
                },
                positions: positions,
                detectedColumns: result.detectedColumns
            });
            
        } catch (error) {
            console.error('❌ Ошибка анализа:', error);
            res.status(500).json({ 
                error: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        } finally {
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch(e) {}
            }
        }
    });
});

/**
 * POST /api/analyze-ks2
 * Анализ файлов КС-2 (без проверки в БД)
 */
router.post('/analyze-ks2', requireAuth, upload.array('ks2Files', 10), async (req, res) => {
    const ks2Files = req.files || [];
    
    if (!ks2Files.length) {
        return res.status(400).json({ error: 'Не загружены файлы КС-2' });
    }

    const projectId = req.body.projectId ? parseInt(req.body.projectId) : null;
    const userId = req.userId;
    
    try {
        const user = await usersDb.getUserById(userId);
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        console.log(`\n${'='.repeat(70)}`);
        console.log(`📁 АНАЛИЗ КС-2`);
        console.log(`👤 Пользователь: ${user.fullname} (${user.institution})`);
        console.log(`📁 Проект ID: ${projectId || 'без проекта'}`);
        console.log(`📄 Файлов: ${ks2Files.length}`);
        console.log(`${'='.repeat(70)}`);
        
        const allResults = [];
        let totalItems = 0;
        let totalAmount = 0;
        let totalSavedCount = 0;
        let sessionIds = [];
        
        for (let idx = 0; idx < ks2Files.length; idx++) {
            const file = ks2Files[idx];
            const filePath = file.path;
            
            console.log(`\n📄 Обработка файла ${idx + 1}/${ks2Files.length}: ${file.originalname}`);
            
            try {
                const fileBuffer = fs.readFileSync(filePath);
                const parseResult = parseKS2(fileBuffer, file.originalname);
                
                if (!parseResult.success) {
                    console.error(`   ❌ Ошибка парсинга: ${parseResult.error}`);
                    allResults.push({
                        fileName: file.originalname,
                        error: parseResult.error,
                        success: false
                    });
                    continue;
                }
                
                console.log(`   ✅ Распознано позиций: ${parseResult.totalItems}`);
                console.log(`   💰 Сумма: ${parseResult.totalAmountFormatted}`);
                if (parseResult.detectedColumns) {
                    console.log(`   📊 Колонки: позиция=${parseResult.detectedColumns.ks2Position}, шифр=${parseResult.detectedColumns.code}`);
                }
                
                const sessionId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 8);
                sessionIds.push(sessionId);
                
                // Сохраняем сессию
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
                    project_id: projectId
                });
                
                // Сохраняем позиции КС-2
                const savedCount = await logsDb.saveKs2Items(
                    sessionId, 
                    file.originalname, 
                    idx + 1, 
                    parseResult.items.map(item => ({
                        position: item.position,
                        ks2_position_number: item.ks2_position_number,
                        estimate_position_number: item.estimate_position_number,
                        code: item.code,
                        name: item.name,
                        unit: item.unit,
                        quantity: item.quantity,
                        price: 0,
                        total: item.total,
                        row_number: item.row_number
                    }))
                );
                
                totalSavedCount += savedCount;
                totalItems += parseResult.totalItems;
                totalAmount += parseResult.totalAmount;
                
                allResults.push({
                    fileName: file.originalname,
                    sessionId: sessionId,
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
                allResults.push({
                    fileName: file.originalname,
                    error: err.message,
                    success: false
                });
            } finally {
                try { 
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath); 
                } catch(e) {}
            }
        }
        
        console.log(`\n${'='.repeat(70)}`);
        console.log(`📊 ИТОГИ АНАЛИЗА КС-2:`);
        console.log(`   Обработано файлов: ${ks2Files.length}`);
        console.log(`   Успешно: ${allResults.filter(r => r.success).length}`);
        console.log(`   С ошибками: ${allResults.filter(r => !r.success).length}`);
        console.log(`   Сохранено позиций: ${totalSavedCount}`);
        console.log(`   Общая сумма: ${totalAmount.toLocaleString('ru-RU')} ₽`);
        console.log(`${'='.repeat(70)}\n`);
        
        res.json({
            success: true,
            filesCount: ks2Files.length,
            totalItems: totalItems,
            totalAmount: totalAmount,
            totalAmountFormatted: totalAmount.toLocaleString('ru-RU'),
            results: allResults,
            savedCount: totalSavedCount,
            sessionIds: sessionIds
        });
        
    } catch (error) {
        console.error('❌ Ошибка анализа КС-2:', error);
        res.status(500).json({ 
            error: error.message,
            success: false
        });
    } finally {
        for (const file of ks2Files) {
            try { 
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path); 
            } catch(e) {}
        }
    }
});

/**
 * GET /api/ks2-sessions/:sessionId
 * Получение данных КС-2 по сессии
 */
router.get('/ks2-sessions/:sessionId', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const session = await logsDb.getOne(`SELECT * FROM sessions WHERE session_id = @p0`, [sessionId]);
        if (!session) {
            return res.status(404).json({ error: 'Сессия не найдена' });
        }
        
        const user = await usersDb.findUserByUsername(session.user_name);
        if (!user || user.id !== req.userId) {
            return res.status(403).json({ error: 'Доступ запрещён' });
        }
        
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
            items: items,
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
        
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Нет данных для экспорта' });
        }
        
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
            { wch: 8 },   // № п/п
            { wch: 12 },  // Позиция в КС-2
            { wch: 12 },  // Поз. по смете
            { wch: 20 },  // Шифр
            { wch: 50 },  // Наименование работ
            { wch: 12 },  // Единица измерения
            { wch: 15 },  // Количество
            { wch: 15 },  // Объём
            { wch: 15 }   // Сумма
        ];
        
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