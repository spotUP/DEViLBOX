/**
 * Clicks on generated songs: a note-off set an already released voice's gain back to 1 (a step), ramped voices whose
 * start was still scheduled ahead (the note could be silenced), and released every note of the instrument. A release now
 * fades only the started, unreleased voices of its note, from their current level, and stops them.
 * Real UpRoughSoftsynth on Web Audio that renders nothing; the automation calls are recorded per voice.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import { voiceDefaults } from '../softsynthVoice';
import { getSoftsynthVoice } from '../voiceRegistry';
import { UpRoughSoftsynth } from '../UpRoughSoftsynth';

type Voice = { calls: string[]; stops: number[]; started: number | undefined };
let voices: Voice[];
let synth: UpRoughSoftsynth;

beforeAll(async () => {
  installRealWebAudio();
  const { getToneEngine } = await import('../../ToneEngine');
  getToneEngine(); // creates the shared AudioContext the synth reads
}, 60000);

beforeEach(() => {
  const list: Voice[] = (voices = []); // each test's wrappers record into their own list
  const params = voiceDefaults(getSoftsynthVoice('bass808')!);
  synth = new UpRoughSoftsynth({ voice: 'bass808', params, seed: 0 });
  const ctx = synth.output.context as unknown as AudioContext;
  const createGain = ctx.createGain.bind(ctx);
  const createBufferSource = ctx.createBufferSource.bind(ctx);
  let pending: Voice | undefined;
  ctx.createBufferSource = () => {
    if (voices !== list) return createBufferSource(); // a stale wrapper from an earlier test
    const src = createBufferSource();
    const v: Voice = { calls: [], stops: [], started: undefined };
    pending = v;
    list.push(v);
    const stop = src.stop.bind(src);
    src.stop = (t?: number) => { v.stops.push(t as number); stop(t); };
    return src;
  };
  ctx.createGain = () => {
    const g = createGain();
    const v = pending;
    if (v) {
      for (const name of ['setValueAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime', 'linearRampToValueAtTime'] as const) {
        const orig = (g.gain as unknown as Record<string, (...a: number[]) => unknown>)[name];
        if (typeof orig !== 'function') continue;
        (g.gain as unknown as Record<string, unknown>)[name] = (...a: number[]) => { v.calls.push(`${name}(${a.join(',')})`); return orig.apply(g.gain, a); };
      }
    }
    pending = undefined;
    return g;
  };
});

describe('softsynth release never jumps back', () => {
  it('a second release leaves the already released voice untouched', () => {
    synth.triggerAttack('C2', 0);
    synth.triggerRelease('C2', 1);
    const afterFirst = voices[0]!.calls.length;
    synth.triggerRelease('C2', 2);
    expect(voices[0]!.calls.length).toBe(afterFirst);
    expect(voices[0]!.calls.some((c) => c.startsWith('setValueAtTime(1,'))).toBe(false);
  });

  it('a voice that starts after the release time keeps its gain untouched', () => {
    synth.triggerAttack('C2', 5);
    synth.triggerRelease('C2', 1);
    expect(voices[0]!.calls).toEqual([]);
    expect(voices[0]!.stops).toEqual([]);
  });

  it('a released voice is stopped when its fade ends', () => {
    synth.triggerAttack('C2', 0);
    synth.triggerRelease('C2', 1);
    expect(voices[0]!.stops).toEqual([1.05]);
    expect(voices[0]!.calls.some((c) => c.startsWith('linearRampToValueAtTime(0,1.05'))).toBe(true);
  });

  it('a note-specific release leaves another note alone; a note-less release reaches all started voices', () => {
    synth.triggerAttack('C2', 0);
    synth.triggerAttack('E2', 0);
    synth.triggerRelease('C2', 1);
    expect(voices[0]!.stops.length).toBe(1);
    expect(voices[1]!.calls).toEqual([]);
    synth.triggerRelease(undefined, 2);
    expect(voices[1]!.stops.length).toBe(1);
    expect(voices[0]!.stops.length).toBe(1);
  });
});
