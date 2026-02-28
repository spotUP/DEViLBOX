/**
 * Delitracker Custom Parser Tests
 *
 * Delitracker Custom modules (.cus, .cust, .custom) are compiled 68k Amiga
 * executables. They carry no static instrument name table — only raw PCM
 * pointers embedded in player code. tryExtractInstrumentNames must return null
 * to prevent the generic 22-byte scanner from producing false positives from
 * DELIRIUM markers, Amiga OS version strings, and embedded text.
 *
 * Format detection is via isUADEFormat (extension lookup — no magic check
 * is possible because these are compiled executables with no fixed header).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isUADEFormat } from '../formats/UADEParser';
import { tryExtractInstrumentNames } from '../formats/UADEParser';

const REF = resolve(import.meta.dirname, '../../../../Reference Music/Delitracker Custom');
const CUS_FILE   = resolve(REF, 'Raymond Tobey/Skyfox.cus');
const CUST_FILE  = resolve(REF, 'The Psychos/TJC-MusicInvasion1-intro.cust');

function loadBuf(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ── Extension detection ────────────────────────────────────────────────────

describe('isUADEFormat — Delitracker Custom', () => {
  it('detects .cus extension', () => {
    expect(isUADEFormat('Skyfox.cus')).toBe(true);
  });

  it('detects .cust extension', () => {
    expect(isUADEFormat('intro.cust')).toBe(true);
  });

  it('detects .custom extension', () => {
    expect(isUADEFormat('module.custom')).toBe(true);
  });
});

// ── Instrument name extraction — null guard ────────────────────────────────

describe('tryExtractInstrumentNames — Delitracker Custom null guard', () => {
  it('returns null for a real .cus file (Skyfox)', () => {
    expect(tryExtractInstrumentNames(loadBuf(CUS_FILE), 'cus')).toBeNull();
  });

  it('returns null for a real .cust file', () => {
    expect(tryExtractInstrumentNames(loadBuf(CUST_FILE), 'cust')).toBeNull();
  });

  it('returns null for a crafted .custom buffer (prevents false positives)', () => {
    // Craft a buffer with plausible text that the generic scanner might match
    const buf = new Uint8Array(512);
    // Simulate DELIRIUM-style text starting at offset 0x24
    const text = 'DELIRIUM$VER: Test - Custom Module, adapted by Demo/Team';
    for (let i = 0; i < text.length && 0x24 + i < buf.length; i++) {
      buf[0x24 + i] = text.charCodeAt(i);
    }
    expect(tryExtractInstrumentNames(buf.buffer, 'custom')).toBeNull();
  });
});
