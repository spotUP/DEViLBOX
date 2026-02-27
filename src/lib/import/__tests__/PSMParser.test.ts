/**
 * PSMParser Tests
 * Integration tests for PSM (new PSM / PSM16) detection and parsing against real files.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isPSMFormat, parsePSMFile } from '../formats/PSMParser';

const LIBXMP_DATA = resolve(
  import.meta.dirname,
  '../../../../Reference Code/NostalgicPlayer-main/Source/Ports/Tests/LibXmp.Test/Data'
);
const EP_SONG1  = resolve(LIBXMP_DATA, 'M/EP-Song1.psm');    // new PSM ("PSM ")
const SILVER    = resolve(LIBXMP_DATA, 'M/Silver-Song0.psm'); // PSM16 ("PSM\xFE")

function loadPSM(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe('isPSMFormat', () => {
  it('detects new PSM by "PSM " + "FILE" magic', () => {
    expect(isPSMFormat(loadPSM(EP_SONG1))).toBe(true);
  });

  it('detects PSM16 by "PSM\\xFE" magic with valid header', () => {
    expect(isPSMFormat(loadPSM(SILVER))).toBe(true);
  });

  it('rejects all-zero buffer', () => {
    expect(isPSMFormat(new Uint8Array(200).fill(0))).toBe(false);
  });

  it('rejects buffer shorter than 12 bytes', () => {
    expect(isPSMFormat(new Uint8Array(8).fill(0x50))).toBe(false);
  });
});

// ── New PSM parsing ───────────────────────────────────────────────────────────

describe('parsePSMFile — EP-Song1.psm (new PSM)', () => {
  it('parses without returning null', () => {
    const bytes = loadPSM(EP_SONG1);
    const song = parsePSMFile(bytes, 'EP-Song1.psm');
    expect(song).not.toBeNull();
  });

  it('returns correct format and basic metadata', () => {
    const song = parsePSMFile(loadPSM(EP_SONG1), 'EP-Song1.psm')!;
    expect(song.format).toBe('S3M'); // PSM uses S3M as the TrackerFormat equivalent
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', () => {
    const song = parsePSMFile(loadPSM(EP_SONG1), 'EP-Song1.psm')!;
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', () => {
    const song = parsePSMFile(loadPSM(EP_SONG1), 'EP-Song1.psm')!;
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', () => {
    const song = parsePSMFile(loadPSM(EP_SONG1), 'EP-Song1.psm')!;
    expect(song.instruments.length).toBeGreaterThan(0);
  });
});

// ── PSM16 parsing ─────────────────────────────────────────────────────────────

describe('parsePSMFile — Silver-Song0.psm (PSM16)', () => {
  it('parses without returning null', () => {
    const bytes = loadPSM(SILVER);
    const song = parsePSMFile(bytes, 'Silver-Song0.psm');
    expect(song).not.toBeNull();
  });

  it('returns correct format', () => {
    const song = parsePSMFile(loadPSM(SILVER), 'Silver-Song0.psm')!;
    expect(song.format).toBe('S3M'); // PSM uses S3M as the TrackerFormat equivalent
    expect(song.numChannels).toBeGreaterThan(0);
  });

  it('has patterns', () => {
    const song = parsePSMFile(loadPSM(SILVER), 'Silver-Song0.psm')!;
    expect(song.patterns.length).toBeGreaterThan(0);
  });
});
