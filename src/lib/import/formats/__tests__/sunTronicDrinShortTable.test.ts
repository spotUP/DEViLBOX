import { describe, it, expect } from 'vitest';
import { readFixture } from './sunTestUtil';
import { parseSunTronicV13Score } from '../SunTronicV13';

/**
 * Regression: the drin arp-table acceptance gate rejected any song whose table
 * sits near the end of hunk#1. The old gate required the FULL selector span to
 * fit (`off + (1<<shift)*16 > h1.length` → reject), but the table is legitimately
 * allowed to run short — high arpSel indices are only reachable where module RAM
 * is longer, and the extraction zero-fills past the hunk end (matching UADE's raw
 * read). 22 corpus songs threw "drin arp table signature not found" and were
 * therefore entirely unparseable / uneditable (ghost-note class: heard under the
 * native player, absent from the grid because the parser bailed).
 *
 * time10.src has a drin table that overruns hunk#1 by 163 bytes — under the old
 * gate it throws; under the fix it parses with the tail zero-padded.
 */
describe('SunTronic drin arp table near hunk end (short-table acceptance)', () => {
  it('parses time10.src whose drin table overruns hunk#1 (zero-padded tail)', () => {
    const buf = new Uint8Array(readFixture('time10.src'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let score: any;
    expect(() => { score = parseSunTronicV13Score(buf); }).not.toThrow();

    // Full 256-selector span for MAIN (arpShift 4): 256 << 4 = 4096.
    expect(score.arpShift).toBe(4);
    expect(score.drin.length).toBe(4096);

    // The table start is in-bounds but the span overruns the hunk: the entries
    // past (h1.length - drinOff) must be zero-filled, never read out of the hunk.
    const h1len: number = score.h1.length;
    const drinOff: number = score.drinOff;
    expect(drinOff).toBeGreaterThanOrEqual(0);
    expect(drinOff).toBeLessThan(h1len);
    const inHunk = h1len - drinOff;
    expect(inHunk).toBeLessThan(score.drin.length); // genuinely overruns
    for (let i = inHunk; i < score.drin.length; i++) {
      expect(score.drin[i]).toBe(0);
    }
  });
});
