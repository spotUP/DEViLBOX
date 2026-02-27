/**
 * Composer667Parser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isComposer667Format, parseComposer667File } from '../formats/Composer667Parser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DIR = resolve(REF, 'Composer 669/Brother Mike');
const FILE1 = resolve(DIR, 'fonetag.669');
const FILE2 = resolve(DIR, 'speed fighter.669');

function loadU8(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

describe('isComposer667Format', () => {
  it('detects fonetag.669', () => {
    expect(isComposer667Format(loadU8(FILE1))).toBe(true);
  });
  it('detects speed fighter.669', () => {
    expect(isComposer667Format(loadU8(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isComposer667Format(new Uint8Array(800))).toBe(false);
  });
});

describe('parseComposer667File — fonetag.669', () => {
  it('parses without returning null', () => {
    const song = parseComposer667File(loadU8(FILE1), 'fonetag.669');
    expect(song).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseComposer667File(loadU8(FILE1), 'fonetag.669');
    expect(song).not.toBeNull();
    const report = analyzeFormat(song!, 'fonetag.669');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseComposer667File — speed fighter.669', () => {
  it('parses without returning null', () => {
    const song = parseComposer667File(loadU8(FILE2), 'speed fighter.669');
    expect(song).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseComposer667File(loadU8(FILE2), 'speed fighter.669');
    expect(song).not.toBeNull();
    const report = analyzeFormat(song!, 'speed fighter.669');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
