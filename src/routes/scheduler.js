import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { ROLES } from '../auth/permissions.js';
import logger from '../monitoring/logger.js';

export function createSchedulerRouter(scheduler) {
  const router = express.Router();

  /**
   * GET /api/scheduler/status - Get scheduler status
   */
  router.get('/status', authenticateToken, async (req, res) => {
    try {
      const status = scheduler.getStatus();
      res.json(status);
    } catch (error) {
      logger.error('Error getting scheduler status:', error);
      res.status(500).json({ error: 'Failed to get scheduler status' });
    }
  });

  /**
   * POST /api/scheduler/start - Start scheduler (admin only)
   */
  router.post('/start', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
    try {
      await scheduler.start();
      logger.info(`Scheduler started by user ${req.user.userId}`);
      res.json({ message: 'Scheduler started successfully' });
    } catch (error) {
      logger.error('Error starting scheduler:', error);
      res.status(500).json({ error: 'Failed to start scheduler' });
    }
  });

  /**
   * POST /api/scheduler/stop - Stop scheduler (admin only)
   */
  router.post('/stop', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
    try {
      scheduler.stop();
      logger.info(`Scheduler stopped by user ${req.user.userId}`);
      res.json({ message: 'Scheduler stopped successfully' });
    } catch (error) {
      logger.error('Error stopping scheduler:', error);
      res.status(500).json({ error: 'Failed to stop scheduler' });
    }
  });

  /**
   * POST /api/scheduler/reload - Reload scheduled playlists
   */
  router.post('/reload', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
    try {
      await scheduler.loadScheduledPlaylists();
      logger.info(`Scheduler reloaded by user ${req.user.userId}`);
      res.json({ message: 'Scheduled playlists reloaded successfully' });
    } catch (error) {
      logger.error('Error reloading scheduler:', error);
      res.status(500).json({ error: 'Failed to reload scheduler' });
    }
  });

  return router;
}

export default createSchedulerRouter;

