/**
 * Regression: a held DX7 note must stay clean after half a minute of play.
 *
 * The bridge used to run the CPU on a cycles-per-sample budget derived from the float native rate (23.99999937
 * cycles) while the EGS emits one sample every 24 CPU cycles. The drift crossed an instruction boundary after about
 * 32 s, and from then on fillBuffer returned n-1 samples (a zero in the stream) or threw one away every few calls:
 * broadband clicking on every sustained note (doubletrigger.dbx pad, E.PIANO 1, from about 48 s in the browser).
 *
 * A pure sine (init voice, algorithm 32, OP1 only) held for 40 s is smooth sample to sample, so any jump in the
 * second difference well above the steady-state level is a dropped or inserted sample.
 */
import { describe as baseDescribe, it, expect, beforeAll } from 'vitest';
import { HAS_DX7_ROM, startDX7, initVoice, type DX7Rig } from './dx7Harness';

const describe = HAS_DX7_ROM ? baseDescribe : baseDescribe.skip;
let rig: DX7Rig;
beforeAll(async () => { if (HAS_DX7_ROM) rig = await startDX7(); }, 60000);

const SR = 48000;
const BLOCKS_PER_SECOND = SR / 128;

describe('DX7 long play', () => {
  it('a held sine has no dropped or inserted samples after 40 s', async () => {
    await rig.loadVoice(initVoice());
    await rig.send({ type: 'noteOn', note: 69, velocity: 100 });
    const seconds = 40;
    const all = new Float32Array(SR * seconds);
    for (let t = 0; t < seconds; t++) all.set(rig.run(BLOCKS_PER_SECOND), t * SR);
    await rig.send({ type: 'noteOff', note: 69 });
    rig.run(BLOCKS_PER_SECOND * 2);

    const d2 = (i: number): number => Math.abs(all[i + 1] - 2 * all[i] + all[i - 1]);
    // Steady-state reference: seconds 5 to 10, after the attack, before the old drift could reach a boundary.
    let base = 0;
    for (let i = SR * 5; i < SR * 10; i++) base = Math.max(base, d2(i));
    expect(base).toBeGreaterThan(0);
    let clicks = 0;
    for (let i = SR * 5; i < all.length - 1; i++) if (d2(i) > 3 * base) clicks++;
    expect(clicks).toBe(0);
  }, 600000);
});
