/**
 * A Sound Player grid edit is heard: the edited cell is re-encoded into the
 * module the eagleplayer runner plays.
 *
 * Sound Player plays on EaglePlayerEngine (the real player on the Musashi
 * host), which reads its rows from the module in its chip RAM. Before
 * 2026-10-06 an edit went to UADE's chip RAM (a song UADE was not playing)
 * and the runner had no way to take bytes into its module. Two halves:
 *
 *  - the store's edit path (sendCellEditsToEngine -> writeCellToChipRam)
 *    hands the cell's 3 re-encoded bytes, at the file offset the grid cell
 *    came from, to EaglePlayerEngine.writeModule and patches the song's copy
 *    of the module; the song comes from the app's own import
 *    (parseModuleToSong), so the route, the grid and the layout are the
 *    real ones;
 *  - the runner worklet's writeModule lands in the module the player plays:
 *    voice 1's first note sounds at the edited pitch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, stereoOutputs, ROOT } from './workletHarness';
import { SP_PERIODS, encodeSPCell } from '@/lib/import/formats/soundPlayerCodec';

// The importer and the engine registry are large; their first import is slow.
const writeModule = vi.fn();
vi.mock('@/engine/eagleplayer/EaglePlayerEngine', () => ({
  EaglePlayerEngine: { hasInstance: () => true, getInstance: () => ({ writeModule }) },
}));

const DIR = 'public/data/songs/formats/Scott Johnston';
const bytes = (p: string) => { const b = readFileSync(resolve(ROOT, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

/** sjs.tune6 row 1, voice 1: note $06 (period $2FA), the voice's first note. */
const ROW1_V1 = 3 + 12;
const NEW_NOTE_BYTE = 0x0C;   // period $21A

describe('Sound Player edits reach the eagleplayer runner', () => {
  beforeEach(() => writeModule.mockClear());

  it('the store edit path writes the re-encoded cell into the playing module', async () => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const file = new File([bytes(`${DIR}/sjs.tune6`)], 'sjs.tune6');
    const song = await parseModuleToSong(file, 0, undefined, undefined, new Map([['smp.tune6', bytes(`${DIR}/smp.tune6`)]]));
    expect(song.eaglePlayerId).toBe('SoundPlayer');
    expect(song.uadePatternLayout?.formatId).toBe('soundPlayer');

    const cell = { ...song.patterns[0].channels[0].rows[1] };
    expect(cell.note).toBeGreaterThan(0);
    const { periodToNote } = await import('@/lib/amiga/periodNotes');
    cell.note = periodToNote(SP_PERIODS[NEW_NOTE_BYTE - 1]);

    const { sendCellEditsToEngine } = await import('@/engine/replayer/liveCellEdits');
    await sendCellEditsToEngine(song, [{ pattern: 0, row: 1, channel: 0, cell }]);

    const expected = [NEW_NOTE_BYTE, cell.instrument, 0];
    expect([...encodeSPCell(cell)]).toEqual(expected);
    expect(writeModule).toHaveBeenCalledTimes(1);
    const [offset, written] = writeModule.mock.calls[0] as [number, Uint8Array];
    expect(offset).toBe(ROW1_V1);
    expect([...written]).toEqual(expected);
    expect([...new Uint8Array(song.eaglePlayerFileData!, ROW1_V1, 3)]).toEqual(expected);
  }, 60_000);

  it('a row the voice spends waiting has no bytes, so nothing is written', async () => {
    const { parseSoundPlayerFile } = await import('@/lib/import/formats/SoundPlayerParser');
    const { playOnEaglePlayer } = await import('@/lib/import/parsers/withEaglePlayer');
    const ab = bytes(`${DIR}/sjs.tune6`);
    const song = playOnEaglePlayer(parseSoundPlayerFile(ab, 'sjs.tune6'), 'SoundPlayer', ab, 'sjs.tune6');
    const { sendCellEditsToEngine } = await import('@/engine/replayer/liveCellEdits');
    // voice 2 waits on rows 3..14 of pattern 0 (wait 13 at row 2)
    await sendCellEditsToEngine(song, [{ pattern: 0, row: 5, channel: 1, cell: { note: 25, instrument: 2, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } }]);
    expect(writeModule).not.toHaveBeenCalled();
  }, 60_000);

  it('the runner plays the bytes written into its module', async () => {
    const { proc, send, posted } = await startWorklet('eagleplayer', 'EaglePlayer');
    const m = proc.module as { _malloc(n: number): number; _free(p: number): void; _ep_wasm_voice_state(p: number): void; HEAPU32: Uint32Array; HEAPU8: Uint8Array };
    await send({
      type: 'loadModule', moduleData: bytes(`${DIR}/sjs.tune6`), playerData: bytes('public/eagleplayer/players/SoundPlayer'),
      moduleName: 'SJS.tune6', files: [{ name: 'SMP.tune6', data: bytes(`${DIR}/smp.tune6`) }],
    });
    expect(posted.some((p) => p.type === 'moduleLoaded')).toBe(true);
    await send({ type: 'writeModule', offset: ROW1_V1, bytes: new Uint8Array([NEW_NOTE_BYTE, 5, 0]).buffer });
    await send({ type: 'play' });

    const st = m._malloc(64);
    const periods = new Set<number>();
    // Row 1 is read on player tick 12 (~0.2 s at 62 Hz); 0.5 s covers it.
    for (let block = 0; block < (48000 * 0.5) / 128; block++) {
      proc.process([], stereoOutputs(5));
      m._ep_wasm_voice_state(st);
      const p = new DataView(m.HEAPU8.buffer).getUint32(st, true);
      if (p) periods.add(p);
    }
    m._free(st);
    expect(posted.filter((p) => p.type === 'error')).toEqual([]);
    expect(periods.has(SP_PERIODS[NEW_NOTE_BYTE - 1])).toBe(true);
    expect(periods.has(SP_PERIODS[0x06 - 1])).toBe(false);
  });
});
