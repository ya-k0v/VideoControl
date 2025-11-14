/**
 * Biography Module - Database Connection
 * Separate SQLite database: config/biographies.db
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(process.cwd(), 'config', 'biographies.db');

// Создать БД если не существует
if (!fs.existsSync(DB_PATH)) {
  console.log('[Biographies] Creating new database:', DB_PATH);
  
  const initSQL = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
  );
  
  const db = new Database(DB_PATH);
  db.exec(initSQL);
  db.close();
  
  console.log('[Biographies] ✅ Database created successfully');
}

// Экспортируем подключение к БД
export const biographiesDb = new Database(DB_PATH);

// Настройка WAL mode для лучшей производительности
biographiesDb.pragma('journal_mode = WAL');

console.log('[Biographies] ✅ Database connected:', DB_PATH);

