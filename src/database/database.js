/**
 * Database module - SQLite database for VideoControl
 * @module database/database
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db = null;

/**
 * Инициализация базы данных
 * @param {string} dbPath - Путь к файлу БД (по умолчанию: ROOT/config/main.db)
 * @returns {Database} Экземпляр БД
 */
export function initDatabase(dbPath) {
  if (db) {
    console.log('[DB] ℹ️ Database already initialized');
    return db;
  }

  try {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(dbPath);
    
    // Включаем WAL mode для лучшей производительности
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache
    db.pragma('temp_store = MEMORY');
    db.pragma('mmap_size = 30000000000'); // 30GB mmap
    
    console.log(`[DB] ✅ Database initialized: ${dbPath}`);
    console.log(`[DB] 📊 WAL mode enabled, cache_size=64MB`);
    
    // Загружаем схему
    const initPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'init.sql');
    const initSQL = fs.readFileSync(initPath, 'utf-8');
    
    // Выполняем схему
    db.exec(initSQL);
    console.log('[DB] ✅ Database schema initialized');
    
    return db;
  } catch (e) {
    console.error('[DB] ❌ Failed to initialize database:', e);
    throw e;
  }
}

/**
 * Получить экземпляр БД
 * @returns {Database}
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Закрыть БД
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] ✅ Database closed');
  }
}

// ========================================
// DEVICES
// ========================================

/**
 * Получить все устройства
 * @returns {Object} Объект {device_id: {...}}
 */
export function getAllDevices() {
  const stmt = db.prepare(`
    SELECT device_id, name, folder, device_type, platform, capabilities, 
           last_seen, current_state, created_at, updated_at
    FROM devices
    ORDER BY device_id
  `);
  
  const rows = stmt.all();
  const devices = {};
  
  for (const row of rows) {
    devices[row.device_id] = {
      name: row.name,
      folder: row.folder,
      deviceType: row.device_type,
      platform: row.platform,
      capabilities: row.capabilities ? JSON.parse(row.capabilities) : null,
      lastSeen: row.last_seen,
      current: row.current_state ? JSON.parse(row.current_state) : { type: 'idle', file: null, state: 'idle' },
      files: [], // Заполняется при сканировании
      fileNames: [] // Заполняется при сканировании
    };
  }
  
  return devices;
}

/**
 * Сохранить устройство
 * @param {string} deviceId 
 * @param {Object} data 
 */
export function saveDevice(deviceId, data) {
  const stmt = db.prepare(`
    INSERT INTO devices (device_id, name, folder, device_type, platform, capabilities, last_seen, current_state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      name = excluded.name,
      folder = excluded.folder,
      device_type = excluded.device_type,
      platform = excluded.platform,
      capabilities = excluded.capabilities,
      last_seen = excluded.last_seen,
      current_state = excluded.current_state,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run(
    deviceId,
    data.name,
    data.folder,
    data.deviceType || 'browser',
    data.platform || null,
    data.capabilities ? JSON.stringify(data.capabilities) : null,
    data.lastSeen || null,
    data.current ? JSON.stringify(data.current) : null
  );
}

/**
 * Удалить устройство
 * @param {string} deviceId 
 */
export function deleteDevice(deviceId) {
  const stmt = db.prepare('DELETE FROM devices WHERE device_id = ?');
  stmt.run(deviceId);
}

// ========================================
// FILE NAMES MAPPING
// ========================================

/**
 * Получить все маппинги имен файлов
 * @returns {Object} {device_id: {safe_name: original_name}}
 */
export function getAllFileNames() {
  const stmt = db.prepare('SELECT device_id, safe_name, original_name FROM file_names');
  const rows = stmt.all();
  
  const mapping = {};
  for (const row of rows) {
    if (!mapping[row.device_id]) {
      mapping[row.device_id] = {};
    }
    mapping[row.device_id][row.safe_name] = row.original_name;
  }
  
  return mapping;
}

/**
 * Сохранить маппинг имени файла
 * @param {string} deviceId 
 * @param {string} safeName 
 * @param {string} originalName 
 */
export function saveFileName(deviceId, safeName, originalName) {
  const stmt = db.prepare(`
    INSERT INTO file_names (device_id, safe_name, original_name)
    VALUES (?, ?, ?)
    ON CONFLICT(device_id, safe_name) DO UPDATE SET
      original_name = excluded.original_name
  `);
  
  stmt.run(deviceId, safeName, originalName);
}

/**
 * Удалить маппинг файла
 * @param {string} deviceId 
 * @param {string} safeName 
 */
export function deleteFileName(deviceId, safeName) {
  const stmt = db.prepare('DELETE FROM file_names WHERE device_id = ? AND safe_name = ?');
  stmt.run(deviceId, safeName);
}

/**
 * Удалить все маппинги устройства
 * @param {string} deviceId 
 */
export function deleteDeviceFileNames(deviceId) {
  const stmt = db.prepare('DELETE FROM file_names WHERE device_id = ?');
  stmt.run(deviceId);
}

// ========================================
// FILE STATUSES (для оптимизации видео)
// ========================================

/**
 * Получить статус файла
 * @param {string} deviceId 
 * @param {string} fileName 
 * @returns {Object|null}
 */
export function getFileStatus(deviceId, fileName) {
  const stmt = db.prepare(`
    SELECT status, resolution, original_resolution, needs_optimization, error, updated_at
    FROM file_statuses
    WHERE device_id = ? AND file_name = ?
  `);
  
  const row = stmt.get(deviceId, fileName);
  if (!row) return null;
  
  return {
    status: row.status,
    resolution: row.resolution,
    originalResolution: row.original_resolution,
    needsOptimization: Boolean(row.needs_optimization),
    error: row.error,
    updatedAt: row.updated_at
  };
}

/**
 * Сохранить статус файла
 * @param {string} deviceId 
 * @param {string} fileName 
 * @param {Object} statusData 
 */
export function saveFileStatus(deviceId, fileName, statusData) {
  const stmt = db.prepare(`
    INSERT INTO file_statuses 
      (device_id, file_name, status, resolution, original_resolution, needs_optimization, error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(device_id, file_name) DO UPDATE SET
      status = excluded.status,
      resolution = excluded.resolution,
      original_resolution = excluded.original_resolution,
      needs_optimization = excluded.needs_optimization,
      error = excluded.error,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run(
    deviceId,
    fileName,
    statusData.status || null,
    statusData.resolution || null,
    statusData.originalResolution || null,
    statusData.needsOptimization ? 1 : 0,
    statusData.error || null
  );
}

/**
 * Удалить статус файла
 * @param {string} deviceId 
 * @param {string} fileName 
 */
export function deleteFileStatus(deviceId, fileName) {
  const stmt = db.prepare('DELETE FROM file_statuses WHERE device_id = ? AND file_name = ?');
  stmt.run(deviceId, fileName);
}

/**
 * Получить все статусы файлов устройства
 * @param {string} deviceId 
 * @returns {Object} {fileName: statusData}
 */
export function getDeviceFileStatuses(deviceId) {
  const stmt = db.prepare(`
    SELECT file_name, status, resolution, original_resolution, needs_optimization, error, updated_at
    FROM file_statuses
    WHERE device_id = ?
  `);
  
  const rows = stmt.all(deviceId);
  const statuses = {};
  
  for (const row of rows) {
    statuses[row.file_name] = {
      status: row.status,
      resolution: row.resolution,
      originalResolution: row.original_resolution,
      needsOptimization: Boolean(row.needs_optimization),
      error: row.error,
      updatedAt: row.updated_at
    };
  }
  
  return statuses;
}

// ========================================
// PLACEHOLDERS
// ========================================

/**
 * Получить заглушку устройства
 * @param {string} deviceId 
 * @returns {Object|null}
 */
export function getPlaceholder(deviceId) {
  const stmt = db.prepare(`
    SELECT placeholder_file, placeholder_type, updated_at
    FROM placeholders
    WHERE device_id = ?
  `);
  
  const row = stmt.get(deviceId);
  if (!row) return null;
  
  return {
    file: row.placeholder_file,
    type: row.placeholder_type,
    updatedAt: row.updated_at
  };
}

/**
 * Сохранить заглушку
 * @param {string} deviceId 
 * @param {string} placeholderFile 
 * @param {string} placeholderType 
 */
export function savePlaceholder(deviceId, placeholderFile, placeholderType) {
  const stmt = db.prepare(`
    INSERT INTO placeholders (device_id, placeholder_file, placeholder_type)
    VALUES (?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      placeholder_file = excluded.placeholder_file,
      placeholder_type = excluded.placeholder_type,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run(deviceId, placeholderFile, placeholderType);
}

/**
 * Удалить заглушку
 * @param {string} deviceId 
 */
export function deletePlaceholder(deviceId) {
  const stmt = db.prepare('DELETE FROM placeholders WHERE device_id = ?');
  stmt.run(deviceId);
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Выполнить транзакцию
 * @param {Function} fn - Функция для выполнения в транзакции
 * @returns {*} Результат функции
 */
export function transaction(fn) {
  const txn = db.transaction(fn);
  return txn();
}

/**
 * Получить статистику БД
 * @returns {Object}
 */
export function getDatabaseStats() {
  const deviceCount = db.prepare('SELECT COUNT(*) as count FROM devices').get();
  const fileNameCount = db.prepare('SELECT COUNT(*) as count FROM file_names').get();
  const fileStatusCount = db.prepare('SELECT COUNT(*) as count FROM file_statuses').get();
  const placeholderCount = db.prepare('SELECT COUNT(*) as count FROM placeholders').get();
  
  const dbSize = fs.statSync(db.name).size;
  
  return {
    devices: deviceCount.count,
    fileNames: fileNameCount.count,
    fileStatuses: fileStatusCount.count,
    placeholders: placeholderCount.count,
    dbSize: dbSize,
    dbSizeMB: (dbSize / 1024 / 1024).toFixed(2),
    dbPath: db.name
  };
}

/**
 * Экспорт БД в JSON (для резервного копирования)
 * @returns {Object}
 */
export function exportToJSON() {
  const devices = getAllDevices();
  const fileNames = getAllFileNames();
  const placeholders = db.prepare('SELECT device_id, placeholder_file FROM placeholders').all();
  
  return {
    devices,
    fileNames,
    placeholders: placeholders.reduce((acc, p) => {
      acc[p.device_id] = p.placeholder_file;
      return acc;
    }, {}),
    exportedAt: new Date().toISOString()
  };
}

