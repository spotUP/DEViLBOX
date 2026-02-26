/**
 * MoshPackerParser.ts — Mosh Packer Amiga format detector
 *
 * Mosh Packer is an Amiga music format whose files use the prefix "MOSH."
 * (from Mosh Packer_v1.asm line 47). Detection validates 31 sample headers
 * at bytes 0–247 (each 8 bytes) and confirms the ProTracker 'M.K.' signature
 * at offset 378.
 *
 * Detection (from Mosh Packer_v1.asm):
 *   1. File size >= 382
 *   2. For each of 31 sample headers at offset i*8 (0 <= i < 31):
 *        - Word at i*8+0 as signed int16: bit 15 must be clear (>= 0)
 *        - Word at i*8+2 as signed int16: bit 15 must be clear (>= 0)
 *        - Word at i*8+4: bit 15 must be clear AND value <= 0x40 (volume <= 64)
 *        - Word at i*8+6 as signed int16: bit 15 must be clear (>= 0)
 *   3. u32BE(378) == 0x4D2E4B2E ('M.K.')
 *
 * File prefix: MOSH.*
 *
 * Playback is delegated to UADE (Mosh Packer eagleplayer).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 382;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function isMoshPackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Validate 31 sample headers (each 8 bytes, starting at offset 0)
  for (let i = 0; i < 31; i++) {
    const base = i * 8;
    // Word at base+0: signed int16 must be >= 0 (bit 15 clear)
    if ((u16BE(buf, base + 0) & 0x8000) !== 0) return false;
    // Word at base+2: signed int16 must be >= 0 (bit 15 clear)
    if ((u16BE(buf, base + 2) & 0x8000) !== 0) return false;
    // Word at base+4: bit 15 must be clear AND value <= 0x40 (volume 0–64)
    const vol = u16BE(buf, base + 4);
    if ((vol & 0x8000) !== 0) return false;
    if (vol > 0x40) return false;
    // Word at base+6: signed int16 must be >= 0 (bit 15 clear)
    if ((u16BE(buf, base + 6) & 0x8000) !== 0) return false;
  }

  // 'M.K.' ProTracker signature at offset 378
  if (u32BE(buf, 378) !== 0x4D2E4B2E) return false;

  return true;
}

export function parseMoshPackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isMoshPackerFormat(buf)) throw new Error('Not a Mosh Packer module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^mosh\./i, '') || baseName;

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
    name: `${moduleName} [Mosh Packer]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments,
    songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
