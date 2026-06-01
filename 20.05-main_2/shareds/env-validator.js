// shareds/env-validator.js - Валидация переменных окружения

/**
 * Проверяет наличие обязательных переменных окружения
 * @throws {Error} Если отсутствуют обязательные переменные
 */
function validateEnv() {
  const required = ['DB_USER', 'DB_PASSWORD', 'DB_SERVER', 'DB_DATABASE'];
  const missing = [];
  
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = validateEnv;