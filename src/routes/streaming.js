import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { ROLES } from '../auth/permissions.js';
import logger from '../monitoring/logger.js';

export function createStreamingRouter(rtmpServer, videoWallManager) {
  const router = express.Router();

  /**
   * GET /api/streaming/active - Get active streams
   */
  router.get('/active', authenticateToken, (req, res) => {
    try {
      const streams = rtmpServer.getActiveStreams();
      res.json(streams);
    } catch (error) {
      logger.error('Error getting active streams:', error);
      res.status(500).json({ error: 'Failed to get active streams' });
    }
  });

  /**
   * GET /api/streaming/:streamKey - Get stream stats
   */
  router.get('/:streamKey', authenticateToken, (req, res) => {
    try {
      const stats = rtmpServer.getStreamStats(req.params.streamKey);
      
      if (!stats) {
        return res.status(404).json({ error: 'Stream not found' });
      }

      res.json(stats);
    } catch (error) {
      logger.error('Error getting stream stats:', error);
      res.status(500).json({ error: 'Failed to get stream stats' });
    }
  });

  /**
   * POST /api/videowall - Create video wall
   */
  router.post('/videowall', authenticateToken, requireRole(ROLES.ADMIN), (req, res) => {
    try {
      const { name, layout, devices, syncMode } = req.body;

      if (!name || !layout || !devices) {
        return res.status(400).json({ 
          error: 'Name, layout, and devices required' 
        });
      }

      const id = `videowall_${Date.now()}`;
      const videoWall = videoWallManager.createVideoWall({
        id,
        name,
        layout,
        devices,
        syncMode
      });

      logger.info(`Video wall created: ${name} by user ${req.user.userId}`);
      res.status(201).json(videoWall);

    } catch (error) {
      logger.error('Error creating video wall:', error);
      res.status(500).json({ error: 'Failed to create video wall' });
    }
  });

  /**
   * GET /api/videowall - List all video walls
   */
  router.get('/videowall', authenticateToken, (req, res) => {
    try {
      const videoWalls = videoWallManager.listVideoWalls();
      res.json(videoWalls);
    } catch (error) {
      logger.error('Error listing video walls:', error);
      res.status(500).json({ error: 'Failed to list video walls' });
    }
  });

  /**
   * GET /api/videowall/:id - Get video wall
   */
  router.get('/videowall/:id', authenticateToken, (req, res) => {
    try {
      const videoWall = videoWallManager.getVideoWall(req.params.id);
      
      if (!videoWall) {
        return res.status(404).json({ error: 'Video wall not found' });
      }

      res.json(videoWall);
    } catch (error) {
      logger.error('Error getting video wall:', error);
      res.status(500).json({ error: 'Failed to get video wall' });
    }
  });

  /**
   * POST /api/videowall/:id/play - Play on video wall
   */
  router.post('/videowall/:id/play', authenticateToken, async (req, res) => {
    try {
      const { file } = req.body;

      if (!file) {
        return res.status(400).json({ error: 'File required' });
      }

      await videoWallManager.play(req.params.id, file);
      
      logger.info(`Video wall play: ${req.params.id}`);
      res.json({ message: 'Playback started on video wall' });

    } catch (error) {
      logger.error('Error playing on video wall:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/videowall/:id/stop - Stop video wall
   */
  router.post('/videowall/:id/stop', authenticateToken, async (req, res) => {
    try {
      await videoWallManager.stop(req.params.id);
      res.json({ message: 'Video wall stopped' });
    } catch (error) {
      logger.error('Error stopping video wall:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/videowall/:id - Delete video wall
   */
  router.delete('/videowall/:id', authenticateToken, requireRole(ROLES.ADMIN), (req, res) => {
    try {
      videoWallManager.deleteVideoWall(req.params.id);
      logger.info(`Video wall deleted: ${req.params.id}`);
      res.json({ message: 'Video wall deleted' });
    } catch (error) {
      logger.error('Error deleting video wall:', error);
      res.status(500).json({ error: 'Failed to delete video wall' });
    }
  });

  return router;
}

export default createStreamingRouter;

