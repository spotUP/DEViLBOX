/**
 * SeanConnollyParser — parser for Sean Connolly EMS format (.scn)
 *
 * Self-contained 68k binary using EMS V3.01/V3.18/V5.xx (4 voices).
 * Extracts metadata from header; UADE classic handles audio.
 *
 * Detection: byte 0 = 0x60 (BRA opcode) — common 68k player stub pattern.
 * The EMS player uses 4 hardware Amiga voices with Amiga-standard L/R panning.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';
import type { Pattern, InstrumentConfig, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeSeanConnollyCell } from '@/engine/uade/encoders/SeanConnollyEncoder';
import { decodeMODCell } from '@/engine/uade/encoders/MODEncoder';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

export function isSeanConnollyFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 16) return false;
  return (data[0] === 0x60 && data[1] === 0x00);
}

export function parseSeanConnollyFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const name = filename.replace(/\.[^.]+$/, '').replace(/^[^.]+\./, '');
  const NUM_CHANNELS = 4;
  const ROWS = 64;

  // ── Scan for sample count / speed hints ───────────────────────────────────
  //
  // EMS players often store a sample count or speed value in the first
  // few words after the BRA displacement. Scan for MOVE.W #imm patterns.

  let sampleCount = NUM_CHANNELS;
  try {
    // BRA displacement at bytes 2-3 tells us where init code starts
    const braDisp = u16BE(buf, 2);
    const initOffset = 2 + braDisp;

    // Scan init code for MOVE.W #imm,Dn to find sample count hints
    if (initOffset > 4 && initOffset < buf.length - 4) {
      for (let off = initOffset; off < Math.min(initOffset + 256, buf.length - 4); off += 2) {
        const op = u16BE(buf, off);
        // MOVE.W #imm,D0..D7
        if ((op & 0xF1FF) === 0x303C) {
          const val = u16BE(buf, off + 2);
          if (val >= 1 && val <= 32) {
            sampleCount = val;
            break;
          }
        }
      }
    }
  } catch {
    // Fall back to default
  }

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
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: NUM_CHANNELS,
      originalPatternCount: 1,
      originalInstrumentCount: sampleCount,
    },
  };

  const instruments: InstrumentConfig[] = Array.from({ length: sampleCount }, (_, i) => ({
    id: i + 1,
    name: `EMS Sample ${i + 1}`,
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
    decodeCell: decodeMODCell,
  };

  return {
    name: `${name} [Sean Connolly EMS]`,
    format: 'MOD' as any,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout,
  };
}
