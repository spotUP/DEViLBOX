import type { Pattern } from '@/types/tracker';

/**
 * Scan a pattern for 9xx (sample offset) effects that reference a given instrument.
 * Returns sorted unique offset values (0x00-0xFF).
 */
export function scan9xxOffsets(
  pattern: Pattern,
  instrumentIndex: number,
): number[] {
  const offsets = new Set<number>();

  for (const channel of pattern.channels) {
    for (const cell of channel.rows) {
      // Only consider cells that reference our instrument (or 0 = "current")
      const cellInst = cell.instrument;
      if (cellInst !== 0 && cellInst !== instrumentIndex) continue;

      // Check both effect columns for effect type 0x09 (sample offset)
      if (cell.effTyp === 0x09 && cell.eff > 0) {
        offsets.add(cell.eff);
      }
      if (cell.effTyp2 === 0x09 && cell.eff2 > 0) {
        offsets.add(cell.eff2);
      }
      // Check extended effect columns (Furnace imports)
      for (let i = 3; i <= 8; i++) {
        const typ = (cell as unknown as Record<string, number>)[`effTyp${i}`];
        const param = (cell as unknown as Record<string, number>)[`eff${i}`];
        if (typ === 0x09 && param > 0) {
          offsets.add(param);
        }
      }
    }
  }

  return Array.from(offsets).sort((a, b) => a - b);
}

/**
 * Convert a 9xx offset value to a sample index.
 * 9xx maps to xx * 256 bytes = xx * 128 samples (16-bit).
 */
export function offset9xxToSampleIndex(offsetValue: number): number {
  return offsetValue * 128;
}
