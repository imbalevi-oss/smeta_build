// shareds/config.js - Общая конфигурация для всех сервисов

module.exports = {
  PORTS: {
    SMETA: process.env.SMETA_PORT || 4997,
    SMETA_A: process.env.SMETA_A_PORT || 4998,
    PDF_LOADER: process.env.PDF_LOADER_PORT || 4999
  },
  RATE_LIMIT: {
    global: {
      windowMs: 60 * 1000,
      max: 100,
      message: { error: 'Слишком много запросов. Попробуйте позже.' },
      standardHeaders: true,
      legacyHeaders: false
    },
    analyze: {
      windowMs: 60 * 1000,
      max: 5,
      message: { error: 'Превышен лимит анализов. Подождите 1 минуту.' },
      standardHeaders: true,
      legacyHeaders: false
    },
    login: {
      windowMs: 15 * 60 * 1000,
      max: 10,
      message: { error: 'Слишком много попыток входа. Подождите 15 минут.' },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true
    },
    reports: {
      windowMs: 60 * 1000,
      max: 20,
      message: { error: 'Превышен лимит генерации отчетов.' },
      standardHeaders: true,
      legacyHeaders: false
    }
  },
  
  // Настройки базы данных
  DB: {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'your_password',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_DATABASE || 'smeta_db',
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
    requestTimeout: 60000
  }
};