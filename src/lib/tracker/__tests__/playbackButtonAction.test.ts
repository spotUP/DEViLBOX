import { describe, it, expect } from 'vitest';
import { computePlayButtonAction } from '../playbackButtonAction';

describe('computePlayButtonAction — play buttons switch mode, they do not stop the song', () => {
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

  it('pressing the button for the mode already playing stops it', () => {
    expect(computePlayButtonAction('song', true, false)).toBe('stop');
    expect(computePlayButtonAction('pattern', true, true)).toBe('stop');
  });
});
