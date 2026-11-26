/**
 * Ken Silverman KDM: carrier round trip, same-length edits, and one
 * reachability test through parseModuleToSong with a call-count sentinel.
 * Fixtures: public/data/songs/ken-silverman-kdm/kdmsong.kdm (has fxP) and flysong.kdm (no fxP).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../formats/KdmParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../formats/KdmParser')>();
  return { ...mod, parseKdmFile: vi.fn(mod.parseKdmFile) };
});

import { parseModuleToSong } from '../parseModuleToSong';
import { parseKdmFile } from '../formats/KdmParser';
import { applyKdmGridEdits, decodeKdmModule, kdmEventCell } from '../formats/kdmGrid';
import { exportKdm } from '@lib/export/KdmExporter';
import { WASM_ENGINES, shouldActivate } from '@/engine/replayer/wasmEngineRegistry';
import { songFile } from '@/test/songPath';

const load = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(songFile(name)));

beforeEach(() => { vi.mocked(parseKdmFile).mockClear(); });

describe.each(['kdmsong.kdm', 'flysong.kdm'])('%s', (name) => {
  const bytes = load(name);

  it('decodes with every event placed on a distinct grid cell at the song zoom', () => {
    const m = decodeKdmModule(bytes)!;
    expect(m).not.toBeNull();
    expect(m.hasFxP).toBe(name === 'kdmsong.kdm');
    const seen = new Set(m.place.map((p) => `${p.pattern}:${p.row}:${p.channel}`));
    expect(seen.size).toBe(m.notes);
    console.info(`[kdm] ${name}: ${m.notes} events, ${m.tracks} tracks, ${m.channels} channels, zoom ${m.zoom} ticks, ${m.patterns} patterns`);
  });

  it('an unedited song exports byte-identical', async () => {
    const song = parseKdmFile(bytes, name)!;
    const out = new Uint8Array(await (await exportKdm(song)).data.arrayBuffer());
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });

  it('a same-length edit survives export and reload; untouched bytes stay', async () => {
    const song = parseKdmFile(bytes, name)!;
    const m = decodeKdmModule(bytes)!;
    const i = m.place.findIndex((_, k) => kdmEventCell(m, k).note > 0 && kdmEventCell(m, k).note < 90);
    const p = m.place[i];
    const cell = song.patterns[p.pattern].channels[p.channel].rows[p.row];
    cell.note += 2;
    cell.volume = 0x10 + 20;
    const out = new Uint8Array(await (await exportKdm(song)).data.arrayBuffer());
    expect(out.length).toBe(bytes.length);
    const again = parseKdmFile(out, name)!;
    const back = again.patterns[p.pattern].channels[p.channel].rows[p.row];
    expect(back.note).toBe(cell.note);
    expect(back.volume).toBe(0x10 + 20);
    const diff = out.reduce((n, b, k) => n + (b !== bytes[k] ? 1 : 0), 0);
    expect(diff).toBeGreaterThan(0);
    expect(diff).toBeLessThanOrEqual(2);
  });

  it('a note typed on a cell with no event is inserted and reads back; every other cell stays', async () => {
    const song = parseKdmFile(bytes, name)!;
    const m = decodeKdmModule(bytes)!;
    const used = new Set(m.place.map((q) => `${q.pattern}:${q.row}:${q.channel}`));
    let row = 1;
    while (used.has(`0:${row}:0`)) row++;
    const cells = song.patterns[0].channels[0].rows;
    cells[row] = { ...cells[row], note: 40, instrument: 0 };
    const res = await exportKdm(song);
    expect(res.warnings).toEqual([]);
    const out = new Uint8Array(await res.data.arrayBuffer());
    expect(out.length).toBe(bytes.length + 4 + (m.hasFxP ? 7 : 6));
    const again = parseKdmFile(out, name)!;
    expect(again.patterns[0].channels[0].rows[row].note).toBe(40);
    const orig = parseKdmFile(bytes, name)!;
    orig.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      if (p === 0 && ch === 0 && r === row) return;
      expect(again.patterns[p].channels[ch].rows[r], `${p}:${ch}:${r}`).toEqual(cell);
    })));
  });

  it('a typed note with another track\'s instrument is refused with a warning', () => {
    const m = decodeKdmModule(bytes)!;
    const used = new Set(m.place.map((q) => `${q.pattern}:${q.row}:${q.channel}`));
    let row = 1;
    while (used.has(`0:${row}:0`)) row++;
    const warnings: string[] = [];
    const wave = bytes[12];
    const edited = applyKdmGridEdits(bytes, [{ pattern: 0, row, channel: 0, cell: { note: 40, instrument: wave + 2, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } }], warnings);
    expect(edited).toBe(bytes);
    expect(warnings.length).toBe(1);
  });
});

describe('KDM is reachable through parseModuleToSong', () => {
  it('kdmsong.kdm runs parseKdmFile and activates KdmReplayer, not UADE', async () => {
    const bytes = load('kdmsong.kdm');
    // The route only carries the bank bytes (waves.kwv is never shipped), so a stand-in bank suffices.
    const bank = new Uint8Array([1, 2, 3, 4]).buffer;
    const song = await parseModuleToSong(new File([bytes.slice().buffer as ArrayBuffer], 'kdmsong.kdm'), undefined, undefined, undefined, new Map([['waves.kwv', bank]]));
    expect(parseKdmFile).toHaveBeenCalledTimes(1);
    expect(Array.from(new Uint8Array(song.kdmBankData as ArrayBuffer))).toEqual([1, 2, 3, 4]);
    expect(Array.from(new Uint8Array(song.kdmFileData as ArrayBuffer))).toEqual(Array.from(bytes));
    expect(song.format).toBe('KDM');
    const m = decodeKdmModule(bytes)!;
    expect(song.numChannels).toBe(m.channels);
    expect(song.patterns).toHaveLength(m.patterns);
    expect(song.initialSpeed).toBe(m.zoom);
    const desc = WASM_ENGINES.find((d) => d.key === 'KdmReplayer')!;
    expect(shouldActivate(desc, song)).toBe(true);
    expect(song.uadeEditableFileData).toBeUndefined();
  }, 60000);

  it('refuses a .kdm opened without waves.kwv beside it', async () => {
    const bytes = load('kdmsong.kdm');
    await expect(parseModuleToSong(new File([bytes.slice().buffer as ArrayBuffer], 'kdmsong.kdm'))).rejects.toThrow(/waves\.kwv/);
  }, 60000);
});
