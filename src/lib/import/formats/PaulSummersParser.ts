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

    // Need at least 4 bytes from pos for magic
    if (pos + 4 > buf.length) break;

    if (u32BE(buf, pos) !== MAGIC) continue;

    // Found magic 0x46FC2700 at pos.
    // Mirroring CheckIt in Paul Summers_v2.asm:
    //   Loop: tst.l (A1) → must be non-zero, cmp.w #$4E73,(A1)+ → if match,
    //         then cmp.w #$41FA,(A1)+ → if match, enter FindLea loop.
    //   A1 starts at pos and advances 2 bytes per CheckIt iteration.
    //   On each iteration, if the long is zero → Fault.
    //   If word is 0x4E73 then check next word for 0x41FA.
    let a1 = pos;
    let found = false;

    // Limit scan to a reasonable window (e.g., 256 bytes forward)
    const scanLimit = Math.min(a1 + 256, buf.length - 4);

    while (a1 < scanLimit) {
      // tst.l (A1) — long at a1 must be non-zero
      if (u32BE(buf, a1) === 0) break; // Fault

      // cmp.w #$4E73,(A1)+
      const w = u16BE(buf, a1);
      a1 += 2;

      if (w === 0x4E73) {
        // cmp.w #$41FA,(A1)+
        if (a1 + 2 > buf.length) break;
        const w2 = u16BE(buf, a1);
        a1 += 2;
        if (w2 === 0x41FA) {
          found = true;
          break;
        }
        // Not 0x41FA — loop back to CheckIt
      }
      // Not 0x4E73 — loop back to CheckIt (tst.l will check from current a1)
    }

    if (found) return true;
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
