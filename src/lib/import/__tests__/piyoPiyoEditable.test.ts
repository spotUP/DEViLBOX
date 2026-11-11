/**
 * PiyoPiyo (.pmd): one reachability test through parseModuleToSong with a call-count
 * sentinel, plus the byte-exact write path, on the real song obj0176-1.pmd.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../formats/PiyoPiyoParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../formats/PiyoPiyoParser')>();
  return { ...mod, parsePiyoPiyoFile: vi.fn(mod.parsePiyoPiyoFile) };
});

import { parseModuleToSong } from '../parseModuleToSong';
import { parsePiyoPiyoFile } from '../formats/PiyoPiyoParser';
import { applyPiyoPiyoGridEdits, decodePiyoPiyoModule, piyoPiyoEventAt } from '../formats/piyoPiyoGrid';
import { exportPiyoPiyo } from '@lib/export/PiyoPiyoExporter';
import { liveEditRoute } from '@/engine/replayer/liveCellEdits';
import { WASM_ENGINES, shouldActivate } from '@/engine/replayer/wasmEngineRegistry';

const NAME = 'obj0176-1.pmd';
const bytes = new Uint8Array(readFileSync(resolve(__dirname, '../../../../public/data/songs/studio-pixel---piyopiyo', NAME)));
const exported = async (song: Awaited<ReturnType<typeof parseModuleToSong>>): Promise<Uint8Array> =>
  new Uint8Array(await (await exportPiyoPiyo(song)).data.arrayBuffer());
const diffCount = (a: Uint8Array, b: Uint8Array): number => a.reduce((n, v, k) => n + (v !== b[k] ? 1 : 0), 0);

beforeEach(() => { vi.mocked(parsePiyoPiyoFile).mockClear(); });

describe('PiyoPiyo is editable through the product load path', () => {
  it('loads via parseModuleToSong, plays on the PiyoPiyo engine, and writes edits byte-exact', async () => {
    const song = await parseModuleToSong(new File([bytes.slice().buffer as ArrayBuffer], NAME));
    expect(parsePiyoPiyoFile).toHaveBeenCalledTimes(1);
    expect(song.format).toBe('PiyoPiyo');
    expect(Array.from(new Uint8Array(song.piyoPiyoFileData as ArrayBuffer))).toEqual(Array.from(bytes));
    const m = decodePiyoPiyoModule(bytes)!;
    expect(m.records).toBe(256);
    expect(m.channels).toBeGreaterThan(4);
    expect(song.numChannels).toBe(m.channels);
    expect(song.patterns).toHaveLength(m.patterns);
    expect(shouldActivate(WASM_ENGINES.find((d) => d.key === 'PiyoPiyo')!, song)).toBe(true);
    expect(liveEditRoute(song).route).toBe('piyopiyo-module');

    // The grid holds real notes, and a three-key chord fills three lanes with distinct notes.
    const noteAt = (t: number, r: number, l: number): number =>
      song.patterns[Math.floor(r / 64)].channels[m.firstChannel[t] + l].rows[r % 64].note;
    let notes = 0;
    song.patterns.forEach((p) => p.channels.forEach((c) => c.rows.forEach((row) => { if (row.note > 0) notes++; })));
    expect(notes).toBeGreaterThan(400);
    let chordRow = -1;
    for (let r = 0; r < m.records && chordRow < 0; r++) if (piyoPiyoEventAt(bytes, m.records, 0, r) !== 0 && m.lanes[0] > 1 && noteAt(0, r, 1) > 0) chordRow = r;
    expect(chordRow).toBeGreaterThanOrEqual(0);
    expect(noteAt(0, chordRow, 1)).toBeGreaterThan(noteAt(0, chordRow, 0));
    // Pitch: note = 13 + key + 12 * the track's header octave.
    const keys = piyoPiyoEventAt(bytes, m.records, 0, chordRow) & 0xffffff;
    expect(noteAt(0, chordRow, 0)).toBe(13 + Math.log2(keys & -keys) + 12 * m.octaves[0]);

    // Unedited song exports byte-identical.
    expect(Array.from(await exported(song))).toEqual(Array.from(bytes));

    // Edit lane 1 of the chord one semitone up: only that event word changes, the other keys stay.
    const cell = song.patterns[Math.floor(chordRow / 64)].channels[m.firstChannel[0] + 1].rows[chordRow % 64];
    const before = cell.note;
    cell.note = before + 1;
    const out = await exported(song);
    expect(out.length).toBe(bytes.length);
    const diff = diffCount(out, bytes);
    expect(diff).toBeGreaterThan(0);
    expect(diff).toBeLessThanOrEqual(4);
    const oldWord = piyoPiyoEventAt(bytes, m.records, 0, chordRow);
    const newWord = piyoPiyoEventAt(out, m.records, 0, chordRow);
    expect(popcount(newWord & 0xffffff)).toBe(popcount(oldWord & 0xffffff));
    expect(newWord >>> 24).toBe(oldWord >>> 24);
    const back = await parsePiyoPiyoFile(out.slice().buffer as ArrayBuffer, NAME);
    expect(back.patterns[Math.floor(chordRow / 64)].channels[m.firstChannel[0] + 1].rows[chordRow % 64].note).toBe(before + 1);
    expect(back.patterns[Math.floor(chordRow / 64)].channels[m.firstChannel[0]].rows[chordRow % 64].note).toBe(noteAt(0, chordRow, 0));
  }, 60000);

  it('an edit past the last record or the last lane changes nothing', () => {
    const blank = { note: 40, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    const m = decodePiyoPiyoModule(bytes)!;
    expect(applyPiyoPiyoGridEdits(bytes, [{ pattern: 99, row: 0, channel: 0, cell: blank }])).toBe(bytes);
    expect(applyPiyoPiyoGridEdits(bytes, [{ pattern: 0, row: 0, channel: m.channels, cell: blank }])).toBe(bytes);
  });
});

function popcount(v: number): number { let n = 0; for (let x = v; x; x &= x - 1) n++; return n; }
