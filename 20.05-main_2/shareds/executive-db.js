// shareds/executive-db.js
// Расширенные методы для Executive Dashboard

const db = require('./db');
const { query, getOne, run } = db;

/**
 * Получение общей статистики по периодам (для KPI и трендов)
 */
async function getExecutiveStats(days = 30) {
    const dateFilter = `created_at >= DATEADD(day, -@p0, DATEADD(hour, 3, GETUTCDATE()))`;
    
    const stats = await getOne(`
        SELECT 
            COUNT(DISTINCT user_name) as active_users,
            COUNT(*) as total_sessions,
            SUM(total_codes) as total_codes,
            SUM(found_codes) as found_codes,
            SUM(not_found_codes) as not_found_codes,
            SUM(coefficient_mismatches) as coefficient_errors,
            SUM(restoration_codes) as restoration_errors,
            SUM(total_amount) as total_amount,
            CASE WHEN SUM(total_codes) > 0 
                 THEN ROUND(SUM(found_codes) * 100.0 / SUM(total_codes), 1)
                 ELSE 0 END as avg_accuracy
        FROM sessions
        WHERE ${dateFilter}
          AND status = 'completed'
    `, [days]);
    
    // Получаем тренд (сравнение с предыдущим периодом)
    const prevStats = await getOne(`
        SELECT 
            CASE WHEN SUM(total_codes) > 0 
                 THEN ROUND(SUM(found_codes) * 100.0 / SUM(total_codes), 1)
                 ELSE 0 END as prev_accuracy,
            COUNT(*) as prev_sessions
        FROM sessions
        WHERE created_at >= DATEADD(day, -@p0, DATEADD(hour, 3, GETUTCDATE()))
          AND created_at < DATEADD(day, -@p1, DATEADD(hour, 3, GETUTCDATE()))
          AND status = 'completed'
    `, [days * 2, days]);
    
    return {
        ...stats,
        trends: {
            accuracy: (stats?.avg_accuracy || 0) - (prevStats?.prev_accuracy || 0),
            sessions: (stats?.total_sessions || 0) - (prevStats?.prev_sessions || 0)
        }
    };
}

/**
 * Топ пользователей с расширенной статистикой
 */
async function getTopUsersWithStats(days, limit, sortBy = 'accuracy') {
    const dateFilter = `s.created_at >= DATEADD(day, -@p0, DATEADD(hour, 3, GETUTCDATE()))`;
    
    let orderBy = '';
    switch (sortBy) {
        case 'accuracy':
            orderBy = 'avg_accuracy DESC';
            break;
        case 'sessions':
            orderBy = 'sessions_count DESC';
            break;
        case 'amount':
            orderBy = 'total_amount DESC';
            break;
        case 'rating':
        default:
            orderBy = 'rating_score DESC';
            break;
    }
    
    const users = await query(`
        SELECT TOP (@p1)
            u.id as user_id,
            u.fullname as user_name,
            u.username as login,
            u.institution as user_institution,
            COUNT(DISTINCT s.session_id) as sessions_count,
            COUNT(DISTINCT s.filename) as files_count,
            SUM(s.total_codes) as total_codes,
            SUM(s.found_codes) as found_codes,
            SUM(s.not_found_codes) as not_found_codes,
            SUM(s.coefficient_matches) as coeff_matches,
            SUM(s.coefficient_mismatches) as coeff_mismatches,
            SUM(s.restoration_codes) as restoration_errors,
            SUM(s.total_amount) as total_amount,
            MAX(s.created_at) as last_activity,
            CASE WHEN SUM(s.total_codes) > 0 
                 THEN ROUND(SUM(s.found_codes) * 100.0 / SUM(s.total_codes), 1)
                 ELSE 0 END as avg_accuracy,
            -- Рейтинг (собственная формула)
            ROUND(
                (CASE WHEN SUM(s.total_codes) > 0 
                      THEN ROUND(SUM(s.found_codes) * 100.0 / SUM(s.total_codes), 1)
                      ELSE 0 END) * 0.5 +
                (COUNT(DISTINCT s.session_id) * 1.0 / @p2) * 30 +
                (1 - (SUM(s.coefficient_mismatches) * 1.0 / NULLIF(SUM(s.coefficient_matches) + SUM(s.coefficient_mismatches), 0))) * 20,
                0
            ) as rating_score
        FROM sessions s
        LEFT JOIN users u ON s.user_name = u.fullname
        WHERE ${dateFilter}
          AND s.user_name IS NOT NULL AND s.user_name != ''
          AND s.status = 'completed'
        GROUP BY u.id, u.fullname, u.username, u.institution
        ORDER BY ${orderBy}
    `, [days, limit, (await getOne(`SELECT COUNT(DISTINCT session_id) FROM sessions WHERE ${dateFilter}`))?.count || 1]);
    
    // Добавляем тренд точности для каждого пользователя
    for (const user of users) {
        const trend = await getOne(`
            WITH weekly_stats AS (
                SELECT 
                    DATEPART(week, created_at) as week_num,
                    CASE WHEN SUM(total_codes) > 0 
                         THEN ROUND(SUM(found_codes) * 100.0 / SUM(total_codes), 1)
                         ELSE 0 END as week_accuracy
                FROM sessions
                WHERE user_name = @p0
                  AND created_at >= DATEADD(day, -14, DATEADD(hour, 3, GETUTCDATE()))
                GROUP BY DATEPART(week, created_at)
            )
            SELECT 
                MAX(CASE WHEN week_num = (SELECT MAX(week_num) FROM weekly_stats) THEN week_accuracy END) as current_week,
                MAX(CASE WHEN week_num = (SELECT MAX(week_num) - 1 FROM weekly_stats) THEN week_accuracy END) as prev_week
            FROM weekly_stats
        `, [user.user_name]);
        
        user.accuracy_trend = (trend?.current_week || 0) - (trend?.prev_week || 0);
    }
    
    return users;
}

/**
 * Топ ошибок с группировкой по проектам
 */
async function getTopErrorsWithProjects(days, limit, status = 'all') {
    const dateFilter = `s.created_at >= DATEADD(day, -@p0, DATEADD(hour, 3, GETUTCDATE()))`;
    const statusFilter = status !== 'all' ? `AND cd.status = @p1` : '';
    const params = [days];
    if (status !== 'all') params.push(status);
    params.push(limit);
    
    const errors = await query(`
        SELECT TOP (@p${params.length - 1})
            cd.code,
            MAX(cd.description) as description,
            MAX(cd.status) as status,
            MAX(cd.match_type) as match_type,
            MAX(CASE WHEN cd.is_restoration = 1 THEN 1 ELSE 0 END) as is_restoration,
            MAX(CASE WHEN cd.has_coefficient = 1 THEN 1 ELSE 0 END) as has_coefficient,
            MAX(cd.coefficient_value) as coefficient_value,
            MAX(cd.expected_coefficient) as expected_coefficient,
            COUNT(*) as occurrence_count,
            COUNT(DISTINCT s.session_id) as sessions_count,
            COUNT(DISTINCT s.project_id) as projects_count,
            SUM(s.total_amount) as total_amount_affected,
            STRING_AGG(DISTINCT CAST(s.project_id AS NVARCHAR(10)), ',') as project_ids,
            STRING_AGG(DISTINCT LEFT(s.filename, 50), ' | ') as example_filenames,
            MAX(s.created_at) as last_seen,
            MIN(s.created_at) as first_seen
        FROM code_details cd
        JOIN sessions s ON cd.session_id = s.session_id
        WHERE ${dateFilter}
          AND (cd.status IN (N'Нельзя применять', N'Обратите внимание') OR cd.is_restoration = 1)
          ${statusFilter}
        GROUP BY cd.code
        HAVING COUNT(*) >= 2
        ORDER BY occurrence_count DESC
    `, params);
    
    // Для каждой ошибки получаем проекты с деталями
    for (const error of errors) {
        if (error.project_ids) {
            const projectIds = error.project_ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
            if (projectIds.length > 0) {
                const placeholders = projectIds.map((_, i) => `@p${i}`).join(',');
                error.projects = await query(`
                    SELECT 
                        p.id,
                        p.project_name,
                        p.status,
                        p.user_id,
                        u.fullname as user_name,
                        u.institution as user_institution,
                        (
                            SELECT COUNT(*) 
                            FROM sessions s2 
                            WHERE s2.project_id = p.id 
                              AND s2.created_at >= DATEADD(day, -30, DATEADD(hour, 3, GETUTCDATE()))
                        ) as recent_sessions_count
                    FROM user_projects p
                    LEFT JOIN users u ON p.user_id = u.id
                    WHERE p.id IN (${placeholders})
                `, projectIds);
            }
        }
    }
    
    return errors;
}

/**
 * Проекты пользователя с проблемами
 */
async function getUserProjectsWithProblems(userId, days = 90) {
    const projects = await query(`
        SELECT 
            p.id,
            p.project_name,
            p.status,
            p.created_at,
            p.updated_at,
            COUNT(DISTINCT s.session_id) as sessions_count,
            SUM(s.total_codes) as total_codes,
            SUM(s.found_codes) as found_codes,
            SUM(s.coefficient_mismatches) as coefficient_errors,
            SUM(s.restoration_codes) as restoration_errors,
            SUM(s.not_found_codes) as not_found_errors,
            SUM(CASE WHEN cd.status = N'Нельзя применять' THEN 1 ELSE 0 END) as forbidden_errors,
            SUM(CASE WHEN cd.status = N'Обратите внимание' THEN 1 ELSE 0 END) as warning_errors,
            STRING_AGG(DISTINCT cd.code, ', ') as problem_codes_sample
        FROM user_projects p
        LEFT JOIN sessions s ON p.id = s.project_id
        LEFT JOIN code_details cd ON s.session_id = cd.session_id
        WHERE p.user_id = @p0
          AND (cd.status IN (N'Нельзя применять', N'Обратите внимание') OR cd.is_restoration = 1 OR cd.coefficient_match = -1)
          AND s.created_at >= DATEADD(day, -@p1, DATEADD(hour, 3, GETUTCDATE()))
        GROUP BY p.id, p.project_name, p.status, p.created_at, p.updated_at
        HAVING COUNT(DISTINCT s.session_id) > 0
        ORDER BY (SUM(cd.coefficient_mismatches) + SUM(cd.restoration_errors) + SUM(cd.not_found_errors)) DESC
    `, [userId, days]);
    
    return projects;
}

/**
 * Детали ошибки (все вхождения по проектам и сметам)
 */
async function getErrorDetails(errorCode) {
    const sessions = await query(`
        SELECT 
            s.session_id,
            s.filename,
            s.estimate_name,
            s.created_at,
            s.user_name,
            s.project_id,
            p.project_name,
            cd.position,
            cd.row_number,
            cd.coefficient_value,
            cd.expected_coefficient,
            cd.coefficient_match,
            cd.description as code_description,
            cd.status,
            cd.match_type
        FROM code_details cd
        JOIN sessions s ON cd.session_id = s.session_id
        LEFT JOIN user_projects p ON s.project_id = p.id
        WHERE cd.code = @p0
          AND (cd.status IN (N'Нельзя применять', N'Обратите внимание') OR cd.is_restoration = 1)
        ORDER BY s.created_at DESC
    `, [errorCode]);
    
    const stats = {
        total_occurrences: sessions.length,
        unique_projects: new Set(sessions.map(s => s.project_id).filter(Boolean)).size,
        unique_users: new Set(sessions.map(s => s.user_name)).size,
        first_seen: sessions[sessions.length - 1]?.created_at,
        last_seen: sessions[0]?.created_at
    };
    
    return { code: errorCode, stats, sessions };
}

/**
 * Древо проблем по иерархии кодов
 */
async function getErrorHierarchyTree(days = 30) {
    const dateFilter = `s.created_at >= DATEADD(day, -@p0, DATEADD(hour, 3, GETUTCDATE()))`;
    
    // Получаем все проблемные коды с их иерархической структурой
    const codes = await query(`
        SELECT 
            cd.code,
            cd.status,
            cd.is_restoration,
            COUNT(*) as count,
            -- Извлекаем иерархические компоненты
            CASE 
                WHEN cd.code LIKE '%.%-%-%-%' THEN 
                    LEFT(cd.code, CHARINDEX('.', cd.code) - 1)
                WHEN cd.code LIKE '%.%-%' THEN
                    LEFT(cd.code, CHARINDEX('.', cd.code) - 1)
                ELSE cd.code
            END as chapter_part,
            CASE 
                WHEN cd.code LIKE '%.%-%-%-%' THEN 
                    SUBSTRING(
                        cd.code, 
                        CHARINDEX('.', cd.code) + 1, 
                        CHARINDEX('-', cd.code) - CHARINDEX('.', cd.code) - 1
                    )
                ELSE NULL
            END as collection_part,
            CASE 
                WHEN cd.code LIKE '%.%-%-%-%' THEN 
                    SUBSTRING(
                        cd.code, 
                        CHARINDEX('-', cd.code) + 1, 
                        CHARINDEX('-', cd.code, CHARINDEX('-', cd.code) + 1) - CHARINDEX('-', cd.code) - 1
                    )
                ELSE NULL
            END as section_part
        FROM code_details cd
        JOIN sessions s ON cd.session_id = s.session_id
        WHERE ${dateFilter}
          AND (cd.status IN (N'Нельзя применять', N'Обратите внимание') OR cd.is_restoration = 1)
        GROUP BY cd.code, cd.status, cd.is_restoration
        ORDER BY count DESC
    `, [days]);
    
    // Строим дерево
    const tree = {};
    
    for (const code of codes) {
        let current = tree;
        
        // Уровень 1: Глава
        const chapter = code.chapter_part || 'Прочие';
        if (!current[chapter]) {
            current[chapter] = {
                name: `Глава ${chapter}`,
                level: 1,
                codes: [],
                total_errors: 0,
                children: {}
            };
        }
        current[chapter].total_errors += code.count;
        current = current[chapter].children;
        
        // Уровень 2: Сборник (если есть)
        if (code.collection_part) {
            const collection = code.collection_part;
            if (!current[collection]) {
                current[collection] = {
                    name: `Сборник ${collection}`,
                    level: 2,
                    codes: [],
                    total_errors: 0,
                    children: {}
                };
            }
            current[collection].total_errors += code.count;
            current = current[collection].children;
        }
        
        // Уровень 3: Отдел (если есть)
        if (code.section_part) {
            const section = code.section_part;
            if (!current[section]) {
                current[section] = {
                    name: `Отдел ${section}`,
                    level: 3,
                    codes: [],
                    total_errors: 0,
                    children: {}
                };
            }
            current[section].total_errors += code.count;
            current = current[section].children;
        }
        
        // Добавляем сам код на текущий уровень
        const codeKey = code.code;
        if (!current[codeKey]) {
            current[codeKey] = {
                name: code.code,
                level: 4,
                codes: [code],
                total_errors: code.count,
                children: {}
            };
        }
    }
    
    // Сортируем дерево по количеству ошибок
    function sortTree(node) {
        if (!node) return;
        
        // Сортируем детей
        for (const key of Object.keys(node)) {
            if (node[key].children) {
                sortTree(node[key].children);
            }
        }
        
        // Сортируем текущий уровень
        const entries = Object.entries(node);
        entries.sort((a, b) => b[1].total_errors - a[1].total_errors);
        
        // Пересобираем объект
        const sorted = {};
        for (const [key, value] of entries) {
            sorted[key] = value;
        }
        Object.assign(node, sorted);
    }
    
    sortTree(tree);
    return tree;
}

/**
 * Ежедневная сводка для руководителя (email/telegram)
 */
async function getDailyExecutiveDigest() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const stats = await getOne(`
        SELECT 
            COUNT(DISTINCT user_name) as active_users,
            COUNT(*) as sessions_count,
            SUM(total_codes) as codes_processed,
            SUM(found_codes) as codes_found,
            SUM(coefficient_mismatches) as coeff_errors,
            SUM(restoration_codes) as restoration_errors,
            SUM(not_found_codes) as not_found_errors,
            SUM(total_amount) as total_amount,
            ROUND(AVG(CASE WHEN total_codes > 0 THEN (found_codes * 100.0 / total_codes) ELSE 0 END), 1) as avg_accuracy
        FROM sessions
        WHERE created_at >= @p0 AND created_at < @p1
          AND status = 'completed'
    `, [today.toISOString(), tomorrow.toISOString()]);
    
    const topErrors = await getTopErrorsWithProjects(1, 10, 'all');
    
    const topUsers = await getTopUsersWithStats(1, 5, 'accuracy');
    
    return {
        date: today.toISOString(),
        stats,
        topErrors: topErrors.slice(0, 5),
        topUsers,
        criticalAlerts: topErrors.filter(e => e.is_restoration || e.status === 'Нельзя применять').slice(0, 3)
    };
}

module.exports = {
    getExecutiveStats,
    getTopUsersWithStats,
    getTopErrorsWithProjects,
    getUserProjectsWithProblems,
    getErrorDetails,
    getErrorHierarchyTree,
    getDailyExecutiveDigest
};