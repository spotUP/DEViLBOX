import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { walkTonyWilliams } from '../tonyWilliamsWalk';
import { relocateTonyWilliams } from '../tonyWilliamsRelocate';
import { renderFileToSamples } from '../../../../../tools/uade-audit/uadeRenderCore';

const NAME = 'future basketball main.tw';

/** A length-changing edit that keeps every note: repeat a duration command (sticky duration, same value). UADE is the oracle. */
describe('Tony Williams relocation renders the same in UADE', () => {
  it('a duplicated duration command (+2 bytes, tail moved) plays the same samples as the original', async () => {
    const orig = new Uint8Array(readFileSync('public/data/songs/sound-images/' + NAME));
    const walk = walkTonyWilliams(orig, 0)!;
    const ev = walk.events.find((e) => e.cmd.op >= 0xe0)!;
    const dup = Uint8Array.of(ev.cmd.op, ev.cmd.op);
    const r = relocateTonyWilliams(orig, [{ at: ev.cmd.offset, remove: 0, insert: dup }]);
    if ('error' in r) throw new Error(r.error);
    expect(r.data.length).toBe(orig.length + 2);
    const opts = { sampleRate: 44100, seconds: 6 };
    const a = await renderFileToSamples(orig, NAME, opts);
    const b = await renderFileToSamples(r.data, NAME, opts);
    let peak = 0;
    for (let i = 0; i < a.samples.length; i++) peak = Math.max(peak, Math.abs(a.samples[i]!));
    expect(peak).toBeGreaterThan(1e-3);
    expect(b.frames).toBe(a.frames);
    let diff = 0;
    for (let i = 0; i < a.samples.length; i++) diff = Math.max(diff, Math.abs(a.samples[i]! - b.samples[i]!));
    expect(diff).toBeLessThan(1e-4);
  }, 120_000);
});
