/**
 * KRIS (ChipTracker) export writes the loaded module back byte for byte, and an edited cell changes only
 * its own 4 bytes and reloads as that edit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseKRISFile } from '@/lib/import/formats/KRISParser';
import { exportKRIS } from '../KRISExporter';

const FIXTURE = 'public/data/songs/chiptracker/chuck rock - chuckrock.mod';

function load(bytes: Uint8Array) {
  return parseKRISFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'chuckrock.kris');
}

async function save(song: Awaited<ReturnType<typeof load>>): Promise<Uint8Array> {
  return new Uint8Array(await (await exportKRIS(song)).data.arrayBuffer());
}

describe('KRIS export keeps the module', () => {
  it('unedited export is byte-identical', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const out = await save(await load(raw));
    expect(out.length).toBe(raw.length);
    expect(out.every((b, i) => b === raw[i])).toBe(true);
  });

  it('one edited cell changes only its 4 bytes and reloads as the edit', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await load(raw);
    const cell = song.patterns[0].channels[0].rows[1];
    const row1Off = song.uadePatternLayout!.getCellFileOffset!(0, 1, 0);
    cell.note = cell.note === 60 ? 61 : 60;
    cell.instrument = 3;
    cell.effTyp = 0;
    cell.eff = 0;
    const out = await save(song);
    expect(out.length).toBe(raw.length);
    const diffs = [...out.keys()].filter((i) => out[i] !== raw[i]);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.every((i) => i >= row1Off && i < row1Off + 4)).toBe(true);
    const back = (await load(out)).patterns[0].channels[0].rows[1];
    expect([back.note, back.instrument]).toEqual([cell.note, 3]);
  });
});
