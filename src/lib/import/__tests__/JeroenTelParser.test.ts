/**
 * JeroenTelParser tests, on the committed corpus (public/data/songs).
 * Instrument-count behaviour is covered in instrumentTableWalk.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isJeroenTelFormat, parseJeroenTelFile } from '../formats/JeroenTelParser';

const DIR = resolve(import.meta.dirname, '../../../../public/data/songs/jeroen-tel');
const FILES = ['stormlord title.jt', '../formats/insects_in_space.jt'];

function loadBuf(name: string): ArrayBuffer {
  const b = readFileSync(resolve(DIR, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe('isJeroenTelFormat', () => {
  for (const f of FILES) {
    it(`detects ${f}`, () => {
      expect(isJeroenTelFormat(loadBuf(f), f.split('/').pop())).toBe(true);
    });
  }
  it('rejects zeroed buffer', () => {
    expect(isJeroenTelFormat(new ArrayBuffer(64))).toBe(false);
  });
  it('rejects a buffer that is too short', () => {
    expect(isJeroenTelFormat(new ArrayBuffer(8))).toBe(false);
  });
});

describe('parseJeroenTelFile', () => {
  for (const f of FILES) {
    it(`${f}: 4 channels, instruments unnamed`, async () => {
      const song = await parseJeroenTelFile(loadBuf(f), f.split('/').pop()!);
      expect(song.numChannels).toBe(4);
      expect(song.instruments.length).toBeGreaterThanOrEqual(1);
      expect(song.instruments[0].name).toBe('');
    });
  }
});
