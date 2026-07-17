/**
 * Regression: the 0x9b pitch-slide operand WIDTH is driver-version-dependent.
 *
 * Bug (2026-07-17): case 0x9b always read a big-endian WORD (2 bytes) for the
 * pitch slide `$0A`. That is correct only for the Main driver (GNN4
 * @DP_Suntronic.s:510, `MOVE.B; LSL.W #8; MOVE.B`). The Version-A driver (GNN4a
 * @1034) reads ONE sign-extended byte (`MOVE.B (A1)+,D0; EXT.W D0`). The same
 * arpShift split that governs the drin table governs this operand.
 *
 * On every Version-A song a word-read (a) scales the slide ~256x — Suntronic-13
 * voice 2's stream byte 0x7f becomes 0x7fXX (~32000) instead of +127, so the
 * pitch wraps through the [0,0x4800) window every tick into garbage / the wrong
 * sign — and (b) swallows the following stream byte, desyncing the whole group.
 * Pre-fix Suntronic-13 v2 slid the WRONG direction (period 91→87→83 descending)
 * where UADE glides 101→103→106… ascending.
 *
 * Fixture: Suntronic-13 (Version-A, arpShift 3), voice 2. Fails-on-revert
 * (restore the unconditional word-read → slide becomes a ~32k value, the pitch
 * wraps, and the anchor periods no longer match the UADE oracle):
 *  - the per-tick slide is a single signed byte (|slide| < 256), here +127;
 *  - the period glides monotonically UP (ascending portamento), never wrapping;
 *  - at the three UADE AUD2PER write ticks the native period is byte-exact vs the
 *    Paula log oracle (119 @ t6, 146 @ t13, 179 @ t20) — these are the sub-tick
 *    anchors where native and UADE coincide, so they are not contaminated by the
 *    still-deferred Paula-DMA phase drift (stub #3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../SunTronicPlayer';

const CORPUS = join(__dirname, '../../../../public/data/songs/formats/SUNTronicTunes');
const TICKS = 24;
const V = 2;

describe('SunTronic pitch-slide operand width is driver-version-aware (0x9b)', () => {
  const data = new Uint8Array(readFileSync(join(CORPUS, 'Suntronic-13')));
  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player: any = new (SunTronicPlayer as any)(score);

  it('parses Suntronic-13 as a Version-A (arpShift 3) module', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((score as any).arpShift).toBe(3);
  });

  const slides: number[] = [];
  const periods: number[] = [];
  for (let t = 0; t < TICKS; t++) {
    const tick = player.stepVblankOnce();
    slides.push(player.voices[V].pitchSlide);
    periods.push(tick.voices[V].period);
  }

  it('reads the slide as a single signed byte, not a word (|slide| < 256)', () => {
    // word-read of `7f xx` → ~0x7fXX (>= 32512); byte-read → +127
    for (const s of slides) expect(Math.abs(s)).toBeLessThan(256);
    expect(slides[0]).toBe(127);
  });

  it('glides the period monotonically UP (ascending portamento, no wrap)', () => {
    for (let t = 1; t < TICKS; t++) expect(periods[t]).toBeGreaterThanOrEqual(periods[t - 1]);
    expect(periods[TICKS - 1]).toBeGreaterThan(periods[0]);
  });

  it('is byte-exact vs the UADE AUD2PER oracle at the sub-tick anchor ticks', () => {
    expect(periods[6]).toBe(119);
    expect(periods[13]).toBe(146);
    expect(periods[20]).toBe(179);
  });
});
