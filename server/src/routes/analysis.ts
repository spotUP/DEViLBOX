/**
 * Song Analysis Cache routes — lookup and store DJ analysis results.
 *
 * GET  /api/analysis/lookup/:hash  — Retrieve cached analysis by SHA-256
 * POST /api/analysis/cache         — Store analysis results
 * GET  /api/analysis/status        — Cache statistics
 *
 * When ANALYSIS_DB_MODE=remote, proxies requests to the live Hetzner server
 * so local dev uses the production analysis database.
 */

import { Router, Request, Response } from 'express';
import { lookupAnalysis, storeAnalysis, getAnalysisCacheStats } from '../services/analysisCache';

const router = Router();

const isRemoteMode = process.env.ANALYSIS_DB_MODE === 'remote';
const remoteUrl = process.env.ANALYSIS_DB_URL || 'https://devilbox.uprough.net/api';

// ── GET /api/analysis/lookup/:hash ──────────────────────────────────────────

router.get('/lookup/:hash', async (req: Request, res: Response) => {
  try {
    const hash = (req.params.hash || '').trim().toLowerCase();

    if (!hash || hash.length !== 64 || !/^[0-9a-f]{64}$/.test(hash)) {
      return res.status(400).json({ error: 'Invalid hash — must be 64 hex characters (SHA-256)' });
    }

    if (isRemoteMode) {
      const remoteRes = await fetch(`${remoteUrl}/analysis/lookup/${hash}`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await remoteRes.json();
      return res.status(remoteRes.status).json(data);
    }

    const result = lookupAnalysis(hash);
    if (!result) {
      return res.status(404).json({ found: false });
    }

    res.json({ found: true, analysis: result });
  } catch (err) {
    console.error('[AnalysisCache] Lookup error:', err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// ── POST /api/analysis/cache ────────────────────────────────────────────────

router.post('/cache', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data?.hash || typeof data.hash !== 'string' || data.hash.length !== 64) {
      return res.status(400).json({ error: 'Missing or invalid hash' });
    }
    if (typeof data.bpm !== 'number' || data.bpm <= 0) {
      return res.status(400).json({ error: 'Missing or invalid bpm' });
    }

    if (isRemoteMode) {
      const remoteRes = await fetch(`${remoteUrl}/analysis/cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(5000),
      });
      const result = await remoteRes.json();
      return res.status(remoteRes.status).json(result);
    }

    storeAnalysis({
      hash: data.hash.toLowerCase(),
      bpm: data.bpm,
      bpmConfidence: data.bpmConfidence ?? 0,
      timeSignature: data.timeSignature ?? 4,
      musicalKey: data.musicalKey ?? 'Unknown',
      keyConfidence: data.keyConfidence ?? 0,
      rmsDb: data.rmsDb ?? -100,
      peakDb: data.peakDb ?? -100,
      genrePrimary: data.genrePrimary ?? 'Unknown',
      genreSubgenre: data.genreSubgenre ?? 'Unknown',
      genreConfidence: data.genreConfidence ?? 0,
      mood: data.mood ?? 'Unknown',
      energy: data.energy ?? 0.5,
      danceability: data.danceability ?? 0.5,
      duration: data.duration ?? 0,
      beats: data.beats ?? [],
      downbeats: data.downbeats ?? [],
      waveformPeaks: data.waveformPeaks ?? [],
      frequencyPeaks: data.frequencyPeaks ?? [],
      analysisVersion: data.analysisVersion ?? 1,
    });

    res.json({ stored: true });
  } catch (err) {
    console.error('[AnalysisCache] Store error:', err);
    res.status(500).json({ error: 'Store failed' });
  }
});

// ── GET /api/analysis/status ────────────────────────────────────────────────

router.get('/status', (_req: Request, res: Response) => {
  try {
    const stats = getAnalysisCacheStats();
    res.json(stats);
  } catch (err) {
    console.error('[AnalysisCache] Status error:', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

export default router;
