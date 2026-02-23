/**
 * DJAnalysisWorker — Audio analysis via essentia.js WASM
 *
 * Runs BPM detection, beat tracking, key detection, and frequency-band
 * waveform computation in a dedicated Web Worker. Never blocks the audio thread.
 *
 * Protocol:
 *   Main → Worker:  { type: 'analyze', id, pcmLeft, pcmRight, sampleRate, numBins? }
 *   Worker → Main:  { type: 'analysisComplete', id, result: AnalysisResult }
 *                or { type: 'analysisError', id, error }
 *   Worker → Main:  { type: 'analysisProgress', id, progress }  (0-100)
 *   Main → Worker:  { type: 'init' }
 *   Worker → Main:  { type: 'ready' }
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface AnalyzeRequest {
  type: 'analyze';
  id: string;
  pcmLeft: Float32Array;
  pcmRight: Float32Array | null;  // null for mono
  sampleRate: number;
  numBins?: number;               // Number of waveform bins (default: 800)
}

interface InitRequest {
  type: 'init';
}

type WorkerMessage = AnalyzeRequest | InitRequest;

interface AnalysisResult {
  bpm: number;
  bpmConfidence: number;        // 0-1 normalized
  beats: number[];              // Beat positions in seconds
  downbeats: number[];          // Downbeat (bar start) positions in seconds
  timeSignature: number;        // Beats per bar (usually 4)
  musicalKey: string;           // e.g. "C major", "A minor"
  keyConfidence: number;        // 0-1
  onsets: number[];             // Onset positions in seconds
  frequencyPeaks: number[][];   // [lowBand[], midBand[], highBand[]] waveform peaks
  rmsDb: number;                // RMS loudness in dB (for auto-gain)
  peakDb: number;               // Peak level in dB
}

// ── Essentia Engine State ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let essentiaInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let essentiaModule: any = null;
let essentiaReady = false;

async function initEssentia(): Promise<void> {
  if (essentiaReady) return;

  const baseUrl = self.location.origin;

  // Fetch and execute WASM glue
  const wasmGlueUrl = `${baseUrl}/essentia/essentia-wasm.web.js`;
  const coreUrl = `${baseUrl}/essentia/essentia.js-core.es.js`;

  // Load WASM module
  const wasmResponse = await fetch(wasmGlueUrl);
  let wasmGlueCode = await wasmResponse.text();

  // Transform ESM for worker scope
  wasmGlueCode = wasmGlueCode.replace(/import\.meta\.url/g, `"${wasmGlueUrl}"`);
  wasmGlueCode = wasmGlueCode.replace(/export\s+default\s+/g, 'var EssentiaWASM = ');
  wasmGlueCode = wasmGlueCode.replace(/export\s*\{[^}]*\}/g, '');

  // Fix environment detection and mock document for worker scope
  wasmGlueCode = wasmGlueCode.replace(/var ENVIRONMENT_IS_WEB=true;var ENVIRONMENT_IS_WORKER=false;/g, 'var ENVIRONMENT_IS_WEB=false;var ENVIRONMENT_IS_WORKER=true;');
  wasmGlueCode = 'var document = { currentScript: { src: "' + wasmGlueUrl + '" }, title: "" };\n' + wasmGlueCode;

  const wasmFactory = new Function(wasmGlueCode + '\n;return typeof EssentiaWASM !== "undefined" ? EssentiaWASM : Module;')();
  essentiaModule = await wasmFactory();

  // Load the core JS API
  const coreResponse = await fetch(coreUrl);
  let coreCode = await coreResponse.text();

  // Transform ESM for worker scope
  coreCode = coreCode.replace(/export\s+default\s+/g, 'var Essentia = ');
  coreCode = coreCode.replace(/export\s*\{[^}]*\}/g, '');
  coreCode = coreCode.replace(/import\s+.*?from\s+['"][^'"]+['"];?/g, '');

  const EssentiaClass = new Function(coreCode + '\n;return typeof Essentia !== "undefined" ? Essentia : null;')();

  if (!EssentiaClass) {
    throw new Error('Failed to load Essentia core class');
  }

  essentiaInstance = new EssentiaClass(essentiaModule);

  essentiaReady = true;
  console.log('[DJAnalysisWorker] Essentia initialized, version:', essentiaInstance.version || 'unknown');
}

// ── Analysis Functions ───────────────────────────────────────────────────────

function mixToMono(left: Float32Array, right: Float32Array | null): Float32Array {
  if (!right) return left;
  const mono = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    mono[i] = (left[i] + right[i]) * 0.5;
  }
  return mono;
}

function analyzeRhythm(
  mono: Float32Array,
  essentia: typeof essentiaInstance,
): { bpm: number; confidence: number; beats: number[] } {
  try {
    const signal = essentia.arrayToVector(mono);
    const result = essentia.RhythmExtractor2013(signal, 208, 'multifeature', 40);

    const bpm: number = result.bpm ?? 0;
    const confidence: number = Math.min(1, Math.max(0, (result.confidence ?? 0) / 5.32)); // Normalize 0-5.32 → 0-1

    // Extract beat ticks
    const ticks: number[] = [];
    if (result.ticks) {
      const ticksSize = result.ticks.size();
      for (let i = 0; i < ticksSize; i++) {
        ticks.push(result.ticks.get(i));
      }
    }

    // Clean up WASM vectors
    try { signal.delete(); } catch { /* ignore */ }
    try { result.ticks?.delete(); } catch { /* ignore */ }
    try { result.estimates?.delete(); } catch { /* ignore */ }
    try { result.bpmIntervals?.delete(); } catch { /* ignore */ }

    return { bpm, confidence, beats: ticks };
  } catch (err) {
    console.warn('[DJAnalysisWorker] RhythmExtractor2013 failed:', err);
    return { bpm: 0, confidence: 0, beats: [] };
  }
}

function analyzeKey(
  mono: Float32Array,
  sampleRate: number,
  essentia: typeof essentiaInstance,
): { key: string; confidence: number } {
  try {
    const signal = essentia.arrayToVector(mono);
    const result = essentia.KeyExtractor(
      signal,
      true,   // averageDetuningCorrection
      4096,   // frameSize
      4096,   // hopSize
      36,     // hpcpSize
      5000,   // maxFrequency
      60,     // maximumSpectralPeaks
      25,     // minFrequency
      0.2,    // pcpThreshold
      'bgate', // profileType (Bgate — good for electronic/dance music)
      sampleRate,
    );

    const key = `${result.key ?? 'Unknown'} ${result.scale ?? ''}`.trim();
    const confidence: number = result.strength ?? 0;

    try { signal.delete(); } catch { /* ignore */ }

    return { key, confidence };
  } catch (err) {
    console.warn('[DJAnalysisWorker] KeyExtractor failed:', err);
    return { key: 'Unknown', confidence: 0 };
  }
}

/**
 * Detect downbeats from beat positions by grouping into bars.
 * Uses accent pattern analysis — computes energy at each beat position
 * and looks for periodic accent patterns (typically every 4 beats).
 */
function detectDownbeats(
  beats: number[],
  mono: Float32Array,
  sampleRate: number,
): { downbeats: number[]; timeSignature: number } {
  if (beats.length < 4) {
    return { downbeats: beats.length > 0 ? [beats[0]] : [], timeSignature: 4 };
  }

  // Compute energy at each beat position (short window around beat)
  const windowSamples = Math.floor(sampleRate * 0.05); // 50ms window
  const energies: number[] = [];
  for (const beat of beats) {
    const center = Math.floor(beat * sampleRate);
    const start = Math.max(0, center - windowSamples);
    const end = Math.min(mono.length, center + windowSamples);
    let energy = 0;
    for (let i = start; i < end; i++) {
      energy += mono[i] * mono[i];
    }
    energies.push(energy);
  }

  // Try groupings of 3 and 4 beats, pick whichever produces
  // the strongest periodic accent
  let bestPeriod = 4;
  let bestScore = -Infinity;

  for (const period of [3, 4]) {
    let score = 0;
    const groupCount = Math.floor(beats.length / period);
    if (groupCount < 2) continue;

    for (let g = 0; g < groupCount; g++) {
      const idx = g * period;
      if (idx < energies.length) {
        // First beat of group should be louder than others
        const first = energies[idx];
        let otherAvg = 0;
        let otherCount = 0;
        for (let j = 1; j < period && idx + j < energies.length; j++) {
          otherAvg += energies[idx + j];
          otherCount++;
        }
        otherAvg = otherCount > 0 ? otherAvg / otherCount : 0;
        score += first - otherAvg;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPeriod = period;
    }
  }

  // Generate downbeats at every N-th beat
  const downbeats: number[] = [];
  for (let i = 0; i < beats.length; i += bestPeriod) {
    downbeats.push(beats[i]);
  }

  return { downbeats, timeSignature: bestPeriod };
}

/**
 * Compute RMS and peak loudness for auto-gain normalization.
 * Returns values in dB (negative, where 0 dB = digital full scale).
 */
function computeLoudness(mono: Float32Array): { rmsDb: number; peakDb: number } {
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < mono.length; i++) {
    const v = mono[i];
    sumSq += v * v;
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
  }
  const rms = Math.sqrt(sumSq / mono.length);
  const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -100;
  return { rmsDb, peakDb };
}

/**
 * Compute frequency-band waveform peaks (low/mid/high) for colored waveform display.
 * Optimized for speed: single pass with simple recursive filters.
 */
function computeFrequencyPeaks(
  left: Float32Array,
  right: Float32Array | null,
  sampleRate: number,
  numBins: number,
): number[][] {
  const totalSamples = left.length;
  const samplesPerBin = Math.floor(totalSamples / numBins);
  if (samplesPerBin < 1) return [[0], [0], [0]];

  const lowPeaks = new Float32Array(numBins);
  const midPeaks = new Float32Array(numBins);
  const highPeaks = new Float32Array(numBins);

  // Simple IIR filter coefficients (First-order)
  // Low: ~200Hz, Mid: ~2000Hz (at 44.1kHz)
  const lpFreq = 200;
  const hpFreq = 2000;
  
  // Alpha for lowpass: dt / (RC + dt)
  const dt = 1 / sampleRate;
  const alphaLP = (2 * Math.PI * dt * lpFreq) / (2 * Math.PI * dt * lpFreq + 1);
  const alphaHP = 1 / (2 * Math.PI * dt * hpFreq + 1);

  let lowState = 0;
  let highState = 0;

  for (let bin = 0; bin < numBins; bin++) {
    const start = bin * samplesPerBin;
    const end = Math.min(start + samplesPerBin, totalSamples);
    
    let maxLow = 0;
    let maxMid = 0;
    let maxHigh = 0;

    for (let i = start; i < end; i++) {
      let sample = left[i];
      if (right) sample = (sample + right[i]) * 0.5;
      
      const absSample = Math.abs(sample);

      // Low pass (simple RC)
      lowState = lowState + alphaLP * (absSample - lowState);
      const lowVal = lowState;

      // High pass (simple RC)
      const highVal = alphaHP * (highState + absSample - (i > 0 ? Math.abs(left[i-1]) : 0));
      highState = highVal;

      // Mid is what's left
      const midVal = Math.max(0, absSample - lowVal - Math.abs(highVal));

      if (lowVal > maxLow) maxLow = lowVal;
      if (midVal > maxMid) maxMid = midVal;
      const absHigh = Math.abs(highVal);
      if (absHigh > maxHigh) maxHigh = absHigh;
    }

    lowPeaks[bin] = maxLow;
    midPeaks[bin] = maxMid;
    highPeaks[bin] = maxHigh;
  }

  // Helper to normalize and convert to number[]
  const normalize = (arr: Float32Array): number[] => {
    let max = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
    if (max === 0) return Array.from(arr);
    const result = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) result[i] = arr[i] / max;
    return result;
  };

  return [normalize(lowPeaks), normalize(midPeaks), normalize(highPeaks)];
}

// ── Message Handling ─────────────────────────────────────────────────────────

function postProgress(id: string, progress: number): void {
  (self as unknown as Worker).postMessage({ type: 'analysisProgress', id, progress: Math.round(progress) });
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      try {
        await initEssentia();
        (self as unknown as Worker).postMessage({ type: 'ready' });
      } catch (err) {
        console.error('[DJAnalysisWorker] Init failed:', err);
        (self as unknown as Worker).postMessage({
          type: 'ready',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'analyze': {
      const { id, pcmLeft, pcmRight, sampleRate, numBins = 800 } = msg;
      try {
        await initEssentia();
        postProgress(id, 5);

        // Mix to mono for analysis
        const mono = mixToMono(pcmLeft, pcmRight);
        postProgress(id, 10);

        // 1. Rhythm analysis (BPM + beats)
        const rhythm = analyzeRhythm(mono, essentiaInstance);
        postProgress(id, 40);

        // 2. Key detection
        const keyResult = analyzeKey(mono, sampleRate, essentiaInstance);
        postProgress(id, 60);

        // 3. Downbeat detection
        const { downbeats, timeSignature } = detectDownbeats(
          rhythm.beats, mono, sampleRate,
        );
        postProgress(id, 70);

        // 4. Frequency-band waveform peaks
        const frequencyPeaks = computeFrequencyPeaks(pcmLeft, pcmRight, sampleRate, numBins);
        postProgress(id, 90);

        // 5. Loudness analysis (RMS + peak) for auto-gain
        const loudness = computeLoudness(mono);
        postProgress(id, 95);

        const result: AnalysisResult = {
          bpm: rhythm.bpm,
          bpmConfidence: rhythm.confidence,
          beats: rhythm.beats,
          downbeats,
          timeSignature,
          musicalKey: keyResult.key,
          keyConfidence: keyResult.confidence,
          onsets: rhythm.beats, // Use beat positions as onset markers
          frequencyPeaks,
          rmsDb: loudness.rmsDb,
          peakDb: loudness.peakDb,
        };

        postProgress(id, 100);
        (self as unknown as Worker).postMessage({ type: 'analysisComplete', id, result });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[DJAnalysisWorker] Analysis failed:`, errorMsg);
        (self as unknown as Worker).postMessage({ type: 'analysisError', id, error: errorMsg });
      }
      break;
    }
  }
};

// Signal ready
(self as unknown as Worker).postMessage({ type: 'ready' });
