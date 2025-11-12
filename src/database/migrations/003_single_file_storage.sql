-- Migration 003: Single File Storage
-- Created: 2025-11-12
-- Description: Переход на единое хранилище файлов с поддержкой shared files

-- ========================================
-- ДОБАВЛЯЕМ ПОДДЕРЖКУ ЗАГЛУШЕК
-- ========================================

-- Флаг заглушки (один на устройство)
ALTER TABLE files_metadata ADD COLUMN is_placeholder BOOLEAN DEFAULT 0;

-- Индекс для быстрого поиска заглушки устройства
CREATE INDEX IF NOT EXISTS idx_files_placeholder ON files_metadata(device_id, is_placeholder);

-- ========================================
-- ИНДЕКС ДЛЯ ПОДСЧЕТА ССЫЛОК НА ФАЙЛ
-- ========================================

-- Быстрый подсчет сколько устройств используют файл (по file_path)
CREATE INDEX IF NOT EXISTS idx_files_path ON files_metadata(file_path);

-- ========================================
-- VIEW ДЛЯ SHARED FILES
-- ========================================

-- Файлы используемые несколькими устройствами
CREATE VIEW IF NOT EXISTS shared_files AS
SELECT 
  file_path,
  md5_hash,
  COUNT(*) as device_count,
  GROUP_CONCAT(device_id, ', ') as devices,
  MAX(file_size) as file_size,
  MAX(file_size) * COUNT(*) as total_space_used,
  MAX(file_size) * (COUNT(*) - 1) as space_saved
FROM files_metadata
GROUP BY file_path, md5_hash
HAVING device_count > 1;

-- ========================================
-- VIEW ДЛЯ ORPHANED FILES (без владельцев)
-- ========================================

-- Файлы без связей с устройствами (для очистки)
CREATE VIEW IF NOT EXISTS orphaned_files AS
SELECT DISTINCT file_path, file_size
FROM files_metadata fm1
WHERE NOT EXISTS (
  SELECT 1 FROM files_metadata fm2 
  WHERE fm2.file_path = fm1.file_path
);

-- ========================================
-- СТАТИСТИКА
-- ========================================

-- Обновляем view статистики устройств (добавляем shared files)
DROP VIEW IF EXISTS device_storage_stats;

CREATE VIEW device_storage_stats AS
SELECT 
  device_id,
  COUNT(*) as files_count,
  SUM(file_size) as total_size,
  MAX(created_at) as last_upload
FROM files_metadata
GROUP BY device_id;

