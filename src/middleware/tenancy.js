import logger from '../monitoring/logger.js';

/**
 * Middleware to enforce organization isolation
 * Ensures users can only access data from their own organization
 */
export function enforceOrganizationContext(req, res, next) {
  // Authenticated users should have organization ID in their token
  if (req.user && req.user.organizationId) {
    req.organizationId = req.user.organizationId;
    next();
  } else {
    logger.warn('Request without organization context', {
      path: req.path,
      user: req.user?.userId
    });
    res.status(403).json({ 
      error: 'Organization context required',
      message: 'You must be associated with an organization to perform this action'
    });
  }
}

/**
 * Middleware to check organization limits
 */
export async function checkOrganizationLimits(limitType) {
  return async (req, res, next) => {
    try {
      const organizationId = req.organizationId || req.user?.organizationId;

      if (!organizationId) {
        return res.status(403).json({ error: 'Organization context required' });
      }

      const { default: organizationRepository } = await import('../database/repositories/organization-repository.js');

      let canProceed = false;

      switch (limitType) {
        case 'device':
          canProceed = await organizationRepository.canAddDevice(organizationId);
          break;
        case 'user':
          canProceed = await organizationRepository.canAddUser(organizationId);
          break;
        default:
          canProceed = true;
      }

      if (!canProceed) {
        return res.status(403).json({ 
          error: `Organization limit reached for ${limitType}s`,
          message: `Your organization has reached the maximum number of ${limitType}s for your current plan`
        });
      }

      next();

    } catch (error) {
      logger.error('Error checking organization limits:', error);
      res.status(500).json({ error: 'Failed to check organization limits' });
    }
  };
}

/**
 * Middleware to filter query by organization
 * Automatically adds organizationId filter to database queries
 */
export function withOrganizationFilter(req, res, next) {
  const organizationId = req.organizationId || req.user?.organizationId;

  if (!organizationId) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  // Add organization filter to req object for use in routes
  req.orgFilter = { organizationId };
  next();
}

export default {
  enforceOrganizationContext,
  checkOrganizationLimits,
  withOrganizationFilter
};

