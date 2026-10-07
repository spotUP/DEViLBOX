/**
 * G24: a Digital Sound Studio song reaches DSSExporter (the router had no branch for it: the module played after
 * an edit was the loaded one). Unedited it exports the module's own pattern bytes; an edited note is in the
 * exported module's cell.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDigitalSoundStudioFile } from '@/lib/import/formats/DigitalSoundStudioParser';
import { exportDssEdited } from '../DSSExporter';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const PATH = 'public/data/songs/digital-sound-studio/zrimay.dss';
const PATTERNS_AT = 0x61e;

describe('Digital Sound Studio export', () => {
  const bytes = new Uint8Array(readFileSync(PATH));
  const song = parseDigitalSoundStudioFile(bytes, 'zrimay.dss')!;
  setGridBaseline(baselineOf(song.patterns));
  const bytesOf = async (s: typeof song) => new Uint8Array(await (await exportDssEdited(s)).data.arrayBuffer());

  it('writes the pattern data of an unedited song as the module has it', async () => {
    const out = await bytesOf(song);
    const n = Math.max(...song.songPositions) + 1;
    expect(out.slice(PATTERNS_AT, PATTERNS_AT + n * 1024)).toEqual(bytes.slice(PATTERNS_AT, PATTERNS_AT + n * 1024));
  });

  it('carries an edited note into the exported cell, and no other cell changes', async () => {
    const edited = structuredClone(song);
    const cell = edited.patterns[0].channels[0].rows[0];
    cell.note = cell.note > 0 ? cell.note + 2 : 40;
    cell.instrument = cell.instrument || 1;
    const out = await bytesOf(edited);
    const n = Math.max(...song.songPositions) + 1;
    const diffs: number[] = [];
    for (let i = PATTERNS_AT; i < PATTERNS_AT + n * 1024; i++) if (out[i] !== bytes[i]) diffs.push(i);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.every((i) => i - PATTERNS_AT < 4)).toBe(true);
  });
});
