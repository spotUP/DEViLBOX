/**
 * Quartet (Amiga, qpa.*): the grid is decoded from the song rows (quartetPcmGrid.ts), not the blank
 * placeholder, and instruments are the real samples of the companion SMP.<song> sample set.
 * Fixture: DemoMusic + Demoset from the Quartet 1.3 Amiga program disk (MIT, amigasourcecodepreservation),
 * stored as qpa.DemoMusic / SMP.DemoMusic (the names the eagleplayer's ExtLoad pairs).
 * Sounding octave and playhead alignment are unverified by ear.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseQuartetFile } from '../QuartetParser';
import { buildQuartetPcmGrid, readQuartetPcmSamples, quartetPcmPeriod } from '../quartetPcmGrid';

const DIR = join(process.cwd(), 'public/data/songs/quartet');
const song = new Uint8Array(readFileSync(join(DIR, 'qpa.DemoMusic')));
const set = new Uint8Array(readFileSync(join(DIR, 'SMP.DemoMusic')));

describe('Quartet (qpa) grid from the song rows', () => {
  it('qpa.DemoMusic: tempo byte, rows up to the 0xFFFF row, notes on every voice', () => {
    const g = buildQuartetPcmGrid(song, 'qpa.DemoMusic');
    expect(g).not.toBeNull();
    expect(g!.tempo).toBe(6);
    expect(g!.rows).toBe(1110);
    expect(g!.patterns).toHaveLength(Math.ceil(1110 / 64));
    // row 0 is bf9a 3f92 9b9a 0000: octave 2 / 0 / 2, sample 9, notes 10 / 2 / 10, volume codes 63 / 63 / 27
    const row0 = g!.patterns[0].channels.map(c => c.rows[0]);
    expect(row0.map(c => c.instrument)).toEqual([10, 10, 10, 0]);
    expect(row0.map(c => c.volume)).toEqual([0x10 + 64, 0x10 + 64, 0x10 + 28, 0]);
    expect(row0[0].note).toBeGreaterThan(row0[1].note); // octave 2 halves the period: higher than octave 0
    const perVoice = [0, 1, 2, 3].map(ch =>
      g!.patterns.flatMap(p => p.channels[ch].rows).filter(r => r.note > 0).length);
    perVoice.forEach(n => expect(n).toBeGreaterThan(0));
  });

  it('every note the song plays has a grid name', () => {
    const g = buildQuartetPcmGrid(song, 'qpa.DemoMusic')!;
    const cells = g.patterns.flatMap(p => p.channels.flatMap(c => c.rows)).filter(r => r.instrument > 0);
    cells.forEach(r => expect(r.note).toBeGreaterThan(0));
    expect(quartetPcmPeriod(2, 10)).toBe(0x157 >> 1);
    expect(quartetPcmPeriod(0, 2)).toBe(0xd8 << 1);
  });

  it('SMP.DemoMusic: 16 named signed samples, as the replayer starts them', () => {
    const samples = readQuartetPcmSamples(set);
    expect(samples).toHaveLength(16);
    expect(samples[0]).toMatchObject({ slot: 0, name: 'AccoBass', loops: false });
    expect(samples[0].pcm.length).toBe(9996);
    expect(samples[15]).toMatchObject({ slot: 15, name: 'UltDrum' });
    expect(samples[15].pcm.length).toBe(4996);
  });

  it('parseQuartetFile: qpa song gets the grid, the tick timing and the real samples (was an empty stub)', async () => {
    const companions = new Map<string, ArrayBuffer>([['SMP.DemoMusic', set.slice().buffer]]);
    const s = await parseQuartetFile(song.slice().buffer as ArrayBuffer, 'qpa.DemoMusic', undefined, companions);
    expect(s.patterns.length).toBe(18);
    const notes = s.patterns.flatMap(p => p.channels.flatMap(c => c.rows)).filter(r => r.note > 0).length;
    expect(notes).toBeGreaterThan(0);
    expect(s.numChannels).toBe(4);
    expect(s.initialSpeed).toBe(6);
    expect(s.initialBPM).toBe(125);
    expect(s.uadePlayerTickGrid).toBe(true);
    expect(s.uadeEditableFileData).toBeDefined();
    expect(s.instruments).toHaveLength(16);
    expect(s.instruments[0].name).toBe('AccoBass');
  });
});
