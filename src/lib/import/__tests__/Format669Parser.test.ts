import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { is669Format, parse669File } from '../formats/Format669Parser';

const FONETAG = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Composer 669/Brother Mike/fonetag.669'
);
const SPEED_FIGHTER = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Composer 669/Brother Mike/speed fighter.669'
);

function loadFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('is669Format', () => {
  it('detects valid 669 by magic', () => {
    const ab = loadFile(FONETAG);
    expect(is669Format(ab)).toBe(true);
  });

  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(is669Format(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 48 bytes', () => {
    const buf = new Uint8Array(16).fill(0);
    expect(is669Format(buf.buffer)).toBe(false);
  });
});

describe('parse669File — fonetag.669 (Brother Mike)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(FONETAG);
    await expect(parse669File(ab, 'fonetag.669')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(FONETAG);
    const song = await parse669File(ab, 'fonetag.669');
    expect(typeof song.format).toBe('string');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(FONETAG);
    const song = await parse669File(ab, 'fonetag.669');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(FONETAG);
    const song = await parse669File(ab, 'fonetag.669');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(FONETAG);
    const song = await parse669File(ab, 'fonetag.669');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`fonetag.669: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});

describe('parse669File — speed fighter.669 (Brother Mike)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(SPEED_FIGHTER);
    await expect(parse669File(ab, 'speed fighter.669')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(SPEED_FIGHTER);
    const song = await parse669File(ab, 'speed fighter.669');
    expect(typeof song.format).toBe('string');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(SPEED_FIGHTER);
    const song = await parse669File(ab, 'speed fighter.669');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(SPEED_FIGHTER);
    const song = await parse669File(ab, 'speed fighter.669');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(SPEED_FIGHTER);
    const song = await parse669File(ab, 'speed fighter.669');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`speed fighter.669: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});
