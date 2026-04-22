/**
 * DJStemQueue — Priority queue for all Demucs stem separation work.
 *
 * Centralizes all stem separation requests (manual deck + background pre-sep).
 * Manual "✂ STEMS" requests have priority over background pre-separation.
 *
 * The Demucs engine is single-flight — only one separation runs at a time.
 * This queue serializes all work and handles:
 *   - Priority (manual > pre-sep)
 *   - Cache dedup (skip already-cached tracks)
 *   - Progress reporting per job
 *   - Cancellation (when track changes mid-separation)
 *   - Auto-loading stems to deck when pre-sep finishes
 */

import type { DeckId } from './DeckEngine';
import type { StemResult } from '@/engine/demucs/types';

// ── Job Types ─────────────────────────────────────────────────────────────

export type StemJobPriority = 'manual' | 'presep';

export interface StemJob {
  id: string;
  priority: StemJobPriority;
  /** File hash for cache keying */
  fileHash: string;
  /** Original filename for stale-result guard */
  fileName: string;
  /** Audio PCM data */
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  /** Target deck (for loading stems after completion) */
  deckId?: DeckId;
  /** Progress callback */
  onProgress?: (progress: number, message: string) => void;
  /** Resolve/reject for the caller */
  resolve: (result: StemResult | null) => void;
  reject: (error: Error) => void;
}

// ── Status tracking (runtime only, not persisted) ─────────────────────────

export type StemJobStatus = 'queued' | 'separating' | 'cached' | 'failed';

const _statusMap = new Map<string, StemJobStatus>();
const _statusListeners = new Set<() => void>();

export function getStemStatus(fileHash: string): StemJobStatus | undefined {
  return _statusMap.get(fileHash);
}

export function subscribeStemStatus(listener: () => void): () => void {
  _statusListeners.add(listener);
  return () => { _statusListeners.delete(listener); };
}

function setStatus(hash: string, status: StemJobStatus): void {
  _statusMap.set(hash, status);
  for (const l of _statusListeners) {
    try { l(); } catch { /* ignore */ }
  }
}

// ── Queue ─────────────────────────────────────────────────────────────────

const _queue: StemJob[] = [];
let _running = false;

/**
 * Enqueue a stem separation job. Returns a promise that resolves with the
 * stem result (or null if cancelled/cached-and-loaded).
 */
export function enqueueStemJob(
  job: Omit<StemJob, 'id' | 'resolve' | 'reject'>,
): Promise<StemResult | null> {
  return new Promise((resolve, reject) => {
    const fullJob: StemJob = {
      ...job,
      id: crypto.randomUUID(),
      resolve,
      reject,
    };

    if (job.priority === 'manual') {
      // Insert at front (after any other manual jobs)
      const firstPresepIdx = _queue.findIndex((j) => j.priority === 'presep');
      if (firstPresepIdx === -1) {
        _queue.push(fullJob);
      } else {
        _queue.splice(firstPresepIdx, 0, fullJob);
      }
    } else {
      _queue.push(fullJob);
    }

    setStatus(job.fileHash, 'queued');
    void processQueue();
  });
}

/**
 * Cancel all pre-separation jobs (e.g. when playlist changes or Auto DJ stops).
 */
export function cancelPresepJobs(): void {
  const removed: StemJob[] = [];
  for (let i = _queue.length - 1; i >= 0; i--) {
    if (_queue[i].priority === 'presep') {
      removed.push(..._queue.splice(i, 1));
    }
  }
  for (const job of removed) {
    _statusMap.delete(job.fileHash);
    job.resolve(null);
  }
  if (removed.length > 0) {
    for (const l of _statusListeners) {
      try { l(); } catch { /* ignore */ }
    }
  }
}

/**
 * How many jobs are pending (including the currently running one).
 */
export function stemQueueSize(): number {
  return _queue.length + (_running ? 1 : 0);
}

// ── Processing ────────────────────────────────────────────────────────────

async function processQueue(): Promise<void> {
  if (_running) return;
  if (_queue.length === 0) return;

  _running = true;
  const job = _queue.shift()!;

  try {
    setStatus(job.fileHash, 'separating');

    const { DemucsEngine } = await import('@/engine/demucs/DemucsEngine');
    const demucs = DemucsEngine.getInstance();

    // Check cache first (cheap metadata check)
    const isCached = await demucs.hasCachedStems(job.fileHash);
    if (isCached) {
      setStatus(job.fileHash, 'cached');
      // Load from cache for the caller
      const cached = await demucs.loadCachedStems(job.fileHash);
      job.resolve(cached);
      return;
    }

    // Ensure model
    await demucs.ensureModel('4s', (p, msg) => {
      job.onProgress?.(p * 0.1, msg);
    });

    // Run separation
    const result = await demucs.separate(
      job.left,
      job.right,
      job.sampleRate,
      (p, msg) => {
        job.onProgress?.(0.1 + p * 0.9, msg);
      },
    );

    // Cache result
    void demucs.cacheStemResult(job.fileHash, result, job.sampleRate).catch(() => {});
    setStatus(job.fileHash, 'cached');

    job.resolve(result);
  } catch (err) {
    setStatus(job.fileHash, 'failed');
    job.reject(err instanceof Error ? err : new Error(String(err)));
  } finally {
    _running = false;
    // Process next job
    void processQueue();
  }
}
