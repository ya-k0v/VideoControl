/**
 * API Routes для управления заглушками (placeholder)
 * @module routes/placeholder
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { DEVICES, ALLOWED_EXT } from '../config/constants.js';
import { sanitizeDeviceId, isSystemFile } from '../utils/sanitize.js';

const router = express.Router();

/**
 * Настройка роутера для заглушек
 * @param {Object} deps - Зависимости {devices, io}
 * @returns {express.Router} Настроенный роутер
 */
export function createPlaceholderRouter(deps) {
  const { devices, io } = deps;
  
  // GET /api/devices/:id/placeholder - Получить текущую заглушку устройства
  router.get('/:id/placeholder', (req, res) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    const d = devices[id];
    if (!d) {
      return res.status(404).json({ error: 'device not found' });
    }
    
    const folder = path.join(DEVICES, d.folder);
    
    if (!fs.existsSync(folder)) {
      console.log(`[placeholder] ❌ Папка не существует: ${folder}`);
      return res.json({ placeholder: null });
    }
    
    const tryList = ['mp4','webm','ogg','mkv','mov','avi','mp3','wav','m4a','png','jpg','jpeg','gif','webp'];
    
    for (const ext of tryList) {
      const fileName = `default.${ext}`;
      const filePath = path.join(folder, fileName);
      
      // КРИТИЧНО: Проверяем не только существование, но и что это файл (не папка) и размер > 0
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.isFile() && stats.size > 0) {
          console.log(`[placeholder] ✅ Найдена заглушка: ${fileName} (${stats.size} bytes)`);
          return res.json({ placeholder: fileName });
        } else if (stats.size === 0) {
          console.log(`[placeholder] ⚠️ Файл ${fileName} пустой (0 bytes), пропускаем`);
        }
      }
    }
    
    console.log(`[placeholder] ❌ Не найдена ни одна заглушка в ${folder}`);
    res.json({ placeholder: null });
  });
  
  // POST /api/devices/:id/make-default - Установить файл как заглушку
  router.post('/:id/make-default', (req, res) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    const { file } = req.body || {};
    const d = devices[id];
    
    if (!d) {
      return res.status(404).json({ error: 'device not found' });
    }
    
    if (!file || typeof file !== 'string') {
      return res.status(400).json({ error: 'file required' });
    }
    
    const ext = (path.extname(file) || '').toLowerCase();
    
    if (!ALLOWED_EXT.test(ext)) {
      return res.status(400).json({ error: 'unsupported type' });
    }
    
    if (ext === '.pdf' || ext === '.pptx') {
      return res.status(400).json({ error: 'pdf_pptx_not_allowed_as_placeholder' });
    }

    const folder = path.join(DEVICES, d.folder);
    const folderName = file.replace(/\.(pdf|pptx)$/i, '');
    const possibleFolder = path.join(folder, folderName);
    let src = path.join(folder, file);
    
    if (fs.existsSync(possibleFolder) && fs.statSync(possibleFolder).isDirectory()) {
      const folderFile = path.join(possibleFolder, file);
      if (fs.existsSync(folderFile)) src = folderFile;
    }
    
    const dst = path.join(folder, `default${ext}`);
    
    if (!src.startsWith(DEVICES) || !dst.startsWith(DEVICES)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    
    if (!fs.existsSync(src)) {
      return res.status(404).json({ error: 'source not found' });
    }

    // КРИТИЧНО: Если src уже является default.*, то просто возвращаем success
    // Избегаем удаления файла, который пытаемся скопировать
    if (path.basename(src).match(/^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp)$/i)) {
      return res.json({ success: true, message: 'Already default file' });
    }

    // АТОМАРНАЯ ОПЕРАЦИЯ: Копируем сначала во временный файл, затем переименовываем
    // Это предотвращает race condition когда клиенты запрашивают файл между удалением и копированием
    const tmpPath = path.join(folder, `.tmp_default_${Date.now()}${ext}`);
    
    try {
      // Шаг 1: Копируем в временный файл
      console.log(`[make-default] 📝 Копирование в временный файл: ${tmpPath}`);
      fs.copyFileSync(src, tmpPath);
      
      // Устанавливаем права сразу на временный файл
      try {
        fs.chmodSync(tmpPath, 0o644);
        console.log(`[make-default] ✅ Права 644 установлены на временный файл`);
      } catch (e) {
        console.warn(`[make-default] ⚠️ Не удалось установить права на временный файл: ${e}`);
      }
      
      // Проверяем что временный файл доступен для чтения
      try {
        fs.accessSync(tmpPath, fs.constants.R_OK);
        const tmpStats = fs.statSync(tmpPath);
        console.log(`[make-default] ✅ Временный файл готов, размер: ${tmpStats.size} bytes`);
        
        // Проверяем что размер совпадает с источником
        const srcStats = fs.statSync(src);
        if (tmpStats.size !== srcStats.size) {
          throw new Error(`Size mismatch: src=${srcStats.size}, tmp=${tmpStats.size}`);
        }
      } catch (e) {
        console.error(`[make-default] ❌ Ошибка проверки временного файла: ${e}`);
        try { fs.unlinkSync(tmpPath); } catch {}
        return res.status(500).json({ error: 'temporary file validation failed', detail: String(e) });
      }
      
      // Шаг 2: Удаляем существующие default.* файлы (кроме src)
      console.log(`[make-default] 🗑️ Удаление старых заглушек...`);
      try {
        const existing = fs.readdirSync(folder);
        for (const f of existing) {
          if (/^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i.test(f)) {
            const fullPath = path.join(folder, f);
            // НЕ удаляем исходный файл если он default.*
            if (fullPath !== src) {
              try { 
                fs.unlinkSync(fullPath);
                console.log(`[make-default] 🗑️ Удален: ${f}`);
              } catch {}
            }
          }
        }
      } catch (e) {
        console.warn(`[make-default] ⚠️ Ошибка удаления старых заглушек: ${e}`);
      }
      
      // Шаг 3: АТОМАРНОЕ переименование временного файла → default.*
      // Это гарантирует что файл либо существует полностью, либо не существует вообще
      console.log(`[make-default] 🔄 Атомарное переименование: ${path.basename(tmpPath)} → ${path.basename(dst)}`);
      fs.renameSync(tmpPath, dst);
      
      // Финальная проверка
      try {
        fs.accessSync(dst, fs.constants.R_OK);
        const finalStats = fs.statSync(dst);
        console.log(`[make-default] ✅ Заглушка установлена успешно! Размер: ${finalStats.size} bytes`);
        console.log(`[make-default] 📍 Путь: ${dst}`);
      } catch (e) {
        console.error(`[make-default] ❌ Финальная проверка не пройдена: ${e}`);
        return res.status(500).json({ error: 'final validation failed', detail: String(e) });
      }
      
    } catch (e) {
      console.error(`[make-default] ❌ Ошибка атомарного копирования: ${e}`);
      // Очищаем временный файл в случае ошибки
      try { 
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
          console.log(`[make-default] 🧹 Временный файл удален после ошибки`);
        }
      } catch {}
      return res.status(500).json({ error: 'atomic copy failed', detail: String(e) });
    }

    // Обновляем список файлов устройства
    const result = [];
    if (fs.existsSync(folder)) {
      const entries = fs.readdirSync(folder);
      for (const entry of entries) {
        const entryPath = path.join(folder, entry);
        const stat = fs.statSync(entryPath);
        
        if (stat.isFile()) {
          // Пропускаем системные файлы (default.*, .optimizing_*, .tmp_*, etc.)
          if (!isSystemFile(entry)) {
            result.push(entry);
          }
        } else if (stat.isDirectory()) {
          const folderContents = fs.readdirSync(entryPath);
          const originalFile = folderContents.find(f => /\.(pdf|pptx)$/i.test(f));
          if (originalFile) result.push(originalFile);
        }
      }
    }
    d.files = result;

    io.emit('devices/updated');
    io.to(`device:${id}`).emit('player/stop');
    
    // КРИТИЧНО: Увеличенная задержка + проверка готовности файла
    // Даем файловой системе, Nginx и клиентскому кэшу время синхронизироваться
    console.log(`[make-default] ⏳ Ожидание синхронизации перед отправкой событий...`);
    
    // Возвращаем успешный ответ клиенту немедленно
    res.json({ ok: true, default: path.basename(dst) });
    
    // Асинхронно проверяем готовность и отправляем события
    setTimeout(async () => {
      try {
        // Финальная проверка что файл всё ещё доступен и не поврежден
        const finalCheck = fs.statSync(dst);
        if (finalCheck.size === 0) {
          console.error(`[make-default] ❌ Файл пустой (0 bytes), отменяем отправку событий`);
          return;
        }
        
        // Проверяем что файл читаемый
        fs.accessSync(dst, fs.constants.R_OK);
        
        console.log(`[make-default] ✅ Финальная проверка OK: ${finalCheck.size} bytes`);
        
        // Отправляем события клиентам
        io.to(`device:${id}`).emit('placeholder/refresh');
        io.emit('preview/refresh', { device_id: id });
        console.log(`[make-default] 📡 События placeholder/refresh отправлены для ${id}`);
        
      } catch (e) {
        console.error(`[make-default] ❌ Финальная проверка не пройдена, события НЕ отправлены: ${e}`);
      }
    }, 1500); // Увеличено с 500ms до 1500ms для гарантии синхронизации
    
    return; // res.json уже вызван выше
  });
  
  return router;
}

