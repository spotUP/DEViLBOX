/**
 * Owner 2026-10-20: in a fresh song every synth note after the first sounded legato. A raw note on a synth channel is
 * a hard retrigger (FT2 semantics): the replayer asks the engine to CUT the old note. A 303 hammer and tone
 * portamento (3xx, 5xx) keep the old note: the replayer only releases it, as before. A 303 slide neither cuts nor
 * releases.
 *
 * Drives TrackerReplayer.processHybridRow (the row entry point for synth channels) with a stub ToneEngine that records
 * which of triggerNoteCut / triggerNoteRelease ran.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrackerReplayer } from '../TrackerReplayer';
import type { TrackerCell } from '@/types';

const engine = vi.hoisted(() => ({
  triggerNoteCut: vi.fn(), triggerNoteRelease: vi.fn(),
}));

vi.mock('tone', async (orig) => {
  const transport = { bpm: { value: 125 }, state: 'stopped', stop() {}, start() {}, cancel() {}, pause() {} };
  const node = () => ({ connect() {}, disconnect() {}, dispose() {}, gain: { value: 1, rampTo() {} } });
  return { ...(await orig<object>()), Gain: function () { return node(); }, Player: function () { return { ...node(), stop() {}, volume: { value: 0 } }; }, Panner: function () { return { ...node(), pan: { value: 0 } }; }, getContext: () => ({}), start: async () => undefined, context: { rawContext: { state: 'running' }, resume: async () => undefined }, now: () => 0, getTransport: () => transport };
});
vi.mock('../StereoSeparationNode', () => ({
  StereoSeparationNode: function () { return { inputTone: {}, outputTone: { connect() {}, disconnect() {} }, setMode() {}, dispose() {} }; },
}));
vi.mock('@/utils/audio-context', async (orig) => ({ ...(await orig<object>()), getNativeAudioNode: () => null }));
vi.mock('../ToneEngine', () => {
  const proxy = new Proxy(engine as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => undefined) });
  return { getToneEngine: () => proxy };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

interface HybridRow { processHybridRow(chIndex: number, ch: unknown, row: TrackerCell, time: number): void; triggerNote(): void; song: unknown }

function playSecondNote(row: Partial<TrackerCell>, previousSlideFlag = false) {
  const replayer = new TrackerReplayer() as unknown as HybridRow;
  replayer.song = {};
  replayer.triggerNote = vi.fn();
  const ch = {
    instrument: { id: 1, synthType: 'WobbleBass' }, lastPlayedNoteName: 'D4', previousSlideFlag,
    volume: 64, gainNode: { gain: { setValueAtTime() {} } },
  };
  replayer.processHybridRow(0, ch, { note: 56, instrument: 0, volume: 0, effTyp: 0, eff: 0, ...row } as TrackerCell, 1);
  return replayer.triggerNote as ReturnType<typeof vi.fn>;
}

describe('a new synth note on a channel that is already playing', () => {
  beforeEach(() => { engine.triggerNoteCut.mockClear(); engine.triggerNoteRelease.mockClear(); });

  it('cuts the old note when the new note is a raw note', () => {
    const trigger = playSecondNote({});
    expect(trigger, 'the new note was triggered').toHaveBeenCalledTimes(1);
    expect(engine.triggerNoteCut).toHaveBeenCalledTimes(1);
    expect(engine.triggerNoteCut.mock.calls[0].slice(0, 3)).toEqual([1, 'D4', 1]);
    expect(engine.triggerNoteRelease).not.toHaveBeenCalled();
  });

  it.each([['3xx', 0x3], ['5xx', 0x5]])('only releases the old note under tone portamento (%s)', (_name, effTyp) => {
    playSecondNote({ effTyp, eff: 0x10 });
    expect(engine.triggerNoteRelease).toHaveBeenCalledTimes(1);
    expect(engine.triggerNoteCut).not.toHaveBeenCalled();
  });

  it('only releases the old note on a 303 hammer', () => {
    playSecondNote({ flag1: 4 });
    expect(engine.triggerNoteRelease).toHaveBeenCalledTimes(1);
    expect(engine.triggerNoteCut).not.toHaveBeenCalled();
  });

  it('neither cuts nor releases on a 303 slide', () => {
    playSecondNote({}, true);
    expect(engine.triggerNoteRelease).not.toHaveBeenCalled();
    expect(engine.triggerNoteCut).not.toHaveBeenCalled();
  });
});
