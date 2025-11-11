-- Migration 002: Add Files Metadata Table
-- Created: 2025-11-11
-- Description: Хранение метаданных файлов (MD5, размер, разрешение) для оптимизации и дедупликации

-- ========================================
-- FILES METADATA TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS files_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Идентификация файла
  device_id TEXT NOT NULL,
  safe_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  
  -- Физические характеристики
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  md5_hash TEXT NOT NULL,
  mime_type TEXT,
  
  -- Метаданные видео
  video_width INTEGER,
  video_height INTEGER,
  video_duration REAL,
  video_codec TEXT,
  video_bitrate INTEGER,
  
  -- Метаданные аудио
  audio_codec TEXT,
  audio_bitrate INTEGER,
  audio_channels INTEGER,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  file_mtime INTEGER NOT NULL,  -- mtime в миллисекундах (для проверки изменений)
  
  -- Уникальность: один safe_name на устройство
  UNIQUE(device_id, safe_name)
);

-- ========================================
-- INDEXES для быстрого поиска
-- ========================================

-- Быстрый поиск по device_id
CREATE INDEX IF NOT EXISTS idx_files_device ON files_metadata(device_id);

-- Дедупликация по MD5
CREATE INDEX IF NOT EXISTS idx_files_md5 ON files_metadata(md5_hash);

-- Поиск дубликатов (одинаковый MD5 + размер)
CREATE INDEX IF NOT EXISTS idx_files_dedup ON files_metadata(md5_hash, file_size);

-- Поиск по имени файла
CREATE INDEX IF NOT EXISTS idx_files_name ON files_metadata(safe_name);

-- Сортировка по дате
CREATE INDEX IF NOT EXISTS idx_files_created ON files_metadata(created_at);

-- ========================================
-- TRIGGERS
-- ========================================

-- Auto-update updated_at
CREATE TRIGGER IF NOT EXISTS update_files_metadata_timestamp 
AFTER UPDATE ON files_metadata 
BEGIN
  UPDATE files_metadata SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ========================================
-- VIEWS для удобного доступа
-- ========================================

-- Дубликаты файлов (одинаковый MD5 на разных устройствах)
CREATE VIEW IF NOT EXISTS file_duplicates AS
SELECT 
  md5_hash,
  file_size,
  COUNT(*) as duplicate_count,
  GROUP_CONCAT(device_id || ':' || safe_name, ', ') as locations
FROM files_metadata
GROUP BY md5_hash, file_size
HAVING duplicate_count > 1;

-- Статистика по устройствам
CREATE VIEW IF NOT EXISTS device_storage_stats AS
SELECT 
  device_id,
  COUNT(*) as files_count,
  SUM(file_size) as total_size,
  MAX(created_at) as last_upload
FROM files_metadata
GROUP BY device_id;

