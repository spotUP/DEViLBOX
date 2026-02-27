/**
 * ImagesMusicSystemParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isImagesMusicSystemFormat, parseImagesMusicSystemFile } from '../formats/ImagesMusicSystemParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const IMS_DIR = resolve(REF, 'Images Music System/4-Mat');
const FILE1 = resolve(IMS_DIR, 'beast-busters.ims');
const FILE2 = resolve(IMS_DIR, 'shadow_dancer-am1-3ch.ims');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isImagesMusicSystemFormat', () => {
  it('detects beast-busters.ims', () => {
    expect(isImagesMusicSystemFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects shadow_dancer-am1-3ch.ims', () => {
    expect(isImagesMusicSystemFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isImagesMusicSystemFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseImagesMusicSystemFile — beast-busters.ims', () => {
  it('parses without throwing', () => {
    expect(() => parseImagesMusicSystemFile(loadBuf(FILE1), 'beast-busters.ims')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseImagesMusicSystemFile(loadBuf(FILE1), 'beast-busters.ims');
    const report = analyzeFormat(song, 'beast-busters.ims');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseImagesMusicSystemFile — shadow_dancer-am1-3ch.ims', () => {
  it('parses without throwing', () => {
    expect(() => parseImagesMusicSystemFile(loadBuf(FILE2), 'shadow_dancer-am1-3ch.ims')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseImagesMusicSystemFile(loadBuf(FILE2), 'shadow_dancer-am1-3ch.ims');
    const report = analyzeFormat(song, 'shadow_dancer-am1-3ch.ims');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
