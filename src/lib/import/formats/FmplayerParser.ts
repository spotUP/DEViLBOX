/**
 * FmplayerParser.ts — PC-98 FMP (PLAY6) format parser
 *
 * Detects FMP format files (.opi, .ovi, .ozi) and creates a TrackerSong
 * with the raw binary data for the FmplayerEngine WASM replayer.
 *
 * FMP is a PC-98 music driver by Turbo that drives the YM2608 (OPNA) chip:
 * 6 FM + 3 SSG + 1 Rhythm + 1 ADPCM + up to 8 PPZ8 channels.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import type { InstrumentConfig, FurnaceConfig } from '@/types/instrument';
import { DEFAULT_FURNACE } from '@/types/instrument';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(id: string, name: string, chNames: string[], rows: number): Pattern {
  return {
    id, name, length: rows,
    channels: chNames.map((chName, i): ChannelData => ({
      id: `ch${i}`, name: chName, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };
}

function readU16LE(buf: Uint8Array, off: number): number {
  return buf[off] | (buf[off + 1] << 8);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NUM_FM     = 6;
const NUM_SSG    = 3;
const NUM_RHYTHM = 1;
const NUM_ADPCM  = 1;
const TOTAL_CH   = NUM_FM + NUM_SSG + NUM_RHYTHM + NUM_ADPCM; // 11

const CHANNEL_NAMES = [
  'FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6',
  'SSG 1', 'SSG 2', 'SSG 3',
  'Rhythm',
  'ADPCM',
];

const ROWS_PER_PAT = 64;

// ── Format Detection ─────────────────────────────────────────────────────────

/**
 * Check if the file is an FMP format file by extension.
 * FMP files use .opi, .ovi, .ozi extensions.
 */
export function isFmplayerFormat(filename: string, _buffer?: ArrayBuffer): boolean {
  return /\.(opi|ovi|ozi)$/i.test(filename);
}

// ── Instrument Builder ───────────────────────────────────────────────────────

function buildInstruments(): InstrumentConfig[] {
  const insts: InstrumentConfig[] = [];
  let id = 1;

  const add = (name: string, synthType: InstrumentConfig['synthType'], chipType: number, ops: number = 4) => {
    insts.push({
      id: id++, name, type: 'synth', synthType,
      furnace: { ...DEFAULT_FURNACE, chipType, ops } as FurnaceConfig,
      effects: [], volume: 0, pan: 0,
    });
  };

  // FM 1-6: YM2608 OPNA FM
  for (let i = 1; i <= NUM_FM; i++) add(`FM ${i}`, 'FmplayerSynth', 1);
  // SSG 1-3: AY-compatible PSG
  for (let i = 1; i <= NUM_SSG; i++) add(`SSG ${i}`, 'FmplayerSynth', 6, 2);
  // Rhythm: OPNA
  add('Rhythm', 'FmplayerSynth', 1);
  // ADPCM: OPNA
  add('ADPCM', 'FmplayerSynth', 1);

  return insts;
}

// ── Parser ───────────────────────────────────────────────────────────────────

export function parseFmplayerFile(buffer: ArrayBuffer, filename?: string): TrackerSong {
  const data = new Uint8Array(buffer);
  const name = filename || 'FMP';
  const displayName = name.replace(/\.[^.]+$/, '');

  // Try to extract title from FMP data (at offset pointed to by first 2 bytes + 4)
  let title = displayName;
  if (data.length >= 2) {
    const titleOffset = readU16LE(data, 0) + 4;
    if (titleOffset > 0 && titleOffset < data.length) {
      // Title is null-terminated CP932 string
      const titleBytes: number[] = [];
      for (let i = titleOffset; i < data.length && data[i] !== 0; i++) {
        titleBytes.push(data[i]);
      }
      if (titleBytes.length > 0) {
        try {
          const decoded = new TextDecoder('shift_jis').decode(new Uint8Array(titleBytes));
          if (decoded.length > 0) title = decoded;
        } catch {
          // Fall back to display name
        }
      }
    }
  }

  const instruments = buildInstruments();

  // Create a placeholder pattern (actual playback is WASM-driven)
  const patterns: Pattern[] = [
    emptyPattern('pat0', 'Pattern 0', CHANNEL_NAMES, ROWS_PER_PAT),
  ];

  return {
    name: title,
    format: 'FMP' as TrackerFormat,
    patterns,
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: TOTAL_CH,
    initialSpeed: 6,
    initialBPM: 125,
    fmplayerFileData: buffer.slice(0),
  };
}
