/**
 * The sample editor shows and edits the sample's own loop.
 *
 * Owner report 2026-09-29: looped chip samples in micro15.mod did not loop
 * when played from the keyboard - only clicks. Opening the instrument editor
 * copied the editor's own loop state (off by default) over the sample and
 * set its rate to the decoded buffer's 48000 Hz. The editor now reads the
 * loop from `sample` and writes loop changes back to it in the sample's
 * own frames, and writes nothing when it opens.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { sampleLoopToView, viewLoopToSample } from '../sampleLoopView';
import { useSampleEditorState } from '@/hooks/useSampleEditorState';
import type { SampleConfig } from '@typedefs/instrument';

// micro15.mod sample 9: 222 bytes at 8363 Hz, loop 94..222, decoded to 48 kHz.
const CHIP: SampleConfig = {
  url: '', baseNote: 'C3', detune: 0, loop: true, loopType: 'forward', loopStart: 94, loopEnd: 222,
  sampleRate: 8363, reverse: false, playbackRate: 1,
};
const DURATION = 222 / 8363;
const DECODED = { duration: DURATION, sampleRate: 48000, length: Math.round(DURATION * 48000), numberOfChannels: 1 } as AudioBuffer;

describe('sample loop view', () => {
  it('shows an imported chip loop as looping, over the right span', () => {
    const v = sampleLoopToView(CHIP, DURATION, 48000);
    expect(v.loopEnabled).toBe(true);
    expect(v.loopStart).toBeCloseTo(94 / 222, 6);
    expect(v.loopEnd).toBeCloseTo(1, 6);
  });

  it('writes a moved loop point in the sample\'s own frames and keeps its rate', () => {
    expect(viewLoopToSample({ loopStart: 0.5 }, CHIP, DURATION, 48000)).toEqual({ loopStart: 111 });
  });

  it('a sample without a rate gets the buffer\'s with its frames', () => {
    const noRate = { ...CHIP, sampleRate: undefined };
    expect(viewLoopToSample({ loopEnd: 1 }, noRate, 1, 44100)).toEqual({ loopEnd: 44100, sampleRate: 44100 });
  });

  it('loopEnd 0 (to the end) shows as the whole sample', () => {
    expect(sampleLoopToView({ ...CHIP, loopStart: 0, loopEnd: 0 }, DURATION, 48000).loopEnd).toBe(1);
  });
});

describe('sample editor state', () => {
  it('opening an imported chip sample writes nothing and shows its loop', () => {
    const onUpdateSample = vi.fn();
    const onUpdateParams = vi.fn();
    const { result } = renderHook(() => useSampleEditorState({
      instrumentId: 9, instrumentParameters: undefined, onPersistBuffer: async () => {}, onUpdateParams,
      sample: CHIP, onUpdateSample,
    }));
    act(() => result.current.setAudioBuffer(DECODED));
    expect(result.current.params.loopEnabled).toBe(true);
    expect(result.current.params.loopStart).toBeCloseTo(94 / 222, 6);
    expect(onUpdateSample).not.toHaveBeenCalled();
    expect(onUpdateParams).not.toHaveBeenCalled();
  });

  it('switching the loop off in the editor writes it to the sample', () => {
    const onUpdateSample = vi.fn();
    const { result } = renderHook(() => useSampleEditorState({
      instrumentId: 9, instrumentParameters: undefined, onPersistBuffer: async () => {}, onUpdateParams: vi.fn(),
      sample: CHIP, onUpdateSample,
    }));
    act(() => result.current.setAudioBuffer(DECODED));
    act(() => result.current.updateParam('loopEnabled', false));
    expect(onUpdateSample).toHaveBeenCalledWith({ loop: false });
  });
});
