import { describe, expect, it } from 'vitest';
import { resolveCheeseCutterPlaybackView } from '@/components/cheesecut/useCheeseCutterFormatData';

describe('resolveCheeseCutterPlaybackView', () => {
  it('follows the shared transport position while CheeseCutter is playing', () => {
    expect(resolveCheeseCutterPlaybackView({
      transportPlaying: true,
      transportRow: 31,
      transportSongPos: 5,
      storePlaying: false,
      storePlaybackRow: 0,
      storePlaybackSongPos: 0,
      orderCursor: 1,
      cursorRow: 7,
    })).toEqual({
      currentOrderPos: 5,
      displayRow: 31,
      isPlaying: true,
    });
  });

  it('falls back to the format store playback position when transport playback is inactive', () => {
    expect(resolveCheeseCutterPlaybackView({
      transportPlaying: false,
      transportRow: 0,
      transportSongPos: 0,
      storePlaying: true,
      storePlaybackRow: 12,
      storePlaybackSongPos: 3,
      orderCursor: 1,
      cursorRow: 7,
    })).toEqual({
      currentOrderPos: 3,
      displayRow: 12,
      isPlaying: true,
    });
  });

  it('shows the edit cursor when playback is idle', () => {
    expect(resolveCheeseCutterPlaybackView({
      transportPlaying: false,
      transportRow: 0,
      transportSongPos: 0,
      storePlaying: false,
      storePlaybackRow: 12,
      storePlaybackSongPos: 3,
      orderCursor: 4,
      cursorRow: 22,
    })).toEqual({
      currentOrderPos: 4,
      displayRow: 22,
      isPlaying: false,
    });
  });
});
