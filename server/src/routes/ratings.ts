/**
 * Module ratings API — star ratings for Modland and HVSC items.
 *
 * PUT    /api/ratings       — Set rating (auth required)
 * DELETE /api/ratings       — Remove rating (auth required)
 * GET    /api/ratings/batch — Get ratings for multiple items (optional auth)
 */

import { Router, Response } from 'express';
import db from '../db/database';
import { authenticateToken, optionalAuth, type AuthRequest } from '../middleware/auth';

const router = Router();

// ---------------------------------------------------------------------------
// Prepared statements (lazy-initialized)
// ---------------------------------------------------------------------------

const upsertRating = db.prepare(`
  INSERT INTO module_ratings (user_id, source, item_key, rating, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id, source, item_key)
  DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at
`);

const deleteRating = db.prepare(`
  DELETE FROM module_ratings WHERE user_id = ? AND source = ? AND item_key = ?
`);

const getAggregated = db.prepare(`
  SELECT item_key,
         AVG(rating) as avg,
         COUNT(*) as count
  FROM module_ratings
  WHERE source = ? AND item_key IN (SELECT value FROM json_each(?))
  GROUP BY item_key
`);

const getUserRatings = db.prepare(`
  SELECT item_key, rating
  FROM module_ratings
  WHERE user_id = ? AND source = ? AND item_key IN (SELECT value FROM json_each(?))
`);

// ---------------------------------------------------------------------------
// PUT /api/ratings — Set or update a rating
// ---------------------------------------------------------------------------

router.put('/', authenticateToken as any, (req: AuthRequest, res: Response) => {
  const { source, itemKey, rating } = req.body;

  if (!source || !itemKey || rating == null) {
    return res.status(400).json({ error: 'source, itemKey, and rating are required' });
  }
  if (source !== 'modland' && source !== 'hvsc') {
    return res.status(400).json({ error: 'source must be "modland" or "hvsc"' });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating must be an integer 1-5' });
  }

  const now = Date.now();
  upsertRating.run(req.userId, source, itemKey, rating, now, now);

  // Return updated aggregate for this item
  const agg = db.prepare(`
    SELECT AVG(rating) as avg, COUNT(*) as count
    FROM module_ratings WHERE source = ? AND item_key = ?
  `).get(source, itemKey) as { avg: number; count: number } | undefined;

  res.json({
    ok: true,
    avg: agg ? Math.round(agg.avg * 100) / 100 : rating,
    count: agg?.count ?? 1,
    userRating: rating,
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/ratings — Remove a rating
// ---------------------------------------------------------------------------

router.delete('/', authenticateToken as any, (req: AuthRequest, res: Response) => {
  const { source, itemKey } = req.body;

  if (!source || !itemKey) {
    return res.status(400).json({ error: 'source and itemKey are required' });
  }
  if (source !== 'modland' && source !== 'hvsc') {
    return res.status(400).json({ error: 'source must be "modland" or "hvsc"' });
  }

  deleteRating.run(req.userId, source, itemKey);

  // Return updated aggregate
  const agg = db.prepare(`
    SELECT AVG(rating) as avg, COUNT(*) as count
    FROM module_ratings WHERE source = ? AND item_key = ?
  `).get(source, itemKey) as { avg: number; count: number } | undefined;

  res.json({
    ok: true,
    avg: agg ? Math.round(agg.avg * 100) / 100 : 0,
    count: agg?.count ?? 0,
    userRating: null,
  });
});

// ---------------------------------------------------------------------------
// GET /api/ratings/batch — Batch-fetch ratings for a list of items
// Query: ?source=modland&keys=path1,path2,...  (comma-separated, URL-encoded)
// Returns: { ratings: { [key]: { avg, count, userRating? } } }
// ---------------------------------------------------------------------------

router.get('/batch', optionalAuth as any, (req: AuthRequest, res: Response) => {
  const source = req.query.source as string;
  const keysRaw = req.query.keys as string;

  if (!source || !keysRaw) {
    return res.status(400).json({ error: 'source and keys query params are required' });
  }
  if (source !== 'modland' && source !== 'hvsc') {
    return res.status(400).json({ error: 'source must be "modland" or "hvsc"' });
  }

  const keys = keysRaw.split(',').filter(Boolean);
  if (keys.length === 0) {
    return res.json({ ratings: {} });
  }
  if (keys.length > 200) {
    return res.status(400).json({ error: 'Maximum 200 keys per batch request' });
  }

  const keysJson = JSON.stringify(keys);

  // Aggregate ratings
  const aggRows = getAggregated.all(source, keysJson) as {
    item_key: string; avg: number; count: number;
  }[];

  const ratings: Record<string, { avg: number; count: number; userRating?: number }> = {};
  for (const row of aggRows) {
    ratings[row.item_key] = {
      avg: Math.round(row.avg * 100) / 100,
      count: row.count,
    };
  }

  // Add user's own ratings if authenticated
  if (req.userId) {
    const userRows = getUserRatings.all(req.userId, source, keysJson) as {
      item_key: string; rating: number;
    }[];
    for (const row of userRows) {
      if (ratings[row.item_key]) {
        ratings[row.item_key].userRating = row.rating;
      } else {
        ratings[row.item_key] = { avg: row.rating, count: 1, userRating: row.rating };
      }
    }
  }

  res.json({ ratings });
});

export default router;
