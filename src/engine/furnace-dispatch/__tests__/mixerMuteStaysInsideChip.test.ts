/**
 * A DefleMask song plays audibly and unclipped after the mixer re-applies its
 * mutes.
 *
 * After every play() the app calls the mixer's reapplyAllMutes, which sends the
 * dispatch worklet one 'mute' message per mixer channel (16), with no platform.
 * The worklet handed each index to the first chip, and a Game Boy keeps
 * `bool isMuted[4]`: indices 4..15 wrote past the array and the song played
 * silence or garbage (7_grand_cop.dmf, 2026-10-06). Measured on the real worklet
 * and WASM: channels the chip does not have are ignored, a multi-chip song's
 * channels reach the right chip, and the song stays audible.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, stereoOutputs, loadSharedWorkletScripts } from '../../__tests__/workletHarness';

const GB = 6, YM2612 = 20, SMS = 4;

async function rig(chips: number[]) {
  loadSharedWorkletScripts();
  const { proc, send } = await startWorklet('furnace-dispatch', 'FurnaceDispatch');
  for (const c of chips) await send({ type: 'createChip', platformType: c, sampleRate: 48000 });
  return { proc, send };
}

/** RMS of the main output over `blocks` quanta. */
function rms(proc: { process(i: Float32Array[][], o: Float32Array[][]): boolean }, blocks: number): number {
  let sq = 0, n = 0;
  const outs = stereoOutputs(37);
  for (let b = 0; b < blocks; b++) {
    proc.process([], outs);
    for (const ch of outs[0]) for (const v of ch) { sq += v * v; n++; }
  }
  return Math.sqrt(sq / n);
}

describe('mixer mute messages stay inside the chip', () => {
  it('a DefleMask song plays audibly and unclipped after load, stop and play', async () => {
    const { proc, send } = await rig([GB]);
    // The mixer's re-apply: all 16 channels unmuted, no platform named.
    for (let ch = 0; ch < 16; ch++) await send({ type: 'mute', chan: ch, mute: false });
    // Game Boy pulse note on channel 0: C-4, full volume.
    await send({ type: 'dispatch', platformType: GB, cmd: 0, chan: 0, val1: 60, val2: 0 });
    await send({ type: 'dispatch', platformType: GB, cmd: 3, chan: 0, val1: 15, val2: 0 });
    const level = rms(proc, 200);
    expect(level).toBeGreaterThan(0.001);
    expect(level).toBeLessThan(0.9);
  });

  it('ignores a channel the chip does not have, without touching the sequencer', async () => {
    const { proc, send } = await rig([GB]);
    const seq = ((proc as unknown as { wasm: { seqSetMute: (c: number, m: number) => void } }).wasm);
    const calls: number[] = [];
    const orig = seq.seqSetMute;
    seq.seqSetMute = (c, m) => { calls.push(c); orig(c, m); };
    for (const ch of [4, 9, 15, -1]) await send({ type: 'mute', chan: ch, mute: true });
    expect(calls).toEqual([]);
  });

  it('sends a song-wide channel of a two-chip song to its own chip', async () => {
    const { proc } = await rig([YM2612, SMS]);
    const p = proc as unknown as {
      chips: Map<number, { numChannels: number }>;
      resolveMuteTarget(t: number | undefined, c: number): { chip: { platformType: number }; local: number; seqChan: number } | null;
    };
    const first = p.chips.get(YM2612)!.numChannels;
    const second = p.chips.get(SMS)!.numChannels;
    const last = p.resolveMuteTarget(undefined, first - 1)!;
    expect([last.chip.platformType, last.local]).toEqual([YM2612, first - 1]);
    const next = p.resolveMuteTarget(undefined, first + 1)!;
    expect([next.chip.platformType, next.local, next.seqChan]).toEqual([SMS, 1, first + 1]);
    expect(p.resolveMuteTarget(undefined, first + second)).toBeNull();
    expect(p.resolveMuteTarget(SMS, 2)!.seqChan).toBe(first + 2);
  });
});
