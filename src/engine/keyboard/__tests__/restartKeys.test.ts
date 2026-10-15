import { describe, it, expect } from 'vitest';
import { restartKeyAction } from '../restartKeys';

describe('first pattern note triggers once when playing the pattern with Shift', () => {
  it('the first press of Right Shift plays the song and Right Alt plays the pattern', () => {
    expect(restartKeyAction({ code: 'ShiftRight', repeat: false })).toBe('playSong');
    expect(restartKeyAction({ code: 'AltRight', repeat: false })).toBe('playPattern');
  });

  it('a held key (auto-repeat keydown) does not restart playback a second time', () => {
    expect(restartKeyAction({ code: 'ShiftRight', repeat: true })).toBe('swallow');
    expect(restartKeyAction({ code: 'AltRight', repeat: true })).toBe('swallow');
  });

  it('other keys are not restart keys', () => {
    expect(restartKeyAction({ code: 'ShiftLeft', repeat: false })).toBeNull();
    expect(restartKeyAction({ code: 'KeyA', repeat: true })).toBeNull();
  });
});
