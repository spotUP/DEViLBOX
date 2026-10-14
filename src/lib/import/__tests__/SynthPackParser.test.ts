import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSynthPackFormat, parseSynthPackFile } from '../formats/SynthPackParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../public/data/songs');
const FILE_ACT01 = resolve(REF, 'synth-pack/centerbase soft.osp');
const FILE_ACT02 = resolve(REF, 'formats/centerbase_soft.osp');
const FILE_DYTER = resolve(REF, 'synth-pack/centerbase soft.osp');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isSynthPackFormat', () => {
  it('detects centerbase act01.osp', () => expect(isSynthPackFormat(loadBuf(FILE_ACT01), 'centerbase act01.osp')).toBe(true));
  it('detects centerbase act02.osp', () => expect(isSynthPackFormat(loadBuf(FILE_ACT02), 'centerbase act02.osp')).toBe(true));
  it('detects dyter07 hiscore.osp', () => expect(isSynthPackFormat(loadBuf(FILE_DYTER), 'dyter07 hiscore.osp')).toBe(true));
  it('rejects a zeroed buffer', () => expect(isSynthPackFormat(new ArrayBuffer(256))).toBe(false));
});

describe('parseSynthPackFile — centerbase act01.osp', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseSynthPackFile(loadBuf(FILE_ACT01), 'centerbase act01.osp'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'centerbase act01.osp');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSynthPackFile — centerbase act02.osp', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseSynthPackFile(loadBuf(FILE_ACT02), 'centerbase act02.osp'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'centerbase act02.osp');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSynthPackFile — dyter07 hiscore.osp', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseSynthPackFile(loadBuf(FILE_DYTER), 'dyter07 hiscore.osp'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'dyter07 hiscore.osp');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
