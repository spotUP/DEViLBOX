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
 * Hann window function for a given index and window size.
 */
function hannWindow(i: number, size: number): number {
  return 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
}

/**
 * Compute normalized cross-correlation between two Float32Array segments.
 * Returns correlation in [-1, 1].
 */
function crossCorrelate(
  a: Float32Array,
  aOffset: number,
  b: Float32Array,
  bOffset: number,
  length: number
): number {
  let num = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    const ai = aOffset + i < a.length ? a[aOffset + i] : 0;
    const bi = bOffset + i < b.length ? b[bOffset + i] : 0;
    num += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA * normB);
  return denom > 0 ? num / denom : 0;
}

/**
 * Time-stretch to fit target duration (preserves pitch) using WSOLA.
 * Window size: 2048, hop input: 512, hop output: round(512 * ratio).
 * Searches ±64 samples for best correlation.
 */
export async function timeStretchToFit(
  source: AudioBuffer,
  targetDurationMs: number
): Promise<BeatSyncResult> {
  const originalDurationMs = (source.length / source.sampleRate) * 1000;
  const ratio = targetDurationMs / originalDurationMs;

  const WINDOW_SIZE = 2048;
  const HOP_IN = 512;
  const HOP_OUT = Math.round(HOP_IN * ratio);
  const SEARCH_RANGE = 64;

  const numChannels = source.numberOfChannels;
  const outputLength = Math.round(source.length * ratio);

  const outputBuffer = new AudioBuffer({
    numberOfChannels: numChannels,
    length: outputLength,
    sampleRate: source.sampleRate,
  });

  for (let ch = 0; ch < numChannels; ch++) {
    const input = source.getChannelData(ch);
    const output = new Float32Array(outputLength);
    const normAcc = new Float32Array(outputLength);

    // Pre-compute Hann window
    const window = new Float32Array(WINDOW_SIZE);
    for (let i = 0; i < WINDOW_SIZE; i++) {
      window[i] = hannWindow(i, WINDOW_SIZE);
    }

    let inputPos = 0;
    let outputPos = 0;

    while (outputPos + WINDOW_SIZE <= outputLength) {
      // Find best matching frame via cross-correlation search
      const searchStart = Math.max(0, inputPos - SEARCH_RANGE);
      const searchEnd = Math.min(input.length - WINDOW_SIZE, inputPos + SEARCH_RANGE);

      let bestOffset = inputPos;
      let bestCorr = -Infinity;

      // Only search if we have a valid range and have prior output to compare against
      if (outputPos > 0 && searchEnd >= searchStart) {
        for (let s = searchStart; s <= searchEnd; s++) {
          // Compare the candidate frame against the tail of current output (overlap region)
          const overlapLen = Math.min(HOP_OUT, outputPos, WINDOW_SIZE - HOP_OUT);
          if (overlapLen <= 0) {
            bestOffset = inputPos;
            break;
          }
          const corr = crossCorrelate(
            output,
            outputPos - overlapLen,
            input,
            s,
            overlapLen
          );
          if (corr > bestCorr) {
            bestCorr = corr;
            bestOffset = s;
          }
        }
      } else {
        bestOffset = Math.max(0, Math.min(inputPos, input.length - WINDOW_SIZE));
      }

      // Overlap-add windowed frame
      for (let i = 0; i < WINDOW_SIZE; i++) {
        const outIdx = outputPos + i;
        if (outIdx >= outputLength) break;
        const inIdx = bestOffset + i;
        const sample = inIdx < input.length ? input[inIdx] : 0;
        const w = window[i];
        output[outIdx] += sample * w;
        normAcc[outIdx] += w * w;
      }

      inputPos += HOP_IN;
      outputPos += HOP_OUT;
    }

    // Normalize to prevent clipping from overlap-add accumulation
    for (let i = 0; i < outputLength; i++) {
      if (normAcc[i] > 1e-4) {
        output[i] /= normAcc[i];
      }
    }

    outputBuffer.copyToChannel(output, ch);
  }

  return {
    buffer: outputBuffer,
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
