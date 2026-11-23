/** GoatTracker export options and their validation (rules from MagSID SidLoadAddress.cs). */
export type GtExportFormat = 'sid' | 'prg' | 'bin';

export interface GtExportOptions {
  format: GtExportFormat;
  loadAddress: number;
  zeroPage: number;
}

export const GT_DEFAULT_LOAD_ADDRESS = 0x1000;
export const GT_DEFAULT_ZERO_PAGE = 0xfc;
/** The buffered player keeps two bytes in zero page. */
export const GT_ZERO_PAGE_BYTES = 2;

const MIN_LOAD = 0x0400;
const IO_START = 0xd000;
const IO_END = 0xdfff;

/** Returns an error message, or null when valid. `size` (bytes of player+song) is optional: pass it once known. */
export function validateGtExportOptions(o: Pick<GtExportOptions, 'loadAddress' | 'zeroPage'>, size = 1): string | null {
  const { loadAddress: a, zeroPage: z } = o;
  if (!Number.isInteger(a) || a < 0 || a > 0xffff) return 'Load address must be between $0000 and $FFFF.';
  if (a < MIN_LOAD) return 'Load address must be at least $0400.';
  if (a % 0x100 !== 0) return 'Load address must be on a page boundary ($xx00).';
  const end = a + Math.max(size, 1) - 1;
  if (end > 0xffff) return 'The player would run past $FFFF.';
  if (a <= IO_END && end >= IO_START) return 'The player would overlap the I/O area $D000-$DFFF.';
  if (!Number.isInteger(z) || z < 0x02 || z > 0x100 - GT_ZERO_PAGE_BYTES) {
    return `Zero page address must be between $02 and $${(0x100 - GT_ZERO_PAGE_BYTES).toString(16).toUpperCase()}.`;
  }
  return null;
}
