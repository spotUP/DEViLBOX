import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isZoundMonitorFormat, parseZoundMonitorFile } from '../formats/ZoundMonitorParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE_HITTHEROAD = resolve(REF, 'Zoundmonitor/AJ/hittheroad.sng');
const FILE_SONJA = resolve(REF, 'Zoundmonitor/AJ/sonjavanveen.sng');
const FILE_UNIVERSE = resolve(REF, 'Zoundmonitor/Sffen/universe.sng');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isZoundMonitorFormat', () => {
  it('detects hittheroad.sng', () => expect(isZoundMonitorFormat(loadBuf(FILE_HITTHEROAD), 'hittheroad.sng')).toBe(true));
  it('detects sonjavanveen.sng', () => expect(isZoundMonitorFormat(loadBuf(FILE_SONJA), 'sonjavanveen.sng')).toBe(true));
  it('detects universe.sng (Sffen)', () => expect(isZoundMonitorFormat(loadBuf(FILE_UNIVERSE), 'universe.sng')).toBe(true));
  it('rejects a zeroed buffer', () => expect(isZoundMonitorFormat(new ArrayBuffer(256))).toBe(false));
});

describe('parseZoundMonitorFile — hittheroad.sng', () => {
  it('reports format capabilities', async () => {
    let song;
    try { song = await parseZoundMonitorFile(loadBuf(FILE_HITTHEROAD), 'hittheroad.sng'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'hittheroad.sng');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseZoundMonitorFile — sonjavanveen.sng', () => {
  it('reports format capabilities', async () => {
    let song;
    try { song = await parseZoundMonitorFile(loadBuf(FILE_SONJA), 'sonjavanveen.sng'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'sonjavanveen.sng');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseZoundMonitorFile — universe.sng', () => {
  it('reports format capabilities', async () => {
    let song;
    try { song = await parseZoundMonitorFile(loadBuf(FILE_UNIVERSE), 'universe.sng'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'universe.sng');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
