/**
 * HivelyParser.test.ts — integration tests for AHX and HVL format detection and parsing.
 *
 * Parser exports:
 *   parseHivelyBinary(buffer: ArrayBuffer): HivelyModule
 *   parseHivelyFile(buffer: ArrayBuffer, fileName: string): TrackerSong
 *
 * No isHivelyFormat export exists — detection is done inside parseHivelyBinary
 * via magic bytes ('THX' for AHX, 'HVL' for HVL). Tests verify that valid files
 * parse without throwing and that hivelyFileData is set (required for WASM replayer).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseHivelyBinary, parseHivelyFile } from '../formats/HivelyParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

const AHX1 = resolve(REF, 'AHX/Mortimer Twang/amanda.ahx');
const AHX2 = resolve(REF, 'AHX/Mortimer Twang/jennipha.ahx');
const HVL1 = resolve(REF, 'Hively Tracker/chiprolled.hvl');
const HVL2 = resolve(REF, 'Hively Tracker/doobrey_gubbins.hvl');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── parseHivelyBinary — magic byte detection ────────────────────────────────

describe('parseHivelyBinary — AHX magic detection', () => {
  it('parses amanda.ahx without throwing', () => {
    expect(() => parseHivelyBinary(loadBuf(AHX1))).not.toThrow();
  });

  it('identifies amanda.ahx as AHX format', () => {
    const mod = parseHivelyBinary(loadBuf(AHX1));
    expect(mod.format).toBe('AHX');
  });

  it('parses jennipha.ahx without throwing', () => {
    expect(() => parseHivelyBinary(loadBuf(AHX2))).not.toThrow();
  });

  it('identifies jennipha.ahx as AHX format', () => {
    const mod = parseHivelyBinary(loadBuf(AHX2));
    expect(mod.format).toBe('AHX');
  });

  it('rejects a zeroed buffer', () => {
    expect(() => parseHivelyBinary(new ArrayBuffer(64))).toThrow();
  });
});

describe('parseHivelyBinary — HVL magic detection', () => {
  it('parses chiprolled.hvl without throwing', () => {
    expect(() => parseHivelyBinary(loadBuf(HVL1))).not.toThrow();
  });

  it('identifies chiprolled.hvl as HVL format', () => {
    const mod = parseHivelyBinary(loadBuf(HVL1));
    expect(mod.format).toBe('HVL');
  });

  it('parses doobrey_gubbins.hvl without throwing', () => {
    expect(() => parseHivelyBinary(loadBuf(HVL2))).not.toThrow();
  });

  it('identifies doobrey_gubbins.hvl as HVL format', () => {
    const mod = parseHivelyBinary(loadBuf(HVL2));
    expect(mod.format).toBe('HVL');
  });
});

// ── parseHivelyFile — TrackerSong + native playback data ───────────────────

describe('parseHivelyFile — amanda.ahx', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseHivelyFile(loadBuf(AHX1), 'amanda.ahx'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'amanda.ahx');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('sets hivelyFileData for WASM replayer', () => {
    const song = parseHivelyFile(loadBuf(AHX1), 'amanda.ahx');
    const report = analyzeFormat(song, 'amanda.ahx');
    expect(report.hasNativePlaybackData).toBe(true);
  });
});

describe('parseHivelyFile — jennipha.ahx', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseHivelyFile(loadBuf(AHX2), 'jennipha.ahx'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'jennipha.ahx');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('sets hivelyFileData for WASM replayer', () => {
    const song = parseHivelyFile(loadBuf(AHX2), 'jennipha.ahx');
    const report = analyzeFormat(song, 'jennipha.ahx');
    expect(report.hasNativePlaybackData).toBe(true);
  });
});

describe('parseHivelyFile — chiprolled.hvl', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseHivelyFile(loadBuf(HVL1), 'chiprolled.hvl'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'chiprolled.hvl');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('sets hivelyFileData for WASM replayer', () => {
    const song = parseHivelyFile(loadBuf(HVL1), 'chiprolled.hvl');
    const report = analyzeFormat(song, 'chiprolled.hvl');
    expect(report.hasNativePlaybackData).toBe(true);
  });
});

describe('parseHivelyFile — doobrey_gubbins.hvl', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseHivelyFile(loadBuf(HVL2), 'doobrey_gubbins.hvl'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'doobrey_gubbins.hvl');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('sets hivelyFileData for WASM replayer', () => {
    const song = parseHivelyFile(loadBuf(HVL2), 'doobrey_gubbins.hvl');
    const report = analyzeFormat(song, 'doobrey_gubbins.hvl');
    expect(report.hasNativePlaybackData).toBe(true);
  });
});
