import express from 'express';
import { getMetrics, getMetricsJSON } from '../monitoring/metrics.js';
import logger from '../monitoring/logger.js';

export function createMetricsRouter() {
  const router = express.Router();

  /**
   * GET /metrics - Prometheus metrics endpoint
   */
  router.get('/', async (req, res) => {
    try {
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      const metrics = await getMetrics();
      res.send(metrics);
    } catch (error) {
      logger.error('Error getting metrics:', error);
      res.status(500).send('Error getting metrics');
    }
  });

  /**
   * GET /metrics/json - Metrics in JSON format
   */
  router.get('/json', async (req, res) => {
    try {
      const metrics = await getMetricsJSON();
      res.json(metrics);
    } catch (error) {
      logger.error('Error getting metrics JSON:', error);
      res.status(500).json({ error: 'Error getting metrics' });
    }
  });

  /**
   * GET /health - Health check endpoint
   */
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  /**
   * GET /health/ready - Readiness probe
   */
  router.get('/health/ready', async (req, res) => {
    try {
      // Check database connection
      const { checkDatabaseConnection } = await import('../database/prisma-client.js');
      const dbStatus = await checkDatabaseConnection();

      if (dbStatus.status === 'ok') {
        res.json({
          status: 'ready',
          database: 'connected',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          database: 'disconnected',
          error: dbStatus.message,
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'not ready',
        error: error.message,
      });
    }
  });

  /**
   * GET /health/live - Liveness probe
   */
  router.get('/health/live', (req, res) => {
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

export default createMetricsRouter;

