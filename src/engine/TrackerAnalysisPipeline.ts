/**
 * TrackerAnalysisPipeline - Standalone audio analysis for tracker view
 *
 * Wraps the existing dj-analysis.worker.ts to provide a simple API for
 * analyzing captured audio without the full DJ pipeline.
 */

import type { GenreResult } from '@/stores/useTrackerAnalysisStore';

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

// ── Worker Management ────────────────────────────────────────────────────────

let analysisWorker: Worker | null = null;
let pendingPromises = new Map<string, {
  resolve: (result: WorkerAnalysisResult) => void;
  reject: (error: Error) => void;
}>();
let isWorkerReady = false;
let readyPromise: Promise<void> | null = null;

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
      },
      [leftCopy.buffer, rightCopy.buffer]
    );
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
