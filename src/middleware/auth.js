import { verifyToken } from '../auth/jwt.js';
import { hasPermission, hasRoleOrHigher } from '../auth/permissions.js';
import getPrismaClient from '../database/prisma-client.js';

const prisma = getPrismaClient();

/**
 * Middleware to authenticate JWT token
 */
export function authenticateToken(req, res, next) {
  // Get token from header, cookie, or query parameter
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN
    || req.cookies?.token
    || req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: error.message || 'Invalid token' });
  }
}

/**
 * Middleware to authenticate API key
 */
export async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const key = await prisma.apiKey.findUnique({
      where: { key: apiKey }
    });

    if (!key || !key.isActive) {
      return res.status(403).json({ error: 'Invalid or inactive API key' });
    }

    // Check expiration
    if (key.expiresAt && new Date() > key.expiresAt) {
      return res.status(403).json({ error: 'API key expired' });
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsed: new Date() }
    });

    req.apiKey = key;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware to check if user has required permission
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: permission
      });
    }

    next();
  };
}

/**
 * Middleware to check if user has required role or higher
 */
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!hasRoleOrHigher(req.user.role, role)) {
      return res.status(403).json({ 
        error: 'Insufficient role',
        required: role,
        current: req.user.role
      });
    }

    next();
  };
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]
    || req.cookies?.token
    || req.query.token;

  if (token) {
    try {
      const decoded = verifyToken(token);
      req.user = decoded;
    } catch (error) {
      // Ignore errors for optional auth
    }
  }

  next();
}

export default {
  authenticateToken,
  authenticateApiKey,
  requirePermission,
  requireRole,
  optionalAuth
};

