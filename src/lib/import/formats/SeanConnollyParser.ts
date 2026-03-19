/**
 * SeanConnollyParser — parser for Sean Connolly EMS format (.scn)
 *
 * Self-contained 68k binary using EMS V3.01/V3.18/V5.xx (4 voices).
 * Stub — extracts title from header; UADE classic handles audio.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';
import type { Pattern, InstrumentConfig, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeSeanConnollyCell } from '@/engine/uade/encoders/SeanConnollyEncoder';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

export function isSeanConnollyFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 16) return false;
  return (data[0] === 0x60 && data[1] === 0x00);
}

export function parseSeanConnollyFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const name = filename.replace(/\.[^.]+$/, '').replace(/^[^.]+\./, '');
  const NUM_CHANNELS = 4;
  const ROWS = 64;
  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: ROWS,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `EMS ${ch + 1}`,
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
    name: `EMS ${i + 1}`,
    type: 'sample' as const,
    synthType: 'Sampler' as const,
    effects: [],
    volume: -6,
    pan: 0,
  } as InstrumentConfig));

  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'seanConnolly',
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: NUM_CHANNELS,
    numPatterns: 1,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSeanConnollyCell,
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
