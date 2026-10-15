import { describe, it, expect, vi } from 'vitest';
import { stopVoice } from '../ChannelRouting';
import type { VoiceState } from '../ChannelRouting';

const nodes = () => ({ gain: { dispose() {} }, filter: { dispose() {} }, panner: { dispose() {} } });
const nativeOutput = { connect() {}, disconnect() {}, numberOfOutputs: 1 };

describe('stopping a DX7 voice releases the note instead of sending noteOff with the time as the note', () => {
  it('a native synth gets triggerRelease(undefined, time)', () => {
    const triggerRelease = vi.fn();
    const instrument = { output: nativeOutput, name: 'DX7', dispose() {}, triggerRelease };
    stopVoice({ instrument, nodes: nodes() } as unknown as VoiceState, 84.132);
    expect(triggerRelease).toHaveBeenCalledWith(undefined, 84.132);
  });
  it('a Tone instrument still gets triggerRelease(time)', () => {
    const triggerRelease = vi.fn();
    stopVoice({ instrument: { triggerRelease }, nodes: nodes() } as unknown as VoiceState, 5.5);
    expect(triggerRelease).toHaveBeenCalledWith(5.5);
  });
});
