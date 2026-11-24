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
import { buildQuartetStGrid, buildQuartetStInstruments, readQuartetStSamples, quartetStNoteToFreq, quartetStFreqToNote, QUARTET_ST_ROWS_PER_PATTERN } from '../quartetStGrid';
import { parseQuartetFile } from '../QuartetParser';
import { exportQuartet } from '@/lib/export/QuartetExporter';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';

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

describe('Quartet ST through the parser (owner report: qts song loads and plays but shows no pattern data)', () => {
  it('a qts. song gets the decoded grid and the SMP samples, not the blank placeholder', async () => {
    const { parseQuartetFile } = await import('../QuartetParser');
    const companions = new Map<string, ArrayBuffer>([['SMP.set', smp.slice().buffer as ArrayBuffer]]);
    const s = await parseQuartetFile(song.slice().buffer as ArrayBuffer, 'qts.demo5', undefined, companions);
    expect(s.patterns).toHaveLength(4);
    expect(s.songLength).toBe(4);
    const notes = s.patterns.flatMap(p => p.channels.flatMap(c => c.rows)).filter(r => (r.note ?? 0) > 0);
    expect(notes.length).toBeGreaterThan(0);
    expect(s.initialSpeed).toBe(20);
    expect(s.initialBPM).toBe(500);
    expect(s.uadePlayerTickGrid).toBe(true);
    expect(s.uadeEditableFileData).toBeDefined();
    expect(s.instruments.some(i => /AHHH/i.test(i.name))).toBe(true);
  });
});

describe('Quartet ST note edits write back into the song', () => {
  const FILES = [
    'public/data/songs/quartet-st/demo5.4v',
    'public/data/songs/quartet-st/tfc-tune1.4v',
    'public/data/songs/quartet-st/MIG.4v',
  ];
  const load = async (rel: string) => {
    const b = readFileSync(join(process.cwd(), rel));
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    return { raw: new Uint8Array(ab), song: await parseQuartetFile(ab, rel.split('/').pop()!) };
  };

  it.each(FILES)('%s: carrier re-encodes byte-exact and an unedited export is the source', async (rel) => {
    const { raw, song } = await load(rel);
    const l = song.uadeVariableLayout!;
    expect(l.formatId).toBe('quartet');
    l.filePatternAddrs.forEach((addr, fp) => {
      expect(Array.from(encodeVariableBlock(l, fp, l.blockRows![fp], fp))).toEqual(Array.from(raw.subarray(addr, addr + l.filePatternSizes[fp])));
    });
    const out = await exportQuartet(song);
    expect(out.warnings).toEqual([]);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });

  it.each(FILES)('%s: a one-note edit re-imports as the new note on every row its record plays', async (rel) => {
    const { raw, song } = await load(rel);
    const g = buildQuartetStGrid(raw, '')!;
    const pl = g.placements[0];
    const target = pl.note + 2;
    const R = QUARTET_ST_ROWS_PER_PATTERN;
    const sameRecord = g.placements.filter(q => q.offset === pl.offset);
    for (const q of sameRecord) song.patterns[Math.floor(q.row / R)].channels[q.voice].rows[q.row % R].note = target;
    const out = await exportQuartet(song);
    expect(out.warnings).toEqual([]);
    expect(out.data.length).toBe(raw.length);
    expect(Array.from(out.data).filter((b, i) => b !== raw[i]).length).toBeLessThanOrEqual(4);
    const back = buildQuartetStGrid(out.data, '')!;
    expect(back.patterns[Math.floor(pl.row / R)].channels[pl.voice].rows[pl.row % R].note).toBe(target);
  });

  it('a note with no frequency (cleared) is reported, not written', async () => {
    const { raw, song } = await load(FILES[0]);
    const pl = buildQuartetStGrid(raw, '')!.placements[0];
    song.patterns[Math.floor(pl.row / QUARTET_ST_ROWS_PER_PATTERN)].channels[pl.voice].rows[pl.row % QUARTET_ST_ROWS_PER_PATTERN].note = 0;
    const out = await exportQuartet(song);
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });

  it.each(FILES)('%s: an instrument edit rewrites only its V record and re-imports as the new sample', async (rel) => {
    const { raw, song } = await load(rel);
    const g = buildQuartetStGrid(raw, '')!;
    const pl = g.placements.find(q => q.vOffset !== null)!;
    const under = g.placements.filter(q => q.vOffset === pl.vOffset);
    const target = (pl.instrument % 20) + 1; // another slot (1-based), within the 20-slot table
    const R = QUARTET_ST_ROWS_PER_PATTERN;
    for (const q of under) song.patterns[Math.floor(q.row / R)].channels[q.voice].rows[q.row % R].instrument = target;
    const out = await exportQuartet(song);
    expect(out.warnings).toEqual([]);
    expect(out.data.length).toBe(raw.length);
    const changed = Array.from(out.data).map((b, i) => (b !== raw[i] ? i : -1)).filter(i => i >= 0);
    expect(changed.length).toBeGreaterThan(0);
    changed.forEach(i => expect(i >= pl.vOffset! + 8 && i < pl.vOffset! + 12).toBe(true));
    const back = buildQuartetStGrid(out.data, '')!;
    for (const q of under) expect(back.patterns[Math.floor(q.row / R)].channels[q.voice].rows[q.row % R].instrument).toBe(target);
  });

  it('notes under one V record given different instruments are reported, not written', async () => {
    const { raw, song } = await load(FILES[0]);
    const g = buildQuartetStGrid(raw, '')!;
    const pl = g.placements.find(q => q.vOffset !== null && g.placements.filter(o => o.vOffset === q.vOffset).length > 1)!;
    const R = QUARTET_ST_ROWS_PER_PATTERN;
    song.patterns[Math.floor(pl.row / R)].channels[pl.voice].rows[pl.row % R].instrument = (pl.instrument % 20) + 1;
    const out = await exportQuartet(song);
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });

  it('quartetStNoteToFreq round-trips every grid note it can store', () => {
    for (let n = 1; n <= 60; n++) {
      const f = quartetStNoteToFreq(n);
      if (f !== null) expect(quartetStFreqToNote(f)).toBe(n);
    }
  });
});
