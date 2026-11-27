import { stretchKeepPitch } from './stretchKeepPitch';

export interface BeatSyncParams {
  bpm: number;
  speed: number;        // ticks per row
  targetRows: number;
  method: 'resample' | 'timestretch';
}

export interface BeatSyncResult {
  buffer: AudioBuffer;
  originalDurationMs: number;
  targetDurationMs: number;
  ratio: number;
}

/**
 * Calculate target duration for N rows at given BPM/speed.
 * Standard tracker timing: ms_per_tick = 2500 / bpm, ms_per_row = ms_per_tick * speed
 */
export function calculateTargetDurationMs(bpm: number, speed: number, rows: number): number {
  const msPerTick = 2500 / bpm;
  return msPerTick * speed * rows;
}

/**
 * Resample to fit target duration (changes pitch).
 * Uses OfflineAudioContext with BufferSource.playbackRate = 1/ratio.
 */
export async function resampleToFit(
  source: AudioBuffer,
  targetDurationMs: number
): Promise<BeatSyncResult> {
  const originalDurationMs = (source.length / source.sampleRate) * 1000;
  const ratio = targetDurationMs / originalDurationMs;
  const outputLength = Math.round(source.length * ratio);

  const offlineCtx = new OfflineAudioContext(
    source.numberOfChannels,
    outputLength,
    source.sampleRate
  );

  const bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = source;
  // playbackRate = 1/ratio stretches/compresses playback time (inverse of pitch shift)
  bufferSource.playbackRate.value = 1 / ratio;
  bufferSource.connect(offlineCtx.destination);
  bufferSource.start(0);

  const rendered = await offlineCtx.startRendering();

  return {
    buffer: rendered,
    originalDurationMs,
    targetDurationMs,
    ratio,
  };
}

/**
 * Time-stretch to fit target duration (preserves pitch) with the DJ Key Lock
 * stretcher (stretchKeepPitch), the app's one stretch path.
 */
export async function timeStretchToFit(
  source: AudioBuffer,
  targetDurationMs: number
): Promise<BeatSyncResult> {
  const originalDurationMs = (source.length / source.sampleRate) * 1000;
  const ratio = targetDurationMs / originalDurationMs;
  return {
    buffer: await stretchKeepPitch(source, ratio),
    originalDurationMs,
    targetDurationMs,
    ratio,
  };
}

/**
 * High-level preview function — routes to resampleToFit or timeStretchToFit.
 */
export async function previewBeatSync(
  source: AudioBuffer,
  params: BeatSyncParams
): Promise<BeatSyncResult> {
  const targetDurationMs = calculateTargetDurationMs(params.bpm, params.speed, params.targetRows);
  if (params.method === 'resample') {
    return resampleToFit(source, targetDurationMs);
  } else {
    return timeStretchToFit(source, targetDurationMs);
  }
}
