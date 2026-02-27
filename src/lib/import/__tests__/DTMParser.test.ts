import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDTMFormat, parseDTMFile } from '../formats/DTMParser';

const CALL_ME = resolve(
  import.meta.dirname,
  '../../../../Reference Music/FredMon/Digital Tracker DTM/Adamsky/call me.dtm'
);
const REAL_DREAMS = resolve(
  import.meta.dirname,
  '../../../../Reference Music/FredMon/Digital Tracker DTM/Adamsky/real dreams.dtm'
);

function loadFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isDTMFormat', () => {
  it('detects valid DTM by magic', () => {
    const ab = loadFile(CALL_ME);
    expect(isDTMFormat(ab)).toBe(true);
  });

  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(isDTMFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 48 bytes', () => {
    const buf = new Uint8Array(16).fill(0);
    expect(isDTMFormat(buf.buffer)).toBe(false);
  });
});

describe('parseDTMFile — call me.dtm (Adamsky)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(CALL_ME);
    await expect(parseDTMFile(ab, 'call me.dtm')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(CALL_ME);
    const song = await parseDTMFile(ab, 'call me.dtm');
    expect(typeof song.format).toBe('string');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(CALL_ME);
    const song = await parseDTMFile(ab, 'call me.dtm');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(CALL_ME);
    const song = await parseDTMFile(ab, 'call me.dtm');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(CALL_ME);
    const song = await parseDTMFile(ab, 'call me.dtm');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`call me.dtm: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});

describe('parseDTMFile — real dreams.dtm (Adamsky)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(REAL_DREAMS);
    await expect(parseDTMFile(ab, 'real dreams.dtm')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(REAL_DREAMS);
    const song = await parseDTMFile(ab, 'real dreams.dtm');
    expect(typeof song.format).toBe('string');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(REAL_DREAMS);
    const song = await parseDTMFile(ab, 'real dreams.dtm');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(REAL_DREAMS);
    const song = await parseDTMFile(ab, 'real dreams.dtm');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(REAL_DREAMS);
    const song = await parseDTMFile(ab, 'real dreams.dtm');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`real dreams.dtm: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});
