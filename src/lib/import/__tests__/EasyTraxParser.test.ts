/**
 * EasyTraxParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isEasyTraxFormat, parseEasyTraxFile } from '../formats/EasyTraxParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DIR = resolve(REF, 'EarAche/- unknown');
const FILE1 = resolve(DIR, 'bladerunner.ea');
const FILE2 = resolve(DIR, 'skydance.ea');

function loadU8(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

describe('isEasyTraxFormat', () => {
  it('detects bladerunner.ea', () => {
    expect(isEasyTraxFormat(loadU8(FILE1))).toBe(true);
  });
  it('detects skydance.ea', () => {
    expect(isEasyTraxFormat(loadU8(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isEasyTraxFormat(new Uint8Array(64))).toBe(false);
  });
});

describe('parseEasyTraxFile — bladerunner.ea', () => {
  it('parses without returning null', () => {
    const song = parseEasyTraxFile(loadU8(FILE1), 'bladerunner.ea');
    expect(song).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseEasyTraxFile(loadU8(FILE1), 'bladerunner.ea');
    expect(song).not.toBeNull();
    const report = analyzeFormat(song!, 'bladerunner.ea');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseEasyTraxFile — skydance.ea', () => {
  it('parses without returning null', () => {
    const song = parseEasyTraxFile(loadU8(FILE2), 'skydance.ea');
    expect(song).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseEasyTraxFile(loadU8(FILE2), 'skydance.ea');
    expect(song).not.toBeNull();
    const report = analyzeFormat(song!, 'skydance.ea');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
