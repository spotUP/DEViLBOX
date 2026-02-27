/**
 * MFPParser Tests — Magnetic Fields Packer format detection and parsing
 *
 * Detection is filename-based (basename[3] === '.') plus structural validation.
 * No magic bytes; format identified by filename 'mfp.songname' convention.
 */
import { describe, it, expect } from 'vitest';
import { isMFPFormat, parseMFPFile } from '../formats/MFPParser';

// Build a minimal structurally-valid MFP buffer (512 bytes)
function makeMFPBuffer(): ArrayBuffer {
  const buf = new Uint8Array(512).fill(0);

  // 31 instrument headers x 8 bytes (offsets 0..247)
  // Each: len=2, finetune=0, volume=32, loopStart=0, loopSize=2
  for (let i = 0; i < 31; i++) {
    const b = i * 8;
    buf[b]     = 0x00; buf[b + 1] = 0x02; // len = 2 words
    buf[b + 2] = 0x00;                     // finetune (high nibble clear)
    buf[b + 3] = 0x20;                     // volume = 32
    buf[b + 4] = 0x00; buf[b + 5] = 0x00; // loopStart = 0
    buf[b + 6] = 0x00; buf[b + 7] = 0x02; // loopSize = 2
  }

  buf[248] = 1;    // numPatterns = 1
  buf[249] = 0x7f; // restart byte must be 0x7F

  // size1 at 378 and size2 at 380 must equal numPatterns (1)
  buf[379] = 0x01;
  buf[381] = 0x01;

  return buf.buffer;
}

describe('isMFPFormat', () => {
  it('detects valid MFP buffer with correct filename', () => {
    expect(isMFPFormat(makeMFPBuffer(), 'mfp.songname')).toBe(true);
  });

  it('rejects filename where basename[3] is not a dot', () => {
    // 'module.songname': basename[3] = 'u', not '.'
    expect(isMFPFormat(makeMFPBuffer(), 'module.songname')).toBe(false);
  });

  it('rejects when restart byte at 249 is wrong', () => {
    const buf = new Uint8Array(makeMFPBuffer());
    buf[249] = 0x00;
    expect(isMFPFormat(buf.buffer, 'mfp.test')).toBe(false);
  });

  it('rejects buffer too small', () => {
    expect(isMFPFormat(new ArrayBuffer(200), 'mfp.small')).toBe(false);
  });

  it('rejects zeroed buffer without filename', () => {
    expect(isMFPFormat(new ArrayBuffer(512))).toBe(false);
  });
});

describe('parseMFPFile', () => {
  it('parses valid buffer without throwing', async () => {
    const song = await parseMFPFile(makeMFPBuffer(), 'mfp.test');
    expect(song).toBeDefined();
    expect(song.name).toContain('Magnetic Fields Packer');
    expect(song.numChannels).toBe(4);
  });

  it('creates 31 instrument placeholders', async () => {
    const song = await parseMFPFile(makeMFPBuffer(), 'mfp.test');
    expect(song.instruments).toHaveLength(31);
  });
});
