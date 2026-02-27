/**
 * FCParser Tests - Format capability analysis
 *
 * API: parseFCMetadata(buffer: ArrayBuffer): FCMetadata | null
 *      parseFCFile(buffer: ArrayBuffer, filename: string): TrackerSong  (sync, throws on bad magic)
 *
 * Variants:
 *   FC 1.3: magic "FC13" or "SMOD"  (.fc / .smod)
 *   FC 1.4: magic "FC14"             (.fc)
 *   BSI:    magic "SMOD" with .bsi extension
 *   TF (Follin Player II): uses FC13/FC14 format
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFCMetadata, parseFCFile } from '../formats/FCParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE_SMOD = resolve(REF, 'Future Composer 1.3/FTB/commando.smod');
const FILE_FC14 = resolve(REF, 'Future Composer 1.4/EC-Rider/starglide1.fc');
const FILE_BSI  = resolve(REF, 'Future Composer BSI/Tony Bybell/newtek.bsi');
const FILE_TF   = resolve(REF, 'Follin Player II/Tim Follin/ghouls n ghosts title.tf');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ── Detection via parseFCMetadata ─────────────────────────────────────────────

describe('parseFCMetadata', () => {
  it('detects commando.smod (FC13/SMOD)', () => {
    expect(parseFCMetadata(loadBuf(FILE_SMOD))).not.toBeNull();
  });
  it('detects starglide1.fc (FC14)', () => {
    expect(parseFCMetadata(loadBuf(FILE_FC14))).not.toBeNull();
  });
  it('detects newtek.bsi (FC BSI / SMOD magic)', () => {
    expect(parseFCMetadata(loadBuf(FILE_BSI))).not.toBeNull();
  });
  it('detects ghouls n ghosts title.tf (Follin Player / FC)', () => {
    expect(parseFCMetadata(loadBuf(FILE_TF))).not.toBeNull();
  });
  it('rejects a zeroed buffer', () => {
    expect(parseFCMetadata(new ArrayBuffer(64))).toBeNull();
  });
});

// ── Parse FC13/SMOD — commando.smod ──────────────────────────────────────────

describe('parseFCFile — commando.smod', () => {
  it('parses without throwing', () => {
    expect(() => parseFCFile(loadBuf(FILE_SMOD), 'commando.smod')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseFCFile(loadBuf(FILE_SMOD), 'commando.smod');
    const report = analyzeFormat(song, 'commando.smod');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FC14 — starglide1.fc ────────────────────────────────────────────────

describe('parseFCFile — starglide1.fc', () => {
  it('parses without throwing', () => {
    expect(() => parseFCFile(loadBuf(FILE_FC14), 'starglide1.fc')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseFCFile(loadBuf(FILE_FC14), 'starglide1.fc');
    const report = analyzeFormat(song, 'starglide1.fc');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FC BSI — newtek.bsi ─────────────────────────────────────────────────

describe('parseFCFile — newtek.bsi', () => {
  it('parses without throwing', () => {
    expect(() => parseFCFile(loadBuf(FILE_BSI), 'newtek.bsi')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseFCFile(loadBuf(FILE_BSI), 'newtek.bsi');
    const report = analyzeFormat(song, 'newtek.bsi');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse Follin Player II — ghouls n ghosts title.tf ────────────────────────

describe('parseFCFile — ghouls n ghosts title.tf', () => {
  it('parses without throwing', () => {
    expect(() =>
      parseFCFile(loadBuf(FILE_TF), 'ghouls n ghosts title.tf')
    ).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseFCFile(loadBuf(FILE_TF), 'ghouls n ghosts title.tf');
    const report = analyzeFormat(song, 'ghouls n ghosts title.tf');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
