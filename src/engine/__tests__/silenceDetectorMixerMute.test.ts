/**
 * Muting every channel does not end the song.
 *
 * Every direct-routed native engine gets a SilenceDetector on its output;
 * 5 s of silence fades the engine out and stops it. A mute-all on
 * `fireworks ii.fred` read as the song ending: `FredReplayer2 silence
 * detected - stopping`, and unmuting left 0 rms (2026-10-04). Silence the
 * mixer makes is not the song's.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SilenceDetector } from '../replayer/SilenceDetector';

function fakeContext(rms: { v: number }) {
  const analyser = {
    fftSize: 2048,
    context: { state: 'running' },
    getFloatTimeDomainData(buf: Float32Array) { buf.fill(rms.v); },
    disconnect() {},
  };
  const context = { sampleRate: 48000, createAnalyser: () => analyser, state: 'running', currentTime: 0 };
  const source = { connect() {} } as unknown as AudioNode;
  const gain = { context, gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} } } as unknown as GainNode;
  return { context: context as unknown as AudioContext, source, gain };
}

describe('SilenceDetector', () => {
  afterEach(() => vi.useRealTimers());

  it('does not stop an engine whose silence the mixer made', () => {
    vi.useFakeTimers();
    const level = { v: 0.1 };
    const { context, source, gain } = fakeContext(level);
    const onSilence = vi.fn();
    let muted = true;
    new SilenceDetector(context).start(source, gain, onSilence, () => muted);
    vi.advanceTimersByTime(1000);   // audio heard
    level.v = 0;                    // mute-all: output goes silent
    vi.advanceTimersByTime(20_000);
    expect(onSilence).not.toHaveBeenCalled();
    // The song really ends after the unmute: silence with nothing muted.
    muted = false;
    vi.advanceTimersByTime(5_500 + 2_000);
    expect(onSilence).toHaveBeenCalledTimes(1);
  });

  it('still stops a song that ends on its own', () => {
    vi.useFakeTimers();
    const level = { v: 0.1 };
    const { context, source, gain } = fakeContext(level);
    const onSilence = vi.fn();
    new SilenceDetector(context).start(source, gain, onSilence, () => false);
    vi.advanceTimersByTime(1000);
    level.v = 0;
    vi.advanceTimersByTime(5_500 + 2_000);
    expect(onSilence).toHaveBeenCalledTimes(1);
  });
});
