import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isGraoumfTracker2Format, parseGraoumfTracker2File } from '../formats/GraoumfTracker2Parser';

const LIVING_ON_VIDEO = resolve(
  import.meta.dirname,
  '../../../../public/data/songs/graoumf-tracker-2/living-on-video.gt2'
);
const GIMMEKUH = resolve(
  import.meta.dirname,
  '../../../../public/data/songs/formats/gimmekuh.gt2'
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

  it('accepts real GT2 files whose year field is in range', () => {
    // Year u16BE at offset 202: living-on-video.gt2 = 0x07ce (1998), gimmekuh.gt2 = 0x0802 (2050)
    expect(isGraoumfTracker2Format(loadFile(LIVING_ON_VIDEO))).toBe(true);
    expect(isGraoumfTracker2Format(loadFile(GIMMEKUH))).toBe(true);
  });

  it('rejects a real GT2 file once its year field is outside 1980-9999 (strict validation)', () => {
    // The parser mirrors OpenMPT's strict GT2FileHeader::Validate(): year must be 1980..9999.
    const bytes = loadFile(LIVING_ON_VIDEO);
    bytes[202] = 0x07; bytes[203] = 0xab; // 1963
    expect(isGraoumfTracker2Format(bytes)).toBe(false);
    expect(parseGraoumfTracker2File(bytes, 'living-on-video.gt2')).toBeNull();
  });
});

describe('parseGraoumfTracker2File — real files', () => {
  it('parses living-on-video.gt2', () => {
    const song = parseGraoumfTracker2File(loadFile(LIVING_ON_VIDEO), 'living-on-video.gt2');
    expect(song).not.toBeNull();
    expect(song!.name).toBe('living-on-video');
  });

  it('parses gimmekuh.gt2', () => {
    const song = parseGraoumfTracker2File(loadFile(GIMMEKUH), 'gimmekuh.gt2');
    expect(song).not.toBeNull();
  });
});
