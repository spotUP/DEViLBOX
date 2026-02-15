/**
 * File management routes
 */

import { Router, Response } from 'express';
import path from 'path';
import { randomBytes } from 'crypto';
import * as jsondiffpatch from 'jsondiffpatch';
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

// Maximum revisions to keep per file
const MAX_REVISIONS = 10;

// Create jsondiffpatch instance
const diffpatcher = jsondiffpatch.create({
  objectHash: (obj: any, index?: number) => obj?.id || obj?.name || `$$index:${index ?? 0}`,
  arrays: {
    detectMove: true,
    includeValueOnMove: false,
  },
});

/**
 * Create a revision storing a delta (not full data)
 * Stores the reverse delta: diff(newData, oldData) so we can reconstruct oldData from newData
 */
function createRevision(fileId: string, oldDataStr: string, newDataStr: string): void {
  const now = Date.now();
  
  // Parse JSON data
  let oldData: any;
  let newData: any;
  try {
    oldData = JSON.parse(oldDataStr);
    newData = JSON.parse(newDataStr);
  } catch {
    // If data isn't valid JSON, store the full old data as fallback
    console.warn(`[Files] Non-JSON data for ${fileId}, storing full revision`);
    storeFullRevision(fileId, oldDataStr, now);
    return;
  }
  
  // Compute reverse delta: applying this to newData gives oldData
  const delta = diffpatcher.diff(newData, oldData);
  
  // If no changes, skip creating revision
  if (!delta) {
    console.log(`[Files] No changes detected for ${fileId}, skipping revision`);
    return;
  }
  
  // Get the next revision number
  const lastRevision = db.prepare(
    'SELECT MAX(revision_number) as max_rev FROM file_revisions WHERE file_id = ?'
  ).get(fileId) as { max_rev: number | null };
  
  const nextRevision = (lastRevision?.max_rev ?? 0) + 1;
  const revisionId = `${fileId}_rev${nextRevision}`;
  
  // Store delta with a marker to distinguish from full data
  const revisionData = JSON.stringify({ __delta: true, delta });
  
  // Insert new revision
  db.prepare(`
    INSERT INTO file_revisions (id, file_id, revision_number, data, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(revisionId, fileId, nextRevision, revisionData, now);
  
  // Calculate storage savings
  const fullSize = oldDataStr.length;
  const deltaSize = revisionData.length;
  const savings = Math.round((1 - deltaSize / fullSize) * 100);
  console.log(`[Files] Created delta revision ${nextRevision} for ${fileId} (${savings}% smaller: ${deltaSize} vs ${fullSize} bytes)`);
  
  // Clean up old revisions (keep only MAX_REVISIONS)
  const oldRevisions = db.prepare(`
    SELECT id FROM file_revisions 
    WHERE file_id = ? 
    ORDER BY revision_number DESC 
    LIMIT -1 OFFSET ?
  `).all(fileId, MAX_REVISIONS) as { id: string }[];
  
  if (oldRevisions.length > 0) {
    const ids = oldRevisions.map(r => r.id);
    db.prepare(`DELETE FROM file_revisions WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  }
}

/**
 * Fallback: store full data for non-JSON content
 */
function storeFullRevision(fileId: string, data: string, now: number): void {
  const lastRevision = db.prepare(
    'SELECT MAX(revision_number) as max_rev FROM file_revisions WHERE file_id = ?'
  ).get(fileId) as { max_rev: number | null };
  
  const nextRevision = (lastRevision?.max_rev ?? 0) + 1;
  const revisionId = `${fileId}_rev${nextRevision}`;
  
  db.prepare(`
    INSERT INTO file_revisions (id, file_id, revision_number, data, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(revisionId, fileId, nextRevision, data, now);
  
  console.log(`[Files] Created full revision ${nextRevision} for ${fileId}`);
}

/**
 * Reconstruct a specific revision's data by applying deltas
 */
function reconstructRevision(fileId: string, targetRevision: number, currentData: string): string {
  // Get all revisions from target to latest
  const revisions = db.prepare(`
    SELECT revision_number, data FROM file_revisions 
    WHERE file_id = ? AND revision_number >= ?
    ORDER BY revision_number DESC
  `).all(fileId, targetRevision) as { revision_number: number; data: string }[];
  
  if (revisions.length === 0) {
    throw new Error(`Revision ${targetRevision} not found`);
  }
  
  // Start with current data
  let data: any;
  try {
    data = JSON.parse(currentData);
  } catch {
    throw new Error('Current file data is not valid JSON');
  }
  
  // Apply deltas in reverse order (highest revision first)
  for (const rev of revisions) {
    let revData: any;
    try {
      revData = JSON.parse(rev.data);
    } catch {
      throw new Error(`Revision ${rev.revision_number} data is corrupt`);
    }
    
    if (revData.__delta && revData.delta) {
      // Apply reverse delta
      data = diffpatcher.patch(data, revData.delta);
    } else {
      // Full data stored (legacy or fallback)
      data = revData;
    }
  }
  
  return JSON.stringify(data);
}

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
    const fileId = req.params.id as string;

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
    const fileId = req.params.id as string;
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ error: 'Data required' });
    }

    // Check file exists and belongs to user
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(fileId, userId) as any;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const newData = JSON.stringify(data);

    // Create revision storing delta between old and new
    createRevision(fileId, file.data, newData);

    const now = Date.now();

    // Update in database
    db.prepare(`
      UPDATE files SET data = ?, updated_at = ? WHERE id = ?
    `).run(newData, now, fileId);

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
    const fileId = req.params.id as string;

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

// =============================================================================
// REVISION ENDPOINTS
// =============================================================================

/**
 * GET /api/files/:id/revisions
 * List all revisions for a file
 */
router.get('/:id/revisions', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const fileId = req.params.id as string;

    // Check file exists and belongs to user
    const file = db.prepare('SELECT id, filename FROM files WHERE id = ? AND user_id = ?').get(fileId, userId) as any;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get all revisions
    const revisions = db.prepare(`
      SELECT id, revision_number, created_at 
      FROM file_revisions 
      WHERE file_id = ? 
      ORDER BY revision_number DESC
    `).all(fileId) as { id: string; revision_number: number; created_at: number }[];

    res.json({
      fileId,
      filename: file.filename,
      revisions: revisions.map(r => ({
        id: r.id,
        revisionNumber: r.revision_number,
        createdAt: r.created_at
      }))
    });
  } catch (error) {
    console.error('[Files] List revisions error:', error);
    res.status(500).json({ error: 'Failed to list revisions' });
  }
});

/**
 * GET /api/files/:id/revisions/:rev
 * Get a specific revision (reconstructed from deltas)
 */
router.get('/:id/revisions/:rev', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const fileId = req.params.id as string;
    const revisionNumber = parseInt(req.params.rev as string, 10);

    // Check file exists and belongs to user
    const file = db.prepare('SELECT id, filename, data FROM files WHERE id = ? AND user_id = ?').get(fileId, userId) as any;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check revision exists
    const revision = db.prepare(`
      SELECT id, revision_number, created_at 
      FROM file_revisions 
      WHERE file_id = ? AND revision_number = ?
    `).get(fileId, revisionNumber) as { id: string; revision_number: number; created_at: number } | undefined;

    if (!revision) {
      return res.status(404).json({ error: 'Revision not found' });
    }

    // Reconstruct the revision data by applying deltas
    const reconstructedData = reconstructRevision(fileId, revisionNumber, file.data);

    res.json({
      id: revision.id,
      fileId,
      filename: file.filename,
      revisionNumber: revision.revision_number,
      data: JSON.parse(reconstructedData),
      createdAt: revision.created_at
    });
  } catch (error) {
    console.error('[Files] Get revision error:', error);
    res.status(500).json({ error: 'Failed to get revision' });
  }
});

/**
 * POST /api/files/:id/revisions/:rev/restore
 * Restore a specific revision (creates new revision of current state, then replaces with old)
 */
router.post('/:id/revisions/:rev/restore', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const fileId = req.params.id as string;
    const revisionNumber = parseInt(req.params.rev as string, 10);

    // Check file exists and belongs to user
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(fileId, userId) as any;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check revision exists
    const revisionExists = db.prepare(`
      SELECT 1 FROM file_revisions 
      WHERE file_id = ? AND revision_number = ?
    `).get(fileId, revisionNumber);

    if (!revisionExists) {
      return res.status(404).json({ error: 'Revision not found' });
    }

    // Reconstruct the revision data
    const restoredData = reconstructRevision(fileId, revisionNumber, file.data);

    // Create revision of current state before restoring (stores delta)
    createRevision(fileId, file.data, restoredData);

    const now = Date.now();

    // Restore the old revision
    db.prepare(`
      UPDATE files SET data = ?, updated_at = ? WHERE id = ?
    `).run(restoredData, now, fileId);

    console.log(`[Files] Restored revision ${revisionNumber} for file ${fileId}`);

    res.json({
      success: true,
      fileId,
      filename: file.filename,
      restoredRevision: revisionNumber,
      updatedAt: now
    });
  } catch (error) {
    console.error('[Files] Restore revision error:', error);
    res.status(500).json({ error: 'Failed to restore revision' });
  }
});

export default router;
