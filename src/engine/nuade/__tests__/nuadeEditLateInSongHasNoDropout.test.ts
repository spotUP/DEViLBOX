/**
 * NUADE-SWAP-DROPOUT: an edit three minutes into a song playing on nuade does not stall the audio thread.
 *
 * A live edit hands the worklet the edited module (swapModule). nuade has no player-state copy: the only way to the
 * played position is to open the module again and render forward to it without output, about 1 ms per second already
 * played. Done in one call that blocked the audio thread for 130-230 ms at 3 min (a dropout on every edit). The
 * worklet now catches the new module up across render quanta while the old one keeps playing, and hands over at the
 * same frame.
 *
 * Measured on the real Nuade.worklet.js + Nuade.wasm, per format: a song played to 180 s, then swapModule with the
 * module's own bytes (an unedited swap). Asserted:
 *   - no worklet call (the swapModule message or any process() call while the swap is in flight) does more silent
 *     catch-up rendering than fits in one render quantum (128 frames at 48 kHz = 2.67 ms; a slice is sized to 0.75 ms) at the cost per frame
 *     measured over the whole swap. Counted in frames, not in wall time per call: on a loaded machine a single call's
 *     wall time is preemption noise (spikes of several ms at a load average of 26), which a real-time audio thread
 *     does not have; the wall times are logged;
 *   - the swap completes (swapDone), with no error;
 *   - the output is the unedited run's sample for sample through the whole swap and after it: the old module plays
 *     until the new one has caught up, and the hand-over is at the same frame.
 * That the new module's edits are heard where they were made is nuadeEditsAreHeard.test.ts (src/engine/__tests__).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadSharedWorkletScripts, startWorklet, songBuffer, stereoOutputs, type WorkletMsg, type WorkletProc } from '../../__tests__/workletHarness';

const SR = 48000;
const QUANTUM_MS = (128 / SR) * 1000;
const SWAP_AT_S = 180;
const AFTER_S = 3;

const CASES = [
  { id: 'soundmon', file: 'public/data/songs/formats/antidust.bp3' },
  { id: 'sidmon2', file: 'public/data/songs/formats/bruno_time.sid2' },
];

interface Rig { proc: WorkletProc; send: (m: unknown) => Promise<void>; posted: WorkletMsg[] }

describe('an edit late in a song playing on nuade', () => {
  let rig: Rig;
  beforeAll(async () => {
    loadSharedWorkletScripts();
    rig = await startWorklet('nuade', 'Nuade');
  }, 60_000);

  for (const c of CASES) {
    it(`${c.id}: a swap at 3 min keeps every audio-thread call inside one quantum and the output unbroken`, async () => {
      rig.posted.length = 0;
      await rig.send({ type: 'loadModule', bytes: songBuffer(c.file), playerId: '', fileName: c.file.split('/').pop(), companions: [] });
      expect(rig.posted.find((m) => m.type === 'moduleLoaded' || m.type === 'error')?.type).toBe('moduleLoaded');

      const quantum = (): Float32Array => {
        const out = stereoOutputs(9);
        rig.proc.process([], out);
        const q = new Float32Array(256);
        for (let i = 0; i < 128; i++) { q[2 * i] = out[0]![0]![i]!; q[2 * i + 1] = out[0]![1]![i]!; }
        return q;
      };
      const swapQuanta = Math.round((SWAP_AT_S * SR) / 128);
      const afterQuanta = Math.round((AFTER_S * SR) / 128);

      // Run A: unedited, the reference from 180 s on.
      await rig.send({ type: 'stop' });
      await rig.send({ type: 'play' });
      for (let q = 0; q < swapQuanta; q++) quantum();
      const a: Float32Array[] = [];
      for (let q = 0; q < afterQuanta; q++) a.push(quantum());

      // Run B: the same, and at 180 s the module is swapped for its own bytes.
      await rig.send({ type: 'stop' });
      await rig.send({ type: 'play' });
      for (let q = 0; q < swapQuanta; q++) quantum();
      const mark = rig.posted.length;
      // Silent catch-up rendering, counted per worklet call: nuade_seek on the playing song, or the next song's advance.
      const m = (rig.proc as unknown as { module: Record<string, (...a: number[]) => number> }).module;
      const seek = m._nw_seek!, advance = m._nw_next_advance;
      let silentFrames = 0, silentMs = 0;
      const timed = (fn: () => number, framesOf: (r: number) => number): number => {
        const t0 = performance.now();
        const r = fn();
        silentMs += performance.now() - t0;
        silentFrames += framesOf(r);
        return r;
      };
      m._nw_seek = (frame: number) => { const at = m._nw_position!(); return timed(() => seek(frame), () => Math.abs(m._nw_position!() - at)); };
      if (advance) m._nw_next_advance = (target: number, max: number) => { const at = m._nw_next_position!(); return timed(() => advance(target, max), (r) => Math.abs(r - at)); };
      const perCall: number[] = [];
      let t = performance.now();
      await rig.send({ type: 'swapModule', bytes: songBuffer(c.file) });
      const sendMs = performance.now() - t;
      perCall.push(silentFrames);
      const b: Float32Array[] = [];
      let maxProcessMs = 0, doneAt = -1;
      for (let q = 0; q < afterQuanta; q++) {
        const before = silentFrames;
        t = performance.now();
        b.push(quantum());
        const ms = performance.now() - t;
        if (doneAt < 0) { maxProcessMs = Math.max(maxProcessMs, ms); perCall.push(silentFrames - before); }
        if (doneAt < 0 && rig.posted.slice(mark).some((msg) => msg.type === 'swapDone')) doneAt = q;
      }
      m._nw_seek = seek;
      if (advance) m._nw_next_advance = advance;
      const after = rig.posted.slice(mark);
      expect(after.filter((m) => m.type === 'error')).toEqual([]);
      if (doneAt < 0 && after.some((m) => m.type === 'swapDone')) doneAt = 0; // swapped inside the message
      expect(doneAt, 'the swap completed within 3 s').toBeGreaterThanOrEqual(0);
      const handoverMs = ((doneAt + 1) * 128 * 1000) / SR;
      const msPerFrame = silentMs / Math.max(1, silentFrames);
      const worstCallMs = Math.max(...perCall) * msPerFrame;
      console.info(`[nuadeSwapLate] ${c.id}: at ${SWAP_AT_S} s swapModule message ${sendMs.toFixed(1)} ms wall, max process() ${maxProcessMs.toFixed(2)} ms wall; silent catch-up ${silentFrames} frames at ${(msPerFrame * SR).toFixed(2)} ms per second of song, most in one call ${Math.max(...perCall)} frames = ${worstCallMs.toFixed(2)} ms; handed over after ${doneAt + 1} quanta (${handoverMs.toFixed(0)} ms of audio)`);
      expect(silentFrames, 'the edited module was rendered up to the played frame').toBeGreaterThanOrEqual(SWAP_AT_S * SR - 128);

      let first = -1;
      for (let q = 0; q < afterQuanta && first < 0; q++) {
        for (let i = 0; i < 256; i++) if (a[q]![i] !== b[q]![i]) { first = q * 128 + (i >> 1); break; }
      }
      expect(first, `B left A ${(first / SR).toFixed(3)} s after the swap`).toBe(-1);
      expect(Math.max(...a.map((q) => Math.max(...q.map(Math.abs)))), 'the song still plays at 3 min').toBeGreaterThan(0.001);
      expect(worstCallMs, 'the most silent catch-up work in one audio-thread call (ms)').toBeLessThan(QUANTUM_MS);
      await rig.send({ type: 'stop' });
    }, 120_000);
  }
});
