/**
 * EarAcheParser — parser for EarAche format (.ea)
 *
 * eagleplayer.conf: EarAche  prefixes=ea  Magic: "EASO"
 * Stub — UADE classic handles audio.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';
import type { Pattern, InstrumentConfig, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeEarAcheCell } from '@/engine/uade/encoders/EarAcheEncoder';
import { decodeMODCell } from '@/engine/uade/encoders/MODEncoder';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

export function isEarAcheFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 4) return false;
  return data[0] === 0x45 && data[1] === 0x41 && data[2] === 0x53 && data[3] === 0x4F;
}

export function parseEarAcheFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const name = filename.replace(/\.[^.]+$/, '').replace(/^[^.]+\./, '');
  const NUM_CHANNELS = 4;
  const ROWS = 64;
  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: ROWS,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `EarAche ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: (ch === 0 || ch === 3) ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: ROWS }, () => emptyCell()),
    })),
  };
  const instruments: InstrumentConfig[] = Array.from({ length: 4 }, (_, i) => ({
    id: i + 1,
    name: `EarAche ${i + 1}`,
    type: 'sample' as const,
    synthType: 'Sampler' as const,
    effects: [],
    volume: -6,
    pan: 0,
  } as InstrumentConfig));

  // Build uadePatternLayout for chip RAM editing
  // EarAche is a stub — pattern data offset is 0 until the format is fully parsed.
  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'earAche',
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: NUM_CHANNELS,
    numPatterns: 1,
    moduleSize: buffer.byteLength,
    encodeCell: encodeEarAcheCell,
    decodeCell: decodeMODCell,
    getCellFileOffset: (pat: number, row: number, channel: number): number => {
      const patternByteSize = ROWS * NUM_CHANNELS * 4;
      return pat * patternByteSize + row * NUM_CHANNELS * 4 + channel * 4;
    },
  };

  return {
    name,
    format: 'MOD' as any,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    uadePatternLayout,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
