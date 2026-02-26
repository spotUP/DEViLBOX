/**
 * SpecialFXParser.ts — Special FX Amiga music format native parser
 *
 * Special FX (also known as "JD") is a 4-channel Amiga music format. The module
 * begins with a sequence of BRA (branch always) opcodes pointing to the player
 * subroutines, which serves as the format signature.
 *
 * NOTE: This parser handles the Special FX format (UADE prefix "JD.*") and must
 * not be confused with SoundFXParser.ts which handles the unrelated Sound FX
 * format (.sfx files).
 *
 * Detection (from UADE Special FX_v2.asm Check2 routine):
 *   buf.length >= 16
 *   u16BE(buf, 0)  === 0x6000   (BRA opcode at offset 0)
 *   u16BE(buf, 2)  !== 0, bit 15 clear (positive), even
 *   u16BE(buf, 4)  === 0x6000   (BRA opcode at offset 4)
 *   u16BE(buf, 6)  !== 0, bit 15 clear (positive), even
 *   u16BE(buf, 8)  === 0x6000   (BRA opcode at offset 8)
 *   u16BE(buf, 10) !== 0, bit 15 clear (positive), even
 *   u16BE(buf, 12) === 0x6000   (BRA opcode at offset 12)
 *   u16BE(buf, 14) !== 0, bit 15 clear (positive), even
 *
 * File prefix: "JD." (e.g. "JD.songname")
 * Single-file format: music data binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/SpecialFX/...
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 16;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

export function isSpecialFXFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // First BRA opcode
  if (u16BE(buf, 0) !== 0x6000) return false;

  // Branch displacement at offset 2: non-zero, positive (bit 15 clear), even
  const d2 = u16BE(buf, 2);
  if (d2 === 0 || (d2 & 0x8000) !== 0 || (d2 & 1) !== 0) return false;

  // Second BRA opcode
  if (u16BE(buf, 4) !== 0x6000) return false;

  // Branch displacement at offset 6: non-zero, positive (bit 15 clear), even
  const d3 = u16BE(buf, 6);
  if (d3 === 0 || (d3 & 0x8000) !== 0 || (d3 & 1) !== 0) return false;

  // Third BRA opcode
  if (u16BE(buf, 8) !== 0x6000) return false;

  // Branch displacement at offset 10: non-zero, positive (bit 15 clear), even
  const d4 = u16BE(buf, 10);
  if (d4 === 0 || (d4 & 0x8000) !== 0 || (d4 & 1) !== 0) return false;

  // Fourth BRA opcode
  if (u16BE(buf, 12) !== 0x6000) return false;

  // Branch displacement at offset 14: non-zero, positive (bit 15 clear), even
  const d5 = u16BE(buf, 14);
  if (d5 === 0 || (d5 & 0x8000) !== 0 || (d5 & 1) !== 0) return false;

  return true;
}

export function parseSpecialFXFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isSpecialFXFormat(buf)) throw new Error('Not a Special FX module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^jd\./i, '') || baseName;

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
    name: `${moduleName} [Special FX]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments,
    songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
