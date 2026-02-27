/**
 * AMFParser Tests
 * Integration tests for AMF (DSMI / ASYLUM) detection and parsing against real files.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isAMFFormat, parseAMFFile } from '../formats/AMFParser';

const LIBXMP_DATA = resolve(
  import.meta.dirname,
  '../../../../Reference Code/NostalgicPlayer-main/Source/Ports/Tests/LibXmp.Test/Data'
);
const AVOID    = resolve(LIBXMP_DATA, 'M/Avoid.amf');              // DSMI v8
const NOTE7F   = resolve(LIBXMP_DATA, 'Format_Dsmi_Note7f.amf');  // DSMI v14

function loadAMF(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe('isAMFFormat', () => {
  it('detects DSMI AMF v8 (Avoid.amf)', () => {
    expect(isAMFFormat(loadAMF(AVOID))).toBe(true);
  });

  it('detects DSMI AMF v14 (Format_Dsmi_Note7f.amf)', () => {
    expect(isAMFFormat(loadAMF(NOTE7F))).toBe(true);
  });

  it('rejects all-zero buffer', () => {
    const buf = new Uint8Array(64).fill(0);
    expect(isAMFFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 4 bytes', () => {
    const buf = new Uint8Array(2).fill(0x41);
    expect(isAMFFormat(buf.buffer)).toBe(false);
  });
});

// ── DSMI AMF v8 parsing ───────────────────────────────────────────────────────

describe('parseAMFFile — Avoid.amf (DSMI v8)', () => {
  it('parses without throwing', async () => {
    const ab = loadAMF(AVOID);
    await expect(parseAMFFile(ab, 'Avoid.amf')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const song = await parseAMFFile(loadAMF(AVOID), 'Avoid.amf');
    expect(song.format).toBe('MOD'); // AMF uses MOD as the TrackerFormat equivalent
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const song = await parseAMFFile(loadAMF(AVOID), 'Avoid.amf');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const song = await parseAMFFile(loadAMF(AVOID), 'Avoid.amf');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const song = await parseAMFFile(loadAMF(AVOID), 'Avoid.amf');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`Avoid: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});

// ── DSMI AMF v14 parsing ──────────────────────────────────────────────────────

describe('parseAMFFile — Format_Dsmi_Note7f.amf (DSMI v14)', () => {
  it('parses without throwing', async () => {
    const ab = loadAMF(NOTE7F);
    await expect(parseAMFFile(ab, 'Format_Dsmi_Note7f.amf')).resolves.toBeDefined();
  });

  it('returns correct format', async () => {
    const song = await parseAMFFile(loadAMF(NOTE7F), 'Format_Dsmi_Note7f.amf');
    expect(song.format).toBe('MOD'); // AMF uses MOD as the TrackerFormat equivalent
    expect(song.numChannels).toBeGreaterThan(0);
  });

  it('has patterns', async () => {
    const song = await parseAMFFile(loadAMF(NOTE7F), 'Format_Dsmi_Note7f.amf');
    expect(song.patterns.length).toBeGreaterThan(0);
  });
});
