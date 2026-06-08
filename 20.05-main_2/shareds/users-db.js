// shareds/users-db.js

const db = require('./db');
const crypto = require('crypto');
const { run, query, getOne, getLastInsertId, createTableIfNotExists, addColumnIfNotExists } = db;

// Хеширование пароля SHA256
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Инициализация базы данных пользователей
async function initUsersDatabase() {
    await createTableIfNotExists('users', `
        CREATE TABLE users (
            id INT IDENTITY(1,1) PRIMARY KEY,
            username NVARCHAR(100) NOT NULL UNIQUE,
            password_hash NVARCHAR(64) NOT NULL,
            institution NVARCHAR(255),
            fullname NVARCHAR(255),
            role NVARCHAR(20) DEFAULT 'user',
            is_active INT DEFAULT 1,
            last_login DATETIME2,
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE()),
            updated_at DATETIME2
        )
    `);

    // Создаём администратора, если нет пользователей
    const count = await getOne(`SELECT COUNT(*) as cnt FROM users`);
    if (count.cnt === 0) {
        const defaultPassword = 'admin123';
        const hash = hashPassword(defaultPassword);
        await run(`
            INSERT INTO users (username, password_hash, institution, fullname, role, created_at)
            VALUES (@p0, @p1, @p2, @p3, @p4, DATEADD(hour, 3, GETUTCDATE()))
        `, ['admin', hash, 'Администрация', 'Главный администратор', 'admin']);
       
    }
    
    
}

// Аутентификация пользователя
async function authenticate(username, password) {
    const hash = hashPassword(password);
    const user = await getOne(`
        SELECT id, username, institution, fullname, role, is_active 
        FROM users 
        WHERE username = @p0 AND password_hash = @p1 AND is_active = 1
    `, [username, hash]);
    
    if (user) {
        await run(`UPDATE users SET last_login = DATEADD(hour, 3, GETUTCDATE()) WHERE id = @p0`, [user.id]);
        return user;
    }
    return null;
}

// Получить всех пользователей
async function getAllUsers() {
    return await query(`SELECT id, username, institution, fullname, role, is_active, last_login, created_at FROM users ORDER BY id DESC`);
}

// Получить пользователя по ID
async function getUserById(id) {
    return await getOne(`SELECT id, username, institution, fullname, role, is_active, created_at FROM users WHERE id = @p0`, [id]);
}

// Получить пользователя по имени
async function getUserByUsername(username) {
    return await getOne(`SELECT id, username, institution, fullname, role, is_active FROM users WHERE username = @p0`, [username]);
}

// Поиск пользователя по имени (алиас)
async function findUserByUsername(username) {
    return await getUserByUsername(username);
}

// Поиск пользователя по ID (алиас)
async function findUserById(id) {
    return await getUserById(id);
}

// Создать пользователя
async function createUser(username, password, institution, fullname, role = 'user') {
    const existing = await getUserByUsername(username);
    if (existing) throw new Error('Пользователь с таким именем уже существует');
    
    const hash = hashPassword(password);
    await run(`
        INSERT INTO users (username, password_hash, institution, fullname, role, created_at)
        VALUES (@p0, @p1, @p2, @p3, @p4, DATEADD(hour, 3, GETUTCDATE()))
    `, [username, hash, institution, fullname, role]);
    
    return await getLastInsertId();
}

// Обновить пользователя
async function updateUser(id, data) {
    const updates = [];
    const params = [];
    
    if (data.institution !== undefined) {
        updates.push('institution = @p' + params.length);
        params.push(data.institution);
    }
    if (data.fullname !== undefined) {
        updates.push('fullname = @p' + params.length);
        params.push(data.fullname);
    }
    if (data.role !== undefined) {
        updates.push('role = @p' + params.length);
        params.push(data.role);
    }
    if (data.is_active !== undefined) {
        updates.push('is_active = @p' + params.length);
        params.push(data.is_active ? 1 : 0);
    }
    if (data.password) {
        updates.push('password_hash = @p' + params.length);
        params.push(hashPassword(data.password));
    }
    
    if (updates.length === 0) return false;
    
    updates.push('updated_at = DATEADD(hour, 3, GETUTCDATE())');
    params.push(id);
    
    const result = await run(`UPDATE users SET ${updates.join(', ')} WHERE id = @p${params.length-1}`, params);
    return result.changes > 0;
}

// Удалить пользователя
async function deleteUser(id) {
    const user = await getUserById(id);
    if (!user) return false;
    if (user.role === 'admin') return false;
    
    const result = await run(`DELETE FROM users WHERE id = @p0`, [id]);
    return result.changes > 0;
}

// Обновить пароль
async function updatePassword(userId, newPassword) {
    const hash = hashPassword(newPassword);
    const result = await run(`
        UPDATE users 
        SET password_hash = @p0, updated_at = DATEADD(hour, 3, GETUTCDATE())
        WHERE id = @p1
    `, [hash, userId]);
    return result.changes > 0;
}

// Сменить пароль (с проверкой старого)
async function changePassword(id, oldPassword, newPassword) {
    const user = await getUserById(id);
    if (!user) return false;
    
    const oldHash = hashPassword(oldPassword);
    if (user.password_hash !== oldHash) return false;
    
    const newHash = hashPassword(newPassword);
    const result = await run(`
        UPDATE users 
        SET password_hash = @p0, updated_at = DATEADD(hour, 3, GETUTCDATE())
        WHERE id = @p1
    `, [newHash, id]);
    
    return result.changes > 0;
}

// Проверка существования БД
function isDatabaseExists() { return true; }

module.exports = {
    initUsersDatabase,
    authenticate,
    getAllUsers,
    getUserById,
    getUserByUsername,
    findUserByUsername,
    findUserById,
    createUser,
    updateUser,
    deleteUser,
    updatePassword,
    changePassword,
    isDatabaseExists,
    hashPassword
};