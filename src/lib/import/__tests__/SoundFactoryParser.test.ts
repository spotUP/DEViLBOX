import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSoundFactoryFormat, parseSoundFactoryFile } from '../formats/SoundFactoryParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

const FILE1 = resolve(REF, 'SoundFactory/- unknown/axelf.psf');
const FILE2 = resolve(REF, 'SoundFactory/- unknown/christies song.psf');

function loadBytes(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

describe('isSoundFactoryFormat', () => {
  it('detects FILE1', () => {
    expect(isSoundFactoryFormat(loadBytes(FILE1))).toBe(true);
  });
  it('detects FILE2', () => {
    expect(isSoundFactoryFormat(loadBytes(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isSoundFactoryFormat(new Uint8Array(256))).toBe(false);
  });
});

describe('parseSoundFactoryFile — axelf.psf', () => {
  it('parses without returning null', () => {
    expect(parseSoundFactoryFile(loadBytes(FILE1), 'axelf.psf')).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseSoundFactoryFile(loadBytes(FILE1), 'axelf.psf');
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'axelf.psf');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSoundFactoryFile — christies song.psf', () => {
  it('parses without returning null', () => {
    expect(parseSoundFactoryFile(loadBytes(FILE2), 'christies song.psf')).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseSoundFactoryFile(loadBytes(FILE2), 'christies song.psf');
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'christies song.psf');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
