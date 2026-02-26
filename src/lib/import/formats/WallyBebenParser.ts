/**
 * WallyBebenParser.ts — Wally Beben music format parser (WB.* prefix)
 *
 * Detection based on Wally Beben_v1.asm Check2:
 *   - u16BE(buf, 0) === 0x6000  (BRA opcode)
 *   - u16BE(buf, 2) is non-zero, bit 15 clear (positive), bit 0 clear (even)
 *   - u32BE(buf, 4) === 0x48E7FFFE  (MOVEM.L all registers to stack)
 *   - u16BE(buf, 8) === 0x6100  (BSR opcode)
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

const MIN_FILE_SIZE = 10;

export function isWallyBebenFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // BRA opcode at offset 0
  if (u16BE(buf, 0) !== 0x6000) return false;

  // D1 = u16BE(buf, 2): non-zero, bit 15 clear (positive), bit 0 clear (even)
  const d1 = u16BE(buf, 2);
  if (d1 === 0) return false;
  if (d1 & 0x8000) return false;
  if (d1 & 0x0001) return false;

  // MOVEM.L all registers to stack
  if (u32BE(buf, 4) !== 0x48E7FFFE) return false;

  // BSR opcode at offset 8
  if (u16BE(buf, 8) !== 0x6100) return false;

  return true;
}

export function parseWallyBebenFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isWallyBebenFormat(buf)) throw new Error('Not a Wally Beben module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^wb\./i, '') || baseName;

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
    name: `${moduleName} [Wally Beben]`,
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
