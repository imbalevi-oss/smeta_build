// routes/executive-dashboard.js
// Маршруты для Executive Dashboard

const express = require('express');
const router = express.Router();
const executiveDb = require('../shareds/executive-db');
const logger = require('../shareds/logger');

// ==================== MIDDLEWARE ====================

// Проверка авторизации администратора
function checkAdminAuth(req, res, next) {
    // TODO: реализовать проверку JWT токена
    // Пока просто проверяем заголовок
    const token = req.headers.authorization;
    if (!token && process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    next();
}

// ==================== API ENDPOINTS ====================

/**
 * GET /api/executive/stats
 * Общая статистика для KPI карточек
 */
router.get('/stats', checkAdminAuth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        
        const stats = await executiveDb.getExecutiveStats(days);
        
        res.json({
            success: true,
            stats,
            period: days
        });
    } catch (err) {
        console.error('Error getting executive stats:', err);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

/**
 * GET /api/executive/top-users
 * Топ пользователей с расширенной статистикой
 */
router.get('/top-users', checkAdminAuth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const limit = parseInt(req.query.limit) || 10;
        const sortBy = req.query.sortBy || 'rating';
        
        const users = await executiveDb.getTopUsersWithStats(days, limit, sortBy);
        
        res.json({
            success: true,
            users,
            period: days,
            sortBy
        });
    } catch (err) {
        console.error('Error getting top users:', err);
        res.status(500).json({ error: 'Ошибка получения списка пользователей' });
    }
});

/**
 * GET /api/executive/top-errors
 * Топ проблемных кодов с группировкой по проектам
 */
router.get('/top-errors', checkAdminAuth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status || 'all';
        
        const errors = await executiveDb.getTopErrorsWithProjects(days, limit, status);
        
        res.json({
            success: true,
            errors,
            period: days,
            status,
            total: errors.length
        });
    } catch (err) {
        console.error('Error getting top errors:', err);
        res.status(500).json({ error: 'Ошибка получения списка ошибок' });
    }
});

/**
 * GET /api/executive/user-projects/:userId
 * Проекты конкретного пользователя с проблемами
 */
router.get('/user-projects/:userId', checkAdminAuth, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const days = parseInt(req.query.days) || 90;
        
        if (isNaN(userId)) {
            return res.status(400).json({ error: 'Неверный ID пользователя' });
        }
        
        const projects = await executiveDb.getUserProjectsWithProblems(userId, days);
        
        res.json({
            success: true,
            projects,
            userId,
            period: days
        });
    } catch (err) {
        console.error('Error getting user projects:', err);
        res.status(500).json({ error: 'Ошибка получения проектов пользователя' });
    }
});

/**
 * GET /api/executive/error-details/:errorCode
 * Детали конкретной ошибки (код, проекты, сметы)
 */
router.get('/error-details/:errorCode', checkAdminAuth, async (req, res) => {
    try {
        const errorCode = decodeURIComponent(req.params.errorCode);
        
        const details = await executiveDb.getErrorDetails(errorCode);
        
        res.json({
            success: true,
            ...details
        });
    } catch (err) {
        console.error('Error getting error details:', err);
        res.status(500).json({ error: 'Ошибка получения деталей ошибки' });
    }
});

/**
 * GET /api/executive/error-tree
 * Древо проблем по иерархии кодов
 */
router.get('/error-tree', checkAdminAuth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        
        const tree = await executiveDb.getErrorHierarchyTree(days);
        
        res.json({
            success: true,
            tree,
            period: days
        });
    } catch (err) {
        console.error('Error getting error tree:', err);
        res.status(500).json({ error: 'Ошибка получения дерева ошибок' });
    }
});

/**
 * GET /api/executive/daily-digest
 * Ежедневная сводка для руководителя
 */
router.get('/daily-digest', checkAdminAuth, async (req, res) => {
    try {
        const digest = await executiveDb.getDailyExecutiveDigest();
        
        // Логируем запрос дайджеста
        await logger.logAdminAction(
            req.headers['x-user'] || 'admin',
            'view_daily_digest',
            'executive',
            null,
            { date: digest.date },
            req.ip
        );
        
        res.json({
            success: true,
            digest
        });
    } catch (err) {
        console.error('Error getting daily digest:', err);
        res.status(500).json({ error: 'Ошибка получения сводки' });
    }
});

/**
 * POST /api/executive/send-digest
 * Отправить ежедневную сводку (email/telegram)
 */
router.post('/send-digest', checkAdminAuth, async (req, res) => {
    try {
        const { email, telegramBotToken, telegramChatId } = req.body;
        const digest = await executiveDb.getDailyExecutiveDigest();
        
        // Формируем текст сообщения
        const message = `
📊 ЕЖЕДНЕВНАЯ СВОДКА
📅 ${new Date(digest.date).toLocaleDateString('ru-RU')}

👥 Активных сметчиков: ${digest.stats?.active_users || 0}
📁 Сессий: ${digest.stats?.sessions_count || 0}
📝 Кодов обработано: ${digest.stats?.codes_processed || 0}
🎯 Точность: ${digest.stats?.avg_accuracy || 0}%
💰 Сумма смет: ${(digest.stats?.total_amount || 0).toLocaleString()} ₽

⚠️ ПРОБЛЕМЫ:
├─ Ошибок коэффициентов: ${digest.stats?.coeff_errors || 0}
├─ Реставрационных кодов: ${digest.stats?.restoration_errors || 0}
└─ Не найденных кодов: ${digest.stats?.not_found_errors || 0}

🔴 КРИТИЧЕСКИЕ ОШИБКИ:
${digest.criticalAlerts?.map(e => `├─ ${e.code} (${e.occurrence_count} раз)`).join('\n') || '└─ Нет'}

🏆 ТОП СМЕТЧИКОВ:
${digest.topUsers?.map((u, i) => `${i+1}. ${u.user_name} — ${u.avg_accuracy}%`).join('\n') || '└─ Нет данных'}
        `;
        
        // Отправка email (если указан)
        let emailSent = false;
        if (email) {
            // TODO: реализовать отправку email через nodemailer
            emailSent = true;
        }
        
        // Отправка Telegram (если указаны токен и чат)
        let telegramSent = false;
        if (telegramBotToken && telegramChatId) {
            // TODO: реализовать отправку через Telegram Bot API
            telegramSent = true;
        }
        
        await logger.logAdminAction(
            req.headers['x-user'] || 'admin',
            'send_daily_digest',
            'executive',
            null,
            { email, telegramSent, emailSent },
            req.ip
        );
        
        res.json({
            success: true,
            message: 'Сводка отправлена',
            details: { emailSent, telegramSent, messagePreview: message.substring(0, 200) + '...' }
        });
    } catch (err) {
        console.error('Error sending digest:', err);
        res.status(500).json({ error: 'Ошибка отправки сводки' });
    }
});

/**
 * GET /api/executive/export
 * Экспорт дашборда в CSV
 */
router.get('/export', checkAdminAuth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const format = req.query.format || 'csv';
        
        const [stats, topUsers, topErrors] = await Promise.all([
            executiveDb.getExecutiveStats(days),
            executiveDb.getTopUsersWithStats(days, 50, 'rating'),
            executiveDb.getTopErrorsWithProjects(days, 50, 'all')
        ]);
        
        if (format === 'csv') {
            // Формируем CSV
            const rows = [];
            
            // Заголовок отчёта
            rows.push(['СМЕТНАЯ АДМИН-ПАНЕЛЬ - ОТЧЁТ РУКОВОДИТЕЛЯ']);
            rows.push(['Дата формирования:', new Date().toLocaleString('ru-RU')]);
            rows.push(['Период:', `${days} дней`]);
            rows.push([]);
            
            // Общая статистика
            rows.push(['ОБЩАЯ СТАТИСТИКА']);
            rows.push(['Показатель', 'Значение']);
            rows.push(['Активных сметчиков', stats?.active_users || 0]);
            rows.push(['Всего сессий', stats?.total_sessions || 0]);
            rows.push(['Средняя точность', `${stats?.avg_accuracy || 0}%`]);
            rows.push(['Общая сумма смет', `${(stats?.total_amount || 0).toLocaleString()} ₽`]);
            rows.push(['Ошибок коэффициентов', stats?.coefficient_errors || 0]);
            rows.push(['Реставрационных кодов', stats?.restoration_errors || 0]);
            rows.push(['Не найденных кодов', stats?.not_found_errors || 0]);
            rows.push([]);
            
            // Топ пользователей
            rows.push(['ТОП СМЕТЧИКОВ']);
            rows.push(['Место', 'ФИО', 'Учреждение', 'Точность', 'Сессий', 'Ошибок', 'Сумма', 'Рейтинг']);
            topUsers.forEach((user, idx) => {
                rows.push([
                    idx + 1,
                    user.user_name,
                    user.user_institution || '—',
                    `${user.avg_accuracy}%`,
                    user.sessions_count,
                    user.coefficient_mismatches + user.restoration_errors,
                    `${(user.total_amount || 0).toLocaleString()} ₽`,
                    user.rating_score || 0
                ]);
            });
            rows.push([]);
            
            // Топ ошибок
            rows.push(['ТОП ПРОБЛЕМНЫХ КОДОВ']);
            rows.push(['Код', 'Статус', 'Кол-во', 'Проектов', 'Последнее появление']);
            topErrors.forEach(error => {
                rows.push([
                    error.code,
                    error.is_restoration ? 'Реставрация' : error.status,
                    error.occurrence_count,
                    error.projects_count,
                    new Date(error.last_seen).toLocaleDateString('ru-RU')
                ]);
            });
            
            // Конвертируем в CSV
            const csvContent = rows.map(row => 
                row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')
            ).join('\n');
            
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=executive_report_${new Date().toISOString().slice(0, 10)}.csv`);
            res.send('\uFEFF' + csvContent);
        } else {
            res.status(400).json({ error: 'Неподдерживаемый формат' });
        }
    } catch (err) {
        console.error('Error exporting dashboard:', err);
        res.status(500).json({ error: 'Ошибка экспорта' });
    }
});

module.exports = router;