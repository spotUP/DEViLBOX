/**
 * JasonBrookeParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isJasonBrookeFormat, parseJasonBrookeFile } from '../formats/JasonBrookeParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const JB_DIR = resolve(REF, 'Jason Brooke/Jason Brooke');
const FILE1 = resolve(JB_DIR, '1943.jb');
const FILE2 = resolve(JB_DIR, 'afterburner ii.jb');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isJasonBrookeFormat', () => {
  it('detects 1943.jb', () => {
    expect(isJasonBrookeFormat(loadBuf(FILE1), '1943.jb')).toBe(true);
  });
  it('detects afterburner ii.jb', () => {
    expect(isJasonBrookeFormat(loadBuf(FILE2), 'afterburner ii.jb')).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isJasonBrookeFormat(new ArrayBuffer(64))).toBe(false);
  });
  it('rejects a buffer that is too short', () => {
    expect(isJasonBrookeFormat(new ArrayBuffer(8))).toBe(false);
  });
});

describe('parseJasonBrookeFile — 1943.jb', () => {
  it('parses without throwing', () => {
    expect(() => parseJasonBrookeFile(loadBuf(FILE1), '1943.jb')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseJasonBrookeFile(loadBuf(FILE1), '1943.jb');
    const report = analyzeFormat(song, '1943.jb');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('creates 1 placeholder instrument (no names in format)', () => {
    const song = parseJasonBrookeFile(loadBuf(FILE1), '1943.jb');
    // Jason Brooke is a compiled 68k executable — single placeholder instrument
    expect(song.instruments).toHaveLength(1);
    expect(song.instruments[0].name).toBe('Sample 1');
  });

  it('has 4 channels', () => {
    const song = parseJasonBrookeFile(loadBuf(FILE1), '1943.jb');
    expect(song.numChannels).toBe(4);
  });

  it('derives module name from filename', () => {
    const song = parseJasonBrookeFile(loadBuf(FILE1), '1943.jb');
    expect(song.name).toContain('1943');
  });
});

describe('parseJasonBrookeFile — afterburner ii.jb', () => {
  it('parses without throwing', () => {
    expect(() => parseJasonBrookeFile(loadBuf(FILE2), 'afterburner ii.jb')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseJasonBrookeFile(loadBuf(FILE2), 'afterburner ii.jb');
    const report = analyzeFormat(song, 'afterburner ii.jb');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('creates 1 placeholder instrument', () => {
    const song = parseJasonBrookeFile(loadBuf(FILE2), 'afterburner ii.jb');
    expect(song.instruments).toHaveLength(1);
  });
});
