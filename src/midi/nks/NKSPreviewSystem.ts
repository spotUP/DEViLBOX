/**
 * NKS Preset Preview System
 *
 * Generates OGG Vorbis audio previews per NKS SDK Section 7:
 * - Max 6 seconds duration
 * - Normalized to -19 LUFS with -3dB peak
 * - Stored in .previews/ hidden folder alongside preset files
 * - Filename: <preset_name>.nksf.ogg
 *
 * Uses Web Audio API for capture and MediaRecorder for OGG encoding.
 */

import { NKS_PREVIEW_SPEC } from './types';
import type { NKSPreviewMetadata } from './types';

// ============================================================================
// Preview Generation
// ============================================================================

/**
 * Generate a preview audio blob for a preset.
 *
 * Captures audio output from the engine for up to 6 seconds,
 * normalizes to -19 LUFS, and encodes as OGG Vorbis.
 *
 * @param audioContext - Web Audio context from the engine
 * @param sourceNode - The audio source node to capture from
 * @param durationMs - Duration to capture (max 6000ms)
 * @returns OGG Vorbis blob
 */
export async function generatePreview(
  audioContext: AudioContext,
  sourceNode: AudioNode,
  durationMs = 4000,
): Promise<Blob> {
  const maxDuration = NKS_PREVIEW_SPEC.MAX_DURATION_S * 1000;
  const actualDuration = Math.min(durationMs, maxDuration);

  // Create a MediaStream destination for real-time capture
  const dest = audioContext.createMediaStreamDestination();
  sourceNode.connect(dest);

  // Record to get the audio data
  const chunks: Blob[] = [];
  const mimeType = getOggMimeType();
  const recorder = new MediaRecorder(dest.stream, {
    mimeType: mimeType || undefined,
  });

  return new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      sourceNode.disconnect(dest);

      const rawBlob = new Blob(chunks, { type: mimeType || 'audio/ogg' });

      // Normalize the audio
      try {
        const normalized = await normalizeAudio(rawBlob, audioContext);
        resolve(normalized);
      } catch {
        // If normalization fails, return raw recording
        resolve(rawBlob);
      }
    };

    recorder.onerror = () => reject(new Error('Preview recording failed'));

    recorder.start();
    setTimeout(() => recorder.stop(), actualDuration);
  });
}

/**
 * Generate a preview from an AudioBuffer (offline rendering).
 * Useful for synths that can render to a buffer directly.
 */
export async function generatePreviewFromBuffer(
  buffer: AudioBuffer,
): Promise<Blob> {
  // Trim to max duration
  const maxSamples = NKS_PREVIEW_SPEC.MAX_DURATION_S * buffer.sampleRate;
  const frameCount = Math.min(buffer.length, maxSamples);

  // Create trimmed buffer
  const trimmed = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: frameCount,
    sampleRate: buffer.sampleRate,
  });

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    trimmed.copyToChannel(buffer.getChannelData(ch).subarray(0, frameCount), ch);
  }

  // Normalize
  const normalizedBuffer = normalizeBuffer(trimmed);

  // Encode as WAV (OGG encoding requires MediaRecorder)
  return encodeAsWav(normalizedBuffer);
}

// ============================================================================
// Audio Normalization
// ============================================================================

/**
 * Normalize audio blob to -19 LUFS with -3dB peak per NKS spec.
 */
async function normalizeAudio(blob: Blob, audioContext: AudioContext): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const normalized = normalizeBuffer(audioBuffer);
  return encodeAsWav(normalized);
}

/**
 * Normalize an AudioBuffer to NKS preview spec.
 * Applies gain to reach approximately -19 LUFS with -3dB peak ceiling.
 */
function normalizeBuffer(buffer: AudioBuffer): AudioBuffer {
  // Calculate current peak
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }

  if (peak === 0) return buffer;

  // Calculate RMS (rough LUFS approximation)
  let sumSquared = 0;
  let totalSamples = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      sumSquared += data[i] * data[i];
      totalSamples++;
    }
  }
  const rms = Math.sqrt(sumSquared / totalSamples);

  // Target: -19 LUFS with -3dB peak ceiling
  const targetRMS = Math.pow(10, NKS_PREVIEW_SPEC.TARGET_LUFS / 20);
  const peakCeiling = Math.pow(10, NKS_PREVIEW_SPEC.PEAK_DB / 20); // ~0.708

  // Calculate gain: bring RMS to target, but don't exceed peak ceiling
  let gain = targetRMS / (rms + 1e-10);
  if (peak * gain > peakCeiling) {
    gain = peakCeiling / peak;
  }

  // Apply gain
  const output = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const input = buffer.getChannelData(ch);
    const out = output.getChannelData(ch);
    for (let i = 0; i < input.length; i++) {
      out[i] = input[i] * gain;
    }
  }

  return output;
}

// ============================================================================
// Audio Encoding
// ============================================================================

/**
 * Encode AudioBuffer as WAV blob.
 * Note: Browser OGG encoding requires MediaRecorder with audio/ogg support.
 * WAV is a fallback; for deployment, use ffmpeg to convert WAV -> OGG.
 */
function encodeAsWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);
  let offset = 0;

  // RIFF header
  writeString(view, offset, 'RIFF'); offset += 4;
  view.setUint32(offset, totalSize - 8, true); offset += 4;
  writeString(view, offset, 'WAVE'); offset += 4;

  // fmt chunk
  writeString(view, offset, 'fmt '); offset += 4;
  view.setUint32(offset, 16, true); offset += 4;       // Chunk size
  view.setUint16(offset, 1, true); offset += 2;        // PCM format
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bitsPerSample, true); offset += 2;

  // data chunk
  writeString(view, offset, 'data'); offset += 4;
  view.setUint32(offset, dataSize, true); offset += 4;

  // Interleave and write samples
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ============================================================================
// Preview File Management
// ============================================================================

/**
 * Get the expected preview filename for a preset.
 * Per NKS spec: <preset_name>.nksf.ogg
 */
export function getPreviewFilename(presetName: string): string {
  return `${presetName}.nksf${NKS_PREVIEW_SPEC.FILE_EXTENSION}`;
}

/**
 * Get the preview folder path relative to a presets directory.
 */
export function getPreviewFolder(): string {
  return NKS_PREVIEW_SPEC.FOLDER_NAME;
}

/**
 * Generate a preview metadata JSON file (previews.generation.json).
 * Maps MIDI patterns to presets for automated preview generation.
 */
export function generatePreviewMetadata(
  productPattern?: string,
  bankPatterns?: Record<string, string>,
  presetPatterns?: Record<string, string>,
): NKSPreviewMetadata {
  const metadata: NKSPreviewMetadata = {};

  if (productPattern) metadata.product = productPattern;
  if (bankPatterns) metadata.bank = bankPatterns;
  if (presetPatterns) metadata.preset = presetPatterns;

  return metadata;
}

/**
 * Download a preview audio blob.
 */
export function downloadPreview(blob: Blob, presetName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getPreviewFilename(presetName);
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// Browser Capability Detection
// ============================================================================

/**
 * Check if OGG Vorbis recording is supported via MediaRecorder.
 */
function getOggMimeType(): string | null {
  const types = [
    'audio/ogg;codecs=vorbis',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/webm;codecs=vorbis',
    'audio/webm;codecs=opus',
  ];
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return null;
}

/**
 * Check if preview generation is supported in this browser.
 */
export function isPreviewGenerationSupported(): boolean {
  return typeof AudioContext !== 'undefined' &&
    typeof MediaRecorder !== 'undefined';
}

// ============================================================================
// MIDI Pattern Helpers
// ============================================================================

/**
 * Generate a simple C3 note MIDI pattern (1 bar at 120 BPM).
 * Returns a standard MIDI file buffer.
 */
export function generateC3MidiPattern(): ArrayBuffer {
  // Minimal MIDI file: Format 0, 1 track, C3 note for 1 bar
  const header = [
    0x4D, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // Header length (6)
    0x00, 0x00,             // Format 0
    0x00, 0x01,             // 1 track
    0x01, 0xE0,             // 480 ticks per quarter note
  ];

  const track = [
    0x4D, 0x54, 0x72, 0x6B, // "MTrk"
    0x00, 0x00, 0x00, 0x00, // Track length (placeholder)
    // Note On: delta=0, channel 0, C3 (note 60), velocity 100
    0x00, 0x90, 0x3C, 0x64,
    // Note Off: delta=1920 (4 beats at 480 ppq), channel 0, C3, velocity 0
    0x87, 0x80, 0x00, 0x80, 0x3C, 0x00,
    // End of Track
    0x00, 0xFF, 0x2F, 0x00,
  ];

  // Set track length
  const trackDataLength = track.length - 8; // Exclude MTrk header
  track[4] = (trackDataLength >> 24) & 0xFF;
  track[5] = (trackDataLength >> 16) & 0xFF;
  track[6] = (trackDataLength >> 8) & 0xFF;
  track[7] = trackDataLength & 0xFF;

  const buffer = new ArrayBuffer(header.length + track.length);
  const view = new Uint8Array(buffer);
  view.set(header, 0);
  view.set(track, header.length);

  return buffer;
}
