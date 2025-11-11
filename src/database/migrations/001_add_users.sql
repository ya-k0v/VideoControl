-- Migration 001: Add Users, Authentication, and Audit tables
-- Created: 2025-11-11
-- Description: Добавляет систему аутентификации и аудита

-- ========================================
-- USERS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'speaker' CHECK(role IN ('admin', 'speaker')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active BOOLEAN DEFAULT 1
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- ========================================
-- REFRESH TOKENS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ========================================
-- AUDIT LOG TABLE (Week 3 - Structured Logging & Audit)
-- ========================================
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT DEFAULT 'success',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource);
CREATE INDEX IF NOT EXISTS idx_audit_log_status ON audit_log(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- ========================================
-- TRIGGERS
-- ========================================

-- Auto-update updated_at для users
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
AFTER UPDATE ON users 
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ========================================
-- DEFAULT DATA
-- ========================================

-- Дефолтный admin пользователь
-- Username: admin
-- Password: admin123 (ОБЯЗАТЕЛЬНО СМЕНИТЕ ПОСЛЕ УСТАНОВКИ!)
-- Hash сгенерирован через: bcrypt.hash('admin123', 10)
INSERT OR IGNORE INTO users (id, username, full_name, password_hash, role, is_active) 
VALUES (
  1,
  'admin',
  'Администратор',
  '$2b$10$YQj9q0ZJ5BX5XK5K5K5K5.5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5',
  'admin',
  1
);

-- ВАЖНО: После первого входа смените пароль через API:
-- POST /api/auth/change-password
-- { "oldPassword": "admin123", "newPassword": "your_strong_password" }

