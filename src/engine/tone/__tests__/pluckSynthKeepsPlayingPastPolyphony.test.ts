/**
 * Owner 2026-10-20: "pluck synth silent with no errors". ToneEngine built PluckSynth as a Tone.PolySynth of
 * PluckSynth voices. Tone's PolySynth frees a voice only when the voice fires onsilence, and PluckSynth never does,
 * so after maxPolyphony notes (4 to 16) every later note was dropped with only a Tone warning. Each new voice also
 * made its own comb-filter worklet, whose first note lost the onReady race. ToneEngine now builds PluckSynth through
 * the instrument registry (one plain PluckSynth per tracker channel), like MetalSynth and MembraneSynth.
 * Real Tone on a never-rendered offline context (no device is opened).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type { InstrumentConfig } from '@typedefs/instrument';

type Engine = { getInstrument: (id: number, c: InstrumentConfig, ch?: number) => unknown; disposeInstrument: (id: number) => void };
let engine: Engine;
let ToneNS: typeof import('tone');

beforeAll(async () => {
  installRealWebAudio();
  ToneNS = await import('tone');
  const { getToneEngine } = await import('../../ToneEngine');
  engine = getToneEngine() as unknown as Engine;
}, 60000);

describe('PluckSynth made by ToneEngine', () => {
  it('plays 40 notes in a row without dropping any', () => {
    const id = 731;
    const cfg = { id, synthType: 'PluckSynth', name: 'pluck', volume: -12, pan: 0 } as unknown as InstrumentConfig;
    const inst = engine.getInstrument(id, cfg, 0) as {
      triggerAttack: (n: string, t: number) => void; triggerRelease: (...a: unknown[]) => void;
    };
    expect(inst).toBeTruthy();
    expect(inst).not.toBeInstanceOf(ToneNS.PolySynth);
    const warn = vi.spyOn(console, 'warn');
    const t0 = ToneNS.now();
    for (let i = 0; i < 40; i++) {
      inst.triggerAttack('C4', t0 + i * 0.1);
      inst.triggerRelease('C4', t0 + i * 0.1 + 0.05);
    }
    const dropped = warn.mock.calls.filter((c) => c.some((a) => String(a).includes('Max polyphony exceeded')));
    warn.mockRestore();
    expect(dropped).toEqual([]);
    engine.disposeInstrument(id);
  });
});
