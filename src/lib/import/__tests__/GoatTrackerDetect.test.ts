/**
 * GoatTrackerDetect Tests — .sng format magic byte detection
 */
import { describe, it, expect } from 'vitest';
import { isGoatTrackerSong, isGoatTrackerInstrument, getGoatTrackerVersion } from '../formats/GoatTrackerDetect';

function makeBuffer(magic: string, extra = 64): Uint8Array {
  const buf = new Uint8Array(magic.length + extra);
  for (let i = 0; i < magic.length; i++) buf[i] = magic.charCodeAt(i);
  return buf;
}

describe('GoatTrackerDetect', () => {
  it('detects GTS! (v1) format', () => {
    expect(isGoatTrackerSong(makeBuffer('GTS!'))).toBe(true);
  });

  it('detects GTS2 through GTS5 formats', () => {
    expect(isGoatTrackerSong(makeBuffer('GTS2'))).toBe(true);
    expect(isGoatTrackerSong(makeBuffer('GTS3'))).toBe(true);
    expect(isGoatTrackerSong(makeBuffer('GTS4'))).toBe(true);
    expect(isGoatTrackerSong(makeBuffer('GTS5'))).toBe(true);
  });

  it('detects GTI! (instrument v1) format', () => {
    expect(isGoatTrackerInstrument(makeBuffer('GTI!'))).toBe(true);
  });

  it('detects GTI2 through GTI5 instrument formats', () => {
    expect(isGoatTrackerInstrument(makeBuffer('GTI2'))).toBe(true);
    expect(isGoatTrackerInstrument(makeBuffer('GTI3'))).toBe(true);
    expect(isGoatTrackerInstrument(makeBuffer('GTI4'))).toBe(true);
    expect(isGoatTrackerInstrument(makeBuffer('GTI5'))).toBe(true);
  });

  it('rejects non-GoatTracker files', () => {
    expect(isGoatTrackerSong(makeBuffer('XMOD'))).toBe(false);
    expect(isGoatTrackerSong(makeBuffer('PSID'))).toBe(false);
    expect(isGoatTrackerSong(makeBuffer('GTS6'))).toBe(false);
    expect(isGoatTrackerInstrument(makeBuffer('GTI6'))).toBe(false);
    expect(isGoatTrackerSong(makeBuffer('GT'))).toBe(false);
  });

  it('rejects buffers that are too small', () => {
    expect(isGoatTrackerSong(new Uint8Array(3))).toBe(false);
    expect(isGoatTrackerSong(new Uint8Array(0))).toBe(false);
  });

  it('returns correct version numbers', () => {
    expect(getGoatTrackerVersion(makeBuffer('GTS!'))).toBe(1);
    expect(getGoatTrackerVersion(makeBuffer('GTS2'))).toBe(2);
    expect(getGoatTrackerVersion(makeBuffer('GTS5'))).toBe(5);
    expect(getGoatTrackerVersion(makeBuffer('XMOD'))).toBe(null);
  });

  it('detects real .sng file magic bytes', () => {
    const buf = new Uint8Array(1024);
    buf[0] = 0x47; // G
    buf[1] = 0x54; // T
    buf[2] = 0x53; // S
    buf[3] = 0x35; // 5
    expect(isGoatTrackerSong(buf)).toBe(true);
    expect(getGoatTrackerVersion(buf)).toBe(5);
  });
});
