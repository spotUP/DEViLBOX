import { describe, it, expect } from 'vitest';
import { computePlayButtonAction } from '../playbackButtonAction';

describe('computePlayButtonAction — Play Pattern never stops; Play Song toggles', () => {
  it('starts when stopped', () => {
    expect(computePlayButtonAction('song', false, false)).toBe('start');
    expect(computePlayButtonAction('pattern', false, false)).toBe('start');
  });

  it('Play Pattern during full-song playback SWITCHES (does not stop)', () => {
    expect(computePlayButtonAction('pattern', true, false)).toBe('switch');
  });

  it('Play Song during pattern-loop playback SWITCHES (does not stop)', () => {
    expect(computePlayButtonAction('song', true, true)).toBe('switch');
  });

  it('Play Song pressed during full-song playback stops it', () => {
    expect(computePlayButtonAction('song', true, false)).toBe('stop');
  });

  it('Play Pattern pressed during pattern-loop RESTARTS — it never stops', () => {
    expect(computePlayButtonAction('pattern', true, true)).toBe('restart');
  });
});
