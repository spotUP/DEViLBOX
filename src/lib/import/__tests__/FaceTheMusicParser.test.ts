/**
 * FaceTheMusicParser Tests - Format capability analysis
 *
 * API: isFaceTheMusicFormat(bytes: Uint8Array): boolean
 *      parseFaceTheMusicFile(bytes: Uint8Array, filename: string): TrackerSong | null  (sync)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isFaceTheMusicFormat, parseFaceTheMusicFile } from '../formats/FaceTheMusicParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FTM_DIR = resolve(REF, 'Face The Music/Andre Eickler');
const FILE1 = resolve(FTM_DIR, 'rock.ftm');
const FILE2 = resolve(FTM_DIR, 'stomper.ftm');
const FILE3 = resolve(FTM_DIR, 'bigfunk.ftm');

function loadU8(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe('isFaceTheMusicFormat', () => {
  it('detects rock.ftm', () => {
    expect(isFaceTheMusicFormat(loadU8(FILE1))).toBe(true);
  });
  it('detects stomper.ftm', () => {
    expect(isFaceTheMusicFormat(loadU8(FILE2))).toBe(true);
  });
  it('detects bigfunk.ftm', () => {
    expect(isFaceTheMusicFormat(loadU8(FILE3))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isFaceTheMusicFormat(new Uint8Array(64))).toBe(false);
  });
});

// ── Parse FILE1 — rock.ftm ───────────────────────────────────────────────────

describe('parseFaceTheMusicFile — rock.ftm', () => {
  it('parses without returning null', () => {
    const song = parseFaceTheMusicFile(loadU8(FILE1), 'rock.ftm');
    expect(song).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseFaceTheMusicFile(loadU8(FILE1), 'rock.ftm');
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'rock.ftm');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE2 — stomper.ftm ─────────────────────────────────────────────────

describe('parseFaceTheMusicFile — stomper.ftm', () => {
  it('parses without returning null', () => {
    const song = parseFaceTheMusicFile(loadU8(FILE2), 'stomper.ftm');
    expect(song).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseFaceTheMusicFile(loadU8(FILE2), 'stomper.ftm');
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'stomper.ftm');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE3 — bigfunk.ftm ─────────────────────────────────────────────────

describe('parseFaceTheMusicFile — bigfunk.ftm', () => {
  it('parses without returning null', () => {
    const song = parseFaceTheMusicFile(loadU8(FILE3), 'bigfunk.ftm');
    expect(song).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseFaceTheMusicFile(loadU8(FILE3), 'bigfunk.ftm');
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'bigfunk.ftm');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
