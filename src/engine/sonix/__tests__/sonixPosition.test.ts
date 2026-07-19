import { describe, it, expect } from 'vitest';
import {
  sonixGlobalRowToPosition,
  SONIX_PATTERN_ROWS,
  SNX_TICKS_PER_ROW,
} from '../sonixPosition';

/**
 * Regression for the SNX/SMUS/TINY playback-cursor drift: the editor cursor used
 * to free-run on a TS scheduler clock at a hardcoded tempo while the native audio
 * played at the file's real tempo. The fix feeds the driver's real grid row
 * (`sonix_get_display_row`) back to the editor; this maps that flat global row to
 * the editor's (row, songPos) exactly as the parser splits patterns (64 rows each).
 */
describe('sonixGlobalRowToPosition', () => {
  it('keeps the pattern height in lock-step with the parser 64-row split', () => {
    expect(SONIX_PATTERN_ROWS).toBe(64);
  });

  it('maps rows inside the first pattern to songPos 0', () => {
    expect(sonixGlobalRowToPosition(0)).toEqual({ row: 0, songPos: 0 });
    expect(sonixGlobalRowToPosition(1)).toEqual({ row: 1, songPos: 0 });
    expect(sonixGlobalRowToPosition(63)).toEqual({ row: 63, songPos: 0 });
  });

  it('advances songPos at each 64-row pattern boundary', () => {
    expect(sonixGlobalRowToPosition(64)).toEqual({ row: 0, songPos: 1 });
    expect(sonixGlobalRowToPosition(130)).toEqual({ row: 2, songPos: 2 });
    expect(sonixGlobalRowToPosition(64 * 5 + 17)).toEqual({ row: 17, songPos: 5 });
  });

  it('clamps invalid inputs to the song start (no negative/NaN rows)', () => {
    expect(sonixGlobalRowToPosition(-5)).toEqual({ row: 0, songPos: 0 });
    expect(sonixGlobalRowToPosition(Number.NaN)).toEqual({ row: 0, songPos: 0 });
    expect(sonixGlobalRowToPosition(Number.POSITIVE_INFINITY)).toEqual({ row: 0, songPos: 0 });
  });

  it('floors fractional rows rather than propagating them into the cursor', () => {
    expect(sonixGlobalRowToPosition(64.9)).toEqual({ row: 0, songPos: 1 });
  });

  // The SNX native counter is a per-CIA-tick value; a display row spans SNX_TICKS_PER_ROW
  // ticks. Dividing here is what makes the SNX cursor scroll at a readable ~8 rows/s and stay
  // in step with the SNX_TICKS_PER_ROW-quantized parser grid (SonixEngine passes ticksPerRow).
  describe('SNX ticks-per-row divisor (readable scroll + parser sync)', () => {
    it('divides the native tick counter by SNX_TICKS_PER_ROW before the divmod', () => {
      expect(SNX_TICKS_PER_ROW).toBe(6);
      // Native tick 0..5 all land on display row 0; tick 6 is row 1.
      expect(sonixGlobalRowToPosition(0, SNX_TICKS_PER_ROW)).toEqual({ row: 0, songPos: 0 });
      expect(sonixGlobalRowToPosition(5, SNX_TICKS_PER_ROW)).toEqual({ row: 0, songPos: 0 });
      expect(sonixGlobalRowToPosition(6, SNX_TICKS_PER_ROW)).toEqual({ row: 1, songPos: 0 });
    });

    it('crosses the pattern boundary at native tick 64*SNX_TICKS_PER_ROW, not tick 64', () => {
      // Tick 64 (undivided, the old fast cursor) would already be songPos 1 — the bug.
      expect(sonixGlobalRowToPosition(64, SNX_TICKS_PER_ROW)).toEqual({ row: 10, songPos: 0 });
      // The real pattern-1 boundary is 64 display rows in = 384 native ticks.
      expect(sonixGlobalRowToPosition(64 * SNX_TICKS_PER_ROW, SNX_TICKS_PER_ROW)).toEqual({
        row: 0,
        songPos: 1,
      });
    });

    it('leaves SMUS/TINY (ticksPerRow = 1) counters untouched', () => {
      expect(sonixGlobalRowToPosition(64, 1)).toEqual({ row: 0, songPos: 1 });
      expect(sonixGlobalRowToPosition(64)).toEqual({ row: 0, songPos: 1 });
    });
  });
});
