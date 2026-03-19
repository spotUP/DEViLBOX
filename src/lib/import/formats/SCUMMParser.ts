/**
 * SCUMMParser — parser for LucasArts SCUMM music format (.scumm)
 *
 * Self-contained 68k binary (player + data fused). BRA.W at offset 4.
 * Stub — UADE classic handles audio.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';
import type { Pattern, InstrumentConfig, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeSCUMMCell } from '@/engine/uade/encoders/SCUMMEncoder';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

export function isSCUMMFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 16) return false;
  return data[4] === 0x60;
}

export function parseSCUMMFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const name = filename.replace(/\.[^.]+$/, '').replace(/^[^.]+\./, '');
  const NUM_CHANNELS = 4;
  const ROWS = 64;
  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: ROWS,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `SCUMM ${ch + 1}`,
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
  const instruments: InstrumentConfig[] = Array.from({ length: NUM_CHANNELS }, (_, i) => ({
    id: i + 1,
    name: `SCUMM ${i + 1}`,
    type: 'sample' as const,
    synthType: 'Sampler' as const,
    effects: [],
    volume: -6,
    pan: 0,
  } as InstrumentConfig));

  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'scumm',
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: NUM_CHANNELS,
    numPatterns: 1,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSCUMMCell,
  };

  return {
    name,
    format: 'MOD' as any,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout,
  };
}
