/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 * re-rebirth Pattern Filter: the depth (amount) changes the spectrum over time after a half step fires.
 */
import { describe, it, expect } from 'vitest';
import { rms } from '@/engine/tone/__tests__/toneKnobRender';
import { renderEffect, SR } from './fxRender';
import { PCF_WAVES } from '../rebirthPcfWaves';

const SLOT = PCF_WAVES[0].findIndex((v) => v !== null && v > 0.5);

let seed = 1;
const noise = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 0xffffffff) * 2 - 1; };

const brightness = async (amount: number): Promise<number[]> => {
  seed = 1;
  const r = await renderEffect({
    type: 'ReRebirthPatternFilter', parameters: { freq: 0.2, reso: 0.3, amount, decay: 0.6, wave: 0, mode: 1 },
    seconds: 1, source: () => 0.3 * noise(),
    setup: (node) => { (node as unknown as { triggerHalfStep: (s: number, t: number) => void }).triggerHalfStep(SLOT, 0.1); },
  });
  const out: number[] = [];
  for (let t = 0.05; t < 0.9; t += 0.2) out.push(rms(r, t, t + 0.15));
  return out;
};

describe('re-rebirth Pattern Filter through the registry', () => {
  it('depth changes the level over time vs depth zero', async () => {
    const flat = await brightness(0);
    const deep = await brightness(1);
    const diff = flat.reduce((s, v, i) => s + Math.abs(v - deep[i]), 0);
    expect(diff).toBeGreaterThan(0.02);
    expect(SR).toBeGreaterThan(0);
  }, 60000);
});
