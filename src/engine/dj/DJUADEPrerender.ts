/**
 * DJUADEPrerender - Pre-rendering utilities for UADE modules in DJ mode
 *
 * Provides functions to check cache, render UADE modules to audio buffers,
 * and load them efficiently into DJ decks.
 */

import type { DeckId } from './DeckEngine';
import type { DJEngine } from './DJEngine';
import { getCachedAudio, cacheAudio, isCached } from './DJAudioCache';
import { UADEEngine } from '@/engine/uade/UADEEngine';

/**
 * Load a UADE module to a DJ deck, using cached pre-rendered audio if available.
 * Falls back to standard tracker playback if not cached.
 *
 * @param engine - DJEngine instance
 * @param deckId - Target deck
 * @param fileBuffer - UADE module file data
 * @param filename - Original filename
 * @param renderIfMissing - Whether to pre-render and cache if not cached (default: false)
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
    console.log(`[DJUADEPrerender] Loading cached audio for ${filename}`);
    const info = await engine.loadAudioToDeck(deckId, cached.audioData, filename);
    return { cached: true, duration: info.duration };
  }

  // Not cached — fall back to tracker mode
  console.log(`[DJUADEPrerender] ${filename} not cached, loading as tracker song`);

  // Parse the module to TrackerSong
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  const file = new File([fileBuffer], filename);
  const song = await parseModuleToSong(file);

  // Load to deck
  await engine.loadToDeck(deckId, song);

  // Render and cache in background if requested
  if (renderIfMissing) {
    void renderAndCacheUADE(fileBuffer, filename).catch((err) => {
      console.warn(`[DJUADEPrerender] Background render failed for ${filename}:`, err);
    });
  }

  return { cached: false, duration: 0 };
}

/**
 * Render a UADE module to audio and cache it.
 * Can be called in background to pre-populate cache.
 *
 * @param fileBuffer - UADE module file data
 * @param filename - Original filename
 * @param subsong - Optional subsong index (default: 0)
 * @returns Promise resolving when render complete
 */
export async function renderAndCacheUADE(
  fileBuffer: ArrayBuffer,
  filename: string,
  subsong = 0,
): Promise<void> {
  console.log(`[DJUADEPrerender] Rendering ${filename}...`);

  // Check if already cached
  if (await isCached(fileBuffer)) {
    console.log(`[DJUADEPrerender] ${filename} already cached, skipping render`);
    return;
  }

  // Load module into UADE engine
  const engine = UADEEngine.getInstance();
  await engine.ready();
  await engine.load(fileBuffer, filename);

  // Render full song
  const startTime = performance.now();
  const audioBuffer = await engine.renderFull(subsong);
  const renderTime = Math.round(performance.now() - startTime);

  // Decode the WAV to get metadata
  const audioContext = new AudioContext();
  const decodedBuffer = await audioContext.decodeAudioData(audioBuffer.slice(0));
  void audioContext.close();

  // Compute waveform peaks for overview
  const waveformPeaks = computeWaveformPeaks(decodedBuffer, 800);

  // Cache it
  await cacheAudio(
    fileBuffer,
    filename,
    audioBuffer,
    decodedBuffer.duration,
    waveformPeaks,
    decodedBuffer.sampleRate,
    decodedBuffer.numberOfChannels,
  );

  console.log(
    `[DJUADEPrerender] Rendered ${filename} in ${renderTime}ms ` +
    `(${Math.round(decodedBuffer.duration)}s audio, ` +
    `${Math.round(audioBuffer.byteLength / 1024)}KB)`
  );
}

/**
 * Batch pre-render multiple UADE modules.
 * Processes files sequentially to avoid overwhelming the system.
 *
 * @param files - Array of { buffer: ArrayBuffer, filename: string }
 * @param onProgress - Optional progress callback (current, total)
 * @returns Promise resolving when all renders complete
 */
export async function batchRenderUADE(
  files: Array<{ buffer: ArrayBuffer; filename: string }>,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  console.log(`[DJUADEPrerender] Batch rendering ${files.length} files...`);

  for (let i = 0; i < files.length; i++) {
    const { buffer, filename } = files[i];

    try {
      await renderAndCacheUADE(buffer, filename);
      onProgress?.(i + 1, files.length);
    } catch (err) {
      console.error(`[DJUADEPrerender] Failed to render ${filename}:`, err);
      // Continue with next file
    }
  }

  console.log(`[DJUADEPrerender] Batch render complete`);
}

/**
 * Check if a UADE module is cached (fast check without loading data).
 */
export async function isUADECached(fileBuffer: ArrayBuffer): Promise<boolean> {
  return isCached(fileBuffer);
}

/**
 * Compute downsampled waveform peaks for overview display.
 */
function computeWaveformPeaks(audioBuffer: AudioBuffer, numBins: number): Float32Array {
  const peaks = new Float32Array(numBins);
  const samplesPerBin = Math.floor(audioBuffer.length / numBins);

  // Use first channel (or mix down if stereo)
  const channel0 = audioBuffer.getChannelData(0);
  const channel1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;

  for (let bin = 0; bin < numBins; bin++) {
    const start = bin * samplesPerBin;
    const end = Math.min(start + samplesPerBin, audioBuffer.length);
    let maxAmp = 0;

    for (let i = start; i < end; i++) {
      let sample = Math.abs(channel0[i]);
      if (channel1) {
        sample = (sample + Math.abs(channel1[i])) / 2;
      }
      if (sample > maxAmp) maxAmp = sample;
    }

    peaks[bin] = maxAmp;
  }

  return peaks;
}
