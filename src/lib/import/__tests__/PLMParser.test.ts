import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isPLMFormat, parsePLMFile } from '../formats/PLMParser';

const BLOODY_MARY = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Disorder Tracker 2/Statix/bloody mary.plm'
);
const CALM = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Disorder Tracker 2/Statix/calm.plm'
);

function loadFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isPLMFormat', () => {
  it('detects valid PLM by magic', () => {
    const ab = loadFile(BLOODY_MARY);
    expect(isPLMFormat(ab)).toBe(true);
  });

  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(isPLMFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 48 bytes', () => {
    const buf = new Uint8Array(16).fill(0);
    expect(isPLMFormat(buf.buffer)).toBe(false);
  });
});

describe('parsePLMFile — bloody mary.plm (Statix)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(BLOODY_MARY);
    await expect(parsePLMFile(ab, 'bloody mary.plm')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(BLOODY_MARY);
    const song = await parsePLMFile(ab, 'bloody mary.plm');
    expect(typeof song.format).toBe('string');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(BLOODY_MARY);
    const song = await parsePLMFile(ab, 'bloody mary.plm');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(BLOODY_MARY);
    const song = await parsePLMFile(ab, 'bloody mary.plm');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(BLOODY_MARY);
    const song = await parsePLMFile(ab, 'bloody mary.plm');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`bloody mary.plm: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});

describe('parsePLMFile — calm.plm (Statix)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(CALM);
    await expect(parsePLMFile(ab, 'calm.plm')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(CALM);
    const song = await parsePLMFile(ab, 'calm.plm');
    expect(typeof song.format).toBe('string');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(CALM);
    const song = await parsePLMFile(ab, 'calm.plm');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(CALM);
    const song = await parsePLMFile(ab, 'calm.plm');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(CALM);
    const song = await parsePLMFile(ab, 'calm.plm');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`calm.plm: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});
