/**
 * PaulSummersParser.ts — Paul Summers music format parser (SNK.* prefix)
 *
 * Detection based on Paul Summers_v2.asm Check2:
 *   - File size > 3000 bytes
 *   - Search starting at offset 650, scanning up to 20 positions (2-byte steps),
 *     for magic longword: u32BE(buf, pos) === 0x46FC2700
 *   - When magic found, verify:
 *     - u16BE(buf, pos+4) === 0x4E73  (RTE opcode)
 *     - The 4 bytes at pos+4 as u32 must be non-zero (tst.l check)
 *   - Continue scanning if the secondary check fails
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

const MIN_FILE_SIZE = 3001;
const SEARCH_START = 650;
const SEARCH_COUNT = 20;
const MAGIC = 0x46FC2700;

export function isPaulSummersFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Search up to SEARCH_COUNT positions at 2-byte steps starting at SEARCH_START
  for (let i = 0; i < SEARCH_COUNT; i++) {
    const pos = SEARCH_START + i * 2;

    // Need at least 8 bytes from pos (4 for magic + 4 for secondary check)
    if (pos + 8 > buf.length) break;

    if (u32BE(buf, pos) !== MAGIC) continue;

    // tst.l (A1)+ — the 4 bytes at pos+4 must be non-zero
    const tstVal = u32BE(buf, pos + 4);
    if (tstVal === 0) continue;

    // RTE opcode at pos+4
    if (u16BE(buf, pos + 4) !== 0x4E73) continue;

    return true;
  }

  return false;
}

export function parsePaulSummersFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isPaulSummersFormat(buf)) throw new Error('Not a Paul Summers module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^snk\./i, '') || baseName;

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
    name: `${moduleName} [Paul Summers]`,
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
