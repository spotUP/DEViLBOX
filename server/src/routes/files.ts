/**
 * File management routes
 */

import { Router, Response } from 'express';
import path from 'path';
import { randomBytes } from 'crypto';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  getUserSongsDirectory,
  getUserInstrumentsDirectory,
  listDirectory,
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  deleteFile as fsDeleteFile,
  isPathSafe,
  getUserDirectory
} from '../utils/fileSystem';
import db from '../db/database';

const router = Router();

/**
 * GET /api/files
 * List user's files
 */
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const type = req.query.type as string || 'songs'; // 'songs' or 'instruments'

    const dirPath = type === 'instruments'
      ? getUserInstrumentsDirectory(userId)
      : getUserSongsDirectory(userId);

    const files = listDirectory(dirPath);

    res.json({ files });
  } catch (error) {
    console.error('[Files] List error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * GET /api/files/:id
 * Get file content
 */
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const fileId = req.params.id;

    // Get file from database
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(fileId, userId) as any;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({
      id: file.id,
      filename: file.filename,
      data: JSON.parse(file.data),
      createdAt: file.created_at,
      updatedAt: file.updated_at
    });
  } catch (error) {
    console.error('[Files] Get error:', error);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

/**
 * POST /api/files
 * Save file
 */
router.post('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { filename, data, type } = req.body;

    if (!filename || !data) {
      return res.status(400).json({ error: 'Filename and data required' });
    }

    // Generate file ID
    const fileId = randomBytes(16).toString('hex');
    const now = Date.now();

    // Save to database
    db.prepare(`
      INSERT INTO files (id, user_id, filename, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(fileId, userId, filename, JSON.stringify(data), now, now);

    // Also save to filesystem
    const dirPath = type === 'instruments'
      ? getUserInstrumentsDirectory(userId)
      : getUserSongsDirectory(userId);

    const filePath = path.join(dirPath, filename);

    // Security check
    if (!isPathSafe(getUserDirectory(userId), filePath)) {
      return res.status(403).json({ error: 'Invalid file path' });
    }

    fsWriteFile(filePath, JSON.stringify(data, null, 2));

    res.status(201).json({
      id: fileId,
      filename,
      createdAt: now,
      updatedAt: now
    });
  } catch (error) {
    console.error('[Files] Save error:', error);
    res.status(500).json({ error: 'Failed to save file' });
  }
});

/**
 * PUT /api/files/:id
 * Update file
 */
router.put('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const fileId = req.params.id;
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ error: 'Data required' });
    }

    // Check file exists and belongs to user
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(fileId, userId) as any;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const now = Date.now();

    // Update in database
    db.prepare(`
      UPDATE files SET data = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(data), now, fileId);

    res.json({
      id: fileId,
      filename: file.filename,
      updatedAt: now
    });
  } catch (error) {
    console.error('[Files] Update error:', error);
    res.status(500).json({ error: 'Failed to update file' });
  }
});

/**
 * DELETE /api/files/:id
 * Delete file
 */
router.delete('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const fileId = req.params.id;

    // Check file exists and belongs to user
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(fileId, userId) as any;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete from database
    db.prepare('DELETE FROM files WHERE id = ?').run(fileId);

    // Try to delete from filesystem
    try {
      const dirPath = getUserSongsDirectory(userId); // TODO: determine type
      const filePath = path.join(dirPath, file.filename);
      if (isPathSafe(getUserDirectory(userId), filePath)) {
        fsDeleteFile(filePath);
      }
    } catch (error) {
      console.warn('[Files] Failed to delete from filesystem:', error);
      // Continue anyway - database record is deleted
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Files] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
