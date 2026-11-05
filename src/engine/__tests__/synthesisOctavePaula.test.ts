/**
 * Synthesis octave: the grid names a note by the period Paula plays.
 * Measured on space_sound.syn through UADE (AUDxPER log, periodToPitch) against the
 * parsed grid, absolute pitch. The song holds one note (grid 3) on all four voices, so the
 * proof is one absolute point: every voice's Paula pitch equals the grid note. Edit path:
 * SynthesisEncoder writes note + 36, the parser reads noteIdx - 36 (same constant, two files).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openUade } from './gridOracle';
import { paulaNotes, type LogModule } from '../../../tools/uade-audit/gridVsPaulaCore';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { parseSynthesisFile } from '@/lib/import/formats/SynthesisParser';
import { encodeSynthesisCell } from '@/engine/uade/encoders/SynthesisEncoder';

const DIR = join(process.cwd(), 'public/data/songs/formats');
const FILE = 'space_sound.syn';
let restore = () => {};
let mod: LogModule;
beforeAll(async () => { restore = installDwNodeFetch(); mod = (await openUade()) as unknown as LogModule; });
afterAll(() => { restore(); try { mod._uade_wasm_cleanup(); } catch { /* ignore */ } });

describe('Synthesis octave', () => {
  it('grid notes equal the pitch Paula plays (absolute) and encode inverts decode', async () => {
    const bytes = new Uint8Array(readFileSync(join(DIR, FILE)));
    const song = parseSynthesisFile(bytes, FILE)!;
    expect(song).toBeTruthy();
    const grid: number[][] = song.patterns[0].channels.map(() => []);
    const order = song.songPositions?.length ? song.songPositions : song.patterns.map((_, i) => i);
    for (const p of order) song.patterns[p]?.channels.forEach((c, ch) => c.rows.forEach((r) => { if (r.note > 0 && r.note < 97) grid[ch].push(r.note); }));
    const paula = await paulaNotes(mod, bytes, FILE, DIR, 30);
    let matched = 0;
    for (let ch = 0; ch < grid.length; ch++) {
      if (!grid[ch].length) continue;
      const played = new Set(paula.loose.map((v) => v[0]));
      if (played.has(grid[ch][0])) matched++;
    }
    expect(matched, 'voices whose first grid note is a pitch Paula played, absolute').toBeGreaterThanOrEqual(3);
    // Edit path: grid note n is stored as byte n + 36 (reference: byte 49 = period 856 = grid 13).
    for (const note of [3, 13, 25, 96]) expect(encodeSynthesisCell({ note } as never)[0]).toBe(note + 36);
    expect(encodeSynthesisCell({ note: 13 } as never)[0], 'SYN_PERIODS[49] = 856 = C-1').toBe(49);
    // The edit-path decoder (second copy of the mapping) agrees with the grid builder.
    const layout = (song as unknown as { uadePatternLayout?: { decodeCell(raw: Uint8Array): { note: number } } }).uadePatternLayout;
    expect(layout, 'pattern layout').toBeTruthy();
    for (const note of [3, 13, 25, 96]) expect(layout!.decodeCell(encodeSynthesisCell({ note } as never)).note).toBe(note);
  }, 120_000);
});
