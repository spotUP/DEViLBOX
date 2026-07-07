/**
 * SynTrackerParser.ts — SynTracker (Twice/RAVE, 1993)
 *
 * Synthesis-based Amiga tracker format.
 * Module structure (big-endian):
 *   0x0000  "SYNTRACKER-SONG:" magic (16 bytes)
 *   0x0010  u16BE numSamples
 *   0x0012  u16BE maxPatternIndex
 *   0x0014  Song name (null-terminated, ~40 bytes)
 *   0x003C  Author name (null-terminated, ~40 bytes)
 *   0x0214  Sample names (32 bytes × numSamples, null-padded)
 *   0x0614  Position lists (128 bytes × 4 channels, per-channel pattern indices)
 *   0x0800  Pattern data (128 bytes per pattern = 32 rows × 4 bytes per cell)
 *
 * Cell format (4 bytes): note, instrument, effect_cmd (ASCII), effect_value
 *   note: 0 = empty, 1-72 = note index (C-0 through B-5), instrument 0xFF = note-off
 *   effect commands: A=arpeggio, B=position jump, D=porta down, E=envelope,
 *     F=filter, G=glissando, L=set volume, M=modulation, O=offset, S=speed, U=porta up, V=vol+fine
 *
 * Patterns are per-channel: each channel has its own position list selecting independent patterns.
 * Combined into multi-channel tracker patterns by zipping the 4 position lists.
 *
 * UADE eagleplayer.conf: SynTracker  prefixes=st,synmod
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const SYNTRACKER_MAGIC = 'SYNTRACKER-SONG:';
const PATTERN_BASE = 0x0800;
const ROWS_PER_PATTERN = 32;
const BYTES_PER_CELL = 4;
const BYTES_PER_PATTERN = ROWS_PER_PATTERN * BYTES_PER_CELL; // 128
const POSITION_LIST_BASE = 0x0614;
const POSITION_LIST_SIZE = 128; // bytes per channel
const SAMPLE_NAME_BASE = 0x0214;
const SAMPLE_NAME_SIZE = 32;
const NUM_CHANNELS = 4;

function readString(data: Uint8Array, offset: number, maxLen: number): string {
  let end = offset;
  const limit = Math.min(offset + maxLen, data.length);
  while (end < limit && data[end] !== 0) end++;
  const bytes = data.slice(offset, end);
  return String.fromCharCode(...bytes).replace(/[\x00-\x1f]/g, '').trim();
}

export function isSynTrackerFormat(buffer: ArrayBuffer | Uint8Array, filename?: string): boolean {
  // Check magic first
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length >= 16) {
    const magic = String.fromCharCode(...data.slice(0, 16));
    if (magic === SYNTRACKER_MAGIC) return true;
  }
  // Fallback to filename prefix
  if (filename) {
    const base = (filename.split('/').pop() ?? '').toLowerCase();
    if (base.startsWith('synmod.') || base.startsWith('st.')) return true;
  }
  return false;
}

export function parseSynTrackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^(st|synmod)\./i, '') || baseName;

  if (data.length < PATTERN_BASE + BYTES_PER_PATTERN) {
    // Too small for valid SynTracker file — return minimal song
    return buildMinimalSong(moduleName, filename, buffer);
  }

  // Header
  const numSamples = view.getUint16(0x10);
  const songName = readString(data, 0x14, 40);
  const authorName = readString(data, 0x3C, 40);

  // Sample names
  const sampleNames: string[] = [];
  for (let i = 0; i < numSamples; i++) {
    const off = SAMPLE_NAME_BASE + i * SAMPLE_NAME_SIZE;
    sampleNames.push(off < data.length ? readString(data, off, SAMPLE_NAME_SIZE) : '');
  }

  // Position lists (per-channel, 128 bytes each)
  const positionLists: number[][] = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const off = POSITION_LIST_BASE + ch * POSITION_LIST_SIZE;
    positionLists.push(Array.from(data.slice(off, off + POSITION_LIST_SIZE)));
  }

  // Determine song length: find rightmost position where any channel is non-zero,
  // then add 1. Since pattern 0 is valid, also check that ALL channels are zero
  // after the detected end.
  let songLength = 1;
  for (let pos = POSITION_LIST_SIZE - 1; pos >= 0; pos--) {
    if (positionLists.some(list => list[pos] !== 0)) {
      songLength = pos + 1;
      break;
    }
  }

  // Build combined multi-channel patterns from per-channel pattern data.
  // Each song position combines one per-channel pattern from each of the 4 channels.
  const patterns = [];
  for (let pos = 0; pos < songLength; pos++) {
    const channels = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const patIdx = positionLists[ch][pos];
      const patOff = PATTERN_BASE + patIdx * BYTES_PER_PATTERN;
      const rows = [];

      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const cellOff = patOff + row * BYTES_PER_CELL;

        // Bounds check — if pattern data extends past file, emit empty row
        if (cellOff + BYTES_PER_CELL > data.length) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        // Lossless raw SynTracker cell (bijective with the 4 file bytes) so editing + export
        // round-trip byte-exactly. byte0 = note index, byte1 = instrument (0xFF = note-off),
        // byte2 = effect command (ASCII), byte3 = effect value. See SynTrackerExporter.
        rows.push({
          note: data[cellOff],
          instrument: data[cellOff + 1],
          volume: 0,
          effTyp: data[cellOff + 2],
          eff: data[cellOff + 3],
          effTyp2: 0,
          eff2: 0,
        });
      }

      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null, color: null,
        rows,
      });
    }

    patterns.push({
      id: `pattern-${pos}`,
      name: `Position ${pos}`,
      length: ROWS_PER_PATTERN,
      channels,
    });
  }

  // Instruments (display-only — audio comes from UADE)
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < Math.max(numSamples, 1); i++) {
    const name = sampleNames[i] || (i < 16 ? `Synth Wave ${i}` : `Sample ${i}`);
    instruments.push({
      id: i + 1,
      name,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  const displayName = songName || moduleName;
  const fullName = authorName ? `${displayName} — ${authorName}` : displayName;

  return {
    name: `${fullName} [SynTracker]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: Array.from({ length: songLength }, (_, i) => i),
    songLength,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}

function buildMinimalSong(name: string, filename: string, buffer: ArrayBuffer): TrackerSong {
  return {
    name: `${name} [SynTracker]`,
    format: 'MOD' as TrackerFormat,
    patterns: [{
      id: 'pattern-0', name: 'Pattern 0', length: ROWS_PER_PATTERN,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null, color: null,
        rows: Array.from({ length: ROWS_PER_PATTERN }, () => (
          { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }
        )),
      })),
    }],
    instruments: [{ id: 1, name: 'ST Synth 1', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0 } as InstrumentConfig],
    songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: NUM_CHANNELS, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer, uadeEditableFileName: filename,
  };
}
