/**
 * SteveBarrettParser.ts — Steve Barrett music format parser (SB.* prefix)
 *
 * Detection based on Steve Barrett_v2.asm Check2:
 *   - 4 consecutive BRA instructions at the start (offsets 0, 4, 8, 12):
 *     - u16BE(buf, pos) === 0x6000 (BRA opcode)
 *     - u16BE(buf, pos+2) is non-zero, bit 15 clear (positive), bit 0 clear (even)
 *   - After the 4 BRA instructions (at pos = 16... but spec says check at offset 8
 *     after scanning 4 words of 2 bytes each from offset 0):
 *     - u16BE(buf, 8) === 0x2A7C  (MOVE.L)
 *     - u32BE(buf, 10) === 0x00DFF0A8  (Amiga DMA register)
 *
 * Audio playback is handled by UADE; this parser provides metadata only.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

const MIN_FILE_SIZE = 14;

export function isSteveBarrettFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Scan 4 consecutive BRA instructions at the start, each 4 bytes wide
  let pos = 0;
  for (let i = 0; i < 4; i++) {
    // BRA opcode
    if (u16BE(buf, pos) !== 0x6000) return false;

    // D2 = u16BE(buf, pos+2): non-zero, bit 15 clear (positive), bit 0 clear (even)
    const d2 = u16BE(buf, pos + 2);
    if (d2 === 0) return false;
    if (d2 & 0x8000) return false;
    if (d2 & 0x0001) return false;

    pos += 4;
  }

  // At offset 8: MOVE.L opcode
  if (u16BE(buf, 8) !== 0x2A7C) return false;

  // At offset 10: Amiga DMA register address
  if (u32BE(buf, 10) !== 0x00DFF0A8) return false;

  return true;
}

export function parseSteveBarrettFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isSteveBarrettFormat(buf)) throw new Error('Not a Steve Barrett module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^sb\./i, '') || baseName;

  const instruments: InstrumentConfig[] = [
    {
      id: 1,
      name: 'Sample 1',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    },
  ];

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
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
    name: `${moduleName} [Steve Barrett]`,
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
