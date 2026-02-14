/**
 * Authentication routes
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import db from '../db/database';
import { generateToken } from '../middleware/auth';
import { createUserDirectory } from '../utils/fileSystem';

const router = Router();

/**
 * POST /api/auth/signup
 * Create new user account
 */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if username already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate user ID
    const userId = randomBytes(16).toString('hex');
    const now = Date.now();

    // Create user in database
    db.prepare(`
      INSERT INTO users (id, username, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, username, passwordHash, now);

    // Create user directory with symlinks
    try {
      createUserDirectory(userId);
    } catch (error) {
      console.error('[Auth] Failed to create user directory:', error);
      // Continue anyway - directory can be created later
    }

    // Generate JWT token
    const token = generateToken(userId);

    res.status(201).json({
      token,
      user: {
        id: userId,
        username,
        createdAt: now
      }
    });
  } catch (error) {
    console.error('[Auth] Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Login with username and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Find user
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(Date.now(), user.id);

    // Generate JWT token
    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info (requires auth)
 */
router.get('/me', (req: Request, res: Response) => {
  // This would need the auth middleware, but for now just return a placeholder
  res.json({ message: 'User info endpoint' });
});

export default router;
