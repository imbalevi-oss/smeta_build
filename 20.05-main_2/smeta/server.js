// server.js

const express = require('express');
const path = require('path');
const fs = require('fs');

const codesDb = require('../shareds/codes-db');
const usersDb = require('../shareds/users-db');
const logsDb = require('../shareds/logs-db');
const config = require('../shareds/config');
const validateEnv = require('../shareds/env-validator');
const { setGlobalMaps } = require('./lib/analysis-engine');

validateEnv();

const app = express();
const PORT = config.PORTS.SMETA;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
const publicDir = path.join(__dirname, 'public');
const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadDir));

// Routes
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/analyze'));
app.use('/api', require('./routes/projects'));
app.use('/api', require('./routes/reports'));

// Корневой маршрут
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'analyzer.html'));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Глобальный кэш кодов
let lastCacheUpdate = null;
let cacheUpdateInProgress = false;

async function refreshGlobalCache() {
    if (cacheUpdateInProgress) {
        console.log('⏳ Обновление кэша уже выполняется, пропускаем...');
        return;
    }
    
    cacheUpdateInProgress = true;
    console.log(`🔄 Обновление глобального кэша кодов...`);
    const start = Date.now();
    
    try {
        const globalCodesMap = await codesDb.getAllCodesMap();
        const globalHierarchicalMap = await codesDb.getAllHierarchicalMap();
        const globalRelationsMap = await codesDb.getAllRelationsMap();
        const globalParentMap = await codesDb.getAllParentCodesMap();
        
        setGlobalMaps(globalCodesMap, globalHierarchicalMap, globalRelationsMap);
        codesDb.setGlobalMaps(globalCodesMap, globalHierarchicalMap, globalRelationsMap, globalParentMap);
        
        lastCacheUpdate = new Date();
        console.log(`✅ Кэш обновлён за ${Date.now() - start}ms`);
        console.log(`   📊 Кодов в кэше: ${globalCodesMap.size}`);
    } catch (err) {
        console.error('❌ Ошибка обновления кэша:', err);
    } finally {
        cacheUpdateInProgress = false;
    }
}

// Запуск сервера
async function startServer() {
    try {
        console.log('\n📂 Инициализация баз данных...');
        await codesDb.initDatabase();
        await usersDb.initUsersDatabase();
        await logsDb.initLogsDatabase();
        console.log('✅ Базы данных инициализированы');
        
        await refreshGlobalCache();
        setInterval(refreshGlobalCache, 30 * 60 * 1000);
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n${'='.repeat(70)}`);
            console.log(`🚀 СЕРВЕР ЗАПУЩЕН`);
            console.log(`${'='.repeat(70)}`);
            console.log(`🌐 Адрес: http://localhost:${PORT}`);
            console.log(`🔧 Режим проверки: УНИВЕРСАЛЬНЫЙ`);
            console.log(`📁 Управление проектами: включено`);
            console.log(`${'='.repeat(70)}\n`);
        });
        
    } catch (err) {
        console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА ПРИ ЗАПУСКЕ:', err);
        process.exit(1);
    }
}

process.on('SIGINT', () => {
    console.log('\n🛑 Завершаем работу...');
    process.exit(0);
});

startServer();