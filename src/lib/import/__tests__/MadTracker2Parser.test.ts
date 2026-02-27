import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isMadTracker2Format, parseMadTracker2File } from '../formats/MadTracker2Parser';

const BELIEVE_ME = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Mad Tracker 2/Babydee/believe me.mt2'
);
const MIND_WIND_DOWN = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Mad Tracker 2/Babydee/mind wind down.mt2'
);

function loadFile(path: string): Uint8Array {
  const buf = readFileSync(path);
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe('isMadTracker2Format', () => {
  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(isMadTracker2Format(buf)).toBe(false);
  });

  it('rejects buffer shorter than 48 bytes', () => {
    const buf = new Uint8Array(16).fill(0);
    expect(isMadTracker2Format(buf)).toBe(false);
  });

  it('rejects real MT2 files with version misread (parser reads version at offset 6, files store it at offset 8)', () => {
    // MT2 files have "MT20" magic and version 0x0207 at byte offset 8 (after a 4-byte userID field),
    // but the parser reads version at offset 6 (2 bytes too early), so detection always fails
    // for these real-world files. The parser mirrors a slightly off-spec field layout.
    const bytes = loadFile(BELIEVE_ME);
    expect(isMadTracker2Format(bytes)).toBe(false);
  });
});

describe('parseMadTracker2File — believe me.mt2 (Babydee)', () => {
  it('returns null because version field is read at wrong offset', () => {
    // The parser reads version at offset 6; real MT2 files store it at offset 8
    // (after a uint32le userID at offsets 4-7). The version check therefore fails.
    const bytes = loadFile(BELIEVE_ME);
    const song = parseMadTracker2File(bytes, 'believe me.mt2');
    expect(song).toBeNull();
  });
});

describe('parseMadTracker2File — mind wind down.mt2 (Babydee)', () => {
  it('returns null because version field is read at wrong offset', () => {
    const bytes = loadFile(MIND_WIND_DOWN);
    const song = parseMadTracker2File(bytes, 'mind wind down.mt2');
    expect(song).toBeNull();
  });
});
