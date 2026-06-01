const tokenManager = require('../../shareds/token-manager');

/**
 * Middleware для проверки аутентификации
 */
async function requireAuth(req, res, next) {
    // Получаем токен из заголовка Authorization
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : null;
    
    // Также поддерживаем X-User-Id для обратной совместимости (НО ТОЛЬКО В DEV)
    if (!token && process.env.NODE_ENV === 'development') {
        const userId = req.headers['x-user-id'];
        if (userId && !isNaN(parseInt(userId))) {
            console.warn('⚠️ Using deprecated X-User-Id header in development mode');
            req.userId = parseInt(userId);
            return next();
        }
    }
    
    if (!token) {
        return res.status(401).json({ 
            error: 'Не авторизован',
            message: 'Требуется авторизация. Пожалуйста, войдите в систему.'
        });
    }
    
    // Валидируем токен
    const result = tokenManager.verifyAccessToken(token);
    
    if (!result.valid) {
        // Если токен истек, возвращаем специальный статус для обновления
        if (result.error === 'jwt expired') {
            return res.status(401).json({ 
                error: 'Токен истек',
                needRefresh: true,
                message: 'Сессия истекла. Пожалуйста, обновите токен.'
            });
        }
        
        return res.status(401).json({ 
            error: 'Неверный токен',
            message: result.error
        });
    }
    
    // Добавляем информацию о пользователе в запрос
    req.userId = result.decoded.userId;
    req.username = result.decoded.username;
    req.session = result.session;
    req.accessToken = token;
    
    next();
}

/**
 * Опциональная аутентификация (не блокирует запрос)
 */
async function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : null;
    
    if (token) {
        const result = tokenManager.verifyAccessToken(token);
        if (result.valid) {
            req.userId = result.decoded.userId;
            req.username = result.decoded.username;
        }
    }
    
    next();
}

/**
 * Проверка прав доступа (админ)
 */
function requireAdmin(req, res, next) {
    if (req.userId !== 1) { // ID админа
        return res.status(403).json({ 
            error: 'Доступ запрещен',
            message: 'Требуются права администратора'
        });
    }
    next();
}

/**
 * Лимитер запросов по пользователю
 */
function createUserRateLimiter(maxRequests = 100, windowMs = 60 * 1000) {
    const requests = new Map();
    //  аниме
    
    return (req, res, next) => {
        const userId = req.userId || req.ip;
        const now = Date.now();
        const windowStart = now - windowMs;
        
        const userRequests = requests.get(userId) || [];
        const recentRequests = userRequests.filter(timestamp => timestamp > windowStart);
        
        if (recentRequests.length >= maxRequests) {
            return res.status(429).json({ 
                error: 'Слишком много запросов',
                message: `Превышен лимит: ${maxRequests} запросов за ${windowMs / 1000} секунд`
            });
        }
        
        recentRequests.push(now);
        requests.set(userId, recentRequests);
        
        next();
    };
}

module.exports = { 
    requireAuth, 
    optionalAuth, 
    requireAdmin,
    createUserRateLimiter
};