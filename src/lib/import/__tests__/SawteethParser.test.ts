/**
 * SawteethParser Tests — Sawteeth binary (SWTD) format detection and parsing
 *
 * Detection: bytes[0..3] = 'SWTD' (0x53, 0x57, 0x54, 0x44).
 * Text variant 'SWTT' is NOT supported by this parser.
 */
import { describe, it, expect } from 'vitest';
import { isSawteethFormat, parseSawteethFile } from '../formats/SawteethParser';

// Craft a minimal valid Sawteeth SWTD buffer
function makeSawteethBuffer(): Uint8Array {
  // 'SWTD' + version(2) + spsPal(2, stVersion>=900) + channelCount(1)
  // We use version=882 (< 900) so no spsPal field is read
  // Layout: SWTD(4) + version(2) + channelCount(1) + ...
  // stVersion=100 (< 900) => no spsPal; then 1 channel
  // Channel: left(1)+right(1)+len u16(2)+lLoop skipped(stVersion<910)+rLoop skipped(stVersion<1200)
  //   + steps: len x {part(1)+transp(1)+dAmp(1)}
  // Then partCount(1) + parts, then instrumentCountRaw(1) + instruments, then breakPCount(1)
  // Then null-terminated name, author, part names, instrument names

  const buf = new Uint8Array(200).fill(0);

  // Magic 'SWTD'
  buf[0] = 0x53; buf[1] = 0x57; buf[2] = 0x54; buf[3] = 0x44;

  // version = 100 (< 900, no spsPal)
  buf[4] = 0x00; buf[5] = 0x64;

  let off = 6;

  // channelCount = 1
  buf[off++] = 1;

  // Channel 0: left=0, right=0, len=1 (1 step)
  buf[off++] = 0;   // left
  buf[off++] = 0;   // right
  buf[off++] = 0x00; buf[off++] = 0x01; // len = 1
  // (no lLoop since stVersion<910, no rLoop since stVersion<1200)
  // 1 step: part=0, transp=0, dAmp=0
  buf[off++] = 0; buf[off++] = 0; buf[off++] = 0;

  // partCount = 1
  buf[off++] = 1;
  // Part 0: sps=4, len=1
  buf[off++] = 4; // sps = 4 (>= 1)
  buf[off++] = 1; // len = 1
  // 1 step: ins=0, eff=0, note=0
  buf[off++] = 0; buf[off++] = 0; buf[off++] = 0;

  // instrumentCountRaw = 1 (actual = 2: dummy + 1 real)
  buf[off++] = 1;

  // Instrument 1:
  // filterPoints = 1
  buf[off++] = 1;
  // filter: time=0, lev=0
  buf[off++] = 0; buf[off++] = 0;
  // ampPoints = 1
  buf[off++] = 1;
  // amp: time=0, lev=0
  buf[off++] = 0; buf[off++] = 0;
  // filterMode=0, clipModeBoost=0, vibS=1, vibD=1, pwmS=1, pwmD=1, res=0, sps=30
  buf[off++] = 0; buf[off++] = 0; buf[off++] = 1; buf[off++] = 1;
  buf[off++] = 1; buf[off++] = 1; buf[off++] = 0; buf[off++] = 30;
  // stVersion<900: combined byte: len=1 (0x01 & 0x7F = 1), loop = (0x01 & 1) ? 0 : 0
  buf[off++] = 0x01; // len=1, loop=0
  // 1 InsStep: combined=0, note=0
  buf[off++] = 0; buf[off++] = 0;

  // breakPCount = 0
  buf[off++] = 0;

  // Name: null-terminated empty
  buf[off++] = 0;
  // Author: null-terminated empty
  buf[off++] = 0;
  // Part 0 name: null-terminated empty
  buf[off++] = 0;
  // Instrument 1 name: null-terminated empty
  buf[off++] = 0;

  return buf;
}

describe('isSawteethFormat', () => {
  it('detects valid SWTD buffer', () => {
    expect(isSawteethFormat(makeSawteethBuffer())).toBe(true);
  });

  it('rejects SWTT (text variant not supported)', () => {
    const buf = makeSawteethBuffer();
    buf[3] = 0x54; // 'T' instead of 'D' -> 'SWTT'
    expect(isSawteethFormat(buf)).toBe(false);
  });

  it('rejects wrong magic', () => {
    const buf = new Uint8Array(64).fill(0);
    expect(isSawteethFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isSawteethFormat(new Uint8Array(5))).toBe(false);
  });
});

describe('parseSawteethFile', () => {
  it('parses minimal SWTD buffer without returning null', () => {
    const result = parseSawteethFile(makeSawteethBuffer(), 'test.st');
    expect(result).not.toBeNull();
  });

  it('returns null for invalid buffer', () => {
    expect(parseSawteethFile(new Uint8Array(64), 'bad.st')).toBeNull();
  });

  it('produces expected format when valid', () => {
    const song = parseSawteethFile(makeSawteethBuffer(), 'test.st');
    expect(song).not.toBeNull();
    if (song) {
      expect(song.format).toBe('SAW');
      expect(song.numChannels).toBeGreaterThan(0);
    }
  });
});
