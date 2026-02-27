import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSTMFormat, parseSTMFile } from '../formats/STMParser';

const STM_FILE = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Scream Tracker 2/BIG/slideshow i.stm'
);

function loadFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isSTMFormat', () => {
  it('detects valid STM file', () => {
    const ab = loadFile(STM_FILE);
    expect(isSTMFormat(ab)).toBe(true);
  });

  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(isSTMFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 48 bytes', () => {
    const buf = new Uint8Array(16).fill(0);
    expect(isSTMFormat(buf.buffer)).toBe(false);
  });
});

describe('parseSTMFile — slideshow i.stm (BIG)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(STM_FILE);
    await expect(parseSTMFile(ab, 'slideshow i.stm')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(STM_FILE);
    const song = await parseSTMFile(ab, 'slideshow i.stm');
    expect(song.format).toBe('MOD');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(STM_FILE);
    const song = await parseSTMFile(ab, 'slideshow i.stm');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(STM_FILE);
    const song = await parseSTMFile(ab, 'slideshow i.stm');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(STM_FILE);
    const song = await parseSTMFile(ab, 'slideshow i.stm');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`slideshow i.stm: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});
