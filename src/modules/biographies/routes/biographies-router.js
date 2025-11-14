/**
 * Biography Module - API Router
 * Express роутер для CRUD операций с биографиями
 */

import { Router } from 'express';
import { biographyQueries } from '../database/queries.js';

/**
 * Валидация размера base64 медиа (макс 5GB)
 */
function validateMediaSize(base64String) {
  if (!base64String) return;
  
  // Убираем data:image/...;base64, prefix если есть
  const base64Data = base64String.split(',')[1] || base64String;
  
  try {
    const sizeInBytes = Buffer.from(base64Data, 'base64').length;
    const maxSize = 1024 * 1024 * 1024; // 1GB
    
    if (sizeInBytes > maxSize) {
      throw new Error('File too large (max 1GB)');
    }
  } catch (err) {
    if (err.message === 'File too large (max 1GB)') {
      throw err;
    }
    // Если ошибка парсинга - игнорируем (может быть пустая строка)
  }
}

/**
 * Создать роутер для биографий
 */
export function createBiographiesRouter({ requireAdmin }) {
  const router = Router();
  
  // ========================================
  // PUBLIC ROUTES - доступ без авторизации
  // ========================================
  
  /**
   * GET /api/biographies
   * Получить все биографии
   */
  router.get('/', (req, res) => {
    try {
      const biographies = biographyQueries.getAll();
      res.json(biographies);
    } catch (error) {
      console.error('[Biographies] Error getting all:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  /**
   * GET /api/biographies/search?q=query
   * Поиск биографий по ФИО
   */
  router.get('/search', (req, res) => {
    try {
      const query = req.query.q || '';
      const results = biographyQueries.search(query);
      res.json(results);
    } catch (error) {
      console.error('[Biographies] Error searching:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  /**
   * GET /api/biographies/:id
   * Получить биографию по ID с медиа материалами
   */
  router.get('/:id', (req, res) => {
    try {
      const bio = biographyQueries.getById(req.params.id);
      if (!bio) {
        return res.status(404).json({ error: 'Biography not found' });
      }
      res.json(bio);
    } catch (error) {
      console.error('[Biographies] Error getting by ID:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ========================================
  // ADMIN ONLY ROUTES - требуется авторизация
  // ========================================
  
  /**
   * POST /api/biographies
   * Создать новую биографию
   */
  router.post('/', requireAdmin, (req, res) => {
    try {
      // Валидация размера фото
      validateMediaSize(req.body.photo_base64);
      
      // Создание биографии
      const id = biographyQueries.create(req.body);

      if (Array.isArray(req.body.media)) {
        req.body.media.forEach(item => {
          validateMediaSize(item.media_base64);
          biographyQueries.addMedia(id, {
            type: item.type || 'photo',
            media_base64: item.media_base64,
            caption: item.caption || '',
            order_index: item.order_index || 0
          });
        });
      }
      
      console.log('[Biographies] ✅ Created biography:', id, req.body.full_name);
      res.json({ id, success: true });
    } catch (error) {
      console.error('[Biographies] Error creating:', error);
      res.status(400).json({ error: error.message });
    }
  });
  
  /**
   * PUT /api/biographies/:id
   * Обновить биографию
   */
  router.put('/:id', requireAdmin, (req, res) => {
    try {
      // Валидация размера фото
      validateMediaSize(req.body.photo_base64);
      
      // Обновление биографии
      biographyQueries.update(req.params.id, req.body);

      if (Array.isArray(req.body.media)) {
        biographyQueries.deleteMediaByBiography(req.params.id);
        req.body.media.forEach(item => {
          validateMediaSize(item.media_base64);
          biographyQueries.addMedia(req.params.id, {
            type: item.type || 'photo',
            media_base64: item.media_base64,
            caption: item.caption || '',
            order_index: item.order_index || 0
          });
        });
      }
      
      console.log('[Biographies] ✅ Updated biography:', req.params.id, req.body.full_name);
      res.json({ success: true });
    } catch (error) {
      console.error('[Biographies] Error updating:', error);
      res.status(400).json({ error: error.message });
    }
  });
  
  /**
   * DELETE /api/biographies/:id
   * Удалить биографию (CASCADE удалит все медиа)
   */
  router.delete('/:id', requireAdmin, (req, res) => {
    try {
      biographyQueries.delete(req.params.id);
      
      console.log('[Biographies] ✅ Deleted biography:', req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('[Biographies] Error deleting:', error);
      res.status(400).json({ error: error.message });
    }
  });
  
  /**
   * POST /api/biographies/:id/media
   * Добавить медиа материал к биографии
   */
  router.post('/:id/media', requireAdmin, (req, res) => {
    try {
      // Валидация размера медиа
      validateMediaSize(req.body.media_base64);
      
      // Добавление медиа
      const mediaId = biographyQueries.addMedia(req.params.id, req.body);
      
      console.log('[Biographies] ✅ Added media:', mediaId, 'to biography:', req.params.id);
      res.json({ id: mediaId, success: true });
    } catch (error) {
      console.error('[Biographies] Error adding media:', error);
      res.status(400).json({ error: error.message });
    }
  });
  
  /**
   * DELETE /api/biographies/media/:mediaId
   * Удалить медиа материал
   */
  router.delete('/media/:mediaId', requireAdmin, (req, res) => {
    try {
      biographyQueries.deleteMedia(req.params.mediaId);
      
      console.log('[Biographies] ✅ Deleted media:', req.params.mediaId);
      res.json({ success: true });
    } catch (error) {
      console.error('[Biographies] Error deleting media:', error);
      res.status(400).json({ error: error.message });
    }
  });
  
  return router;
}

