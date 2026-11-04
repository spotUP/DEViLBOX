/**
 * Ken Silverman KDM: carrier round trip, same-length edits, and one
 * reachability test through parseModuleToSong with a call-count sentinel.
 * Fixtures: public/data/songs/formats/kdmsong.kdm (has fxP) and flysong.kdm (no fxP).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../formats/KdmParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../formats/KdmParser')>();
  return { ...mod, parseKdmFile: vi.fn(mod.parseKdmFile) };
});

import { parseModuleToSong } from '../parseModuleToSong';
import { parseKdmFile } from '../formats/KdmParser';
import { applyKdmGridEdits, decodeKdmModule, kdmEventCell, KDM_ROWS } from '../formats/kdmGrid';
import { exportKdm } from '@lib/export/KdmExporter';
import { WASM_ENGINES, shouldActivate } from '@/engine/replayer/wasmEngineRegistry';

const load = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(resolve(__dirname, '../../../../public/data/songs/formats', name)));

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

  it('an edit on a cell with no event changes nothing', () => {
    const m = decodeKdmModule(bytes)!;
    const used = new Set(m.place.map((q) => `${q.pattern}:${q.row}:${q.channel}`));
    let free: { pattern: number; row: number; channel: number } | null = null;
    for (let r = 0; r < KDM_ROWS && !free; r++) if (!used.has(`0:${r}:0`)) free = { pattern: 0, row: r, channel: 0 };
    const edited = applyKdmGridEdits(bytes, [{ ...free!, cell: { note: 40, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } }]);
    expect(edited).toBe(bytes);
  });
});

describe('KDM is reachable through parseModuleToSong', () => {
  it('kdmsong.kdm runs parseKdmFile and activates KdmReplayer, not UADE', async () => {
    const bytes = load('kdmsong.kdm');
    const song = await parseModuleToSong(new File([bytes.slice().buffer as ArrayBuffer], 'kdmsong.kdm'));
    expect(parseKdmFile).toHaveBeenCalledTimes(1);
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
});
