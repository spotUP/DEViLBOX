/**
 * DJUADEPrerender - Pre-rendering utilities for tracker modules in DJ mode
 *
 * Now delegates to DJPipeline for background rendering + analysis.
 * Handles all tracker formats: Amiga (via UADE) and PC (via libopenmpt).
 * Provides backward-compatible API for existing callers.
 */

import type { DeckId } from './DeckEngine';
import type { DJEngine } from './DJEngine';
import { getCachedAudio, isCached } from './DJAudioCache';
import { getDJPipeline } from './DJPipeline';
import type { TaskPriority } from './DJPipeline';
import { useDJStore } from '@/stores/useDJStore';

/**
 * Load a tracker module to a DJ deck, using cached pre-rendered audio if available.
 * Falls back to standard tracker playback if not cached, with background pipeline
 * rendering + analysis triggered automatically.
 *
 * Works for ALL tracker formats — Amiga (MOD, MED, etc.) via UADE and
 * PC (XM, IT, S3M, etc.) via libopenmpt.
 *
 * @param engine - DJEngine instance
 * @param deckId - Target deck
 * @param fileBuffer - Module file data
 * @param filename - Original filename
 * @param renderIfMissing - Whether to pipeline render + analyze if not cached (default: false)
 * @param bpm - Optional BPM hint
 * @param trackName - Optional track name hint
 * @returns Promise resolving to { cached: boolean, duration: number }
 */
export async function loadUADEToDeck(
  engine: DJEngine,
  deckId: DeckId,
  fileBuffer: ArrayBuffer,
  filename: string,
  renderIfMissing = false,
  bpm?: number,
  trackName?: string,
): Promise<{ cached: boolean; duration: number }> {
  // Check cache first
  const cached = await getCachedAudio(fileBuffer);

  if (cached) {
    // Load from cache (audio file mode)
    console.log(`[DJPrerender] Loading cached audio for ${filename}`);
    const info = await engine.loadAudioToDeck(deckId, cached.audioData, filename, trackName || cached.filename, bpm || cached.bpm);

    // If cached but not yet analyzed, trigger analysis in background
    if (!cached.beatGrid) {
      void getDJPipeline().loadOrEnqueue(fileBuffer, filename, deckId, 'normal').catch((err) => {
        console.warn(`[DJPrerender] Background analysis failed for ${filename}:`, err);
      });
    }

    return { cached: true, duration: info.duration };
  }

  // Not cached
  if (renderIfMissing) {
    console.log(`[DJPrerender] ${filename} not cached, triggering background render + wait`);
    
    // Also load the tracker song into the replayer for visuals while rendering
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const file = new File([fileBuffer], filename);
    const song = await parseModuleToSong(file);
    await engine.loadToDeck(deckId, song, filename, bpm || 125);

    // Set loading state in UI (loadToDeck sets mode to audio and resets positions)
    useDJStore.getState().setDeckState(deckId, {
      analysisState: 'rendering',
      isPlaying: false,
    });

    try {
      // Use the high-priority pipeline to render and analyze
      const result = await getDJPipeline().loadOrEnqueue(fileBuffer, filename, deckId, 'high');
      
      // Load the resulting WAV directly into audio mode
      const info = await engine.loadAudioToDeck(deckId, result.wavData, filename, trackName || filename, result.analysis?.bpm || bpm || 125);
      
      return { cached: true, duration: info.duration };
    } catch (err) {
      console.error(`[DJPrerender] Failed to render ${filename}:`, err);
      throw err;
    }
  }

  // Not cached and not rendering — this shouldn't really happen in the current DJ UI
  console.warn(`[DJPrerender] ${filename} not cached and renderIfMissing=false`);
  return { cached: false, duration: 0 };
}

/**
 * Render a tracker module and cache it via the pipeline.
 * Now delegates to DJPipeline (background worker rendering + analysis).
 *
 * @param fileBuffer - Module file data
 * @param filename - Original filename
 * @param subsong - Optional subsong index (default: 0)
 */
export async function renderAndCacheUADE(
  fileBuffer: ArrayBuffer,
  filename: string,
  subsong = 0,
): Promise<void> {
  if (await isCached(fileBuffer)) {
    console.log(`[DJPrerender] ${filename} already cached, skipping render`);
    return;
  }

  const pipeline = getDJPipeline();
  const id = `render-${filename}-${Date.now()}`;

  await pipeline.enqueue({
    id,
    fileBuffer,
    filename,
    priority: 'normal',
    subsong,
  });
}

/**
 * Batch pre-render multiple tracker modules via the pipeline.
 * Each file is enqueued at 'low' priority so active deck loads take precedence.
 *
 * @param files - Array of { buffer: ArrayBuffer, filename: string }
 * @param onProgress - Optional progress callback (current, total)
 */
export async function batchRenderUADE(
  files: Array<{ buffer: ArrayBuffer; filename: string }>,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  console.log(`[DJPrerender] Batch rendering ${files.length} files via pipeline...`);

  const pipeline = getDJPipeline();
  const promises: Promise<void>[] = [];

  for (let i = 0; i < files.length; i++) {
    const { buffer, filename } = files[i];
    const id = `batch-${filename}-${Date.now()}-${i}`;

    const p = pipeline.enqueue({
      id,
      fileBuffer: buffer,
      filename,
      priority: 'low' as TaskPriority,
    }).then(() => {
      onProgress?.(i + 1, files.length);
    }).catch((err) => {
      console.error(`[DJPrerender] Failed to render ${filename}:`, err);
    });

    promises.push(p);
  }

  await Promise.allSettled(promises);
  console.log(`[DJPrerender] Batch render complete`);
}

/**
 * Check if a tracker module is cached (fast check without loading data).
 */
export async function isUADECached(fileBuffer: ArrayBuffer): Promise<boolean> {
  return isCached(fileBuffer);
}
