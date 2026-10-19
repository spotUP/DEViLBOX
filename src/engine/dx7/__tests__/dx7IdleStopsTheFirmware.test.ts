/**
 * An idle DX7 cost 130-205 ms of every audio-thread second (get_audio_worklet_profile, 2026-10-19): process() ran the
 * whole emulated firmware (HD6303 + EGS + OPS) for silence. With no voice keyed or ringing and the output silent the
 * worklet must stop calling the firmware, still wake at once for a note, and keep the release tail.
 * Real VDX7 WASM and stock ROM through the real worklet; skipped without the copyrighted ROM.
 */
import { describe as baseDescribe, it, expect, beforeAll } from 'vitest';
import { HAS_DX7_ROM, startDX7, initVoice, type DX7Rig } from './dx7Harness';

const describe = HAS_DX7_ROM ? baseDescribe : baseDescribe.skip;
let rig: DX7Rig;
let firmwareCalls = 0;
beforeAll(async () => {
  if (!HAS_DX7_ROM) return;
  rig = await startDX7();
  const mod = rig.proc.module as unknown as { _dx7Process: (...a: number[]) => void };
  const real = mod._dx7Process;
  mod._dx7Process = (...a: number[]) => { firmwareCalls++; return real.apply(mod, a); };
}, 60000);

const BLOCKS_PER_SECOND = 375;
const peak = (a: Float32Array): number => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe('DX7 idle cost', () => {
  it('stops running the firmware when silent, wakes for a note, keeps its release tail', async () => {
    await rig.loadVoice(initVoice());
    rig.run(8 * BLOCKS_PER_SECOND);                 // boot window and settle
    const before = firmwareCalls;
    const silence = rig.run(2 * BLOCKS_PER_SECOND);
    expect(peak(silence)).toBe(0);
    expect(firmwareCalls - before).toBe(0);         // nothing sounds: firmware not run at all

    await rig.send({ type: 'noteOn', note: 60, velocity: 100 });
    expect(peak(rig.run(100))).toBeGreaterThan(0.01); // note-on latency unchanged
    await rig.send({ type: 'noteOff', note: 60 });
    const tail = rig.run(BLOCKS_PER_SECOND);
    expect(peak(tail.subarray(0, 2000))).toBeGreaterThan(0.001); // release still sounding
    rig.run(8 * BLOCKS_PER_SECOND);
    const again = firmwareCalls;
    rig.run(BLOCKS_PER_SECOND);
    expect(firmwareCalls - again).toBe(0);          // idles again after the tail
  }, 120000);
});
