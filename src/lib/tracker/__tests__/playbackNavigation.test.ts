import { describe, it, expect } from 'vitest';
import { resolveScrollRow, isManualRowNavAllowed } from '../playbackNavigation';

/**
 * M3: before this fix the pattern view hard-followed the play head whenever the
 * song was playing (ignoring the follow-playback flag) and ALL row navigation
 * was disabled during playback, so you could never reposition the edit cursor
 * while the song played. FT2 allows it via scroll-lock (follow off): the view
 * freezes on the cursor and manual row moves work.
 */
describe('playbackNavigation — scroll-lock policy (M3)', () => {
  describe('resolveScrollRow', () => {
    it('follows the play head while playing AND following', () => {
      expect(resolveScrollRow(true, true, 12, 3)).toBe(12);
    });

    it('locks to the cursor while playing with follow OFF (scroll-lock)', () => {
      expect(resolveScrollRow(true, false, 12, 3)).toBe(3);
    });

    it('stays on the cursor when stopped, regardless of follow', () => {
      expect(resolveScrollRow(false, true, 12, 3)).toBe(3);
      expect(resolveScrollRow(false, false, 12, 3)).toBe(3);
    });
  });

  describe('isManualRowNavAllowed', () => {
    it('is always allowed when stopped', () => {
      expect(isManualRowNavAllowed(false, true)).toBe(true);
      expect(isManualRowNavAllowed(false, false)).toBe(true);
    });

    it('is blocked while playing and following (play head owns the row)', () => {
      expect(isManualRowNavAllowed(true, true)).toBe(false);
    });

    it('is allowed while playing with follow OFF (scroll-lock live edit)', () => {
      expect(isManualRowNavAllowed(true, false)).toBe(true);
    });
  });
});
