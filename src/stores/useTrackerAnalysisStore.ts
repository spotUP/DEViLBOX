/**
 * useTrackerAnalysisStore - Zustand store for tracker audio analysis
 *
 * Manages genre/mood/energy analysis state for the main tracker view.
 * Analysis happens in background during playback via audio capture.
 * Results are cached by file hash for instant display on reload.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GenreResult {
  primary: string;       // e.g., "Electronic", "Hip Hop"
  subgenre: string;      // e.g., "Techno", "Drum n Bass"
  confidence: number;    // 0-1
  mood: string;          // e.g., "Energetic", "Chill", "Dark"
  energy: number;        // 0-1
  danceability: number;  // 0-1
  // Additional fields merged from analysis for convenience
  bpm: number;
  bpmConfidence: number;
  musicalKey: string;
  keyConfidence: number;
}

export interface FullAnalysisResult {
  bpm: number;
  bpmConfidence: number;
  musicalKey: string;
  keyConfidence: number;
  genre: GenreResult;
  rmsDb: number;
  peakDb: number;
  analyzedAt: number;    // Timestamp
  frequencyPeaks?: number[][];  // [freq_hz, magnitude_db] pairs from Essentia
}

export type AnalysisState = 'idle' | 'capturing' | 'analyzing' | 'ready' | 'error';

interface TrackerAnalysisState {
  // Current analysis for loaded song
  currentAnalysis: FullAnalysisResult | null;
  currentFileHash: string | null;
  
  // State machine
  analysisState: AnalysisState;
  captureProgress: number;   // 0-100, how much audio captured
  analysisProgress: number;  // 0-100, worker progress
  error: string | null;
  
  // In-memory cache (persisted separately to IndexedDB)
  cache: Map<string, FullAnalysisResult>;
  
  // Actions
  startCapture: (fileHash: string) => void;
  setCaptureProgress: (progress: number) => void;
  startAnalysis: () => void;
  setAnalysisProgress: (progress: number) => void;
  setAnalysis: (result: FullAnalysisResult) => void;
  setError: (error: string) => void;
  clearAnalysis: () => void;
  getCached: (fileHash: string) => FullAnalysisResult | null;
  setCached: (fileHash: string, result: FullAnalysisResult) => void;
  loadCacheFromDB: (entries: Array<{ hash: string; result: FullAnalysisResult }>) => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useTrackerAnalysisStore = create<TrackerAnalysisState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    currentAnalysis: null,
    currentFileHash: null,
    analysisState: 'idle',
    captureProgress: 0,
    analysisProgress: 0,
    error: null,
    cache: new Map(),
    
    // Start capturing audio for a file
    startCapture: (fileHash: string) => {
      // Check cache first
      const cached = get().cache.get(fileHash);
      if (cached) {
        set({
          currentAnalysis: cached,
          currentFileHash: fileHash,
          analysisState: 'ready',
          captureProgress: 100,
          analysisProgress: 100,
          error: null,
        });
        return;
      }
      
      set({
        currentAnalysis: null,
        currentFileHash: fileHash,
        analysisState: 'capturing',
        captureProgress: 0,
        analysisProgress: 0,
        error: null,
      });
    },
    
    setCaptureProgress: (progress: number) => {
      set({ captureProgress: Math.min(100, Math.max(0, progress)) });
    },
    
    startAnalysis: () => {
      set({
        analysisState: 'analyzing',
        analysisProgress: 0,
      });
    },
    
    setAnalysisProgress: (progress: number) => {
      set({ analysisProgress: Math.min(100, Math.max(0, progress)) });
    },
    
    setAnalysis: (result: FullAnalysisResult) => {
      const fileHash = get().currentFileHash;
      if (fileHash) {
        // Add to cache
        get().cache.set(fileHash, result);
      }
      
      set({
        currentAnalysis: result,
        analysisState: 'ready',
        captureProgress: 100,
        analysisProgress: 100,
        error: null,
      });
    },
    
    setError: (error: string) => {
      set({
        analysisState: 'error',
        error,
      });
    },
    
    clearAnalysis: () => {
      set({
        currentAnalysis: null,
        currentFileHash: null,
        analysisState: 'idle',
        captureProgress: 0,
        analysisProgress: 0,
        error: null,
      });
    },
    
    getCached: (fileHash: string) => {
      return get().cache.get(fileHash) ?? null;
    },
    
    setCached: (fileHash: string, result: FullAnalysisResult) => {
      get().cache.set(fileHash, result);
    },
    
    loadCacheFromDB: (entries) => {
      const cache = new Map<string, FullAnalysisResult>();
      for (const { hash, result } of entries) {
        cache.set(hash, result);
      }
      set({ cache });
    },
  })),
);

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectGenre = (state: TrackerAnalysisState) => state.currentAnalysis?.genre ?? null;
export const selectAnalysisState = (state: TrackerAnalysisState) => state.analysisState;
export const selectIsAnalyzing = (state: TrackerAnalysisState) => 
  state.analysisState === 'capturing' || state.analysisState === 'analyzing';
