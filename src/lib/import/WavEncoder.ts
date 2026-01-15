/**
 * WavEncoder - Convert PCM data to WAV format
 */

import type { ExtractedSample } from './SampleExtractor';

/**
 * Encode PCM data as WAV and return as base64 data URL
 */
export function encodeWav(sample: ExtractedSample): string {
  const { pcmData, sampleRate, channels } = sample;
  const numSamples = pcmData.length;

  // We'll encode as 16-bit WAV for better quality
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * bytesPerSample;

  // WAV file size: 44 byte header + data
  const fileSize = 44 + dataSize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);  // File size - 8
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);           // fmt chunk size
  view.setUint16(20, 1, true);            // Audio format (1 = PCM)
  view.setUint16(22, channels, true);     // Number of channels
  view.setUint32(24, sampleRate, true);   // Sample rate
  view.setUint32(28, byteRate, true);     // Byte rate
  view.setUint16(32, blockAlign, true);   // Block align
  view.setUint16(34, bitDepth, true);     // Bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);     // Data size

  // Write PCM data as 16-bit signed integers
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    // Clamp to -1 to 1 and convert to 16-bit signed
    const sample = Math.max(-1, Math.min(1, pcmData[i]));
    const int16 = Math.round(sample * 32767);
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  // Convert to base64 data URL
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return `data:audio/wav;base64,${base64}`;
}

/**
 * Helper to write ASCII string to DataView
 */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Encode all samples from extraction result to WAV data URLs
 */
export function encodeSamplesToWav(samples: ExtractedSample[]): string[] {
  return samples.map(sample => encodeWav(sample));
}
