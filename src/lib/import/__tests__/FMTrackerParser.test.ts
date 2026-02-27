/**
 * FMTrackerParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isFMTrackerFormat, parseFMTrackerFile } from '../formats/FMTrackerParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DIR = resolve(REF, 'Follin Player II/Tim Follin');
const FILE1 = resolve(DIR, 'ghouls n ghosts title.tf');
const FILE2 = resolve(DIR, 'ghouls n ghosts count.tf');

function loadU8(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

describe('isFMTrackerFormat', () => {
  it('detects ghouls n ghosts title.tf', () => {
    expect(isFMTrackerFormat(loadU8(FILE1))).toBe(true);
  });
  it('detects ghouls n ghosts count.tf', () => {
    expect(isFMTrackerFormat(loadU8(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isFMTrackerFormat(new Uint8Array(256))).toBe(false);
  });
});

describe('parseFMTrackerFile — ghouls n ghosts title.tf', () => {
  it('parses without returning null', () => {
    const song = parseFMTrackerFile(loadU8(FILE1), 'ghouls n ghosts title.tf');
    expect(song).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseFMTrackerFile(loadU8(FILE1), 'ghouls n ghosts title.tf');
    expect(song).not.toBeNull();
    const report = analyzeFormat(song!, 'ghouls n ghosts title.tf');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseFMTrackerFile — ghouls n ghosts count.tf', () => {
  it('parses without returning null', () => {
    const song = parseFMTrackerFile(loadU8(FILE2), 'ghouls n ghosts count.tf');
    expect(song).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseFMTrackerFile(loadU8(FILE2), 'ghouls n ghosts count.tf');
    expect(song).not.toBeNull();
    const report = analyzeFormat(song!, 'ghouls n ghosts count.tf');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
