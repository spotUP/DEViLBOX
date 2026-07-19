import { describe, it, expect } from 'vitest';
import { computePlaybackFollow } from '../playbackFollow';

describe('computePlaybackFollow — Play Pattern must not reset to song pos 000', () => {
  it('full-song playback follows both pattern and position', () => {
    expect(computePlaybackFollow(false, 5, 3)).toEqual({ pattern: 5, position: 3 });
  });

  it('pattern-loop (Play Pattern) follows the pattern but leaves the song position alone', () => {
    // The replayer reports position 0 for the 1-entry loop list; writing it back
    // would rewrite currentPatternIndex = patternOrder[0] and yank the editor off
    // the looped pattern. position must be null so setCurrentPosition is skipped.
    const follow = computePlaybackFollow(true, 7, 0);
    expect(follow.pattern).toBe(7);
    expect(follow.position).toBeNull();
  });

  it('pattern-loop leaves position null even if the replayer ever reports non-zero', () => {
    expect(computePlaybackFollow(true, 2, 4).position).toBeNull();
  });
});
