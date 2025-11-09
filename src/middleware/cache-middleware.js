import redisClient from '../cache/redis-client.js';
import logger from '../monitoring/logger.js';
import crypto from 'crypto';

/**
 * Generate cache key from request
 */
function generateCacheKey(req) {
  const { method, originalUrl, organizationId } = req;
  const userId = req.user?.userId || 'anonymous';
  const org = organizationId || req.user?.organizationId || 'default';
  
  return `cache:${org}:${method}:${originalUrl}:${userId}`;
}

/**
 * Middleware to cache API responses
 */
export function cacheMiddleware(ttlSeconds = 60) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET' || !redisClient.isEnabled()) {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    try {
      // Try to get from cache
      const cachedData = await redisClient.get(cacheKey);

      if (cachedData) {
        logger.debug(`Cache HIT: ${cacheKey}`);
        return res.json(cachedData);
      }

      logger.debug(`Cache MISS: ${cacheKey}`);

      // Override res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = function(body) {
        // Cache the response
        redisClient.set(cacheKey, body, ttlSeconds).catch(err => {
          logger.error('Failed to cache response:', err);
        });

        return originalJson(body);
      };

      next();

    } catch (error) {
      logger.error('Cache middleware error:', error);
      next();
    }
  };
}

/**
 * Middleware to invalidate cache on mutations
 */
export function invalidateCacheMiddleware(patterns) {
  return async (req, res, next) => {
    if (!redisClient.isEnabled()) {
      return next();
    }

    // Store original send
    const originalSend = res.send.bind(res);

    res.send = function(body) {
      // If successful mutation (2xx status), invalidate cache
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const org = req.organizationId || req.user?.organizationId || 'default';
        
        patterns.forEach(pattern => {
          const fullPattern = `cache:${org}:${pattern}`;
          redisClient.delPattern(fullPattern).catch(err => {
            logger.error(`Failed to invalidate cache pattern ${fullPattern}:`, err);
          });
        });
      }

      return originalSend(body);
    };

    next();
  };
}

/**
 * Rate limiting using Redis
 */
export function redisRateLimit(options = {}) {
  const {
    windowMs = 60000, // 1 minute
    max = 100, // 100 requests per window
    keyPrefix = 'ratelimit:',
  } = options;

  return async (req, res, next) => {
    if (!redisClient.isEnabled()) {
      return next();
    }

    try {
      const identifier = req.ip || req.user?.userId || 'anonymous';
      const key = `${keyPrefix}${identifier}`;

      const current = await redisClient.incr(key);

      // Set expiration on first request
      if (current === 1) {
        await redisClient.expire(key, Math.ceil(windowMs / 1000));
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - current));

      if (current > max) {
        res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        return res.status(429).json({ 
          error: 'Too many requests',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }

      next();

    } catch (error) {
      logger.error('Rate limit error:', error);
      next();
    }
  };
}

/**
 * Cache warming - preload frequently accessed data
 */
export async function warmCache(organizationId, data) {
  if (!redisClient.isEnabled()) {
    return;
  }

  try {
    const cacheKeys = {
      devices: `cache:${organizationId}:devices:all`,
      playlists: `cache:${organizationId}:playlists:all`,
      users: `cache:${organizationId}:users:all`
    };

    for (const [type, key] of Object.entries(cacheKeys)) {
      if (data[type]) {
        await redisClient.set(key, data[type], 300); // 5 minutes
        logger.info(`Cache warmed: ${key}`);
      }
    }

  } catch (error) {
    logger.error('Cache warming error:', error);
  }
}

export default {
  cacheMiddleware,
  invalidateCacheMiddleware,
  redisRateLimit,
  warmCache
};

