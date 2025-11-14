-- ========================================
-- Biographies Module Schema
-- Separate database: config/biographies.db
-- ========================================

-- Биографии
CREATE TABLE IF NOT EXISTS biographies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  birth_year INTEGER,
  death_year INTEGER,
  rank TEXT,
  photo_base64 TEXT,
  biography TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Медиа материалы
CREATE TABLE IF NOT EXISTS biography_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  biography_id INTEGER NOT NULL,
  type TEXT CHECK(type IN ('photo', 'video')),
  media_base64 TEXT NOT NULL,
  caption TEXT,
  order_index INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (biography_id) REFERENCES biographies(id) ON DELETE CASCADE
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_bio_name ON biographies(full_name);
CREATE INDEX IF NOT EXISTS idx_media_bio ON biography_media(biography_id);

-- Триггеры для автообновления timestamp
CREATE TRIGGER IF NOT EXISTS update_bio_timestamp 
AFTER UPDATE ON biographies 
BEGIN
  UPDATE biographies SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

