/**
 * A song with two systems of one chip type (two AY-3-8910: BossGame final-boss.fur)
 * gets two dispatch chips. Chips were keyed by platform type, so the second AY
 * collapsed into the first: its channels 4-6 played on chip 1 or not at all.
 * Measured on the real worklet and WASM.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, stereoOutputs, loadSharedWorkletScripts } from '../../__tests__/workletHarness';
import { FurnaceDispatchPlatform } from '../platforms';
import { chipKeysFor, chipKeyPlatform } from '../chipKey';

type Proc = { process(i: Float32Array[][], o: Float32Array[][]): boolean; chips: Map<number, { handle: number; platformType: number }> };

describe('two chips of the same type', () => {
  it('chipKeysFor gives repeats their own key and chipKeyPlatform maps back', () => {
    const keys = chipKeysFor([20, 4, 20, 20]);
    expect(new Set(keys).size).toBe(4);
    expect(keys[0]).toBe(20);
    expect(keys.map(chipKeyPlatform)).toEqual([20, 4, 20, 20]);
  });

  it('the worklet creates a second AY with its own handle, and it sounds alone', async () => {
    loadSharedWorkletScripts();
    const { proc, send } = await startWorklet('furnace-dispatch', 'FurnaceDispatch');
    const ay = FurnaceDispatchPlatform.AY8910;
    const [k0, k1] = chipKeysFor([ay, ay]);
    for (const k of [k0, k1]) await send({ type: 'createChip', platformType: k, sampleRate: 48000 });
    const p = proc as unknown as Proc;
    expect(p.chips.size).toBe(2);
    expect(p.chips.get(k1)!.handle).not.toBe(p.chips.get(k0)!.handle);
    expect(p.chips.get(k1)!.platformType).toBe(ay);

    // Note on the second chip's channel 0 only: sound must come out.
    await send({ type: 'dispatch', platformType: k1, cmd: 0, chan: 0, val1: 60, val2: 0 });
    await send({ type: 'dispatch', platformType: k1, cmd: 3, chan: 0, val1: 15, val2: 0 });
    const outs = stereoOutputs(37);
    let sq = 0;
    for (let b = 0; b < 200; b++) { p.process([], outs); for (const v of outs[0][0]) sq += v * v; }
    expect(Math.sqrt(sq / (200 * outs[0][0].length))).toBeGreaterThan(0.0005);
  });
});
