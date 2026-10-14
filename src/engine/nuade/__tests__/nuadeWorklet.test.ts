/**
 * NE-2 / NE-7 (worklet side): the real public/nuade/Nuade.worklet.js + Nuade.wasm through the headless worklet harness.
 * Render loop, per-voice buffers to the channel outputs, mute mask, pause, stop rewind.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSharedWorkletScripts, startWorklet, songBuffer, stereoOutputs, ROOT, type WorkletMsg, type WorkletProc } from '../../__tests__/workletHarness';
import { NUADE_IN_MESSAGES, NUADE_OUT_MESSAGES } from '../nuadeProtocol';

const MMDC = 'public/data/songs/formats/captain planet and the planeteers - title.mmdc';

interface Rig { proc: WorkletProc; send: (m: unknown) => Promise<void>; posted: WorkletMsg[] }

async function boot(): Promise<Rig> {
  loadSharedWorkletScripts();
  return startWorklet('nuade', 'Nuade');
}

async function load(rig: Rig, file = MMDC, playerId = 'mmdc'): Promise<WorkletMsg> {
  rig.posted.length = 0;
  await rig.send({ type: 'loadModule', bytes: songBuffer(file), playerId, fileName: file.split('/').pop(), subsong: undefined, companions: [] });
  const msg = rig.posted.find((m) => m.type === 'moduleLoaded' || m.type === 'error');
  expect(msg?.type, JSON.stringify(msg)).toBe('moduleLoaded');
  return msg!;
}

/** Render `quanta` quanta; returns the outputs of the last one plus peak per output over all of them. */
function run(rig: Rig, quanta: number, outputsCount = 9): { peaks: number[]; last: Float32Array[][] } {
  const peaks = new Array<number>(outputsCount).fill(0);
  let out = stereoOutputs(outputsCount);
  for (let q = 0; q < quanta; q++) {
    out = stereoOutputs(outputsCount);
    rig.proc.process([], out);
    out.forEach((o, i) => { for (const ch of o) for (const v of ch) peaks[i] = Math.max(peaks[i]!, Math.abs(v)); });
  }
  return { peaks, last: out };
}

describe('NE-2 Nuade.worklet.js', () => {
  let rig: Rig;
  beforeAll(async () => { rig = await boot(); });

  it('handles exactly the protocol messages and posts only protocol messages', () => {
    const src = readFileSync(join(ROOT, 'public/nuade/Nuade.worklet.js'), 'utf8');
    const handled = [...src.matchAll(/case '(\w+)':/g)].map((m) => m[1]).filter((t) => t !== 'dispose').sort();
    expect(handled).toEqual([...NUADE_IN_MESSAGES].sort());
    const posted = new Set([...src.matchAll(/postMessage\(\{\s*type: '(\w+)'/g)].map((m) => m[1]));
    for (const t of posted) expect(NUADE_OUT_MESSAGES as readonly string[], t).toContain(t);
    expect(src).toContain("registerProcessor('nuade-processor'");
  });

  it('loads an MMDC song on its player and reports voices, subsongs and capabilities', async () => {
    const msg = (await load(rig)) as WorkletMsg & { voices: number; playerId: string; subsongs: number; caps: number };
    expect(msg.playerId).toBe('mmdc');
    expect(msg.voices).toBeGreaterThanOrEqual(4);
    expect(msg.subsongs).toBeGreaterThanOrEqual(1);
    expect(msg.caps).toBe(1); // StateRead only: no write API at the pinned upstream
  });

  it('does not render before play, renders the song after it, and a pause stops the render', async () => {
    await load(rig);
    expect(run(rig, 40).peaks[0]).toBe(0);
    await rig.send({ type: 'play' });
    const playing = run(rig, 400);
    expect(playing.peaks[0]).toBeGreaterThan(0.01);
    await rig.send({ type: 'pause' });
    expect(run(rig, 20).peaks[0]).toBe(0);
  });

  it('sends each voice to its dub output when enabled, and to an isolation slot out of the main mix', async () => {
    await load(rig);
    await rig.send({ type: 'play' });
    expect(run(rig, 300).peaks[5]).toBe(0);                                  // no dub send yet
    // Find a voice that sounds in the mix.
    await rig.send({ type: 'dubChannelEnable', channel: 0 });
    await rig.send({ type: 'dubChannelEnable', channel: 1 });
    await rig.send({ type: 'dubChannelEnable', channel: 2 });
    await rig.send({ type: 'dubChannelEnable', channel: 3 });
    const dub = run(rig, 600);
    const dubPeaks = [5, 6, 7, 8].map((i) => dub.peaks[i]!);
    expect(Math.max(...dubPeaks)).toBeGreaterThan(0.01);
    const mixBefore = dub.peaks[0]!;
    // Isolate voice 0 (slot 0): it leaves output 0 and appears on output 1.
    await load(rig);
    await rig.send({ type: 'play' });
    await rig.send({ type: 'addIsolation', slotIndex: 0, channelMask: 0b1111 });
    const iso = run(rig, 600);
    expect(iso.peaks[1]).toBeGreaterThan(0.01);
    expect(iso.peaks[0]).toBeLessThan(1e-6); // all four voices isolated: the main mix is empty
    expect(mixBefore).toBeGreaterThan(0.01);
    await rig.send({ type: 'removeIsolation', slotIndex: 0 });
    await rig.send({ type: 'dubChannelDisableAll' });
  });

  it('the mute mask silences masked voices: bit set = audible', async () => {
    await load(rig);
    await rig.send({ type: 'play' });
    await rig.send({ type: 'setMuteMask', mask: 0 });
    expect(run(rig, 300).peaks[0]).toBeLessThan(1e-5);
    await rig.send({ type: 'setMuteMask', mask: 0xFFFFFFFF });
    expect(run(rig, 300).peaks[0]).toBeGreaterThan(0.01);
  });

  // Owner 2026-10-14: channels could not be soloed. A voice in an isolation slot (a per-channel insert effect, or a
  // master effect aimed at channels) left the main mix by the isolation mask, and its slot and dub send were fed from
  // the voice buffer, which the shim keeps full for the scopes: the solo's mute never reached it.
  it('a muted voice stays silent on its isolation slot and dub send, so a solo holds with channel effects on', async () => {
    await load(rig);
    await rig.send({ type: 'play' });
    await rig.send({ type: 'addIsolation', slotIndex: 0, channelMask: 0b1111 });
    for (const channel of [0, 1, 2, 3]) await rig.send({ type: 'dubChannelEnable', channel });
    await rig.send({ type: 'setMuteMask', mask: 0 });
    const muted = run(rig, 600);
    for (const i of [0, 1, 5, 6, 7, 8]) expect(muted.peaks[i], `output ${i}`).toBeLessThan(1e-6);
    // A muted voice's scope draws flat (one effective mask feeds mix, slots, sends, meter and scope).
    rig.posted.length = 0;
    run(rig, 100);
    const oscOf = () => rig.posted.filter((m) => m.type === 'oscData') as Array<WorkletMsg & { channels: Int16Array[] }>;
    expect(oscOf().some((m) => m.channels.some((c) => c.some((s) => s !== 0)))).toBe(false);
    // Unmuted (and isolated by channel effects), the same voices are heard on the slot and the sends, and scope again.
    await rig.send({ type: 'setMuteMask', mask: 0xFFFFFFFF });
    rig.posted.length = 0;
    const open = run(rig, 600);
    expect(oscOf().some((m) => m.channels.some((c) => c.some((s) => s !== 0)))).toBe(true);
    expect(open.peaks[1]).toBeGreaterThan(0.01);
    expect(Math.max(...[5, 6, 7, 8].map((i) => open.peaks[i]!))).toBeGreaterThan(0.01);
    await rig.send({ type: 'removeIsolation', slotIndex: 0 });
    await rig.send({ type: 'dubChannelDisableAll' });
  });

  it('stop rewinds to the start of the subsong', async () => {
    await load(rig);
    await rig.send({ type: 'play' });
    run(rig, 200);
    rig.posted.length = 0;
    await rig.send({ type: 'stop' });
    expect(rig.posted.some((m) => m.type === 'stopped')).toBe(true);
    await rig.send({ type: 'play' });
    run(rig, 1);
    const pos = rig.posted.filter((m) => m.type === 'position') as (WorkletMsg & { order: number; row: number; frame: number })[];
    expect(pos.length).toBeGreaterThan(0);
    expect(pos[0]!.frame).toBeLessThan(2000);
  });

  describe('row clip (the row preview plays through the same output code)', () => {
    /** Two voices: voice 0 a constant 0.25 on both sides of the mix, voice 1 a constant 0.5; `fadeFrames` 0 keeps it exact. */
    const clip = (frames: number) => ({
      sampleRate: 48000, frames, startFrame: 0, fadeFrames: 0,
      stereo: Float32Array.from({ length: frames * 2 }, (_, i) => (i % 2 ? -0.1 : 0.1) + Math.floor(i / 2) * 1e-6),
      voices: [new Float32Array(frames).fill(0.25), new Float32Array(frames).fill(0.5)],
      panSteps: [{ at: 0, pans: new Float32Array([-1, 1]) }],
    });
    const oscOf = (r: Rig) => r.posted.filter((m) => m.type === 'oscData') as Array<WorkletMsg & { channels: Int16Array[] }>;
    const vuOf = (r: Rig) => r.posted.filter((m) => m.type === 'vu') as Array<WorkletMsg & { levels: number[] }>;

    it('comes out of output 0 sample for sample, on a song that was never played', async () => {
      const r = await boot();
      await r.send({ type: 'setMuteMask', mask: 0xFFFFFFFF });
      const c = clip(1000);
      await r.send({ type: 'playRowClip', clip: c });
      const got: number[] = [];
      for (let q = 0; q < 8; q++) {
        const out = stereoOutputs(9);
        r.proc.process([], out);
        for (let i = 0; i < 128; i++) got.push(out[0]![0]![i]!, out[0]![1]![i]!);
      }
      expect(got.slice(0, 2000)).toEqual(Array.from(c.stereo));
      expect(got.slice(2000).every((v) => v === 0)).toBe(true);
      expect(r.posted.map((m) => m.type).filter((t) => t === 'rowClipStarted' || t === 'rowClipDone')).toEqual(['rowClipStarted', 'rowClipDone']);
    });

    it('draws a muted voice flat on its scope and reads 0 on its meter, and the other voice moves', async () => {
      const r = await boot();
      await r.send({ type: 'setMuteMask', mask: 0b10 });               // voice 0 muted, voice 1 audible
      await r.send({ type: 'playRowClip', clip: clip(20000) });
      r.posted.length = 0;
      run(r, 160);
      const osc = oscOf(r);
      expect(osc.length).toBeGreaterThan(0);
      expect(osc.every((m) => m.channels[0]!.every((s) => s === 0)), 'muted voice scope is flat').toBe(true);
      expect(osc.some((m) => m.channels[1]!.some((s) => s !== 0)), 'audible voice scope moves').toBe(true);
      const vu = vuOf(r);
      expect(vu.length).toBeGreaterThan(0);
      expect(vu.every((m) => m.levels[0] === 0)).toBe(true);
      expect(vu.some((m) => (m.levels[1] ?? 0) > 0.4)).toBe(true);
    });

    it('a clip shorter than a scope chunk still reaches the scope when it ends', async () => {
      const r = await boot();
      await r.send({ type: 'setMuteMask', mask: 0xFFFFFFFF });
      await r.send({ type: 'playRowClip', clip: clip(960) });
      r.posted.length = 0;
      run(r, 10);
      const osc = oscOf(r);
      expect(osc).toHaveLength(1);
      expect(osc[0]!.channels[0]!.length).toBe(960);
      expect(osc[0]!.channels[1]!.some((s) => s !== 0)).toBe(true);
    });

    it('is dropped by play, and ignored while the song plays', async () => {
      await load(rig);
      await rig.send({ type: 'setMuteMask', mask: 0xFFFFFFFF });
      await rig.send({ type: 'playRowClip', clip: clip(20000) });
      rig.posted.length = 0;
      await rig.send({ type: 'play' });
      expect((rig.proc as unknown as { clip: { active: boolean } }).clip.active).toBe(false);
      expect(rig.posted.some((m) => m.type === 'rowClipDone')).toBe(true);
      await rig.send({ type: 'playRowClip', clip: clip(20000) });
      expect((rig.proc as unknown as { clip: { active: boolean } }).clip.active, 'no clip over a playing song').toBe(false);
      await rig.send({ type: 'pause' });
    });
  });
});
