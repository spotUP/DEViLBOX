/**
 * TimeTrackerParser Tests — TimeTracker format detection
 *
 * Detection: bytes[0..2] = 'TMK' (0x54, 0x4D, 0x4B), bytes[3] != 0.
 * File prefix: TMK.*
 */
import { describe, it, expect } from 'vitest';
import { isTimeTrackerFormat, parseTimeTrackerFile } from '../formats/TimeTrackerParser';

function makeTimeTrackerBuffer(): ArrayBuffer {
  const buf = new Uint8Array(20).fill(0);
  buf[0] = 0x54; buf[1] = 0x4d; buf[2] = 0x4b; // 'TMK'
  buf[3] = 0x01;  // subsong count = 1 (non-zero)
  buf[5] = 0x04;  // sample count = 4 & 0x7F = 4
  return buf.buffer;
}

describe('isTimeTrackerFormat', () => {
  it('detects valid TimeTracker buffer', () => {
    expect(isTimeTrackerFormat(makeTimeTrackerBuffer())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isTimeTrackerFormat(new Uint8Array(makeTimeTrackerBuffer()))).toBe(true);
  });

  it('rejects wrong magic (not TMK)', () => {
    const buf = new Uint8Array(makeTimeTrackerBuffer());
    buf[0] = 0x54; buf[1] = 0x4d; buf[2] = 0x00;
    expect(isTimeTrackerFormat(buf)).toBe(false);
  });

  it('rejects byte[3] = 0 (subsong count must be non-zero)', () => {
    const buf = new Uint8Array(makeTimeTrackerBuffer());
    buf[3] = 0x00;
    expect(isTimeTrackerFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isTimeTrackerFormat(new ArrayBuffer(3))).toBe(false);
  });

  it('rejects zeroed buffer', () => {
    expect(isTimeTrackerFormat(new ArrayBuffer(20))).toBe(false);
  });
});

describe('parseTimeTrackerFile', () => {
  it('parses without throwing', () => {
    const song = parseTimeTrackerFile(makeTimeTrackerBuffer(), 'TMK.testsong');
    expect(song).toBeDefined();
    expect(song.name).toContain('TimeTracker');
  });

  it('uses subsong count from byte[3]', () => {
    const buf = new Uint8Array(makeTimeTrackerBuffer());
    buf[3] = 0x03; // 3 subsongs
    const song = parseTimeTrackerFile(buf.buffer, 'TMK.multi');
    expect(song.name).toContain('3 subsongs');
  });
});
