import { describe, it, expect, vi } from 'vitest';
import { KeyboardNormalizer } from '../KeyboardNormalizer';

describe('KeyboardNormalizer', () => {
  describe('platform detection', () => {
    it('detects Mac platform', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      expect(KeyboardNormalizer.isMac()).toBe(true);
      vi.unstubAllGlobals();
    });

    it('detects PC platform', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' });
      expect(KeyboardNormalizer.isMac()).toBe(false);
      vi.unstubAllGlobals();
    });
  });
});
