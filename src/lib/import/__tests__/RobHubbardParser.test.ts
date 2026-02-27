/**
 * RobHubbardParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isRobHubbardFormat, parseRobHubbardFile } from '../formats/RobHubbardParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const RH_DIR = resolve(REF, 'Rob Hubbard/Rob Hubbard');
const FILE1 = resolve(RH_DIR, 'budokan.rh');
const FILE2 = resolve(RH_DIR, 'flymus.rh');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isRobHubbardFormat', () => {
  it('detects budokan.rh', () => {
    expect(isRobHubbardFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects flymus.rh', () => {
    expect(isRobHubbardFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isRobHubbardFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseRobHubbardFile — budokan.rh', () => {
  it('parses without throwing', async () => {
    await expect(parseRobHubbardFile(loadBuf(FILE1), 'budokan.rh')).resolves.not.toThrow();
  });
  it('reports format capabilities', async () => {
    const song = await parseRobHubbardFile(loadBuf(FILE1), 'budokan.rh');
    const report = analyzeFormat(song, 'budokan.rh');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
  it('extracts RobHubbard instruments with PCM data', async () => {
    const song = await parseRobHubbardFile(loadBuf(FILE1), 'budokan.rh');
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments[0].synthType).toBe('RobHubbardSynth');
    expect(song.instruments[0].robHubbard).toBeTruthy();
    const withPCM = song.instruments.filter(i => (i.robHubbard?.sampleData.length ?? 0) > 0);
    expect(withPCM.length).toBeGreaterThan(0);
  });
});

describe('parseRobHubbardFile — flymus.rh', () => {
  it('parses without throwing', async () => {
    await expect(parseRobHubbardFile(loadBuf(FILE2), 'flymus.rh')).resolves.not.toThrow();
  });
  it('reports format capabilities', async () => {
    const song = await parseRobHubbardFile(loadBuf(FILE2), 'flymus.rh');
    const report = analyzeFormat(song, 'flymus.rh');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
  it('extracts RobHubbard instruments with PCM data', async () => {
    const song = await parseRobHubbardFile(loadBuf(FILE2), 'flymus.rh');
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments[0].synthType).toBe('RobHubbardSynth');
    expect(song.instruments[0].robHubbard).toBeTruthy();
    const withPCM = song.instruments.filter(i => (i.robHubbard?.sampleData.length ?? 0) > 0);
    expect(withPCM.length).toBeGreaterThan(0);
  });
});
