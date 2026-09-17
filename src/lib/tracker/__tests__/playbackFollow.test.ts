import { describe, it, expect } from 'vitest';
import { computePlaybackFollow } from '../playbackFollow';

describe('computePlaybackFollow — the editor follows the position the engine reports', () => {
  it('full-song playback follows both pattern and position', () => {
    expect(computePlaybackFollow(false, 5, 3)).toEqual({ pattern: 5, position: 3 });
  });

  it('pattern-loop follows the position too — the order is no longer truncated', () => {
    // Play Pattern used to load a 1-entry song list, so the reported position
    // was meaningless and had to be discarded. The order is now the song's real
    // order with a loop RANGE over it (computeEffectiveSongOrder), so the
    // position is real and the pos counter must track it instead of sticking
    // at 000 for the whole song.
    expect(computePlaybackFollow(true, 7, 7)).toEqual({ pattern: 7, position: 7 });
  });

  it('never discards a non-zero position', () => {
    expect(computePlaybackFollow(true, 2, 4).position).toBe(4);
  });
});
