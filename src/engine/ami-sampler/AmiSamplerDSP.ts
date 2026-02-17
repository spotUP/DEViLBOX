/**
 * AmiSamplerDSP.ts — TypeScript wrapper for the Ami-Sampler WASM module
 * 
 * Loads the WASM module and provides async methods for offline sample processing:
 *   - Nearest-neighbor resampling (Amiga-style)
 *   - 8-bit Paula quantization
 *   - Sample & Hold decimation
 *   - A500/A1200 RC filter emulation + LED filter
 */

import { bufferToDataUrl } from '../../utils/audio/SampleProcessing';

// Module-level singleton
let wasmModule: AmiSamplerModule | null = null;
let loadPromise: Promise<AmiSamplerModule> | null = null;

interface AmiSamplerModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  _ami_create(sampleRate: number): number;
  _ami_destroy(handle: number): void;
  _ami_load_sample(handle: number, dataPtr: number, length: number, sourceSampleRate: number): void;
  _ami_resample(handle: number, targetRate: number): number;
  _ami_apply_8bit(handle: number): void;
  _ami_apply_snh(handle: number, snh: number): void;
  _ami_set_model(handle: number, isA500: number): void;
  _ami_set_led(handle: number, on: number): void;
  _ami_apply_filters(handle: number): void;
  _ami_process_full(handle: number, targetRate: number, snh: number, isA500: number, ledOn: number, quantize8bit: number): number;
  _ami_get_output_ptr(handle: number): number;
  _ami_get_output_length(handle: number): number;
  _ami_get_output_rate(handle: number): number;
  HEAPF32: Float32Array;
}

export interface AmiResampleOptions {
  targetRate: number;      // Target sample rate in Hz (e.g., 8363 for PAL C-2)
  snh: number;             // Sample & Hold: 1=off, 2-16 (higher = crunchier)
  model: 'A500' | 'A1200'; // Amiga model (A500 has LP+HP, A1200 has HP only)
  ledFilter: boolean;      // LED filter toggle (~3091 Hz 12dB/oct LP)
  quantize8bit: boolean;   // Apply 8-bit Paula quantization
}

export const DEFAULT_AMI_OPTIONS: AmiResampleOptions = {
  targetRate: 8363,        // PAL C-2 standard
  snh: 1,                  // No decimation
  model: 'A500',
  ledFilter: false,
  quantize8bit: true,
};

// Common Amiga sample rates
export const AMI_SAMPLE_RATES = {
  PAL_C1: 4181,    // PAL period C-1
  PAL_C2: 8363,    // PAL period C-2 (ProTracker standard)
  PAL_C3: 16726,   // PAL period C-3
  NTSC_C2: 8363,   // Same as PAL for C-2
  MAX_PAULA: 28867, // Maximum Paula DMA rate (PAL)
} as const;

async function loadModule(): Promise<AmiSamplerModule> {
  if (wasmModule) return wasmModule;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const baseUrl = import.meta.env.BASE_URL || '/';

    const [wasmResponse, jsResponse] = await Promise.all([
      fetch(`${baseUrl}ami-sampler/AmiSampler.wasm`),
      fetch(`${baseUrl}ami-sampler/AmiSampler.js`),
    ]);

    if (!wasmResponse.ok || !jsResponse.ok) {
      throw new Error(`Failed to fetch AmiSampler WASM/JS: wasm=${wasmResponse.status} js=${jsResponse.status}`);
    }

    const wasmBinary = await wasmResponse.arrayBuffer();
    let code = await jsResponse.text();

    // Patch for main-thread usage (not in a worker)
    code = code
      .replace(/import\.meta\.url/g, "'.'")
      .replace(/export\s+default\s+\w+;?/g, '');

    // Create factory function
    const factory = new Function(code + '\nreturn createAmiSampler;')();
    const module = await factory({ wasmBinary }) as AmiSamplerModule;

    wasmModule = module;
    return module;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

/**
 * Process an AudioBuffer through the Ami-Sampler DSP pipeline.
 * Returns a new AudioBuffer with the processed result + a WAV data URL.
 */
export async function amiResample(
  inputBuffer: AudioBuffer,
  options: AmiResampleOptions = DEFAULT_AMI_OPTIONS
): Promise<{ buffer: AudioBuffer; dataUrl: string; outputRate: number }> {
  const module = await loadModule();

  // Create instance
  const handle = module._ami_create(inputBuffer.sampleRate);
  if (handle < 0) throw new Error('Failed to create AmiSampler instance');

  try {
    // Get mono channel data (mix to mono if stereo)
    let inputData: Float32Array;
    if (inputBuffer.numberOfChannels === 1) {
      inputData = inputBuffer.getChannelData(0);
    } else {
      // Mix to mono
      const ch0 = inputBuffer.getChannelData(0);
      const ch1 = inputBuffer.getChannelData(1);
      inputData = new Float32Array(ch0.length);
      for (let i = 0; i < ch0.length; i++) {
        inputData[i] = (ch0[i] + ch1[i]) * 0.5;
      }
    }

    // Allocate WASM memory and copy input data
    const inputPtr = module._malloc(inputData.length * 4);
    module.HEAPF32.set(inputData, inputPtr >> 2);

    // Load sample into instance
    module._ami_load_sample(handle, inputPtr, inputData.length, inputBuffer.sampleRate);
    module._free(inputPtr);

    // Process full pipeline
    const outputLength = module._ami_process_full(
      handle,
      options.targetRate,
      options.snh,
      options.model === 'A500' ? 1 : 0,
      options.ledFilter ? 1 : 0,
      options.quantize8bit ? 1 : 0
    );

    if (outputLength <= 0) throw new Error('AmiSampler processing returned empty output');

    // Read output from WASM memory
    const outputPtr = module._ami_get_output_ptr(handle);
    const outputRate = module._ami_get_output_rate(handle);
    const outputData = new Float32Array(module.HEAPF32.buffer, outputPtr, outputLength).slice();

    // Create output AudioBuffer at the resampled rate
    const outputBuffer = new AudioBuffer({
      length: outputLength,
      numberOfChannels: 1,
      sampleRate: outputRate,
    });
    outputBuffer.copyToChannel(outputData, 0);

    // Convert to WAV data URL
    const dataUrl = await bufferToDataUrl(outputBuffer);

    return { buffer: outputBuffer, dataUrl, outputRate };
  } finally {
    module._ami_destroy(handle);
  }
}

/**
 * Check if the WASM module is loaded and ready.
 */
export function isAmiSamplerReady(): boolean {
  return wasmModule !== null;
}

/**
 * Preload the WASM module (call early to avoid delay on first use).
 */
export async function preloadAmiSampler(): Promise<void> {
  await loadModule();
}
