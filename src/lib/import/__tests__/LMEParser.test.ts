/**
 * LMEParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isLMEFormat, parseLMEFile } from '../formats/LMEParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DIR = resolve(REF, 'Leggless Music Editor/Leggless');
const FILE1 = resolve(DIR, 'ninjaspirit.lme');
const FILE2 = resolve(DIR, 'ninjaspirit demo.lme');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isLMEFormat', () => {
  it('detects ninjaspirit.lme', () => {
    expect(isLMEFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects ninjaspirit demo.lme', () => {
    expect(isLMEFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isLMEFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseLMEFile — ninjaspirit.lme', () => {
  it('parses without throwing', () => {
    expect(() => parseLMEFile(loadBuf(FILE1), 'ninjaspirit.lme')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseLMEFile(loadBuf(FILE1), 'ninjaspirit.lme');
    const report = analyzeFormat(song, 'ninjaspirit.lme');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseLMEFile — ninjaspirit demo.lme', () => {
  it('parses without throwing', () => {
    expect(() => parseLMEFile(loadBuf(FILE2), 'ninjaspirit demo.lme')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseLMEFile(loadBuf(FILE2), 'ninjaspirit demo.lme');
    const report = analyzeFormat(song, 'ninjaspirit demo.lme');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
