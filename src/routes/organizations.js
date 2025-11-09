import express from 'express';
import organizationRepository from '../database/repositories/organization-repository.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { ROLES } from '../auth/permissions.js';
import logger from '../monitoring/logger.js';

export function createOrganizationRouter() {
  const router = express.Router();

  /**
   * GET /api/organizations - Get all organizations (super admin only)
   */
  router.get('/', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
    try {
      const organizations = await organizationRepository.findAll();
      res.json(organizations);
    } catch (error) {
      logger.error('Error getting organizations:', error);
      res.status(500).json({ error: 'Failed to get organizations' });
    }
  });

  /**
   * GET /api/organizations/:id - Get organization by ID
   */
  router.get('/:id', authenticateToken, async (req, res) => {
    try {
      // Users can only view their own organization (unless admin)
      if (req.user.organizationId !== req.params.id && req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const organization = await organizationRepository.findById(req.params.id);

      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json(organization);

    } catch (error) {
      logger.error('Error getting organization:', error);
      res.status(500).json({ error: 'Failed to get organization' });
    }
  });

  /**
   * GET /api/organizations/:id/stats - Get organization usage stats
   */
  router.get('/:id/stats', authenticateToken, async (req, res) => {
    try {
      // Users can only view their own organization stats
      if (req.user.organizationId !== req.params.id && req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const stats = await organizationRepository.getUsageStats(req.params.id);

      if (!stats) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json(stats);

    } catch (error) {
      logger.error('Error getting organization stats:', error);
      res.status(500).json({ error: 'Failed to get organization stats' });
    }
  });

  /**
   * POST /api/organizations - Create new organization (super admin only)
   */
  router.post('/', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
    try {
      const { name, slug, plan, maxDevices, maxUsers, settings } = req.body;

      if (!name || !slug) {
        return res.status(400).json({ error: 'Name and slug required' });
      }

      // Check if slug is unique
      const existing = await organizationRepository.findBySlug(slug);
      if (existing) {
        return res.status(409).json({ error: 'Organization slug already exists' });
      }

      const organization = await organizationRepository.create({
        name,
        slug,
        plan,
        maxDevices,
        maxUsers,
        settings
      });

      logger.info(`Organization created: ${organization.id} by user ${req.user.userId}`);
      res.status(201).json(organization);

    } catch (error) {
      logger.error('Error creating organization:', error);
      res.status(500).json({ error: 'Failed to create organization' });
    }
  });

  /**
   * PUT /api/organizations/:id - Update organization
   */
  router.put('/:id', authenticateToken, async (req, res) => {
    try {
      // Only organization admins or super admins can update
      const isOrgAdmin = req.user.organizationId === req.params.id && req.user.role === ROLES.ADMIN;
      const isSuperAdmin = req.user.role === ROLES.ADMIN; // You might want a SUPER_ADMIN role

      if (!isOrgAdmin && !isSuperAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { name, plan, maxDevices, maxUsers, settings, isActive } = req.body;

      const organization = await organizationRepository.update(req.params.id, {
        name,
        plan,
        maxDevices,
        maxUsers,
        settings,
        isActive
      });

      logger.info(`Organization updated: ${organization.id} by user ${req.user.userId}`);
      res.json(organization);

    } catch (error) {
      logger.error('Error updating organization:', error);
      res.status(500).json({ error: 'Failed to update organization' });
    }
  });

  /**
   * DELETE /api/organizations/:id - Delete organization (super admin only)
   */
  router.delete('/:id', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
    try {
      await organizationRepository.delete(req.params.id);

      logger.info(`Organization deleted: ${req.params.id} by user ${req.user.userId}`);
      res.json({ message: 'Organization deleted successfully' });

    } catch (error) {
      logger.error('Error deleting organization:', error);
      res.status(500).json({ error: 'Failed to delete organization' });
    }
  });

  return router;
}

export default createOrganizationRouter;

