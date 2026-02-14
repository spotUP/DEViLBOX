import { describe, it, expect, vi, afterEach } from 'vitest';
import { KeyboardNormalizer } from '../KeyboardNormalizer';

describe('KeyboardNormalizer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('platform detection', () => {
    it('detects Mac platform (MacIntel)', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      expect(KeyboardNormalizer.isMac()).toBe(true);
    });

    it('detects Mac platform (MacPPC)', () => {
      vi.stubGlobal('navigator', { platform: 'MacPPC' });
      expect(KeyboardNormalizer.isMac()).toBe(true);
    });

    it('detects Mac platform (MacARM)', () => {
      vi.stubGlobal('navigator', { platform: 'MacARM' });
      expect(KeyboardNormalizer.isMac()).toBe(true);
    });

    it('detects PC platform (Win32)', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' });
      expect(KeyboardNormalizer.isMac()).toBe(false);
    });

    it('detects Linux as non-Mac', () => {
      vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
      expect(KeyboardNormalizer.isMac()).toBe(false);
    });

    it('uses modern userAgentData when available', () => {
      vi.stubGlobal('navigator', {
        platform: 'Win32', // Legacy API
        userAgentData: { platform: 'macOS' } // Modern API
      });
      expect(KeyboardNormalizer.isMac()).toBe(true); // Should use modern API
    });

    it('falls back to platform when userAgentData unavailable', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      expect(KeyboardNormalizer.isMac()).toBe(true);
    });
  });
});
