const express = require('express');
const path = require('path');
const cors = require('cors');
const codesDb = require('../shareds/codes-db');
const logsDb = require('../shareds/logs-db');
const usersDb = require('../shareds/users-db');
const logger = require('../shareds/logger');
const ExcelJS = require('exceljs');
const db = require('../shareds/db')
const app = express();
const PORT = process.env.PORT || 4998;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
// server.js - в самое начало, после объявления require
function fixMojibake(str) {
    if (!str || typeof str !== 'string') return str;
    try {
        // Пытаемся преобразовать Latin1 → UTF-8
        const latin1Buffer = Buffer.from(str, 'latin1');
        const utf8String = latin1Buffer.toString('utf8');
        // Если результат содержит русские буквы и не содержит '�' – значит, успех
        if (!utf8String.includes('�') && /[А-Яа-я]/.test(utf8String)) {
            return utf8String;
        }
    } catch (e) {
        // игнорируем ошибки
    }
    return str; // возвращаем исходное, если не удалось исправить
}
// Middleware для логирования API запросов
app.use(async (req, res, next) => {
    const start = Date.now();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.logApiRequest(req.method, req.path, res.statusCode, duration, ip, userAgent);
    });
    next();
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

const sendDuplicateError = (res, entity, value, field = 'code') => {
    return res.status(409).json({ 
        error: `Запись уже существует`,
        details: `${entity} "${value}" уже есть в базе данных`,
        field: field,
        value: value
    });
};

const sendError = (res, message, statusCode = 400) => {
    return res.status(statusCode).json({ error: message });
};

// ==================== API АУТЕНТИФИКАЦИИ ====================

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return sendError(res, 'Имя пользователя и пароль обязательны', 400);
        }
        
        const user = await usersDb.authenticate(username, password);
        
        if (!user) {
            return sendError(res, 'Неверное имя пользователя или пароль', 401);
        }
        
        if (user.role !== 'admin') {
            return sendError(res, 'Доступ запрещен. Требуются права администратора.', 403);
        }
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                fullname: user.fullname,
                institution: user.institution,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// ==================== API ТОЧНЫХ КОДОВ ====================

app.get('/api/codes/exact', async (req, res) => {
    try {
        const codes = await codesDb.getAllExactCodes();
        res.json(codes);
    } catch (err) {
        console.error('Error fetching exact codes:', err);
        res.status(500).json({ error: 'Ошибка загрузки точных кодов' });
    }
});

app.post('/api/codes/exact', async (req, res) => {
    try {
        console.log('🔵 POST /api/codes/exact - Начало обработки');
        console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
        
        const codeData = req.body;
        
        if (!codeData.Code) {
            console.log('❌ Ошибка: Код не указан');
            return sendError(res, 'Код обязателен для заполнения', 400);
        }
        
        console.log(`🔍 Проверка существующего кода: ${codeData.Code}`);
        const existing = await codesDb.findExactCodeByValue(codeData.Code);
        if (existing) {
            console.log('⚠️ Код уже существует:', existing);
            return sendDuplicateError(res, 'Точный код', codeData.Code);
        }
        
        console.log('✅ Код уникален, добавляем...');
        
        // Подготавливаем данные для добавления
        const exactCodeData = {
            Code: codeData.Code,
            Description: codeData.Description || '',
            Status: codeData.Status || 'Доступен',
            IsRestoration: codeData.IsRestoration || false,
            HasCoefficient: codeData.HasCoefficient || false,
            CoefficientValue: codeData.CoefficientValue || null,
            CoefficientType: codeData.CoefficientType || 'none',
            CheckCoefficient: codeData.CheckCoefficient || false,  // НОВОЕ ПОЛЕ
            IsExact: true,
            adminName: codeData.adminName || 'admin'
        };
        
        const id = await codesDb.addExactCode(exactCodeData);
        console.log(`📝 Результат addExactCode: id = ${id}`);
        
        if (!id) {
            console.log('❌ addExactCode вернул null/false');
            return sendError(res, 'Не удалось добавить код', 500);
        }
        
        console.log(`✅ Код успешно добавлен с ID: ${id}`);
        
        await logger.logAdminAction(
            codeData.adminName || 'admin',
            'add_exact_code',
            'code',
            id,
            { 
                code: codeData.Code, 
                description: codeData.Description, 
                hasCoefficient: codeData.HasCoefficient, 
                coefficientValue: codeData.CoefficientValue,
                checkCoefficient: codeData.CheckCoefficient  // НОВОЕ ПОЛЕ
            },
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, id, message: 'Код успешно добавлен' });
    } catch (err) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА в POST /api/codes/exact:');
        console.error('Ошибка:', err);
        console.error('Стек:', err.stack);
        console.error('Request body:', req.body);
        
        if (err.code === 'SQLITE_CONSTRAINT') {
            return sendDuplicateError(res, 'Точный код', req.body.Code);
        }
        
        res.status(500).json({ 
            error: 'Ошибка при добавлении кода',
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

app.put('/api/codes/exact/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const codeId = parseInt(id);
        
        if (isNaN(codeId)) {
            return sendError(res, 'Неверный идентификатор кода', 400);
        }
        
        const { Code } = req.body;
        
        // Проверка на дубликат при изменении кода
        if (Code) {
            const existing = await codesDb.findExactCodeByValue(Code);
            if (existing && existing.id !== codeId) {
                return sendDuplicateError(res, 'Точный код', Code);
            }
        }
        
        // Получаем старую версию кода для логирования
        const oldCode = await codesDb.findExactCodeById(codeId);
        
        if (!oldCode) {
            return sendError(res, 'Код не найден', 404);
        }
        
        // Подготавливаем данные для обновления
        const updateData = {
            Code: req.body.Code || oldCode.code,
            Description: req.body.Description !== undefined ? req.body.Description : oldCode.description,
            Status: req.body.Status || oldCode.status,
            IsRestoration: req.body.IsRestoration !== undefined ? req.body.IsRestoration : (oldCode.is_restoration === 1),
            HasCoefficient: req.body.HasCoefficient !== undefined ? req.body.HasCoefficient : (oldCode.has_coefficient === 1),
            CoefficientValue: req.body.CoefficientValue !== undefined ? req.body.CoefficientValue : oldCode.coefficient_value,
            CoefficientType: req.body.CoefficientType || oldCode.coefficient_type || 'none',
            CheckCoefficient: req.body.CheckCoefficient !== undefined ? req.body.CheckCoefficient : (oldCode.check_coefficient === 1),  // НОВОЕ ПОЛЕ
            adminName: req.body.adminName || 'admin'
        };
        
        const success = await codesDb.updateExactCode(codeId, updateData);
        
        if (!success) {
            return sendError(res, 'Не удалось обновить код', 500);
        }
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'update_exact_code',
            'code',
            codeId,
            { 
                old: { 
                    code: oldCode.code, 
                    description: oldCode.description,
                    hasCoefficient: oldCode.has_coefficient === 1,
                    coefficientValue: oldCode.coefficient_value,
                    checkCoefficient: oldCode.check_coefficient === 1
                }, 
                new: { 
                    code: updateData.Code,
                    description: updateData.Description,
                    hasCoefficient: updateData.HasCoefficient,
                    coefficientValue: updateData.CoefficientValue,
                    checkCoefficient: updateData.CheckCoefficient
                } 
            },
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, message: 'Код успешно обновлен' });
    } catch (err) {
        console.error('Error updating exact code:', err);
        res.status(500).json({ error: 'Ошибка при обновлении кода' });
    }
});
app.delete('/api/codes/exact', async (req, res) => {
    try {
        const idsToDelete = req.body;
        
        if (!Array.isArray(idsToDelete) || idsToDelete.length === 0) {
            return sendError(res, 'Ожидается массив ID для удаления', 400);
        }
        
        const validIds = idsToDelete.filter(id => !isNaN(parseInt(id)));
        
        if (validIds.length === 0) {
            return sendError(res, 'Неверные идентификаторы кодов', 400);
        }
        
        const deleted = await codesDb.deleteExactCodes(validIds);
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'delete_exact_codes',
            'codes',
            null,
            { count: deleted, ids: validIds },
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, message: `Удалено ${deleted} кодов` });
    } catch (err) {
        console.error('Error deleting exact codes:', err);
        res.status(500).json({ error: 'Ошибка при удалении кодов' });
    }
});

// ==================== API РОДИТЕЛЬСКИХ КОДОВ ====================

app.get('/api/codes/parent', async (req, res) => {
    try {
        const codes = await codesDb.getAllParentCodes();
        res.json(codes);
    } catch (err) {
        console.error('Error fetching parent codes:', err);
        res.status(500).json({ error: 'Ошибка загрузки родительских кодов' });
    }
});

app.post('/api/codes/parent', async (req, res) => {
    try {
        const codeData = req.body;
        
        if (!codeData.Code) {
            return sendError(res, 'Код обязателен для заполнения', 400);
        }
        
        const existing = await codesDb.findParentCodeByValue(codeData.Code);
        if (existing) {
            return sendDuplicateError(res, 'Родительский код', codeData.Code);
        }
        
        const parentCodeData = {
            Code: codeData.Code,
            Description: codeData.Description || '',
            Status: codeData.Status || 'Доступен',
            HasCoefficient: codeData.HasCoefficient || false,
            CoefficientValue: codeData.CoefficientValue || null,
            CoefficientType: codeData.CoefficientType || 'none',
            CheckCoefficient: codeData.CheckCoefficient || false,  // НОВОЕ ПОЛЕ
            adminName: codeData.adminName || 'admin'
        };
        
        const id = await codesDb.addParentCode(parentCodeData);
        
        if (!id) {
            return sendError(res, 'Не удалось добавить родительский код', 500);
        }
        
        await logger.logAdminAction(
            codeData.adminName || 'admin',
            'add_parent_code',
            'parent_code',
            id,
            { 
                code: codeData.Code, 
                description: codeData.Description, 
                hasCoefficient: codeData.HasCoefficient, 
                coefficientValue: codeData.CoefficientValue,
                checkCoefficient: codeData.CheckCoefficient  // НОВОЕ ПОЛЕ
            },
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, id, message: 'Родительский код успешно добавлен' });
    } catch (err) {
        console.error('Error adding parent code:', err);
        
        if (err.code === 'SQLITE_CONSTRAINT') {
            return sendDuplicateError(res, 'Родительский код', req.body.Code);
        }
        
        res.status(500).json({ error: 'Ошибка при добавлении родительского кода' });
    }
});

app.put('/api/codes/parent/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const codeId = parseInt(id);
        
        if (isNaN(codeId)) {
            return sendError(res, 'Неверный идентификатор кода', 400);
        }
        
        const { Code } = req.body;
        
        if (Code) {
            const existing = await codesDb.findParentCodeByValue(Code);
            if (existing && existing.id !== codeId) {
                return sendDuplicateError(res, 'Родительский код', Code);
            }
        }
        
        const updateData = {
            Code: req.body.Code,
            Description: req.body.Description,
            Status: req.body.Status,
            HasCoefficient: req.body.HasCoefficient,
            CoefficientValue: req.body.CoefficientValue,
            CoefficientType: req.body.CoefficientType,
            CheckCoefficient: req.body.CheckCoefficient,  // НОВОЕ ПОЛЕ
            adminName: req.body.adminName || 'admin'
        };
        
        const success = await codesDb.updateParentCode(codeId, updateData);
        
        if (!success) {
            return sendError(res, 'Родительский код не найден', 404);
        }
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'update_parent_code',
            'parent_code',
            codeId,
            updateData,
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, message: 'Родительский код успешно обновлен' });
    } catch (err) {
        console.error('Error updating parent code:', err);
        res.status(500).json({ error: 'Ошибка при обновлении родительского кода' });
    }
});

app.delete('/api/codes/parent', async (req, res) => {
    try {
        const idsToDelete = req.body;
        
        if (!Array.isArray(idsToDelete) || idsToDelete.length === 0) {
            return sendError(res, 'Ожидается массив ID для удаления', 400);
        }
        
        const validIds = idsToDelete.filter(id => !isNaN(parseInt(id)));
        
        if (validIds.length === 0) {
            return sendError(res, 'Неверные идентификаторы кодов', 400);
        }
        
        const deleted = await codesDb.deleteParentCodes(validIds);
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'delete_parent_codes',
            'parent_codes',
            null,
            { count: deleted, ids: validIds },
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, message: `Удалено ${deleted} родительских кодов` });
    } catch (err) {
        console.error('Error deleting parent codes:', err);
        res.status(500).json({ error: 'Ошибка при удалении родительских кодов' });
    }
});

// ==================== API ИЕРАРХИЧЕСКИХ КОДОВ ====================

app.get('/api/codes/hierarchical', async (req, res) => {
    try {
        const codes = await codesDb.getAllHierarchicalCodes();
        res.json(codes);
    } catch (err) {
        console.error('Error fetching hierarchical codes:', err);
        res.status(500).json({ error: 'Ошибка загрузки иерархических кодов' });
    }
});

app.get('/api/codes/hierarchical/level/:level', async (req, res) => {
    try {
        const { level } = req.params;
        const levelNum = parseInt(level);
        
        if (isNaN(levelNum) || levelNum < 1 || levelNum > 4) {
            return sendError(res, 'Уровень должен быть от 1 до 4', 400);
        }
        
        const codes = await codesDb.getHierarchicalCodesByLevel(levelNum);
        res.json(codes);
    } catch (err) {
        console.error('Error fetching hierarchical codes by level:', err);
        res.status(500).json({ error: 'Ошибка загрузки иерархических кодов' });
    }
});

app.post('/api/codes/hierarchical', async (req, res) => {
    try {
        console.log('🔵 POST /api/codes/hierarchical - Начало обработки');
        console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
        
        const codeData = req.body;
        
        if (!codeData.Code) {
            console.log('❌ Ошибка: Код не указан');
            return sendError(res, 'Код обязателен для заполнения', 400);
        }
        
        if (!codeData.Level || codeData.Level < 1 || codeData.Level > 4) {
            console.log('❌ Ошибка: Неверный уровень', codeData.Level);
            return sendError(res, 'Уровень кода должен быть от 1 до 4', 400);
        }
        
        console.log('✅ Валидация пройдена');
        console.log(`Поиск существующего кода: ${codeData.Code}, уровень ${codeData.Level}`);
        
        const existing = await codesDb.findHierarchicalCodeByCodeAndLevel(codeData.Code, codeData.Level);
        if (existing) {
            console.log('⚠️ Код уже существует:', existing);
            return res.status(409).json({ 
                error: 'Иерархический код уже существует',
                details: `Код "${codeData.Code}" уровня ${codeData.Level} уже есть в базе данных`,
                field: 'code',
                value: codeData.Code
            });
        }
        
        console.log('✅ Код уникален, добавляем...');
        
        const id = await codesDb.addHierarchicalCode(codeData);
        
        if (!id) {
            console.log('❌ addHierarchicalCode вернул null/false');
            return sendError(res, 'Не удалось добавить иерархический код', 500);
        }
        
        console.log(`✅ Код успешно добавлен с ID: ${id}`);
        
        await logger.logAdminAction(
            codeData.adminName || 'admin',
            'add_hierarchical_code',
            'hierarchical_code',
            id,
            { 
                code: codeData.Code, 
                level: codeData.Level, 
                description: codeData.Description, 
                coefficientValue: codeData.CoefficientValue 
            },
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, id, message: 'Иерархический код успешно добавлен' });
    } catch (err) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА в POST /api/codes/hierarchical:');
        console.error('Ошибка:', err);
        console.error('Стек:', err.stack);
        console.error('Request body:', req.body);
        
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ error: 'Иерархический код уже существует' });
        }
        
        res.status(500).json({ 
            error: 'Ошибка при добавлении иерархического кода',
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

app.put('/api/codes/hierarchical/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const codeId = parseInt(id);
        
        if (isNaN(codeId)) {
            return sendError(res, 'Неверный идентификатор кода', 400);
        }
        
        const success = await codesDb.updateHierarchicalCode(codeId, req.body);
        
        if (!success) {
            return sendError(res, 'Код не найден', 404);
        }
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'update_hierarchical_code',
            'hierarchical_code',
            codeId,
            req.body,
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, message: 'Иерархический код успешно обновлен' });
    } catch (err) {
        console.error('Error updating hierarchical code:', err);
        res.status(500).json({ error: 'Ошибка при обновлении иерархического кода' });
    }
});

app.delete('/api/codes/hierarchical/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const codeId = parseInt(id);
        
        if (isNaN(codeId)) {
            return sendError(res, 'Неверный идентификатор кода', 400);
        }
        
        const success = await codesDb.deleteHierarchicalCode(codeId);
        
        if (!success) {
            return sendError(res, 'Код не найден', 404);
        }
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'delete_hierarchical_code',
            'hierarchical_code',
            codeId,
            {},
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, message: 'Иерархический код успешно удален' });
    } catch (err) {
        console.error('Error deleting hierarchical code:', err);
        res.status(500).json({ error: 'Ошибка при удалении иерархического кода' });
    }
});

// ==================== API СВЯЗЕЙ КОДОВ ====================

app.get('/api/codes/relations', async (req, res) => {
    try {
        const relations = await codesDb.getAllCodeRelations();
        res.json(relations);
    } catch (err) {
        console.error('Error fetching relations:', err);
        res.status(500).json({ error: 'Ошибка загрузки связей' });
    }
});

app.post('/api/codes/relations', async (req, res) => {
    try {
        const { sourceCode, targetCode, relationType, description } = req.body;
        
        if (!sourceCode || !targetCode) {
            return sendError(res, 'Исходный и целевой коды обязательны', 400);
        }
        
        if (sourceCode === targetCode) {
            return sendError(res, 'Нельзя создать связь кода с самим собой', 400);
        }
        
        const existing = await codesDb.findCodeRelation(sourceCode, targetCode);
        if (existing) {
            return res.status(409).json({ 
                error: 'Связь уже существует',
                details: `Связь между "${sourceCode}" и "${targetCode}" уже добавлена`,
                field: 'relation',
                value: `${sourceCode} → ${targetCode}`
            });
        }
        
        if (relationType === 'duplicate') {
            const reverseExisting = await codesDb.findCodeRelation(targetCode, sourceCode);
            if (reverseExisting) {
                return res.status(409).json({ 
                    error: 'Обратная связь уже существует',
                    details: `Связь между "${targetCode}" и "${sourceCode}" уже существует. Возможно, вы хотите использовать существующую связь?`,
                    field: 'relation',
                    value: `${targetCode} → ${sourceCode}`
                });
            }
        }
        
        const id = await codesDb.addCodeRelation(sourceCode, targetCode, relationType || 'duplicate', description || '');
        
        if (!id) {
            return sendError(res, 'Не удалось добавить связь', 500);
        }
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'add_relation',
            'code_relation',
            id,
            { sourceCode, targetCode, relationType },
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, id, message: 'Связь успешно добавлена' });
    } catch (err) {
        console.error('Error adding relation:', err);
        
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ error: 'Связь уже существует' });
        }
        
        res.status(500).json({ error: 'Ошибка при добавлении связи' });
    }
});

app.delete('/api/codes/relations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const relationId = parseInt(id);
        
        if (isNaN(relationId)) {
            return sendError(res, 'Неверный идентификатор связи', 400);
        }
        
        const success = await codesDb.deleteCodeRelation(relationId);
        
        if (!success) {
            return sendError(res, 'Связь не найдена', 404);
        }
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'delete_relation',
            'code_relation',
            relationId,
            {},
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, message: 'Связь успешно удалена' });
    } catch (err) {
        console.error('Error deleting relation:', err);
        res.status(500).json({ error: 'Ошибка при удалении связи' });
    }
});

// ==================== API СТАТИСТИКИ ====================

app.get('/api/codes/stats', async (req, res) => {
    try {
        const stats = await codesDb.getCodesStats();
        res.json(stats);
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Ошибка загрузки статистики' });
    }
});

// ==================== API ВАЛИДАЦИИ ====================

app.post('/api/validate-code', async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return sendError(res, 'Код не указан', 400);
        }
        
        if (typeof code !== 'string') {
            return sendError(res, 'Код должен быть строкой', 400);
        }
        
        const parsed = codesDb.parseCodeStructure(code);
        const normalized = codesDb.normalizeCode(code);
        const isRestoration = codesDb.isRestorationCode(code);
        const match = await codesDb.findHierarchicalMatch(code);
        
        const result = {
            code,
            normalized,
            isRestoration,
            inDatabase: !!match,
            matchType: match?.matchType || 'none',
            matchedLevel: match?.matchedLevel || 'none',
            status: match?.status,
            description: match?.description,
            hasCoefficient: match?.has_coefficient || false,
            coefficientType: match?.coefficient_type || 'none',
            coefficientValue: match?.coefficient_value || null
        };
        
        if (parsed) {
            result.structure = {
                chapter: parsed.chapter,
                collection: parsed.collection,
                section: parsed.section,
                table: parsed.table_num,
                standard: parsed.standard,
                levels: parsed.levels
            };
        }
        
        res.json(result);
    } catch (err) {
        console.error('Error validating code:', err);
        res.status(500).json({ error: 'Ошибка при проверке кода' });
    }
});

// ==================== API ПОЛЬЗОВАТЕЛЕЙ ====================

app.get('/api/users', async (req, res) => {
    try {
        const users = await usersDb.getAllUsers();
        const safeUsers = users.map(user => {
            const { password, ...safeUser } = user;
            return safeUser;
        });
        res.json(safeUsers);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Ошибка загрузки пользователей' });
    }
});

app.get('/api/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (isNaN(userId)) {
            return sendError(res, 'Неверный идентификатор пользователя', 400);
        }
        
        const user = await usersDb.getUserById(userId);
        
        if (!user) {
            return sendError(res, 'Пользователь не найден', 404);
        }
        
        const { password, ...safeUser } = user;
        res.json(safeUser);
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ error: 'Ошибка загрузки пользователя' });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { username, password, institution, fullname, role } = req.body;
        
        if (!username || !password) {
            return sendError(res, 'Имя пользователя и пароль обязательны', 400);
        }
        
        if (password.length < 4) {
            return sendError(res, 'Пароль должен содержать минимум 4 символа', 400);
        }
        
        if (username.length < 3) {
            return sendError(res, 'Логин должен содержать минимум 3 символа', 400);
        }
        
        const existingUser = await usersDb.findUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ 
                error: 'Пользователь уже существует',
                details: `Пользователь с логином "${username}" уже зарегистрирован`,
                field: 'username',
                value: username
            });
        }
        
        const userId = await usersDb.createUser(username, password, institution, fullname, role || 'user');
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'create_user',
            'user',
            userId,
            { username, institution, fullname, role },
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, id: userId, message: 'Пользователь успешно создан' });
    } catch (err) {
        console.error('Error creating user:', err);
        
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
        }
        
        res.status(500).json({ error: 'Ошибка при создании пользователя' });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = parseInt(id);
        
        if (isNaN(userId)) {
            return sendError(res, 'Неверный идентификатор пользователя', 400);
        }
        
        const { username } = req.body;
        
        if (username) {
            const existingUser = await usersDb.findUserByUsername(username);
            if (existingUser && existingUser.id !== userId) {
                return res.status(409).json({ 
                    error: 'Пользователь уже существует',
                    details: `Пользователь с логином "${username}" уже зарегистрирован`,
                    field: 'username',
                    value: username
                });
            }
        }
        
        const success = await usersDb.updateUser(userId, req.body);
        
        if (!success) {
            return sendError(res, 'Пользователь не найден', 404);
        }
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'update_user',
            'user',
            userId,
            req.body,
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, message: 'Пользователь успешно обновлен' });
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: 'Ошибка при обновлении пользователя' });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = parseInt(id);
        
        if (isNaN(userId)) {
            return sendError(res, 'Неверный идентификатор пользователя', 400);
        }
        
        const success = await usersDb.deleteUser(userId);
        
        if (!success) {
            return sendError(res, 'Пользователь не найден или это администратор', 404);
        }
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'delete_user',
            'user',
            userId,
            {},
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, message: 'Пользователь успешно удален' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Ошибка при удалении пользователя' });
    }
});

// ==================== API ЛОГОВ ====================

app.get('/api/logs/dashboard', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        
        if (isNaN(days) || days < 1 || days > 365) {
            return sendError(res, 'Неверное количество дней (должно быть от 1 до 365)', 400);
        }
        
        const stats = await logsDb.getDashboardStats(days);
        res.json(stats);
    } catch (err) {
        console.error('Error fetching dashboard stats:', err);
        res.status(500).json({ error: 'Ошибка загрузки статистики' });
    }
});

app.get('/api/logs/sessions', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        if (isNaN(limit) || limit < 1 || limit > 1000) {
            return sendError(res, 'Неверный лимит (должен быть от 1 до 1000)', 400);
        }
        
        if (isNaN(offset) || offset < 0) {
            return sendError(res, 'Неверное смещение', 400);
        }
        
        const sessions = await logsDb.getSessionsHistory(limit, offset);
        res.json(sessions);
    } catch (err) {
        console.error('Error fetching sessions:', err);
        res.status(500).json({ error: 'Ошибка загрузки сессий' });
    }
});

app.get('/api/logs/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        if (!sessionId || typeof sessionId !== 'string') {
            return sendError(res, 'Неверный идентификатор сессии', 400);
        }
        
        const session = await logsDb.getSessionDetails(sessionId);
        
        if (!session) {
            return sendError(res, 'Сессия не найдена', 404);
        }
        
        res.json(session);
    } catch (err) {
        console.error('Error fetching session details:', err);
        res.status(500).json({ error: 'Ошибка загрузки деталей сессии' });
    }
});
// server.js - добавить новые маршруты

// ==================== EXECUTIVE DASHBOARD API ====================

/**
 * GET /api/executive/top-users
 * Топ пользователей с расширенной статистикой
 */
app.get('/api/executive/top-users', async (req, res) => {
    try {
        const { days = 30, limit = 20, sortBy = 'accuracy' } = req.query;
        
        const users = await logsDb.getTopUsersWithStats(parseInt(days), parseInt(limit), sortBy);
        
        // Добавляем рейтинг и тренд
        const maxSessions = Math.max(...users.map(u => u.sessions_count), 1);
        const maxAccuracy = Math.max(...users.map(u => u.avg_accuracy), 1);
        
        const enriched = users.map(user => ({
            ...user,
            rating: Math.round(
                (user.avg_accuracy / maxAccuracy) * 50 +
                (user.sessions_count / maxSessions) * 30 +
                (1 - (user.coefficient_mismatches / (user.coefficient_matches + 1)) / 10) * 20
            ),
            trend: user.accuracy_trend || 0
        }));
        
        res.json({ success: true, users: enriched });
    } catch (err) {
        console.error('Error fetching top users:', err);
        res.status(500).json({ error: 'Ошибка загрузки пользователей' });
    }
});

/**
 * GET /api/executive/top-errors
 * Топ ошибок с группировкой по проектам
 */
app.get('/api/executive/top-errors', async (req, res) => {
    try {
        const { days = 30, limit = 50, status = 'all' } = req.query;
        
        const errors = await logsDb.getTopErrorsWithProjects(parseInt(days), parseInt(limit), status);
        
        res.json({ success: true, errors });
    } catch (err) {
        console.error('Error fetching top errors:', err);
        res.status(500).json({ error: 'Ошибка загрузки ошибок' });
    }
});

/**
 * GET /api/executive/user-projects/:userId
 * Проекты конкретного пользователя с проблемами
 */
app.get('/api/executive/user-projects/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { days = 90 } = req.query;
        
        const projects = await logsDb.getUserProjectsWithProblems(parseInt(userId), parseInt(days));
        
        res.json({ success: true, projects });
    } catch (err) {
        console.error('Error fetching user projects:', err);
        res.status(500).json({ error: 'Ошибка загрузки проектов' });
    }
});

/**
 * GET /api/executive/error-details/:errorId
 * Детали конкретной ошибки (код, проекты, сметы)
 */
app.get('/api/executive/error-details/:errorId', async (req, res) => {
    try {
        const { errorId } = req.params;
        
        const details = await logsDb.getErrorDetails(errorId);
        
        res.json({ success: true, ...details });
    } catch (err) {
        console.error('Error fetching error details:', err);
        res.status(500).json({ error: 'Ошибка загрузки деталей' });
    }
});

/**
 * GET /api/executive/error-tree
 * Древо проблем по иерархии кодов
 */
app.get('/api/executive/error-tree', async (req, res) => {
    try {
        const { days = 30 } = req.query;
        
        const tree = await logsDb.getErrorHierarchyTree(parseInt(days));
        
        res.json({ success: true, tree });
    } catch (err) {
        console.error('Error fetching error tree:', err);
        res.status(500).json({ error: 'Ошибка загрузки дерева ошибок' });
    }
});
app.get('/api/logs/match-types', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        
        if (isNaN(days) || days < 1 || days > 365) {
            return sendError(res, 'Неверное количество дней (должно быть от 1 до 365)', 400);
        }
        
        const now = new Date();
        const startDate = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
        const endDate = now.toISOString();
        
        const stats = await logsDb.getMatchTypeDistribution(startDate, endDate);
        res.json(stats);
    } catch (err) {
        console.error('Error fetching match types:', err);
        res.status(500).json({ error: 'Ошибка загрузки распределения типов совпадений' });
    }
});

app.post('/api/logs/cleanup', async (req, res) => {
    try {
        const { days = 30 } = req.body;
        
        if (isNaN(days) || days < 1 || days > 365) {
            return sendError(res, 'Неверное количество дней (должно быть от 1 до 365)', 400);
        }
        
        const result = await logsDb.clearLogsOlderThan(days);
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'cleanup_logs',
            'logs',
            null,
            { days, deleted: result },
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('Error cleaning up logs:', err);
        res.status(500).json({ error: 'Ошибка при очистке логов' });
    }
});

app.post('/api/logs/clear', async (req, res) => {
    try {
        await logsDb.clearAllLogs();
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'clear_all_logs',
            'logs',
            null,
            {},
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, message: 'Все логи успешно удалены' });
    } catch (err) {
        console.error('Error clearing logs:', err);
        res.status(500).json({ error: 'Ошибка при удалении логов' });
    }
});

// ==================== ЕДИНЫЙ АНАЛИТИЧЕСКИЙ API ====================
app.get('/api/analytics', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const projectId = req.query.project_id ? parseInt(req.query.project_id) : null;

        const usersAnalytics = await logsDb.getUsersAnalytics(days, projectId);

        const now = new Date();
        const moscowNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
        const startDate = new Date(moscowNow - days * 24 * 60 * 60 * 1000).toISOString();
        const endDate = moscowNow.toISOString();
        const overview = await logsDb.getSessionsStats(startDate, endDate);

        const projects = projectId === null ? await logsDb.getAllProjectsAdmin() : [];

        res.json({
            success: true,
            period: days,
            projectId: projectId,
            users: usersAnalytics,
            overview: {
                total_sessions: overview.total_sessions || 0,
                total_codes: overview.total_codes || 0,
                found_codes: overview.found_codes || 0,
                avg_accuracy: overview.avg_accuracy || 0,
                total_amount: overview.total_amount || 0
            },
            projects: projects.slice(0, 50)
        });
    } catch (err) {
        console.error('Ошибка загрузки аналитики:', err);
        res.status(500).json({ error: 'Ошибка загрузки аналитики' });
    }
});

// ==================== СЕССИИ ПОЛЬЗОВАТЕЛЯ ДЛЯ АНАЛИТИКИ ====================
app.get('/api/analytics/user-sessions', async (req, res) => {
    try {
        const { user_name, days, project_id } = req.query;
        if (!user_name) return sendError(res, 'Не указан пользователь', 400);
        const daysNum = parseInt(days) || 30;
        const projectId = project_id ? parseInt(project_id) : null;
        const sessions = await logsDb.getUserSessions(user_name, daysNum, projectId);
        res.json(sessions);
    } catch (err) {
        console.error('Error fetching user sessions:', err);
        res.status(500).json({ error: 'Ошибка загрузки сессий пользователя' });
    }
});

// ==================== ТОП ПРОБЛЕМНЫХ КОДОВ ====================
app.get('/api/analytics/problem-codes', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const limit = parseInt(req.query.limit) || 20;
        const result = await logsDb.getTopProblemCodes(days, limit);
        res.json(result);
    } catch (err) {
        console.error('Error fetching top problem codes:', err);
        res.status(500).json({ error: 'Ошибка загрузки проблемных кодов' });
    }
});

// ==================== ТИПЫ СОВПАДЕНИЙ В ДИНАМИКЕ ====================
app.get('/api/analytics/match-type-trend', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const result = await logsDb.getMatchTypeTrend(days);
        res.json(result);
    } catch (err) {
        console.error('Error fetching match type trend:', err);
        res.status(500).json({ error: 'Ошибка загрузки тренда типов совпадений' });
    }
});

// ==================== ДАШБОРД РУКОВОДИТЕЛЯ ====================
app.get('/api/analytics/manager-dashboard', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const result = await logsDb.getManagerDashboard(days);
        res.json(result);
    } catch (err) {
        console.error('Error fetching manager dashboard:', err);
        res.status(500).json({ error: 'Ошибка загрузки дашборда' });
    }
});

// ==================== ЭКСПОРТ ДЕТАЛЕЙ СЕССИИ В CSV ====================
app.get('/api/analytics/session-export/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await logsDb.getSessionDetails(sessionId);
        if (!session) return sendError(res, 'Сессия не найдена', 404);
        
        const rows = [['Позиция','Строка','Код','Тип','Статус','Коэффициент','Описание']];
        if (session.codes) {
            for (const c of session.codes) {
                let matchType = c.matchType || '';
                let coeff = c.hasCoefficient ? 
                    (c.coefficientMatch === true ? '✅' : c.coefficientMatch === false ? '⚠️' : '') + 
                    (c.expectedCoefficient ? c.expectedCoefficient + '/' : '') + 
                    (c.coefficientValue || c.coefficientType || '') : '-';
                rows.push([
                    c.position,
                    c.rowNumber || '',
                    c.code,
                    matchType,
                    c.status,
                    coeff,
                    c.description || ''
                ]);
            }
        }
        const csv = rows.map(r => r.map(v => '"' + (v || '').replace(/"/g,'""') + '"').join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=session_${sessionId}.csv`);
        res.send('\uFEFF' + csv);
    } catch (err) {
        console.error('Error exporting session:', err);
        res.status(500).json({ error: 'Ошибка экспорта' });
    }
});

// ==================== API ПРОЕКТОВ (АДМИН) ====================

app.get('/api/admin/projects', async (req, res) => {
    try {
        const projects = await logsDb.getAllProjectsAdmin();
        res.json(projects);
    } catch (err) {
        console.error('Error fetching admin projects:', err);
        res.status(500).json({ error: 'Ошибка загрузки проектов' });
    }
});

app.get('/api/admin/projects/:projectId/sessions', async (req, res) => {
    try {
        const { projectId } = req.params;
        const sessions = await logsDb.getProjectSessions(parseInt(projectId));
        res.json(sessions);
    } catch (err) {
        console.error('Error fetching project sessions:', err);
        res.status(500).json({ error: 'Ошибка загрузки сессий проекта' });
    }
});

app.get('/api/admin/projects/:projectId/problem-codes', async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        if (isNaN(projectId)) return sendError(res, 'Неверный ID проекта', 400);
        const data = await logsDb.getProjectProblemCodes(projectId);
        res.json(data);
    } catch (err) {
        console.error('Error fetching project problem codes:', err);
        res.status(500).json({ error: 'Ошибка загрузки проблемных кодов' });
    }
});

app.post('/api/admin/projects/:projectId/archive', async (req, res) => {
    try {
        const { projectId } = req.params;
        await logsDb.adminUpdateProjectStatus(parseInt(projectId), 'archived');
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'archive_project',
            'project',
            projectId,
            {},
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error archiving project:', err);
        res.status(500).json({ error: 'Ошибка архивации' });
    }
});

app.post('/api/admin/projects/:projectId/restore', async (req, res) => {
    try {
        const { projectId } = req.params;
        await logsDb.adminUpdateProjectStatus(parseInt(projectId), 'active');
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'restore_project',
            'project',
            projectId,
            {},
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error restoring project:', err);
        res.status(500).json({ error: 'Ошибка восстановления' });
    }
});

app.delete('/api/admin/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        await logsDb.adminDeleteProject(parseInt(projectId));
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'delete_project',
            'project',
            projectId,
            {},
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting project:', err);
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', async (req, res) => {
    try {
        const codesStats = await codesDb.getCodesStats();
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            databases: {
                codes: { exists: true, stats: codesStats },
                logs: { exists: true },
                users: { exists: true }
            }
        });
    } catch (err) {
        console.error('Health check error:', err);
        res.status(500).json({ 
            status: 'error', 
            error: 'Ошибка при проверке состояния системы',
            timestamp: new Date().toISOString()
        });
    }
});
// ==================== ОТЧЁТ ПО ИСПОЛЬЗОВАНИЮ (EXCEL) ====================
// ==================== ОТЧЁТ ПО ИСПОЛЬЗОВАНИЮ (EXCEL) ====================
app.get('/api/reports/usage', async (req, res) => {
    try {
        // 1. Количество зарегистрированных пользователей
        const users = await usersDb.getAllUsers();
        const totalUsers = users.length;

        // 2. Количество уникальных имён файлов
        const uniqueFilesResult = await db.query(`
            SELECT COUNT(DISTINCT filename) AS cnt
            FROM sessions
            WHERE filename IS NOT NULL
        `);
        const totalUniqueFiles = uniqueFilesResult[0]?.cnt || 0;

        // 3. Общая сумма всех смет
        const totalAmountResult = await db.query(`
            SELECT ISNULL(SUM(total_amount), 0) AS total
            FROM sessions
            WHERE total_amount IS NOT NULL AND total_amount > 0
        `);
        const totalAmount = totalAmountResult[0]?.total || 0;

        // 4. Проблемные коды + итоговая сумма каждой сметы
        const problemCodes = await db.query(`
            SELECT 
                s.filename,
                s.user_name,
                s.estimate_name,
                s.created_at,
                s.total_amount AS estimate_total_amount,
                cd.code,
                cd.description,
                cd.status,
                cd.match_type,
                cd.position,
                cd.row_number
            FROM code_details cd
            JOIN sessions s ON cd.session_id = s.session_id
            WHERE cd.status IN (N'Нельзя применять', N'Обратите внимание')
            ORDER BY s.created_at DESC, cd.position
        `);

        // Excel-книга
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Сметная админ-панель';
        workbook.created = new Date();

        // Лист 1: Общая статистика
        const statsSheet = workbook.addWorksheet('Общая статистика');
        statsSheet.columns = [
            { header: 'Показатель', key: 'label', width: 50 },
            { header: 'Значение', key: 'value', width: 25 }
        ];
        statsSheet.addRows([
            { label: 'Количество зарегистрированных пользователей', value: totalUsers },
            { label: 'Количество уникальных загруженных файлов', value: totalUniqueFiles },
            //{ label: 'Общая итоговая сумма всех смет (₽)', value: totalAmount.toLocaleString('ru-RU') + ' ₽' },
            { label: 'Кодов со статусом «Нельзя применять»', value: problemCodes.filter(c => c.status === 'Нельзя применять').length },
            { label: 'Кодов со статусом «Обратите внимание»', value: problemCodes.filter(c => c.status === 'Обратите внимание').length }
        ]);
        statsSheet.getRow(1).font = { bold: true };

        // Столбцы для листов с кодами (добавлен столбец с суммой сметы)
        const codeColumns = [
            { header: 'Файл', key: 'filename', width: 30 },
            { header: 'Пользователь', key: 'user_name', width: 20 },
            { header: 'Смета', key: 'estimate_name', width: 25 },
            { header: 'Дата сессии', key: 'created_at', width: 22 },
            { header: 'Итоговая сумма сметы (₽)', key: 'estimate_total_amount', width: 20 },
            { header: 'Код', key: 'code', width: 22 },
            { header: 'Описание', key: 'description', width: 40 },
            { header: 'Тип совпадения', key: 'match_type', width: 18 },
            { header: 'Позиция', key: 'position', width: 10 },
            { header: 'Строка', key: 'row_number', width: 10 }
        ];

        // Функция для форматирования строк
        const mapRow = (c) => ({
            filename: c.filename,
            user_name: c.user_name,
            estimate_name: c.estimate_name,
            created_at: c.created_at ? new Date(c.created_at).toLocaleString('ru-RU') : '',
            estimate_total_amount: c.estimate_total_amount != null
                ? Number(c.estimate_total_amount).toLocaleString('ru-RU') + ' ₽'
                : '—',
            code: c.code,
            description: c.description,
            match_type: c.match_type,
            position: c.position,
            row_number: c.row_number
        });

        // Лист 2: Нельзя применять
        const forbiddenSheet = workbook.addWorksheet('Нельзя применять');
        forbiddenSheet.columns = codeColumns;
        forbiddenSheet.addRows(
            problemCodes
                .filter(c => c.status === 'Нельзя применять')
                .map(mapRow)
        );
        forbiddenSheet.getRow(1).font = { bold: true };

        // Лист 3: Обратите внимание
        const warningSheet = workbook.addWorksheet('Обратите внимание');
        warningSheet.columns = codeColumns;
        warningSheet.addRows(
            problemCodes
                .filter(c => c.status === 'Обратите внимание')
                .map(mapRow)
        );
        warningSheet.getRow(1).font = { bold: true };

        // Отправка файла
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=usage_report_${new Date().toISOString().slice(0,10)}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Ошибка генерации отчёта:', err);
        res.status(500).json({ error: 'Не удалось создать отчёт' });
    }
});
// server.js - ДОБАВИТЬ В КОНЕЦ ФАЙЛА, ПЕРЕД СТАТИКОЙ

// ==================== РАСШИРЕННЫЕ СВЯЗИ API ====================

// Получить все связи (включая расширенные)
app.get('/api/codes/relations', async (req, res) => {
    try {
        const relations = await codesDb.getAllCodeRelations();
        res.json(relations);
    } catch (err) {
        console.error('Error fetching relations:', err);
        res.status(500).json({ error: 'Ошибка загрузки связей' });
    }
});

// Добавить расширенную связь
app.post('/api/codes/relations/extended', async (req, res) => {
    try {
        const { sourceCode, targetCode, relationType, conditions, description, adminName } = req.body;
        
        if (!sourceCode || !targetCode) {
            return sendError(res, 'Исходный и целевой коды обязательны', 400);
        }
        
        // Проверка на допустимые типы связей
        const validTypes = ['must_be_together', 'conflict', 'check_coefficient', 'conditional'];
        if (!validTypes.includes(relationType)) {
            return sendError(res, 'Неверный тип связи. Допустимые: must_be_together, conflict, check_coefficient, conditional', 400);
        }
        
        // Проверяем существование обычной связи
        const existing = await codesDb.findCodeRelation(sourceCode, targetCode);
        if (existing) {
            return res.status(409).json({ 
                error: 'Связь уже существует',
                details: `Связь между "${sourceCode}" и "${targetCode}" уже добавлена`,
                field: 'relation',
                value: `${sourceCode} → ${targetCode}`
            });
        }
        
        const id = await codesDb.addExtendedRelation(sourceCode, targetCode, relationType, conditions, description);
        
        if (!id) {
            return sendError(res, 'Не удалось добавить связь', 500);
        }
        
        await logger.logAdminAction(
            adminName || req.body.adminName || 'admin',
            'add_extended_relation',
            'code_relation',
            id,
            { sourceCode, targetCode, relationType, conditions, description },
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, id, message: 'Расширенная связь успешно добавлена' });
    } catch (err) {
        console.error('Error adding extended relation:', err);
        res.status(500).json({ error: 'Ошибка при добавлении расширенной связи: ' + err.message });
    }
});

// Проверить связи в сессии (для анализатора)
app.post('/api/analyze/check-relations', async (req, res) => {
    try {
        const { codes, sessionId } = req.body;
        
        if (!codes || !Array.isArray(codes)) {
            return sendError(res, 'Массив кодов обязателен', 400);
        }
        
        const result = await codesDb.checkRelationsInSession(codes);
        
        // Логируем результат проверки
        if (result.warnings.length > 0 || result.errors.length > 0 || result.checks.length > 0) {
            console.log(`🔗 Проверка связей для сессии ${sessionId || 'unknown'}: найдено ${result.errors.length} ошибок, ${result.warnings.length} предупреждений, ${result.checks.length} проверок`);
        }
        
        res.json({ 
            success: true, 
            warnings: result.warnings,
            errors: result.errors,
            checks: result.checks,
            total: result.warnings.length + result.errors.length + result.checks.length
        });
    } catch (err) {
        console.error('Error checking relations in session:', err);
        res.status(500).json({ error: 'Ошибка при проверке связей: ' + err.message });
    }
});

// Получить все расширенные связи
app.get('/api/codes/relations/extended', async (req, res) => {
    try {
        const allRelations = await codesDb.getAllCodeRelations();
        const extendedRelations = allRelations.filter(r => r.extended_type === 1);
        res.json(extendedRelations);
    } catch (err) {
        console.error('Error fetching extended relations:', err);
        res.status(500).json({ error: 'Ошибка загрузки расширенных связей' });
    }
});

// Получить связи по типу
app.get('/api/codes/relations/type/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const validTypes = ['must_be_together', 'conflict', 'check_coefficient', 'conditional', 'duplicate', 'related'];
        
        if (!validTypes.includes(type)) {
            return sendError(res, 'Неверный тип связи', 400);
        }
        
        const allRelations = await codesDb.getAllCodeRelations();
        const filteredRelations = allRelations.filter(r => r.relation_type === type);
        res.json(filteredRelations);
    } catch (err) {
        console.error('Error fetching relations by type:', err);
        res.status(500).json({ error: 'Ошибка загрузки связей по типу' });
    }
});

// Удалить связь (обновлено для расширенных связей)
app.delete('/api/codes/relations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const relationId = parseInt(id);
        
        if (isNaN(relationId)) {
            return sendError(res, 'Неверный идентификатор связи', 400);
        }
        
        // Получаем информацию о связи перед удалением для логирования
        const relation = await codesDb.getOne(`SELECT * FROM code_relations WHERE id = @p0`, [relationId]);
        
        const success = await codesDb.deleteCodeRelation(relationId);
        
        if (!success) {
            return sendError(res, 'Связь не найдена', 404);
        }
        
        await logger.logAdminAction(
            req.body.adminName || 'admin',
            'delete_relation',
            'code_relation',
            relationId,
            { relation_type: relation?.relation_type, extended: relation?.extended_type === 1 },
            req.headers['x-forwarded-for'] || req.socket.remoteAddress
        );
        
        res.json({ success: true, message: 'Связь успешно удалена' });
    } catch (err) {
        console.error('Error deleting relation:', err);
        res.status(500).json({ error: 'Ошибка при удалении связи' });
    }
});
// ==================== СТАТИКА ====================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res) => {
    res.status(404).json({ error: 'API endpoint не найден' });
});

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ==================== ЗАПУСК ====================

(async () => {
    try {
        await codesDb.initDatabase();
        await usersDb.initUsersDatabase();
        await logsDb.initLogsDatabase();
        
        app.listen(PORT, () => {
            console.log('\n' + '='.repeat(60));
            console.log(`🚀 АДМИН-ПАНЕЛЬ запущена на http://localhost:${PORT}`);
            console.log('='.repeat(60));
            console.log('✨ Поддержка иерархических кодов и коэффициентов');
            console.log('🛡️  Включена защита от дубликатов');
            console.log('📊 API версия 1.0.0');
            console.log('📈 Аналитика: пользователи, проекты, эффективность');
            console.log('📁 Управление проектами');
            console.log('='.repeat(60) + '\n');
        });
    } catch (err) {
        console.error('❌ Ошибка инициализации баз данных:', err);
        process.exit(1);
    }
})();