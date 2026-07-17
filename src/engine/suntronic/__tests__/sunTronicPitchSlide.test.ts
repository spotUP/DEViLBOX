/**
 * Regression: native SunTronic applies the 0x9b pitch-slide opcode (multi-arp-long).
 *
 * Bug (2026-07-17): control opcode 0x9a (`-$66`) read TWO bytes into a fabricated
 * `$32`/`$33` volume-slide counter. The real replayer (DP_Suntronic.s GNN5) reads
 * exactly ONE byte: `MOVE.B (A1)+,$0D`. On multi-arp-long v1 the track row is
 * `… 9a f8 9b 02 00` — the bogus 2nd read swallowed the following `0x9b` opcode, so
 * the pitch slide (`$0A = 0x0200 = +512`) was never set. Voice 1's pitch froze at
 * 3072 and its arp never descended: native periods maxed ~268 where UADE sweeps a
 * ~4-octave descent (periods up to ~2628). The fabricated `$32` counter also gated
 * the volume slide (disasm EFF1/EFF2 applies it every tick, ungated) — same root.
 *
 * Fails-on-revert (restore the 2-byte read → slide stays 0, pitch frozen):
 *  - voice 1 pitch slide becomes +512 and its pitch RAMPS (not frozen at 3072);
 *  - voice 1 reaches the deep-descent periods (max >= 800), not the ~268 ceiling;
 *  - the first three periods are byte-exact vs the UADE RAM oracle (174, 111, 112) —
 *    ticks with no sub-tick DMA phase-hold, so they are not contaminated by the
 *    still-deferred Paula-DMA scheduler drift (stub #3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../SunTronicPlayer';

const CORPUS = join(__dirname, '../../../../public/data/songs/formats/SUNTronicTunes');
const TICKS = 40;
const V = 1;

describe('SunTronic pitch-slide opcode (0x9b) is applied', () => {
  const data = new Uint8Array(readFileSync(join(CORPUS, 'multi-arp-long.src')));
  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player: any = new (SunTronicPlayer as any)(score);
  const pitches: number[] = [];
  const slides: number[] = [];
  const periods: number[] = [];
  for (let t = 0; t < TICKS; t++) {
    const tick = player.stepVblankOnce();
    pitches.push(player.voices[V].pitch & 0xffff);
    slides.push(player.voices[V].pitchSlide);
    periods.push(tick.voices[V].period);
  }

  it('sets voice-1 pitch slide to +512 (was swallowed by the 0x9a 2-byte read)', () => {
    expect(slides[0]).toBe(512); // 0x0200 from `9b 02 00`; reverting → 0
  });

  it('voice-1 pitch ramps instead of freezing at 3072', () => {
    const min = Math.min(...pitches), max = Math.max(...pitches);
    expect(max - min).toBeGreaterThan(4000); // frozen bug → span 0
    expect(new Set(pitches).size).toBeGreaterThan(8);
  });

  it('voice-1 reaches the deep-arp descent (period >= 800, not the ~268 ceiling)', () => {
    expect(Math.max(...periods)).toBeGreaterThanOrEqual(800); // bug maxed ~268
  });

  it('first three periods are byte-exact vs the UADE RAM oracle', () => {
    expect(periods.slice(0, 3)).toEqual([174, 111, 112]);
  });
});
