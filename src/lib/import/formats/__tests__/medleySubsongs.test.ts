/**
 * Medley (.mso) subsongs through the file-subsong registry (fileSubsongs.ts), on the real combat.mso:
 * song table entry 0 is empty, entries 1..7 = intro, part2..part6, Combat; registry tune i = entry i + 1.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMedleyFile } from '../MedleyParser';
import { buildMedleyGrid, medleySubsongCount, MEDLEY_FIRST_TUNE } from '../medleyGrid';
import { fileSubsongFormatByKey, fileSubsongFormat } from '../../fileSubsongs';
import { subsongStatus } from '@/lib/tracker/subsongSwitch';
import { uadeEditableLoadArgs } from '@/engine/uade/uadeLoadArgs';

const b = readFileSync(resolve(__dirname, '../../../../../public/data/songs/medley/combat.mso'));
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const raw = new Uint8Array(ab);

const notesPerVoice = (tune: number): number[] => {
  const grid = buildMedleyGrid(raw, 'combat.mso', tune + MEDLEY_FIRST_TUNE)!;
  return [0, 1, 2, 3].map(v => grid.placements.filter(p => p.voice === v).length);
};

describe('Medley file subsongs (combat.mso)', () => {
  const fmt = fileSubsongFormatByKey('medley')!;

  it('is registered, finds combat.mso by name, and counts 7 tunes', async () => {
    expect(fmt).toBeTruthy();
    expect((await fileSubsongFormat('combat.mso', raw.subarray(0, 128)))?.key).toBe('medley');
    expect(await fmt.count(ab)).toBe(7);
    expect(medleySubsongCount(raw)).toBe(7);
  });

  it('every subsong builds a grid and sounds', async () => {
    for (let i = 0; i < 7; i++) {
      expect(buildMedleyGrid(raw, 'combat.mso', i + MEDLEY_FIRST_TUNE), `tune ${i}`).not.toBeNull();
      expect(await fmt.audible(ab, i), `tune ${i}`).toBe(true);
    }
  });

  // Measured from the replayer walk (0-based voice index): the song record of every tune names track 0 (no stream) for
  // voice 2, so that voice never sounds; Combat plays voices 0, 1 and 3, the intro only voices 0 and 3.
  it('Combat (last tune) plays voices 0, 1, 3 (voice 2 has no track); the intro leaves voices 1 and 2 empty', () => {
    const combat = notesPerVoice(6);
    expect([combat[0], combat[1], combat[3]].every(n => n > 1000)).toBe(true);
    expect(combat[2]).toBe(0);
    const intro = notesPerVoice(0);
    expect(intro[0]).toBeGreaterThan(0);
    expect(intro[3]).toBeGreaterThan(0);
    expect(intro[1]).toBe(0);
    expect(intro[2]).toBe(0);
  });

  it('the requested tune is the grid drawn and the tune UADE plays; the FT2 subsong input sees it', async () => {
    const intro = await parseMedleyFile(ab, 'combat.mso', 0);
    const combat = await parseMedleyFile(ab, 'combat.mso', 6);
    expect(combat.fileSubsongs).toMatchObject({ count: 7, current: 6 });
    expect(intro.patterns).not.toEqual(combat.patterns);
    const voices = (s: typeof combat) => [0, 1, 2, 3].map(v => s.patterns.some(p => p.channels[v].rows.some(r => r.note > 0)));
    expect(voices(combat)).toEqual([true, true, false, true]);
    expect(voices(intro)).toEqual([true, false, false, true]);
    // UADE numbers Medley's tunes 1..7: tune 6 is UADE subsong 7.
    expect(uadeEditableLoadArgs(combat)[1]).toBe(7);
    expect(uadeEditableLoadArgs(intro)[1]).toBe(1);
    const status = subsongStatus({
      furnaceSubsongs: [], furnaceActiveSubsong: 0, uadeEditableSubsongs: combat.uadeEditableSubsongs ?? null,
      uadeEditableCurrentSubsong: 0, sidMetadata: null, activisionProSubsongCount: 0, activisionProCurrentSubsong: 0,
      fileSubsongs: combat.fileSubsongs ?? null, nativeSubsongs: null,
    } as unknown as Parameters<typeof subsongStatus>[0]);
    expect(status).toEqual({ source: 'file', count: 7, current: 6 });
  });

  it('the default tune is the first that sounds', async () => {
    const song = await parseMedleyFile(ab, 'combat.mso');
    expect(song.fileSubsongs?.current).toBe(0);
  });
});
