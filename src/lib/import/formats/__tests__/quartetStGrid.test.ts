/**
 * Quartet ST (qts / modland .4v): the grid is decoded from the song's four voice streams (quartetStGrid.ts),
 * not a blank placeholder, and instruments are the real samples from the companion SMP file.
 * Fixture: Rob Povey, Quartet v1.5 demo5 (modland "Quartet ST"). Expected numbers come from walking the
 * streams by hand (step 20 ticks per row; voice ticks 320 / 1280 / 5120 / 3840; 200 Hz player ticks).
 * Sounding octave and playhead alignment are unverified by ear.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildQuartetStGrid, buildQuartetStInstruments, readQuartetStSamples } from '../quartetStGrid';

const DIR = join(process.cwd(), 'public/data/songs/quartet-st');
const song = new Uint8Array(readFileSync(join(DIR, 'demo5.4v')));
const smp = new Uint8Array(readFileSync(join(DIR, 'SMP.set')));

describe('Quartet ST grid from the voice streams', () => {
  it('demo5.4v: rows follow the replayer timing and every voice has notes', () => {
    const g = buildQuartetStGrid(song, 'demo5.4v');
    expect(g).not.toBeNull();
    expect(g!.step).toBe(20);
    expect(g!.tickHz).toBe(200);
    expect(g!.ticks).toBe(5120);
    expect(g!.rows).toBe(5120 / 20);
    expect(g!.patterns).toHaveLength(4);
    const perVoice = [0, 1, 2, 3].map(ch =>
      g!.patterns.flatMap(p => p.channels[ch].rows).filter(r => (r.note ?? 0) > 0).length);
    // shorter voices repeat ('F') until the longest voice ends: 6 x 16, 32 x 4, 34 x 1, 64 x 4/3 passes
    perVoice.forEach(n => expect(n).toBeGreaterThan(0));
    expect(perVoice[0]).toBe(6 * 16);
    expect(perVoice[1]).toBe(32 * 4);
    const cells = g!.patterns.flatMap(p => p.channels.flatMap(c => c.rows)).filter(r => (r.note ?? 0) > 0);
    cells.forEach(r => expect(r.instrument).toBeGreaterThan(0));
  });

  it('SMP.set: named samples with signed PCM become the grid instruments', () => {
    const samples = readQuartetStSamples(smp);
    expect(samples).toHaveLength(11);
    expect(samples[0]).toMatchObject({ slot: 0, name: 'BDRU', loopEnd: 0 });
    expect(samples[0].pcm.length).toBe(2764);
    const ahhh = samples.find(s => s.name === 'AHHH')!;
    expect(ahhh.loopEnd).toBe(ahhh.pcm.length);
    expect(ahhh.loopStart).toBe(ahhh.pcm.length - 6344);
    const g = buildQuartetStGrid(song, 'demo5.4v')!;
    const ids = buildQuartetStInstruments(g, smp).map(i => i.id);
    g.usedSamples.forEach(s => expect(ids).toContain(s + 1));
  });
});
