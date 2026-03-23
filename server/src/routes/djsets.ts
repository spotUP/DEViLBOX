/**
 * DJ Set routes — CRUD for recorded DJ sets + blob upload/download.
 *
 * Sets store timestamped events (not audio) and regenerate live on playback.
 * Non-Modland module files and mic recordings are stored as blobs.
 */

import { Router, Request, Response } from 'express';
import { randomBytes, createHash } from 'crypto';
import multer from 'multer';
import db from '../db/database';
import { authenticateToken, optionalAuth, type AuthRequest } from '../middleware/auth';
import { transcodeToOpus } from '../utils/transcode';

const router = Router();

// Multer for blob uploads (100MB limit)
const upload = multer({ limits: { fileSize: 100 * 1024 * 1024 } });

// ── DJ Sets ─────────────────────────────────────────────────────────────

/** POST /api/djsets — Save a recorded set */
router.post('/', authenticateToken as any, (req: AuthRequest, res: Response) => {
  try {
    const { name, durationMs, trackList, events, micAudioId } = req.body;
    if (!name || !events) {
      return res.status(400).json({ error: 'name and events are required' });
    }

    const id = randomBytes(16).toString('hex');
    const now = Date.now();

    db.prepare(`
      INSERT INTO dj_sets (id, user_id, name, duration_ms, track_list, events, mic_audio_id, play_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id, req.userId, name,
      durationMs || 0,
      JSON.stringify(trackList || []),
      JSON.stringify(events),
      micAudioId || null,
      now, now,
    );

    // Get author name
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId) as { username: string } | undefined;

    res.json({
      id,
      name,
      authorId: req.userId,
      authorName: user?.username || 'unknown',
      createdAt: now,
      durationMs: durationMs || 0,
      trackList: trackList || [],
    });
  } catch (err) {
    console.error('[djsets] Save error:', err);
    res.status(500).json({ error: 'Failed to save set' });
  }
});

/** GET /api/djsets — List sets (all if no auth, own if authed with ?mine=true) */
router.get('/', optionalAuth as any, (req: AuthRequest, res: Response) => {
  try {
    const mine = req.query.mine === 'true' && req.userId;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    let rows;
    if (mine) {
      rows = db.prepare(`
        SELECT s.id, s.name, s.duration_ms, s.track_list, s.play_count, s.created_at, s.updated_at, s.mic_audio_id,
               u.username as author_name, s.user_id as author_id
        FROM dj_sets s JOIN users u ON s.user_id = u.id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC LIMIT ? OFFSET ?
      `).all(req.userId, limit, offset);
    } else {
      rows = db.prepare(`
        SELECT s.id, s.name, s.duration_ms, s.track_list, s.play_count, s.created_at, s.updated_at, s.mic_audio_id,
               u.username as author_name, s.user_id as author_id
        FROM dj_sets s JOIN users u ON s.user_id = u.id
        ORDER BY s.created_at DESC LIMIT ? OFFSET ?
      `).all(limit, offset);
    }

    let totalRow;
    if (mine) {
      totalRow = db.prepare('SELECT COUNT(*) as count FROM dj_sets WHERE user_id = ?').get(req.userId) as { count: number };
    } else {
      totalRow = db.prepare('SELECT COUNT(*) as count FROM dj_sets').get() as { count: number };
    }
    const total = totalRow.count;

    const sets = (rows as any[]).map(r => ({
      id: r.id,
      name: r.name,
      authorId: r.author_id,
      authorName: r.author_name,
      durationMs: r.duration_ms,
      trackList: JSON.parse(r.track_list || '[]'),
      playCount: r.play_count,
      createdAt: r.created_at,
      hasMic: !!r.mic_audio_id,
    }));

    res.json({ sets, total, offset, limit });
  } catch (err) {
    console.error('[djsets] List error:', err);
    res.status(500).json({ error: 'Failed to list sets' });
  }
});

/** GET /api/djsets/:id — Get full set (metadata + events) */
router.get('/:id', optionalAuth as any, (req: Request, res: Response) => {
  try {
    const row = db.prepare(`
      SELECT s.*, u.username as author_name
      FROM dj_sets s JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `).get(req.params.id) as any;

    if (!row) return res.status(404).json({ error: 'Set not found' });

    res.json({
      metadata: {
        id: row.id,
        name: row.name,
        authorId: row.user_id,
        authorName: row.author_name,
        createdAt: row.created_at,
        durationMs: row.duration_ms,
        trackList: JSON.parse(row.track_list || '[]'),
        playCount: row.play_count || 0,
        version: 1,
      },
      events: JSON.parse(row.events || '[]'),
      micAudioId: row.mic_audio_id,
    });
  } catch (err) {
    console.error('[djsets] Get error:', err);
    res.status(500).json({ error: 'Failed to get set' });
  }
});

/** DELETE /api/djsets/:id — Delete own set */
router.delete('/:id', authenticateToken as any, (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM dj_sets WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Set not found or not owned' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[djsets] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete set' });
  }
});

/** POST /api/djsets/:id/play — Increment play counter */
router.post('/:id/play', (req: Request, res: Response) => {
  try {
    db.prepare('UPDATE dj_sets SET play_count = play_count + 1 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update play count' });
  }
});

// ── Blobs (module files + mic recordings) ───────────────────────────────

/** POST /api/djsets/blobs — Upload a blob (multipart form-data) */
router.post('/blobs', authenticateToken as any, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // First check dedup on original data
    const originalSha256 = createHash('sha256').update(req.file.buffer).digest('hex');
    const existing = db.prepare('SELECT id FROM dj_blobs WHERE sha256 = ?').get(originalSha256) as { id: string } | undefined;
    if (existing) {
      return res.json({ id: existing.id, deduplicated: true });
    }

    let fileData: Buffer = req.file.buffer;
    let mimeType: string = req.file.mimetype || 'application/octet-stream';

    const isUncompressed = mimeType === 'audio/wav' || mimeType === 'audio/x-wav'
      || mimeType === 'audio/aiff' || mimeType === 'audio/x-aiff'
      || req.file.originalname?.match(/\.(wav|aiff|aif)$/i);

    if (isUncompressed) {
      const compressed = await transcodeToOpus(fileData);
      if (compressed) {
        fileData = compressed;
        mimeType = 'audio/webm;codecs=opus';
      }
    }

    // Recompute SHA256 on (possibly transcoded) data for correct dedup
    const sha256 = createHash('sha256').update(fileData).digest('hex');

    // Check dedup again on transcoded data
    const existingTranscoded = db.prepare('SELECT id FROM dj_blobs WHERE sha256 = ?').get(sha256) as { id: string } | undefined;
    if (existingTranscoded) {
      return res.json({ id: existingTranscoded.id, deduplicated: true });
    }

    const id = randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO dj_blobs (id, user_id, filename, mime_type, data, size_bytes, sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.userId,
      req.file.originalname || 'blob',
      mimeType,
      fileData, fileData.length, sha256, Date.now(),
    );

    res.json({ id, size: fileData.length });
  } catch (err) {
    console.error('[djsets] Blob upload error:', err);
    res.status(500).json({ error: 'Failed to upload blob' });
  }
});

/** GET /api/djsets/blobs/:id — Download a blob */
router.get('/blobs/:id', (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT filename, mime_type, data FROM dj_blobs WHERE id = ?').get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Blob not found' });

    res.setHeader('Content-Type', row.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${row.filename}"`);
    res.send(row.data);
  } catch (err) {
    console.error('[djsets] Blob download error:', err);
    res.status(500).json({ error: 'Failed to download blob' });
  }
});

export default router;
