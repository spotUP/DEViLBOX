/**
 * Organya (.org): one reachability test through parseModuleToSong with a call-count
 * sentinel, plus the byte-exact write path, on the real sample obj0640-1.org.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../formats/OrganyaParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../formats/OrganyaParser')>();
  return { ...mod, parseOrganyaFile: vi.fn(mod.parseOrganyaFile) };
});

import { parseModuleToSong } from '../parseModuleToSong';
import { parseOrganyaFile } from '../formats/OrganyaParser';
import { applyOrganyaGridEdits, decodeOrganyaModule } from '../formats/organyaGrid';
import { exportOrganya } from '@lib/export/OrganyaExporter';
import { liveEditRoute } from '@/engine/replayer/liveCellEdits';
import { WASM_ENGINES, shouldActivate } from '@/engine/replayer/wasmEngineRegistry';

const NAME = 'obj0640-1.org';
const bytes = new Uint8Array(readFileSync(resolve(__dirname, '../../../../public/data/songs/organya', NAME)));

beforeEach(() => { vi.mocked(parseOrganyaFile).mockClear(); });

describe('Organya is editable through the product load path', () => {
  it('loads via parseModuleToSong, plays on the Organya engine, and writes edits byte-exact', async () => {
    const song = await parseModuleToSong(new File([bytes.slice().buffer as ArrayBuffer], NAME));
    expect(parseOrganyaFile).toHaveBeenCalledTimes(1);
    expect(song.format).toBe('Organya');
    expect(Array.from(new Uint8Array(song.organyaFileData as ArrayBuffer))).toEqual(Array.from(bytes));
    const m = decodeOrganyaModule(bytes)!;
    expect(m.zoom).toBe(1);
    expect(song.numChannels).toBe(m.channels);
    expect(song.patterns).toHaveLength(m.patterns);
    expect(shouldActivate(WASM_ENGINES.find((d) => d.key === 'Organya')!, song)).toBe(true);
    expect(liveEditRoute(song).route).toBe('organya-module');

    // Unedited song exports byte-identical.
    const same = new Uint8Array(await (await exportOrganya(song)).data.arrayBuffer());
    expect(Array.from(same)).toEqual(Array.from(bytes));

    // Edit one note and its volume in the grid: export differs in 1..2 bytes only.
    const p = m.place.findIndex((t) => t.length > 0);
    const place = m.place[p][0];
    const cell = song.patterns[place.pattern].channels[place.channel].rows[place.row];
    const before = cell.note;
    expect(before).toBeGreaterThan(0);
    cell.note = before + 2;
    cell.volume = 0x10 + 20;
    const out = new Uint8Array(await (await exportOrganya(song)).data.arrayBuffer());
    expect(out.length).toBe(bytes.length);
    const diff = out.reduce((n, b, k) => n + (b !== bytes[k] ? 1 : 0), 0);
    expect(diff).toBeGreaterThan(0);
    expect(diff).toBeLessThanOrEqual(2);
    const again = await parseOrganyaFile(out.slice().buffer as ArrayBuffer, NAME);
    const back = again.patterns[place.pattern].channels[place.channel].rows[place.row];
    expect(back.note).toBe(before + 2);
    expect(back.volume).toBe(0x10 + 20);
  }, 60000);

  it('an edit on a cell with no event changes nothing', () => {
    const m = decodeOrganyaModule(bytes)!;
    const used = new Set(m.place.flat().map((q) => `${q.pattern}:${q.row}:${q.channel}`));
    let row = 0;
    while (used.has(`0:${row}:0`)) row++;
    const edited = applyOrganyaGridEdits(bytes, [{ pattern: 0, row, channel: 0, cell: { note: 40, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } }]);
    expect(edited).toBe(bytes);
  });
});
