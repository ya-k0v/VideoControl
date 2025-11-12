#!/usr/bin/env node

/**
 * Скрипт для пересчета partial_md5 (первые 10MB) для всех существующих файлов
 * Запускать: node scripts/recalculate-partial-md5.js
 */

import { getDatabase, initDatabase } from '../src/database/database.js';
import { calculateMD5 } from '../src/database/files-metadata.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

async function recalculatePartialMD5() {
  console.log('🔄 Starting partial MD5 recalculation...\n');
  
  // Инициализируем базу данных
  const dbPath = path.join(ROOT, 'config', 'main.db');
  initDatabase(dbPath);
  
  const db = getDatabase();
  
  // Получаем все файлы без partial_md5
  const files = db.prepare(`
    SELECT device_id, safe_name, file_path, file_size, md5_hash
    FROM files_metadata
    WHERE partial_md5 IS NULL
  `).all();
  
  console.log(`📊 Found ${files.length} files without partial_md5\n`);
  
  let processed = 0;
  let errors = 0;
  let skipped = 0;
  
  for (const file of files) {
    const { device_id, safe_name, file_path, file_size, md5_hash } = file;
    
    try {
      // Проверяем существование файла
      if (!fs.existsSync(file_path)) {
        console.log(`⚠️  [${device_id}/${safe_name}] File not found: ${file_path}`);
        skipped++;
        continue;
      }
      
      const isBigFile = file_size > 100 * 1024 * 1024;
      
      // Для маленьких файлов partial_md5 = md5_hash
      let partialMd5;
      if (!isBigFile) {
        partialMd5 = md5_hash; // Полный MD5 для маленьких файлов
        console.log(`✅ [${device_id}/${safe_name}] Small file - using full MD5: ${partialMd5.substring(0, 12)}...`);
      } else {
        // Для больших файлов вычисляем partial MD5 (первые 10MB)
        partialMd5 = await calculateMD5(file_path, true);
        console.log(`✅ [${device_id}/${safe_name}] Partial MD5 calculated: ${partialMd5.substring(0, 12)}... (${(file_size / 1024 / 1024).toFixed(2)} MB)`);
      }
      
      // Обновляем БД
      db.prepare(`
        UPDATE files_metadata 
        SET partial_md5 = ? 
        WHERE device_id = ? AND safe_name = ?
      `).run(partialMd5, device_id, safe_name);
      
      processed++;
      
    } catch (error) {
      console.error(`❌ [${device_id}/${safe_name}] Error: ${error.message}`);
      errors++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📈 Summary:');
  console.log(`   Total files:     ${files.length}`);
  console.log(`   ✅ Processed:     ${processed}`);
  console.log(`   ⚠️  Skipped:       ${skipped}`);
  console.log(`   ❌ Errors:        ${errors}`);
  console.log('='.repeat(60));
  
  if (processed > 0) {
    console.log('\n🎉 Done! Partial MD5 calculation completed.');
    console.log('💡 Deduplication is now ready to work with existing files.');
  }
}

// Запуск
recalculatePartialMD5().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

