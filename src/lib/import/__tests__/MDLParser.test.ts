import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isMDLFormat, parseMDLFile } from '../formats/MDLParser';

const MAYDAY = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Digi Trakker/Golden Zolee/mayday.mdl'
);
const FOUR_S = resolve(
  import.meta.dirname,
  '../../../../Reference Music/Digi Trakker/Golden Zolee/4s.mdl'
);

function loadFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isMDLFormat', () => {
  it('detects valid MDL by DMDL magic', () => {
    const ab = loadFile(MAYDAY);
    expect(isMDLFormat(ab)).toBe(true);
  });

  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(isMDLFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 4 bytes', () => {
    const buf = new Uint8Array(2).fill(0);
    expect(isMDLFormat(buf.buffer)).toBe(false);
  });
});

describe('parseMDLFile — mayday.mdl (Golden Zolee)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(MAYDAY);
    await expect(parseMDLFile(ab, 'mayday.mdl')).resolves.toBeDefined();
  });

  it('returns correct format and basic metadata', async () => {
    const ab = loadFile(MAYDAY);
    const song = await parseMDLFile(ab, 'mayday.mdl');
    expect(song.format).toBe('MOD');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', async () => {
    const ab = loadFile(MAYDAY);
    const song = await parseMDLFile(ab, 'mayday.mdl');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', async () => {
    const ab = loadFile(MAYDAY);
    const song = await parseMDLFile(ab, 'mayday.mdl');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const ab = loadFile(MAYDAY);
    const song = await parseMDLFile(ab, 'mayday.mdl');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`mayday.mdl: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});

describe('parseMDLFile — 4s.mdl (Golden Zolee)', () => {
  it('parses without throwing', async () => {
    const ab = loadFile(FOUR_S);
    await expect(parseMDLFile(ab, '4s.mdl')).resolves.toBeDefined();
  });

  it('has instruments', async () => {
    const ab = loadFile(FOUR_S);
    const song = await parseMDLFile(ab, '4s.mdl');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`4s.mdl: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});
