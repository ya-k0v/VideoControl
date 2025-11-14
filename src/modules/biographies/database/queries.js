/**
 * Biography Module - Database Queries
 * CRUD операции для биографий
 */

import { biographiesDb } from './biographies-db.js';

export const biographyQueries = {
  /**
   * Получить все биографии
   */
  getAll() {
    return biographiesDb.prepare('SELECT * FROM biographies ORDER BY full_name').all();
  },
  
  /**
   * Получить биографию по ID с медиа материалами
   */
  getById(id) {
    const bio = biographiesDb.prepare('SELECT * FROM biographies WHERE id = ?').get(id);
    if (bio) {
      bio.media = biographiesDb.prepare(
        'SELECT * FROM biography_media WHERE biography_id = ? ORDER BY order_index'
      ).all(id);
    }
    return bio;
  },
  
  /**
   * Поиск биографий по ФИО
   */
  search(query) {
    return biographiesDb.prepare(
      'SELECT * FROM biographies WHERE full_name LIKE ? ORDER BY full_name LIMIT 10'
    ).all(`%${query}%`);
  },
  
  /**
   * Создать новую биографию
   */
  create(data) {
    const stmt = biographiesDb.prepare(`
      INSERT INTO biographies (full_name, birth_year, death_year, rank, photo_base64, biography)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      data.full_name,
      data.birth_year || null,
      data.death_year || null,
      data.rank || null,
      data.photo_base64 || null,
      data.biography || null
    );
    
    return result.lastInsertRowid;
  },
  
  /**
   * Обновить биографию
   */
  update(id, data) {
    const stmt = biographiesDb.prepare(`
      UPDATE biographies 
      SET full_name = ?, birth_year = ?, death_year = ?, rank = ?, photo_base64 = ?, biography = ?
      WHERE id = ?
    `);
    
    return stmt.run(
      data.full_name,
      data.birth_year || null,
      data.death_year || null,
      data.rank || null,
      data.photo_base64 || null,
      data.biography || null,
      id
    );
  },
  
  /**
   * Удалить биографию (CASCADE удалит все медиа)
   */
  delete(id) {
    return biographiesDb.prepare('DELETE FROM biographies WHERE id = ?').run(id);
  },
  
  /**
   * Добавить медиа материал
   */
  addMedia(biographyId, media) {
    const stmt = biographiesDb.prepare(`
      INSERT INTO biography_media (biography_id, type, media_base64, caption, order_index)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      biographyId,
      media.type,
      media.media_base64,
      media.caption || null,
      media.order_index || 0
    );
    
    return result.lastInsertRowid;
  },
  
  /**
   * Удалить медиа материал
   */
  deleteMedia(mediaId) {
    return biographiesDb.prepare('DELETE FROM biography_media WHERE id = ?').run(mediaId);
  },

  /**
   * Удалить все медиа материала биографии
   */
  deleteMediaByBiography(biographyId) {
    return biographiesDb.prepare('DELETE FROM biography_media WHERE biography_id = ?').run(biographyId);
  }
};

