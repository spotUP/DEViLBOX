import { describe, it, expect, vi } from 'vitest';
import {
  VOICE_RECORD_FLOATS, decodeVoices, pickVoice, WasmVoiceHub, registerVoiceHub, subscribeVoiceMarker, type WasmVoice,
} from '../wasmVoiceStatus';

/** A report record: note, stage, level, elapsed, cutoff, filter level, lfo phase, filter stage. */
const rec = (note: number, stage: number, level: number, elapsed: number, cutoff = 0, filterLevel = 0, lfo = 0, fstage = stage): number[] =>
  [note, stage, level, elapsed, cutoff, filterLevel, lfo, fstage];

describe('voice report decoding', () => {
  it('turns 8-float records into voices with stage names and the slot index', () => {
    const voices = decodeVoices(new Float32Array([...rec(60, 0, 0.5, 0.125, 1.5, 0.25, 0.75, 1), ...rec(-1, 4, 0, 0)]));
    expect(voices).toHaveLength(2);
    expect(voices[0]).toMatchObject({ slot: 0, note: 60, stage: 'attack', level: 0.5, elapsedSeconds: 0.125, cutoff: 1.5, filterLevel: 0.25, lfoPhase: 0.75, filterStage: 'decay' });
    expect(voices[1]).toMatchObject({ slot: 1, stage: 'off' });
  });

  it('hands the floats past the eighth of a longer record to extra', () => {
    const voices = decodeVoices(new Float32Array([...rec(60, 2, 1, 0.5), 0.25, 0.5, 0.75, 1, ...rec(64, 2, 1, 0.5), 2, 3, 4, 5]), 12);
    expect(voices).toHaveLength(2);
    expect(voices[0].extra).toEqual([0.25, 0.5, 0.75, 1]);
    expect(voices[1]).toMatchObject({ slot: 1, note: 64, extra: [2, 3, 4, 5] });
  });

  it('ignores a trailing partial record and maps an unknown stage code to off', () => {
    expect(decodeVoices(new Float32Array(VOICE_RECORD_FLOATS + 3))).toHaveLength(1);
    expect(decodeVoices(new Float32Array(rec(60, 9, 1, 0)))[0].stage).toBe('off');
  });
});

describe('which voice a marker follows', () => {
  const v = (over: Partial<WasmVoice>): WasmVoice => ({ slot: 0, note: 60, stage: 'sustain', level: 1, elapsedSeconds: 1, cutoff: 0, filterLevel: 0, lfoPhase: 0, filterStage: 'sustain', extra: [], ...over });
  it('is null when every voice is off', () => {
    expect(pickVoice([v({ stage: 'off' }), v({ stage: 'off', slot: 1 })])).toBeNull();
  });
  it('prefers a held voice over a releasing one, and the newest among equals', () => {
    const releasing = v({ slot: 0, stage: 'release', elapsedSeconds: 0.1 });
    const old = v({ slot: 1, elapsedSeconds: 3 });
    const fresh = v({ slot: 2, elapsedSeconds: 0.5 });
    expect(pickVoice([releasing, old, fresh])?.slot).toBe(2);
    expect(pickVoice([releasing])?.slot).toBe(0);
  });
});

describe('the hub', () => {
  it('starts the worklet watch with the first subscriber and stops it with the last', () => {
    const send = vi.fn();
    const hub = new WasmVoiceHub(send);
    const a = hub.subscribe(() => {});
    const b = hub.subscribe(() => {});
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith({ type: 'watchVoices', on: true });
    a();
    expect(send).toHaveBeenCalledTimes(1);
    b();
    expect(send).toHaveBeenLastCalledWith({ type: 'watchVoices', on: false });
    b();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('delivers a voiceStatus message to subscribers and leaves other messages alone', () => {
    const hub = new WasmVoiceHub(() => {});
    const seen: WasmVoice[][] = [];
    hub.subscribe((voices) => seen.push(voices));
    expect(hub.handleMessage({ type: 'ready' })).toBe(false);
    expect(hub.handleMessage({ type: 'voiceStatus', voices: new Float32Array(rec(64, 2, 0.8, 2)) })).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toMatchObject({ note: 64, stage: 'sustain' });
  });

  it('re-sends the watch when the worklet becomes ready after the first subscriber', () => {
    const send = vi.fn();
    const hub = new WasmVoiceHub(send);
    hub.subscribe(() => {});
    send.mockClear();
    hub.resume();
    expect(send).toHaveBeenCalledWith({ type: 'watchVoices', on: true });
  });
});

describe('the marker registry', () => {
  it('follows every live instance of a synth type, including one created later, and ends with null', () => {
    const a = new WasmVoiceHub(() => {});
    const unregisterA = registerVoiceHub('TestSynthA', a);
    const picks: Array<number | null> = [];
    const stop = subscribeVoiceMarker('TestSynthA', (voice) => picks.push(voice ? voice.note : null));
    a.handleMessage({ type: 'voiceStatus', voices: new Float32Array(rec(60, 0, 0.1, 0.01)) });
    const b = new WasmVoiceHub(() => {});
    registerVoiceHub('TestSynthA', b);
    b.handleMessage({ type: 'voiceStatus', voices: new Float32Array(rec(72, 2, 1, 0.001)) });
    a.handleMessage({ type: 'voiceStatus', voices: new Float32Array(rec(-1, 4, 0, 0)) });
    b.handleMessage({ type: 'voiceStatus', voices: new Float32Array(rec(-1, 4, 0, 0)) });
    expect(picks).toEqual([60, 72, 72, null]);
    stop();
    expect(a.subscriberCount).toBe(0);
    unregisterA();
  });

  it('keeps types apart', () => {
    const hub = new WasmVoiceHub(() => {});
    registerVoiceHub('TestSynthB', hub);
    const seen = vi.fn();
    subscribeVoiceMarker('TestSynthC', seen);
    hub.handleMessage({ type: 'voiceStatus', voices: new Float32Array(rec(60, 0, 0.1, 0.01)) });
    expect(seen).not.toHaveBeenCalled();
  });
});
