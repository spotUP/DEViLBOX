/**
 * RobHubbardSTParser.ts — Rob Hubbard ST format detection and stub parser
 *
 * Detection (from "Rob Hubbard ST_v2.asm", DTP_Check2):
 *
 *   cmp.l   #$00407F40,(A0)+    → long[0] must be $00407F40; A0 now at offset 4
 *   bne.b   fail
 *   cmp.l   #$00C081C0,(A0)     → long[4] must be $00C081C0 (no advance)
 *   bne.b   fail
 *   cmp.l   #$41FAFFEE,52(A0)   → long at offset 4+52 = 56 must be $41FAFFEE
 *   bne.b   fail
 *
 * All three checks must pass. The constants are 68000 machine code patterns
 * specific to the Rob Hubbard ST player init routine.
 *
 * Minimum file size: 4 + 52 + 4 = 60 bytes (to reach the check at offset 56).
 *
 * Prefix: 'RHO.'
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 60;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Detect Rob Hubbard ST format.
 *
 * Mirrors Check2 in "Rob Hubbard ST_v2.asm":
 *   long[0]  == $00407F40
 *   long[4]  == $00C081C0
 *   long[56] == $41FAFFEE
 */
export function isRobHubbardSTFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  if (u32BE(buf, 0) !== 0x00407F40) return false;
  if (u32BE(buf, 4) !== 0x00C081C0) return false;
  if (u32BE(buf, 56) !== 0x41FAFFEE) return false;

  return true;
}

export function parseRobHubbardSTFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isRobHubbardSTFormat(buf)) throw new Error('Not a Rob Hubbard ST module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^rho\./i, '') || baseName;

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
    name: `${moduleName} [Rob Hubbard ST]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
