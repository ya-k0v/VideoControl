import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

/**
 * Generate JWT access token
 */
export function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'videocontrol'
  });
}

/**
 * Generate refresh token
 */
export function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    } else {
      throw error;
    }
  }
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token) {
  return jwt.decode(token);
}

/**
 * Generate API key
 */
export function generateApiKey() {
  return 'vc_' + crypto.randomBytes(32).toString('hex');
}

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  decodeToken,
  generateApiKey
};

