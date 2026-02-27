import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isMTMFormat, parseMTMFile } from '../formats/MTMParser';

const COLOR_OF_RAVE = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Multi Tracker/Alternate Prism/color of rave.mtm'
);
const DREAMER_DREAM = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Multi Tracker/Alternate Prism/dreamer dream.mtm'
);

function loadFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isMTMFormat', () => {
  it('detects valid MTM by MTM magic', () => {
    const ab = loadFile(COLOR_OF_RAVE);
    expect(isMTMFormat(ab)).toBe(true);
  });

  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(isMTMFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 4 bytes', () => {
    const buf = new Uint8Array(2).fill(0);
    expect(isMTMFormat(buf.buffer)).toBe(false);
  });
});

describe('parseXXXFile — color of rave.mtm (Alternate Prism)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(COLOR_OF_RAVE);
    await expect(parseMTMFile(ab, 'color of rave.mtm')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(COLOR_OF_RAVE);
    const song = await parseMTMFile(ab, 'color of rave.mtm');
    expect(song.format).toBe('MOD');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(COLOR_OF_RAVE);
    const song = await parseMTMFile(ab, 'color of rave.mtm');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(COLOR_OF_RAVE);
    const song = await parseMTMFile(ab, 'color of rave.mtm');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(COLOR_OF_RAVE);
    const song = await parseMTMFile(ab, 'color of rave.mtm');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`color of rave.mtm: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});

describe('parseMTMFile — dreamer dream.mtm (Alternate Prism)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(DREAMER_DREAM);
    await expect(parseMTMFile(ab, 'dreamer dream.mtm')).resolves.toBeDefined();
  });

  it('has instruments', async () => {
    const ab = loadFile(DREAMER_DREAM);
    const song = await parseMTMFile(ab, 'dreamer dream.mtm');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`dreamer dream.mtm: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});
