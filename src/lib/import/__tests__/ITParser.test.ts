import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isITFormat, parseITFile } from '../formats/ITParser';

const ORBITER = resolve(
  import.meta.dirname,
  '../../../../server/data/modland-cache/files/pub__modules__Impulsetracker__Krembo__orbiter.it'
);
const SUNCHILD = resolve(
  import.meta.dirname,
  '../../../../server/data/modland-cache/files/pub__modules__Impulsetracker__Radix__sunchild.it'
);

function loadFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('ITParser — detection', () => {
  it('detects valid IT by IMPM magic', () => {
    const ab = loadFile(ORBITER);
    expect(isITFormat(ab)).toBe(true);
  });

  it('rejects non-IT data', () => {
    const buf = new Uint8Array(64).fill(0);
    expect(isITFormat(buf.buffer)).toBe(false);
  });
});

describe('ITParser — orbiter.it (Krembo)', () => {
  it('parses without throwing', () => {
    const ab = loadFile(ORBITER);
    expect(() => parseITFile(ab, 'orbiter.it')).not.toThrow();
  });

  it('has correct metadata', () => {
    const ab = loadFile(ORBITER);
    const song = parseITFile(ab, 'orbiter.it');
    expect(song.format).toBe('IT');
    expect(song.name.length).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
    expect(song.numChannels).toBeGreaterThan(0);
  });

  it('has sampled instruments with PCM data', () => {
    const ab = loadFile(ORBITER);
    const song = parseITFile(ab, 'orbiter.it');
    // Filter to instruments that actually have PCM (some IT instruments may be empty placeholders)
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 44
    );
    expect(withPcm.length).toBeGreaterThan(0);
    let totalPcm = 0;
    for (const inst of withPcm) {
      totalPcm += inst.sample!.audioBuffer!.byteLength;
    }
    console.log(`orbiter: ${withPcm.length} sampled, ${(totalPcm / 1024).toFixed(0)} KB PCM`);
  });

  it('has patterns with cells', () => {
    const ab = loadFile(ORBITER);
    const song = parseITFile(ab, 'orbiter.it');
    expect(song.patterns.length).toBeGreaterThan(0);
    const nonEmpty = song.patterns.some(p =>
      p.channels.some(ch => ch.rows.some(r => r.note > 0))
    );
    expect(nonEmpty).toBe(true);
  });
});

describe('ITParser — sunchild.it (Radix)', () => {
  it('parses without throwing', () => {
    const ab = loadFile(SUNCHILD);
    expect(() => parseITFile(ab, 'sunchild.it')).not.toThrow();
  });

  it('has sampled instruments with PCM data', () => {
    const ab = loadFile(SUNCHILD);
    const song = parseITFile(ab, 'sunchild.it');
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 44
    );
    expect(withPcm.length).toBeGreaterThan(0);
    let totalPcm = 0;
    for (const inst of withPcm) {
      totalPcm += inst.sample!.audioBuffer!.byteLength;
    }
    expect(totalPcm).toBeGreaterThan(0);
    console.log(`sunchild: ${withPcm.length} sampled, ${(totalPcm / 1024).toFixed(0)} KB PCM`);
  });
});
