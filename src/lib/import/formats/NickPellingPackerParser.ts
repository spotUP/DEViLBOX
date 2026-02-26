/**
 * NickPellingPackerParser.ts — Nick Pelling Packer Amiga music format native parser
 *
 * Nick Pelling Packer is a Wanted Team Amiga packed music format. Files begin
 * with the ASCII magic word "COMP" followed by size metadata that describes
 * the compressed and decompressed payload sizes.
 *
 * Detection (from UADE Nick Pelling Packer_v1.asm Check2 routine):
 *   bytes[0..3] == 'COMP' (0x434F4D50)
 *   word at offset 4 == 0
 *   word at offset 6 (size): >= 16, <= 272, 4-byte aligned
 *   decompressed size at buf[6 + size - 10] must not exceed file length
 *
 * File prefix: "NPP."
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/NickPellingPacker/Nick Pelling Packer_v1.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 10;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function isNickPellingPackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // bytes[0..3] must be ASCII 'COMP'
  if (u32BE(buf, 0) !== 0x434F4D50) return false;

  // word at offset 4 must be zero
  if (u16BE(buf, 4) !== 0) return false;

  // word at offset 6 is the header block size
  const size = u16BE(buf, 6);

  // size must be >= 16, <= 272, and 4-byte aligned
  if (size < 0x10) return false;
  if (size > 0x0110) return false;
  if ((size & 3) !== 0) return false;

  // Need enough bytes to read the decompressed size field
  // decompSize is at buf[6 + size - 10], which is a u32BE requiring 4 bytes
  const decompSizeOff = 6 + size - 10;
  if (buf.length < decompSizeOff + 4) return false;

  const decompSize = u32BE(buf, decompSizeOff);

  // Decompressed size must not exceed the actual file length
  if (decompSize > buf.length) return false;

  return true;
}

export function parseNickPellingPackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isNickPellingPackerFormat(buf)) throw new Error('Not a Nick Pelling Packer module');

  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const moduleName = baseName.replace(/^npp\./i, '') || baseName;

  const instruments: InstrumentConfig[] = [];

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [Nick Pelling Packer]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
