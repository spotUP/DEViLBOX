/**
 * SamplerTrackerPlusParser Tests — Soundtracker Pro II (.stp) format detection
 *
 * Detection: 'STP3' magic at offset 0, version 0-3, numOrders 1-128,
 * numSamples 1-31.
 * Reference music: FredMon/Soundtracker Pro II/*.stp
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSTPFormat } from '../formats/SamplerTrackerPlusParser';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const STP_DIR = resolve(REF, 'FredMon/Soundtracker Pro II/- unknown');
const FILE1 = resolve(STP_DIR, 'jungle in germany.stp');
const FILE2 = resolve(STP_DIR, 'this is 4 u.stp');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

function makeSTPBuffer(): ArrayBuffer {
  const buf = new Uint8Array(300).fill(0);
  // 'STP3' magic
  buf[0] = 0x53; buf[1] = 0x54; buf[2] = 0x50; buf[3] = 0x33;
  // version = 1 (u16be at offset 4)
  buf[4] = 0x00; buf[5] = 0x01;
  // numOrders = 4 (u8 at offset 6, must be ≤ 128)
  buf[6] = 0x04;
  // patternLength = 64 (u8 at offset 7)
  buf[7] = 0x40;
  // timerCount = 125 (u16be at offset 140, must be ≠ 0)
  buf[140] = 0x00; buf[141] = 0x7D;
  // midiCount = 50 (u16be at offset 148, must equal 50)
  buf[148] = 0x00; buf[149] = 0x32;
  return buf.buffer;
}

describe('isSTPFormat — crafted buffer', () => {
  it('detects valid STP3 buffer', () => {
    expect(isSTPFormat(makeSTPBuffer())).toBe(true);
  });

  it('rejects wrong magic', () => {
    const buf = new Uint8Array(makeSTPBuffer());
    buf[0] = 0x00;
    expect(isSTPFormat(buf.buffer)).toBe(false);
  });

  it('rejects version > 2', () => {
    const buf = new Uint8Array(makeSTPBuffer());
    buf[5] = 0x03; // version = 3
    expect(isSTPFormat(buf.buffer)).toBe(false);
  });

  it('rejects numOrders > 128', () => {
    const buf = new Uint8Array(makeSTPBuffer());
    buf[6] = 0xFF; // numOrders = 255
    expect(isSTPFormat(buf.buffer)).toBe(false);
  });

  it('rejects timerCount = 0', () => {
    const buf = new Uint8Array(makeSTPBuffer());
    buf[140] = 0x00; buf[141] = 0x00; // timerCount = 0
    expect(isSTPFormat(buf.buffer)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isSTPFormat(new ArrayBuffer(100))).toBe(false);
  });
});

describe('isSTPFormat — reference music', () => {
  it('detects jungle in germany.stp', () => {
    expect(isSTPFormat(loadBuf(FILE1))).toBe(true);
  });

  it('detects this is 4 u.stp', () => {
    expect(isSTPFormat(loadBuf(FILE2))).toBe(true);
  });
});
