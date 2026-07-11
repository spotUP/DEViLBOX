import { it, expect } from 'vitest';
import {
  resolveMaxTraxLoadBytes,
  encodeMaxTrax,
} from '@/lib/import/formats/maxtrax/maxtraxFormat';
import type { MaxTraxData } from '@/lib/import/formats/maxtrax/maxtraxFormat';

// Minimal hand-built MaxTraxData: 1 score, 2 events, no microtonal table.
// headerRaw encodes: magic(4) + tempo(2) + flags(2) + numScores(2) = 10 bytes.
function makeData(): MaxTraxData {
  const headerRaw = new Uint8Array(10);
  // 'MXTX'
  headerRaw[0] = 0x4d; headerRaw[1] = 0x58; headerRaw[2] = 0x54; headerRaw[3] = 0x58;
  // tempo = 120 (big-endian u16)
  headerRaw[4] = 0x00; headerRaw[5] = 0x78;
  // flags = 0 (no microtonal table)
  headerRaw[6] = 0x00; headerRaw[7] = 0x00;
  // numScores = 1 (big-endian u16)
  headerRaw[8] = 0x00; headerRaw[9] = 0x01;

  return {
    tempo: 120,
    flags: 0,
    headerRaw,
    scores: [
      {
        events: [
          { command: 0x3c, data: 0x11, startTime: 0,  stopTime: 24 },
          { command: 0xff, data: 0x00, startTime: 48, stopTime: 0  },
        ],
      },
    ],
    tailRaw: new Uint8Array([0x00, 0x00]), // numSamples=0
  };
}

it('returns encoded store bytes when MaxTraxData is present — NOT the raw file bytes', () => {
  const data = makeData();

  // rawBytes is intentionally different from what encodeMaxTrax(data) would produce
  // (all 0xAA, same length — ensures they are distinguishable).
  const rawBytes = new Uint8Array(32).fill(0xaa);

  const result = resolveMaxTraxLoadBytes(data, rawBytes);
  expect(result).toBeInstanceOf(ArrayBuffer);

  const got = new Uint8Array(result!);
  const expected = encodeMaxTrax(data);

  // Must be byte-equal to encodeMaxTrax(data) — the store is the single source of truth.
  expect(got.length).toBe(expected.length);
  expect(got).toEqual(expected);

  // Must NOT be the raw bytes.
  expect(got[0]).not.toBe(0xaa);
});

it('returns raw bytes as an ArrayBuffer when data is null', () => {
  const raw = new Uint8Array([0x4d, 0x58, 0x54, 0x58, 0x01]);
  const result = resolveMaxTraxLoadBytes(null, raw);
  expect(result).toBeInstanceOf(ArrayBuffer);
  const got = new Uint8Array(result!);
  expect(got).toEqual(raw);
});

it('returns undefined when both data and rawFileData are null/undefined', () => {
  expect(resolveMaxTraxLoadBytes(null, null)).toBeUndefined();
  expect(resolveMaxTraxLoadBytes(null, undefined)).toBeUndefined();
});
