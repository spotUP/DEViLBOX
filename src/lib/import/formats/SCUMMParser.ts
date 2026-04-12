/**
 * SCUMMParser — parser for LucasArts SCUMM music format (.scumm)
 *
 * Self-contained 68k binary (player + data fused). BRA.W at offset 4.
 * The SCUMM music engine uses 4 Amiga hardware voices.
 * UADE classic handles audio playback.
 *
 * Detection: byte at offset 4 = 0x60 (BRA opcode).
 * File prefix: "SCUMM." or extension ".scumm"
 */

import type { TrackerSong } from '@engine/TrackerReplayer';
import type { Pattern, InstrumentConfig, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeSCUMMCell } from '@/engine/uade/encoders/SCUMMEncoder';
import { decodeMODCell } from '@/engine/uade/encoders/MODEncoder';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function isSCUMMFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 16) return false;
  return data[4] === 0x60;
}

export function parseSCUMMFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const name = filename.replace(/\.[^.]+$/, '').replace(/^[^.]+\./, '');
  const NUM_CHANNELS = 4;
  const ROWS = 64;

  // ── Extract metadata from binary ──────────────────────────────────────────
  //
  // The SCUMM format may embed pointers to sound resources after the player
  // code. Scan for resource count hints and sample table references.

  let sampleCount = NUM_CHANNELS;

  try {
    // BRA displacement at offset 5 (byte displacement for BRA.B) or 4-5 (BRA.W)
    // Scan the header area for recognizable pointer tables
    const scanEnd = Math.min(buf.length - 4, 1024);

    // Look for sound resource counts: u16 values that represent instrument counts
    for (let off = 0; off < Math.min(4, buf.length - 2); off += 2) {
      const val = u16BE(buf, off);
      if (val >= 1 && val <= 32) {
        sampleCount = val;
        break;
      }
    }

    // Scan for LEA instructions to find sample table references
    for (let off = 8; off < scanEnd; off += 2) {
      const op = u16BE(buf, off);
      if (op === 0x41FA && off + 4 <= buf.length) {
        const disp = u16BE(buf, off + 2);
        const signedDisp = disp < 0x8000 ? disp : disp - 0x10000;
        const target = off + 2 + signedDisp;
        if (target > 0 && target + 8 <= buf.length) {
          // Try to validate as sample table (u32 offsets)
          let count = 0;
          let soff = target;
          for (let i = 0; i < 32 && soff + 4 <= buf.length; i++) {
            const ptr = u32BE(buf, soff);
            if (ptr === 0 || ptr > buf.length * 4) break;
            count++;
            soff += 4;
          }
          if (count >= 2 && count <= 32) {
            sampleCount = count;
            break;
          }
        }
      }
    }
  } catch {
    // Fall back to defaults
  }

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
    name: `SCUMM Sound ${i + 1}`,
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
    decodeCell: decodeMODCell,
  };

  return {
    name: `${name} [SCUMM]`,
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
