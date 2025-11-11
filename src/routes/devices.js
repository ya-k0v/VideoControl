/**
 * API Routes для управления устройствами (CRUD)
 * @module routes/devices
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { DEVICES } from '../config/constants.js';
import { sanitizeDeviceId } from '../utils/sanitize.js';
import { deleteDevice as deleteDeviceFromDB, deleteDeviceFileNames } from '../database/database.js';
import { createLimiter, deleteLimiter } from '../middleware/rate-limit.js';

const router = express.Router();

/**
 * Настройка роутера для устройств
 * @param {Object} deps - Зависимости {devices, io, saveDevicesJson, fileNamesMap, saveFileNamesMap}
 * @returns {express.Router} Настроенный роутер
 */
export function createDevicesRouter(deps) {
  const { devices, io, saveDevicesJson, fileNamesMap, saveFileNamesMap, requireAdmin } = deps;
  
  // GET /api/devices - Получить список всех устройств (доступно speaker)
  router.get('/', (req, res) => {
    res.json(Object.entries(devices).map(([id, d]) => ({
      device_id: id, 
      name: d.name, 
      folder: d.folder, 
      files: d.files, 
      fileNames: d.fileNames || d.files,
      current: d.current,
      deviceType: d.deviceType || 'browser',
      capabilities: d.capabilities || { 
        video: true, 
        audio: true, 
        images: true, 
        pdf: true, 
        pptx: true, 
        streaming: true 
      },
      platform: d.platform || 'Unknown',
      lastSeen: d.lastSeen || null
    })));
  });
  
  // POST /api/devices - Создать новое устройство (только admin)
  router.post('/', requireAdmin, createLimiter, (req, res) => {
    const { device_id, name } = req.body;
    
    if (!device_id) {
      return res.status(400).json({ error: 'device_id required' });
    }
    
    if (devices[device_id]) {
      return res.status(409).json({ error: 'exists' });
    }
    
    const devicePath = path.join(DEVICES, device_id);
    fs.mkdirSync(devicePath, { recursive: true });
    
    // КРИТИЧНО: Устанавливаем права 755 на папку устройства
    // Чтобы Nginx (www-data) мог читать файлы
    try {
      fs.chmodSync(devicePath, 0o755);
      console.log(`[create device] ✅ Создана папка с правами 755: ${devicePath}`);
    } catch (e) {
      console.warn(`[create device] ⚠️ Не удалось установить права на ${devicePath}: ${e}`);
    }
    
    devices[device_id] = { 
      name: name || device_id, 
      folder: device_id, 
      files: [], 
      current: { type: 'idle', file: null, state: 'idle' } 
    };
    
    io.emit('devices/updated');
    saveDevicesJson(devices);
    res.json({ ok: true });
  });
  
  // POST /api/devices/:id/rename - Переименовать устройство (только admin)
  router.post('/:id/rename', requireAdmin, (req, res) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    if (!devices[id]) {
      return res.status(404).json({ error: 'not found' });
    }
    
    devices[id].name = req.body.name || id;
    io.emit('devices/updated');
    saveDevicesJson(devices);
    res.json({ ok: true });
  });
  
  // DELETE /api/devices/:id - Удалить устройство (только admin)
  router.delete('/:id', requireAdmin, deleteLimiter, (req, res) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    const d = devices[id];
    if (!d) {
      return res.status(404).json({ error: 'not found' });
    }
    
    console.log(`[DELETE device] Удаление устройства: ${id} (folder: ${d.folder})`);
    
    // 1. Удаляем из БД
    deleteDeviceFromDB(id);
    console.log(`[DELETE device] ✅ Удалено из БД: ${id}`);
    
    // 2. Удаляем папку устройства
    const devicePath = path.join(DEVICES, d.folder);
    console.log(`[DELETE device] Удаление папки: ${devicePath}`);
    fs.rmSync(devicePath, { recursive: true, force: true });
    console.log(`[DELETE device] ✅ Папка удалена: ${devicePath}`);
    
    // 3. Удаляем из devices (память)
    delete devices[id];
    console.log(`[DELETE device] ✅ Удалено из devices (память): ${id}`);
    
    // 4. Удаляем из fileNamesMap
    if (fileNamesMap[id]) {
      console.log(`[DELETE device] Удаление из fileNamesMap: ${id} (${Object.keys(fileNamesMap[id]).length} файлов)`);
      delete fileNamesMap[id];
      saveFileNamesMap(fileNamesMap);
    }
    
    // 5. Уведомляем клиентов
    io.emit('devices/updated');
    console.log(`[DELETE device] ✅ Устройство ${id} полностью удалено (БД + диск + память)`);
    res.json({ ok: true });
  });
  
  return router;
}

