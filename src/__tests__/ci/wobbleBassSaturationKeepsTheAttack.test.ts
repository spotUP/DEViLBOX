/**
 * The WobbleBass saturation stages pass a note's onset through unchanged in level and time.
 *
 * The bug: both stages were `Tone.Distortion`, whose curve (3+k)·x·20·(π/180)/(π+k·|x|) has a
 * small-signal gain of 3.7× at drive 30 and 4.8× at drive 40 under a ceiling of 0.35. The preset's
 * 5 ms amplitude attack reached that ceiling within ~1 ms, so every note began with a thump, and the
 * stages' 2x oversampling delayed the synth ~2.6 ms each (measured: onset +2.8 ms after one stage,
 * +5.3 ms after two). The stages are now unity-slope tanh WaveShapers without oversampling.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeSaturationCurve, softDriveK, fuzzDriveK } from '@/lib/audio/saturationCurve';

const { WaveShaper, Distortion, Chebyshev, BitCrusher } = vi.hoisted(() => {
  class Node { dispose = () => {}; connect = () => this; }
  class WaveShaper extends Node {
    oversample = 'none';
    curve: Float32Array;
    constructor(curve: Float32Array) { super(); this.curve = curve; }
  }
  class Distortion extends Node {
    opts: unknown;
    constructor(opts: unknown) { super(); this.opts = opts; }
  }
  class Chebyshev extends Node {
    opts: { order: number };
    constructor(opts: { order: number }) { super(); this.opts = opts; }
  }
  class BitCrusher extends Node {
    bits: number;
    constructor(bits: number) { super(); this.bits = bits; }
  }
  return { WaveShaper, Distortion, Chebyshev, BitCrusher };
});
vi.mock('tone', () => ({ WaveShaper, Distortion, Chebyshev, BitCrusher }));

import { createWobbleFilterDrive, createWobbleDistortion } from '../../engine/factories/wobbleBassSaturation';

/** The curve's output for input x (the WaveShaper maps -1..1 across the table). */
const at = (curve: Float32Array, x: number) => curve[Math.round(((x + 1) / 2) * (curve.length - 1))];

/** Small-signal gain of a curve: its slope between ±0.01. */
const smallSignalGain = (curve: Float32Array) => (at(curve, 0.01) - at(curve, -0.01)) / 0.02;

describe('the saturation curve', () => {
  for (const k of [1, softDriveK(30), softDriveK(40), fuzzDriveK(40), 18]) {
    it(`k=${k.toFixed(2)}: unity small-signal gain, ceiling 1/k, symmetric`, () => {
      const c = makeSaturationCurve(k);
      expect(smallSignalGain(c)).toBeCloseTo(1, 1);
      expect(at(c, 1)).toBeLessThanOrEqual(1 / k + 1e-6);
      expect(at(c, 1)).toBeGreaterThan(0.5 / k);
      expect(at(c, -0.7)).toBeCloseTo(-at(c, 0.7), 6);
      expect(Math.abs(at(c, 0))).toBeLessThan(2 / c.length); // the even-length table has no exact zero sample
    });
  }
});

describe('the WobbleBass saturation stages', () => {
  const preset = { enabled: true, drive: 40, tone: 70 } as const;

  it('the filter drive at the preset drive of 30 is a unity-gain shaper without oversampling', () => {
    const stage = createWobbleFilterDrive(30);
    expect(stage).toBeInstanceOf(WaveShaper);
    const shaper = stage as unknown as InstanceType<typeof WaveShaper>;
    expect(shaper.oversample).toBe('none');
    expect(smallSignalGain(shaper.curve)).toBeCloseTo(1, 1);
  });

  it('the filter drive is absent at drive 0', () => {
    expect(createWobbleFilterDrive(0)).toBeNull();
  });

  for (const type of ['soft', 'fuzz'] as const) {
    it(`the '${type}' distortion is a unity-gain shaper without oversampling, never a Tone.Distortion`, () => {
      const stage = createWobbleDistortion({ ...preset, type });
      expect(stage).not.toBeInstanceOf(Distortion);
      expect(stage).toBeInstanceOf(WaveShaper);
      const shaper = stage as unknown as InstanceType<typeof WaveShaper>;
      expect(shaper.oversample).toBe('none');
      expect(smallSignalGain(shaper.curve)).toBeCloseTo(1, 1);
    });
  }

  it("the 'fuzz' stage clips harder than 'soft' at the same drive", () => {
    const soft = (createWobbleDistortion({ ...preset, type: 'soft' }) as unknown as InstanceType<typeof WaveShaper>).curve;
    const fuzz = (createWobbleDistortion({ ...preset, type: 'fuzz' }) as unknown as InstanceType<typeof WaveShaper>).curve;
    expect(at(fuzz, 1)).toBeLessThan(at(soft, 1));
  });

  it("'hard' and 'bitcrush' are unchanged, and a disabled section has no stage", () => {
    expect(createWobbleDistortion({ ...preset, type: 'hard' })).toBeInstanceOf(Chebyshev);
    expect(createWobbleDistortion({ ...preset, type: 'bitcrush' })).toBeInstanceOf(BitCrusher);
    expect(createWobbleDistortion({ ...preset, type: 'soft', enabled: false })).toBeNull();
  });

  // The factory pulls in ~40 synth modules, so its wiring is checked in the source: the WobbleBass
  // builder uses these two stages and builds no Tone.Distortion of its own.
  it('createWobbleBass builds both stages through these helpers and no Tone.Distortion', () => {
    const src = readFileSync(resolve(__dirname, '../../engine/factories/CommunitySynthFactory.ts'), 'utf8');
    const start = src.indexOf('export function createWobbleBass(');
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf('\nexport function ', start + 1);
    const body = src.slice(start, end);
    expect(body).toContain('createWobbleFilterDrive(');
    expect(body).toContain('createWobbleDistortion(');
    expect(body).not.toMatch(/new Tone\.Distortion\(/);
  });
});
