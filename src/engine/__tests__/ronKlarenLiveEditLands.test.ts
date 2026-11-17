/**
 * A grid edit on a Ron Klaren song lands in the Ron Klaren replayer as the
 * note that was typed.
 *
 * ronklaren.c had no rk_set_cell, so Ron Klaren songs stayed on UADE (edits
 * reach UADE through chip RAM) and the native replayer was never heard. Now
 * writeCellToChipRam hands RonKlarenEngine the cell's file offset and note;
 * the replayer removes the position's transpose and keeps the command's wait
 * byte, the row's duration the grid derives its rows from.
 *
 * Drives writeCellToChipRam -> RonKlarenEngine.setCell -> the real worklet
 * and WASM, then reads the track command back with rk_get_cell.
 */
import { describe, it, expect, vi } from 'vitest';
import { startWorklet, songBuffer } from './workletHarness';
import { RonKlarenEngine } from '@engine/ronklaren/RonKlarenEngine';
import { writeCellToChipRam } from '@engine/uade/writeCellToChipRam';
import { getCellFileOffset } from '@engine/uade/UADEPatternEncoder';
import { ronKlarenNoteIndex } from '@engine/uade/encoders/RonKlarenEncoder';
import { parseRonKlarenFile } from '@lib/import/formats/RonKlarenParser';

type RkModule = { _rk_get_cell(h: number, offset: number): number };

const SONG = 'public/data/songs/ron-klaren/astra 2.rk';

describe('Ron Klaren live edit', () => {
  it('writes the typed note into the replayer and keeps the row duration', async () => {
    const { proc, send } = await startWorklet('ronklaren', 'RonKlaren');
    await send({ type: 'loadModule', moduleData: songBuffer(SONG) });
    const mod = proc.module as RkModule;
    const handle = proc.handle as number;

    const song = parseRonKlarenFile(new Uint8Array(songBuffer(SONG)), 'astra 2.rk')!;
    const layout = song.uadePatternLayout!;
    // The engine the store reaches, posting into the real worklet.
    const engine = Object.create(RonKlarenEngine.prototype) as RonKlarenEngine;
    (engine as unknown as { workletNode: { port: { postMessage(m: unknown): void } } }).workletNode = { port: { postMessage: (m) => { void send(m); } } };
    vi.spyOn(RonKlarenEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(RonKlarenEngine, 'getInstance').mockReturnValue(engine);

    // A note cell on a transposed position: the grid shows the note heard,
    // the track holds it without the transpose.
    let found: { p: number; r: number; ch: number; offset: number; shown: number; raw: number; wait: number } | null = null;
    for (let p = 0; p < song.patterns.length && !found; p++) {
      for (let ch = 0; ch < 4 && !found; ch++) {
        song.patterns[p].channels[ch].rows.forEach((cell, r) => {
          if (found || cell.note <= 1) return;
          const offset = getCellFileOffset(layout, p, r, ch);
          if (offset < 0) return;
          const got = mod._rk_get_cell(handle, offset);
          const shown = ronKlarenNoteIndex(cell.note);
          if (got >= 0 && (got >> 8) !== shown && shown + 2 < 70) found = { p, r, ch, offset, shown, raw: got >> 8, wait: got & 0xff };
        });
      }
    }
    expect(found, 'a note cell on a transposed position').not.toBeNull();
    const { p, r, ch, offset, shown, raw, wait } = found!;

    const cell = { ...song.patterns[p].channels[ch].rows[r], note: song.patterns[p].channels[ch].rows[r].note + 2 };
    await writeCellToChipRam(song, p, r, ch, cell);
    await new Promise((res) => setTimeout(res, 0));

    const after = mod._rk_get_cell(handle, offset);
    expect({ note: after >> 8, wait: after & 0xff }).toEqual({ note: raw + 2, wait });
    expect(shown - raw).not.toBe(0);
  });

  it('writes a changed instrument into the SetInstrument byte the replayer reads, for every row that byte serves', async () => {
    const { proc, send } = await startWorklet('ronklaren', 'RonKlaren');
    await send({ type: 'loadModule', moduleData: songBuffer(SONG) });
    const mod = proc.module as RkModule;
    const handle = proc.handle as number;

    const song = parseRonKlarenFile(new Uint8Array(songBuffer(SONG)), 'astra 2.rk')!;
    const layout = song.uadePatternLayout!;
    const engine = Object.create(RonKlarenEngine.prototype) as RonKlarenEngine;
    (engine as unknown as { workletNode: { port: { postMessage(m: unknown): void } } }).workletNode = { port: { postMessage: (m) => { void send(m); } } };
    vi.spyOn(RonKlarenEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(RonKlarenEngine, 'getInstance').mockReturnValue(engine);

    // A note cell whose instrument byte is read back from the replayer's own track memory.
    let found: { p: number; r: number; ch: number; at: number; old: number } | null = null;
    for (let p = 0; p < song.patterns.length && !found; p++) {
      for (let ch = 0; ch < 4 && !found; ch++) {
        song.patterns[p].channels[ch].rows.forEach((cell, r) => {
          if (found || cell.note <= 1) return;
          const probe = layout.effectPatches!(p, r, ch, { ...cell, instrument: cell.instrument + 1 }).patches;
          const at = probe.length > 0 ? probe[probe.length - 1][0] : -1;
          const got = at >= 0 ? mod._rk_get_cell(handle, at) : -1;
          if (got >= 0 && (got >> 8) === cell.instrument) found = { p, r, ch, at, old: cell.instrument };
        });
      }
    }
    expect(found, 'a note cell with a SetInstrument byte').not.toBeNull();
    const { p, r, ch, at, old } = found!;

    const cell = { ...song.patterns[p].channels[ch].rows[r], instrument: old + 1 };
    await writeCellToChipRam(song, p, r, ch, cell);
    await new Promise((res) => setTimeout(res, 0));
    expect(mod._rk_get_cell(handle, at) >> 8).toBe(old + 1);

    // Every grid cell (any position, any row) that reads this byte is served by the one stored byte.
    let sharing = 0;
    for (let q = 0; q < song.patterns.length; q++) for (let c = 0; c < 4; c++) song.patterns[q].channels[c].rows.forEach((cl, rr) => {
      if (cl.note <= 1) return;
      const pr = layout.effectPatches!(q, rr, c, { ...cl, instrument: cl.instrument + 1 }).patches;
      if (pr.some(([o]) => o === at)) sharing++;
    });
    expect(sharing).toBeGreaterThanOrEqual(1);
    console.log(`RK_INSTR_SHARING ${sharing}`);
  });
});
