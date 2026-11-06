/**
 * OctaMED MMD3 octave. UADE cannot play MMD3, so the oracle is OpenMPT's MED loader (third-party/openmpt-master/soundlib/
 * Load_med.cpp: `if(version > 2) transpose -= 24`): the same raw note byte sits 24 semitones below its MMD0-2 reading.
 * Our MMD2 reading is Paula-measured (medMmd0OctavePaula.test.ts, base 12), so MMD3 = MMD2 - 24 on every cell.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMEDFile } from '@/lib/import/formats/MEDParser';

const file = join(process.cwd(), 'public/data/songs/octamed-mmd3/bounty hunter - outro (remixed).mmd3');
const load = (magic: string) => {
  const b = new Uint8Array(readFileSync(file));
  for (let i = 0; i < 4; i++) b[i] = magic.charCodeAt(i);
  return parseMEDFile(b.buffer as ArrayBuffer, 'x.' + magic.toLowerCase());
};
const notes = (s: ReturnType<typeof load>) => s.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows.map((r) => r.note)));

describe('OctaMED MMD3 octave (OpenMPT oracle)', () => {
  it('bounty hunter: every MMD3 note is the MMD2 reading minus 24, in C-1..C-3', () => {
    const m3 = notes(load('MMD3')), m2 = notes(load('MMD2'));
    expect(m3.length).toBe(m2.length);
    let n = 0;
    m3.forEach((v, i) => { if (v > 0 && v < 97) { expect(m2[i] - v).toBe(24); n++; } });
    expect(n).toBeGreaterThan(2000);
    const played = m3.filter((v) => v > 0 && v < 97);
    expect([Math.min(...played), Math.max(...played)]).toEqual([13, 48]);
  });
});
