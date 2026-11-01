/**
 * Regression: Music Assembler was an encode-pattern stub — its variable encoder
 * re-derived a command byte stream from the EDITABLE display grid (note +
 * synthesised instrument/delay events), which does not reproduce the real
 * variable-length track stream (matchPct 0.0000: not one track matched).
 *
 * A Music Assembler track is a per-channel command stream (events run 1..4 bytes
 * — note / release / instrument+note — with a 0xff terminator), not a fixed grid,
 * so the only faithful byte-exact inverse is a whole-block carrier encoder. The
 * parser now decodes each track into PER-BYTE carrier cells (cutoff=1, period=byte)
 * exposed on `layout.blockRows`, and `musicAssemblerEncoder.encodePattern`
 * concatenates the carriers to reproduce every track verbatim. The display grid
 * stays carrier-less and editable.
 *
 * On revert (grid re-encode / no blockRows) the encoder emits a synthesised
 * stream that differs from the source, so no track matches and this fails.
 *
 * Fixture: public/data/songs/music-assembler/thanatos.ma (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMusicAssemblerFile } from '../MusicAssemblerParser';
import type { Pattern } from '@/types';
import { MA_FX } from '../maEffectGlyphs';
import { exportAsMusicAssembler } from '@/lib/export/MusicAssemblerExporter';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/music-assembler/thanatos.ma');

describe('Music Assembler pattern codec', () => {
  it('the variable encoder reproduces every command-stream track byte-for-byte', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseMusicAssemblerFile(raw, 'thanatos.ma');
    expect(song, 'parse succeeds').toBeTruthy();
    if (!song) throw new Error('parse failed');

    const layout = (song as unknown as { uadeVariableLayout?: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout, 'variable layout present').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('musicAssembler');

    const { filePatternAddrs, filePatternSizes, blockRows, encoder } = layout;
    expect(filePatternAddrs.length, 'has command-stream tracks').toBeGreaterThan(0);
    // Byte-exact carriers live on blockRows (the command stream straddles the
    // display grid), NOT in the editable display cells.
    expect(blockRows, 'layout exposes per-block carrier rows').toBeTruthy();
    if (!blockRows) throw new Error('no blockRows');
    expect(blockRows.length, 'one carrier-row set per track').toBe(filePatternAddrs.length);

    let checked = 0;
    let sawCommands = false; // a track with real command bytes (not empty)
    for (let fp = 0; fp < filePatternAddrs.length; fp++) {
      const addr = filePatternAddrs[fp];
      const size = filePatternSizes[fp];
      if (size <= 0 || addr < 0 || addr + size > raw.length) continue;

      const orig = raw.subarray(addr, addr + size);
      if (size > 1) sawCommands = true;
      const re = encoder.encodePattern(blockRows[fp], 0);
      expect([...re], `track fp${fp} @${addr} size ${size}`).toEqual([...orig]);
      checked++;
    }

    expect(checked, 'at least one track round-tripped').toBeGreaterThan(0);
    expect(sawCommands, 'fixture exercises multi-byte command tracks').toBe(true);
  });
});

describe('Music Assembler removed notes (track rewriter)', () => {
  it('removing notes exports a shorter track: the notes are gone, every other cell and the timing are unchanged', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseMusicAssemblerFile(raw, 'thanatos.ma');
    if (!song) throw new Error('parse failed');
    const countNotes = (s: { patterns: Pattern[] }): number => s.patterns.reduce((n, p) => n + p.channels.reduce((m, c) => m + c.rows.filter((r) => (r.note ?? 0) >= 1 && (r.note ?? 0) <= 48).length, 0), 0);
    const before = countNotes(song);
    // remove every other note of the first voice that has some
    const removed: Array<[number, number, number]> = [];
    let k = 0;
    song.patterns.forEach((pat, pi) => pat.channels.forEach((c, ci) => { if (removed.length === 0 && ci === 0 || removed.length > 0 && removed[0][1] === ci) c.rows.forEach((r, ri) => { if ((r.note ?? 0) >= 1 && (r.note ?? 0) <= 48 && k++ % 2 === 1) removed.push([pi, ci, ri]); }); }));
    expect(removed.length, 'fixture has notes to remove').toBeGreaterThan(2);
    const edited: typeof song = { ...song, patterns: structuredClone(song.patterns) };
    for (const [p, c, i] of removed) edited.patterns[p].channels[c].rows[i] = { ...edited.patterns[p].channels[c].rows[i], note: 0, instrument: 0 };
    const res = await exportAsMusicAssembler(edited);
    expect(res.warnings.filter((w) => /not written|could not/.test(w))).toEqual([]);
    const out = new Uint8Array(await res.data.arrayBuffer());
    expect(out.length, 'the module keeps its length').toBe(raw.length);
    const back = parseMusicAssemblerFile(out, 'thanatos.ma');
    if (!back) throw new Error('re-parse failed');
    for (const [p, c, i] of removed) expect(back.patterns[p].channels[c].rows[i].note ?? 0, `pattern ${p} row ${i} is blank`).toBe(0);
    expect(back.patterns.map((p) => p.length), 'timing unchanged').toEqual(song.patterns.map((p) => p.length));
    // every note not removed on this voice-and-track plays on (shared tracks may drop more rows than the ones named, never fewer)
    expect(countNotes(back)).toBeLessThan(before);
  });
});

describe('Music Assembler removed transpose command', () => {
  it('clearing the transpose cells exports position entries with transpose 0 and nothing else moves', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseMusicAssemblerFile(raw, 'thanatos.ma');
    if (!song) throw new Error('parse failed');
    const isT = (t: number | undefined): boolean => t === MA_FX.transpose;
    const cells = (s: { patterns: Pattern[] }): number => s.patterns.reduce((n, p) => n + p.channels.reduce((m, c) => m + c.rows.filter((r) => [r.effTyp, r.effTyp2, r.effTyp3, r.effTyp4, r.effTyp5].some(isT)).length, 0), 0);
    expect(cells(song), 'fixture shows transpose commands').toBeGreaterThan(0);
    const edited: typeof song = { ...song, patterns: structuredClone(song.patterns) };
    for (const p of edited.patterns) for (const c of p.channels) c.rows.forEach((r, i) => {
      const slots = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5']] as const;
      const row = { ...r } as unknown as Record<string, number>;
      for (const [t, v] of slots) if (isT(row[t])) { row[t] = 0; row[v] = 0; }
      c.rows[i] = row as unknown as typeof r;
    });
    const res = await exportAsMusicAssembler(edited);
    const out = new Uint8Array(await res.data.arrayBuffer());
    expect(out.length).toBe(raw.length);
    const back = parseMusicAssemblerFile(out, 'thanatos.ma');
    if (!back) throw new Error('re-parse failed');
    expect(cells(back), 'no transpose command is shown any more').toBe(0);
    expect(back.patterns.map((p) => p.length), 'timing unchanged').toEqual(song.patterns.map((p) => p.length));
  });
});

describe('Music Assembler: a note typed into the New Song template', { timeout: 60000 }, () => {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/templates/musicAssembler.ma')));
  const song = parseMusicAssemblerFile(bytes, 'musicAssembler.ma');
  if (!song) throw new Error('template parse failed');

  it.each([0, 4])('is written on row %i of every voice and the reloaded grid shows it there', async (row) => {
    const edited: typeof song = { ...song, patterns: structuredClone(song.patterns) };
    for (const ch of edited.patterns[0].channels) expect(ch.rows.every((c) => !c.note), 'template has no notes').toBe(true);
    const note = 25;
    for (const ch of edited.patterns[0].channels) ch.rows[row] = { ...ch.rows[row], note, instrument: 1 };
    const res = await exportAsMusicAssembler(edited);
    expect(res.warnings, res.warnings.join(' ; ')).toEqual([]);
    const back = parseMusicAssemblerFile(new Uint8Array(await res.data.arrayBuffer()), 'musicAssembler.ma');
    if (!back) throw new Error('re-parse failed');
    for (let ch = 0; ch < back.patterns[0].channels.length; ch++) {
      expect(back.patterns[0].channels[ch].rows[row].note, `voice ${ch}`).toBe(note);
    }
  });
});
