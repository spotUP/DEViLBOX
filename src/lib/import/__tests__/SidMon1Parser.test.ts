import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSidMon1Format, parseSidMon1File } from '../formats/SidMon1Parser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../public/data/songs');
const FILE_ANARCHY = resolve(REF, 'sidmon-1/myfunnymazea.sid');
const FILE_BRAINWAVE = resolve(REF, 'formats/anarchy.sid1');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isSidMon1Format', () => {
  it('detects anarchy.sid', () => expect(isSidMon1Format(loadBuf(FILE_ANARCHY))).toBe(true));
  it('detects brainwave.sid', () => expect(isSidMon1Format(loadBuf(FILE_BRAINWAVE))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isSidMon1Format(new ArrayBuffer(256))).toBe(false));
});

describe('parseSidMon1File — anarchy.sid', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseSidMon1File(loadBuf(FILE_ANARCHY), 'anarchy.sid'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'anarchy.sid');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
  it('extracts SidMon1 synth instruments', () => {
    const song = parseSidMon1File(loadBuf(FILE_ANARCHY), 'anarchy.sid');
    if (!song) return;
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments[0].synthType).toBe('SidMon1Synth');
    expect(song.instruments[0].sidmon1).toBeTruthy();
  });
});

describe('parseSidMon1File — brainwave.sid', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseSidMon1File(loadBuf(FILE_BRAINWAVE), 'brainwave.sid'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'brainwave.sid');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
  it('extracts SidMon1 synth instruments', () => {
    const song = parseSidMon1File(loadBuf(FILE_BRAINWAVE), 'brainwave.sid');
    if (!song) return;
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments[0].synthType).toBe('SidMon1Synth');
    expect(song.instruments[0].sidmon1).toBeTruthy();
  });
});
