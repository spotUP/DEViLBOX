import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isGDMFormat, parseGDMFile } from '../formats/GDMParser';

const MARSHMELLOW = resolve(
  import.meta.dirname,
  '../../../../Reference Music/General DigiMusic/Bishop/marshmellow dreams.gdm'
);
const RAINY = resolve(
  import.meta.dirname,
  '../../../../Reference Music/General DigiMusic/Bishop/rainy sunday night.gdm'
);

function loadFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isGDMFormat', () => {
  it('detects valid GDM by magic', () => {
    const ab = loadFile(MARSHMELLOW);
    expect(isGDMFormat(ab)).toBe(true);
  });

  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(isGDMFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 48 bytes', () => {
    const buf = new Uint8Array(16).fill(0);
    expect(isGDMFormat(buf.buffer)).toBe(false);
  });
});

describe('parseGDMFile — marshmellow dreams.gdm (Bishop)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(MARSHMELLOW);
    await expect(parseGDMFile(ab, 'marshmellow dreams.gdm')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(MARSHMELLOW);
    const song = await parseGDMFile(ab, 'marshmellow dreams.gdm');
    expect(typeof song.format).toBe('string');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(MARSHMELLOW);
    const song = await parseGDMFile(ab, 'marshmellow dreams.gdm');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(MARSHMELLOW);
    const song = await parseGDMFile(ab, 'marshmellow dreams.gdm');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(MARSHMELLOW);
    const song = await parseGDMFile(ab, 'marshmellow dreams.gdm');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`marshmellow dreams.gdm: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});

describe('parseGDMFile — rainy sunday night.gdm (Bishop)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(RAINY);
    await expect(parseGDMFile(ab, 'rainy sunday night.gdm')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(RAINY);
    const song = await parseGDMFile(ab, 'rainy sunday night.gdm');
    expect(typeof song.format).toBe('string');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(RAINY);
    const song = await parseGDMFile(ab, 'rainy sunday night.gdm');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(RAINY);
    const song = await parseGDMFile(ab, 'rainy sunday night.gdm');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(RAINY);
    const song = await parseGDMFile(ab, 'rainy sunday night.gdm');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`rainy sunday night.gdm: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});
