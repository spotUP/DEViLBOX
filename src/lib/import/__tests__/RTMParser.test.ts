import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isRTMFormat, parseRTMFile } from '../formats/RTMParser';

const ALFAOMEG = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Real Tracker/Dr. Bully/alfaomeg.rtm'
);
const BRAINSTORM = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Real Tracker/Dr. Bully/brainstorm.rtm'
);

function loadFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isRTMFormat', () => {
  it('detects valid RTM by magic', () => {
    const ab = loadFile(ALFAOMEG);
    expect(isRTMFormat(ab)).toBe(true);
  });

  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(isRTMFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 48 bytes', () => {
    const buf = new Uint8Array(16).fill(0);
    expect(isRTMFormat(buf.buffer)).toBe(false);
  });
});

describe('parseRTMFile — alfaomeg.rtm (Dr. Bully)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(ALFAOMEG);
    await expect(parseRTMFile(ab, 'alfaomeg.rtm')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(ALFAOMEG);
    const song = await parseRTMFile(ab, 'alfaomeg.rtm');
    expect(typeof song.format).toBe('string');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(ALFAOMEG);
    const song = await parseRTMFile(ab, 'alfaomeg.rtm');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(ALFAOMEG);
    const song = await parseRTMFile(ab, 'alfaomeg.rtm');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(ALFAOMEG);
    const song = await parseRTMFile(ab, 'alfaomeg.rtm');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`alfaomeg.rtm: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});

describe('parseRTMFile — brainstorm.rtm (Dr. Bully)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(BRAINSTORM);
    await expect(parseRTMFile(ab, 'brainstorm.rtm')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(BRAINSTORM);
    const song = await parseRTMFile(ab, 'brainstorm.rtm');
    expect(typeof song.format).toBe('string');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(BRAINSTORM);
    const song = await parseRTMFile(ab, 'brainstorm.rtm');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(BRAINSTORM);
    const song = await parseRTMFile(ab, 'brainstorm.rtm');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(BRAINSTORM);
    const song = await parseRTMFile(ab, 'brainstorm.rtm');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`brainstorm.rtm: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});
