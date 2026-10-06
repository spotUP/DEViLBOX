/**
 * Loading MIDI.Cartoons 1 (MIDI Loriciel on the eagleplayer runner) raised a
 * 'Format Compatibility Warning': every native song without its own limits
 * fell to the MOD 'safe default', and a 192-row MIDI bar breaks MOD's 64
 * rows. Eagleplayer formats have their own data model and encoders
 * (2026-10-06).
 */
import { describe, it, expect } from 'vitest';
import { useFormatStore } from '@/stores/useFormatStore';
import { getActiveFormatLimits, wouldViolateFormat } from '../formatCompatibility';

describe('format limits for eagleplayer songs', () => {
  it('an eagleplayer song has no MOD limits', () => {
    useFormatStore.setState({ eaglePlayerFileData: new ArrayBuffer(16), eaglePlayerId: 'MIDILoriciel' } as never);
    expect(getActiveFormatLimits()).toBeNull();
    expect(wouldViolateFormat('channelCount')).toBeNull();
  });

  it('a libopenmpt MOD still gets MOD limits', () => {
    useFormatStore.setState({ eaglePlayerFileData: null, eaglePlayerId: null, libopenmptFileData: new ArrayBuffer(16) } as never);
    expect(getActiveFormatLimits()?.name).toBe('MOD');
  });
});
