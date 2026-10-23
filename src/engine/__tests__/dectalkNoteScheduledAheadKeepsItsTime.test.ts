/**
 * A DECtalk note scheduled ahead keeps its time. triggerAttack already started the new
 * utterance at `time`, but it set the player gain and stopped the previous utterance at
 * once, so a pattern row scheduled ahead cut the sounding word and changed its level
 * early. The cut and the gain change must land at the note's own time.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { op: string; at?: number; value?: number };
const calls: Call[] = [];
const ctx = { currentTime: 1, createGain: () => makeGain(), createBufferSource: () => makeSource() };

function makeGain() {
  return {
    gain: {
      value: 1,
      cancelScheduledValues: (at: number) => calls.push({ op: 'cancel', at }),
      setValueAtTime: (value: number, at: number) => calls.push({ op: 'gain', at, value }),
    },
    connect: () => undefined,
    disconnect: () => undefined,
  };
}

let sourceId = 0;
function makeSource() {
  const id = ++sourceId;
  return {
    buffer: null as unknown,
    loop: false,
    playbackRate: { value: 1 },
    onended: null as unknown,
    connect: () => undefined,
    disconnect: () => calls.push({ op: `disconnect${id}` }),
    addEventListener: () => undefined,
    start: (at: number) => calls.push({ op: `start${id}`, at }),
    stop: (at: number) => calls.push({ op: `stop${id}`, at }),
  };
}

vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => ctx, noteToMidi: () => 60 }));
vi.mock('@/stores/useSpeechActivityStore', () => ({
  useSpeechActivityStore: { getState: () => ({ speechStart: () => undefined, speechStop: () => undefined }) },
}));

import { DECtalkSynth } from '@/engine/dectalk/DECtalkSynth';

describe('DECtalk note scheduled ahead keeps its time', () => {
  beforeEach(() => {
    calls.length = 0;
    sourceId = 0;
    (globalThis as Record<string, unknown>).Worker = class { postMessage() {} };
  });

  it('cuts the previous utterance and sets the gain at the note time, not now', () => {
    const synth = new DECtalkSynth({ volume: 0.5 });
    (synth as unknown as { _buffer: unknown })._buffer = {};

    synth.triggerAttack(60, 1, 1);
    calls.length = 0;
    synth.triggerAttack(60, 1.5, 0.8);

    expect(calls).toContainEqual({ op: 'stop1', at: 1.5 });
    expect(calls).not.toContainEqual({ op: 'disconnect1' });
    expect(calls).toContainEqual({ op: 'gain', at: 1.5, value: 0.4 });
    expect(calls).toContainEqual({ op: 'start2', at: 1.5 });
  });

  it('a note with no time still cuts and starts now', () => {
    const synth = new DECtalkSynth();
    (synth as unknown as { _buffer: unknown })._buffer = {};

    synth.triggerAttack(60);
    synth.triggerAttack(60);

    expect(calls).toContainEqual({ op: 'stop1', at: 1 });
    expect(calls).toContainEqual({ op: 'disconnect1' });
    expect(calls).toContainEqual({ op: 'start2', at: 1 });
  });
});
