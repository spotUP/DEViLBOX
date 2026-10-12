/**
 * Scratch bus (owner scratch plan sections 42, 43; D4; ledger SCR-P2.6,
 * SCR-P2.7): the reference `scratch_channel` chain - HP 160, presence
 * 1.5-3 kHz, tanh drive 0.09, delay 0.20 s fb 0.32 mix 0.14, room 0.28,
 * LP 5 kHz, 0.75 headroom - built from Web Audio primitives and measured in
 * an offline render; ambience by role.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';

const SR = 48000;

let createScratchBus: typeof import('../scratchBus').createScratchBus;
let ambienceFor: typeof import('../scratchBus').ambienceFor;
let SCRATCH_BUS: typeof import('../scratchBus').SCRATCH_BUS;

/** The band alone: the reference channel with room 0 and delay 0 (its own parameters). */
async function renderTone(hz: number, ambience: number, amplitude = 0.1, seconds = 0.6): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
  const bus = createScratchBus(ctx, ctx.destination, { room: 0, delayMix: 0 });
  bus.setAmbience(ambience);
  const osc = ctx.createOscillator();
  osc.frequency.value = hz;
  const g = ctx.createGain(); g.gain.value = amplitude;
  osc.connect(g); g.connect(bus.input);
  osc.start(0);
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}

function rms(x: Float32Array, from: number, to: number): number {
  let s = 0; const n = Math.max(1, to - from);
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / n);
}
const dB = (a: number, b: number) => 20 * Math.log10(a / Math.max(b, 1e-12));

async function renderImpulse(ambience: number, seconds = 0.5, opts: { room?: number; delayMix?: number } = { room: 0 }): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
  const bus = createScratchBus(ctx, ctx.destination, opts);
  bus.setAmbience(ambience);
  const buf = ctx.createBuffer(1, 128, SR);
  buf.getChannelData(0)[0] = 0.5;
  const src = ctx.createBufferSource(); src.buffer = buf;
  src.connect(bus.input); src.start(0);
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}

describe('scratch bus (section 42, SCR-P2.6)', () => {
  beforeAll(async () => {
    installRealWebAudio();
    const mod = await import('../scratchBus');
    createScratchBus = mod.createScratchBus;
    ambienceFor = mod.ambienceFor;
    SCRATCH_BUS = mod.SCRATCH_BUS;
  });

  it('carries the reference numbers', () => {
    expect(SCRATCH_BUS.hpHz).toBe(160);
    expect(SCRATCH_BUS.drive).toBe(0.10);
    expect(SCRATCH_BUS.delaySec).toBe(0.20);
    expect(SCRATCH_BUS.feedback).toBe(0.32);
    expect(SCRATCH_BUS.delayMix).toBe(0.16);
    expect(SCRATCH_BUS.tailDelayMix).toBe(0.35);
    expect(SCRATCH_BUS.reverbMix).toBe(0.30);
    expect(SCRATCH_BUS.lpHz).toBe(5000);
    expect(SCRATCH_BUS.headroom).toBe(0.75);
    expect(SCRATCH_BUS.presenceBand).toEqual([1500, 3000]);
  });

  it('HP 160: a 100 Hz tone is >= 12 dB below a 1 kHz tone; LP 5 k: 8 kHz is >= 12 dB below', async () => {
    const from = Math.round(SR * 0.3), to = Math.round(SR * 0.6);
    const r100 = rms(await renderTone(100, 0), from, to);
    const r1k = rms(await renderTone(1000, 0), from, to);
    const r8k = rms(await renderTone(8000, 0), from, to);
    expect(dB(r1k, r100)).toBeGreaterThanOrEqual(12);
    expect(dB(r1k, r8k)).toBeGreaterThanOrEqual(12);
    // 1 kHz passes near unity: the small-signal tanh slope (1 + 3 x 0.10) times 0.75 headroom
    const expected = 0.1 / Math.SQRT2 * (1 + 3 * SCRATCH_BUS.drive) * SCRATCH_BUS.headroom;
    expect(r1k).toBeGreaterThan(expected * 0.8);
    expect(r1k).toBeLessThan(expected * 1.2);
  });

  it('presence: a 2.1 kHz tone sits above 1 kHz by about the reference 0.22 band add (+1 to +2.5 dB)', async () => {
    const from = Math.round(SR * 0.3), to = Math.round(SR * 0.6);
    const r1k = rms(await renderTone(1000, 0), from, to);
    const r2k = rms(await renderTone(2121, 0), from, to);
    expect(dB(r2k, r1k)).toBeGreaterThan(1.0);
    expect(dB(r2k, r1k)).toBeLessThan(2.5);
  });

  it('the channel echoes at 0.20 s at every ambience (louder at 1); the reference dry preset (delay 0) does not', async () => {
    const wet = await renderImpulse(1);
    const ordinary = await renderImpulse(0);
    const dry = await renderImpulse(0, 0.5, { room: 0, delayMix: 0 });
    const win = (x: Float32Array, a: number, b: number) => rms(x, Math.round(SR * a), Math.round(SR * b));
    const echo = win(wet, 0.195, 0.205);
    const before = win(wet, 0.17, 0.19);
    const after = win(wet, 0.21, 0.23);
    expect(echo).toBeGreaterThan(1e-4);
    expect(dB(echo, before)).toBeGreaterThanOrEqual(6);
    expect(dB(echo, after)).toBeGreaterThanOrEqual(6);
    expect(win(dry, 0.195, 0.205)).toBeLessThan(1e-6);
    expect(win(ordinary, 0.195, 0.205)).toBeGreaterThan(1e-5);
    expect(win(ordinary, 0.195, 0.205)).toBeLessThan(echo);
    // the second echo at 0.40 s carries the feedback (0.32, minus the loop damping)
    const echo2 = win(wet, 0.395, 0.405);
    expect(echo2).toBeGreaterThan(1e-5);
    expect(echo2).toBeLessThan(echo * 0.5);
  });

  it('level 0 silences the bus; a disposed bus disconnects', async () => {
    const ctx = new OfflineAudioContext(2, Math.round(SR * 0.3), SR);
    const bus = createScratchBus(ctx, ctx.destination);
    bus.level.value = 0;
    const osc = ctx.createOscillator(); osc.frequency.value = 1000;
    osc.connect(bus.input); osc.start(0);
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(rms(out, 0, out.length)).toBe(0);
    expect(() => bus.dispose()).not.toThrow();
  });
});

describe('ambience by role (section 43, SCR-P2.7)', () => {
  beforeAll(async () => {
    installRealWebAudio();
    ({ ambienceFor } = await import('../scratchBus'));
  });

  it('ordinary <= 0.2 (on top of the always-wet channel), FEATURE 0.5, the final event 1.0', () => {
    for (const role of ['INTRO', 'THEME', 'ANSWER', 'ACCENT', 'FILL', 'TRANSITION', 'OUTRO'] as const) {
      expect(ambienceFor(role)).toBeGreaterThanOrEqual(0);
      expect(ambienceFor(role), role).toBeLessThanOrEqual(0.2);
    }
    expect(ambienceFor('FEATURE')).toBe(0.5);
    expect(ambienceFor('OUTRO', true)).toBe(1.0);
    expect(ambienceFor('ACCENT', true)).toBe(1.0);
    expect(ambienceFor('ACCENT')).toBeLessThan(ambienceFor('FEATURE'));
  });
});
