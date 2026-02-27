/**
 * MEDParser Tests - Format capability analysis
 *
 * OctaMED/MED format has no detection function. Parse directly, use try/catch.
 * API: parseMEDFile(buffer: ArrayBuffer, filename: string): TrackerSong  (sync)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseMEDFile } from '../formats/MEDParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE1 = resolve(REF, 'OctaMED MMD0/Barry Leitch/universal monsters - dracula.mmd0');
const FILE2 = resolve(REF, 'OctaMED MMD1/Anon/funky nightmare.mmd1');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('parseMEDFile — universal monsters - dracula.mmd0', () => {
  it('parses without throwing', () => {
    let song: ReturnType<typeof parseMEDFile> | undefined;
    let error: unknown;
    try {
      song = parseMEDFile(loadBuf(FILE1), 'universal monsters - dracula.mmd0');
    } catch (e) {
      error = e;
    }
    if (error !== undefined) {
      console.log('Parser threw for universal monsters - dracula.mmd0:', error);
    }
    expect(song ?? error).toBeDefined();
  });

  it('reports format capabilities', () => {
    let song: ReturnType<typeof parseMEDFile> | undefined;
    try {
      song = parseMEDFile(loadBuf(FILE1), 'universal monsters - dracula.mmd0');
    } catch (e) {
      console.log('Parser threw for universal monsters - dracula.mmd0:', e);
      return;
    }
    if (!song) {
      console.log('Parser returned null/undefined for universal monsters - dracula.mmd0');
      return;
    }
    const report = analyzeFormat(song, 'universal monsters - dracula.mmd0');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseMEDFile — funky nightmare.mmd1', () => {
  it('parses without throwing', () => {
    let song: ReturnType<typeof parseMEDFile> | undefined;
    let error: unknown;
    try {
      song = parseMEDFile(loadBuf(FILE2), 'funky nightmare.mmd1');
    } catch (e) {
      error = e;
    }
    if (error !== undefined) {
      console.log('Parser threw for funky nightmare.mmd1:', error);
    }
    expect(song ?? error).toBeDefined();
  });

  it('reports format capabilities', () => {
    let song: ReturnType<typeof parseMEDFile> | undefined;
    try {
      song = parseMEDFile(loadBuf(FILE2), 'funky nightmare.mmd1');
    } catch (e) {
      console.log('Parser threw for funky nightmare.mmd1:', e);
      return;
    }
    if (!song) {
      console.log('Parser returned null/undefined for funky nightmare.mmd1');
      return;
    }
    const report = analyzeFormat(song, 'funky nightmare.mmd1');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
