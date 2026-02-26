/**
 * JankoMrsicFlogelParser.ts — Janko Mrsic-Flogel Amiga music format native parser
 *
 * Janko Mrsic-Flogel is a proprietary 4-channel Amiga music format. The module
 * is a compiled 68k executable combining player code and music data into a single
 * self-contained file.
 *
 * Detection (from UADE Janko Mrsic-Flogel_v1.asm Check3 routine, big-endian reads):
 *   u32BE(buf, 0)  === 0x000003F3   (68k HUNK_HEADER magic)
 *   buf[20] !== 0                   (non-zero byte at offset 20)
 *   u32BE(buf, 32) === 0x70FF4E75   (68k MOVEQ #-1,D0 + RTS opcodes)
 *   u32BE(buf, 36) === 0x4A2E464C   (ASCII 'J.FL')
 *   u32BE(buf, 40) === 0x4F47454C   (ASCII 'OGEL')
 *   u32BE(buf, 48) !== 0            (Interrupt pointer)
 *   u32BE(buf, 52) !== 0            (InitSong pointer)
 *   u32BE(buf, 56) !== 0            (Subsongs pointer)
 *
 * File prefix: "JMF." (e.g. "JMF.songname")
 * Single-file format: music data binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/JankoMrsicFlogel/...
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 64;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function isJankoMrsicFlogelFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // 68k HUNK_HEADER magic
  if (u32BE(buf, 0) !== 0x000003F3) return false;

  // Byte at offset 20 must be non-zero
  if (buf[20] === 0) return false;

  // 68k MOVEQ #-1,D0 + RTS opcode pair
  if (u32BE(buf, 32) !== 0x70FF4E75) return false;

  // ASCII 'J.FL'
  if (u32BE(buf, 36) !== 0x4A2E464C) return false;

  // ASCII 'OGEL'
  if (u32BE(buf, 40) !== 0x4F47454C) return false;

  // Interrupt pointer
  if (u32BE(buf, 48) === 0) return false;

  // InitSong pointer
  if (u32BE(buf, 52) === 0) return false;

  // Subsongs pointer
  if (u32BE(buf, 56) === 0) return false;

  return true;
}

export function parseJankoMrsicFlogelFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isJankoMrsicFlogelFormat(buf)) throw new Error('Not a Janko Mrsic-Flogel module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^jmf\./i, '') || baseName;

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
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [Janko Mrsic-Flogel]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments,
    songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
