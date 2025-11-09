import express from 'express';
import playlistRepository from '../database/repositories/playlist-repository.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../auth/permissions.js';
import logger from '../monitoring/logger.js';

export function createPlaylistRouter() {
  const router = express.Router();

  /**
   * GET /api/playlists - Get all playlists
   */
  router.get('/', authenticateToken, requirePermission(PERMISSIONS.PLAYLIST_VIEW), async (req, res) => {
    try {
      const playlists = await playlistRepository.findAll();
      res.json(playlists);
    } catch (error) {
      logger.error('Error getting playlists:', error);
      res.status(500).json({ error: 'Failed to get playlists' });
    }
  });

  /**
   * GET /api/playlists/:id - Get playlist by ID
   */
  router.get('/:id', authenticateToken, requirePermission(PERMISSIONS.PLAYLIST_VIEW), async (req, res) => {
    try {
      const playlist = await playlistRepository.findById(req.params.id);
      
      if (!playlist) {
        return res.status(404).json({ error: 'Playlist not found' });
      }

      res.json(playlist);
    } catch (error) {
      logger.error('Error getting playlist:', error);
      res.status(500).json({ error: 'Failed to get playlist' });
    }
  });

  /**
   * POST /api/playlists - Create new playlist
   */
  router.post('/', authenticateToken, requirePermission(PERMISSIONS.PLAYLIST_CREATE), async (req, res) => {
    try {
      const { name, description, loop, shuffle, schedule } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Playlist name required' });
      }

      const playlist = await playlistRepository.create({
        name,
        description,
        loop,
        shuffle,
        schedule
      });

      logger.info(`Playlist created: ${playlist.id} by user ${req.user.userId}`);
      res.status(201).json(playlist);

    } catch (error) {
      logger.error('Error creating playlist:', error);
      res.status(500).json({ error: 'Failed to create playlist' });
    }
  });

  /**
   * PUT /api/playlists/:id - Update playlist
   */
  router.put('/:id', authenticateToken, requirePermission(PERMISSIONS.PLAYLIST_UPDATE), async (req, res) => {
    try {
      const { name, description, loop, shuffle, schedule } = req.body;

      const playlist = await playlistRepository.update(req.params.id, {
        name,
        description,
        loop,
        shuffle,
        schedule
      });

      logger.info(`Playlist updated: ${playlist.id} by user ${req.user.userId}`);
      res.json(playlist);

    } catch (error) {
      logger.error('Error updating playlist:', error);
      res.status(500).json({ error: 'Failed to update playlist' });
    }
  });

  /**
   * DELETE /api/playlists/:id - Delete playlist
   */
  router.delete('/:id', authenticateToken, requirePermission(PERMISSIONS.PLAYLIST_DELETE), async (req, res) => {
    try {
      await playlistRepository.delete(req.params.id);
      logger.info(`Playlist deleted: ${req.params.id} by user ${req.user.userId}`);
      res.json({ message: 'Playlist deleted successfully' });

    } catch (error) {
      logger.error('Error deleting playlist:', error);
      res.status(500).json({ error: 'Failed to delete playlist' });
    }
  });

  /**
   * POST /api/playlists/:id/items - Add item to playlist
   */
  router.post('/:id/items', authenticateToken, requirePermission(PERMISSIONS.PLAYLIST_UPDATE), async (req, res) => {
    try {
      const { fileId, order, duration } = req.body;

      if (!fileId || order === undefined) {
        return res.status(400).json({ error: 'fileId and order required' });
      }

      const item = await playlistRepository.addItem(req.params.id, fileId, order, duration);
      
      logger.info(`Item added to playlist ${req.params.id}: ${fileId}`);
      res.status(201).json(item);

    } catch (error) {
      logger.error('Error adding item to playlist:', error);
      res.status(500).json({ error: 'Failed to add item to playlist' });
    }
  });

  /**
   * DELETE /api/playlists/:id/items/:itemId - Remove item from playlist
   */
  router.delete('/:id/items/:itemId', authenticateToken, requirePermission(PERMISSIONS.PLAYLIST_UPDATE), async (req, res) => {
    try {
      await playlistRepository.removeItem(req.params.itemId);
      
      logger.info(`Item removed from playlist ${req.params.id}: ${req.params.itemId}`);
      res.json({ message: 'Item removed successfully' });

    } catch (error) {
      logger.error('Error removing item from playlist:', error);
      res.status(500).json({ error: 'Failed to remove item' });
    }
  });

  /**
   * PUT /api/playlists/:id/reorder - Reorder playlist items
   */
  router.put('/:id/reorder', authenticateToken, requirePermission(PERMISSIONS.PLAYLIST_UPDATE), async (req, res) => {
    try {
      const { itemOrders } = req.body;

      if (!Array.isArray(itemOrders)) {
        return res.status(400).json({ error: 'itemOrders array required' });
      }

      await playlistRepository.reorderItems(req.params.id, itemOrders);
      
      logger.info(`Playlist items reordered: ${req.params.id}`);
      res.json({ message: 'Items reordered successfully' });

    } catch (error) {
      logger.error('Error reordering playlist items:', error);
      res.status(500).json({ error: 'Failed to reorder items' });
    }
  });

  /**
   * POST /api/playlists/:id/assign - Assign playlist to device
   */
  router.post('/:id/assign', authenticateToken, requirePermission(PERMISSIONS.PLAYLIST_UPDATE), async (req, res) => {
    try {
      const { deviceId, priority } = req.body;

      if (!deviceId) {
        return res.status(400).json({ error: 'deviceId required' });
      }

      await playlistRepository.assignToDevice(req.params.id, deviceId, priority);
      
      logger.info(`Playlist ${req.params.id} assigned to device ${deviceId}`);
      res.json({ message: 'Playlist assigned successfully' });

    } catch (error) {
      logger.error('Error assigning playlist:', error);
      res.status(500).json({ error: 'Failed to assign playlist' });
    }
  });

  /**
   * DELETE /api/playlists/:id/assign/:deviceId - Unassign playlist from device
   */
  router.delete('/:id/assign/:deviceId', authenticateToken, requirePermission(PERMISSIONS.PLAYLIST_UPDATE), async (req, res) => {
    try {
      await playlistRepository.unassignFromDevice(req.params.id, req.params.deviceId);
      
      logger.info(`Playlist ${req.params.id} unassigned from device ${req.params.deviceId}`);
      res.json({ message: 'Playlist unassigned successfully' });

    } catch (error) {
      logger.error('Error unassigning playlist:', error);
      res.status(500).json({ error: 'Failed to unassign playlist' });
    }
  });

  /**
   * GET /api/devices/:deviceId/playlists - Get device playlists
   */
  router.get('/devices/:deviceId/playlists', authenticateToken, requirePermission(PERMISSIONS.PLAYLIST_VIEW), async (req, res) => {
    try {
      const playlists = await playlistRepository.getDevicePlaylists(req.params.deviceId);
      res.json(playlists);

    } catch (error) {
      logger.error('Error getting device playlists:', error);
      res.status(500).json({ error: 'Failed to get device playlists' });
    }
  });

  return router;
}

export default createPlaylistRouter;

