import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseAdPlugFile } from '@lib/import/formats/AdPlugParser';
import { exportToRAD } from '../AdPlugExporter';

const dir = 'public/data/songs/ad-lib/Reality AdLib Tracker/';
const load = (rel: string) => {
  const b = new Uint8Array(readFileSync(dir + rel));
  return { b, ab: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer };
};
const flagsOf = (o: ArrayBuffer) => new Uint8Array(o)[17];

describe('RAD v1 order jump markers', () => {
  const { b, ab } = load('Nula/positivum.rad'); // order [0..6, 0x82]
  it('parse keeps the marker and unedited export is the source', () => {
    const s = parseAdPlugFile(ab, 'positivum.rad');
    expect(s.radOrderJumps).toEqual([{ pos: 7, target: 2 }]);
    expect(new Uint8Array(exportToRAD(s))).toEqual(b);
  });
  it('an edited jump target is written to the order byte and reads back', () => {
    const s = parseAdPlugFile(ab, 'positivum.rad');
    s.radOrderJumps![0].target = 4;
    const out = exportToRAD(s);
    expect(parseAdPlugFile(out, 'x.rad').radOrderJumps).toEqual([{ pos: 7, target: 4 }]);
    s.radOrderJumps![0].target = 2;
    expect(new Uint8Array(exportToRAD(s))).toEqual(b);
  });
});

describe('RAD v1 slow-timer flag', () => {
  const { ab } = load('Nula/alley cut.rad'); // flags 0xC1
  it('parse reads bit 6; toggling it changes only flags bit 6 on export', () => {
    const s = parseAdPlugFile(ab, 'alley cut.rad');
    expect(s.radSlowTimer).toBe(true);
    s.radSlowTimer = false;
    const out = exportToRAD(s);
    expect(flagsOf(out) & 0x40).toBe(0);
    expect(parseAdPlugFile(out, 'x.rad').radSlowTimer).toBe(false);
    s.radSlowTimer = true;
    expect(flagsOf(exportToRAD(s)) & 0x40).toBe(0x40);
  });
});
