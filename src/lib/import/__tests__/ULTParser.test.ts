import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isULTFormat, parseULTFile } from '../formats/ULTParser';

const ULT_FILE = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Ultra Tracker/Beavis/coop-DiPo/seasons.ult'
);

function loadFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isULTFormat', () => {
  it('detects valid ULT file', () => {
    const ab = loadFile(ULT_FILE);
    expect(isULTFormat(ab)).toBe(true);
  });

  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(isULTFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 15 bytes', () => {
    const buf = new Uint8Array(8).fill(0);
    expect(isULTFormat(buf.buffer)).toBe(false);
  });
});

describe('parseULTFile — seasons.ult (Beavis/coop-DiPo)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(ULT_FILE);
    await expect(parseULTFile(ab, 'seasons.ult')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(ULT_FILE);
    const song = await parseULTFile(ab, 'seasons.ult');
    expect(song.format).toBe('MOD');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(ULT_FILE);
    const song = await parseULTFile(ab, 'seasons.ult');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(ULT_FILE);
    const song = await parseULTFile(ab, 'seasons.ult');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(ULT_FILE);
    const song = await parseULTFile(ab, 'seasons.ult');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`seasons.ult: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});
