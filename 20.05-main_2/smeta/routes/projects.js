// routes/projects.js

const express = require('express');
const logsDb = require('../../shareds/logs-db');
const router = express.Router();

// Middleware для получения userId из заголовка
function getUserId(req) {
    const userId = req.headers['x-user-id'];
    if (userId && !isNaN(parseInt(userId))) {
        return parseInt(userId);
    }
    return null;
}

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    req.userId = userId;
    next();
}

/**
 * GET /api/projects
 * Получение списка проектов пользователя
 */
router.get('/projects', requireAuth, async (req, res) => {
    try {
        const { status } = req.query;
        const projects = await logsDb.getUserProjects(req.userId, status);
        
        const projectsWithStats = await Promise.all(projects.map(async (project) => {
            const stats = await logsDb.getProjectStats(project.id);
            return {
                ...project,
                stats: stats || { totalCodes: 0, problemCount: 0, warningCount: 0, notAllowedCount: 0 }
            };
        }));
        
        res.json({ success: true, projects: projectsWithStats });
    } catch (err) {
        console.error('Ошибка получения проектов:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/projects
 * Создание нового проекта
 */
router.post('/projects', requireAuth, async (req, res) => {
    try {
        const { projectName, filename, estimateName, sessionId } = req.body;
        
        if (!projectName) {
            return res.status(400).json({ error: 'Название проекта обязательно' });
        }
        
        const projectId = await logsDb.createProject(
            req.userId, projectName, filename, estimateName, sessionId
        );
        
        res.json({ success: true, projectId });
    } catch (err) {
        console.error('Ошибка создания проекта:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/projects/:id
 * Получение информации о проекте
 */
router.get('/projects/:id', requireAuth, async (req, res) => {
    try {
        const projectId = parseInt(req.params.id);
        
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Неверный идентификатор проекта' });
        }
        
        const project = await logsDb.getProjectById(projectId, req.userId);
        
        if (!project) {
            return res.status(404).json({ error: 'Проект не найден' });
        }
        
        const stats = await logsDb.getProjectStats(project.id);
        let session = null;
        
        if (project.current_session_id) {
            session = await logsDb.getSessionDetails(project.current_session_id);
        }
        
        res.json({ 
            success: true, 
            project: { ...project, stats },
            currentSession: session
        });
    } catch (err) {
        console.error('Ошибка получения проекта:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/projects/:id/sessions
 * Получение списка сессий проекта
 */
router.get('/projects/:id/sessions', requireAuth, async (req, res) => {
    try {
        const projectId = parseInt(req.params.id);
        
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Неверный идентификатор проекта' });
        }
        
        const project = await logsDb.getProjectById(projectId, req.userId);
        if (!project) {
            return res.status(404).json({ error: 'Проект не найден' });
        }
        
        const sessions = await logsDb.getProjectSessions(projectId);
        
        const sessionsWithStats = sessions.map(s => ({
            session_id: s.session_id,
            created_at: s.created_at,
            filename: s.filename,
            estimate_name: s.estimate_name,
            total_codes: s.total_codes,
            found_codes: s.found_codes,
            not_found_codes: s.not_found_codes,
            coefficient_matches: s.coefficient_matches,
            coefficient_mismatches: s.coefficient_mismatches,
            total_amount: s.total_amount,
            status: s.status,
            is_revised: s.is_revised,
            problem_count: s.problem_count,
            warning_count: s.warning_count,
            not_allowed_count: s.not_allowed_count
        }));
        
        res.json({ 
            success: true, 
            sessions: sessionsWithStats,
            current_session_id: project.current_session_id 
        });
    } catch (err) {
        console.error('Ошибка получения сессий проекта:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/projects/:id/sessions/:sessionId
 * Получение деталей конкретной сессии
 */
router.get('/projects/:id/sessions/:sessionId', requireAuth, async (req, res) => {
    try {
        const projectId = parseInt(req.params.id);
        const { sessionId } = req.params;
        
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Неверный идентификатор проекта' });
        }
        
        const project = await logsDb.getProjectById(projectId, req.userId);
        if (!project) {
            return res.status(404).json({ error: 'Проект не найден' });
        }
        
        const session = await logsDb.getSessionDetails(sessionId);
        
        if (!session) {
            return res.status(404).json({ error: 'Сессия не найдена' });
        }
        
        if (session.project_id !== projectId) {
            return res.status(403).json({ error: 'Доступ запрещён' });
        }
        
        res.json({ success: true, session });
    } catch (err) {
        console.error('Ошибка получения сессии:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/projects/:id/archive
 * Отправка проекта в архив
 */
router.post('/projects/:id/archive', requireAuth, async (req, res) => {
    try {
        const projectId = parseInt(req.params.id);
        
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Неверный идентификатор проекта' });
        }
        
        await logsDb.archiveProject(projectId, req.userId);
        res.json({ success: true, message: 'Проект отправлен в архив' });
    } catch (err) {
        console.error('Ошибка архивации проекта:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/projects/:id/restore
 * Восстановление проекта из архива
 */
router.post('/projects/:id/restore', requireAuth, async (req, res) => {
    try {
        const projectId = parseInt(req.params.id);
        
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Неверный идентификатор проекта' });
        }
        
        await logsDb.restoreProject(projectId, req.userId);
        res.json({ success: true, message: 'Проект восстановлен' });
    } catch (err) {
        console.error('Ошибка восстановления проекта:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/projects/:id
 * Удаление проекта (только из архива)
 */
router.delete('/projects/:id', requireAuth, async (req, res) => {
    try {
        const projectId = parseInt(req.params.id);
        
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Неверный идентификатор проекта' });
        }
        
        await logsDb.deleteProject(projectId, req.userId);
        res.json({ success: true, message: 'Проект удалён' });
    } catch (err) {
        console.error('Ошибка удаления проекта:', err);
        res.status(500).json({ error: err.message });
    }
});
router.get('/projects/:id/ks2-sessions/:sessionId', requireAuth, async (req, res) => {
    try {
        const projectId = parseInt(req.params.id);
        const sessionId = req.params.sessionId;
        const project = await logsDb.getProjectById(projectId, req.userId);
        if (!project) return res.status(404).json({ error: 'Проект не найден' });
        
        const items = await logsDb.getKs2Items(sessionId);
        if (!items || items.length === 0) return res.status(404).json({ error: 'Данные КС-2 не найдены' });
        
        res.json({ success: true, items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;