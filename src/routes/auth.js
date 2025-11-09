import express from 'express';
import { hashPassword, comparePassword, validatePasswordStrength } from '../auth/password.js';
import { generateAccessToken, generateRefreshToken } from '../auth/jwt.js';
import { authenticateToken } from '../middleware/auth.js';
import getPrismaClient from '../database/prisma-client.js';

const prisma = getPrismaClient();

export function createAuthRouter() {
  const router = express.Router();

  /**
   * POST /auth/register - Register new user (admin only in production)
   */
  router.post('/register', async (req, res) => {
    try {
      const { email, username, password, role } = req.body;

      // Validate input
      if (!email || !username || !password) {
        return res.status(400).json({ error: 'Email, username and password required' });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({ 
          error: 'Password does not meet requirements',
          details: passwordValidation.errors
        });
      }

      // Check if user already exists
      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { username }
          ]
        }
      });

      if (existing) {
        return res.status(409).json({ error: 'User already exists' });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user (default role is VIEWER unless admin creates)
      const user = await prisma.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
          role: role || 'VIEWER'
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          createdAt: true
        }
      });

      res.status(201).json({ 
        message: 'User registered successfully',
        user
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  /**
   * POST /auth/login - Login and get JWT token
   */
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Verify password
      const isValid = await comparePassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate tokens
      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      });

      const refreshToken = generateRefreshToken();

      // Save session
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      await prisma.session.create({
        data: {
          userId: user.id,
          token: accessToken,
          refreshToken,
          expiresAt,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });

      res.json({
        message: 'Login successful',
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  /**
   * POST /auth/logout - Logout and invalidate token
   */
  router.post('/logout', authenticateToken, async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (token) {
        await prisma.session.deleteMany({
          where: { token }
        });
      }

      res.json({ message: 'Logout successful' });

    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  /**
   * POST /auth/refresh - Refresh access token
   */
  router.post('/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      // Find session
      const session = await prisma.session.findUnique({
        where: { refreshToken },
        include: { user: true }
      });

      if (!session || new Date() > session.expiresAt) {
        return res.status(403).json({ error: 'Invalid or expired refresh token' });
      }

      // Generate new access token
      const accessToken = generateAccessToken({
        userId: session.user.id,
        email: session.user.email,
        username: session.user.username,
        role: session.user.role
      });

      // Update session
      await prisma.session.update({
        where: { id: session.id },
        data: { token: accessToken }
      });

      res.json({
        accessToken,
        user: {
          id: session.user.id,
          email: session.user.email,
          username: session.user.username,
          role: session.user.role
        }
      });

    } catch (error) {
      console.error('Refresh error:', error);
      res.status(500).json({ error: 'Token refresh failed' });
    }
  });

  /**
   * GET /auth/me - Get current user info
   */
  router.get('/me', authenticateToken, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ user });

    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user info' });
    }
  });

  /**
   * PUT /auth/password - Change password
   */
  router.put('/password', authenticateToken, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password required' });
      }

      // Validate new password
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        return res.status(400).json({ 
          error: 'New password does not meet requirements',
          details: passwordValidation.errors
        });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId }
      });

      // Verify current password
      const isValid = await comparePassword(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Hash and update new password
      const hashedPassword = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword }
      });

      // Invalidate all sessions
      await prisma.session.deleteMany({
        where: { userId: user.id }
      });

      res.json({ message: 'Password changed successfully. Please login again.' });

    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Password change failed' });
    }
  });

  return router;
}

export default createAuthRouter;

