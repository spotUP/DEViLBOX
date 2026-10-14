/**
 * Soloing one channel of a song playing on nuade leaves the meters of the muted channels at silence (owner bug
 * 2026-10-14: SoundMon on nuade, solo one channel, the muted channels' VU meters kept moving). Measured on the real
 * worklet + WASM: every column's meter level over a run, with column 0 soloed. SoundMon (columns reversed against the
 * mixer voices) and Rob Hubbard (identity mapping) both.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadSharedWorkletScripts, startWorklet, songBuffer, stereoOutputs, type WorkletProc, type WorkletMsg } from '../../__tests__/workletHarness';

const CASES = [
  { id: 'soundmon', file: 'public/data/songs/formats/antidust.bp3' },
  { id: 'robhubbard', file: 'public/data/songs/formats/centurion_battle.rh' },
];

interface Rig { proc: WorkletProc; send: (m: unknown) => Promise<void>; posted: WorkletMsg[] }

describe('nuade channel meters under solo', () => {
  let rig: Rig;
  beforeAll(async () => {
    loadSharedWorkletScripts();
    rig = await startWorklet('nuade', 'Nuade');
  }, 60_000);

  for (const c of CASES) {
    it(`${c.id}: soloing column 0 leaves the other columns' meters at silence while column 0 still moves`, async () => {
      rig.posted.length = 0;
      await rig.send({ type: 'loadModule', bytes: songBuffer(c.file), playerId: '', fileName: c.file.split('/').pop(), companions: [] });
      expect(rig.posted.find((m) => m.type === 'moduleLoaded' || m.type === 'error')?.type).toBe('moduleLoaded');
      const run = async (mask: number): Promise<number[]> => {
        await rig.send({ type: 'stop' });
        await rig.send({ type: 'setMuteMask', mask });
        await rig.send({ type: 'play' });
        rig.posted.length = 0;
        for (let i = 0; i < 5000; i++) rig.proc.process([], stereoOutputs(9));
        const peak: number[] = [];
        for (const m of rig.posted) if (m.type === 'vu') ((m as unknown as { levels: number[] }).levels).forEach((l, k) => { peak[k] = Math.max(peak[k] ?? 0, l); });
        return peak;
      };
      const all = await run(0xffffffff);
      expect(all.length).toBe(4);
      expect(all.every((p) => p > 0.01)).toBe(true); // unmuted: every column's meter moves
      const solo = await run(0b0001);
      expect(solo[0]).toBeGreaterThan(0.01);
      expect(solo.slice(1)).toEqual([0, 0, 0]);
    }, 60_000);
  }
});
