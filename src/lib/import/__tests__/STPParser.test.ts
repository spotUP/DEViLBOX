import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSTPFormat, parseSTPFile } from '../formats/STPParser';

const JUNGLE = resolve(
  import.meta.dirname,
  '../../../../Reference Music/FredMon/Soundtracker Pro II/- unknown/jungle in germany.stp'
);
const THIS_IS_4_U = resolve(
  import.meta.dirname,
  '../../../../Reference Music/FredMon/Soundtracker Pro II/- unknown/this is 4 u.stp'
);

function loadFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isSTPFormat', () => {
  it('detects valid STP by magic', () => {
    const ab = loadFile(JUNGLE);
    expect(isSTPFormat(ab)).toBe(true);
  });

  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(isSTPFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 48 bytes', () => {
    const buf = new Uint8Array(16).fill(0);
    expect(isSTPFormat(buf.buffer)).toBe(false);
  });
});

describe('parseSTPFile — jungle in germany.stp (- unknown)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(JUNGLE);
    await expect(parseSTPFile(ab, 'jungle in germany.stp')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(JUNGLE);
    const song = await parseSTPFile(ab, 'jungle in germany.stp');
    expect(typeof song.format).toBe('string');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(JUNGLE);
    const song = await parseSTPFile(ab, 'jungle in germany.stp');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(JUNGLE);
    const song = await parseSTPFile(ab, 'jungle in germany.stp');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(JUNGLE);
    const song = await parseSTPFile(ab, 'jungle in germany.stp');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`jungle in germany.stp: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});

describe('parseSTPFile — this is 4 u.stp (- unknown)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(THIS_IS_4_U);
    await expect(parseSTPFile(ab, 'this is 4 u.stp')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(THIS_IS_4_U);
    const song = await parseSTPFile(ab, 'this is 4 u.stp');
    expect(typeof song.format).toBe('string');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(THIS_IS_4_U);
    const song = await parseSTPFile(ab, 'this is 4 u.stp');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(THIS_IS_4_U);
    const song = await parseSTPFile(ab, 'this is 4 u.stp');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(THIS_IS_4_U);
    const song = await parseSTPFile(ab, 'this is 4 u.stp');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`this is 4 u.stp: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});
