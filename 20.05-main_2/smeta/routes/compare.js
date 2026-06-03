// routes/compare.js

const express = require('express');
const router = express.Router();
const logsDb = require('../../shareds/logs-db');
const { parseEstimate } = require('../../shareds/estimate-parser');
const { parseKS2 } = require('../../shareds/ks2-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

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
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ==================== МАРШРУТЫ ====================

/**
 * GET /api/compare/:projectId
 * Сравнение сметы и КС-2 в проекте
 */
router.get('/compare/:projectId', requireAuth, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔍 СРАВНЕНИЕ для проекта ${projectId}`);
        console.log(`${'='.repeat(60)}`);
        
        const project = await logsDb.getOne(
            `SELECT * FROM user_projects WHERE id = @p0 AND user_id = @p1`,
            [projectId, req.userId]
        );
        
        if (!project) {
            return res.json({ success: false, error: 'Проект не найден' });
        }
        
        console.log(`📁 Проект: ${project.project_name}`);
        
        const estimateSessions = await logsDb.query(`
            SELECT session_id, estimate_name, filename, created_at
            FROM sessions 
            WHERE project_id = @p0 AND (is_ks2 = 0 OR is_ks2 IS NULL)
            ORDER BY created_at DESC
        `, [projectId]);
        
        const ks2Sessions = await logsDb.query(`
            SELECT session_id, filename, created_at
            FROM sessions 
            WHERE project_id = @p0 AND is_ks2 = 1
            ORDER BY created_at DESC
        `, [projectId]);
        
        console.log(`📊 Найдено смет: ${estimateSessions.length}`);
        console.log(`📊 Найдено КС-2: ${ks2Sessions.length}`);
        
        if (estimateSessions.length === 0) {
            return res.json({ success: false, error: 'Нет сметы в проекте' });
        }
        
        if (ks2Sessions.length === 0) {
            return res.json({ success: false, error: 'Нет КС-2 в проекте' });
        }
        
        const estimateSession = estimateSessions[0];
        const ks2SessionIds = ks2Sessions.map(s => s.session_id);
        
        const estimateCodes = await logsDb.query(`
            SELECT DISTINCT 
                extracted_code as code,
                MAX(name) as name,
                SUM(total_amount) as total_amount
            FROM code_details 
            WHERE session_id = @p0 
                AND extracted_code IS NOT NULL 
                AND extracted_code != ''
                AND extracted_code != 'цена поставщика'
            GROUP BY extracted_code
        `, [estimateSession.session_id]);
        
        const placeholders = ks2SessionIds.map((_, i) => `@p${i + 1}`).join(',');
        const ks2Codes = await logsDb.query(`
            SELECT DISTINCT 
                extracted_code as code,
                MAX(name) as name,
                SUM(total) as total_amount
            FROM ks2_items 
            WHERE session_id IN (${placeholders})
                AND extracted_code IS NOT NULL 
                AND extracted_code != ''
                AND extracted_code != 'цена поставщика'
            GROUP BY extracted_code
        `, ks2SessionIds);
        
        const estimateMap = new Map();
        for (const c of estimateCodes) {
            estimateMap.set(c.code, { name: c.name, total: c.total_amount });
        }
        
        const ks2Map = new Map();
        for (const c of ks2Codes) {
            ks2Map.set(c.code, { name: c.name, total: c.total_amount });
        }
        
        const allCodes = new Set([...estimateMap.keys(), ...ks2Map.keys()]);
        
        const comparison = [];
        let matchCount = 0, onlyInEstimate = 0, onlyInKs2 = 0;
        
        for (const code of allCodes) {
            const estimate = estimateMap.get(code);
            const ks2 = ks2Map.get(code);
            
            let status = '';
            if (estimate && ks2) {
                status = 'match';
                matchCount++;
            } else if (estimate && !ks2) {
                status = 'only_in_estimate';
                onlyInEstimate++;
            } else {
                status = 'only_in_ks2';
                onlyInKs2++;
            }
            
            comparison.push({
                code: code,
                name: estimate?.name || ks2?.name || '',
                estimate_total: estimate?.total || null,
                ks2_total: ks2?.total || null,
                status: status
            });
        }
        
        res.json({
            success: true,
            project_id: projectId,
            project_name: project.project_name,
            estimate_name: estimateSession.estimate_name || estimateSession.filename,
            stats: {
                total_codes: allCodes.size,
                match_count: matchCount,
                only_in_estimate: onlyInEstimate,
                only_in_ks2: onlyInKs2
            },
            comparison: comparison
        });
        
    } catch (err) {
        console.error('❌ Ошибка:', err);
        res.status(500).json({ error: err.message, success: false });
    }
});

/**
 * POST /api/compare-files
 * Сравнение двух файлов: смета и КС-2 (с объёмами и суммами)
 */
router.post('/compare-files', upload.fields([
    { name: 'estimateFile', maxCount: 1 },
    { name: 'ks2File', maxCount: 1 }
]), async (req, res) => {
    try {
        const estimateFile = req.files['estimateFile']?.[0];
        const ks2File = req.files['ks2File']?.[0];

        if (!estimateFile || !ks2File) {
            return res.status(400).json({ success: false, error: 'Загрузите оба файла' });
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 СРАВНЕНИЕ ФАЙЛОВ`);
        console.log(`   Смета: ${estimateFile.originalname}`);
        console.log(`   КС-2: ${ks2File.originalname}`);
        console.log(`${'='.repeat(60)}`);

        // Парсим смету
        const estimateBuffer = fs.readFileSync(estimateFile.path);
        const estimateResult = parseEstimate(estimateBuffer, estimateFile.originalname);
        
        if (!estimateResult.success) {
            throw new Error(`Ошибка парсинга сметы: ${estimateResult.error}`);
        }

        // Парсим КС-2
        const ks2Buffer = fs.readFileSync(ks2File.path);
        const ks2Result = parseKS2(ks2Buffer, ks2File.originalname);
        
        if (!ks2Result.success) {
            throw new Error(`Ошибка парсинга КС-2: ${ks2Result.error}`);
        }

        console.log(`✅ Смета: ${estimateResult.items.length} позиций`);
        console.log(`✅ КС-2: ${ks2Result.items.length} позиций`);

        // Собираем данные из сметы
        const estimateMap = new Map();
        for (const item of estimateResult.items) {
            const code = item.extractedCode || item.code;
            if (code && code !== 'цена поставщика' && code !== 'null') {
                if (estimateMap.has(code)) {
                    const existing = estimateMap.get(code);
                    existing.volume += item.volume || 0;
                    existing.total += item.totalAmount || 0;
                } else {
                    estimateMap.set(code, {
                        name: item.name,
                        volume: item.volume || 0,
                        volumeFormatted: item.formattedVolume || '',
                        total: item.totalAmount || 0
                    });
                }
            }
        }

        // Собираем данные из КС-2
        const ks2Map = new Map();
        for (const item of ks2Result.items) {
            const code = item.extracted_code || item.code;
            if (code && code !== 'цена поставщика' && code !== 'null') {
                if (ks2Map.has(code)) {
                    const existing = ks2Map.get(code);
                    existing.volume += item.volume || 0;
                    existing.total += item.total || 0;
                } else {
                    ks2Map.set(code, {
                        name: item.name,
                        volume: item.volume || 0,
                        volumeFormatted: item.volume ? `${item.volume} ${item.unit || ''}` : '',
                        total: item.total || 0
                    });
                }
            }
        }

        // Объединяем все уникальные коды
        const allCodes = new Set([...estimateMap.keys(), ...ks2Map.keys()]);
        
        const comparison = [];
        let matchCount = 0, onlyInEstimate = 0, onlyInKs2 = 0;
        let volumeMatchCount = 0, volumeMismatchCount = 0;
        let overEstimateCount = 0, underEstimateCount = 0, exactMatchCount = 0;
        let totalEstimateSum = 0, totalKs2Sum = 0;

        for (const code of allCodes) {
            const estimate = estimateMap.get(code);
            const ks2 = ks2Map.get(code);
            
            let status = '';
            let volumeStatus = '';
            let volumeDiff = null;
            let volumeDiffPercent = null;
            let sumStatus = '';
            let sumMessage = '';
            
            if (estimate && ks2) {
                status = 'match';
                matchCount++;
                
                // Сравнение объёмов
                const estVol = estimate.volume || 0;
                const ks2Vol = ks2.volume || 0;
                totalEstimateSum += estimate.total;
                totalKs2Sum += ks2.total;
                
                if (estVol === 0 && ks2Vol === 0) {
                    volumeStatus = 'no_volume';
                } else if (Math.abs(estVol - ks2Vol) < 0.01) {
                    volumeStatus = 'exact';
                    volumeMatchCount++;
                } else {
                    volumeStatus = 'mismatch';
                    volumeMismatchCount++;
                    volumeDiff = ks2Vol - estVol;
                    volumeDiffPercent = estVol > 0 ? (volumeDiff / estVol) * 100 : 0;
                }
                
                // Сравнение сумм
                const estTotal = estimate.total || 0;
                const ks2Total = ks2.total || 0;
                
                if (Math.abs(ks2Total - estTotal) < 0.01) {
                    exactMatchCount++;
                    sumStatus = 'exact';
                    sumMessage = '✅ Сумма совпадает';
                } else if (ks2Total > estTotal) {
                    overEstimateCount++;
                    const diff = ks2Total - estTotal;
                    const percent = (diff / estTotal) * 100;
                    sumStatus = 'over';
                    sumMessage = `🔴 ПРЕВЫШЕНИЕ: +${diff.toFixed(2)} ₽ (${percent.toFixed(1)}%)`;
                } else {
                    const diff = estTotal - ks2Total;
                    const percent = (diff / estTotal) * 100;
                    if (percent >= 10) {
                        underEstimateCount++;
                        sumStatus = 'under_warning';
                        sumMessage = `⚠️ Смета дороже на ${diff.toFixed(2)} ₽ (${percent.toFixed(1)}%)`;
                    } else {
                        sumStatus = 'under_ok';
                        sumMessage = `ℹ️ Смета дороже на ${diff.toFixed(2)} ₽ (${percent.toFixed(1)}%)`;
                    }
                }
            } else if (estimate && !ks2) {
                status = 'only_in_estimate';
                onlyInEstimate++;
                volumeStatus = 'missing_in_ks2';
                sumStatus = 'missing';
                sumMessage = '❌ Нет данных в КС-2';
                totalEstimateSum += estimate.total;
            } else {
                status = 'only_in_ks2';
                onlyInKs2++;
                volumeStatus = 'extra_in_ks2';
                sumStatus = 'extra';
                sumMessage = `🔴 ЛИШНЯЯ СУММА: ${ks2.total.toLocaleString('ru-RU')} ₽`;
                totalKs2Sum += ks2.total;
            }
            
            comparison.push({
                code: code,
                name: estimate?.name || ks2?.name || '',
                estimate_volume: estimate?.volume || 0,
                estimate_volume_formatted: estimate?.volumeFormatted || '',
                estimate_total: estimate?.total || null,
                ks2_volume: ks2?.volume || 0,
                ks2_volume_formatted: ks2?.volumeFormatted || '',
                ks2_total: ks2?.total || null,
                status: status,
                volume_status: volumeStatus,
                volume_diff: volumeDiff || 0,
                volume_diff_percent: volumeDiffPercent || 0,
                sum_status: sumStatus,
                sum_message: sumMessage
            });
        }

        // Общая статистика по суммам
        const totalDiff = totalKs2Sum - totalEstimateSum;
        const totalDiffPercent = totalEstimateSum > 0 ? (totalDiff / totalEstimateSum) * 100 : 0;
        
        let totalStatus = '';
        let totalStatusMessage = '';
        if (Math.abs(totalDiff) < 0.01) {
            totalStatus = 'exact';
            totalStatusMessage = '✅ Общая сумма совпадает';
        } else if (totalDiff > 0) {
            totalStatus = 'over';
            totalStatusMessage = `🔴 ПРЕВЫШЕНИЕ ОБЩЕЙ СУММЫ: +${totalDiff.toFixed(2)} ₽ (${totalDiffPercent.toFixed(1)}%)`;
        } else {
            const absDiff = Math.abs(totalDiff);
            if (totalDiffPercent <= -10) {
                totalStatus = 'under_warning';
                totalStatusMessage = `⚠️ СМЕТА ДОРОЖЕ НА 10%+: ${absDiff.toFixed(2)} ₽ (${Math.abs(totalDiffPercent).toFixed(1)}%)`;
            } else {
                totalStatus = 'under_ok';
                totalStatusMessage = `ℹ️ Смета дороже на ${absDiff.toFixed(2)} ₽ (${Math.abs(totalDiffPercent).toFixed(1)}%)`;
            }
        }

        // Сортировка
        comparison.sort((a, b) => {
            const order = { 'only_in_estimate': 1, 'only_in_ks2': 2, 'match': 3 };
            return order[a.status] - order[b.status];
        });

        console.log(`\n📊 РЕЗУЛЬТАТЫ:`);
        console.log(`   Совпадают по шифрам: ${matchCount}`);
        console.log(`   Только в смете: ${onlyInEstimate}`);
        console.log(`   Только в КС-2: ${onlyInKs2}`);
        console.log(`   Объёмы совпадают: ${volumeMatchCount}`);
        console.log(`   Объёмы не совпадают: ${volumeMismatchCount}`);
        console.log(`   Суммы: превышений ${overEstimateCount}, занижений ${underEstimateCount}`);
        console.log(`   Общая сумма сметы: ${totalEstimateSum.toLocaleString('ru-RU')} ₽`);
        console.log(`   Общая сумма КС-2: ${totalKs2Sum.toLocaleString('ru-RU')} ₽`);
        console.log(`   ${totalStatusMessage}`);
        console.log(`${'='.repeat(60)}\n`);

        // Удаляем временные файлы
        try {
            if (fs.existsSync(estimateFile.path)) fs.unlinkSync(estimateFile.path);
            if (fs.existsSync(ks2File.path)) fs.unlinkSync(ks2File.path);
        } catch(e) {}

        res.json({
            success: true,
            estimate_name: estimateFile.originalname,
            ks2_name: ks2File.originalname,
            stats: {
                total_codes: allCodes.size,
                match_count: matchCount,
                only_in_estimate: onlyInEstimate,
                only_in_ks2: onlyInKs2,
                volume_match_count: volumeMatchCount,
                volume_mismatch_count: volumeMismatchCount,
                over_estimate_count: overEstimateCount,
                under_estimate_count: underEstimateCount,
                exact_match_count: exactMatchCount,
                total_estimate_sum: totalEstimateSum,
                total_ks2_sum: totalKs2Sum,
                total_diff: totalDiff,
                total_diff_percent: totalDiffPercent,
                total_status: totalStatus,
                total_status_message: totalStatusMessage
            },
            comparison: comparison
        });

    } catch (err) {
        console.error('❌ Ошибка сравнения:', err);
        
        try {
            if (req.files?.estimateFile?.[0] && fs.existsSync(req.files.estimateFile[0].path)) {
                fs.unlinkSync(req.files.estimateFile[0].path);
            }
            if (req.files?.ks2File?.[0] && fs.existsSync(req.files.ks2File[0].path)) {
                fs.unlinkSync(req.files.ks2File[0].path);
            }
        } catch(e) {}
        
        res.status(500).json({ success: false, error: err.message });
    }
});
// routes/compare.js - добавить новый маршрут

/**
 * POST /api/compare-files-multiple
 * Сравнение сметы с несколькими файлами КС-2
 */
// routes/compare.js - обновлённый маршрут POST /compare-files-multiple

/**
 * POST /api/compare-files-multiple
 * Сравнение сметы с несколькими файлами КС-2 (с номерами позиций)
 */
router.post('/compare-files-multiple', upload.fields([
    { name: 'estimateFile', maxCount: 1 },
    { name: 'ks2Files', maxCount: 20 }
]), async (req, res) => {
    try {
        const estimateFile = req.files['estimateFile']?.[0];
        const ks2Files = req.files['ks2Files'] || [];

        if (!estimateFile || ks2Files.length === 0) {
            return res.status(400).json({ success: false, error: 'Загрузите смету и хотя бы один файл КС-2' });
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 СРАВНЕНИЕ СМЕТЫ С ${ks2Files.length} ФАЙЛАМИ КС-2`);
        console.log(`   Смета: ${estimateFile.originalname}`);
        ks2Files.forEach((f, i) => console.log(`   КС-2 ${i+1}: ${f.originalname}`));
        console.log(`${'='.repeat(60)}`);

        // Парсим смету (с номерами позиций)
        const estimateBuffer = fs.readFileSync(estimateFile.path);
        const estimateResult = parseEstimate(estimateBuffer, estimateFile.originalname);
        
        if (!estimateResult.success) {
            throw new Error(`Ошибка парсинга сметы: ${estimateResult.error}`);
        }

        // Собираем данные из сметы с номерами позиций
        const estimateMap = new Map();
        for (const item of estimateResult.items) {
            const code = item.extractedCode || item.code;
            if (code && code !== 'цена поставщика' && code !== 'null') {
                if (estimateMap.has(code)) {
                    const existing = estimateMap.get(code);
                    existing.volume += item.volume || 0;
                    existing.total += item.totalAmount || 0;
                    existing.positionNumbers.push(item.positionNumber);
                } else {
                    estimateMap.set(code, {
                        name: item.name,
                        volume: item.volume || 0,
                        volumeFormatted: item.formattedVolume || '',
                        total: item.totalAmount || 0,
                        positionNumbers: [item.positionNumber]
                    });
                }
            }
        }

        // Парсим все КС-2 (с номерами позиций)
        const ks2Map = new Map();
        const ks2Names = [];

        for (const ks2File of ks2Files) {
            const ks2Buffer = fs.readFileSync(ks2File.path);
            const ks2Result = parseKS2(ks2Buffer, ks2File.originalname);
            
            if (ks2Result.success) {
                ks2Names.push(ks2File.originalname);
                console.log(`✅ ${ks2File.originalname}: ${ks2Result.items.length} позиций`);
                
                for (const item of ks2Result.items) {
                    const code = item.extracted_code || item.code;
                    if (code && code !== 'цена поставщика' && code !== 'null') {
                        if (ks2Map.has(code)) {
                            const existing = ks2Map.get(code);
                            existing.volume += item.volume || 0;
                            existing.total += item.total || 0;
                            existing.files.push(ks2File.originalname);
                            existing.positionNumbers.push(item.ks2_position_number || item.position);
                        } else {
                            ks2Map.set(code, {
                                name: item.name,
                                volume: item.volume || 0,
                                volumeFormatted: item.volume ? `${item.volume} ${item.unit || ''}` : '',
                                total: item.total || 0,
                                files: [ks2File.originalname],
                                positionNumbers: [item.ks2_position_number || item.position]
                            });
                        }
                    }
                }
            } else {
                console.log(`❌ Ошибка парсинга ${ks2File.originalname}: ${ks2Result.error}`);
            }
        }

        // Объединяем все уникальные коды
        const allCodes = new Set([...estimateMap.keys(), ...ks2Map.keys()]);
        
        const comparison = [];
        let matchCount = 0, onlyInEstimate = 0, onlyInKs2 = 0;
        let volumeMatchCount = 0, volumeMismatchCount = 0;
        let overEstimateCount = 0, underEstimateCount = 0, exactMatchCount = 0;
        let totalEstimateSum = 0, totalKs2Sum = 0;

        for (const code of allCodes) {
            const estimate = estimateMap.get(code);
            const ks2 = ks2Map.get(code);
            
            let status = '';
            let volumeStatus = '';
            let volumeDiff = null;
            let volumeDiffPercent = null;
            let sumStatus = '';
            let sumMessage = '';
            
            if (estimate && ks2) {
                status = 'match';
                matchCount++;
                
                const estVol = estimate.volume || 0;
                const ks2Vol = ks2.volume || 0;
                totalEstimateSum += estimate.total;
                totalKs2Sum += ks2.total;
                
                if (estVol === 0 && ks2Vol === 0) {
                    volumeStatus = 'no_volume';
                } else if (Math.abs(estVol - ks2Vol) < 0.01) {
                    volumeStatus = 'exact';
                    volumeMatchCount++;
                } else {
                    volumeStatus = 'mismatch';
                    volumeMismatchCount++;
                    volumeDiff = ks2Vol - estVol;
                    volumeDiffPercent = estVol > 0 ? (volumeDiff / estVol) * 100 : 0;
                }
                
                const estTotal = estimate.total || 0;
                const ks2Total = ks2.total || 0;
                
                if (Math.abs(ks2Total - estTotal) < 0.01) {
                    exactMatchCount++;
                    sumStatus = 'exact';
                    sumMessage = '✅ Сумма совпадает';
                } else if (ks2Total > estTotal) {
                    overEstimateCount++;
                    const diff = ks2Total - estTotal;
                    const percent = (diff / estTotal) * 100;
                    sumStatus = 'over';
                    sumMessage = `🔴 ПРЕВЫШЕНИЕ: +${diff.toFixed(2)} ₽ (${percent.toFixed(1)}%)`;
                } else {
                    const diff = estTotal - ks2Total;
                    const percent = (diff / estTotal) * 100;
                    if (percent >= 10) {
                        underEstimateCount++;
                        sumStatus = 'under_warning';
                        sumMessage = `⚠️ Смета дороже на ${diff.toFixed(2)} ₽ (${percent.toFixed(1)}%)`;
                    } else {
                        sumStatus = 'under_ok';
                        sumMessage = `ℹ️ Смета дороже на ${diff.toFixed(2)} ₽ (${percent.toFixed(1)}%)`;
                    }
                }
            } else if (estimate && !ks2) {
                status = 'only_in_estimate';
                onlyInEstimate++;
                volumeStatus = 'missing_in_ks2';
                sumStatus = 'missing';
                sumMessage = '❌ Нет данных в КС-2';
                totalEstimateSum += estimate.total;
            } else {
                status = 'only_in_ks2';
                onlyInKs2++;
                volumeStatus = 'extra_in_ks2';
                sumStatus = 'extra';
                sumMessage = `🔴 ЛИШНЯЯ СУММА: ${ks2.total.toLocaleString('ru-RU')} ₽`;
                totalKs2Sum += ks2.total;
            }
            
            comparison.push({
                code: code,
                name: estimate?.name || ks2?.name || '',
                // Номера позиций
                estimate_position_numbers: estimate?.positionNumbers || [],
                ks2_position_numbers: ks2?.positionNumbers || [],
                estimate_position_display: estimate?.positionNumbers ? estimate.positionNumbers.join(', ') : '—',
                ks2_position_display: ks2?.positionNumbers ? ks2.positionNumbers.join(', ') : '—',
                // Объёмы
                estimate_volume: estimate?.volume || 0,
                estimate_volume_formatted: estimate?.volumeFormatted || '',
                ks2_volume: ks2?.volume || 0,
                ks2_volume_formatted: ks2?.volumeFormatted || '',
                // Суммы
                estimate_total: estimate?.total || null,
                ks2_total: ks2?.total || null,
                ks2_files: ks2?.files || [],
                // Статусы
                status: status,
                volume_status: volumeStatus,
                volume_diff: volumeDiff || 0,
                volume_diff_percent: volumeDiffPercent || 0,
                sum_status: sumStatus,
                sum_message: sumMessage
            });
        }

        // Общая статистика по суммам
        const totalDiff = totalKs2Sum - totalEstimateSum;
        const totalDiffPercent = totalEstimateSum > 0 ? (totalDiff / totalEstimateSum) * 100 : 0;
        
        let totalStatus = '';
        let totalStatusMessage = '';
        if (Math.abs(totalDiff) < 0.01) {
            totalStatus = 'exact';
            totalStatusMessage = '✅ Общая сумма совпадает';
        } else if (totalDiff > 0) {
            totalStatus = 'over';
            totalStatusMessage = `🔴 ПРЕВЫШЕНИЕ ОБЩЕЙ СУММЫ: +${totalDiff.toFixed(2)} ₽ (${totalDiffPercent.toFixed(1)}%)`;
        } else {
            const absDiff = Math.abs(totalDiff);
            if (totalDiffPercent <= -10) {
                totalStatus = 'under_warning';
                totalStatusMessage = `⚠️ СМЕТА ДОРОЖЕ НА 10%+: ${absDiff.toFixed(2)} ₽ (${Math.abs(totalDiffPercent).toFixed(1)}%)`;
            } else {
                totalStatus = 'under_ok';
                totalStatusMessage = `ℹ️ Смета дороже на ${absDiff.toFixed(2)} ₽ (${Math.abs(totalDiffPercent).toFixed(1)}%)`;
            }
        }

        // Сортировка
        comparison.sort((a, b) => {
            const order = { 'only_in_estimate': 1, 'only_in_ks2': 2, 'match': 3 };
            return order[a.status] - order[b.status];
        });

        console.log(`\n📊 РЕЗУЛЬТАТЫ:`);
        console.log(`   Совпадают по шифрам: ${matchCount}`);
        console.log(`   Только в смете: ${onlyInEstimate}`);
        console.log(`   Только в КС-2: ${onlyInKs2}`);
        console.log(`   Общая сумма сметы: ${totalEstimateSum.toLocaleString('ru-RU')} ₽`);
        console.log(`   Общая сумма КС-2: ${totalKs2Sum.toLocaleString('ru-RU')} ₽`);
        console.log(`   ${totalStatusMessage}`);
        console.log(`${'='.repeat(60)}\n`);

        // Удаляем временные файлы
        try {
            if (fs.existsSync(estimateFile.path)) fs.unlinkSync(estimateFile.path);
            for (const f of ks2Files) {
                if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
            }
        } catch(e) {}

        res.json({
            success: true,
            estimate_name: estimateFile.originalname,
            ks2_count: ks2Files.length,
            ks2_names: ks2Names,
            stats: {
                total_codes: allCodes.size,
                match_count: matchCount,
                only_in_estimate: onlyInEstimate,
                only_in_ks2: onlyInKs2,
                volume_match_count: volumeMatchCount,
                volume_mismatch_count: volumeMismatchCount,
                over_estimate_count: overEstimateCount,
                under_estimate_count: underEstimateCount,
                exact_match_count: exactMatchCount,
                total_estimate_sum: totalEstimateSum,
                total_ks2_sum: totalKs2Sum,
                total_diff: totalDiff,
                total_diff_percent: totalDiffPercent,
                total_status: totalStatus,
                total_status_message: totalStatusMessage
            },
            comparison: comparison
        });

    } catch (err) {
        console.error('❌ Ошибка сравнения:', err);
        
        try {
            if (req.files?.estimateFile?.[0] && fs.existsSync(req.files.estimateFile[0].path)) {
                fs.unlinkSync(req.files.estimateFile[0].path);
            }
            if (req.files?.ks2Files) {
                for (const f of req.files.ks2Files) {
                    if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
                }
            }
        } catch(e) {}
        
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/compare/export-excel
 * Экспорт результатов сравнения в Excel
 */
router.post('/compare/export-excel', async (req, res) => {
    try {
        const { items } = req.body;
        
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Нет данных для экспорта' });
        }
        
        const XLSX = require('xlsx');
        
        const excelData = items.map((item, idx) => {
            let statusText = '';
            if (item.status === 'match') statusText = 'Совпадает';
            else if (item.status === 'only_in_estimate') statusText = 'Только в смете';
            else if (item.status === 'only_in_ks2') statusText = 'Только в КС-2';
            else statusText = '—';
            
            return {
                '№': idx + 1,
                'Шифр': item.code,
                'Наименование': item.name || '—',
                'Смета (объём)': item.estimate_volume_formatted || '—',
                'КС-2 (объём)': item.ks2_volume_formatted || '—',
                'Смета, ₽': item.estimate_total ? Number(item.estimate_total).toLocaleString('ru-RU') : '—',
                'КС-2, ₽': item.ks2_total ? Number(item.ks2_total).toLocaleString('ru-RU') : '—',
                'Анализ суммы': item.sum_message || '—',
                'Статус': statusText
            };
        });
        
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        worksheet['!cols'] = [
            { wch: 6 }, { wch: 25 }, { wch: 40 },
            { wch: 15 }, { wch: 15 }, { wch: 15 },
            { wch: 15 }, { wch: 30 }, { wch: 18 }
        ];
        
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Сравнение сметы и КС-2');
        
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="comparison_${Date.now()}.xlsx"`);
        res.send(buffer);
        
    } catch (err) {
        console.error('Ошибка экспорта:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;