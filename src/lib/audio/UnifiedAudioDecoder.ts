/**
 * UnifiedAudioDecoder - Cross-browser audio decoding with WASM fallbacks
 *
 * Tries native browser decoding first, falls back to WASM decoders for
 * formats not supported by the browser (e.g., OGG/OPUS on Safari).
 */

import { detectFormat, requiresWasmDecoder, canDecodeNatively, AudioFormat } from './codecDetection';

// Lazy-loaded WASM decoders
let FlacDecoder: typeof import('@wasm-audio-decoders/flac').FLACDecoder | null = null;
let OggVorbisDecoder: typeof import('@wasm-audio-decoders/ogg-vorbis').OggVorbisDecoder | null = null;
let OpusDecoder: typeof import('@wasm-audio-decoders/opus-ml').OpusDecoder | null = null;
let MPEGDecoder: typeof import('mpg123-decoder').MPEGDecoder | null = null;

interface DecodedAudio {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: number;
  bitDepth?: number;
  errors?: Array<{ message: string }>;
}

interface WasmDecoderInstance {
  ready: Promise<void>;
  decode(data: Uint8Array): DecodedAudio;
  decodeFile?(data: Uint8Array): DecodedAudio;
  free(): void;
}

/**
 * Load WASM decoder for a specific format (lazy loading)
 */
async function loadWasmDecoder(format: AudioFormat): Promise<WasmDecoderInstance | null> {
  switch (format) {
    case 'flac':
      if (!FlacDecoder) {
        const mod = await import('@wasm-audio-decoders/flac');
        FlacDecoder = mod.FLACDecoder;
      }
      const flacInstance = new FlacDecoder();
      await flacInstance.ready;
      return flacInstance as unknown as WasmDecoderInstance;

    case 'ogg':
      if (!OggVorbisDecoder) {
        const mod = await import('@wasm-audio-decoders/ogg-vorbis');
        OggVorbisDecoder = mod.OggVorbisDecoder;
      }
      const oggInstance = new OggVorbisDecoder();
      await oggInstance.ready;
      return oggInstance as unknown as WasmDecoderInstance;

    case 'opus':
      if (!OpusDecoder) {
        const mod = await import('@wasm-audio-decoders/opus-ml');
        OpusDecoder = mod.OpusDecoder;
      }
      const opusInstance = new OpusDecoder();
      await opusInstance.ready;
      return opusInstance as unknown as WasmDecoderInstance;

    case 'mp3':
      if (!MPEGDecoder) {
        const mod = await import('mpg123-decoder');
        MPEGDecoder = mod.MPEGDecoder;
      }
      const mpegInstance = new MPEGDecoder();
      await mpegInstance.ready;
      return mpegInstance as unknown as WasmDecoderInstance;

    default:
      return null;
  }
}

/**
 * Convert decoded audio channels to AudioBuffer
 */
function channelsToAudioBuffer(
  audioContext: AudioContext,
  channelData: Float32Array[],
  sampleRate: number
): AudioBuffer {
  const numberOfChannels = channelData.length;
  const length = channelData[0]?.length ?? 0;

  if (length === 0) {
    throw new Error('Decoded audio has no samples');
  }

  const audioBuffer = audioContext.createBuffer(numberOfChannels, length, sampleRate);

  for (let i = 0; i < numberOfChannels; i++) {
    audioBuffer.copyToChannel(channelData[i], i);
  }

  return audioBuffer;
}

/**
 * Decode audio using WASM decoder
 */
async function decodeWithWasm(
  audioContext: AudioContext,
  data: ArrayBuffer,
  format: AudioFormat
): Promise<AudioBuffer> {
  const decoder = await loadWasmDecoder(format);
  if (!decoder) {
    throw new Error(`No WASM decoder available for format: ${format}`);
  }

  try {
    const uint8Data = new Uint8Array(data);

    // Some decoders have decodeFile for complete files
    const decoded = decoder.decodeFile
      ? decoder.decodeFile(uint8Data)
      : decoder.decode(uint8Data);

    if (!decoded.channelData || decoded.channelData.length === 0) {
      throw new Error(`WASM decoder returned no channel data for ${format}`);
    }

    if (decoded.errors && decoded.errors.length > 0) {
      console.warn(`[UnifiedAudioDecoder] WASM decode warnings for ${format}:`, decoded.errors);
    }

    return channelsToAudioBuffer(audioContext, decoded.channelData, decoded.sampleRate);
  } finally {
    decoder.free();
  }
}

/**
 * Decode audio using native browser decodeAudioData
 */
async function decodeNative(audioContext: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Need to slice because decodeAudioData detaches the buffer
  return audioContext.decodeAudioData(data.slice(0));
}

export interface DecodeOptions {
  /** Force WASM decoding even if native is available */
  forceWasm?: boolean;
  /** File name hint for format detection */
  filename?: string;
  /** Progress callback for large files */
  onProgress?: (progress: number) => void;
}

export interface DecodeResult {
  audioBuffer: AudioBuffer;
  format: AudioFormat;
  usedWasm: boolean;
  duration: number;
}

/**
 * Decode audio data to AudioBuffer with automatic format detection and WASM fallback
 */
export async function decodeAudio(
  audioContext: AudioContext,
  data: ArrayBuffer,
  options: DecodeOptions = {}
): Promise<DecodeResult> {
  const { forceWasm = false, filename } = options;

  // Detect format
  const format = detectFormat(data, filename);
  if (!format) {
    throw new Error('Unable to detect audio format');
  }

  const needsWasm = forceWasm || requiresWasmDecoder(format);
  let audioBuffer: AudioBuffer;
  let usedWasm = false;

  if (!needsWasm) {
    // Try native first
    try {
      audioBuffer = await decodeNative(audioContext, data);
    } catch (nativeError) {
      console.warn(`[UnifiedAudioDecoder] Native decode failed for ${format}, trying WASM:`, nativeError);

      // Native failed, try WASM fallback
      try {
        audioBuffer = await decodeWithWasm(audioContext, data, format);
        usedWasm = true;
      } catch (wasmError) {
        throw new Error(
          `Failed to decode ${format}: Native error: ${nativeError}, WASM error: ${wasmError}`
        );
      }
    }
  } else {
    // Need WASM decoder
    try {
      audioBuffer = await decodeWithWasm(audioContext, data, format);
      usedWasm = true;
    } catch (wasmError) {
      // Last resort: try native anyway (might work for some edge cases)
      try {
        audioBuffer = await decodeNative(audioContext, data);
      } catch (nativeError) {
        throw new Error(
          `Failed to decode ${format} with WASM: ${wasmError}. Native also failed: ${nativeError}`
        );
      }
    }
  }

  return {
    audioBuffer,
    format,
    usedWasm,
    duration: audioBuffer.duration,
  };
}

/**
 * Pre-warm WASM decoders for common formats
 * Call this early to reduce first-decode latency
 */
export async function preloadDecoders(formats: AudioFormat[] = ['flac', 'ogg', 'opus']): Promise<void> {
  const loadPromises = formats.map(async (format) => {
    try {
      const decoder = await loadWasmDecoder(format);
      decoder?.free();
    } catch {
      // Ignore load errors during preload
    }
  });

  await Promise.all(loadPromises);
}

/**
 * Check which formats are supported (native + WASM)
 */
export function getSupportedFormats(): { native: AudioFormat[]; wasm: AudioFormat[]; all: AudioFormat[] } {
  const allFormats: AudioFormat[] = ['mp3', 'wav', 'flac', 'ogg', 'opus', 'aac', 'm4a', 'aiff', 'webm'];
  const wasmFormats: AudioFormat[] = ['flac', 'ogg', 'opus', 'mp3'];

  const native = allFormats.filter((f) => canDecodeNatively(f));
  const wasm = wasmFormats;
  const all = [...new Set([...native, ...wasm])];

  return { native, wasm, all };
}

/**
 * Get human-readable format name
 */
export function getFormatDisplayName(format: AudioFormat): string {
  const names: Record<AudioFormat, string> = {
    mp3: 'MP3',
    wav: 'WAV',
    flac: 'FLAC',
    ogg: 'OGG Vorbis',
    opus: 'Opus',
    aac: 'AAC',
    m4a: 'M4A/AAC',
    aiff: 'AIFF',
    webm: 'WebM',
    wma: 'WMA',
    unknown: 'Unknown',
  };
  return names[format] || format.toUpperCase();
}
