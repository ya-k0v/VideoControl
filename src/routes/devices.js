/**
 * API Routes для управления устройствами (CRUD)
 * @module routes/devices
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { DEVICES } from '../config/constants.js';
import { sanitizeDeviceId } from '../utils/sanitize.js';

const router = express.Router();

/**
 * Настройка роутера для устройств
 * @param {Object} deps - Зависимости {devices, io, saveDevicesJson, fileNamesMap, saveFileNamesMap}
 * @returns {express.Router} Настроенный роутер
 */
export function createDevicesRouter(deps) {
  const { devices, io, saveDevicesJson, fileNamesMap, saveFileNamesMap } = deps;
  
  // GET /api/devices - Получить список всех устройств
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
  
  // POST /api/devices - Создать новое устройство
  router.post('/', (req, res) => {
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
  
  // POST /api/devices/:id/rename - Переименовать устройство
  router.post('/:id/rename', (req, res) => {
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
  
  // DELETE /api/devices/:id - Удалить устройство
  router.delete('/:id', (req, res) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    const d = devices[id];
    if (!d) {
      return res.status(404).json({ error: 'not found' });
    }
    
    console.log(`[DELETE device] Удаление устройства: ${id} (folder: ${d.folder})`);
    
    // Удаляем папку устройства
    const devicePath = path.join(DEVICES, d.folder);
    console.log(`[DELETE device] Удаление папки: ${devicePath}`);
    fs.rmSync(devicePath, { recursive: true, force: true });
    
    // Удаляем из devices
    delete devices[id];
    console.log(`[DELETE device] Удалено из devices: ${id}`);
    
    // КРИТИЧНО: Удаляем из fileNamesMap
    if (fileNamesMap[id]) {
      console.log(`[DELETE device] Удаление из fileNamesMap: ${id} (${Object.keys(fileNamesMap[id]).length} файлов)`);
      delete fileNamesMap[id];
      saveFileNamesMap(fileNamesMap);
    } else {
      console.log(`[DELETE device] ℹ️ Устройство ${id} не найдено в fileNamesMap`);
    }
    
    io.emit('devices/updated');
    saveDevicesJson(devices);
    console.log(`[DELETE device] ✅ Устройство ${id} полностью удалено`);
    res.json({ ok: true });
  });
  
  return router;
}

