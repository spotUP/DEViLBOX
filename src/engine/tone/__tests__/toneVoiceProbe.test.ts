import { describe, it, expect, vi } from 'vitest';
import {
  ToneVoiceProbe, envelopeStageAt, frequencyEnvelopeHz, midiOf, registerVoiceSource, trackToneVoices, untrackToneVoices,
  type ToneVoiceReport,
} from '../toneVoiceProbe';

/** A stub of a Tone Envelope: the value is whatever the test sets, the timings are in seconds. */
const envelope = (attack = 0.1, decay = 0.2, sustain = 0.5, release = 0.4) => ({
  value: 0, attack, decay, sustain, release, getValueAtTime: () => 0,
});

const clock = (start = 10) => {
  let t = start;
  return { now: () => t, set: (v: number) => { t = v; }, advance: (d: number) => { t += d; } };
};

/** A MonoSynth-shaped stub: triggerAttackRelease goes through this.triggerAttack / this.triggerRelease like Tone's. */
function monoStub(env = envelope()) {
  const calls: string[] = [];
  const filterEnvelope = { ...envelope(0.6, 0.2, 0.5, 2), baseFrequency: 200, octaves: 3, exponent: 2 };
  return {
    envelope: env, filterEnvelope, filter: { frequency: { value: 0 } }, calls,
    triggerAttack(note: string, time?: number) { calls.push(`attack ${note} ${time}`); },
    triggerRelease(time?: number) { calls.push(`release ${time}`); },
    triggerAttackRelease(note: string, duration: number, time: number) { this.triggerAttack(note, time); this.triggerRelease(time + duration); },
  };
}

function polyStub(env = envelope()) {
  const voices: Array<{ midi: number; voice: { envelope: ReturnType<typeof envelope> }; released: boolean }> = [];
  return {
    _activeVoices: voices,
    triggerAttack(notes: string | string[], time?: number) {
      for (const n of Array.isArray(notes) ? notes : [notes]) voices.push({ midi: midiOf(n)!, voice: { envelope: { ...env } }, released: false });
      void time;
    },
    triggerRelease(notes: string | string[], time?: number) {
      for (const n of Array.isArray(notes) ? notes : [notes]) { const v = voices.find((e) => e.midi === midiOf(n) && !e.released); if (v) v.released = true; }
      void time;
    },
  };
}

describe('envelopeStageAt (pure)', () => {
  const env = { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.4 };
  it('walks attack, decay, sustain, release, off and reports the time inside the stage', () => {
    expect(envelopeStageAt(9.9, 10, null, env)).toBeNull();
    expect(envelopeStageAt(10.05, 10, null, env)).toEqual({ stage: 'attack', stageElapsed: expect.closeTo(0.05, 6) });
    expect(envelopeStageAt(10.2, 10, null, env)).toEqual({ stage: 'decay', stageElapsed: expect.closeTo(0.1, 6) });
    expect(envelopeStageAt(11, 10, null, env)).toEqual({ stage: 'sustain', stageElapsed: expect.closeTo(0.7, 6) });
    expect(envelopeStageAt(11.2, 10, 11, env)).toEqual({ stage: 'release', stageElapsed: expect.closeTo(0.2, 6) });
    expect(envelopeStageAt(11.5, 10, 11, env)!.stage).toBe('off');
  });
  it('a sustain of 1 has no decay stage, and a release during the attack goes straight to release', () => {
    expect(envelopeStageAt(10.2, 10, null, { ...env, sustain: 1 })!.stage).toBe('sustain');
    expect(envelopeStageAt(10.05, 10, 10.04, env)!.stage).toBe('release');
  });
  it('a release scheduled in the future does not release yet', () => {
    expect(envelopeStageAt(10.5, 10, 12, env)!.stage).toBe('sustain');
  });
});

describe('frequencyEnvelopeHz (Tone FrequencyEnvelope)', () => {
  it('goes from the base to base * 2^octaves along env^exponent', () => {
    expect(frequencyEnvelopeHz(200, 3, 2, 0)).toBe(200);
    expect(frequencyEnvelopeHz(200, 3, 2, 1)).toBe(1600);
    expect(frequencyEnvelopeHz(200, 3, 2, 0.5)).toBeCloseTo(200 + 1400 * 0.25, 6);
  });
});

describe('midiOf', () => {
  it('reads note names and Hz', () => {
    expect(midiOf('C4')).toBe(60);
    expect(midiOf('A#3')).toBe(58);
    expect(midiOf('Db4')).toBe(61);
    expect(midiOf('C-4')).toBe(60);
    expect(midiOf(440)).toBe(69);
    expect(midiOf({})).toBeNull();
  });
});

describe('ToneVoiceProbe with a stub MonoSynth', () => {
  it('reports the stage transitions of a note as the clock advances (attack, decay, sustain, release, off)', () => {
    const c = clock();
    const probe = new ToneVoiceProbe({ now: c.now });
    const synth = monoStub();
    expect(probe.track(7, synth)).toBe(true);
    expect(probe.voice(7)).toBeNull();

    synth.triggerAttackRelease('C4', 1, c.now()); // attack at 10, release scheduled at 11
    const at = (t: number): ToneVoiceReport | null => { c.set(t); synth.envelope.value = 0.25; return probe.voice(7); };
    expect(at(10.05)!.stage).toBe('attack');
    expect(at(10.2)!.stage).toBe('decay');
    const sustain = at(10.6)!;
    expect(sustain.stage).toBe('sustain');
    expect(sustain.elapsedMs).toBeCloseTo(600, 3);
    expect(sustain.level).toBe(0.25); // the voice's Envelope.value, not a model
    expect(at(11.2)!.stage).toBe('release');
    expect(at(11.5)).toBeNull(); // off: 0.4 s release is over
  });

  it('reads the effective cutoff from the voice filter envelope', () => {
    const c = clock();
    const probe = new ToneVoiceProbe({ now: c.now });
    const synth = monoStub();
    probe.track(1, synth);
    synth.triggerAttack('C4', c.now());
    c.advance(0.3);
    synth.filterEnvelope.value = 1;
    expect(probe.voice(1)!.cutoffHz).toBe(1600);
    synth.filterEnvelope.value = 0;
    expect(probe.voice(1)!.cutoffHz).toBe(200);
  });

  it('reads a static filter frequency when the voice has no filter envelope', () => {
    const c = clock();
    const probe = new ToneVoiceProbe({ now: c.now });
    const synth = polyStub();
    const filter = { frequency: { value: 4000 } };
    const wrapper = registerVoiceSource({ triggerAttack: () => {} }, synth, { filter });
    probe.track(2, wrapper);
    synth.triggerAttack('C4', c.now());
    expect(probe.voice(2)!.cutoffHz).toBe(4000);
  });

  it('untrack restores the instrument methods and stops reporting', () => {
    const c = clock();
    const probe = new ToneVoiceProbe({ now: c.now });
    const synth = monoStub();
    const original = synth.triggerAttack;
    probe.track(3, synth);
    expect(synth.triggerAttack).not.toBe(original);
    probe.untrack(synth);
    expect(synth.triggerAttack).toBe(original);
    synth.triggerAttack('C4', c.now());
    expect(probe.voice(3)).toBeNull();
  });

  it('the patched methods still call the original with the same arguments', () => {
    const probe = new ToneVoiceProbe({ now: clock().now });
    const synth = monoStub();
    probe.track(4, synth);
    synth.triggerAttackRelease('E4', 2, 5);
    expect(synth.calls).toEqual(['attack E4 5', 'release 7']);
  });
});

describe('ToneVoiceProbe with a stub PolySynth', () => {
  it('follows the most recent note and its own voice, and a release only ends that note', () => {
    const c = clock();
    const probe = new ToneVoiceProbe({ now: c.now });
    const poly = polyStub();
    probe.track(5, poly);
    poly.triggerAttack('C4', 10);
    c.set(10.5);
    poly.triggerAttack('E4', 10.5);
    c.set(10.7);
    expect(probe.voice(5)!.elapsedMs).toBeCloseTo(200, 3); // the newest note
    poly.triggerRelease('E4', 10.7);
    c.set(10.8);
    expect(probe.voice(5)!.stage).toBe('release'); // E4 releasing
    c.set(11.2);
    const after = probe.voice(5)!; // E4 is over; C4 is still held
    expect(after.stage).toBe('sustain');
    expect(after.elapsedMs).toBeCloseTo(1200, 3);
  });

  it('takes the level from the voice playing that note', () => {
    const c = clock();
    const probe = new ToneVoiceProbe({ now: c.now });
    const poly = polyStub();
    probe.track(6, poly);
    poly.triggerAttack('C4', 10);
    poly.triggerAttack('G4', 10.1);
    poly._activeVoices[0].voice.envelope.value = 0.9;
    poly._activeVoices[1].voice.envelope.value = 0.3;
    c.set(10.15);
    expect(probe.voice(6)!.level).toBe(0.3);
  });
});

describe('ToneVoiceProbe with a stub NoiseSynth', () => {
  it('reads its time-first trigger signature', () => {
    const c = clock();
    const probe = new ToneVoiceProbe({ now: c.now });
    const noise = { noise: {}, envelope: envelope(), triggerAttack: (_t?: number) => {}, triggerRelease: (_t?: number) => {} };
    probe.track(8, noise);
    noise.triggerAttack(10);
    noise.triggerRelease(10.5);
    c.set(10.7);
    expect(probe.voice(8)!.stage).toBe('release');
  });
});

describe('ToneVoiceProbe LFO clock and subscriptions', () => {
  it('reports the phase of a registered free-running LFO from its start time and rate', () => {
    const c = clock(100);
    const probe = new ToneVoiceProbe({ now: c.now });
    const synth = polyStub();
    probe.track(9, registerVoiceSource({ triggerAttack: () => {} }, synth, { lfo: { rateHz: () => 2, startTime: 100 } }));
    synth.triggerAttack('C4', 100);
    c.set(100.625); // 1.25 cycles
    expect(probe.voice(9)!.lfoPhase).toBeCloseTo(0.25, 6);
  });

  it('a DuoSynth-shaped instrument gets its vibrato LFO from vibratoRate', () => {
    const c = clock(0);
    const probe = new ToneVoiceProbe({ now: c.now });
    const duo = { voice0: monoStub(), vibratoRate: { value: 5 }, triggerAttack: (_n: string, _t?: number) => {}, triggerRelease: (_t?: number) => {} };
    probe.track(10, duo);
    duo.triggerAttack('C4', 0);
    c.set(0.1);
    expect(probe.voice(10)!.lfoPhase).toBeCloseTo(0.5, 6);
  });

  it('subscribe delivers reports on each tick, one null when the voice ends, and runs the timer only while subscribed', () => {
    const c = clock();
    const stop = vi.fn();
    let tick: () => void = () => {};
    const schedule = vi.fn((fn: () => void) => { tick = fn; return stop; });
    const probe = new ToneVoiceProbe({ now: c.now, schedule });
    const synth = monoStub();
    probe.track(11, synth);
    const seen: Array<ToneVoiceReport | null> = [];
    const unsubscribe = probe.subscribe(11, (r) => seen.push(r));
    expect(probe.running).toBe(true);
    tick();
    expect(seen).toEqual([]); // nothing sounds: no spam of nulls
    synth.triggerAttackRelease('C4', 0.5, c.now());
    c.advance(0.2); tick();
    c.advance(0.05); tick();
    expect(seen.map((r) => r?.stage)).toEqual(['decay', 'decay']);
    c.advance(1); tick(); tick();
    expect(seen.map((r) => r?.stage)).toEqual(['decay', 'decay', undefined]); // exactly one null
    unsubscribe();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(probe.running).toBe(false);
  });
});

describe('ToneVoiceProbe with a native instrument that reads its own voice (WavetableSynth)', () => {
  it('uses readVoice for level, timings and the filter cutoff', () => {
    const c = clock();
    const probe = new ToneVoiceProbe({ now: c.now });
    const readout = { level: 0.6, env: { attack: 0.01, decay: 0.5, sustain: 0.3, release: 0.2 }, cutoffHz: 3200 };
    const wt = { readVoice: () => readout, triggerAttack: (_n: string, _t?: number) => {}, triggerRelease: (_n: string, _t?: number) => {} };
    probe.track(12, wt);
    wt.triggerAttack('A3', 10);
    c.set(10.2);
    expect(probe.voice(12)).toMatchObject({ stage: 'decay', level: 0.6, cutoffHz: 3200 });
    wt.triggerRelease('A3', 10.3);
    c.set(10.4);
    expect(probe.voice(12)!.stage).toBe('release');
  });
});

describe('engine hooks', () => {
  it('trackToneVoices ignores objects that are not Tone instruments', () => {
    expect(() => trackToneVoices(1, { triggerAttack: () => {} })).not.toThrow();
    expect(() => trackToneVoices(1, null)).not.toThrow();
    expect(() => untrackToneVoices(undefined)).not.toThrow();
  });
});
