import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isGraoumfTracker2Format, parseGraoumfTracker2File } from '../formats/GraoumfTracker2Parser';

const BITTERSWEET = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Graoumf Tracker 2/Speechless/bittersweet.gt2'
);
const BOUND = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Graoumf Tracker 2/Speechless/bound.gt2'
);

function loadFile(path: string): Uint8Array {
  const buf = readFileSync(path);
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe('isGraoumfTracker2Format', () => {
  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(isGraoumfTracker2Format(buf)).toBe(false);
  });

  it('rejects buffer shorter than 48 bytes', () => {
    const buf = new Uint8Array(16).fill(0);
    expect(isGraoumfTracker2Format(buf)).toBe(false);
  });

  it('rejects GT2 files with invalid year field (real files, strict validation)', () => {
    // These GT2 files have "GT2" magic but fail the parser's year validation check
    // (year field at offset 203 is outside 1980-9999 range in these files).
    // The parser mirrors OpenMPT's strict GT2FileHeader::Validate() behaviour.
    const bytes = loadFile(BITTERSWEET);
    expect(isGraoumfTracker2Format(bytes)).toBe(false);
  });
});

describe('parseGraoumfTracker2File — bittersweet.gt2 (Speechless)', () => {
  it('returns null due to year validation failure', () => {
    // bittersweet.gt2 has "GT2" magic and version 4, but its year field (offset 203,
    // uint16BE) is outside the valid 1980-9999 range, so the parser returns null.
    const bytes = loadFile(BITTERSWEET);
    const song = parseGraoumfTracker2File(bytes, 'bittersweet.gt2');
    expect(song).toBeNull();
  });
});

describe('parseGraoumfTracker2File — bound.gt2 (Speechless)', () => {
  it('returns null due to year validation failure', () => {
    // bound.gt2 has the same year validation issue as bittersweet.gt2.
    const bytes = loadFile(BOUND);
    const song = parseGraoumfTracker2File(bytes, 'bound.gt2');
    expect(song).toBeNull();
  });
});
