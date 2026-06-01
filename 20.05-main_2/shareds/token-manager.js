
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Секретный ключ из переменных окружения
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY = '24h';
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 дней

// Хранилище активных сессий (в production использовать Redis)
const activeSessions = new Map();
const refreshTokensStore = new Map();

/**
 * Генерация access токена
 */
function generateAccessToken(userId, username) {
    return jwt.sign(
        { userId, username, type: 'access' },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );
}

/**
 * Генерация refresh токена
 */
function generateRefreshToken(userId) {
    const token = crypto.randomBytes(40).toString('hex');
    refreshTokensStore.set(token, {
        userId,
        expires: Date.now() + REFRESH_TOKEN_EXPIRY,
        createdAt: new Date()
    });
    
    // Автоматическая очистка через 7 дней
    setTimeout(() => {
        if (refreshTokensStore.has(token)) {
            refreshTokensStore.delete(token);
        }
    }, REFRESH_TOKEN_EXPIRY);
    
    return token;
}

/**
 * Создание сессии пользователя
 */
async function createSession(userId, username, req) {
    const accessToken = generateAccessToken(userId, username);
    const refreshToken = generateRefreshToken(userId);
    
    const session = {
        userId,
        username,
        accessToken,
        refreshToken,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ip: req.ip,
        userAgent: req.headers['user-agent']
    };
    
    activeSessions.set(accessToken, session);
    
    // Очистка старых сессий пользователя (опционально)
    cleanupOldUserSessions(userId);
    
    return { accessToken, refreshToken, session };
}

/**
 * Очистка старых сессий пользователя (максимум 5 активных)
 */
function cleanupOldUserSessions(userId) {
    const userSessions = Array.from(activeSessions.values())
        .filter(s => s.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt);
    
    // Оставляем только 5 последних сессий
    if (userSessions.length > 5) {
        userSessions.slice(5).forEach(session => {
            activeSessions.delete(session.accessToken);
        });
    }
}

/**
 * Валидация access токена
 */
function verifyAccessToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Проверяем тип токена
        if (decoded.type !== 'access') {
            return { valid: false, error: 'Invalid token type' };
        }
        
        // Проверяем существование сессии
        const session = activeSessions.get(token);
        if (!session) {
            return { valid: false, error: 'Session not found' };
        }
        
        // Проверяем не истекла ли сессия
        if (session.expiresAt < new Date()) {
            activeSessions.delete(token);
            return { valid: false, error: 'Session expired' };
        }
        
        return { valid: true, decoded, session };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}

/**
 * Обновление токенов по refresh токену
 */
async function refreshAccessToken(refreshToken) {
    const refreshData = refreshTokensStore.get(refreshToken);
    
    if (!refreshData) {
        return { success: false, error: 'Invalid refresh token' };
    }
    
    if (refreshData.expires < Date.now()) {
        refreshTokensStore.delete(refreshToken);
        return { success: false, error: 'Refresh token expired' };
    }
    
    // Удаляем старый access токен
    const oldSession = Array.from(activeSessions.values())
        .find(s => s.refreshToken === refreshToken);
    
    if (oldSession) {
        activeSessions.delete(oldSession.accessToken);
    }
    
    // Генерируем новые токены
    const newAccessToken = generateAccessToken(refreshData.userId);
    const newRefreshToken = generateRefreshToken(refreshData.userId);
    
    // Обновляем сессию
    if (oldSession) {
        oldSession.accessToken = newAccessToken;
        oldSession.refreshToken = newRefreshToken;
        oldSession.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        activeSessions.set(newAccessToken, oldSession);
        activeSessions.delete(oldSession.accessToken);
    }
    
    // Удаляем старый refresh токен
    refreshTokensStore.delete(refreshToken);
    
    return {
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
    };
}

/**
 * Завершение сессии (logout)
 */
function logout(accessToken, refreshToken) {
    if (accessToken) {
        activeSessions.delete(accessToken);
    }
    if (refreshToken) {
        refreshTokensStore.delete(refreshToken);
    }
}

/**
 * Завершение всех сессий пользователя
 */
function logoutAllUserSessions(userId) {
    const sessionsToDelete = Array.from(activeSessions.values())
        .filter(s => s.userId === userId);
    
    sessionsToDelete.forEach(session => {
        activeSessions.delete(session.accessToken);
        refreshTokensStore.delete(session.refreshToken);
    });
}

/**
 * Получение информации о сессии
 */
function getSessionInfo(accessToken) {
    const session = activeSessions.get(accessToken);
    if (!session) return null;
    
    return {
        userId: session.userId,
        username: session.username,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        ip: session.ip,
        userAgent: session.userAgent
    };
}

/**
 * Проверка валидности refresh токена
 */
function verifyRefreshToken(refreshToken) {
    const refreshData = refreshTokensStore.get(refreshToken);
    
    if (!refreshData) {
        return { valid: false, error: 'Refresh token not found' };
    }
    
    if (refreshData.expires < Date.now()) {
        refreshTokensStore.delete(refreshToken);
        return { valid: false, error: 'Refresh token expired' };
    }
    
    return { valid: true, userId: refreshData.userId };
}

module.exports = {
    createSession,
    verifyAccessToken,
    refreshAccessToken,  // Переименовано с refreshTokens
    verifyRefreshToken,
    logout,
    logoutAllUserSessions,
    getSessionInfo,
    JWT_SECRET
};