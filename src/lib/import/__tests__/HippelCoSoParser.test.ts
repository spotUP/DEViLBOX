/**
 * HippelCoSoParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isHippelCoSoFormat, parseHippelCoSoFile } from '../formats/HippelCoSoParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const COSO_DIR = resolve(REF, 'Hippel COSO/Jochen Hippel');
const FILE1 = resolve(COSO_DIR, 'a prehistoric tale (intro).hipc');
const FILE2 = resolve(COSO_DIR, 'amberstar (01).hipc');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isHippelCoSoFormat', () => {
  it('detects a prehistoric tale (intro).hipc', () => {
    expect(isHippelCoSoFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects amberstar (01).hipc', () => {
    expect(isHippelCoSoFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isHippelCoSoFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseHippelCoSoFile — a prehistoric tale (intro).hipc', () => {
  it('parses without throwing', async () => {
    await expect(
      parseHippelCoSoFile(loadBuf(FILE1), 'a prehistoric tale (intro).hipc')
    ).resolves.not.toThrow();
  });
  it('reports format capabilities', async () => {
    const song = await parseHippelCoSoFile(loadBuf(FILE1), 'a prehistoric tale (intro).hipc');
    const report = analyzeFormat(song, 'a prehistoric tale (intro).hipc');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
  it('extracts HippelCoSo synth instruments', async () => {
    const song = await parseHippelCoSoFile(loadBuf(FILE1), 'a prehistoric tale (intro).hipc');
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments[0].synthType).toBe('HippelCoSoSynth');
    expect(song.instruments[0].hippelCoso).toBeTruthy();
  });
});

describe('parseHippelCoSoFile — amberstar (01).hipc', () => {
  it('parses without throwing', async () => {
    await expect(
      parseHippelCoSoFile(loadBuf(FILE2), 'amberstar (01).hipc')
    ).resolves.not.toThrow();
  });
  it('reports format capabilities', async () => {
    const song = await parseHippelCoSoFile(loadBuf(FILE2), 'amberstar (01).hipc');
    const report = analyzeFormat(song, 'amberstar (01).hipc');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
  it('extracts HippelCoSo synth instruments', async () => {
    const song = await parseHippelCoSoFile(loadBuf(FILE2), 'amberstar (01).hipc');
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments[0].synthType).toBe('HippelCoSoSynth');
    expect(song.instruments[0].hippelCoso).toBeTruthy();
  });
});
