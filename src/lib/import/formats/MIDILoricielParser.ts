/**
 * MIDILoricielParser.ts — MIDI Loriciel format detection and stub parser
 *
 * Detection (from "MIDI - Loriciel_v1.asm", DTP_Check2):
 *
 *   cmp.l   #'MThd',(A0)+    → first 4 bytes must be 'MThd'
 *   bne.b   fail
 *   moveq   #6,D1
 *   cmp.l   (A0)+,D1         → next 4 bytes (header length) must == 6
 *   bne.b   fail
 *   cmp.w   #1,(A0)+         → format word: must be 0 or 1 (bhi fails if > 1)
 *   bhi.b   fail
 *   tst.w   (A0)+            → track count word must be != 0
 *   beq.b   fail
 *   tst.w   (A0)+            → division/tempo word must be != 0
 *   beq.b   fail
 *   cmp.l   #'MTrk',(A0)     → next 4 bytes (first track chunk ID) must be 'MTrk'
 *   bne.b   fail
 *
 * This is essentially a MIDI format 0/1 file validator.
 * Minimum file size: 22 bytes (14-byte MThd chunk + 4 bytes for 'MTrk' ID + header overhead).
 *
 * Note: This player plays MIDI files via the Loriciel MIDI engine, NOT standard
 * General MIDI — it uses a proprietary bank on the Amiga.
 *
 * Prefix: 'MIDI.'
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 22;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/** 'MThd' as 32-bit big-endian */
const MAGIC_MTHD = (0x4D << 24 | 0x54 << 16 | 0x68 << 8 | 0x64) >>> 0;
/** 'MTrk' as 32-bit big-endian */
const MAGIC_MTRK = (0x4D << 24 | 0x54 << 16 | 0x72 << 8 | 0x6B) >>> 0;

/**
 * Detect MIDI Loriciel format.
 *
 * Mirrors Check2 in "MIDI - Loriciel_v1.asm":
 *   'MThd' magic → header length == 6 → format <= 1 → tracks > 0 → division > 0 → 'MTrk'
 */
export function isMIDILoricielFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  let off = 0;

  // 'MThd'
  if (u32BE(buf, off) !== MAGIC_MTHD) return false;
  off += 4;

  // header length must be 6
  if (u32BE(buf, off) !== 6) return false;
  off += 4;

  // format: 0 or 1 (bhi fails if > 1)
  if (u16BE(buf, off) > 1) return false;
  off += 2;

  // track count > 0
  if (u16BE(buf, off) === 0) return false;
  off += 2;

  // division (ticks per quarter) > 0
  if (u16BE(buf, off) === 0) return false;
  off += 2;

  // first track chunk must start with 'MTrk'
  if (u32BE(buf, off) !== MAGIC_MTRK) return false;

  return true;
}

export function parseMIDILoricielFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isMIDILoricielFormat(buf)) throw new Error('Not a MIDI Loriciel module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^midi\./i, '') || baseName;

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'Sample 1', type: 'synth' as const,
    synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false,
      solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [MIDI Loriciel]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
