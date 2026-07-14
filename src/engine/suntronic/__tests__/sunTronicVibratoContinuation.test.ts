/**
 * Regression: SunTronic continuation note-row vibrato double-advance.
 *
 * On a GNN tick that does NOT retrigger the instrument (an empty/legato
 * continuation row), the SunTronic replayer runs ONE extra vibrato advance
 * before the period compute — so the period is taken from the once-advanced
 * `$24` and the accumulator ends two steps on. Verified against the UADE oracle
 * (tools/suntronic-re/probe-lockstep-poll.ts): gliders voice0 stays byte-exact
 * through the first continuation row only when this extra advance is applied.
 *
 * gliders.src, voice0, first continuation row is native tick 6 (tempoNote 0→1):
 * pre-value vibPhase -17536 → compute at -9536 (depth index 0) → period 252,
 * then post-advance → -1536 (0xfa00 unsigned). Without the extra advance the
 * player computes from -17536 (period 256) and ends at -9536 — this test fails
 * on that revert.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../SunTronicPlayer';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/gliders.src');

describe('SunTronic vibrato continuation double-advance', () => {
  it('computes voice0 period 252 at the first continuation row (gliders tick 6)', () => {
    const score = parseSunTronicV13Score(new Uint8Array(readFileSync(FIXTURE)));
    const player = new SunTronicPlayer(score, { subsong: 0 });

    // ticks 0-5: sustained note, uniform +8000 vibrato advance
    let last = player.tick();
    for (let i = 1; i <= 5; i++) last = player.tick();
    expect(last.voices[0].period).toBe(256); // tick 5, vibPhase 48000 (-17536)

    // tick 6: continuation row → one extra vibrato advance up front
    const t6 = player.tick();
    expect(t6.voices[0].period).toBe(252);        // period from -9536, not -17536 (256)
    expect(player.debugVoice(0).vibPhase & 0xffff).toBe(0xfa00); // -1536: two steps on
  });
});
