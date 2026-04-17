/**
 * Playlist routes — Cloud save + public/private sharing for DJ playlists.
 *
 * Logged-in users can save playlists to the server (private by default).
 * Users can toggle visibility to 'public' so other users can browse and import.
 */

import { Router, Response } from 'express';
import { randomBytes } from 'crypto';
import { authenticateToken, optionalAuth, type AuthRequest } from '../middleware/auth';
import db from '../db/database';

const router = Router();

// ── Save / Update playlist ──────────────────────────────────────────────

/** POST /api/playlists — Save or update a playlist to the cloud */
router.post('/', authenticateToken as any, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { playlistId, name, description, visibility, tracks, environment, totalDuration } = req.body;

    if (!playlistId || !name || !tracks) {
      return res.status(400).json({ error: 'playlistId, name, and tracks are required' });
    }

    const vis = visibility === 'public' ? 'public' : 'private';
    const now = Date.now();
    const trackCount = Array.isArray(tracks) ? tracks.length : 0;
    const dur = totalDuration || 0;
    const desc = description || '';

    // Store full payload: tracks + environment (crossfader, volumes, master FX, drumpads, Auto DJ)
    const payload = JSON.stringify({ tracks, environment: environment || null });

    // Upsert: check if this user already saved this playlist
    const existing = db.prepare(
      'SELECT id FROM shared_playlists WHERE user_id = ? AND playlist_id = ?'
    ).get(userId, playlistId) as { id: string } | undefined;

    let cloudId: string;

    if (existing) {
      db.prepare(`
        UPDATE shared_playlists
        SET name = ?, description = ?, visibility = ?, track_count = ?, total_duration = ?, data = ?, updated_at = ?
        WHERE id = ?
      `).run(name, desc, vis, trackCount, dur, payload, now, existing.id);
      cloudId = existing.id;
    } else {
      cloudId = randomBytes(16).toString('hex');
      db.prepare(`
        INSERT INTO shared_playlists (id, user_id, playlist_id, name, description, visibility, track_count, total_duration, data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(cloudId, userId, playlistId, name, desc, vis, trackCount, dur, payload, now, now);
    }

    // Get username for response
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;

    res.json({
      id: cloudId,
      playlistId,
      name,
      visibility: vis,
      authorName: user?.username || 'unknown',
      updatedAt: now,
    });
  } catch (err) {
    console.error('[Playlists] Save error:', err);
    res.status(500).json({ error: 'Failed to save playlist' });
  }
});

// ── List playlists ──────────────────────────────────────────────────────

/** GET /api/playlists — List public playlists (or own with ?mine=true) */
router.get('/', optionalAuth as any, (req: AuthRequest, res: Response) => {
  try {
    const mine = req.query.mine === 'true' && req.userId;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    let rows;
    if (mine) {
      rows = db.prepare(`
        SELECT sp.id, sp.playlist_id, sp.name, sp.description, sp.visibility, sp.track_count, sp.total_duration,
               sp.created_at, sp.updated_at, u.username as author_name, sp.user_id as author_id
        FROM shared_playlists sp JOIN users u ON sp.user_id = u.id
        WHERE sp.user_id = ?
        ORDER BY sp.updated_at DESC LIMIT ? OFFSET ?
      `).all(req.userId, limit, offset);
    } else {
      rows = db.prepare(`
        SELECT sp.id, sp.playlist_id, sp.name, sp.description, sp.visibility, sp.track_count, sp.total_duration,
               sp.created_at, sp.updated_at, u.username as author_name, sp.user_id as author_id
        FROM shared_playlists sp JOIN users u ON sp.user_id = u.id
        WHERE sp.visibility = 'public'
        ORDER BY sp.updated_at DESC LIMIT ? OFFSET ?
      `).all(limit, offset);
    }

    const countSql = mine
      ? db.prepare('SELECT COUNT(*) as count FROM shared_playlists WHERE user_id = ?').get(req.userId) as { count: number }
      : db.prepare("SELECT COUNT(*) as count FROM shared_playlists WHERE visibility = 'public'").get() as { count: number };

    const playlists = (rows as any[]).map(r => ({
      id: r.id,
      playlistId: r.playlist_id,
      name: r.name,
      description: r.description,
      visibility: r.visibility,
      trackCount: r.track_count,
      totalDuration: r.total_duration,
      authorName: r.author_name,
      authorId: r.author_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    res.json({ playlists, total: countSql.count });
  } catch (err) {
    console.error('[Playlists] List error:', err);
    res.status(500).json({ error: 'Failed to list playlists' });
  }
});

// ── Get single playlist (with full track data) ─────────────────────────

/** GET /api/playlists/:id — Get a playlist's full data */
router.get('/:id', optionalAuth as any, (req: AuthRequest, res: Response) => {
  try {
    const cloudId = req.params.id;
    const row = db.prepare(`
      SELECT sp.*, u.username as author_name
      FROM shared_playlists sp JOIN users u ON sp.user_id = u.id
      WHERE sp.id = ?
    `).get(cloudId) as any;

    if (!row) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Only allow access if public or owned by the requesting user
    if (row.visibility !== 'public' && row.user_id !== req.userId) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Parse stored data — may be { tracks, environment } (new) or raw tracks array (legacy)
    const parsed = JSON.parse(row.data);
    const tracks = Array.isArray(parsed) ? parsed : (parsed.tracks || []);
    const environment = Array.isArray(parsed) ? null : (parsed.environment || null);

    res.json({
      id: row.id,
      playlistId: row.playlist_id,
      name: row.name,
      description: row.description,
      visibility: row.visibility,
      trackCount: row.track_count,
      totalDuration: row.total_duration,
      tracks,
      environment,
      authorName: row.author_name,
      authorId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('[Playlists] Get error:', err);
    res.status(500).json({ error: 'Failed to get playlist' });
  }
});

// ── Update visibility ──────────────────────────────────────────────────

/** PUT /api/playlists/:id/visibility — Toggle public/private */
router.put('/:id/visibility', authenticateToken as any, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const cloudId = req.params.id;
    const { visibility } = req.body;

    if (visibility !== 'public' && visibility !== 'private') {
      return res.status(400).json({ error: 'visibility must be "public" or "private"' });
    }

    const row = db.prepare('SELECT id FROM shared_playlists WHERE id = ? AND user_id = ?').get(cloudId, userId);
    if (!row) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    db.prepare('UPDATE shared_playlists SET visibility = ?, updated_at = ? WHERE id = ?')
      .run(visibility, Date.now(), cloudId);

    res.json({ success: true, visibility });
  } catch (err) {
    console.error('[Playlists] Visibility update error:', err);
    res.status(500).json({ error: 'Failed to update visibility' });
  }
});

// ── Delete ──────────────────────────────────────────────────────────────

/** DELETE /api/playlists/:id — Remove from cloud */
router.delete('/:id', authenticateToken as any, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const cloudId = req.params.id;

    const row = db.prepare('SELECT id FROM shared_playlists WHERE id = ? AND user_id = ?').get(cloudId, userId);
    if (!row) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    db.prepare('DELETE FROM shared_playlists WHERE id = ?').run(cloudId);
    res.json({ success: true });
  } catch (err) {
    console.error('[Playlists] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

export default router;
