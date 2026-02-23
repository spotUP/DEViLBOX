/**
 * Audio codec detection and browser capability detection.
 * 
 * Provides utilities to:
 * 1. Detect which audio formats the browser can decode natively
 * 2. Detect audio format from magic bytes (file header)
 * 3. Map file extensions to MIME types
 */

/**
 * Audio format identifiers
 */
export type AudioFormat = 
  | 'mp3'
  | 'wav'
  | 'flac'
  | 'ogg'
  | 'opus'
  | 'aac'
  | 'm4a'
  | 'aiff'
  | 'alac'
  | 'wma'
  | 'webm'
  | 'unknown';

/**
 * MIME types for audio formats
 */
export const AUDIO_MIME_TYPES: Record<AudioFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg; codecs=vorbis',
  opus: 'audio/ogg; codecs=opus',
  aac: 'audio/aac',
  m4a: 'audio/mp4; codecs=mp4a.40.2',
  aiff: 'audio/aiff',
  alac: 'audio/mp4; codecs=alac',
  wma: 'audio/x-ms-wma',
  webm: 'audio/webm; codecs=opus',
  unknown: '',
};

/**
 * File extension to format mapping
 */
export const EXTENSION_TO_FORMAT: Record<string, AudioFormat> = {
  '.mp3': 'mp3',
  '.wav': 'wav',
  '.flac': 'flac',
  '.ogg': 'ogg',
  '.oga': 'ogg',
  '.opus': 'opus',
  '.aac': 'aac',
  '.m4a': 'm4a',
  '.m4b': 'm4a',
  '.aif': 'aiff',
  '.aiff': 'aiff',
  '.alac': 'alac',
  '.wma': 'wma',
  '.webm': 'webm',
};

/**
 * Cache for native codec support detection
 */
const nativeCodecSupportCache = new Map<AudioFormat, boolean>();

/**
 * Check if the browser can decode a format natively using HTMLAudioElement.
 * Results are cached for performance.
 */
export function canDecodeNatively(format: AudioFormat): boolean {
  if (nativeCodecSupportCache.has(format)) {
    return nativeCodecSupportCache.get(format)!;
  }

  const mimeType = AUDIO_MIME_TYPES[format];
  if (!mimeType) {
    nativeCodecSupportCache.set(format, false);
    return false;
  }

  const audio = document.createElement('audio');
  const canPlay = audio.canPlayType(mimeType);
  // 'probably' or 'maybe' means supported, '' means not supported
  const supported = canPlay !== '';
  
  nativeCodecSupportCache.set(format, supported);
  return supported;
}

/**
 * Get all formats that can be decoded natively by this browser.
 */
export function getNativeSupportedFormats(): AudioFormat[] {
  const formats: AudioFormat[] = ['mp3', 'wav', 'flac', 'ogg', 'opus', 'aac', 'm4a', 'aiff', 'alac', 'webm'];
  return formats.filter(canDecodeNatively);
}

/**
 * Detect audio format from magic bytes (file header).
 * More reliable than extension-based detection.
 */
export function detectFormatFromBytes(buffer: ArrayBuffer): AudioFormat {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer.slice(0, 12));

  // FLAC: starts with "fLaC"
  if (bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return 'flac';
  }

  // OGG container: starts with "OggS"
  if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    // Need to check further for Opus vs Vorbis
    // Opus has "OpusHead" signature at byte 28
    if (buffer.byteLength > 36) {
      const opusCheck = new Uint8Array(buffer.slice(28, 36));
      const opusSignature = String.fromCharCode(...opusCheck);
      if (opusSignature === 'OpusHead') {
        return 'opus';
      }
    }
    return 'ogg';
  }

  // WAV: starts with "RIFF" and contains "WAVE"
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    if (bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
      return 'wav';
    }
  }

  // AIFF: starts with "FORM" and contains "AIFF"
  if (bytes[0] === 0x46 && bytes[1] === 0x4F && bytes[2] === 0x52 && bytes[3] === 0x4D) {
    if (bytes[8] === 0x41 && bytes[9] === 0x49 && bytes[10] === 0x46 && bytes[11] === 0x46) {
      return 'aiff';
    }
  }

  // MP3: starts with ID3 tag or sync word 0xFF 0xFB/0xFA/0xF3/0xF2
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'mp3'; // ID3v2 tag
  }
  if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) {
    return 'mp3'; // MPEG sync word
  }

  // M4A/AAC: ftyp box (ISO Base Media File Format)
  if (view.byteLength >= 8) {
    const ftypPos = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
    if (ftypPos) {
      // Check brand at offset 8
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      if (brand === 'M4A ' || brand === 'mp42' || brand === 'isom' || brand === 'MSNV') {
        return 'm4a';
      }
      if (brand === 'M4B ') {
        return 'm4a'; // Audiobook, same codec
      }
    }
  }

  // WebM: starts with EBML header 0x1A 0x45 0xDF 0xA3
  if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
    return 'webm';
  }

  // WMA: ASF header GUID
  const asfGuid = [0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11];
  let isAsf = true;
  for (let i = 0; i < 8 && i < bytes.length; i++) {
    if (bytes[i] !== asfGuid[i]) {
      isAsf = false;
      break;
    }
  }
  if (isAsf) {
    return 'wma';
  }

  return 'unknown';
}

/**
 * Get format from filename extension.
 */
export function getFormatFromExtension(filename: string): AudioFormat {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return EXTENSION_TO_FORMAT[ext] ?? 'unknown';
}

/**
 * Detect format with fallback chain: magic bytes first, then extension.
 */
export function detectFormat(buffer: ArrayBuffer, filename: string): AudioFormat {
  const fromBytes = detectFormatFromBytes(buffer);
  if (fromBytes !== 'unknown') {
    return fromBytes;
  }
  return getFormatFromExtension(filename);
}

/**
 * Check if a format requires a WASM fallback decoder in the current browser.
 */
export function requiresWasmDecoder(format: AudioFormat): boolean {
  if (format === 'unknown' || format === 'wma') {
    // WMA always requires WASM (no browser supports it natively)
    return format === 'wma';
  }
  return !canDecodeNatively(format);
}

/**
 * Get browser/codec support summary for debugging.
 */
export function getCodecSupportSummary(): Record<AudioFormat, { native: boolean; wasmAvailable: boolean }> {
  const formats: AudioFormat[] = ['mp3', 'wav', 'flac', 'ogg', 'opus', 'aac', 'm4a', 'aiff', 'alac', 'wma', 'webm'];
  const summary: Record<string, { native: boolean; wasmAvailable: boolean }> = {};
  
  for (const format of formats) {
    summary[format] = {
      native: canDecodeNatively(format),
      wasmAvailable: ['flac', 'ogg', 'opus', 'aac'].includes(format), // Formats we have WASM decoders for
    };
  }
  
  return summary as Record<AudioFormat, { native: boolean; wasmAvailable: boolean }>;
}
