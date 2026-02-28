/**
 * Null-guard tests for compiled 68k Amiga executable formats.
 *
 * Formats covered:
 *
 *   Dave Lowe New (.dln)      — Binary packed data; no instrument name table.
 *   David Whittaker (.dw)     — Compiled 68k executable; no instrument name table.
 *   Jochen Hippel (.hip)      — Compiled 68k executable; no instrument name table.
 *   Jochen Hippel 7V (.hip7)  — Compiled 68k executable; no instrument name table.
 *   Rob Hubbard (.rh, .rho)   — Compiled 68k executable; no instrument name table.
 *   Mark II (.mk2, .mkii)     — Compiled 68k executable; no instrument name table.
 *
 * tryExtractInstrumentNames must return null for all of these to prevent the
 * generic 22-byte ASCII scanner from producing false positives on machine-code
 * instructions, OS version strings, or other incidental text.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { tryExtractInstrumentNames } from '../formats/UADEParser';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

function loadBuf(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ── Dave Lowe New (.dln) ───────────────────────────────────────────────────

describe('tryExtractInstrumentNames — Dave Lowe New (.dln) null guard', () => {
  const DLN_FILE = resolve(REF, 'Dave Lowe New/Dave Lowe/balrog.dln');

  it('returns null for a real .dln file', () => {
    expect(tryExtractInstrumentNames(loadBuf(DLN_FILE), 'dln')).toBeNull();
  });

  it('returns null for dl_deli extension (alternate Dave Lowe extension)', () => {
    // Use balrog.dln content — both extensions share the same null guard.
    expect(tryExtractInstrumentNames(loadBuf(DLN_FILE), 'dl_deli')).toBeNull();
  });

  it('returns null for crafted buffer with plausible ASCII content', () => {
    const buf = new Uint8Array(256);
    const text = 'Bass Guitar  Snare Drum  Hi-Hat Open Lead Synth  ';
    for (let i = 0; i < text.length && i < buf.length; i++) buf[i] = text.charCodeAt(i);
    expect(tryExtractInstrumentNames(buf.buffer, 'dln')).toBeNull();
  });
});

// ── David Whittaker (.dw) ─────────────────────────────────────────────────

describe('tryExtractInstrumentNames — David Whittaker (.dw) null guard', () => {
  const DW_FILE = resolve(REF, 'David Whittaker/David Whittaker/crossbow-title.dw');

  it('returns null for a real .dw file (Crossbow)', () => {
    expect(tryExtractInstrumentNames(loadBuf(DW_FILE), 'dw')).toBeNull();
  });

  it('returns null for dwold extension (alternate David Whittaker extension)', () => {
    expect(tryExtractInstrumentNames(loadBuf(DW_FILE), 'dwold')).toBeNull();
  });

  it('returns null for crafted buffer with plausible ASCII content', () => {
    const buf = new Uint8Array(256).fill(0x48); // 0x48 = 'H' (also movem.l opcode byte)
    const text = 'Lead Piano   Bass Guitar  Hi-Hat Open  ';
    for (let i = 0; i < text.length && i < buf.length; i++) buf[i] = text.charCodeAt(i);
    expect(tryExtractInstrumentNames(buf.buffer, 'dw')).toBeNull();
  });
});

// ── Jochen Hippel (.hip, .hip7) ───────────────────────────────────────────

describe('tryExtractInstrumentNames — Jochen Hippel (.hip) null guard', () => {
  const HIP_FILE  = resolve(REF, 'Hippel/Jochen Hippel/warp (ingame 2).hip');
  const HIP7_FILE = resolve(REF, 'Hippel 7V/Jochen Hippel/lethalxcess-intro.hip7');

  it('returns null for a real .hip file (Warp ingame 2)', () => {
    expect(tryExtractInstrumentNames(loadBuf(HIP_FILE), 'hip')).toBeNull();
  });

  it('returns null for a real .hip7 file (Lethal Xcess intro)', () => {
    expect(tryExtractInstrumentNames(loadBuf(HIP7_FILE), 'hip7')).toBeNull();
  });

  it('returns null for crafted buffer with plausible ASCII content', () => {
    const buf = new Uint8Array(256);
    // Simulate text that the generic scanner might match (22-byte printable blocks)
    const text = 'Bass Synth   Lead Brass  Drums Kit    Strings   ';
    for (let i = 0; i < text.length && i < buf.length; i++) buf[i] = text.charCodeAt(i);
    expect(tryExtractInstrumentNames(buf.buffer, 'hip')).toBeNull();
  });
});

// ── Rob Hubbard (.rh, .rho) ───────────────────────────────────────────────

describe('tryExtractInstrumentNames — Rob Hubbard (.rh, .rho) null guard', () => {
  const RH_FILE = resolve(REF, 'Rob Hubbard/- unknown/sanxion.rh');

  it('returns null for a real .rh file (Sanxion)', () => {
    expect(tryExtractInstrumentNames(loadBuf(RH_FILE), 'rh')).toBeNull();
  });

  it('returns null for rho extension (alternate Rob Hubbard extension)', () => {
    expect(tryExtractInstrumentNames(loadBuf(RH_FILE), 'rho')).toBeNull();
  });

  it('returns null for crafted buffer with plausible ASCII content', () => {
    const buf = new Uint8Array(256);
    const text = 'Bass Line    Lead Synth   Hi-Hat       Kick Drum  ';
    for (let i = 0; i < text.length && i < buf.length; i++) buf[i] = text.charCodeAt(i);
    expect(tryExtractInstrumentNames(buf.buffer, 'rh')).toBeNull();
  });
});

// ── Mark II (.mk2, .mkii, .mkiio) ─────────────────────────────────────────

describe('tryExtractInstrumentNames — Mark II (.mk2) null guard', () => {
  const MK2_FILE = resolve(REF, 'Mark II/Andreas Starr/astarrsonix.mk2');

  it('returns null for a real .mk2 file (astarrsonix)', () => {
    expect(tryExtractInstrumentNames(loadBuf(MK2_FILE), 'mk2')).toBeNull();
  });

  it('returns null for mkii extension (alternate Mark II extension)', () => {
    expect(tryExtractInstrumentNames(loadBuf(MK2_FILE), 'mkii')).toBeNull();
  });

  it('returns null for mkiio extension (Mark II outro variant)', () => {
    expect(tryExtractInstrumentNames(loadBuf(MK2_FILE), 'mkiio')).toBeNull();
  });

  it('returns null for crafted buffer with plausible ASCII content', () => {
    const buf = new Uint8Array(256);
    const text = 'Kick Drum    Bass Synth   Lead Pad     Hi Hat     ';
    for (let i = 0; i < text.length && i < buf.length; i++) buf[i] = text.charCodeAt(i);
    expect(tryExtractInstrumentNames(buf.buffer, 'mk2')).toBeNull();
  });
});
