/**
 * AmigaUtils.ts — Shared utilities for Amiga tracker format parsers
 *
 * Period table, note mapping, WAV encoding for raw Amiga PCM samples.
 * Used by OktalyzerParser, MEDParser, DigiBoosterParser.
 */

import type { InstrumentConfig } from '@/types/instrument';

// ── Amiga period table (octave 0-5, C to B) ──────────────────────────────
// Standard ProTracker period table. Index 0 = no note, 1-36 = C-1 to B-3
// Periods correspond to PAL Amiga (3546895 Hz / 2 / period = Hz)

const AMIGA_PERIODS = [
  // Octave 1 (C-1 to B-1)
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  // Octave 2 (C-2 to B-2)
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  // Octave 3 (C-3 to B-3)
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Convert an Amiga period value to a note index (1-based, C-0 = 1 in HVL convention,
 * C-1 = 1 in ProTracker convention).
 * Returns 0 if not found or period is 0.
 */
export function periodToNoteIndex(period: number): number {
  if (period === 0) return 0;
  // Find closest period
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < AMIGA_PERIODS.length; i++) {
    const d = Math.abs(AMIGA_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx + 1; // 1-based
}

/**
 * Convert an Oktalyzer/MED note index to a TrackerCell note number.
 * Oktalyzer uses 1-based note index into the period table.
 * XM notes: 1 = C-0. We add 12 (one octave) to match the period table starting at C-1.
 */
export function amigaNoteToXM(amigaNote: number): number {
  if (amigaNote === 0) return 0;
  // ProTracker: index 1 = C-1 (period 856)
  // XM: note 1 = C-0. Octave offset: ProTracker octave 1 → XM octave 1 = note 13
  // So ProTracker note 1 (C-1) → XM note 13 (C-1)
  return amigaNote + 12;
}

// ── 8-bit signed → WAV ArrayBuffer ───────────────────────────────────────

/**
 * Create a WAV ArrayBuffer from raw 8-bit signed Amiga PCM data.
 * @param pcm     - Raw 8-bit signed PCM bytes
 * @param rate    - Sample rate in Hz (default 8287 Hz = Amiga C-3)
 * @param loopStart - Loop start frame (0 = no loop)
 * @param loopEnd   - Loop end frame (0 = no loop)
 */
export function pcm8ToWAV(
  pcm: Uint8Array,
  rate: number = 8287,
  _loopStart: number = 0,
  _loopEnd: number = 0
): ArrayBuffer {
  const numSamples = pcm.length;
  const dataSize = numSamples * 2;   // 16-bit output
  const fileSize = 44 + dataSize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  // RIFF header
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeStr(view, 8, 'WAVE');

  // fmt chunk
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);   // chunk size
  view.setUint16(20, 1, true);    // PCM
  view.setUint16(22, 1, true);    // mono
  view.setUint32(24, rate, true); // sample rate
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true);    // block align
  view.setUint16(34, 16, true);   // bit depth

  // data chunk
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Convert 8-bit signed (two's complement) → 16-bit signed
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    // Reinterpret unsigned byte as signed
    const s8 = (pcm[i] < 128) ? pcm[i] : pcm[i] - 256;
    view.setInt16(offset, s8 * 256, true);
    offset += 2;
  }

  return buf;
}

function writeStr(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Create a Sampler InstrumentConfig from raw 8-bit Amiga PCM data.
 */
export function createSamplerInstrument(
  id: number,
  name: string,
  pcm: Uint8Array,
  volume: number,
  sampleRate: number,
  loopStart: number,
  loopEnd: number
): InstrumentConfig {
  const hasLoop = loopEnd > loopStart && loopEnd > 2;
  const wavBuf = pcm8ToWAV(pcm, sampleRate, loopStart, loopEnd);

  // Convert WAV to base64 data URL so the sample survives project save/reload.
  // Persistence strips sample.audioBuffer (not JSON-serializable) but keeps
  // sample.url strings, and ToneEngine can load data URLs just like blob URLs.
  const wavBytes = new Uint8Array(wavBuf);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < wavBytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(wavBytes.subarray(i, Math.min(i + CHUNK, wavBytes.length))));
  }
  const dataUrl = `data:audio/wav;base64,${btoa(binary)}`;

  return {
    id,
    name: name.replace(/\0/g, '').trim() || `Sample ${id}`,
    type: 'sample' as const,
    synthType: 'Sampler' as const,
    effects: [],
    volume: volume > 0 ? 20 * Math.log10(volume / 64) : -60,
    pan: 0,
    sample: {
      audioBuffer: wavBuf,  // Used as fast-path for the current session
      url: dataUrl,         // Survives save/reload via IndexedDB (string is serializable)
      baseNote: 'C-3',
      detune: 0,
      loop: hasLoop,
      loopType: hasLoop ? 'forward' as const : 'off' as const,
      loopStart: loopStart,
      loopEnd: loopEnd > 0 ? loopEnd : pcm.length,
      sampleRate,
      reverse: false,
      playbackRate: 1.0,
    },
  } as InstrumentConfig;
}
