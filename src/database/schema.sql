-- VideoControl Database Schema
-- SQLite database for devices, files, and metadata

-- Устройства
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  folder TEXT NOT NULL,
  device_type TEXT DEFAULT 'browser',
  platform TEXT,
  capabilities TEXT, -- JSON строка
  last_seen DATETIME,
  current_state TEXT, -- JSON строка с current: {type, file, state}
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_devices_folder ON devices(folder);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);

-- Маппинг имен файлов (безопасное имя -> оригинальное имя)
CREATE TABLE IF NOT EXISTS file_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  safe_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE,
  UNIQUE(device_id, safe_name)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_file_names_device ON file_names(device_id);
CREATE INDEX IF NOT EXISTS idx_file_names_safe ON file_names(device_id, safe_name);

-- Статусы файлов (для оптимизации видео)
CREATE TABLE IF NOT EXISTS file_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT, -- pending, processing, optimized, error
  resolution TEXT, -- 720p, 1080p, 4K
  original_resolution TEXT,
  needs_optimization BOOLEAN DEFAULT 0,
  error TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE,
  UNIQUE(device_id, file_name)
);

-- Индексы для file_statuses
CREATE INDEX IF NOT EXISTS idx_file_statuses_device ON file_statuses(device_id);
CREATE INDEX IF NOT EXISTS idx_file_statuses_status ON file_statuses(status);
CREATE INDEX IF NOT EXISTS idx_file_statuses_device_file ON file_statuses(device_id, file_name);

-- Заглушки устройств
CREATE TABLE IF NOT EXISTS placeholders (
  device_id TEXT PRIMARY KEY,
  placeholder_file TEXT,
  placeholder_type TEXT, -- video, image
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

-- Настройки системы (ключ-значение)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Версия схемы БД (для будущих миграций)
INSERT OR IGNORE INTO settings (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('migrated_from_json', datetime('now'));

-- Триггеры для auto-update updated_at
CREATE TRIGGER IF NOT EXISTS update_devices_timestamp 
AFTER UPDATE ON devices 
BEGIN
  UPDATE devices SET updated_at = CURRENT_TIMESTAMP WHERE device_id = NEW.device_id;
END;

CREATE TRIGGER IF NOT EXISTS update_file_statuses_timestamp 
AFTER UPDATE ON file_statuses 
BEGIN
  UPDATE file_statuses SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_placeholders_timestamp 
AFTER UPDATE ON placeholders 
BEGIN
  UPDATE placeholders SET updated_at = CURRENT_TIMESTAMP WHERE device_id = NEW.device_id;
END;

