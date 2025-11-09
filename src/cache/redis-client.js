import Redis from 'ioredis';
import logger from '../monitoring/logger.js';

class RedisClient {
  constructor() {
    this.client = null;
    this.enabled = process.env.REDIS_ENABLED === 'true';
    this.url = process.env.REDIS_URL || 'redis://localhost:6379';
  }

  /**
   * Connect to Redis
   */
  async connect() {
    if (!this.enabled) {
      logger.info('Redis is disabled, using in-memory cache');
      return;
    }

    try {
      this.client = new Redis(this.url, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: true
      });

      this.client.on('connect', () => {
        logger.info('✅ Redis connected');
      });

      this.client.on('error', (err) => {
        logger.error('❌ Redis error:', err);
      });

      this.client.on('close', () => {
        logger.warn('⚠️  Redis connection closed');
      });

      await this.client.ping();
      logger.info('Redis connection successful');

    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      this.enabled = false;
    }
  }

  /**
   * Get value from cache
   */
  async get(key) {
    if (!this.enabled || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key, value, ttlSeconds = 3600) {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttlSeconds, serialized);
      return true;
    } catch (error) {
      logger.error(`Redis SET error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key) {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error(`Redis DEL error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern) {
    if (!this.enabled || !this.client) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      return keys.length;
    } catch (error) {
      logger.error(`Redis DEL pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Increment counter
   */
  async incr(key) {
    if (!this.enabled || !this.client) {
      return 0;
    }

    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error(`Redis INCR error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Set expiration on key
   */
  async expire(key, seconds) {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      await this.client.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error(`Redis EXPIRE error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get multiple keys
   */
  async mget(keys) {
    if (!this.enabled || !this.client || keys.length === 0) {
      return [];
    }

    try {
      const values = await this.client.mget(...keys);
      return values.map(v => v ? JSON.parse(v) : null);
    } catch (error) {
      logger.error('Redis MGET error:', error);
      return [];
    }
  }

  /**
   * Flush all keys (use with caution!)
   */
  async flushall() {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      await this.client.flushall();
      logger.warn('Redis: All keys flushed');
      return true;
    } catch (error) {
      logger.error('Redis FLUSHALL error:', error);
      return false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      logger.info('Redis disconnected');
    }
  }

  /**
   * Get client instance
   */
  getClient() {
    return this.client;
  }

  /**
   * Check if Redis is enabled
   */
  isEnabled() {
    return this.enabled && this.client !== null;
  }
}

// Singleton instance
const redisClient = new RedisClient();

export default redisClient;

