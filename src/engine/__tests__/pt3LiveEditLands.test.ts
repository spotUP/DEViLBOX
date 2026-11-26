/**
 * A grid edit on a PT3 song lands in the running aylet engine as the note that was typed.
 *
 * The real S.V. Bulba player reads the module from Z80 memory every line, so the edit is the new note byte
 * (pt3_encode_note, the song's note table) poked at the module address + the decoder's note offset. Drives
 * sendCellEditsToEngine -> applyPt3ModuleEdits -> AyletEngine.poke -> the real worklet and WASM, then steps the
 * tune to the edited row and reads the AY tone period the player wrote.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { startWorklet, songBuffer, ROOT } from './workletHarness';
import { AyletEngine } from '@engine/aylet/AyletEngine';
import { liveEditRoute, sendCellEditsToEngine } from '@engine/replayer/liveCellEdits';
import { parseZxtuneFile } from '@/lib/import/formats/ZxtuneParser';

const createPt3 = async () => (await import('../../../public/pt3/Pt3Edit.js')).default({ locateFile: (f: string) => resolve(ROOT, 'public/pt3', f) });
const NAME = 'D-Juice_-_Plaintive__1999_.pt3';
const periodToXm = (p: number) => Math.round(12 * Math.log2(1773400 / (16 * p) / 440)) + 58;

type AyMod = { HEAPU8: Uint8Array; _aylet_wasm_step_frame(): number; _aylet_wasm_get_regs(): number };

describe('PT3 live edit', () => {
  it('pokes the typed note into the running tune and the player plays it', async () => {
    const song = await parseZxtuneFile(NAME, songBuffer(`public/data/songs/pt3/${NAME}`), createPt3);
    expect(liveEditRoute(song).route).toBe('pt3-module');

    const { proc, send } = await startWorklet('aylet', 'Aylet');
    const mod = () => proc.module as AyMod;
    const periodsTo = (last: number) => {
      const out: number[][] = [];
      for (let i = 0; i <= last && mod()._aylet_wasm_step_frame(); i++) {
        const g = mod()._aylet_wasm_get_regs(), h = mod().HEAPU8;
        out.push([0, 1, 2].map((ch) => h[g + ch * 2] | ((h[g + ch * 2 + 1] & 15) << 8)));
      }
      return out;
    };

    // Rows of the first position on the 50 Hz frame timeline (frame 0 = INIT; a row plays from frame + 1).
    const p = song.songPositions[0];
    const pat = song.patterns[p];
    let speed = song.initialSpeed, frame = 0;
    const rows: Array<{ r: number; frame: number }> = [];
    for (let r = 0; r < pat.length; r++) {
      for (const c of pat.channels) if (c.rows[r].effTyp === 0x0F) speed = c.rows[r].eff;
      rows.push({ r, frame });
      frame += speed;
    }

    // Unedited: a note cell the player plays as the grid shows it, past row 0 so the edit lands while playing.
    await send({ type: 'loadModule', moduleData: song.ayFileData!.slice(0), track: 0 });
    const before = periodsTo(frame);
    let hit: { r: number; ch: number; frame: number; note: number } | null = null;
    for (const { r, frame: f } of rows.slice(1)) for (let ch = 0; ch < 3 && !hit; ch++) {
      const note = pat.channels[ch].rows[r].note;
      if (note > 0 && note < 90 && song.pt3NoteOffsets![p][r][ch] >= 0 && periodToXm(before[f + 1][ch]) === note) hit = { r, ch, frame: f, note };
    }
    expect(hit, 'a note the player plays as the grid shows it').not.toBeNull();
    const { r, ch, frame: at, note } = hit!;

    // Reload the untouched tune, play to just before the row, edit while it runs, play on.
    await send({ type: 'loadModule', moduleData: song.ayFileData!.slice(0), track: 0 });
    periodsTo(at - 1);
    const engine = Object.create(AyletEngine.prototype) as AyletEngine;
    (engine as unknown as { workletNode: { port: { postMessage(m: unknown): void } } }).workletNode = { port: { postMessage: (m) => { void send(m); } } };
    vi.spyOn(AyletEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(AyletEngine, 'getInstance').mockReturnValue(engine);
    const off = song.pt3NoteOffsets![p][r][ch];
    const oldByte = new Uint8Array(song.zxtuneFileData!)[off];
    await sendCellEditsToEngine(song, [{ pattern: p, row: r, channel: ch, cell: { ...pat.channels[ch].rows[r], note: note + 5 } }]);
    await new Promise((res) => setTimeout(res, 0));
    const after = periodsTo(1);  // frames at and at + 1

    const played = periodToXm(after[1][ch]);
    console.log(`PT3_LIVE row ${r} ch ${ch}: grid ${note} played ${periodToXm(before[at + 1][ch])} -> edited ${note + 5} played ${played}`);
    expect(played).toBe(note + 5);
    // The song's module (save / export) and .ay wrapper (next load) carry the edit too.
    const file = new Uint8Array(song.zxtuneFileData!), ay = new Uint8Array(song.ayFileData!);
    expect(file[off]).not.toBe(oldByte);
    expect(ay[ay.length - file.length + off]).toBe(file[off]);
  });
});
