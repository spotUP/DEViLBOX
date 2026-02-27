/**
 * FuturePlayerParser Tests - Format capability analysis
 *
 * API: isFuturePlayerFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *      parseFuturePlayerFile(buffer: ArrayBuffer, filename: string): TrackerSong  (sync)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isFuturePlayerFormat, parseFuturePlayerFile } from '../formats/FuturePlayerParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FP_DIR = resolve(REF, 'Future Player/Paul Van Der Valk');
const FILE1 = resolve(FP_DIR, 'hybris ingame.fp');
const FILE2 = resolve(FP_DIR, 'hybris title.fp');
const FILE3 = resolve(FP_DIR, 'imploder drums.fp');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe('isFuturePlayerFormat', () => {
  it('detects hybris ingame.fp', () => {
    expect(isFuturePlayerFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects hybris title.fp', () => {
    expect(isFuturePlayerFormat(loadBuf(FILE2))).toBe(true);
  });
  it('detects imploder drums.fp', () => {
    expect(isFuturePlayerFormat(loadBuf(FILE3))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isFuturePlayerFormat(new ArrayBuffer(64))).toBe(false);
  });
});

// ── Parse FILE1 — hybris ingame.fp ───────────────────────────────────────────

describe('parseFuturePlayerFile — hybris ingame.fp', () => {
  it('parses without throwing', () => {
    expect(() =>
      parseFuturePlayerFile(loadBuf(FILE1), 'hybris ingame.fp')
    ).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseFuturePlayerFile(loadBuf(FILE1), 'hybris ingame.fp');
    const report = analyzeFormat(song, 'hybris ingame.fp');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE2 — hybris title.fp ────────────────────────────────────────────

describe('parseFuturePlayerFile — hybris title.fp', () => {
  it('parses without throwing', () => {
    expect(() =>
      parseFuturePlayerFile(loadBuf(FILE2), 'hybris title.fp')
    ).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseFuturePlayerFile(loadBuf(FILE2), 'hybris title.fp');
    const report = analyzeFormat(song, 'hybris title.fp');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE3 — imploder drums.fp ──────────────────────────────────────────

describe('parseFuturePlayerFile — imploder drums.fp', () => {
  it('parses without throwing', () => {
    expect(() =>
      parseFuturePlayerFile(loadBuf(FILE3), 'imploder drums.fp')
    ).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseFuturePlayerFile(loadBuf(FILE3), 'imploder drums.fp');
    const report = analyzeFormat(song, 'imploder drums.fp');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
