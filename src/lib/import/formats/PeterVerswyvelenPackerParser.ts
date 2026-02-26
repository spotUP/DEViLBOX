/**
 * PeterVerswyvelenPackerParser.ts — Peter Verswyvelen Packer Amiga music format native parser
 *
 * Peter Verswyvelen Packer is a Wanted Team Amiga packed music format. Detection
 * is performed by validating 31 sample header blocks (8 bytes each) followed by
 * a metadata block with pattern count, song length, and a non-decreasing step table.
 *
 * Detection (from UADE Peter Verswyvelen Packer_2.asm Check2 routine):
 *   31 sample headers at offsets i*8 (i=0..30), each 8 bytes:
 *     word 0 at i*8+0: bit 15 clear (non-negative)
 *     word 1 at i*8+2: <= 64 and bit 15 clear
 *     word 2 at i*8+4: bit 15 clear
 *     word 3 at i*8+6: bit 15 clear
 *   At offset 248: patCount — non-zero, bit 15 clear
 *   At offset 250: songLen  — non-zero, bit 15 clear, must be even
 *   At offset 252: val252   — songLen must be strictly less than val252
 *   At offset 254: limit    — non-zero, bit 15 clear
 *   Step table starting at offset 256: (patCount - 2) words, each must be
 *     even, bit 15 clear, <= limit, and non-decreasing
 *
 * File prefix: "PVP."
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/PeterVerswyvelenPacker/Peter Verswyvelen Packer_2.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 260;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

export function isPeterVerswyvelenPackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Validate 31 sample headers, 8 bytes each, at offsets i*8 for i=0..30
  for (let i = 0; i < 31; i++) {
    const base = i * 8;

    // word 0: bit 15 must be clear (value < 0x8000)
    if ((u16BE(buf, base) & 0x8000) !== 0) return false;

    // word 1: must be <= 64 and bit 15 clear
    const w1 = u16BE(buf, base + 2);
    if (w1 > 0x40) return false;
    if ((w1 & 0x8000) !== 0) return false;

    // word 2: bit 15 must be clear
    if ((u16BE(buf, base + 4) & 0x8000) !== 0) return false;

    // word 3: bit 15 must be clear
    if ((u16BE(buf, base + 6) & 0x8000) !== 0) return false;
  }

  // offset 248: patCount — non-zero, bit 15 clear
  const patCount = u16BE(buf, 248);
  if (patCount === 0) return false;
  if ((patCount & 0x8000) !== 0) return false;

  // offset 250: songLen — non-zero, bit 15 clear, must be even
  const songLen = u16BE(buf, 250);
  if (songLen === 0) return false;
  if ((songLen & 0x8000) !== 0) return false;
  if ((songLen & 1) !== 0) return false;

  // offset 252: val252 — songLen must be strictly less than val252
  const val252 = u16BE(buf, 252);
  if (songLen >= val252) return false;

  // offset 254: limit — non-zero, bit 15 clear
  const limit = u16BE(buf, 254);
  if (limit === 0) return false;
  if ((limit & 0x8000) !== 0) return false;

  // Step table at offset 256: (patCount - 2) words
  // Guard against patCount < 2 (would make stepCount negative — skip loop)
  if (patCount >= 2) {
    const stepCount = patCount - 2;
    const stepTableEnd = 256 + stepCount * 2;
    if (buf.length < stepTableEnd) return false;

    for (let i = 0; i < stepCount; i++) {
      const s = u16BE(buf, 256 + i * 2);

      // Each step: bit 15 clear, even, <= limit
      if ((s & 0x8000) !== 0) return false;
      if ((s & 1) !== 0) return false;
      if (s > limit) return false;

      // Non-decreasing: each step must be <= the next step
      if (i < stepCount - 1) {
        const next = u16BE(buf, 258 + i * 2);
        if (s > next) return false;
      }
    }
  }

  return true;
}

export function parsePeterVerswyvelenPackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isPeterVerswyvelenPackerFormat(buf)) throw new Error('Not a Peter Verswyvelen Packer module');

  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const moduleName = baseName.replace(/^pvp\./i, '') || baseName;

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
    name: `${moduleName} [Peter Verswyvelen Packer]`,
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
