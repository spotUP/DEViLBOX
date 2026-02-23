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
 * @returns Promise resolving to { cached: boolean, duration: number }
 */
export async function loadUADEToDeck(
  engine: DJEngine,
  deckId: DeckId,
  fileBuffer: ArrayBuffer,
  filename: string,
  renderIfMissing = false,
): Promise<{ cached: boolean; duration: number }> {
  // Check cache first
  const cached = await getCachedAudio(fileBuffer);

  if (cached) {
    // Load from cache (audio file mode)
    console.log(`[DJPrerender] Loading cached audio for ${filename}`);
    const info = await engine.loadAudioToDeck(deckId, cached.audioData, filename);

    // If cached but not yet analyzed, trigger analysis in background
    if (!cached.beatGrid) {
      void getDJPipeline().loadOrEnqueue(fileBuffer, filename, deckId, 'normal').catch((err) => {
        console.warn(`[DJPrerender] Background analysis failed for ${filename}:`, err);
      });
    }

    return { cached: true, duration: info.duration };
  }

  // Not cached — fall back to tracker mode for immediate playback
  console.log(`[DJPrerender] ${filename} not cached, loading as tracker song`);

  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  const file = new File([fileBuffer], filename);
  const song = await parseModuleToSong(file);
  await engine.loadToDeck(deckId, song);

  // Render + analyze in background via pipeline
  if (renderIfMissing) {
    void getDJPipeline().loadOrEnqueue(fileBuffer, filename, deckId, 'high').catch((err) => {
      console.warn(`[DJPrerender] Background pipeline failed for ${filename}:`, err);
    });
  }

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
