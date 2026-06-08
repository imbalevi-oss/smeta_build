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
// server.js - убедитесь, что эта строка есть
app.use('/api', require('./routes/compare'));
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
        
        return;
    }
    
    cacheUpdateInProgress = true;
    
    const start = Date.now();
    
    try {
        const globalCodesMap = await codesDb.getAllCodesMap();
        const globalHierarchicalMap = await codesDb.getAllHierarchicalMap();
        const globalRelationsMap = await codesDb.getAllRelationsMap();
        const globalParentMap = await codesDb.getAllParentCodesMap();
        
        setGlobalMaps(globalCodesMap, globalHierarchicalMap, globalRelationsMap);
        codesDb.setGlobalMaps(globalCodesMap, globalHierarchicalMap, globalRelationsMap, globalParentMap);
        
        lastCacheUpdate = new Date();
    
    } catch (err) {
       
    } finally {
        cacheUpdateInProgress = false;
    }
}

// Запуск сервера
async function startServer() {
    try {
        
        await codesDb.initDatabase();
        await usersDb.initUsersDatabase();
        await logsDb.initLogsDatabase();
      
        
        await refreshGlobalCache();
        setInterval(refreshGlobalCache, 30 * 60 * 1000);
        
        app.listen(PORT, '0.0.0.0', () => {
    
        });
        
    } catch (err) {
     
        process.exit(1);
    }
}

process.on('SIGINT', () => {
    
    process.exit(0);
});

startServer();