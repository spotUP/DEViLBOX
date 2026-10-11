/**
 * The DJ deck channel scopes stayed flat for every module: a deck plays a
 * pre-rendered WAV, and the per-channel signal was never captured. The
 * scope track (channelScopeTrack.ts) stores each channel's signal beside the
 * WAV; these pin how it is stored and read.
 */
import { describe, it, expect } from 'vitest';
import {
  ChannelScopeTrackBuilder, channelScopeWindow, attachChannelScopes, channelScopesFor,
  DECK_SCOPE_DECIMATION, DECK_SCOPE_WINDOW,
} from '../channelScopeTrack';

const RATE = 44100;

/** One second: channel 0 a sine from 0.5 s, channel 1 silent, channel 2 a quiet sine throughout. */
function build() {
  const b = new ChannelScopeTrackBuilder(3, RATE);
  const sig = (ch: number, t: number) =>
    ch === 0 ? (t >= RATE / 2 ? 0.8 * Math.sin(2 * Math.PI * 110 * t / RATE) : 0)
      : ch === 2 ? 0.05 * Math.sin(2 * Math.PI * 220 * t / RATE) : 0;
  for (let off = 0; off < RATE; off += 4096) {
    const n = Math.min(4096, RATE - off);
    b.push(n, (ch, i) => sig(ch, off + i));
  }
  return b.finish();
}

const peak = (w: Float32Array) => w.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('channel scope track', () => {
  it('stores each channel at the decimated rate, one sample per DECK_SCOPE_DECIMATION rendered', () => {
    const t = build();
    expect(t.sampleRate).toBe(RATE / DECK_SCOPE_DECIMATION);
    expect(t.channels).toHaveLength(3);
    expect(t.channels[0].length).toBe(Math.ceil(RATE / DECK_SCOPE_DECIMATION));
  });

  it('a channel scope shows that channel only, at the position asked for', () => {
    const t = build();
    const before = channelScopeWindow(t, 0.4);
    const after = channelScopeWindow(t, 0.9);
    expect(peak(before[0])).toBe(0);          // channel 0 starts at 0.5 s
    expect(peak(after[0])).toBeGreaterThan(0.7);
    expect(peak(after[1])).toBe(0);           // a silent channel stays flat
  });

  it('keeps a quiet channel at its own level, not normalised to full scale', () => {
    const t = build();
    const w = channelScopeWindow(t, 0.9)[2];
    expect(peak(w)).toBeGreaterThan(0.045);
    expect(peak(w)).toBeLessThan(0.055);
  });

  it('is flat before the start and past the end of the render', () => {
    const t = build();
    expect(channelScopeWindow(t, 0).every((w) => peak(w) === 0)).toBe(true);
    expect(channelScopeWindow(t, 5).every((w) => peak(w) === 0)).toBe(true);
    expect(channelScopeWindow(t, 0.9)[0]).toHaveLength(DECK_SCOPE_WINDOW);
  });

  it('caps the channels read at maxChannels', () => {
    expect(channelScopeWindow(build(), 0.9, 2)).toHaveLength(2);
  });

  it('travels with the WAV bytes it was rendered with, and a render without channels attaches nothing', () => {
    const wav = new ArrayBuffer(8);
    const t = build();
    attachChannelScopes(wav, t);
    expect(channelScopesFor(wav)).toBe(t);
    expect(channelScopesFor(new ArrayBuffer(8))).toBeUndefined();
    const other = new ArrayBuffer(8);
    attachChannelScopes(other, new ChannelScopeTrackBuilder(0, RATE).finish());
    expect(channelScopesFor(other)).toBeUndefined();
  });
});
