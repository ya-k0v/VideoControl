/**
 * API Routes для информации о видео и оптимизации
 * @module routes/video-info
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { DEVICES } from '../config/constants.js';
import { sanitizeDeviceId } from '../utils/sanitize.js';

const router = express.Router();

/**
 * Настройка роутера для видео информации
 * @param {Object} deps - Зависимости
 * @returns {express.Router} Настроенный роутер
 */
export function createVideoInfoRouter(deps) {
  const { devices, getFileStatus, checkVideoParameters, autoOptimizeVideoWrapper } = deps;
  
  // GET /api/devices/:id/files/:name/status - Получить статус обработки файла
  router.get('/:id/files/:name/status', (req, res) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    if (!devices[id]) {
      return res.status(404).json({ error: 'device not found' });
    }
    
    const fileName = decodeURIComponent(req.params.name);
    const status = getFileStatus(id, fileName);
    
    if (!status) {
      // Если статуса нет, значит файл готов к воспроизведению
      return res.json({ 
        status: 'ready', 
        progress: 100, 
        canPlay: true 
      });
    }
    
    res.json(status);
  });
  
  // GET /api/devices/:id/files/:name/video-info - Получить информацию о видео
  router.get('/:id/files/:name/video-info', async (req, res) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    const d = devices[id];
    
    if (!d) {
      return res.status(404).json({ error: 'device not found' });
    }
    
    const fileName = decodeURIComponent(req.params.name);
    const filePath = path.join(DEVICES, d.folder, fileName);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'file not found' });
    }
    
    try {
      const params = await checkVideoParameters(filePath);
      
      if (!params) {
        return res.status(500).json({ error: 'cannot read video parameters' });
      }
      
      res.json({
        success: true,
        parameters: params
      });
      
    } catch (error) {
      console.error(`[video-info] ❌ Ошибка:`, error);
      res.status(500).json({ 
        error: 'failed to get video info', 
        detail: error.message 
      });
    }
  });
  
  // POST /api/devices/:id/files/:name/optimize - Запустить оптимизацию видео
  router.post('/:id/files/:name/optimize', async (req, res) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    const fileName = decodeURIComponent(req.params.name);
    const d = devices[id];
    
    if (!d) {
      return res.status(404).json({ error: 'device not found' });
    }
    
    console.log(`[API] 🎬 Ручная оптимизация: ${fileName}`);
    
    try {
      const result = await autoOptimizeVideoWrapper(id, fileName);
      
      if (result.success) {
        // devices/updated уже отправлен внутри autoOptimizeVideo
        res.json(result);
      } else {
        res.status(500).json(result);
      }
      
    } catch (error) {
      console.error(`[optimize] ❌ Ошибка:`, error);
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  });
  
  return router;
}

