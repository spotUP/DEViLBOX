import { describe, it, expect } from 'vitest';
import { applyVolumeHighNibble, applyVolumeLowNibble } from '../volumeColumnEdit';

/**
 * M7: the volume column packs a command class in the high nibble and a value in
 * the low nibble. FT2 edits each nibble independently. The old 2nd-nibble path
 * special-cased an empty cell (`currentValue < 0x10`) and forced the byte to
 * `0x10 + digit`, fabricating a set-volume command and DISCARDING whatever
 * command class the user had typed in the high nibble.
 */
describe('volumeColumnEdit (M7)', () => {
  describe('applyVolumeLowNibble', () => {
    it('preserves the high-nibble command when editing the value nibble', () => {
      // 0x64 = volume-slide-down 4; typing 2 must yield 0x62, NOT 0x12.
      expect(applyVolumeLowNibble(0x64, 0x2)).toBe(0x62);
      // 0x73 = slide-up 3; typing F must keep command 7.
      expect(applyVolumeLowNibble(0x73, 0xf)).toBe(0x7f);
    });

    it('does not fabricate a set-volume command on an empty cell', () => {
      // Empty cell (high nibble 0); typing 5 keeps high nibble 0 -> 0x05,
      // NOT the old 0x15 that invented a set-volume command.
      expect(applyVolumeLowNibble(0x00, 0x5)).toBe(0x05);
    });

    it('clamps an out-of-range set-volume param (0x51-0x5F) to 0x50', () => {
      // High nibble 5 = set-volume; low nibble past 0 is invalid -> clamp to max.
      expect(applyVolumeLowNibble(0x50, 0x7)).toBe(0x50);
    });
  });

  describe('applyVolumeHighNibble', () => {
    it('replaces the command class while keeping the value nibble', () => {
      // 0x63 -> set command class to 7 -> 0x73.
      expect(applyVolumeHighNibble(0x63, 0x7)).toBe(0x73);
    });

    it('clamps set-volume 0x51-0x5F to 0x50', () => {
      // low nibble 3, choose command 5 -> 0x53 -> clamp to 0x50.
      expect(applyVolumeHighNibble(0x03, 0x5)).toBe(0x50);
    });
  });
});
