#!/usr/bin/env node
/**
 * Миграция из JSON файлов в SQLite
 */

import fs from 'fs';
import path from 'path';
import { initDatabase, saveDevice, saveFileName, transaction } from '../src/database/database.js';

const ROOT = process.cwd();
const DEVICES_JSON = path.join(ROOT, 'config', 'devices.json');
const FILE_NAMES_JSON = path.join(ROOT, 'config', 'file-names-map.json');
const DB_PATH = path.join(ROOT, 'config', 'main.db');

console.log('========================================');
console.log('VideoControl: JSON → SQLite Migration');
console.log('========================================\n');

// Проверка наличия JSON файлов
if (!fs.existsSync(DEVICES_JSON)) {
  console.error('❌ devices.json not found:', DEVICES_JSON);
  process.exit(1);
}

if (!fs.existsSync(FILE_NAMES_JSON)) {
  console.error('❌ file-names-map.json not found:', FILE_NAMES_JSON);
  process.exit(1);
}

// Создаем бэкап JSON файлов
const backupDir = path.join(ROOT, 'config', 'json-backup-' + Date.now());
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(DEVICES_JSON, path.join(backupDir, 'devices.json'));
fs.copyFileSync(FILE_NAMES_JSON, path.join(backupDir, 'file-names-map.json'));
console.log(`✅ JSON backup created: ${backupDir}\n`);

// Загружаем JSON данные
console.log('📂 Loading JSON data...');
const devicesData = JSON.parse(fs.readFileSync(DEVICES_JSON, 'utf-8'));
const fileNamesData = JSON.parse(fs.readFileSync(FILE_NAMES_JSON, 'utf-8'));

const deviceCount = Object.keys(devicesData).length;
const fileNameCount = Object.values(fileNamesData).reduce((sum, dev) => sum + Object.keys(dev).length, 0);

console.log(`  Devices: ${deviceCount}`);
console.log(`  File name mappings: ${fileNameCount}\n`);

// Инициализируем БД
console.log('🔨 Initializing SQLite database...');
const db = initDatabase(DB_PATH);
console.log('');

// Миграция в транзакции
console.log('🚀 Starting migration...\n');

try {
  transaction(() => {
    // Мигрируем устройства
    console.log('[1/2] Migrating devices...');
    let migratedDevices = 0;
    
    for (const [deviceId, name] of Object.entries(devicesData)) {
      const folder = deviceId; // В старой версии folder = device_id
      
      saveDevice(deviceId, {
        name: name,
        folder: folder,
        deviceType: 'browser',
        platform: null,
        capabilities: null,
        lastSeen: null,
        current: { type: 'idle', file: null, state: 'idle' }
      });
      
      migratedDevices++;
      console.log(`  ✅ ${deviceId}: ${name}`);
    }
    
    console.log(`  Total: ${migratedDevices} devices\n`);
    
    // Мигрируем маппинги имен файлов
    console.log('[2/2] Migrating file name mappings...');
    let migratedFileNames = 0;
    
    for (const [deviceId, mappings] of Object.entries(fileNamesData)) {
      for (const [safeName, originalName] of Object.entries(mappings)) {
        saveFileName(deviceId, safeName, originalName);
        migratedFileNames++;
      }
      console.log(`  ✅ ${deviceId}: ${Object.keys(mappings).length} files`);
    }
    
    console.log(`  Total: ${migratedFileNames} file mappings\n`);
  });
  
  console.log('========================================');
  console.log('✅ Migration completed successfully!');
  console.log('========================================\n');
  
  // Статистика БД
  const stmt = db.prepare('SELECT COUNT(*) as count FROM devices');
  const devCount = stmt.get().count;
  
  const fnStmt = db.prepare('SELECT COUNT(*) as count FROM file_names');
  const fnCount = fnStmt.get().count;
  
  const dbSize = fs.statSync(DB_PATH).size;
  
  console.log('Database statistics:');
  console.log(`  Devices: ${devCount}`);
  console.log(`  File mappings: ${fnCount}`);
  console.log(`  DB size: ${(dbSize / 1024).toFixed(2)} KB`);
  console.log(`  DB path: ${DB_PATH}\n`);
  
  console.log('Old JSON files backed up to:');
  console.log(`  ${backupDir}\n`);
  
  console.log('Next steps:');
  console.log('  1. Test the application');
  console.log('  2. If everything works, you can remove old JSON files');
  console.log('  3. Update package.json to include better-sqlite3');
  console.log('  4. Restart server: sudo systemctl restart videocontrol\n');
  
} catch (e) {
  console.error('\n❌ Migration failed:', e);
  console.error('\nJSON backup is safe in:', backupDir);
  process.exit(1);
}

