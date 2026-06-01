// routes/auth.js

const express = require('express');
const router = express.Router();
const usersDb = require('../../shareds/users-db');

/**
 * POST /api/login
 * Логин пользователя
 */
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({
            success: false,
            error: 'Неверные данные',
            message: 'Введите логин и пароль'
        });
    }
    
    try {
        const user = await usersDb.authenticate(username, password);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Неверные учетные данные',
                message: 'Неверный логин или пароль'
            });
        }
        
        if (user.is_active === 0) {
            return res.status(401).json({
                success: false,
                error: 'Доступ запрещен',
                message: 'Учетная запись заблокирована'
            });
        }
        
        console.log(`✅ Пользователь ${username} вошел в систему`);
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                fullname: user.fullname || user.username,
                role: user.role || 'user',
                institution: user.institution || ''
            }
        });
        
    } catch (err) {
        console.error('❌ Ошибка входа:', err);
        res.status(500).json({
            success: false,
            error: 'Ошибка сервера',
            message: 'Не удалось выполнить вход'
        });
    }
});

/**
 * GET /api/users/:id
 * Получение информации о пользователе
 */
router.get('/users/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
        return res.status(400).json({
            success: false,
            error: 'Неверный идентификатор пользователя'
        });
    }
    
    try {
        const user = await usersDb.getUserById(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        res.json({
            id: user.id,
            username: user.username,
            fullname: user.fullname,
            institution: user.institution,
            role: user.role
        });
    } catch (err) {
        console.error('Ошибка получения пользователя:', err);
        res.status(500).json({
            success: false,
            error: 'Ошибка сервера'
        });
    }
});

/**
 * GET /api/verify
 * Проверка сессии (всегда успешна для простой версии)
 */
router.get('/verify', (req, res) => {
    res.json({ success: true });
});

/**
 * POST /api/logout
 * Выход из системы
 */
router.post('/logout', (req, res) => {
    console.log('👋 Пользователь вышел из системы');
    res.json({ success: true, message: 'Выход выполнен' });
});

module.exports = router;