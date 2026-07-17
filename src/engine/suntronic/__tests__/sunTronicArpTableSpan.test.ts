/**
 * Regression: the drin arp note-transpose table spans the full byte-valued arpSel
 * range, not just 16 selectors.
 *
 * Bug (2026-07-17): both the parser (SunTronicV13.ts) and the player
 * (SunTronicPlayer.ts) sized drin as `(1 << arpShift) * 16` — 128 bytes on
 * Version-A, 256 on Main — which only covers arpSel 0..15. But arpSel is a full
 * byte: the 0x9c opcode reads a raw operand, and the replayer raw-indexes module
 * RAM at `d5 = (arpSel << shift) + phase` with no bound (EFFECTSa @DP_Suntronic.s
 * :910-930). suntronic-k3 / suntronic-k4 voice 0 use arpSel=17 → d5 = (17<<3)+phase
 * = 136..143, all out of range of the 128-byte slice → `drin[d5] ?? 0` = 0 → the
 * arp offset vanished. Native held one note and only crept with the pitch slide
 * (period 360→364→369…) where UADE sweeps the arp (360→486→657→891→1203→2204→2987).
 *
 * Fix: parser extracts `256 << arpShift` bytes (2048 Version-A / 4096 Main) bounded
 * by hunk#1; player uses that table verbatim instead of copying only 128/256.
 *
 * Fixture: suntronic-k3 (Version-A, arpShift 3), voice 0 (arpSel 17). Fails-on-revert
 * (either truncation → the arpSel=17 row is out of range → flat slide, no sweep):
 *  - the parser's drin table is the full 2048-byte span, and the arpSel=17 row is a
 *    real transpose ramp (drin[136..143] = 0,-5,-10,-15,-20,-25,-30,-35);
 *  - native voice 0 sweeps the arp: the first eight periods reach the deep values
 *    (>= 2900), never the ~400 slide-only ceiling;
 *  - the sweep is byte-exact vs the UADE AUD0PER oracle (period 2204 @ t6, 2987 @ t7).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../SunTronicPlayer';

const CORPUS = join(__dirname, '../../../../public/data/songs/formats/SUNTronicTunes');
const V = 0;

describe('SunTronic drin arp table spans the full byte-valued arpSel range', () => {
  const data = new Uint8Array(readFileSync(join(CORPUS, 'suntronic-k3.src')));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const score: any = parseSunTronicV13Score(data);

  it('extracts the full 2048-byte drin span with the arpSel=17 transpose ramp', () => {
    expect(score.arpShift).toBe(3);
    expect(score.drin.length).toBe(2048); // was 128 (16 selectors) → arpSel 17 unreachable
    // arpSel=17 row: d5 base = 17<<3 = 136; phases 0..7 = a linear −5/step ramp.
    const row = Array.from(score.drin.subarray(136, 144));
    expect(row).toEqual([0, -5, -10, -15, -20, -25, -30, -35]);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player: any = new (SunTronicPlayer as any)(score);
  const periods: number[] = [];
  for (let t = 0; t < 8; t++) periods.push(player.stepVblankOnce().voices[V].period);

  it('sweeps the arp (period reaches the deep values, not the ~400 slide ceiling)', () => {
    expect(Math.max(...periods)).toBeGreaterThanOrEqual(2900); // truncated bug maxed ~400
  });

  it('is byte-exact vs the UADE AUD0PER oracle across the sweep', () => {
    expect(periods).toEqual([360, 486, 657, 891, 1203, 1632, 2204, 2987]);
  });
});
