/**
 * useTrackerAnalysis - Orchestrates audio capture and analysis for tracker
 *
 * This hook:
 * 1. Watches transport state to detect playback start/stop
 * 2. Starts audio capture when playback begins
 * 3. Sends captured audio to analysis worker when ready
 * 4. Manages cache lookups and updates (IndexedDB + in-memory)
 * 5. Handles song changes (cancels pending analysis)
 */

import { useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '@/stores/useProjectStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTransportStore } from '@/stores/useTransportStore';
import {
  useTrackerAnalysisStore,
  type FullAnalysisResult,
} from '@/stores/useTrackerAnalysisStore';
import {
  startCapture,
  stopCapture,
  finishCaptureEarly,
  isCurrentlyCapturing,
  getCurrentFileHash,
  type CapturedAudio,
} from '@/engine/TrackerAudioCapture';
import {
  analyzeAudio,
  extractGenreResult,
} from '@/engine/TrackerAnalysisPipeline';
import {
  cacheAnalysis,
  getCachedAnalysis,
  loadAllCachedAnalyses,
} from '@/engine/TrackerAnalysisCache';

// ── Hash Helper ──────────────────────────────────────────────────────────────

/**
 * Compute a simple hash for content identification.
 * Uses FNV-1a for speed (not cryptographic).
 */
function computeContentHash(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = (hash * 16777619) >>> 0; // FNV prime, keep as 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTrackerAnalysis(): void {
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const songTitle = useProjectStore((s) => s.metadata.name);
  const editorMode = useFormatStore((s) => s.editorMode);
  
  // Get raw file data reactively from format store
  const rawFileData = useFormatStore((s) => 
    s.libopenmptFileData ??
    s.uadeEditableFileData ??
    s.hivelyFileData ??
    s.klysFileData ??
    s.musiclineFileData ??
    s.c64SidFileData ??
    s.jamCrackerFileData ??
    s.futurePlayerFileData ??
    s.preTrackerFileData ??
    s.maFileData ??
    s.hippelFileData ??
    s.sonixFileData ??
    s.pxtoneFileData ??
    s.organyaFileData ??
    s.sawteethFileData ??
    s.eupFileData ??
    s.ixsFileData ??
    s.psycleFileData ??
    s.sc68FileData ??
    s.zxtuneFileData ??
    s.pumaTrackerFileData ??
    s.artOfNoiseFileData ??
    s.qsfFileData ??
    s.bdFileData ??
    s.sd2FileData ??
    s.symphonieFileData ??
    s.v2mFileData ??
    null
  );
  
  // Get reactive state from store
  const analysisState = useTrackerAnalysisStore((s) => s.analysisState);
  const getCached = useTrackerAnalysisStore((s) => s.getCached);
  
  const analysisInProgress = useRef(false);
  const lastFileHash = useRef<string | null>(null);
  
  // Compute hash - use file data if available, otherwise use editor mode + song title as key
  // Return null if we don't have enough info to identify the song
  const fileHash = rawFileData 
    ? computeContentHash(rawFileData)
    : (songTitle && songTitle !== 'Untitled' ? `${editorMode}-${songTitle}` : null);
  
  // Handle capture completion
  const handleCaptureComplete = useCallback(async (audio: CapturedAudio) => {
    if (analysisInProgress.current) {
      console.log('[TrackerAnalysis] Analysis already in progress, skipping');
      return;
    }
    analysisInProgress.current = true;
    
    const currentHash = getCurrentFileHash();
    console.log(`[TrackerAnalysis] Capture complete for ${currentHash}, ${audio.left.length} samples, starting analysis...`);
    
    const store = useTrackerAnalysisStore.getState();
    try {
      store.startAnalysis();
      
      const result = await analyzeAudio(
        audio.left,
        audio.right,
        audio.sampleRate,
      );
      
      console.log('[TrackerAnalysis] Got result from worker:', result?.bpm, result?.genre?.primary);
      
      // Enrich with timestamp
      const fullResult: FullAnalysisResult = {
        bpm: result.bpm ?? 0,
        bpmConfidence: result.bpmConfidence ?? 0,
        musicalKey: result.musicalKey ?? '',
        keyConfidence: result.keyConfidence ?? 0,
        genre: extractGenreResult(result),
        rmsDb: result.rmsDb ?? -60,
        peakDb: result.peakDb ?? -60,
        analyzedAt: Date.now(),
      };
      
      // Only update if still the same file
      if (currentHash === store.currentFileHash) {
        store.setAnalysis(fullResult);
        
        // Persist to IndexedDB
        if (currentHash) {
          cacheAnalysis(currentHash, fullResult).catch(err => {
            console.warn('[TrackerAnalysis] Failed to persist to IndexedDB:', err);
          });
        }
        
        console.log(`[TrackerAnalysis] Analysis complete:`, fullResult.genre);
      }
    } catch (err) {
      console.error('[TrackerAnalysis] Analysis failed:', err);
      store.setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      analysisInProgress.current = false;
    }
  }, []);
  
  // Effect: Load IndexedDB cache on mount
  useEffect(() => {
    loadAllCachedAnalyses().then(entries => {
      if (entries.length > 0) {
        useTrackerAnalysisStore.getState().loadCacheFromDB(entries);
        console.log(`[TrackerAnalysis] Loaded ${entries.length} cached analyses from IndexedDB`);
      }
    }).catch(err => {
      console.warn('[TrackerAnalysis] Failed to load IndexedDB cache:', err);
    });
  }, []);
  
  // Effect: Handle song changes
  useEffect(() => {
    const store = useTrackerAnalysisStore.getState();
    
    if (!fileHash) {
      // No song loaded
      stopCapture();
      store.clearAnalysis();
      lastFileHash.current = null;
      return;
    }
    
    // Check if this is a new song
    if (fileHash !== lastFileHash.current) {
      console.log(`[TrackerAnalysis] New song: ${songTitle} (${fileHash})`);
      lastFileHash.current = fileHash;
      
      // Stop any existing capture
      stopCapture();
      analysisInProgress.current = false;
      
      // Check in-memory cache first (faster)
      const cached = getCached(fileHash);
      if (cached) {
        console.log(`[TrackerAnalysis] Using in-memory cached analysis for ${fileHash}`);
        store.startCapture(fileHash); // This will auto-use cache
        return;
      }
      
      // Check IndexedDB cache (async)
      getCachedAnalysis(fileHash).then(dbCached => {
        if (dbCached && fileHash === lastFileHash.current) {
          console.log(`[TrackerAnalysis] Using IndexedDB cached analysis for ${fileHash}`);
          store.setCached(fileHash, dbCached);
          store.startCapture(fileHash);
        }
      }).catch(err => {
        console.warn('[TrackerAnalysis] IndexedDB lookup failed:', err);
      });
      
      // Reset state for new capture
      store.clearAnalysis();
    }
  }, [fileHash, songTitle, editorMode, getCached]);
  
  // Effect: Start/stop capture based on playback
  useEffect(() => {
    if (!fileHash) {
      if ((window as any).ANALYSIS_DEBUG) console.log('[TrackerAnalysis] No fileHash, skipping capture');
      return;
    }
    
    if ((window as any).ANALYSIS_DEBUG) console.log(`[TrackerAnalysis] Playback effect: isPlaying=${isPlaying}, state=${analysisState}, capturing=${isCurrentlyCapturing()}`);
    
    if (isPlaying) {
      // Start capture if not already capturing/analyzed
      if (analysisState === 'idle' && !isCurrentlyCapturing()) {
        console.log(`[TrackerAnalysis] Starting capture for ${fileHash}`);

        // Seek to ~25% into the song so we capture the main body, not the intro.
        // Done async before capture starts; waits 300ms for BPM/speed commands to settle.
        void (async () => {
          try {
            const { useTrackerStore } = await import('@/stores/useTrackerStore');
            const { patternOrder, currentPositionIndex } = useTrackerStore.getState();
            const targetPos = Math.floor(patternOrder.length * 0.25);
            const alreadyPastIntro = currentPositionIndex / Math.max(1, patternOrder.length) > 0.1;
            if (patternOrder.length > 4 && targetPos > 0 && !alreadyPastIntro) {
              const { getTrackerReplayer } = await import('@/engine/TrackerReplayer');
              const replayer = getTrackerReplayer();
              if (replayer) {
                replayer.seekTo(targetPos, 0);
                // Poll until the engine reports it has reached targetPos, then
                // wait one more tick for BPM/speed commands to settle.
                // Timeout after 500ms to avoid hanging on stalled engines.
                const deadline = Date.now() + 500;
                while (replayer.getCurrentPosition() !== targetPos && Date.now() < deadline) {
                  await new Promise(r => setTimeout(r, 16));
                }
                // One extra tick for speed/BPM Fxx to propagate
                await new Promise(r => setTimeout(r, 32));
              }
            }
          } catch { /* non-fatal — proceed from current position */ }
          startCapture(fileHash, handleCaptureComplete);
        })();
      }
    } else {
      // Playback stopped - finish early if we have enough data
      if (isCurrentlyCapturing()) {
        const audio = finishCaptureEarly();
        if (audio) {
          console.log(`[TrackerAnalysis] Playback stopped, analyzing ${audio.left.length} samples...`);
          handleCaptureComplete(audio);
        } else {
          console.log('[TrackerAnalysis] Playback stopped but not enough audio captured');
        }
      }
    }
  }, [isPlaying, fileHash, analysisState, handleCaptureComplete]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, []);
}

// ── UI Selectors ─────────────────────────────────────────────────────────────

/**
 * Get current analysis display info for UI.
 */
export function useTrackerAnalysisDisplay() {
  const analysisState = useTrackerAnalysisStore((s) => s.analysisState);
  const captureProgress = useTrackerAnalysisStore((s) => s.captureProgress);
  const currentAnalysis = useTrackerAnalysisStore((s) => s.currentAnalysis);
  
  const isCapturing = analysisState === 'capturing';
  const isAnalyzing = analysisState === 'analyzing';
  const isReady = analysisState === 'ready' && currentAnalysis !== null;
  
  return {
    isCapturing,
    isAnalyzing,
    isReady,
    progress: isCapturing ? captureProgress : 100,
    genre: currentAnalysis?.genre ?? null,
    bpm: currentAnalysis?.bpm ?? null,
    musicalKey: currentAnalysis?.musicalKey ?? null,
  };
}
