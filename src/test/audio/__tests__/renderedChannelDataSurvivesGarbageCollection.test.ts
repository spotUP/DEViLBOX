/**
 * A rendered channel kept without its AudioBuffer stays the render (the scratchNullsTheDemo "NaN" flake): with
 * node-web-audio-api the array of `getChannelData` reads memory its AudioBuffer owns, so when only the array is
 * kept and a garbage collection runs, the array read back other data and NaN runs. `installRealWebAudio` makes each
 * array hold its buffer. 30 renders, each followed by forced collections under allocation: none may change.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { installRealWebAudio } from '../realWebAudio';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

describe('rendered channel data outlives its AudioBuffer', () => {
  beforeAll(() => installRealWebAudio());

  it('30 renders kept as the channel array alone read back unchanged after garbage collections', async () => {
    let changed = 0;
    for (let r = 0; r < 30; r++) {
      const ctx = new OfflineAudioContext(1, 26460, 22050);
      const osc = ctx.createOscillator();
      osc.frequency.value = 440 + r;
      osc.connect(ctx.destination);
      osc.start();
      const out = (await ctx.startRendering()).getChannelData(0); // the AudioBuffer itself is dropped here
      const copy = Float32Array.from(out);
      for (let k = 0; k < 5; k++) {
        gc();
        const junk: Float64Array[] = [];
        for (let i = 0; i < 200; i++) junk.push(new Float64Array(30000).fill(r + i));
        await new Promise((res) => setTimeout(res, 5));
      }
      if (out.some((v, i) => !Object.is(v, copy[i]))) changed++;
    }
    expect(changed).toBe(0);
  }, 120_000);
});
