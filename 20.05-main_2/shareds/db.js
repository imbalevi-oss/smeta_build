const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    connectionTimeout: 30000,
    requestTimeout: 60000  // 60 секунд на запрос
};

let pool = null;

async function getPool() {
    if (!pool) {
        try {
            pool = await sql.connect(config);
            const moscowTime = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
           
        } catch (err) {
            
            throw err;
        }
    }
    return pool;
}

async function query(sqlString, params = [], options = {}) {
    const pool = await getPool();
    const request = pool.request();
    
    request.timeout = options.timeout || 60000;
    
    params.forEach((param, index) => {
        request.input(`p${index}`, param);
    });
    
    const result = await request.query(sqlString);
    return result.recordset;
}

async function execute(sqlString, params = [], options = {}) {
    const pool = await getPool();
    const request = pool.request();
    
    request.timeout = options.timeout || 60000;
    
    params.forEach((param, index) => {
        request.input(`p${index}`, param);
    });
    
    const result = await request.query(sqlString);
    return result;
}
async function insertAndGetId(sqlString, params = []) {
    const pool = await getPool();
    const request = pool.request();
    
    params.forEach((param, index) => {
        request.input(`p${index}`, param);
    });
    
    const result = await request.query(sqlString);
    
    if (result.recordset && result.recordset[0] && result.recordset[0].id) {
        return result.recordset[0].id;
    }
    
    return null;
}
async function getOne(sqlString, params = [], options = {}) {
    const rows = await query(sqlString, params, options);
    
    return rows[0] || null;
}
async function getLastInsertId() {
    const result = await getOne('SELECT SCOPE_IDENTITY() as id');
    return result ? result.id : null;
}
async function run(sqlString, params = [], options = {}) {
    const pool = await getPool();
    const request = pool.request();
    
    request.timeout = options.timeout || 60000;
    
    // Используем ? вместо именованных параметров
    // mssql поддерживает позиционные параметры через ?
    if (params && params.length > 0) {
        params.forEach((param, index) => {
            request.input(`p${index}`, param);
        });
        // Заменяем ? на @p0, @p1 и т.д.
        let modifiedSql = sqlString;
        let paramIndex = 0;
        modifiedSql = modifiedSql.replace(/\?/g, () => `@p${paramIndex++}`);
        
        try {
            const result = await request.query(modifiedSql);
            
            return {
                changes: result.rowsAffected ? result.rowsAffected[0] : 0,
                recordset: result.recordset
            };
        } catch (err) {
           
            throw err;
        }
    } else {
        try {
            const result = await request.query(sqlString);
            return {
                changes: result.rowsAffected ? result.rowsAffected[0] : 0,
                recordset: result.recordset
            };
        } catch (err) {
           
            throw err;
        }
    }
}

async function getLastInsertId() {
    const row = await getOne('SELECT SCOPE_IDENTITY() as id');
    return row ? row.id : null;
}

async function tableExists(tableName) {
    const result = await getOne(`
        SELECT COUNT(*) as cnt
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = @p0
    `, [tableName]);
    return result.cnt > 0;
}

async function columnExists(tableName, columnName) {
    const result = await getOne(`
        SELECT COUNT(*) as cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @p0 AND COLUMN_NAME = @p1
    `, [tableName, columnName]);
    return result.cnt > 0;
}

async function createTableIfNotExists(tableName, createSql) {
    if (!await tableExists(tableName)) {
        await run(createSql);
      
    }
}

async function addColumnIfNotExists(tableName, columnName, columnDef) {
    if (!await columnExists(tableName, columnName)) {
        const alterSql = `ALTER TABLE [${tableName}] ADD ${columnName} ${columnDef}`;
        await run(alterSql);
       
    }
}

// ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С МОСКОВСКИМ ВРЕМЕНЕМ ====================
function getMoscowISOString() {
    const date = new Date();
    const moscowTime = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    return moscowTime.toISOString();
}

module.exports = {
    getPool,
    query,
    execute,
    getOne,
    run,
    getLastInsertId,
    tableExists,
    columnExists,
    createTableIfNotExists,
    addColumnIfNotExists,
    getMoscowISOString,
     getLastInsertId
};