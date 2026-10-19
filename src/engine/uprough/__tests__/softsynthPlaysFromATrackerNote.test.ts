/**
 * Reachability: a tracker note on an UpRoughSoftsynth instrument reaches the voice. ToneEngine.triggerNote (the
 * tracker's entry point) -> SynthRegistry synth -> voice.render -> an AudioBuffer started on the context. The sentinel
 * proves the render ran; the buffer's level matches voice.render for the same note; a voice param moves the output.
 * Real Web Audio on a context that renders nothing (no device is opened).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type { InstrumentConfig } from '@typedefs/instrument';
import { SOFTSYNTH_RATE, voiceDefaults } from '../softsynthVoice';
import { getSoftsynthVoice } from '../voiceRegistry';
import { resetSoftsynthRenderCount, softsynthRenderCount } from '../UpRoughSoftsynth';

type Engine = {
  ensureInstrumentReady: (c: InstrumentConfig) => Promise<void>;
  getInstrument: (id: number, c: InstrumentConfig, ch?: number) => { output: { context: Record<string, unknown> } };
  triggerNote: (id: number, note: string, dur: number, time: number, vel: number, c: InstrumentConfig) => void;
};
let engine: Engine;

beforeAll(async () => {
  installRealWebAudio();
  await import('@/engine/registry/sdk'); // main.tsx does this at app start
  const { getToneEngine } = await import('../../ToneEngine');
  engine = getToneEngine() as unknown as Engine;
  // The test context never renders, so it stays 'suspended' and getSafeTime would drop the note; only the gate is stubbed.
  (engine as unknown as { isContextActuallyRunning: () => boolean }).isContextActuallyRunning = () => true;
}, 60000);

const rms = (a: ArrayLike<number>): number => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]! * a[i]!; return Math.sqrt(s / a.length); };
const db = (x: number): number => 20 * Math.log10(x);

const cfg = (id: number, voice: string, params: Record<string, number> = {}): InstrumentConfig => ({
  id, name: 'softsynth', type: 'synth', synthType: 'UpRoughSoftsynth', effects: [], volume: -6, pan: 0,
  upRoughSoftsynth: { voice, params: { ...voiceDefaults(getSoftsynthVoice(voice)!), ...params }, seed: 0 },
} as unknown as InstrumentConfig);

/** Play C3 through the tracker entry point; return the buffer the synth started. */
async function playC3(config: InstrumentConfig, dur = 0.5): Promise<Float32Array> {
  await engine.ensureInstrumentReady(config);
  const ctx = engine.getInstrument(config.id, config).output.context as unknown as {
    createBufferSource: () => AudioBufferSourceNode; currentTime: number;
  };
  const captured: AudioBuffer[] = [];
  const orig = ctx.createBufferSource.bind(ctx);
  ctx.createBufferSource = () => {
    const src = orig();
    const start = src.start.bind(src);
    src.start = (...a: Parameters<AudioBufferSourceNode['start']>) => { if (src.buffer) captured.push(src.buffer); start(...a); };
    return src;
  };
  try {
    engine.triggerNote(config.id, 'C3', dur, ctx.currentTime + 0.01, 1, config);
  } finally {
    ctx.createBufferSource = orig;
  }
  expect(captured.length, 'the synth started a buffer').toBe(1);
  expect(captured[0]!.sampleRate).toBe(SOFTSYNTH_RATE);
  return Float32Array.from(captured[0]!.getChannelData(0));
}

describe('a tracker note plays the Up Rough softsynth voice', () => {
  it.each(['bass808', 'piano'])('%s: the note renders (sentinel) and the buffer is the voice render within 3 dB', async (voiceId) => {
    const config = cfg(910 + voiceId.length, voiceId);
    resetSoftsynthRenderCount();
    const buf = await playC3(config);
    expect(softsynthRenderCount()).toBe(1);
    const voice = getSoftsynthVoice(voiceId)!;
    const ref = voice.render(voiceDefaults(voice), { midi: 36, durSec: 0.5, velocity: 1 }, SOFTSYNTH_RATE, 0);
    expect(rms(buf)).toBeGreaterThan(1e-4);
    expect(Math.abs(db(rms(buf)) - db(rms(ref)))).toBeLessThan(3);
  });

  it('bass808: the decay knob changes what is played', async () => {
    const voice = getSoftsynthVoice('bass808')!;
    // C3 is host note 36, the 808's lowest note (semi 0), where the low-note decay sets the envelope.
    const key = voice.params.find((p) => p.key === 'decay_low_ms')!.key;
    const def = voiceDefaults(voice)[key]!;
    const a = await playC3(cfg(920, 'bass808'));
    const b = await playC3(cfg(921, 'bass808', { [key]: def * 0.25 }));
    const same = a.length === b.length && a.every((v, i) => v === b[i]);
    expect(same, `param ${key} moved the output`).toBe(false);
  });
  it('insert effects: an enabled echo and reverb change the played buffer and extend it by the tail; saturation changes it too', async () => {
    const base = await playC3(cfg(930, 'kick'));
    const sat = await playC3(cfg(931, 'kick', { fx_tapeSaturation: 1 }));
    const wet = await playC3(cfg(932, 'kick', { fx_delay: 1, fx_samplerReverb: 1 }));
    expect(sat.length).toBe(base.length);
    expect(sat.some((v, k) => v !== base[k])).toBe(true);
    expect(wet.length).toBeGreaterThan(base.length + SOFTSYNTH_RATE);
    expect(wet.slice(0, base.length).some((v, k) => v !== base[k])).toBe(true);
    expect(rms(wet.slice(base.length))).toBeGreaterThan(1e-5); // the tail rings
  });

  it('humanize: off repeats the hit exactly, on makes every trigger of the same note differ (hit counter)', async () => {
    const off = cfg(940, 'snare808');
    const a = await playC3(off);
    const b = await playC3(off);
    expect(a.length === b.length && a.every((v, k) => v === b[k])).toBe(true);
    const on = cfg(941, 'snare808', { humanize: 1 });
    const c = await playC3(on);
    const d = await playC3(on);
    expect(c.length === d.length && c.every((v, k) => v === d[k])).toBe(false);
  });
});
