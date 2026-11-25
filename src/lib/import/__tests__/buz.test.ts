/**
 * Buzzic 1 / Buzzic 2: a .buz2 file reaches BuzParser through parseModuleToSong, carries its
 * bytes as buzFileData, and activates the BuzReplayer WASM engine.
 * Fixture: the owner's attacktrack.buz2 (not in the repo; the test skips when it is absent).
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

vi.mock('../formats/BuzParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../formats/BuzParser')>();
  return { ...mod, parseBuzFile: vi.fn(mod.parseBuzFile) };
});

import { parseModuleToSong } from '../parseModuleToSong';
import { isBuzFormat, parseBuzFile } from '../formats/BuzParser';
import { WASM_ENGINES, shouldActivate } from '@/engine/replayer/wasmEngineRegistry';
import { applyBuzGridEdits, buzCell, buzCellByte, buzLayout, buzLinkedEdits, type BuzGridEdit } from '../formats/buzGrid';

const SONG = '/Users/spot/Desktop/Selecta-new-formats/attacktrack.buz2';

describe('Buzzic routing', () => {
  it('rejects bytes that are not a Buzzic song', () => {
    expect(isBuzFormat(new Uint8Array(200))).toBe(false);
    expect(isBuzFormat(new Uint8Array(44712))).toBe(false);
  });

  it.skipIf(!existsSync(SONG))('routes attacktrack.buz2 to BuzParser and the WASM engine', async () => {
    const bytes = new Uint8Array(readFileSync(SONG));
    expect(isBuzFormat(bytes)).toBe(true);
    const song = await parseModuleToSong(new File([bytes.slice().buffer as ArrayBuffer], 'attacktrack.buz2'));
    expect(parseBuzFile).toHaveBeenCalledTimes(1);
    expect(song.format).toBe('BUZ');
    expect(Array.from(new Uint8Array(song.buzFileData as ArrayBuffer))).toEqual(Array.from(bytes));
    expect(song.songPositions.length).toBeGreaterThan(0);
    const desc = WASM_ENGINES.find((d) => d.key === 'BuzReplayer')!;
    expect(shouldActivate(desc, song)).toBe(true);
  }, 60000);
});

describe.skipIf(!existsSync(SONG))('Buzzic grid', () => {
  const bytes = () => new Uint8Array(readFileSync(SONG));

  it('decodes attacktrack.buz2 into notes, one channel per instrument', () => {
    const b = bytes();
    const song = parseBuzFile(b, 'attacktrack.buz2')!;
    const L = buzLayout(b)!;
    expect(song.numChannels).toBe(L.instruments.length);
    const notes = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows.filter((r) => r.note > 0)));
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((r) => r.note >= 1 && r.note <= 96 && r.instrument >= 1)).toBe(true);
  });

  it('encodes the decoded grid byte-identical', () => {
    const b = bytes();
    const song = parseBuzFile(b, 'attacktrack.buz2')!;
    const edits: BuzGridEdit[] = [];
    song.patterns.forEach((p, pattern) => p.channels.forEach((c, channel) => c.rows.forEach((cell, row) => edits.push({ pattern, row, channel, cell }))));
    const warnings: string[] = [];
    expect(applyBuzGridEdits(b, edits, warnings)).toBe(b);
    expect(warnings).toEqual([]);
  });

  it('one note edit changes only the pattern byte the cell reads, and reaches every cell reading it', () => {
    const b = bytes();
    const L = buzLayout(b)!;
    const song = parseBuzFile(b, 'attacktrack.buz2')!;
    let hit: { pattern: number; row: number; channel: number } | null = null;
    song.patterns.forEach((p, pattern) => p.channels.forEach((c, channel) => c.rows.forEach((cell, row) => {
      if (!hit && cell.note > 0 && buzCellByte(b, L, pattern, row, channel) >= 0) hit = { pattern, row, channel };
    })));
    expect(hit).not.toBeNull();
    const { pattern, row, channel } = hit!;
    const before = song.patterns[pattern].channels[channel].rows[row];
    const note = before.note === 60 ? 61 : 60;
    const next = applyBuzGridEdits(b, [{ pattern, row, channel, cell: { ...before, note } }]);
    const at = buzCellByte(b, L, pattern, row, channel);
    const diff = Array.from(next).flatMap((v, i) => (v === b[i] ? [] : [i]));
    expect(diff).toEqual([at]);
    expect(next[at]).toBe(note - 13);
    expect(buzCell(next, L, pattern, row, channel).note).toBe(note);
    const after = structuredClone(song.patterns[pattern]);
    after.channels[channel].rows[row] = { ...before, note };
    const linked = buzLinkedEdits(b, pattern, song.patterns[pattern], after, song.patterns);
    for (const e of linked) {
      expect(buzCellByte(b, L, e.pattern, e.row, e.channel)).toBe(at);
      expect(e.values.note).toBe(buzCell(next, L, e.pattern, e.row, e.channel).note);
    }
  });
});
