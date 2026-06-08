// routes/reports.js
// Маршруты для генерации отчётов

const express = require('express');
const logsDb = require('../../shareds/logs-db');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatNumber(num) {
    if (num === null || num === undefined) return '—';
    return Number(num).toLocaleString('ru-RU');
}

function formatDate(dateString) {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}

function shouldShowInReport(code) {
    const status = (code.status || '').toLowerCase();
    const isRestoration = code.is_restoration === 1 || code.isRestoration === true;
    if (isRestoration) return true;
    if (status === 'обратите внимание') return true;
    if (status === 'нельзя применять') return true;
    if (code.isText) return true;
    if (code.coefficientMatch === false) return true;
    return false;
}

/**
 * GET /api/report/:sessionId
 * Получение данных для отчёта в JSON
 */
router.get('/report/:sessionId', optionalAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await logsDb.getSessionDetails(sessionId);
        
        if (!session) {
            return res.status(404).json({ error: 'Сессия не найдена' });
        }
        
        const filteredCodes = (session.codes || []).filter(shouldShowInReport);
        
        res.json({
            success: true,
            session: {
                id: session.session_id,
                fileName: session.filename,
                estimateName: session.estimate_name,
                user: session.user_name,
                institution: session.user_institution,
                date: session.created_at,
                totalCodes: session.total_codes,
                foundCodes: session.found_codes,
                notFoundCodes: session.not_found_codes,
                totalAmount: session.total_amount,
                status: session.status,
                isRevised: session.is_revised,
                stats: {
                    exactMatches: session.exact_matches,
                    tableMatches: session.table_matches,
                    sectionMatches: session.section_matches,
                    collectionMatches: session.collection_matches,
                    chapterMatches: session.chapter_matches,
                    relationMatches: session.relation_matches,
                    parentMatches: session.parent_matches,
                    textLines: session.text_lines,
                    restorationCodes: session.restoration_codes,
                    hasCoefficientCount: session.has_coefficient_count,
                    coefficientMatches: session.coefficient_matches,
                    coefficientMismatches: session.coefficient_mismatches
                }
            },
            codes: filteredCodes
        });
    } catch (err) {
        
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/report/:sessionId/html
 * Генерация HTML отчёта
 */
router.get('/report/:sessionId/html', optionalAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await logsDb.getSessionDetails(sessionId);
        
        if (!session) {
            return res.status(404).json({ error: 'Сессия не найдена' });
        }
        
        const allCodes = session.codes || [];
        const problemCodes = allCodes.filter(shouldShowInReport);
        
        const warningCount = problemCodes.filter(c => 
            c.status === 'Обратите внимание' || c.coefficientMatch === false
        ).length;
        const notAllowedCount = problemCodes.filter(c => 
            c.status === 'Нельзя применять' || c.is_restoration === 1
        ).length;
        
        let codesHtml = '';
        for (const code of problemCodes) {
            let coeffDisplay = '—';
            if (code.has_coefficient && code.actual_coefficient) {
                coeffDisplay = code.coefficient_match === 1 
                    ? `<span class="coeff-good">${formatNumber(code.actual_coefficient)}</span>`
                    : `<span class="coeff-error">${formatNumber(code.actual_coefficient)}</span>`;
            }
            
            let statusClass = '';
            if (code.is_restoration === 1 || code.status === 'Нельзя применять') {
                statusClass = 'status-danger';
            } else if (code.status === 'Обратите внимание' || code.coefficientMatch === false) {
                statusClass = 'status-warning';
            } else if (code.isText) {
                statusClass = 'status-info';
            } else {
                statusClass = 'status-neutral';
            }
            
            codesHtml += `
                <tr>
                    <td class="position-cell"><span class="position-number">${escapeHtml(code.position_number || '-')}</span></td>
                    <td class="code-cell">${escapeHtml(code.extracted_code || code.code)}</td>
                    <td class="status-cell"><span class="status-badge ${statusClass}">${escapeHtml(code.status || '—')}</span></td>
                    <td class="coeff-cell">${coeffDisplay}</td>
                    <td class="description-cell">${escapeHtml(code.description || '—')}</td>
                </tr>
            `;
        }
        
        const html = `<!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>Отчёт анализа сметы</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', sans-serif; background: #f5f7fb; padding: 40px; }
                .report-container { max-width: 1400px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 25px -12px rgba(0,0,0,0.1); }
                .report-header { background: linear-gradient(135deg, #1e3c5c 0%, #2c5282 100%); color: white; padding: 32px; }
                .report-header h1 { font-size: 28px; margin-bottom: 8px; }
                .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; padding: 32px; background: #f8fafc; }
                .stat-card { text-align: center; padding: 24px; background: white; border-radius: 20px; }
                .stat-value { font-size: 36px; font-weight: 800; color: #2c5282; }
                .stat-label { font-size: 13px; color: #64748b; margin-top: 8px; }
                .report-section { padding: 0 32px 32px; }
                .section-title { font-size: 20px; font-weight: 700; color: #1e3c5c; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0; }
                .codes-table { width: 100%; border-collapse: collapse; font-size: 13px; }
                .codes-table th { background: #f1f5f9; padding: 14px 12px; text-align: left; font-weight: 700; color: #475569; border-bottom: 2px solid #e2e8f0; }
                .codes-table td { padding: 14px 12px; border-bottom: 1px solid #eef2f6; vertical-align: top; }
                .code-cell { font-family: 'Courier New', monospace; font-weight: 600; color: #2c5282; }
                .position-number { font-family: monospace; background: #e8f0fe; display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; }
                .status-badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; }
                .status-warning { background: #fed7aa; color: #92400e; }
                .status-danger { background: #fee2e2; color: #991b1b; }
                .status-info { background: #dbeafe; color: #1e40af; }
                .status-neutral { background: #f1f5f9; color: #475569; }
                .coeff-good { background: #d1fae5; color: #065f46; padding: 4px 12px; border-radius: 20px; display: inline-block; }
                .coeff-error { background: #fee2e2; color: #991b1b; padding: 4px 12px; border-radius: 20px; display: inline-block; }
                .description-cell { max-width: 500px; font-size: 12px; color: #4a5568; line-height: 1.5; }
                .print-btn { position: fixed; bottom: 24px; right: 24px; background: #2c5282; color: white; border: none; padding: 12px 24px; border-radius: 40px; cursor: pointer; font-size: 14px; font-weight: 600; }
                @media print { body { background: white; padding: 0; } .print-btn { display: none; } }
            </style>
        </head>
        <body>
            <div class="report-container">
                <div class="report-header">
                    <h1>📊 Отчёт анализа сметной документации</h1>
                    <p>Смета: ${escapeHtml(session.estimate_name || '—')}</p>
                    <p>Дата анализа: ${formatDate(session.created_at)}</p>
                    <p>Пользователь: ${escapeHtml(session.user_name || '—')}</p>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${warningCount}</div>
                        <div class="stat-label">⚠️ Требуют внимания</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${notAllowedCount}</div>
                        <div class="stat-label">❌ Нельзя применять</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${session.total_codes || 0}</div>
                        <div class="stat-label">📊 Всего позиций</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${formatNumber(session.total_amount)} ₽</div>
                        <div class="stat-label">💰 Итоговая сумма</div>
                    </div>
                </div>
                
                <div class="report-section">
                    <div class="section-title">📋 Проблемные позиции</div>
                    ${problemCodes.length > 0 ? `
                    <table class="codes-table">
                        <thead>
                            <tr><th>№ п/п</th><th>Код</th><th>Статус</th><th>Коэф.</th><th>Описание</th></tr>
                        </thead>
                        <tbody>${codesHtml}</tbody>
                    </table>
                    ` : '<p style="text-align: center; padding: 60px; color: #10b981;">✅ Проблемные позиции не найдены</p>'}
                </div>
            </div>
            <button onclick="window.print()" class="print-btn">🖨️ Печать / PDF</button>
        </body>
        </html>`;
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (err) {
        
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/report/:sessionId/excel
 * Генерация Excel отчёта
 */
router.post('/report/:sessionId/excel', optionalAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await logsDb.getSessionDetails(sessionId);
        
        if (!session) {
            return res.status(404).json({ error: 'Сессия не найдена' });
        }
        
        const XLSX = require('xlsx');
        const workbook = XLSX.utils.book_new();
        
        const codes = (session.codes || [])
            .filter(c => shouldShowInReport(c))
            .map(c => ({
                position: c.position_number || '-',
                code: c.extracted_code || c.code,
                status: c.status || '—',
                description: (c.description || '—').substring(0, 500),
                expectedCoefficient: c.expected_coefficient || '—',
                actualCoefficient: c.actual_coefficient || '—'
            }));
        
        const rows = [
            ['№ п/п', 'Код', 'Статус', 'Описание', 'Коэф. БД', 'Коэф. факт']
        ];
        
        codes.forEach((code, idx) => {
            rows.push([
                code.position,
                code.code,
                code.status,
                code.description,
                code.expectedCoefficient,
                code.actualCoefficient
            ]);
        });
        
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        sheet['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 20 }, { wch: 50 }, { wch: 12 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(workbook, sheet, 'Проблемные коды');
        
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="report_${sessionId}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;