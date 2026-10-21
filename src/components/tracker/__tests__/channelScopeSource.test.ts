import { describe, it, expect } from 'vitest';
import { channelScopeSource } from '../channelScopeSource';

const sine = (n: number, amp: number) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * i) / 32));
const sineInt16 = (n: number, amp: number) => Int16Array.from({ length: n }, (_, i) => Math.round(amp * Math.sin((2 * Math.PI * i) / 32)));

describe('channel scope source', () => {
  it('draws the Tone strip when the libopenmpt channel of a Tone-synth song is silent', () => {
    const engine = new Int16Array(256);
    const strip = sine(256, 0.5);
    const source = channelScopeSource(engine, strip);
    expect(source?.data).toBe(strip);
    expect(source?.isFloat).toBe(true);
  });

  it('keeps the engine channel when it carries signal', () => {
    const engine = sineInt16(256, 8000);
    const source = channelScopeSource(engine, sine(256, 0.5));
    expect(source?.data).toBe(engine);
    expect(source?.isFloat).toBe(false);
  });

  it('draws the silent engine channel flat when the strip is silent too', () => {
    const engine = new Int16Array(256);
    expect(channelScopeSource(engine, new Float32Array(256))?.data).toBe(engine);
    expect(channelScopeSource(engine, null)?.data).toBe(engine);
  });

  it('draws the strip without any engine frame, and nothing when neither has data', () => {
    const strip = sine(256, 0.3);
    expect(channelScopeSource(null, strip)?.data).toBe(strip);
    expect(channelScopeSource(null, new Float32Array(256))).toBeNull();
    expect(channelScopeSource(undefined, null)).toBeNull();
  });
});
