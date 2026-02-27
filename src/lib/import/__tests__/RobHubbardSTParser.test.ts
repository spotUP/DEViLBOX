/**
 * RobHubbardSTParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isRobHubbardSTFormat, parseRobHubbardSTFile } from '../formats/RobHubbardSTParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const RHO_DIR = resolve(REF, 'Rob Hubbard ST/Rob Hubbard');
const FILE1 = resolve(RHO_DIR, 'battleships.rho');
const FILE2 = resolve(RHO_DIR, 'goldrunner.rho');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isRobHubbardSTFormat', () => {
  it('detects battleships.rho', () => {
    expect(isRobHubbardSTFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects goldrunner.rho', () => {
    expect(isRobHubbardSTFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isRobHubbardSTFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseRobHubbardSTFile — battleships.rho', () => {
  it('parses without throwing', () => {
    expect(() => parseRobHubbardSTFile(loadBuf(FILE1), 'battleships.rho')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseRobHubbardSTFile(loadBuf(FILE1), 'battleships.rho');
    const report = analyzeFormat(song, 'battleships.rho');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseRobHubbardSTFile — goldrunner.rho', () => {
  it('parses without throwing', () => {
    expect(() => parseRobHubbardSTFile(loadBuf(FILE2), 'goldrunner.rho')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseRobHubbardSTFile(loadBuf(FILE2), 'goldrunner.rho');
    const report = analyzeFormat(song, 'goldrunner.rho');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
