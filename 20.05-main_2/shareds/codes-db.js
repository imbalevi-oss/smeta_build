// shareds/codes-db.js - ПОЛНАЯ ВЕРСИЯ С ПОДДЕРЖКОЙ РАСШИРЕННЫХ СВЯЗЕЙ И ПРОВЕРКИ КОЭФФИЦИЕНТОВ

const db = require('./db');
const { run, query, getOne, getLastInsertId, createTableIfNotExists, addColumnIfNotExists } = db;

// ==================== ФУНКЦИИ НОРМАЛИЗАЦИИ И РАЗБОРА ====================
function normalizeCode(code) {
    if (!code) return '';
    return String(code)
        .trim()
        .replace(/\s+/g, '')
        .replace(/[‑–—]/g, '-')
        .replace(/[\\/]/g, '/')
        .toLowerCase();
}

function isRestorationCode(code) {
    if (!code) return false;
    const normCode = normalizeCode(code);
    const patterns = [
        /^\d+\.\d+-5[1-9]\d{2}/,
        /[-\/]5[1-9]\d{2}[-\/]/
    ];
    return patterns.some(pattern => pattern.test(normCode));
}

function parseCodeStructure(code) {
    if (!code) return null;
    const normalized = normalizeCode(code);
    const pattern = /^(\d+)\.(\d+)-(\d+)-(\d+)(?:-(\d+(?:\/\d+)?))?$/;
    const match = normalized.match(pattern);
    if (!match) return null;
    return {
        full: normalized,
        chapter: parseInt(match[1]),
        collection: parseInt(match[2]),
        section: parseInt(match[3]),
        table_num: parseInt(match[4]),
        standard: match[5] || null,
        levels: {
            chapter: `${match[1]}`,
            collection: `${match[1]}.${match[2]}`,
            section: `${match[1]}.${match[2]}-${match[3]}`,
            table: `${match[1]}.${match[2]}-${match[3]}-${match[4]}`,
            full: normalized
        }
    };
}

function getCodeLevel(code) {
    const parsed = parseCodeStructure(code);
    if (!parsed) return 0;
    if (parsed.standard) return 5;
    if (parsed.table_num && !parsed.standard) return 4;
    if (parsed.section && !parsed.table_num) return 3;
    if (parsed.collection && !parsed.section) return 2;
    if (parsed.chapter && !parsed.collection) return 1;
    return 0;
}

// ==================== ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ====================
async function initDatabase() {
    await createTableIfNotExists('codes', `
        CREATE TABLE codes (
            id INT IDENTITY(1,1) PRIMARY KEY,
            code NVARCHAR(255) NOT NULL,
            normalized_code NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX),
            status NVARCHAR(50) DEFAULT 'Доступен',
            is_restoration INT DEFAULT 0,
            is_exact INT DEFAULT 1,
            has_coefficient INT DEFAULT 0,
            coefficient_type NVARCHAR(20) DEFAULT 'none',
            coefficient_value FLOAT,
            check_coefficient INT DEFAULT 0,
            chapter INT,
            collection INT,
            section INT,
            table_num INT,
            standard NVARCHAR(50),
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE()),
            updated_at DATETIME2
        )
    `);

    await createTableIfNotExists('hierarchical_codes', `
        CREATE TABLE hierarchical_codes (
            id INT IDENTITY(1,1) PRIMARY KEY,
            code NVARCHAR(255) NOT NULL,
            normalized_code NVARCHAR(255) NOT NULL,
            level INT NOT NULL,
            level_name NVARCHAR(50) NOT NULL,
            chapter INT,
            collection INT,
            section INT,
            table_num INT,
            description NVARCHAR(MAX),
            status NVARCHAR(50) DEFAULT 'Доступен',
            has_coefficient INT DEFAULT 0,
            coefficient_type NVARCHAR(20) DEFAULT 'none',
            coefficient_value FLOAT,
            check_coefficient INT DEFAULT 0,
            parent_id INT,
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE()),
            updated_at DATETIME2,
            FOREIGN KEY (parent_id) REFERENCES hierarchical_codes(id)
        )
    `);

    await createTableIfNotExists('parent_codes', `
        CREATE TABLE parent_codes (
            id INT IDENTITY(1,1) PRIMARY KEY,
            code NVARCHAR(255) NOT NULL,
            normalized_code NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX),
            status NVARCHAR(50) DEFAULT 'Доступен',
            has_coefficient INT DEFAULT 0,
            coefficient_type NVARCHAR(20) DEFAULT 'none',
            coefficient_value FLOAT,
            check_coefficient INT DEFAULT 0,
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE()),
            updated_at DATETIME2
        )
    `);

    await createTableIfNotExists('code_relations', `
        CREATE TABLE code_relations (
            id INT IDENTITY(1,1) PRIMARY KEY,
            source_code NVARCHAR(255) NOT NULL,
            target_code NVARCHAR(255) NOT NULL,
            relation_type NVARCHAR(30) DEFAULT 'duplicate',
            extended_type INT DEFAULT 0,
            conditions NVARCHAR(MAX),
            description NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE())
        )
    `);

    await createTableIfNotExists('code_relation_groups', `
        CREATE TABLE code_relation_groups (
            id INT IDENTITY(1,1) PRIMARY KEY,
            group_name NVARCHAR(255),
            source_code NVARCHAR(255) NOT NULL,
            relation_type NVARCHAR(30) DEFAULT 'must_be_together',
            extended_type INT DEFAULT 1,
            conditions NVARCHAR(MAX),
            description NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE())
        )
    `);

    await createTableIfNotExists('code_relation_targets', `
        CREATE TABLE code_relation_targets (
            id INT IDENTITY(1,1) PRIMARY KEY,
            group_id INT NOT NULL,
            target_code NVARCHAR(255) NOT NULL,
            target_type NVARCHAR(20) DEFAULT 'required',
            priority INT DEFAULT 0,
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE()),
            FOREIGN KEY (group_id) REFERENCES code_relation_groups(id) ON DELETE CASCADE
        )
    `);

    // Индексы
    try { await run(`CREATE INDEX idx_codes_normalized ON codes (normalized_code)`); } catch(e) {}
    try { await run(`CREATE INDEX idx_hierarchical_level ON hierarchical_codes (level, chapter, collection, section, table_num)`); } catch(e) {}
    try { await run(`CREATE INDEX idx_parent_codes_normalized ON parent_codes (normalized_code)`); } catch(e) {}
    try { await run(`CREATE INDEX idx_code_relations_source ON code_relations (source_code)`); } catch(e) {}
    try { await run(`CREATE INDEX idx_code_relations_type ON code_relations (relation_type, extended_type)`); } catch(e) {}
    try { await run(`CREATE INDEX idx_relation_groups_source ON code_relation_groups (source_code)`); } catch(e) {}
    try { await run(`CREATE INDEX idx_relation_targets_group ON code_relation_targets (group_id)`); } catch(e) {}

    // Добавляем недостающие колонки
    await addColumnIfNotExists('codes', 'coefficient_value', 'FLOAT');
    await addColumnIfNotExists('codes', 'check_coefficient', 'INT DEFAULT 0');
    await addColumnIfNotExists('hierarchical_codes', 'coefficient_value', 'FLOAT');
    await addColumnIfNotExists('hierarchical_codes', 'check_coefficient', 'INT DEFAULT 0');
    await addColumnIfNotExists('parent_codes', 'coefficient_value', 'FLOAT');
    await addColumnIfNotExists('parent_codes', 'check_coefficient', 'INT DEFAULT 0');
    await addColumnIfNotExists('code_relations', 'extended_type', 'INT DEFAULT 0');
    await addColumnIfNotExists('code_relations', 'conditions', 'NVARCHAR(MAX)');

    console.log('✅ База данных кодов инициализирована (MS SQL) с московским временем');
}

// ==================== МАССОВАЯ ВЫГРУЗКА ДЛЯ КЭША ====================
async function getAllCodesMap() {
    const rows = await query(`SELECT * FROM codes`);
    const map = new Map();
    for (const row of rows) {
        map.set(row.normalized_code, row);
    }
    return map;
}

async function getAllHierarchicalMap() {
    const rows = await query(`SELECT * FROM hierarchical_codes`);
    const map = new Map();
    for (const row of rows) {
        const key = `${row.level}|${row.chapter ?? ''}|${row.collection ?? ''}|${row.section ?? ''}|${row.table_num ?? ''}`;
        map.set(key, row);
    }
    return map;
}

async function getAllRelationsMap() {
    const rows = await query(`SELECT * FROM code_relations`);
    const map = new Map();
    for (const row of rows) {
        if (!map.has(row.source_code)) map.set(row.source_code, []);
        map.get(row.source_code).push(row);
    }
    return map;
}

async function getAllParentCodesMap() {
    const rows = await query(`SELECT * FROM parent_codes`);
    const map = new Map();
    for (const row of rows) {
        map.set(row.normalized_code, row);
    }
    return map;
}

// ==================== ТОЧНЫЕ КОДЫ ====================
async function getAllExactCodes() {
    return await query(`SELECT * FROM codes ORDER BY id DESC`);
}

async function findExactCodeByValue(code) {
    const normalized = normalizeCode(code);
    return await getOne(`SELECT * FROM codes WHERE normalized_code = @p0`, [normalized]);
}

async function findExactCodeById(id) {
    return await getOne(`SELECT * FROM codes WHERE id = @p0`, [id]);
}

async function addExactCode(codeData) {
    console.log('🔵 addExactCode START');
    console.log('Code:', codeData.Code);
    console.log('Description:', codeData.Description);
    
    try {
        const normalized = normalizeCode(codeData.Code);
        console.log('Normalized:', normalized);
        
        const parsed = parseCodeStructure(codeData.Code);
        const isRestoration = codeData.IsRestoration !== undefined ? codeData.IsRestoration : isRestorationCode(codeData.Code);
        const hasCoefficient = codeData.HasCoefficient ? 1 : 0;
        const coefficientType = codeData.CoefficientType || 'none';
        const coefficientValue = codeData.CoefficientValue || null;
        const checkCoefficient = codeData.CheckCoefficient ? 1 : 0;
        const status = codeData.Status === 'внимание' ? 'Обратите внимание' : (codeData.Status || 'Доступен');

        const exists = await getOne(`SELECT id FROM codes WHERE normalized_code = @p0`, [normalized]);
        if (exists) {
            console.log('Code already exists, returning null');
            return null;
        }

        const insertSql = `
            INSERT INTO codes 
                (code, normalized_code, description, status, is_restoration, is_exact, 
                 has_coefficient, coefficient_type, coefficient_value, check_coefficient,
                 chapter, collection, section, table_num, standard)
            OUTPUT INSERTED.id
            VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14)
        `;
        
        const insertParams = [
            codeData.Code.trim(), normalized, codeData.Description || '', status,
            isRestoration ? 1 : 0, 1, hasCoefficient, coefficientType, coefficientValue, checkCoefficient,
            parsed ? parsed.chapter : null, parsed ? parsed.collection : null,
            parsed ? parsed.section : null, parsed ? parsed.table_num : null,
            parsed ? parsed.standard : null
        ];
        
        console.log('Executing INSERT with OUTPUT...');
        
        const pool = await db.getPool();
        const request = pool.request();
        
        insertParams.forEach((param, index) => {
            request.input(`p${index}`, param);
        });
        
        const result = await request.query(insertSql);
        console.log('Query result:', result);
        
        let id = null;
        if (result.recordset && result.recordset[0] && result.recordset[0].id) {
            id = result.recordset[0].id;
        }
        
        console.log('Final ID:', id);
        return id;
    } catch (error) {
        console.error('❌ addExactCode ERROR:', error.message);
        console.error('Stack:', error.stack);
        throw error;
    }
}

async function updateExactCode(id, updatedData) {
    const code = updatedData.Code;
    const normalized = normalizeCode(code);
    const parsed = parseCodeStructure(code);
    const isRestoration = isRestorationCode(code);
    const hasCoefficient = updatedData.HasCoefficient ? 1 : 0;
    const coefficientType = updatedData.CoefficientType || 'none';
    const coefficientValue = updatedData.CoefficientValue || null;
    const checkCoefficient = updatedData.CheckCoefficient ? 1 : 0;
    const status = updatedData.Status === 'внимание' ? 'Обратите внимание' : (updatedData.Status || 'Доступен');

    const result = await run(`
        UPDATE codes 
        SET code = @p0, normalized_code = @p1, description = @p2, status = @p3, 
            is_restoration = @p4, has_coefficient = @p5, coefficient_type = @p6, 
            coefficient_value = @p7, check_coefficient = @p8,
            chapter = @p9, collection = @p10, section = @p11, table_num = @p12, standard = @p13,
            updated_at = DATEADD(hour, 3, GETUTCDATE())
        WHERE id = @p14
    `, [
        code, normalized, updatedData.Description || '', status, isRestoration ? 1 : 0,
        hasCoefficient, coefficientType, coefficientValue, checkCoefficient,
        parsed ? parsed.chapter : null, parsed ? parsed.collection : null,
        parsed ? parsed.section : null, parsed ? parsed.table_num : null,
        parsed ? parsed.standard : null,
        id
    ]);
    return result.changes > 0;
}

async function deleteExactCodes(ids) {
    if (!ids.length) return 0;
    const placeholders = ids.map((_, i) => `@p${i}`).join(',');
    const result = await run(`DELETE FROM codes WHERE id IN (${placeholders})`, ids);
    return result.changes;
}

// ==================== ИЕРАРХИЧЕСКИЕ КОДЫ ====================
async function getHierarchicalCodeByLevel(level, chapter, collection = null, section = null, tableNum = null) {
    let sql = `SELECT * FROM hierarchical_codes WHERE level = @p0 AND chapter = @p1`;
    const params = [level, chapter];
    if (collection !== null && collection !== undefined) {
        sql += ` AND collection = @p2`;
        params.push(collection);
    } else if (level === 1) {
        sql += ` AND collection IS NULL`;
    }
    if (section !== null && section !== undefined) {
        sql += ` AND section = @p${params.length}`;
        params.push(section);
    } else if (level === 2) {
        sql += ` AND section IS NULL`;
    }
    if (tableNum !== null && tableNum !== undefined) {
        sql += ` AND table_num = @p${params.length}`;
        params.push(tableNum);
    } else if (level === 3) {
        sql += ` AND table_num IS NULL`;
    }
    return getOne(sql, params);
}

async function findHierarchicalCodeByCodeAndLevel(code, level) {
    const normalized = normalizeCode(code);
    const parsed = parseCodeStructure(normalized);
    if (!parsed) return null;
    return await getHierarchicalCodeByLevel(level, parsed.chapter, parsed.collection, parsed.section, parsed.table_num);
}

async function addHierarchicalCode(codeData) {
    console.log('🔵 addHierarchicalCode вызвана с данными:', JSON.stringify(codeData, null, 2));
    
    try {
        const normalized = normalizeCode(codeData.Code);
        console.log('Нормализованный код:', normalized);
        
        const parsed = parseCodeStructure(normalized);
        console.log('Распарсенная структура:', parsed);

        if (!parsed) {
            console.log('⚠️ Не удалось распарсить код, пробуем простые форматы');
            
            const simpleMatch = normalized.match(/^(\d+)$/);
            if (simpleMatch) {
                console.log('Обнаружен формат главы');
                const chapter = parseInt(simpleMatch[1]);
                
                const exists = await getOne(`SELECT id FROM hierarchical_codes WHERE level = 1 AND chapter = @p0`, [chapter]);
                if (exists) {
                    console.log('Глава уже существует');
                    return null;
                }
                
                const result = await run(`
                    INSERT INTO hierarchical_codes 
                        (code, normalized_code, level, level_name, chapter, collection, section, table_num,
                         description, status, has_coefficient, coefficient_type, coefficient_value, check_coefficient, created_at)
                    OUTPUT INSERTED.id
                    VALUES (@p0, @p1, 1, 'chapter', @p2, NULL, NULL, NULL, @p3, @p4, @p5, @p6, @p7, @p8, DATEADD(hour, 3, GETUTCDATE()))
                `, [
                    codeData.Code.trim(), normalized, chapter,
                    codeData.Description || '', codeData.Status || 'Доступен',
                    codeData.HasCoefficient ? 1 : 0, codeData.CoefficientType || 'none', codeData.CoefficientValue || null,
                    codeData.CheckCoefficient ? 1 : 0
                ]);
                
                let id = null;
                if (result && result.recordset && result.recordset[0]) {
                    id = result.recordset[0].id;
                } else if (result && result.id) {
                    id = result.id;
                } else {
                    const lastId = await getOne(`SELECT SCOPE_IDENTITY() as id`);
                    id = lastId ? lastId.id : null;
                }
                
                console.log(`✅ Глава добавлена с ID: ${id}`);
                return id;
            }
            
            const collectionMatch = normalized.match(/^(\d+)\.(\d+)$/);
            if (collectionMatch) {
                console.log('Обнаружен формат сборника');
                const chapter = parseInt(collectionMatch[1]);
                const collection = parseInt(collectionMatch[2]);
                
                const parent = await getHierarchicalCodeByLevel(1, chapter);
                const exists = await getOne(`SELECT id FROM hierarchical_codes WHERE level = 2 AND chapter = @p0 AND collection = @p1`, [chapter, collection]);
                if (exists) {
                    console.log('Сборник уже существует');
                    return null;
                }
                
                const result = await run(`
                    INSERT INTO hierarchical_codes 
                        (code, normalized_code, level, level_name, chapter, collection, section, table_num,
                         description, status, has_coefficient, coefficient_type, coefficient_value, check_coefficient, parent_id, created_at)
                    OUTPUT INSERTED.id
                    VALUES (@p0, @p1, 2, 'collection', @p2, @p3, NULL, NULL, @p4, @p5, @p6, @p7, @p8, @p9, @p10, DATEADD(hour, 3, GETUTCDATE()))
                `, [
                    codeData.Code.trim(), normalized, chapter, collection,
                    codeData.Description || '', codeData.Status || 'Доступен',
                    codeData.HasCoefficient ? 1 : 0, codeData.CoefficientType || 'none', codeData.CoefficientValue || null,
                    codeData.CheckCoefficient ? 1 : 0,
                    parent ? parent.id : null
                ]);
                
                let id = null;
                if (result && result.recordset && result.recordset[0]) {
                    id = result.recordset[0].id;
                } else {
                    const lastId = await getOne(`SELECT SCOPE_IDENTITY() as id`);
                    id = lastId ? lastId.id : null;
                }
                
                console.log(`✅ Сборник добавлен с ID: ${id}`);
                return id;
            }
            
            const sectionMatch = normalized.match(/^(\d+)\.(\d+)-(\d+)$/);
            if (sectionMatch) {
                console.log('Обнаружен формат отдела/раздела');
                const chapter = parseInt(sectionMatch[1]);
                const collection = parseInt(sectionMatch[2]);
                const section = parseInt(sectionMatch[3]);
                
                const parent = await getHierarchicalCodeByLevel(2, chapter, collection);
                const exists = await getOne(`SELECT id FROM hierarchical_codes WHERE level = 3 AND chapter = @p0 AND collection = @p1 AND section = @p2`, [chapter, collection, section]);
                if (exists) {
                    console.log('Отдел уже существует');
                    return null;
                }
                
                const result = await run(`
                    INSERT INTO hierarchical_codes 
                        (code, normalized_code, level, level_name, chapter, collection, section, table_num,
                         description, status, has_coefficient, coefficient_type, coefficient_value, check_coefficient, parent_id, created_at)
                    OUTPUT INSERTED.id
                    VALUES (@p0, @p1, 3, 'section', @p2, @p3, @p4, NULL, @p5, @p6, @p7, @p8, @p9, @p10, @p11, DATEADD(hour, 3, GETUTCDATE()))
                `, [
                    codeData.Code.trim(), normalized, chapter, collection, section,
                    codeData.Description || '', codeData.Status || 'Доступен',
                    codeData.HasCoefficient ? 1 : 0, codeData.CoefficientType || 'none', codeData.CoefficientValue || null,
                    codeData.CheckCoefficient ? 1 : 0,
                    parent ? parent.id : null
                ]);
                
                let id = null;
                if (result && result.recordset && result.recordset[0]) {
                    id = result.recordset[0].id;
                } else {
                    const lastId = await getOne(`SELECT SCOPE_IDENTITY() as id`);
                    id = lastId ? lastId.id : null;
                }
                
                console.log(`✅ Отдел добавлен с ID: ${id}`);
                return id;
            }
            
            const tableMatch = normalized.match(/^(\d+)\.(\d+)-(\d+)-(\d+)$/);
            if (tableMatch) {
                console.log('Обнаружен формат таблицы');
                const chapter = parseInt(tableMatch[1]);
                const collection = parseInt(tableMatch[2]);
                const section = parseInt(tableMatch[3]);
                const tableNum = parseInt(tableMatch[4]);
                
                const parent = await getHierarchicalCodeByLevel(3, chapter, collection, section);
                const exists = await getOne(`SELECT id FROM hierarchical_codes WHERE level = 4 AND chapter = @p0 AND collection = @p1 AND section = @p2 AND table_num = @p3`, [chapter, collection, section, tableNum]);
                if (exists) {
                    console.log('Таблица уже существует');
                    return null;
                }
                
                const result = await run(`
                    INSERT INTO hierarchical_codes 
                        (code, normalized_code, level, level_name, chapter, collection, section, table_num,
                         description, status, has_coefficient, coefficient_type, coefficient_value, check_coefficient, parent_id, created_at)
                    OUTPUT INSERTED.id
                    VALUES (@p0, @p1, 4, 'table', @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, DATEADD(hour, 3, GETUTCDATE()))
                `, [
                    codeData.Code.trim(), normalized, chapter, collection, section, tableNum,
                    codeData.Description || '', codeData.Status || 'Доступен',
                    codeData.HasCoefficient ? 1 : 0, codeData.CoefficientType || 'none', codeData.CoefficientValue || null,
                    codeData.CheckCoefficient ? 1 : 0,
                    parent ? parent.id : null
                ]);
                
                let id = null;
                if (result && result.recordset && result.recordset[0]) {
                    id = result.recordset[0].id;
                } else {
                    const lastId = await getOne(`SELECT SCOPE_IDENTITY() as id`);
                    id = lastId ? lastId.id : null;
                }
                
                console.log(`✅ Таблица добавлена с ID: ${id}`);
                return id;
            }
            
            throw new Error(`Неверный формат кода для иерархического добавления: ${codeData.Code}`);
        }

        let level = codeData.Level || 0;
        let levelName = '';
        let parentId = null;

        if (level === 0) {
            if (parsed.standard) level = 5;
            else if (parsed.table_num) level = 4;
            else if (parsed.section) level = 3;
            else if (parsed.collection) level = 2;
            else if (parsed.chapter) level = 1;
        }

        const levelNames = { 1: 'chapter', 2: 'collection', 3: 'section', 4: 'table', 5: 'exact' };
        levelName = levelNames[level] || 'unknown';

        if (level === 2) {
            const parent = await getHierarchicalCodeByLevel(1, parsed.chapter);
            if (parent) parentId = parent.id;
        } else if (level === 3) {
            const parent = await getHierarchicalCodeByLevel(2, parsed.chapter, parsed.collection);
            if (parent) parentId = parent.id;
        } else if (level === 4) {
            const parent = await getHierarchicalCodeByLevel(3, parsed.chapter, parsed.collection, parsed.section);
            if (parent) parentId = parent.id;
        }

        const exists = await getOne(`
            SELECT id FROM hierarchical_codes 
            WHERE level = @p0 AND chapter = @p1 
            AND (collection = @p2 OR (collection IS NULL AND @p2 IS NULL))
            AND (section = @p3 OR (section IS NULL AND @p3 IS NULL))
            AND (table_num = @p4 OR (table_num IS NULL AND @p4 IS NULL))
        `, [level, parsed.chapter, parsed.collection || null, parsed.section || null, parsed.table_num || null]);
        
        if (exists) {
            console.log('Код уже существует (через parseCodeStructure)');
            return null;
        }

        const result = await run(`
            INSERT INTO hierarchical_codes 
                (code, normalized_code, level, level_name, chapter, collection, section, table_num,
                 description, status, has_coefficient, coefficient_type, coefficient_value, check_coefficient, parent_id, created_at)
            OUTPUT INSERTED.id
            VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14, DATEADD(hour, 3, GETUTCDATE()))
        `, [
            codeData.Code.trim(), normalized, level, levelName,
            parsed.chapter, parsed.collection || null, parsed.section || null, parsed.table_num || null,
            codeData.Description || '', codeData.Status || 'Доступен',
            codeData.HasCoefficient ? 1 : 0, codeData.CoefficientType || 'none', codeData.CoefficientValue || null,
            codeData.CheckCoefficient ? 1 : 0,
            parentId
        ]);
        
        let id = null;
        if (result && result.recordset && result.recordset[0]) {
            id = result.recordset[0].id;
        } else if (result && result.id) {
            id = result.id;
        } else {
            const lastId = await getOne(`SELECT SCOPE_IDENTITY() as id`);
            id = lastId ? lastId.id : null;
        }
        
        console.log(`✅ Иерархический код добавлен с ID: ${id}`);
        return id;
    } catch (error) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА в addHierarchicalCode:');
        console.error('Error:', error);
        console.error('Stack:', error.stack);
        throw error;
    }
}

async function getAllHierarchicalCodes() {
    return await query(`SELECT * FROM hierarchical_codes ORDER BY level, chapter, collection, section, table_num`);
}

async function getHierarchicalCodesByLevel(level) {
    return await query(`SELECT * FROM hierarchical_codes WHERE level = @p0 ORDER BY chapter, collection, section, table_num`, [level]);
}

async function updateHierarchicalCode(id, updatedData) {
    const hasCoefficient = updatedData.HasCoefficient ? 1 : 0;
    const coefficientType = updatedData.CoefficientType || 'none';
    const coefficientValue = updatedData.CoefficientValue || null;
    const checkCoefficient = updatedData.CheckCoefficient ? 1 : 0;

    const result = await run(`
        UPDATE hierarchical_codes 
        SET description = @p0, status = @p1, has_coefficient = @p2, 
            coefficient_type = @p3, coefficient_value = @p4, check_coefficient = @p5,
            updated_at = DATEADD(hour, 3, GETUTCDATE())
        WHERE id = @p6
    `, [updatedData.Description || '', updatedData.Status || 'Доступен', hasCoefficient, coefficientType, coefficientValue, checkCoefficient, id]);
    return result.changes > 0;
}

async function deleteHierarchicalCode(id) {
    const result = await run(`DELETE FROM hierarchical_codes WHERE id = @p0`, [id]);
    return result.changes > 0;
}

// ==================== РОДИТЕЛЬСКИЕ КОДЫ ====================
async function getAllParentCodes() {
    return await query(`SELECT * FROM parent_codes ORDER BY id DESC`);
}

async function findParentCodeByValue(code) {
    const normalized = normalizeCode(code);
    return await getOne(`SELECT * FROM parent_codes WHERE normalized_code = @p0`, [normalized]);
}

async function addParentCode(codeData) {
    const normalized = normalizeCode(codeData.Code);
    const hasCoefficient = codeData.HasCoefficient ? 1 : 0;
    const coefficientType = codeData.CoefficientType || 'none';
    const coefficientValue = codeData.CoefficientValue || null;
    const checkCoefficient = codeData.CheckCoefficient ? 1 : 0;
    const status = codeData.Status === 'внимание' ? 'Обратите внимание' : (codeData.Status || 'Доступен');

    const exists = await getOne(`SELECT id FROM parent_codes WHERE normalized_code = @p0`, [normalized]);
    if (exists) return null;

    await run(`
        INSERT INTO parent_codes (code, normalized_code, description, status, has_coefficient, coefficient_type, coefficient_value, check_coefficient)
        VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7)
    `, [codeData.Code.trim(), normalized, codeData.Description || '', status, hasCoefficient, coefficientType, coefficientValue, checkCoefficient]);
    
    const result = await getOne(`SELECT SCOPE_IDENTITY() as id`);
    return result ? result.id : null;
}

async function updateParentCode(id, updatedData) {
    const code = updatedData.Code;
    const normalized = normalizeCode(code);
    const hasCoefficient = updatedData.HasCoefficient ? 1 : 0;
    const coefficientType = updatedData.CoefficientType || 'none';
    const coefficientValue = updatedData.CoefficientValue || null;
    const checkCoefficient = updatedData.CheckCoefficient ? 1 : 0;
    const status = updatedData.Status === 'внимание' ? 'Обратите внимание' : (updatedData.Status || 'Доступен');

    const result = await run(`
        UPDATE parent_codes 
        SET code = @p0, normalized_code = @p1, description = @p2, status = @p3,
            has_coefficient = @p4, coefficient_type = @p5, coefficient_value = @p6, 
            check_coefficient = @p7, updated_at = DATEADD(hour, 3, GETUTCDATE())
        WHERE id = @p8
    `, [code, normalized, updatedData.Description || '', status, hasCoefficient, coefficientType, coefficientValue, checkCoefficient, id]);
    return result.changes > 0;
}

async function deleteParentCodes(ids) {
    if (!ids.length) return 0;
    const placeholders = ids.map((_, i) => `@p${i}`).join(',');
    const result = await run(`DELETE FROM parent_codes WHERE id IN (${placeholders})`, ids);
    return result.changes;
}

// ==================== СВЯЗИ КОДОВ ====================
async function getAllCodeRelations() {
    return await query(`SELECT * FROM code_relations ORDER BY id DESC`);
}

async function findRelationsBySource(sourceCode) {
    const normalized = normalizeCode(sourceCode);
    return await query(`SELECT * FROM code_relations WHERE source_code = @p0`, [normalized]);
}

async function findCodeRelation(sourceCode, targetCode) {
    const normalizedSource = normalizeCode(sourceCode);
    const normalizedTarget = normalizeCode(targetCode);
    return await getOne(`SELECT * FROM code_relations WHERE source_code = @p0 AND target_code = @p1`, [normalizedSource, normalizedTarget]);
}

async function addCodeRelation(sourceCode, targetCode, relationType = 'duplicate', description = '') {
    const normalizedSource = normalizeCode(sourceCode);
    const normalizedTarget = normalizeCode(targetCode);

    const exists = await getOne(`SELECT id FROM code_relations WHERE source_code = @p0 AND target_code = @p1`, [normalizedSource, normalizedTarget]);
    if (exists) return null;

    await run(`
        INSERT INTO code_relations (source_code, target_code, relation_type, description)
        VALUES (@p0, @p1, @p2, @p3)
    `, [normalizedSource, normalizedTarget, relationType, description]);
    
    const result = await getOne(`SELECT SCOPE_IDENTITY() as id`);
    return result ? result.id : null;
}

async function deleteCodeRelation(id) {
    const result = await run(`DELETE FROM code_relations WHERE id = @p0`, [id]);
    return result.changes > 0;
}

// ==================== РАСШИРЕННЫЕ СВЯЗИ КОДОВ ====================

async function addExtendedRelation(sourceCode, targetCode, relationType, conditions = null, description = '') {
    const normalizedSource = normalizeCode(sourceCode);
    const normalizedTarget = normalizeCode(targetCode);
    
    const validTypes = ['must_be_together', 'conflict', 'check_coefficient', 'conditional'];
    if (!validTypes.includes(relationType)) {
        throw new Error(`Неверный тип связи: ${relationType}`);
    }
    
    const exists = await getOne(`
        SELECT id FROM code_relations 
        WHERE source_code = @p0 AND target_code = @p1 AND relation_type = @p2
    `, [normalizedSource, normalizedTarget, relationType]);
    
    if (exists) return null;
    
    const conditionsJson = conditions ? JSON.stringify(conditions) : null;
    
    await run(`
        INSERT INTO code_relations 
            (source_code, target_code, relation_type, conditions, description, extended_type)
        VALUES (@p0, @p1, @p2, @p3, @p4, 1)
    `, [normalizedSource, normalizedTarget, relationType, conditionsJson, description]);
    
    const result = await getOne(`SELECT SCOPE_IDENTITY() as id`);
    return result ? result.id : null;
}

// ==================== ГРУППОВЫЕ РАСШИРЕННЫЕ СВЯЗИ ====================

async function addExtendedRelationGroup(sourceCode, relationType, targets, conditions = null, description = '', groupName = null) {
    const normalizedSource = normalizeCode(sourceCode);
    
    const validTypes = ['must_be_together', 'conflict', 'check_coefficient', 'conditional'];
    if (!validTypes.includes(relationType)) {
        throw new Error(`Неверный тип связи: ${relationType}`);
    }
    
    if (!targets || targets.length === 0) {
        throw new Error('Необходимо указать хотя бы один целевой код');
    }
    
    const conditionsJson = conditions ? JSON.stringify(conditions) : null;
    const groupNameValue = groupName || `${sourceCode}_${relationType}_${Date.now()}`;
    
    await run(`
        INSERT INTO code_relation_groups 
            (group_name, source_code, relation_type, extended_type, conditions, description, created_at)
        VALUES (@p0, @p1, @p2, 1, @p3, @p4, DATEADD(hour, 3, GETUTCDATE()))
    `, [groupNameValue, normalizedSource, relationType, conditionsJson, description]);
    
    const groupResult = await getOne(`SELECT SCOPE_IDENTITY() as id`);
    const groupId = groupResult ? groupResult.id : null;
    
    if (!groupId) return null;
    
    for (const target of targets) {
        const normalizedTarget = normalizeCode(target.code);
        const targetType = target.targetType || 'required';
        const priority = target.priority || 0;
        
        await run(`
            INSERT INTO code_relation_targets (group_id, target_code, target_type, priority)
            VALUES (@p0, @p1, @p2, @p3)
        `, [groupId, normalizedTarget, targetType, priority]);
    }
    
    return groupId;
}

async function getAllExtendedRelationGroups() {
    const groups = await query(`
        SELECT g.*, 
               COUNT(t.id) as targets_count,
               STRING_AGG(t.target_code, ', ') as targets_list
        FROM code_relation_groups g
        LEFT JOIN code_relation_targets t ON g.id = t.group_id
        GROUP BY g.id, g.group_name, g.source_code, g.relation_type, g.extended_type, g.conditions, g.description, g.created_at
        ORDER BY g.id DESC
    `);
    
    for (const group of groups) {
        group.targets = await query(`
            SELECT id, target_code, target_type, priority
            FROM code_relation_targets
            WHERE group_id = @p0
            ORDER BY priority DESC, id
        `, [group.id]);
    }
    
    return groups;
}

async function deleteExtendedRelationGroup(groupId) {
    const result = await run(`DELETE FROM code_relation_groups WHERE id = @p0`, [groupId]);
    return result.changes > 0;
}

// ==================== ПРОВЕРКА СВЯЗЕЙ В СЕССИИ ====================

async function checkRelationsInSession(codes, sessionCache = null) {
    const warnings = [];
    const errors = [];
    const checks = [];
    
    if (!codes || codes.length === 0) {
        return { warnings, errors, checks };
    }
    
    const allRelations = await query(`SELECT * FROM code_relations WHERE extended_type = 1`);
    const groups = await getAllExtendedRelationGroups();
    
    if (allRelations.length === 0 && groups.length === 0) {
        return { warnings, errors, checks };
    }
    
    const allNormalizedCodes = codes.map(c => ({
        normalized: normalizeCode(c.extractedCode || c.code),
        position: c.positionNumber || c.position,
        actualCoefficient: c.actualCoefficient || c.actual_coefficient || 1,
        original: c
    }));
    
    // Проверка простых расширенных связей
    for (const relation of allRelations) {
        const sourceMatches = allNormalizedCodes.filter(c => c.normalized === relation.source_code);
        const targetMatches = allNormalizedCodes.filter(c => c.normalized === relation.target_code);
        
        switch (relation.relation_type) {
            case 'must_be_together':
                for (const source of sourceMatches) {
                    const hasTargetInSamePosition = targetMatches.some(t => t.position === source.position);
                    const hasTargetAnywhere = targetMatches.length > 0;
                    
                    if (!hasTargetInSamePosition && !hasTargetAnywhere) {
                        warnings.push({
                            type: 'must_be_together',
                            severity: 'warning',
                            sourceCode: relation.source_code,
                            targetCode: relation.target_code,
                            position: source.position,
                            message: `⚠️ Расценка ${relation.source_code} требует обязательного использования ${relation.target_code}. Добавьте её в смету.`,
                            description: relation.description
                        });
                    }
                }
                break;
                
            case 'conflict':
                const conflictingPositions = new Set();
                for (const source of sourceMatches) {
                    for (const target of targetMatches) {
                        if (source.position === target.position) {
                            if (!conflictingPositions.has(source.position)) {
                                conflictingPositions.add(source.position);
                                errors.push({
                                    type: 'conflict',
                                    severity: 'error',
                                    sourceCode: relation.source_code,
                                    targetCode: relation.target_code,
                                    position: source.position,
                                    message: `❌ Конфликт: ${relation.source_code} и ${relation.target_code} не могут использоваться вместе в одной позиции!`,
                                    description: relation.description
                                });
                            }
                        }
                    }
                }
                break;
                
            case 'check_coefficient':
                let conditions = {};
                try {
                    conditions = relation.conditions ? JSON.parse(relation.conditions) : {};
                } catch(e) { console.error('Ошибка парсинга условий:', e); }
                
                const expectedMin = conditions.expectedCoefficientRange?.min || 0.8;
                const expectedMax = conditions.expectedCoefficientRange?.max || 1.2;
                const requiredCoeff = conditions.requiredCoefficient || null;
                
                for (const code of [...sourceMatches, ...targetMatches]) {
                    const actualCoeff = code.actualCoefficient || 1;
                    let issueMessage = null;
                    
                    if (requiredCoeff !== null && Math.abs(actualCoeff - requiredCoeff) > 0.01) {
                        issueMessage = `📊 Коэффициент для ${code.normalized} должен быть равен ${requiredCoeff}. Текущий: ${actualCoeff}`;
                    } else if (actualCoeff < expectedMin) {
                        issueMessage = `📊 Коэффициент для ${code.normalized} (${actualCoeff}) ниже минимального допустимого (${expectedMin})`;
                    } else if (actualCoeff > expectedMax) {
                        issueMessage = `📊 Коэффициент для ${code.normalized} (${actualCoeff}) выше максимального допустимого (${expectedMax})`;
                    }
                    
                    if (issueMessage) {
                        checks.push({
                            type: 'check_coefficient',
                            severity: 'warning',
                            code: code.normalized,
                            position: code.position,
                            actualCoeff: actualCoeff,
                            expectedMin: expectedMin,
                            expectedMax: expectedMax,
                            requiredCoeff: requiredCoeff,
                            message: issueMessage,
                            description: relation.description
                        });
                    }
                }
                break;
                
            case 'conditional':
                let conds = {};
                try {
                    conds = relation.conditions ? JSON.parse(relation.conditions) : {};
                } catch(e) { console.error('Ошибка парсинга условий:', e); }
                
                for (const code of [...sourceMatches, ...targetMatches]) {
                    const coeff = code.actualCoefficient || 1;
                    let issueMessage = null;
                    
                    if (conds.restorationOnly && !isRestorationCode(code.normalized)) {
                        issueMessage = `🏛️ Расценка ${code.normalized} предназначена только для реставрационных работ!`;
                    } else if (conds.onlyIfCoefficientGreaterThan && coeff <= conds.onlyIfCoefficientGreaterThan) {
                        issueMessage = `ℹ️ Расценка ${code.normalized} может использоваться только при коэффициенте > ${conds.onlyIfCoefficientGreaterThan}. Текущий: ${coeff}`;
                    } else if (conds.onlyIfCoefficientLessThan && coeff >= conds.onlyIfCoefficientLessThan) {
                        issueMessage = `ℹ️ Расценка ${code.normalized} может использоваться только при коэффициенте < ${conds.onlyIfCoefficientLessThan}. Текущий: ${coeff}`;
                    }
                    
                    if (issueMessage) {
                        warnings.push({
                            type: 'conditional',
                            severity: 'warning',
                            code: code.normalized,
                            position: code.position,
                            actualCoeff: coeff,
                            message: issueMessage,
                            description: relation.description
                        });
                    }
                }
                break;
        }
    }
    
    // Проверка групповых связей
    for (const group of groups) {
        const sourceMatches = allNormalizedCodes.filter(c => c.normalized === group.source_code);
        const targetMatches = allNormalizedCodes.filter(c => 
            group.targets.some(t => t.target_code === c.normalized)
        );
        
        const requiredTargets = group.targets.filter(t => t.target_type === 'required');
        const anyOfTargets = group.targets.filter(t => t.target_type === 'any_of');
        
        switch (group.relation_type) {
            case 'must_be_together':
                for (const source of sourceMatches) {
                    const missingRequired = requiredTargets.filter(req => 
                        !targetMatches.some(t => t.normalized === req.target_code)
                    );
                    
                    if (missingRequired.length > 0) {
                        warnings.push({
                            type: 'must_be_together',
                            severity: 'warning',
                            sourceCode: group.source_code,
                            missingTargets: missingRequired.map(t => t.target_code),
                            position: source.position,
                            message: `⚠️ Расценка ${group.source_code} требует обязательного использования: ${missingRequired.map(t => t.target_code).join(', ')}. Добавьте их в смету.`,
                            description: group.description
                        });
                    }
                }
                break;
                
            case 'conflict':
                for (const source of sourceMatches) {
                    const conflictingTargets = targetMatches.filter(t => t.position === source.position);
                    
                    if (conflictingTargets.length > 0) {
                        errors.push({
                            type: 'conflict',
                            severity: 'error',
                            sourceCode: group.source_code,
                            conflictingTargets: conflictingTargets.map(t => t.normalized),
                            position: source.position,
                            message: `❌ Конфликт: ${group.source_code} не может использоваться вместе с: ${conflictingTargets.map(t => t.normalized).join(', ')} в одной позиции!`,
                            description: group.description
                        });
                    }
                }
                break;
                
            case 'check_coefficient':
                let conditions = {};
                try {
                    conditions = group.conditions ? JSON.parse(group.conditions) : {};
                } catch(e) { console.error('Ошибка парсинга условий:', e); }
                
                const expectedMin = conditions.expectedCoefficientRange?.min || 0.8;
                const expectedMax = conditions.expectedCoefficientRange?.max || 1.2;
                
                for (const code of sourceMatches) {
                    const actualCoeff = code.actualCoefficient || 1;
                    
                    if (actualCoeff < expectedMin) {
                        checks.push({
                            type: 'check_coefficient',
                            severity: 'warning',
                            code: code.normalized,
                            position: code.position,
                            actualCoeff: actualCoeff,
                            expectedMin: expectedMin,
                            expectedMax: expectedMax,
                            message: `📊 Коэффициент для ${code.normalized} (${actualCoeff}) ниже минимального допустимого (${expectedMin})`,
                            description: group.description
                        });
                    } else if (actualCoeff > expectedMax) {
                        checks.push({
                            type: 'check_coefficient',
                            severity: 'warning',
                            code: code.normalized,
                            position: code.position,
                            actualCoeff: actualCoeff,
                            expectedMin: expectedMin,
                            expectedMax: expectedMax,
                            message: `📊 Коэффициент для ${code.normalized} (${actualCoeff}) выше максимального допустимого (${expectedMax})`,
                            description: group.description
                        });
                    }
                }
                break;
                
            case 'conditional':
                let conds = {};
                try {
                    conds = group.conditions ? JSON.parse(group.conditions) : {};
                } catch(e) { console.error('Ошибка парсинга условий:', e); }
                
                for (const code of sourceMatches) {
                    const coeff = code.actualCoefficient || 1;
                    
                    if (conds.restorationOnly && !isRestorationCode(code.normalized)) {
                        warnings.push({
                            type: 'conditional',
                            severity: 'warning',
                            code: code.normalized,
                            position: code.position,
                            message: `🏛️ Расценка ${code.normalized} предназначена только для реставрационных работ!`,
                            description: group.description
                        });
                    } else if (conds.onlyIfCoefficientGreaterThan && coeff <= conds.onlyIfCoefficientGreaterThan) {
                        warnings.push({
                            type: 'conditional',
                            severity: 'warning',
                            code: code.normalized,
                            position: code.position,
                            message: `ℹ️ Расценка ${code.normalized} может использоваться только при коэффициенте > ${conds.onlyIfCoefficientGreaterThan}. Текущий: ${coeff}`,
                            description: group.description
                        });
                    } else if (conds.onlyIfCoefficientLessThan && coeff >= conds.onlyIfCoefficientLessThan) {
                        warnings.push({
                            type: 'conditional',
                            severity: 'warning',
                            code: code.normalized,
                            position: code.position,
                            message: `ℹ️ Расценка ${code.normalized} может использоваться только при коэффициенте < ${conds.onlyIfCoefficientLessThan}. Текущий: ${coeff}`,
                            description: group.description
                        });
                    }
                }
                break;
        }
    }
    
    return { warnings, errors, checks };
}

// ==================== ГЛОБАЛЬНЫЕ КЭШИ ====================
let globalCodesMap = new Map();
let globalHierarchicalMap = new Map();
let globalRelationsMap = new Map();
let globalParentMap = new Map();

function setGlobalMaps(codesMap, hierarchicalMap, relationsMap, parentMap) {
    globalCodesMap = codesMap;
    globalHierarchicalMap = hierarchicalMap;
    globalRelationsMap = relationsMap;
    globalParentMap = parentMap;
}

async function findHierarchicalMatchWithCache(code, localCache = null) {
    const normalized = normalizeCode(code);
    if (localCache && localCache.has(normalized)) {
        return localCache.get(normalized);
    }

    if (isRestorationCode(normalized)) {
        const result = {
            matchType: 'restoration',
            status: 'Нельзя применять',
            description: 'Реставрационные работы (отделы 51-59) - применение запрещено',
            has_coefficient: false,
            coefficient_type: 'none',
            coefficient_value: null,
            check_coefficient: 0,
            matchedLevel: 'restoration'
        };
        if (localCache) localCache.set(normalized, result);
        return result;
    }

    let exact = globalCodesMap.get(normalized);
    if (exact) {
        const result = {
            ...exact,
            matchType: 'exact',
            matchedLevel: 'full',
            description: exact.description || '',
            has_coefficient: exact.has_coefficient === 1,
            coefficient_value: exact.coefficient_value,
            coefficient_type: exact.coefficient_type,
            check_coefficient: exact.check_coefficient === 1
        };
        if (localCache) localCache.set(normalized, result);
        return result;
    }

    const relations = globalRelationsMap.get(normalized);
    if (relations && relations.length) {
        for (const rel of relations) {
            if (rel.extended_type === 1) continue;
            
            const targetMatch = globalCodesMap.get(rel.target_code);
            if (targetMatch) {
                let description = '';
                if (rel.relation_type === 'duplicate') {
                    description = `Дублирующий код. Рекомендуется использовать: ${targetMatch.code}${rel.description ? ' | ' + rel.description : ''}`;
                } else {
                    description = `Связанный код. Обратите внимание на: ${targetMatch.code}${rel.description ? ' | ' + rel.description : ''}`;
                }
                
                const result = {
                    ...targetMatch,
                    matchType: rel.relation_type === 'duplicate' ? 'relation_duplicate' : 'relation_related',
                    matchedLevel: 'relation',
                    description: description,
                    has_coefficient: targetMatch.has_coefficient === 1,
                    coefficient_value: targetMatch.coefficient_value,
                    coefficient_type: targetMatch.coefficient_type,
                    check_coefficient: targetMatch.check_coefficient === 1
                };
                if (localCache) localCache.set(normalized, result);
                return result;
            }
        }
    }

    const parsed = parseCodeStructure(normalized);
    if (parsed) {
        if (parsed.table_num) {
            const key = `4|${parsed.chapter}|${parsed.collection}|${parsed.section}|${parsed.table_num}`;
            const tableMatch = globalHierarchicalMap.get(key);
            if (tableMatch) {
                const result = {
                    ...tableMatch,
                    matchType: 'table',
                    matchedLevel: 'table',
                    description: tableMatch.description || '',
                    has_coefficient: tableMatch.has_coefficient === 1,
                    coefficient_value: tableMatch.coefficient_value,
                    coefficient_type: tableMatch.coefficient_type,
                    check_coefficient: tableMatch.check_coefficient === 1
                };
                if (localCache) localCache.set(normalized, result);
                return result;
            }
        }
        if (parsed.section) {
            const key = `3|${parsed.chapter}|${parsed.collection}|${parsed.section}|`;
            const sectionMatch = globalHierarchicalMap.get(key);
            if (sectionMatch) {
                const result = {
                    ...sectionMatch,
                    matchType: 'section',
                    matchedLevel: 'section',
                    description: sectionMatch.description || '',
                    has_coefficient: sectionMatch.has_coefficient === 1,
                    coefficient_value: sectionMatch.coefficient_value,
                    coefficient_type: sectionMatch.coefficient_type,
                    check_coefficient: sectionMatch.check_coefficient === 1
                };
                if (localCache) localCache.set(normalized, result);
                return result;
            }
        }
        if (parsed.collection) {
            const key = `2|${parsed.chapter}|${parsed.collection}||`;
            const collectionMatch = globalHierarchicalMap.get(key);
            if (collectionMatch) {
                const result = {
                    ...collectionMatch,
                    matchType: 'collection',
                    matchedLevel: 'collection',
                    description: collectionMatch.description || '',
                    has_coefficient: collectionMatch.has_coefficient === 1,
                    coefficient_value: collectionMatch.coefficient_value,
                    coefficient_type: collectionMatch.coefficient_type,
                    check_coefficient: collectionMatch.check_coefficient === 1
                };
                if (localCache) localCache.set(normalized, result);
                return result;
            }
        }
        const key = `1|${parsed.chapter}|||`;
        const chapterMatch = globalHierarchicalMap.get(key);
        if (chapterMatch) {
            const result = {
                ...chapterMatch,
                matchType: 'chapter',
                matchedLevel: 'chapter',
                description: chapterMatch.description || '',
                has_coefficient: chapterMatch.has_coefficient === 1,
                coefficient_value: chapterMatch.coefficient_value,
                coefficient_type: chapterMatch.coefficient_type,
                check_coefficient: chapterMatch.check_coefficient === 1
            };
            if (localCache) localCache.set(normalized, result);
            return result;
        }
    }

    const parentMatch = globalParentMap.get(normalized);
    if (parentMatch) {
        const result = {
            ...parentMatch,
            matchType: 'parent',
            matchedLevel: 'parent_collection',
            description: parentMatch.description || '',
            has_coefficient: parentMatch.has_coefficient === 1,
            coefficient_value: parentMatch.coefficient_value,
            coefficient_type: parentMatch.coefficient_type,
            check_coefficient: parentMatch.check_coefficient === 1
        };
        if (localCache) localCache.set(normalized, result);
        return result;
    }

    return null;
}

async function findHierarchicalMatch(code, localCache = null) {
    return findHierarchicalMatchWithCache(code, localCache);
}

// ==================== СТАТИСТИКА ====================
async function getCodesStats() {
    const totalExact = await getOne(`SELECT COUNT(*) as count FROM codes`);
    const totalParent = await getOne(`SELECT COUNT(*) as count FROM parent_codes`);
    const totalHierarchical = await getOne(`SELECT COUNT(*) as count FROM hierarchical_codes`);
    const restorationExact = await getOne(`SELECT COUNT(*) as count FROM codes WHERE is_restoration = 1`);
    const availableExact = await getOne(`SELECT COUNT(*) as count FROM codes WHERE status = 'Доступен'`);
    const availableParent = await getOne(`SELECT COUNT(*) as count FROM parent_codes WHERE status = 'Доступен'`);
    const warningExact = await getOne(`SELECT COUNT(*) as count FROM codes WHERE status = 'Обратите внимание'`);
    const warningParent = await getOne(`SELECT COUNT(*) as count FROM parent_codes WHERE status = 'Обратите внимание'`);
    const totalRelations = await getOne(`SELECT COUNT(*) as count FROM code_relations`);
    const chapters = await getOne(`SELECT COUNT(*) as count FROM hierarchical_codes WHERE level = 1`);
    const collections = await getOne(`SELECT COUNT(*) as count FROM hierarchical_codes WHERE level = 2`);
    const sections = await getOne(`SELECT COUNT(*) as count FROM hierarchical_codes WHERE level = 3`);
    const tables = await getOne(`SELECT COUNT(*) as count FROM hierarchical_codes WHERE level = 4`);

    return {
        total: (totalExact.count || 0) + (totalParent.count || 0) + (totalHierarchical.count || 0),
        exact: totalExact.count || 0,
        parent: totalParent.count || 0,
        hierarchical: totalHierarchical.count || 0,
        relations: totalRelations.count || 0,
        chapters: chapters.count || 0,
        collections: collections.count || 0,
        sections: sections.count || 0,
        tables: tables.count || 0,
        restoration: restorationExact.count || 0,
        available: (availableExact.count || 0) + (availableParent.count || 0),
        warning: (warningExact.count || 0) + (warningParent.count || 0)
    };
}

function isDatabaseExists() {
    return true;
}

module.exports = {
    initDatabase,
    getAllExactCodes,
    findExactCodeByValue,
    findExactCodeById,
    addExactCode,
    updateExactCode,
    deleteExactCodes,
    getAllParentCodes,
    findParentCodeByValue,
    addParentCode,
    updateParentCode,
    deleteParentCodes,
    getAllHierarchicalCodes,
    getHierarchicalCodesByLevel,
    getHierarchicalCodeByLevel,
    findHierarchicalCodeByCodeAndLevel,
    addHierarchicalCode,
    updateHierarchicalCode,
    deleteHierarchicalCode,
    getAllCodeRelations,
    findRelationsBySource,
    findCodeRelation,
    addCodeRelation,
    deleteCodeRelation,
    addExtendedRelation,
    addExtendedRelationGroup,
    getAllExtendedRelationGroups,
    deleteExtendedRelationGroup,
    checkRelationsInSession,
    findHierarchicalMatch,
    setGlobalMaps,
    getAllCodesMap,
    getAllHierarchicalMap,
    getAllRelationsMap,
    getAllParentCodesMap,
    parseCodeStructure,
    getCodeLevel,
    getCodesStats,
    normalizeCode,
    isRestorationCode,
    isDatabaseExists
};