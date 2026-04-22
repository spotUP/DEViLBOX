/**
 * useStemSeparation — Shared hook for Demucs WASM stem separation.
 *
 * Handles:
 *  - AudioBuffer → stereo Float32Array conversion (mono→stereo duplication)
 *  - Minimum duration gating (stems are poor on short samples)
 *  - Model download + separation progress tracking
 *  - Lazy conversion of StemData Float32Arrays to AudioBuffers
 *  - Memory cleanup (release raw Float32Arrays after conversion)
 *  - Module-level memory cache so stems survive component unmount/remount
 */

import { useState, useCallback, useRef } from 'react';
import type { DemucsModelType, StemResult, StemData } from '@/engine/demucs/types';
import { DemucsEngine } from '@/engine/demucs/DemucsEngine';

// Minimum sample duration (seconds) for useful stem separation
const MIN_DURATION_S = 2.0;

// ── Module-level cache ─────────────────────────────────────────────────────
// Survives component unmount/remount. Keyed by AudioBuffer fingerprint.
// Limited to 4 entries (most recent) to avoid unbounded memory growth.
const MAX_CACHE_ENTRIES = 4;

interface CachedStemEntry {
  stems: StemResult;
  stemNames: string[];
  sampleRate: number;
  buffers: Map<string, AudioBuffer>;
}

const _stemCache = new Map<string, CachedStemEntry>();

/** Quick fingerprint from AudioBuffer content (length + sampleRate + first 16 samples) */
function bufferFingerprint(buf: AudioBuffer): string {
  const ch0 = buf.getChannelData(0);
  const samples = [];
  // Sample 16 evenly-spaced points for collision resistance
  const step = Math.max(1, Math.floor(ch0.length / 16));
  for (let i = 0; i < 16 && i * step < ch0.length; i++) {
    samples.push(ch0[i * step].toFixed(6));
  }
  return `${buf.length}_${buf.sampleRate}_${buf.numberOfChannels}_${samples.join(',')}`;
}

function evictOldest(): void {
  if (_stemCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = _stemCache.keys().next().value;
    if (oldest !== undefined) _stemCache.delete(oldest);
  }
}

export interface StemSeparationState {
  /** Whether the engine is currently downloading the model or separating */
  isBusy: boolean;
  /** Progress 0-1 across model download + separation */
  progress: number;
  /** Human-readable progress message */
  progressMessage: string;
  /** Error message if separation failed */
  error: string | null;
  /** Stem names available after separation */
  stemNames: string[];
  /** Whether separation has completed and stems are available */
  hasStems: boolean;
}

export interface UseStemSeparationReturn extends StemSeparationState {
  /** Run stem separation on the given AudioBuffer */
  separate: (buffer: AudioBuffer, model?: DemucsModelType) => Promise<void>;
  /** Get a specific stem as an AudioBuffer (lazy conversion, cached) */
  getStemBuffer: (stemName: string) => AudioBuffer | null;
  /** Get all stem AudioBuffers as a Map */
  getAllStemBuffers: () => Map<string, AudioBuffer>;
  /** Whether the given AudioBuffer is suitable for stem separation */
  canSeparate: (buffer: AudioBuffer | null) => boolean;
  /** Try to restore stems from module-level cache (survives unmount) */
  restoreFromCache: (buffer: AudioBuffer | null) => boolean;
  /** Release all stem data and reset state */
  cleanup: () => void;
}

/** Convert StemData (stereo Float32Arrays) to a Web Audio AudioBuffer */
function stemDataToAudioBuffer(data: StemData, sampleRate: number): AudioBuffer {
  const length = data.left.length;
  const buf = new AudioBuffer({ numberOfChannels: 2, length, sampleRate });
  buf.copyToChannel(data.left as unknown as Float32Array<ArrayBuffer>, 0);
  buf.copyToChannel(data.right as unknown as Float32Array<ArrayBuffer>, 1);
  return buf;
}

export function useStemSeparation(): UseStemSeparationReturn {
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stemNames, setStemNames] = useState<string[]>([]);
  const [hasStems, setHasStems] = useState(false);

  // Raw stem results (released after conversion)
  const rawStemsRef = useRef<StemResult | null>(null);
  // Converted AudioBuffers (cached per stem name)
  const stemBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  // Sample rate from the source buffer
  const sampleRateRef = useRef(44100);
  // Fingerprint of the last separated buffer (for cache lookup)
  const fingerprintRef = useRef<string | null>(null);

  const canSeparate = useCallback((buffer: AudioBuffer | null): boolean => {
    if (!buffer) return false;
    return buffer.duration >= MIN_DURATION_S;
  }, []);

  /** Try to restore stems from module-level cache for the given buffer */
  const restoreFromCache = useCallback((buffer: AudioBuffer | null): boolean => {
    if (!buffer) return false;
    const fp = bufferFingerprint(buffer);
    const cached = _stemCache.get(fp);
    if (!cached) return false;

    rawStemsRef.current = cached.stems;
    stemBuffersRef.current = new Map(cached.buffers);
    sampleRateRef.current = cached.sampleRate;
    fingerprintRef.current = fp;
    setStemNames(cached.stemNames);
    setHasStems(true);
    setProgress(1);
    setProgressMessage('Restored from cache');
    setError(null);
    return true;
  }, []);

  const cleanup = useCallback(() => {
    // Remove from module cache too
    if (fingerprintRef.current) {
      _stemCache.delete(fingerprintRef.current);
      fingerprintRef.current = null;
    }
    rawStemsRef.current = null;
    stemBuffersRef.current = new Map();
    setStemNames([]);
    setHasStems(false);
    setProgress(0);
    setProgressMessage('');
    setError(null);
    setIsBusy(false);
  }, []);

  const separate = useCallback(async (buffer: AudioBuffer, model: DemucsModelType = '4s') => {
    if (isBusy) return;
    if (!canSeparate(buffer)) {
      setError(`Sample too short (${buffer.duration.toFixed(1)}s). Need at least ${MIN_DURATION_S}s for stem separation.`);
      return;
    }

    const fp = bufferFingerprint(buffer);

    // Check module-level cache first — instant restore
    if (restoreFromCache(buffer)) return;

    // Reset state
    setError(null);
    setIsBusy(true);
    setProgress(0);
    setProgressMessage('Preparing...');
    rawStemsRef.current = null;
    stemBuffersRef.current = new Map();
    setHasStems(false);
    setStemNames([]);

    try {
      const engine = DemucsEngine.getInstance();
      sampleRateRef.current = buffer.sampleRate;

      // Extract stereo PCM from AudioBuffer
      const left = buffer.getChannelData(0);
      // If mono, duplicate channel 0 for both L/R
      const right = buffer.numberOfChannels >= 2
        ? buffer.getChannelData(1)
        : left;

      // Ensure model is loaded (may download weights ~40MB first time)
      await engine.ensureModel(model, (p, msg) => {
        // Model download is 0-0.3 of total progress
        setProgress(p * 0.3);
        setProgressMessage(msg);
      });

      // Run separation
      const result = await engine.separate(left, right, buffer.sampleRate, (p, msg) => {
        // Separation is 0.3-1.0 of total progress
        setProgress(0.3 + p * 0.7);
        setProgressMessage(msg);
      });

      rawStemsRef.current = result;
      const names = Object.keys(result);
      setStemNames(names);
      setHasStems(true);
      setProgress(1);
      setProgressMessage('Separation complete');
      fingerprintRef.current = fp;

      // Store in module-level cache for persistence across unmount/remount
      evictOldest();
      _stemCache.set(fp, {
        stems: result,
        stemNames: names,
        sampleRate: buffer.sampleRate,
        buffers: new Map(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stem separation failed');
      setHasStems(false);
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, canSeparate, restoreFromCache]);

  const getStemBuffer = useCallback((stemName: string): AudioBuffer | null => {
    // Check cache first
    const cached = stemBuffersRef.current.get(stemName);
    if (cached) return cached;

    // Lazy conversion from raw stem data
    const raw = rawStemsRef.current;
    if (!raw || !raw[stemName]) return null;

    const buf = stemDataToAudioBuffer(raw[stemName], sampleRateRef.current);
    stemBuffersRef.current.set(stemName, buf);

    // Also store in module cache for persistence
    if (fingerprintRef.current) {
      const entry = _stemCache.get(fingerprintRef.current);
      if (entry) entry.buffers.set(stemName, buf);
    }

    return buf;
  }, []);

  const getAllStemBuffers = useCallback((): Map<string, AudioBuffer> => {
    const raw = rawStemsRef.current;
    if (!raw) return stemBuffersRef.current;

    for (const name of Object.keys(raw)) {
      if (!stemBuffersRef.current.has(name)) {
        stemBuffersRef.current.set(
          name,
          stemDataToAudioBuffer(raw[name], sampleRateRef.current),
        );
      }
    }
    return stemBuffersRef.current;
  }, []);

  return {
    isBusy,
    progress,
    progressMessage,
    error,
    stemNames,
    hasStems,
    separate,
    getStemBuffer,
    getAllStemBuffers,
    canSeparate,
    restoreFromCache,
    cleanup,
  };
}
