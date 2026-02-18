/**
 * MPC Resampler DSP Engine
 *
 * Emulates the classic MPC (Akai Music Production Center) sample processing chain:
 * - MPC60 (1988): 40 kHz, 12-bit, gritty hip-hop sound
 * - MPC3000 (1994): 44.1 kHz, 16-bit, cleaner but warm
 * - SP-1200 (1987): 26 kHz, 12-bit, extreme lo-fi
 *
 * Key characteristics:
 * 1. Lower sample rates (26-40 kHz vs modern 44.1/48 kHz)
 * 2. 12-bit quantization (4096 levels vs 16-bit's 65536)
 * 3. Zero-order hold resampling (nearest-neighbor, allows aliasing)
 * 4. Anti-aliasing filters (RC circuits ~7.5-15 kHz)
 * 5. Subtle ADC/DAC warmth and saturation
 *
 * Signal chain (based on DT Yeh 2007 paper):
 * Input → Pre-filter → Resample → Quantize → Post-filter → Warmth → Output
 */

import { bufferToDataUrl } from '../../utils/audio/SampleProcessing';

// ============================================================================
// Interfaces and Types
// ============================================================================

export interface MpcResampleOptions {
  targetRate: number;        // Hz (e.g., 40000, 26040, 44100)
  bitDepth: number;          // 8-16 bits (12 is classic MPC)
  quantize12bit: boolean;    // Legacy toggle for 12-bit mode
  antiAlias: boolean;        // Apply pre/post filters
  warmth: number;            // 0-1, optional saturation
  useDither: boolean;        // TPDF noise before quantization
  autoGain: boolean;         // Compensate for quantization loss
  exactRates: boolean;       // Use hardware-accurate rates
  model: 'MPC60' | 'MPC3000' | 'SP1200' | 'MPC2000XL';
}

export interface ProcessedResult {
  buffer: AudioBuffer;
  dataUrl: string;
}

export interface MpcPreset {
  name: string;
  targetRate: number;
  bitDepth: number;
  antiAlias: boolean;
  warmth: number;
  dither: boolean;
  model: 'MPC60' | 'MPC3000' | 'SP1200' | 'MPC2000XL';
  timestamp: number;
}

// ============================================================================
// Constants
// ============================================================================

export const MPC_SAMPLE_RATES = {
  MPC60: 40000,              // Actually 39,062.5 Hz (rounded)
  MPC60_EXACT: 39062.5,      // Exact hardware rate (40MHz ÷ 1024)
  MPC3000: 44100,
  MPC2000XL: 44100,
  SP1200: 26040,
  SP1200_EXACT: 26042.0,     // Exact (vs rounded 26040)
  LOFI_22K: 22050,
  LOFI_11K: 11025,
  LOFI_8K: 8000,
} as const;

export const MODEL_CONFIGS: Record<string, Partial<MpcResampleOptions>> = {
  MPC60: {
    targetRate: 40000,
    bitDepth: 12,
    quantize12bit: true,
    antiAlias: true,        // 15 kHz filter
    warmth: 0.3,            // Grittier
    useDither: true,
    autoGain: true,
    exactRates: false,
    model: 'MPC60',
  },
  MPC3000: {
    targetRate: 44100,
    bitDepth: 16,
    quantize12bit: false,   // 16-bit mode
    antiAlias: true,        // 18 kHz filter
    warmth: 0.1,            // Cleaner
    useDither: false,       // Not needed at 16-bit
    autoGain: false,
    exactRates: false,
    model: 'MPC3000',
  },
  SP1200: {
    targetRate: 26040,
    bitDepth: 12,
    quantize12bit: true,
    antiAlias: true,        // 7.5 kHz aggressive filter
    warmth: 0.4,            // Maximum grit
    useDither: true,
    autoGain: true,
    exactRates: false,
    model: 'SP1200',
  },
  MPC2000XL: {
    targetRate: 44100,
    bitDepth: 16,
    quantize12bit: false,   // 16-bit
    antiAlias: true,        // 20 kHz filter (cleaner)
    warmth: 0.05,           // Minimal warmth
    useDither: false,       // Not needed at 16-bit
    autoGain: false,
    exactRates: false,
    model: 'MPC2000XL',
  },
};

export const DEFAULT_MPC_OPTIONS: MpcResampleOptions = {
  targetRate: 40000,
  bitDepth: 12,
  quantize12bit: true,
  antiAlias: true,
  warmth: 0.2,
  useDither: true,
  autoGain: true,
  exactRates: false,
  model: 'MPC60',
};

// ============================================================================
// DSP Constants
// ============================================================================

// Audio constants
const MAX_SAMPLE_VALUE_16BIT = 32767;
const MIN_SAMPLE_VALUE_16BIT = -32768;
const SAMPLE_SCALE_16BIT = 32768;
const FULL_SCALE_16BIT = 65536;
const BUTTERWORTH_Q = 0.707; // Q factor for Butterworth filter response
const OUTPUT_HEADROOM = 0.95; // Leave 0.5 dB headroom to prevent clipping

// Bit depth limits
const MIN_BIT_DEPTH = 1;
const MAX_BIT_DEPTH = 16;

// Filter Cutoff Frequencies (model-specific)
const FILTER_CUTOFFS = {
  MPC60: { input: 15000, output: 15000 },
  MPC3000: { input: 18000, output: 18000 },
  SP1200: { input: 7500, output: 7500 },
  MPC2000XL: { input: 20000, output: 20000 },
};

// ============================================================================
// DSP Functions
// ============================================================================

/**
 * Apply input anti-aliasing filter before resampling
 * Critical to prevent aliasing artifacts from entering quantization stage
 */
async function applyInputFilter(
  buffer: AudioBuffer,
  cutoff: number
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;

  const filter = offlineCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  filter.Q.value = BUTTERWORTH_Q;

  source.connect(filter);
  filter.connect(offlineCtx.destination);

  source.start(0);
  return await offlineCtx.startRendering();
}

/**
 * Zero-order hold (nearest-neighbor) resampling
 * Matches MPC60/SP-1200 hardware - no interpolation, allows aliasing
 * Algorithm adapted from ami-sampler-wasm/AmiSamplerWASM.cpp lines 285-325
 */
function nearestNeighborResample(
  buffer: AudioBuffer,
  targetRate: number
): AudioBuffer {
  const ratio = buffer.sampleRate / targetRate;
  const newLength = Math.floor(buffer.length / ratio);

  // Create new buffer at target rate using OfflineAudioContext
  // (avoids memory leak from unclosed AudioContext)
  const offlineCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    newLength,
    targetRate
  );
  const resampled = offlineCtx.createBuffer(
    buffer.numberOfChannels,
    newLength,
    targetRate
  );

  // Process each channel
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const inputData = buffer.getChannelData(c);
    const outputData = resampled.getChannelData(c);

    // Zero-order hold: floor index = no interpolation
    for (let i = 0; i < newLength; i++) {
      const sourceIndex = Math.floor(i * ratio);
      outputData[i] = inputData[sourceIndex];
    }
  }

  return resampled;
}

/**
 * Hardware-accurate MPC2000XL bit truncation
 * Algorithm from mpc2000xl.com - zeros last N bits
 *
 * For 12-bit: reduces 16-bit sample by zeroing last 4 bits
 * Creates characteristic stepped waveform with quantization noise
 */
function quantizeNbit(buffer: AudioBuffer, bitDepth: number): AudioBuffer {
  // Validate and clamp bit depth to valid range
  if (bitDepth < MIN_BIT_DEPTH || bitDepth > MAX_BIT_DEPTH) {
    console.warn(`Invalid bitDepth ${bitDepth}, clamping to [${MIN_BIT_DEPTH}, ${MAX_BIT_DEPTH}]`);
    bitDepth = Math.max(MIN_BIT_DEPTH, Math.min(MAX_BIT_DEPTH, bitDepth));
  }

  if (bitDepth >= MAX_BIT_DEPTH) return buffer; // No quantization needed

  const scale = Math.pow(2, bitDepth);      // e.g., 4096 for 12-bit
  const fullScale = FULL_SCALE_16BIT;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      // Convert float [-1, 1] to 16-bit integer [-32768, 32767]
      // Clamp to valid range to prevent overflow (data[i]=1.0 would give 32768)
      let sample16 = Math.floor(data[i] * SAMPLE_SCALE_16BIT);
      sample16 = Math.max(MIN_SAMPLE_VALUE_16BIT, Math.min(MAX_SAMPLE_VALUE_16BIT, sample16));

      // MPC2000XL method: zeros last (16 - bitDepth) bits
      const reduced = Math.floor(sample16 * scale / fullScale);
      const truncated = reduced * (fullScale / scale);

      // Convert back to float [-1, 1]
      data[i] = truncated / SAMPLE_SCALE_16BIT;
    }
  }

  return buffer;
}

/**
 * Apply triangular probability density function (TPDF) dither
 * Smooths quantization noise floor and reduces distortion
 */
function applyTriangularDither(buffer: AudioBuffer, bitDepth: number): AudioBuffer {
  const step = Math.pow(0.5, bitDepth);
  const ditherAmount = step * 0.5; // ±0.5 LSB

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      // Triangular PDF: sum of two uniform random numbers
      const r1 = Math.random() - 0.5; // [-0.5, 0.5]
      const r2 = Math.random() - 0.5;
      const dither = (r1 + r2) * ditherAmount;

      data[i] += dither;
    }
  }

  return buffer;
}

/**
 * Apply output reconstruction filter after resampling
 */
async function applyOutputFilter(
  buffer: AudioBuffer,
  cutoff: number
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;

  const filter = offlineCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  filter.Q.value = BUTTERWORTH_Q;

  source.connect(filter);
  filter.connect(offlineCtx.destination);

  source.start(0);
  return await offlineCtx.startRendering();
}

/**
 * Apply ADC/DAC warmth and saturation
 * Asymmetric soft clipping adapted from TapeSaturation.ts
 */
function applyWarmth(buffer: AudioBuffer, amount: number): AudioBuffer {
  if (amount <= 0) return buffer;

  const drive = 1 + amount * 2; // 1-3x drive

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const x = data[i] * drive;
      // Asymmetric waveshaper: harder clip on positive, softer on negative
      const processed = x >= 0
        ? Math.tanh(x) * 0.95 + x * 0.02  // Positive: harder clip
        : Math.tanh(x * 0.85);             // Negative: softer

      // Clamp output to valid range [-1, 1] to prevent downstream clipping
      data[i] = Math.max(-1, Math.min(1, processed));
    }
  }

  return buffer;
}

/**
 * Auto-adjust volume to match perceived loudness after quantization
 */
function applyGainCompensation(buffer: AudioBuffer, bitDepth: number): AudioBuffer {
  // Quantization reduces RMS level - compensate with makeup gain
  const compensation = 1 + (16 - bitDepth) * 0.05; // +5% per bit below 16

  // Find peak value across all channels to prevent clipping
  let maxPeak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxPeak) maxPeak = abs;
    }
  }

  // Calculate safe gain factor - leave 0.5 dB headroom
  const safeFactor = maxPeak * compensation > OUTPUT_HEADROOM
    ? OUTPUT_HEADROOM / (maxPeak * compensation)
    : 1.0;

  const finalGain = compensation * safeFactor;

  // Apply gain with safety factor
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      data[i] *= finalGain;
    }
  }

  // Log if we had to reduce gain to prevent clipping
  if (safeFactor < 1.0) {
    console.debug(
      `MPC gain compensation: reduced from ${compensation.toFixed(2)}x to ${finalGain.toFixed(2)}x to prevent clipping`
    );
  }

  return buffer;
}

/**
 * Main MPC resampler entry point
 * Orchestrates full DSP pipeline
 */
export async function mpcResample(
  buffer: AudioBuffer,
  options: MpcResampleOptions
): Promise<ProcessedResult> {
  let processed = buffer;

  // Determine filter cutoffs based on model
  const filterConfig = FILTER_CUTOFFS[options.model] || FILTER_CUTOFFS.MPC60;

  // Determine target rate (exact or rounded)
  let targetRate = options.targetRate;
  if (options.exactRates) {
    if (options.model === 'MPC60') {
      targetRate = MPC_SAMPLE_RATES.MPC60_EXACT;
    } else if (options.model === 'SP1200') {
      targetRate = MPC_SAMPLE_RATES.SP1200_EXACT;
    }
  }

  // Step 1: Input anti-aliasing filter (pre-filter before downsampling)
  if (options.antiAlias) {
    processed = await applyInputFilter(processed, filterConfig.input);
  }

  // Step 2: Sample rate conversion (zero-order hold / nearest-neighbor)
  if (targetRate !== buffer.sampleRate) {
    processed = nearestNeighborResample(processed, targetRate);
  }

  // Step 3a: Triangular dither (before quantization)
  if (options.useDither && options.bitDepth < 16) {
    processed = applyTriangularDither(processed, options.bitDepth);
  }

  // Step 3b: Bit depth reduction (12-bit quantization)
  const effectiveBitDepth = options.quantize12bit ? 12 : options.bitDepth;
  if (effectiveBitDepth < 16) {
    processed = quantizeNbit(processed, effectiveBitDepth);
  }

  // Step 3c: Gain compensation (after quantization)
  if (options.autoGain && effectiveBitDepth < 16) {
    processed = applyGainCompensation(processed, effectiveBitDepth);
  }

  // Step 4: Output filter (post-resampling reconstruction)
  if (options.antiAlias) {
    processed = await applyOutputFilter(processed, filterConfig.output);
  }

  // Step 5: Optional warmth (ADC/DAC saturation)
  if (options.warmth > 0) {
    processed = applyWarmth(processed, options.warmth);
  }

  // Convert to WAV data URL
  const dataUrl = await bufferToDataUrl(processed);

  return {
    buffer: processed,
    dataUrl,
  };
}

// ============================================================================
// Preset Management
// ============================================================================

const PRESET_STORAGE_KEY = 'devilbox-mpc-presets';

export function savePreset(name: string, options: MpcResampleOptions): void {
  const presets = loadPresets();
  const preset: MpcPreset = {
    name,
    targetRate: options.targetRate,
    bitDepth: options.bitDepth,
    antiAlias: options.antiAlias,
    warmth: options.warmth,
    dither: options.useDither,
    model: options.model,
    timestamp: Date.now(),
  };

  // Remove existing preset with same name
  const filtered = presets.filter(p => p.name !== name);
  filtered.push(preset);

  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(filtered));
}

export function loadPresets(): MpcPreset[] {
  try {
    const data = localStorage.getItem(PRESET_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function deletePreset(name: string): void {
  const presets = loadPresets();
  const filtered = presets.filter(p => p.name !== name);
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(filtered));
}
