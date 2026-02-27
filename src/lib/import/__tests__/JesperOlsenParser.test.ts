/**
 * JesperOlsenParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isJesperOlsenFormat, parseJesperOlsenFile } from '../formats/JesperOlsenParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const JO_DIR = resolve(REF, 'Jesper Olsen/Jesper Olsen');
const FILE1 = resolve(JO_DIR, 'georgglaxo ingame.jo');
const FILE2 = resolve(JO_DIR, 'georgglaxo title.jo');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isJesperOlsenFormat', () => {
  it('detects georgglaxo ingame.jo', () => {
    expect(isJesperOlsenFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects georgglaxo title.jo', () => {
    expect(isJesperOlsenFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isJesperOlsenFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseJesperOlsenFile — georgglaxo ingame.jo', () => {
  it('parses without throwing', () => {
    expect(() => parseJesperOlsenFile(loadBuf(FILE1), 'georgglaxo ingame.jo')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseJesperOlsenFile(loadBuf(FILE1), 'georgglaxo ingame.jo');
    const report = analyzeFormat(song, 'georgglaxo ingame.jo');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseJesperOlsenFile — georgglaxo title.jo', () => {
  it('parses without throwing', () => {
    expect(() => parseJesperOlsenFile(loadBuf(FILE2), 'georgglaxo title.jo')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseJesperOlsenFile(loadBuf(FILE2), 'georgglaxo title.jo');
    const report = analyzeFormat(song, 'georgglaxo title.jo');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
