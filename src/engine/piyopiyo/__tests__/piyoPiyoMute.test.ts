/**
 * Mute and solo of a PiyoPiyo channel must silence the track that channel is a lane of.
 * The grid has one channel per chord lane; the engine's mask has one bit per track.
 */
import { describe, it, expect, vi } from 'vitest';
import { piyoPiyoTrackMask } from '@/lib/import/formats/piyoPiyoGrid';
import { PiyoPiyoEngine } from '../PiyoPiyoEngine';

describe('piyoPiyoTrackMask', () => {
  // Track 0 owns channels 0-2, track 1 channel 3, track 2 channels 4-5, drums channel 6.
  const lanes = [3, 1, 2, 1];
  it('all channels audible keeps every track', () => {
    expect(piyoPiyoTrackMask(0x7f, lanes)).toBe(0xf);
  });
  it('solo of a later lane keeps only its track', () => {
    expect(piyoPiyoTrackMask(1 << 5, lanes)).toBe(1 << 2);
    expect(piyoPiyoTrackMask(1 << 6, lanes)).toBe(1 << 3);
  });
  it('a track sounds while any of its lanes is audible, and is silent when all are muted', () => {
    expect(piyoPiyoTrackMask(0x7f & ~(1 << 1), lanes)).toBe(0xf);
    expect(piyoPiyoTrackMask(0x7f & ~0b111, lanes)).toBe(0b1110);
  });
});

describe('PiyoPiyoEngine.setMuteMask', () => {
  it('posts the track mask for the loaded module lanes', () => {
    const post = vi.fn();
    const engine = Object.create(PiyoPiyoEngine.prototype) as PiyoPiyoEngine;
    Object.assign(engine, { workletNode: { port: { postMessage: post } }, lanes: [3, 1, 2, 1] });
    engine.setMuteMask(1 << 5);
    expect(post).toHaveBeenCalledWith({ type: 'setMuteMask', mask: 1 << 2 });
  });
});
