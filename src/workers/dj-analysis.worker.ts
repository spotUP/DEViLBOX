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

/** Instrument presence hints derived from CED neural + spectral analysis. */
export interface InstrumentHints {
  hasGuitar: boolean;
  hasBass: boolean;
  hasPercussion: boolean;
  hasPiano: boolean;
  hasStrings: boolean;
  hasBrass: boolean;
  hasWind: boolean;
  hasVoice: boolean;
  hasSynth: boolean;
  hasOrgan: boolean;
}

interface AnalyzeRequest {
  type: 'analyze';
  id: string;
  pcmLeft: Float32Array;
  pcmRight: Float32Array | null;  // null for mono
  sampleRate: number;
  numBins?: number;               // Number of waveform bins (default: 800)
  instrumentHints?: InstrumentHints;
}

interface InitRequest {
  type: 'init';
}

type WorkerMessage = AnalyzeRequest | InitRequest;

interface GenreResult {
  primary: string;              // Primary genre (e.g. "Electronic", "Rock")
  subgenre: string;             // Sub-genre (e.g. "Techno", "Drum n Bass")
  confidence: number;           // 0-1
  mood: string;                 // e.g. "Energetic", "Chill", "Dark"
  energy: number;               // 0-1 (low energy → high energy)
  danceability: number;         // 0-1
}

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
  genre: GenreResult;           // Genre classification
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

/**
 * Classify genre based on audio features.
 * Uses BPM, key, spectral characteristics, rhythm patterns, and energy.
 * 
 * Comprehensive heuristic classifier for tracker/electronic music genres.
 * Covers: Techno, House, Trance, D&B, Breakbeat, Chiptune, Synthwave, 
 * Industrial, Ambient, Hip-Hop, and many subgenres.
 */
function classifyGenre(
  bpm: number,
  key: string,
  timeSignature: number,
  frequencyPeaks: number[][],
  rmsDb: number,
  beats: number[],
  _mono: Float32Array,
  _sampleRate: number,
  hints?: InstrumentHints,
): GenreResult {
  // ── Spectral Feature Extraction ──────────────────────────────────────────
  const [lowBand, midBand, highBand] = frequencyPeaks;
  
  // Average energy per band (sub-bass/bass, mids, highs)
  const avgLow = lowBand.reduce((a, b) => a + b, 0) / lowBand.length;
  const avgMid = midBand.reduce((a, b) => a + b, 0) / midBand.length;
  const avgHigh = highBand.reduce((a, b) => a + b, 0) / highBand.length;
  const totalEnergy = avgLow + avgMid + avgHigh + 0.001;
  
  // Normalized ratios
  const bassRatio = avgLow / totalEnergy;      // Heavy bass = techno, dub, hip-hop
  const midRatio = avgMid / totalEnergy;       // Strong mids = acid, vocals, guitars
  const highRatio = avgHigh / totalEnergy;     // High = cymbals, hi-hats, brightness
  
  // Spectral balance indicators
  const isBassHeavy = bassRatio > 0.45;
  const isMidHeavy = midRatio > 0.4;
  const isBright = avgHigh > avgLow * 0.8;
  const isDark = avgLow > avgHigh * 2;
  
  // Spectral variance (how much energy varies - indicates complexity)
  const spectralVariance = Math.sqrt(
    Math.pow(bassRatio - 0.33, 2) + 
    Math.pow(midRatio - 0.33, 2) + 
    Math.pow(highRatio - 0.33, 2)
  );
  const isBalanced = spectralVariance < 0.15;
  
  // ── Rhythm Feature Extraction ────────────────────────────────────────────
  
  // Beat regularity (variance in beat intervals)
  let beatVariance = 0;
  if (beats.length > 2) {
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      intervals.push(beats[i] - beats[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    beatVariance = intervals.reduce((a, b) => a + Math.pow(b - avgInterval, 2), 0) / intervals.length;
  }
  const beatRegularity = Math.max(0, 1 - beatVariance * 10); // 0-1, higher = more regular
  
  // Rhythm pattern indicators
  const isFourOnFloor = beatRegularity > 0.65 && beats.length > 16;
  const isSyncopated = beatRegularity < 0.5 && beats.length > 8;
  const isBreakbeat = beatRegularity > 0.3 && beatRegularity < 0.65;
  
  // Beat density (beats per second - indicates complexity)
  const trackDuration = beats.length > 1 ? beats[beats.length - 1] - beats[0] : 1;
  const beatDensity = beats.length / Math.max(trackDuration, 1);
  const isDense = beatDensity > 3; // More than 3 beats/sec at detected tempo
  
  // ── Energy & Dynamics ────────────────────────────────────────────────────
  
  // Energy (normalized from dB)
  const energy = Math.min(1, Math.max(0, (rmsDb + 60) / 60)); // -60dB → 0, 0dB → 1
  const isHighEnergy = energy > 0.65;
  const isMidEnergy = energy > 0.4 && energy <= 0.65;
  const isLowEnergy = energy <= 0.4;
  
  // ── Key/Mode Analysis ────────────────────────────────────────────────────
  
  const isMinor = key.toLowerCase().includes('minor');
  const isMajor = key.toLowerCase().includes('major');
  
  // ── Half-time/Double-time Correction ─────────────────────────────────────
  // BPM detection can sometimes detect half or double the actual tempo
  
  let effectiveBpm = bpm;

  // Half-time correction: 55-74 BPM with regular four-on-floor beat is likely
  // detected at half the real tempo. Guards:
  //   !isLowEnergy — don't double genuinely slow/quiet ambient tracks
  //   !isBassHeavy — protect reggae/dub/hip-hop (heavy bass at this BPM = real slow tempo)
  if (bpm >= 55 && bpm < 75 && !isLowEnergy && isFourOnFloor && !isBassHeavy) {
    effectiveBpm = bpm * 2;
  }
  // 75-94 BPM: no automatic doubling — this range covers real hip-hop, reggae,
  // and slow house. The previous conditional branch was dead code (isFourOnFloor
  // already implies beatRegularity > 0.65) and caused false positives.

  // Double-time correction: 201-280 BPM with low energy + regular beat is likely
  // detected at double the real tempo. Require regular beats to avoid halving
  // genuine high-BPM breakcore.
  if (bpm > 200 && bpm <= 280 && !isHighEnergy && beatRegularity > 0.55) {
    effectiveBpm = bpm / 2;
  }
  
  // ── Danceability ─────────────────────────────────────────────────────────
  
  const bpmDanceScore = 
    (effectiveBpm >= 115 && effectiveBpm <= 135) ? 1.0 :  // House/techno sweet spot
    (effectiveBpm >= 100 && effectiveBpm <= 150) ? 0.85 :
    (effectiveBpm >= 85 && effectiveBpm <= 170) ? 0.7 :
    (effectiveBpm >= 70 && effectiveBpm <= 180) ? 0.5 : 0.3;
    
  const danceability = (bpmDanceScore * 0.4 + beatRegularity * 0.4 + energy * 0.2);
  
  // ── Mood Classification ──────────────────────────────────────────────────
  
  let mood: string;
  if (isMinor && isDark && isHighEnergy) {
    mood = 'Dark & Intense';
  } else if (isMinor && isDark && !isHighEnergy) {
    mood = 'Melancholic';
  } else if (isHighEnergy && isBright) {
    mood = 'Euphoric';
  } else if (isHighEnergy) {
    mood = 'Energetic';
  } else if (isLowEnergy && isDark) {
    mood = 'Atmospheric';
  } else if (isLowEnergy) {
    mood = 'Chill';
  } else if (isMajor && isBright) {
    mood = 'Uplifting';
  } else {
    mood = 'Driving';
  }
  
  // ── Instrument-aware non-electronic genre detection ──────────────────────
  // Short-circuit the BPM-based waterfall when CED/spectral confirms real instruments.
  if (hints?.hasGuitar) {
    const isAcoustic = !hints.hasSynth && !hints.hasOrgan && !isBassHeavy;
    const hasFull = hints.hasPercussion && hints.hasBass;

    if (isAcoustic && !hints.hasPercussion && effectiveBpm < 110) {
      return { primary: 'Folk / Acoustic', subgenre: 'Acoustic', confidence: 0.65, mood: isMinor ? 'Melancholic' : 'Chill', energy, danceability };
    }
    if (hints.hasBass && isMinor && effectiveBpm < 110 && !isFourOnFloor) {
      return { primary: 'Blues', subgenre: isHighEnergy ? 'Electric Blues' : 'Blues', confidence: 0.65, mood: 'Melancholic', energy, danceability };
    }
    if ((hints.hasBrass || hints.hasPiano) && isSyncopated) {
      return { primary: 'Jazz', subgenre: isHighEnergy ? 'Jazz Fusion' : 'Jazz', confidence: 0.65, mood: isHighEnergy ? 'Energetic' : 'Chill', energy, danceability };
    }
    if (hasFull && effectiveBpm >= 80 && effectiveBpm < 180) {
      const sub = effectiveBpm >= 150 ? 'Punk / Hardcore' : effectiveBpm >= 130 && isHighEnergy ? 'Hard Rock' : effectiveBpm >= 100 && isHighEnergy ? 'Rock' : effectiveBpm >= 100 ? 'Indie Rock' : isMinor && isDark ? 'Alternative Rock' : 'Rock';
      const m = isHighEnergy ? 'Energetic' : isMidEnergy ? 'Driving' : isMinor ? 'Melancholic' : 'Uplifting';
      return { primary: 'Rock', subgenre: sub, confidence: 0.7, mood: m, energy, danceability };
    }
    if (hints.hasSynth || hints.hasPiano) {
      return { primary: 'Pop / Rock', subgenre: 'Pop Rock', confidence: 0.6, mood: isHighEnergy ? 'Energetic' : 'Uplifting', energy, danceability };
    }
    return { primary: 'Folk / Acoustic', subgenre: 'Acoustic', confidence: 0.55, mood: isMinor ? 'Melancholic' : 'Chill', energy, danceability };
  }
  if ((hints?.hasPiano || hints?.hasStrings) && !hints?.hasSynth) {
    if (hints?.hasBrass || isSyncopated) {
      return { primary: 'Jazz', subgenre: 'Jazz', confidence: 0.6, mood: isHighEnergy ? 'Energetic' : 'Chill', energy, danceability };
    }
    if (effectiveBpm < 140 && !hints?.hasPercussion) {
      return { primary: 'Classical', subgenre: 'Contemporary Classical', confidence: 0.55, mood: isMinor ? 'Melancholic' : 'Uplifting', energy, danceability };
    }
  }
  if (hints?.hasVoice && !hints?.hasGuitar && !hints?.hasSynth) {
    const hasSoul = hints?.hasBass && hints?.hasPercussion;
    return { primary: hasSoul ? 'R&B / Soul' : 'Singer-Songwriter', subgenre: hasSoul ? (isHighEnergy ? 'Soul' : 'R&B') : 'Singer-Songwriter', confidence: 0.6, mood: isMinor ? 'Melancholic' : 'Uplifting', energy, danceability };
  }

  // Reggae / Dub — bass + percussion at slow-medium BPM, not synth-dominated.
  // Catches reggae MODs where no guitar is detected but bass & drums are clear.
  if ((hints?.hasBass || isBassHeavy) && hints?.hasPercussion && !hints?.hasSynth && !hints?.hasGuitar) {
    if (effectiveBpm >= 60 && effectiveBpm <= 110 && !isFourOnFloor) {
      const sub = effectiveBpm < 80 ? 'Dub' : isMajor ? 'Reggae' : 'Roots Reggae';
      return { primary: 'Reggae / Dub', subgenre: sub, confidence: 0.6, mood: isMajor ? 'Uplifting' : 'Chill', energy, danceability };
    }
  }

  // ── Genre Classification (BPM-based — electronic / unrecognised) ─────────

  let primary: string;
  let subgenre: string;
  let confidence = 0.55; // Base confidence
  
  // Chiptune/8-bit detection
  const isChiptuneSpectrum = highRatio > 0.35 && midRatio > bassRatio && !isBassHeavy;
  
  // Acid detection (303-style resonant mids)
  const isAcidSpectrum = midRatio > 0.38 && highRatio > 0.25 && isHighEnergy;
  
  // Industrial/harsh detection
  const isIndustrial = isDark && isHighEnergy && spectralVariance > 0.2;
  
  // Ambient detection
  const isAmbientSpectrum = isLowEnergy && beatRegularity < 0.4 && !isBassHeavy;
  
  // ════════════════════════════════════════════════════════════════════════
  // VERY FAST: 180+ BPM
  // ════════════════════════════════════════════════════════════════════════
  if (effectiveBpm >= 180) {
    primary = 'Electronic';
    
    if (effectiveBpm >= 200) {
      if (isHighEnergy && isDark) {
        subgenre = 'Speedcore';
        confidence = 0.7;
      } else if (isHighEnergy) {
        subgenre = 'Gabber';
        confidence = 0.65;
      } else {
        subgenre = 'Happy Hardcore';
        confidence = 0.6;
      }
    } else {
      // 180-200 BPM
      if (isChiptuneSpectrum) {
        subgenre = 'Happy Hardcore';
        confidence = 0.7;
      } else if (isIndustrial) {
        subgenre = 'Industrial Hardcore';
        confidence = 0.65;
      } else {
        subgenre = 'Hardcore';
        confidence = 0.6;
      }
    }
  }
  // ════════════════════════════════════════════════════════════════════════
  // FAST: 160-180 BPM (D&B, Jungle, Fast Trance)
  // ════════════════════════════════════════════════════════════════════════
  else if (effectiveBpm >= 160 && effectiveBpm < 180) {
    primary = 'Electronic';
    
    if (isBassHeavy && isBreakbeat) {
      subgenre = 'Drum & Bass';
      confidence = 0.75;
      if (isDark && isHighEnergy) {
        subgenre = 'Neurofunk';
        confidence = 0.7;
      } else if (isBright && isMidEnergy) {
        subgenre = 'Liquid D&B';
        confidence = 0.65;
      }
    } else if (isBassHeavy && isSyncopated) {
      subgenre = 'Jungle';
      confidence = 0.7;
    } else if (isChiptuneSpectrum) {
      subgenre = 'Chiptune';
      confidence = 0.7;
    } else if (isFourOnFloor && isHighEnergy) {
      subgenre = 'Hard Trance';
      confidence = 0.65;
    } else {
      subgenre = 'Breakcore';
      confidence = 0.55;
    }
  }
  // ════════════════════════════════════════════════════════════════════════
  // FAST-MEDIUM: 138-160 BPM (Trance, Hardstyle, Fast Techno)
  // ════════════════════════════════════════════════════════════════════════
  else if (effectiveBpm >= 138 && effectiveBpm < 160) {
    primary = 'Electronic';
    
    if (isFourOnFloor && isHighEnergy && isBassHeavy) {
      if (effectiveBpm >= 150) {
        subgenre = 'Hardstyle';
        confidence = 0.75;
      } else {
        subgenre = 'Hard Techno';
        confidence = 0.7;
      }
    } else if (isFourOnFloor && isBright && isHighEnergy) {
      subgenre = 'Uplifting Trance';
      confidence = 0.7;
    } else if (isFourOnFloor && isMidHeavy) {
      if (isMinor) {
        subgenre = 'Psytrance';
        confidence = 0.65;
      } else {
        subgenre = 'Trance';
        confidence = 0.65;
      }
    } else if (isAcidSpectrum && isFourOnFloor) {
      subgenre = 'Acid Techno';
      confidence = 0.7;
    } else if (isChiptuneSpectrum) {
      subgenre = 'Chiptune';
      confidence = 0.7;
    } else if (isIndustrial) {
      subgenre = 'Industrial';
      confidence = 0.6;
    } else {
      subgenre = 'Eurodance';
      confidence = 0.55;
    }
  }
  // ════════════════════════════════════════════════════════════════════════
  // MEDIUM-FAST: 125-138 BPM (Techno, Tech House, Progressive)
  // ════════════════════════════════════════════════════════════════════════
  else if (effectiveBpm >= 125 && effectiveBpm < 138) {
    primary = 'Electronic';
    
    if (isAcidSpectrum && isFourOnFloor) {
      subgenre = 'Acid Techno';
      confidence = 0.75;
    } else if (isFourOnFloor && isBassHeavy && isDark) {
      subgenre = 'Techno';
      confidence = 0.75;
      if (isIndustrial) {
        subgenre = 'Industrial Techno';
        confidence = 0.7;
      }
    } else if (isFourOnFloor && isBassHeavy && isHighEnergy) {
      subgenre = 'Peak Time Techno';
      confidence = 0.7;
    } else if (isFourOnFloor && isBalanced && isMidEnergy) {
      subgenre = 'Minimal Techno';
      confidence = 0.65;
    } else if (isFourOnFloor && isBright) {
      subgenre = 'Progressive Trance';
      confidence = 0.65;
    } else if (isChiptuneSpectrum) {
      subgenre = 'Chiptune';
      confidence = 0.7;
    } else if (isFourOnFloor) {
      subgenre = 'Tech House';
      confidence = 0.6;
    } else if (isBreakbeat) {
      subgenre = 'Breakbeat';
      confidence = 0.6;
    } else {
      subgenre = 'Electronic';
      confidence = 0.5;
    }
  }
  // ════════════════════════════════════════════════════════════════════════
  // MEDIUM: 118-125 BPM (House, Electro, Disco)
  // ════════════════════════════════════════════════════════════════════════
  else if (effectiveBpm >= 118 && effectiveBpm < 125) {
    primary = 'Electronic';
    
    if (isAcidSpectrum && isFourOnFloor) {
      subgenre = 'Acid House';
      confidence = 0.75;
    } else if (isFourOnFloor && isBassHeavy && isHighEnergy) {
      subgenre = 'Tech House';
      confidence = 0.7;
    } else if (isFourOnFloor && isBright && isHighEnergy) {
      subgenre = 'Electro House';
      confidence = 0.7;
    } else if (isFourOnFloor && isBalanced) {
      subgenre = 'House';
      confidence = 0.7;
    } else if (isChiptuneSpectrum) {
      subgenre = 'Chiptune';
      confidence = 0.7;
    } else if (isBright && isMidHeavy) {
      subgenre = 'Nu Disco';
      confidence = 0.6;
    } else if (isBreakbeat) {
      subgenre = 'Electro';
      confidence = 0.6;
    } else {
      subgenre = 'House';
      confidence = 0.55;
    }
  }
  // ════════════════════════════════════════════════════════════════════════
  // MEDIUM-SLOW: 105-118 BPM (Deep House, Garage, Funk)
  // ════════════════════════════════════════════════════════════════════════
  else if (effectiveBpm >= 105 && effectiveBpm < 118) {
    if (isFourOnFloor && isBassHeavy && !isHighEnergy) {
      primary = 'Electronic';
      subgenre = 'Deep House';
      confidence = 0.7;
    } else if (isFourOnFloor && isHighEnergy && isBassHeavy) {
      primary = 'Electronic';
      subgenre = 'Tech House';
      confidence = 0.65;
    } else if (isSyncopated && isBassHeavy) {
      primary = 'Electronic';
      subgenre = 'UK Garage';
      confidence = 0.65;
    } else if (isChiptuneSpectrum) {
      primary = 'Electronic';
      subgenre = 'Chiptune';
      confidence = 0.7;
    } else if (isFourOnFloor) {
      primary = 'Electronic';
      subgenre = 'House';
      confidence = 0.6;
    } else if (isBright && isMidHeavy) {
      primary = 'Electronic';
      subgenre = 'Synthwave';
      confidence = 0.6;
    } else {
      primary = 'Electronic';
      subgenre = 'Electro';
      confidence = 0.55;
    }
  }
  // ════════════════════════════════════════════════════════════════════════
  // SLOW-MEDIUM: 85-105 BPM (Hip-Hop, R&B, Downtempo, Synthwave)
  // ════════════════════════════════════════════════════════════════════════
  else if (effectiveBpm >= 85 && effectiveBpm < 105) {
    // Key differentiator: four-on-floor vs syncopated
    if (isFourOnFloor && isHighEnergy) {
      // Likely electronic
      primary = 'Electronic';
      if (isAcidSpectrum) {
        subgenre = 'Acid House';
        confidence = 0.65;
      } else if (isBassHeavy) {
        subgenre = 'Deep House';
        confidence = 0.65;
      } else {
        subgenre = 'Downtempo';
        confidence = 0.6;
      }
    } else if (isSyncopated && isBassHeavy && !isHighEnergy) {
      // Hip-hop characteristics
      primary = 'Hip Hop';
      if (effectiveBpm < 95) {
        subgenre = 'Boom Bap';
        confidence = 0.65;
      } else {
        subgenre = 'Hip Hop';
        confidence = 0.6;
      }
    } else if (isSyncopated && isBassHeavy && isHighEnergy) {
      primary = 'Hip Hop';
      subgenre = 'Trap';
      confidence = 0.65;
    } else if (isChiptuneSpectrum) {
      primary = 'Electronic';
      subgenre = 'Chiptune';
      confidence = 0.7;
    } else if (isBright && isMidHeavy && !isBassHeavy) {
      primary = 'Electronic';
      subgenre = 'Synthwave';
      confidence = 0.65;
    } else if (isDark && isMidEnergy) {
      primary = 'Electronic';
      subgenre = 'Darkwave';
      confidence = 0.6;
    } else {
      primary = 'Electronic';
      subgenre = 'Downtempo';
      confidence = 0.55;
    }
  }
  // ════════════════════════════════════════════════════════════════════════
  // SLOW: 70-85 BPM (Dub, Trip-Hop, Ambient)
  // ════════════════════════════════════════════════════════════════════════
  else if (effectiveBpm >= 70 && effectiveBpm < 85) {
    if (isBassHeavy && !isFourOnFloor && isMidEnergy) {
      primary = 'Reggae / Dub';
      subgenre = 'Dub';
      confidence = 0.6;
    } else if (isDark && isSyncopated) {
      primary = 'Electronic';
      subgenre = 'Trip Hop';
      confidence = 0.65;
    } else if (isAmbientSpectrum) {
      primary = 'Electronic';
      subgenre = 'Ambient';
      confidence = 0.6;
    } else if (isBassHeavy && isSyncopated) {
      primary = 'Hip Hop';
      subgenre = 'Lo-Fi Hip Hop';
      confidence = 0.55;
    } else if (isChiptuneSpectrum) {
      primary = 'Electronic';
      subgenre = 'Chiptune';
      confidence = 0.65;
    } else {
      primary = 'Electronic';
      subgenre = 'Downtempo';
      confidence = 0.55;
    }
  }
  // ════════════════════════════════════════════════════════════════════════
  // VERY SLOW: 50-70 BPM (Ambient, Drone, Experimental)
  // ════════════════════════════════════════════════════════════════════════
  else if (effectiveBpm >= 50 && effectiveBpm < 70) {
    primary = 'Electronic';
    
    if (isAmbientSpectrum) {
      subgenre = 'Ambient';
      confidence = 0.65;
    } else if (isDark && isLowEnergy) {
      subgenre = 'Dark Ambient';
      confidence = 0.6;
    } else if (isDense) {
      subgenre = 'IDM';
      confidence = 0.55;
    } else {
      subgenre = 'Ambient';
      confidence = 0.5;
    }
  }
  // ════════════════════════════════════════════════════════════════════════
  // EXTREMELY SLOW: <50 BPM (Drone, Noise, Experimental)
  // ════════════════════════════════════════════════════════════════════════
  else {
    primary = 'Electronic';
    
    if (isHighEnergy) {
      subgenre = 'Noise';
      confidence = 0.5;
    } else if (isAmbientSpectrum) {
      subgenre = 'Drone';
      confidence = 0.55;
    } else {
      subgenre = 'Experimental';
      confidence = 0.45;
    }
  }
  
  // ── Post-processing: Genre Refinements ───────────────────────────────────
  
  // Boost confidence for very clear patterns
  if (isFourOnFloor && beatRegularity > 0.8) {
    confidence = Math.min(0.85, confidence + 0.1);
  }
  
  // Time signature adjustments
  if (timeSignature === 3) {
    // Waltz/6-8 time is less common in electronic music
    if (primary === 'Electronic') {
      subgenre = subgenre + ' (3/4)';
      confidence = Math.max(0.4, confidence - 0.1);
    }
  }
  
  // IDM detection: only promote to IDM from generic Electronic fallback subgenres
  // (Electronic, Downtempo). Never overwrite a specific classification like Ambient,
  // Techno, D&B, etc. that already has a confident assignment.
  const IDM_OVERRIDABLE = new Set(['Electronic', 'Downtempo']);
  if (primary === 'Electronic' && IDM_OVERRIDABLE.has(subgenre) && isDense && !isFourOnFloor && spectralVariance > 0.18) {
    subgenre = 'IDM';
    confidence = 0.6;
  }
  
  return {
    primary,
    subgenre,
    confidence: Math.min(0.95, Math.max(0.3, confidence)),
    mood,
    energy,
    danceability,
  };
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
        postProgress(id, 85);

        // 5. Loudness analysis (RMS + peak) for auto-gain
        const loudness = computeLoudness(mono);
        postProgress(id, 90);

        // 6. Genre classification
        const genre = classifyGenre(
          rhythm.bpm,
          keyResult.key,
          timeSignature,
          frequencyPeaks,
          loudness.rmsDb,
          rhythm.beats,
          mono,
          sampleRate,
          (msg as AnalyzeRequest).instrumentHints,
        );
        postProgress(id, 98);

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
          genre,
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
