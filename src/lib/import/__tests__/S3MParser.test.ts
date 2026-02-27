import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isS3MFormat, parseS3MFile } from '../formats/S3MParser';

const S3M_FILE = resolve(
  import.meta.dirname,
  '../../../../server/data/modland-cache/files/pub__modules__Screamtracker 3__- unknown__1 (1).s3m'
);

function loadFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isS3MFormat', () => {
  it('detects valid S3M by SCRM magic', () => {
    const ab = loadFile(S3M_FILE);
    expect(isS3MFormat(ab)).toBe(true);
  });

  it('rejects all-zero data', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(isS3MFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 48 bytes', () => {
    const buf = new Uint8Array(16).fill(0);
    expect(isS3MFormat(buf.buffer)).toBe(false);
  });
});

describe('parseS3MFile — 1 (1).s3m (- unknown)', () => {
  it('parses without throwing', () => {
    const ab = loadFile(S3M_FILE);
    expect(() => parseS3MFile(ab, '1 (1).s3m')).not.toThrow();
  });

  it('returns correct format and basic metadata', () => {
    const ab = loadFile(S3M_FILE);
    const song = parseS3MFile(ab, '1 (1).s3m');
    expect(song.format).toBe('S3M');
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has a valid song order list', () => {
    const ab = loadFile(S3M_FILE);
    const song = parseS3MFile(ab, '1 (1).s3m');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has patterns', () => {
    const ab = loadFile(S3M_FILE);
    const song = parseS3MFile(ab, '1 (1).s3m');
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('has instruments', () => {
    const ab = loadFile(S3M_FILE);
    const song = parseS3MFile(ab, '1 (1).s3m');
    expect(song.instruments.length).toBeGreaterThan(0);
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    console.log(`1 (1).s3m: ${song.instruments.length} instruments, ${withPcm.length} with PCM`);
  });
});
