/**
 * ActionamicsParser Tests
 *
 * API:
 *   isActionamicsFormat(bytes: Uint8Array): boolean
 *   parseActionamicsFile(bytes: Uint8Array, filename: string): TrackerSong | null
 *
 * Magic: 'ACTIONAMICS SOUND TOOL' (22 bytes) at offset 62.
 * No reference music files found for this format.
 */
import { describe, it, expect } from 'vitest';
import { isActionamicsFormat } from '../formats/ActionamicsParser';

function makeActionamicsBuf(): Uint8Array {
  // Minimum valid buffer: at least 90 bytes with signature at offset 62
  const buf = new Uint8Array(200);
  const sig = 'ACTIONAMICS SOUND TOOL';
  for (let i = 0; i < sig.length; i++) {
    buf[62 + i] = sig.charCodeAt(i);
  }
  return buf;
}

describe('isActionamicsFormat', () => {
  it('detects a crafted buffer with correct signature', () => {
    expect(isActionamicsFormat(makeActionamicsBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isActionamicsFormat(new Uint8Array(200))).toBe(false);
  });

  it('rejects a buffer that is too short', () => {
    expect(isActionamicsFormat(new Uint8Array(50))).toBe(false);
  });

  it('rejects a buffer with wrong bytes at the signature offset', () => {
    const buf = makeActionamicsBuf();
    buf[62] = 0x00;
    expect(isActionamicsFormat(buf)).toBe(false);
  });

  it('rejects a buffer with partial signature', () => {
    const buf = new Uint8Array(200);
    const partial = 'ACTIONAMICS SOUND TO';
    for (let i = 0; i < partial.length; i++) {
      buf[62 + i] = partial.charCodeAt(i);
    }
    expect(isActionamicsFormat(buf)).toBe(false);
  });
});
