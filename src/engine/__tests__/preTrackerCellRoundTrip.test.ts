/**
 * PreTracker: an unedited grid exports the file byte for byte, and one edited cell changes only its 3 bytes in the
 * single-channel track (the same encoder the live edit posts to the engine).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parsePreTrackerFile } from '@lib/import/formats/PreTrackerParser';
import { patchPreTrackerCells } from '@lib/export/PreTrackerExporter';

const name = 'the little things.prt';
const file = readFileSync(resolve(process.cwd(), 'public/data/songs/pretracker', name));
const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;

describe('PreTracker cell round trip', () => {
  it('unedited export is the file; an edited note changes only its cell', async () => {
    const song = await parsePreTrackerFile(bytes, name);
    const original = new Uint8Array(bytes);
    const same = original.slice();
    await patchPreTrackerCells(same, song.patterns, []);
    expect(Buffer.from(same).equals(Buffer.from(original)), 'unedited').toBe(true);

    let at: { p: number; c: number; r: number } | undefined;
    song.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      if (!at && cell.note > 0 && cell.note < 90 && pat.importMetadata?.prtTrackMap?.[c]) at = { p, c, r };
    })));
    expect(at, 'a note exists').toBeDefined();
    const pat = song.patterns[at!.p];
    const cell = pat.channels[at!.c].rows[at!.r];
    pat.channels[at!.c].rows[at!.r] = { ...cell, note: cell.note + 2 };

    const edited = original.slice();
    const warnings: string[] = [];
    await patchPreTrackerCells(edited, song.patterns, warnings);
    const track = pat.importMetadata!.prtTrackMap![at!.c];
    const cellOffset = new DataView(bytes).getUint32(8, false) + ((track - 1) * pat.length + at!.r) * 3;
    const changed: number[] = [];
    edited.forEach((v, i) => { if (v !== original[i]) changed.push(i); });
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((i) => i >= cellOffset && i < cellOffset + 3), `only ${cellOffset}..+3, got ${changed}`).toBe(true);

    const again = await parsePreTrackerFile(edited.buffer as ArrayBuffer, name);
    expect(again.patterns[at!.p].channels[at!.c].rows[at!.r].note).toBe(cell.note + 2);
  });
});
