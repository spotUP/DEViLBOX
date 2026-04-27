/**
 * TrackerAnalysisPipeline - Standalone audio analysis for tracker view
 *
 * Wraps the existing dj-analysis.worker.ts to provide a simple API for
 * analyzing captured audio without the full DJ pipeline.
 */

import type { GenreResult } from '@/stores/useTrackerAnalysisStore';
import type { InstrumentHints } from '@/workers/dj-analysis.worker';

// Worker's AnalysisResult type (matches dj-analysis.worker.ts)
interface WorkerAnalysisResult {
  bpm: number;
  bpmConfidence: number;
  beats: number[];
  downbeats: number[];
  timeSignature: number;
  musicalKey: string;
  keyConfidence: number;
  onsets: number[];
  frequencyPeaks: number[][];
  rmsDb: number;
  peakDb: number;
  genre: {
    primary: string;
    subgenre: string;
    confidence: number;
    mood: string;
    energy: number;
    danceability: number;
  };
}

// ── Worker Management ─────────────────────────────────────────────────────────

let analysisWorker: Worker | null = null;
let pendingPromises = new Map<string, {
  resolve: (result: WorkerAnalysisResult) => void;
  reject: (error: Error) => void;
}>();
let isWorkerReady = false;
let readyPromise: Promise<void> | null = null;

// ── MusiCNN Genre Worker ──────────────────────────────────────────────────────

interface GenreWorkerResult {
  tags: Array<{ tag: string; score: number }>;
  primary: string;
  subgenre: string;
  mood: string;
  confidence?: number;
}

let genreWorker: Worker | null = null;
let genrePending = new Map<string, {
  resolve: (r: GenreWorkerResult | null) => void;
}>();

function getGenreWorker(): Worker {
  if (genreWorker) return genreWorker;
  genreWorker = new Worker(
    new URL('@/workers/genre-classifier.worker.ts', import.meta.url),
    { type: 'module' }
  );
  genreWorker.addEventListener('message', (e: MessageEvent) => {
    const { type, id, error } = e.data;
    if (type === 'ready') return;
    const p = genrePending.get(id);
    if (!p) return;
    genrePending.delete(id);
    if (type === 'result') {
      p.resolve(e.data as GenreWorkerResult);
    } else {
      console.warn('[GenreClassifier] error:', error);
      p.resolve(null);
    }
  });
  genreWorker.addEventListener('error', (err) => {
    console.warn('[GenreClassifier] Worker error:', err.message);
    for (const p of genrePending.values()) p.resolve(null);
    genrePending.clear();
  });
  genreWorker.postMessage({ type: 'init' });
  return genreWorker;
}

/** Run MusiCNN genre classification on captured audio. Non-throwing — returns null on failure. */
async function runMusiCNN(
  pcmLeft: Float32Array,
  pcmRight: Float32Array | null,
  sampleRate: number,
): Promise<GenreWorkerResult | null> {
  try {
    const worker = getGenreWorker();
    // Mono mix (average channels)
    const mono = new Float32Array(pcmLeft.length);
    if (pcmRight && pcmRight.length === pcmLeft.length) {
      for (let i = 0; i < mono.length; i++) mono[i] = (pcmLeft[i] + pcmRight[i]) * 0.5;
    } else {
      mono.set(pcmLeft);
    }
    const id = `genre-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise<GenreWorkerResult | null>((resolve) => {
      genrePending.set(id, { resolve });
      const timeout = setTimeout(() => {
        genrePending.delete(id);
        resolve(null);
      }, 120_000);
      const origResolve = resolve;
      genrePending.get(id)!.resolve = (r) => { clearTimeout(timeout); origResolve(r); };
      worker.postMessage({ type: 'classify', id, pcm: mono, sampleRate }, [mono.buffer]);
    });
  } catch (err) {
    console.warn('[GenreClassifier] Failed to start:', err);
    return null;
  }
}

/**
 * Initialize the analysis worker.
 */
async function ensureWorkerReady(): Promise<void> {
  if (isWorkerReady && analysisWorker) return;
  
  if (readyPromise) return readyPromise;
  
  readyPromise = new Promise<void>((resolve, reject) => {
    try {
      // Reuse the DJ analysis worker
      analysisWorker = new Worker(
        new URL('@/workers/dj-analysis.worker.ts', import.meta.url),
        { type: 'module' }
      );
      
      const timeout = setTimeout(() => {
        reject(new Error('Analysis worker initialization timeout'));
      }, 30000);
      
      analysisWorker.onmessage = (e) => {
        const { type, id, result, error } = e.data;
        
        if (type === 'ready') {
          isWorkerReady = true;
          clearTimeout(timeout);
          console.log('[TrackerAnalysis] Worker ready');
          resolve();
          return;
        }
        
        const pending = pendingPromises.get(id);
        if (!pending) {
          console.log('[TrackerAnalysis] No pending promise for id:', id);
          return;
        }
        
        if (type === 'analysisComplete') {
          console.log('[TrackerAnalysis] Analysis complete, result:', result);
          pending.resolve(result as WorkerAnalysisResult);
          pendingPromises.delete(id);
        } else if (type === 'analysisError') {
          console.error('[TrackerAnalysis] Worker reported error:', error);
          pending.reject(new Error(error));
          pendingPromises.delete(id);
        }
        // 'analysisProgress' events are ignored for now
      };
      
      analysisWorker.onerror = (err) => {
        console.error('[TrackerAnalysis] Worker error:', err);
        clearTimeout(timeout);
        reject(err);
      };
      
      // Send init command
      analysisWorker.postMessage({ type: 'init' });
    } catch (err) {
      reject(err);
    }
  });
  
  return readyPromise;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Build instrument presence hints from CED results + spectral analysis. */
function buildInstrumentHints(): InstrumentHints {
  const hints: InstrumentHints = {
    hasGuitar: false, hasBass: false, hasPercussion: false,
    hasPiano: false, hasStrings: false, hasBrass: false,
    hasWind: false, hasVoice: false, hasSynth: false, hasOrgan: false,
  };

  // Try CED results first (lazy import to avoid circular deps at module load)
  try {
    const { useInstrumentTypeStore } = require('@stores/useInstrumentTypeStore') as
      typeof import('@stores/useInstrumentTypeStore');
    const { analyzeSampleForClassification } = require('@/bridge/analysis/SampleSpectrum') as
      typeof import('@/bridge/analysis/SampleSpectrum');
    const { useInstrumentStore } = require('@stores/useInstrumentStore') as
      typeof import('@stores/useInstrumentStore');

    const cedResults = useInstrumentTypeStore.getState().results;
    const instruments = useInstrumentStore.getState().instruments;

    for (const inst of instruments) {
      // CED result (confidence-filtered — same 0.15 threshold as AutoDub)
      const ced = cedResults.get(inst.id);
      const type = ced && ced.confidence >= 0.15 && ced.instrumentType !== 'unknown'
        ? ced.instrumentType
        : null;

      if (type) {
        if (type === 'guitar') hints.hasGuitar = true;
        else if (type === 'bass') hints.hasBass = true;
        else if (['kick','snare','hihat','cymbal','drum','percussion'].includes(type)) hints.hasPercussion = true;
        else if (type === 'piano') hints.hasPiano = true;
        else if (type === 'strings') hints.hasStrings = true;
        else if (type === 'brass') hints.hasBrass = true;
        else if (type === 'wind') hints.hasWind = true;
        else if (type === 'voice') hints.hasVoice = true;
        else if (['synthesizer','pad','keyboard','sampler'].includes(type)) hints.hasSynth = true;
        else if (type === 'organ') hints.hasOrgan = true;
        continue;
      }

      // Spectral fallback for instruments CED didn't classify confidently
      const url = inst.sample?.url;
      if (typeof url === 'string' && url.startsWith('data:audio/wav;base64,')) {
        const spec = analyzeSampleForClassification(url);
        if (spec && spec.confidence >= 0.6) {
          if (spec.role === 'bass') hints.hasBass = true;
          else if (spec.role === 'percussion') hints.hasPercussion = true;
        }
      }
    }
  } catch { /* non-fatal — analysis continues without hints */ }

  return hints;
}

/**
 * Analyze captured audio and return genre/mood/BPM results.
 * 
 * @param pcmLeft - Left channel audio samples
 * @param pcmRight - Right channel audio samples
 * @param sampleRate - Sample rate (typically 44100)
 * @returns Analysis results including genre, BPM, key, etc.
 */
export async function analyzeAudio(
  pcmLeft: Float32Array,
  pcmRight: Float32Array,
  sampleRate: number,
): Promise<WorkerAnalysisResult> {
  await ensureWorkerReady();
  
  if (!analysisWorker) {
    throw new Error('Analysis worker not initialized');
  }
  
  const id = `tracker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  console.log(`[TrackerAnalysis] Starting analysis ${id}, ${pcmLeft.length} samples`);
  
  return new Promise<WorkerAnalysisResult>((resolve, reject) => {
    pendingPromises.set(id, { resolve, reject });
    
    // Set timeout for analysis
    const timeout = setTimeout(() => {
      console.error(`[TrackerAnalysis] Analysis timeout for ${id}`);
      pendingPromises.delete(id);
      reject(new Error('Analysis timeout'));
    }, 60000); // 60s timeout
    
    // Wrap resolve to clear timeout
    const originalResolve = resolve;
    pendingPromises.get(id)!.resolve = (result) => {
      clearTimeout(timeout);
      originalResolve(result);
    };
    
    // Build instrument hints from CED + spectral results in the main thread
    const instrumentHints = buildInstrumentHints();

    // Clone the arrays since we need them for analysis (transferables would make them unusable)
    const leftCopy = new Float32Array(pcmLeft);
    const rightCopy = new Float32Array(pcmRight);

    // Send to worker with transferables for efficiency
    analysisWorker!.postMessage(
      {
        type: 'analyze',
        id,
        pcmLeft: leftCopy,
        pcmRight: rightCopy,
        sampleRate,
        numBins: 400, // Fewer bins needed for tracker display
        instrumentHints,
      },
      [leftCopy.buffer, rightCopy.buffer]
    );
  }).then(async (essentiaResult) => {
    // Run MusiCNN genre classification in parallel with Essentia.
    // MusiCNN is authoritative for genre/mood — falls back to Essentia if it fails.
    const musicnn = await runMusiCNN(pcmLeft, pcmRight, sampleRate);
    if (musicnn && musicnn.primary !== 'Unknown') {
      essentiaResult.genre = {
        ...essentiaResult.genre,
        primary: musicnn.primary,
        subgenre: musicnn.subgenre,
        mood: musicnn.mood,
        confidence: musicnn.confidence ?? essentiaResult.genre?.confidence ?? 0.6,
      };
    }
    return essentiaResult;
  });
}

/**
 * Extract just the genre result from worker analysis.
 */
export function extractGenreResult(result: WorkerAnalysisResult): GenreResult {
  return {
    primary: result.genre?.primary ?? 'Unknown',
    subgenre: result.genre?.subgenre ?? '',
    confidence: result.genre?.confidence ?? 0,
    mood: result.genre?.mood ?? 'Unknown',
    energy: result.genre?.energy ?? 0.5,
    danceability: result.genre?.danceability ?? 0.5,
    bpm: result.bpm ?? 0,
    bpmConfidence: result.bpmConfidence ?? 0,
    musicalKey: result.musicalKey ?? '',
    keyConfidence: result.keyConfidence ?? 0,
  };
}

/**
 * Terminate the worker. Call when analysis is no longer needed.
 */
export function terminateWorker(): void {
  if (analysisWorker) {
    analysisWorker.terminate();
    analysisWorker = null;
    isWorkerReady = false;
    readyPromise = null;
    pendingPromises.clear();
    console.log('[TrackerAnalysis] Worker terminated');
  }
}
