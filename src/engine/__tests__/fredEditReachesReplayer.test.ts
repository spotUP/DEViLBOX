/**
 * A Fred Editor grid edit is heard on FredReplayer2.
 *
 * FredReplayerEngine had a setCell whose worklet message called a WASM export
 * (_fred_set_cell) that was never built: every edit was dropped. A grid cell
 * is one line of one pattern (fredEditorGrid.ts), so an edit is written into
 * the module and the replayer swaps the new module in where it plays
 * (fred_replace_module). Two halves:
 *
 *  - the store's edit action (setCell -> sendCellEditsToEngine ->
 *    fredModuleEdits) re-encodes the module, makes it the song's module and
 *    hands it to the engine; the other grid cells showing the same pattern
 *    line follow the edit;
 *  - the replayer worklet plays the swapped module from where it was: the
 *    edited note sounds at its row at the new pitch, and nothing before it
 *    changes (no restart).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { startWorklet, stereoOutputs, ROOT } from './workletHarness';
import { decodeFredModule } from '@/lib/import/formats/FredEditorModule';
import { FRED_ROWS_PER_PATTERN, applyFredGridEdits, walkFredSong } from '@/lib/import/formats/fredEditorGrid';

const replaceModule = vi.fn();
vi.mock('@/engine/fred-replayer/FredReplayerEngine', async (orig) => ({
  ...(await orig<object>()),
  FredReplayerEngine: { hasInstance: () => true, getInstance: () => ({ replaceModule }) },
}));
let loaded: TrackerSong | null = null;
vi.mock('@engine/TrackerReplayer', async (orig) => ({
  ...(await orig<object>()),
  getTrackerReplayer: () => ({
    getSong: () => loaded,
    syncCellToWasmSequencer: () => {},
    setChannelMuteMask: () => {},
    isPlaying: () => false,
  }),
}));

const bytes = (p: string) => new Uint8Array(readFileSync(resolve(ROOT, p)));
const settle = () => new Promise((r) => setTimeout(r, 20));
const REBELS = 'public/data/songs/formats/rebels.fred';
const FIREWORKS = 'public/data/songs/fredmon/fireworks ii.fred';
/** Lab2_PeriodTable. */
const PERIODS = [
  8192, 7728, 7296, 6888, 6504, 6136, 5792, 5464, 5160, 4872, 4600, 4336,
  4096, 3864, 3648, 3444, 3252, 3068, 2896, 2732, 2580, 2436, 2300, 2168,
  2048, 1932, 1824, 1722, 1626, 1534, 1448, 1366, 1290, 1218, 1150, 1084,
  1024, 966, 912, 861, 813, 767, 724, 683, 645, 609, 575, 542,
  512, 483, 456, 430, 406, 383, 362, 341, 322, 304, 287, 271,
  256, 241, 228, 215, 203, 191, 181, 170, 161, 152, 143, 135,
];

describe('Fred Editor edits reach FredReplayer2', { timeout: 60_000 }, () => {
  it('the store edit re-encodes the module, hands it to the replayer, and every cell of that line follows', async () => {
    const { parseFredEditorFile } = await import('@/lib/import/formats/FredEditorParser');
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const file = bytes(REBELS);
    loaded = await parseFredEditorFile(file.slice().buffer as ArrayBuffer, 'rebels.fred');
    useTrackerStore.getState().loadPatterns(structuredClone(loaded.patterns));

    // Voice 1 plays one 16-line pattern over and over from row 1376: edit its first line there.
    const m = decodeFredModule(file);
    const walk = walkFredSong(m);
    const r = walk.voices[1].findIndex((ref, i) => !!ref && i > 0 && ref.line === 0
      && m.patterns[ref.pattern].lines.length === 16 && m.patterns[ref.pattern].lines[0].note !== undefined);
    const ref = walk.voices[1][r]!;
    const P = Math.floor(r / FRED_ROWS_PER_PATTERN), row = r % FRED_ROWS_PER_PATTERN;
    const before = useTrackerStore.getState().patterns[P].channels[1].rows[row];
    const newNote = before.note === 25 ? 26 : 25;
    useTrackerStore.setState({ currentPatternIndex: P });
    useTrackerStore.getState().setCell(1, row, { note: newNote });
    // The edit path imports the codec and the engine lazily; wait for it to land.
    await vi.waitFor(() => expect(replaceModule).toHaveBeenCalledTimes(1), { timeout: 30_000, interval: 50 });
    await settle();

    const sent = new Uint8Array(replaceModule.mock.calls[0][0] as ArrayBuffer);
    const m2 = decodeFredModule(sent);
    expect(m2.patterns[ref.pattern].lines[0].note).toBe(newNote + 11);
    expect([...new Uint8Array(loaded.fredReplayerFileData!)]).toEqual([...sent]);
    // The next time voice 1 plays that pattern, the grid shows the edit too.
    const again = walk.voices[1].findIndex((x, i) => i > r && !!x && x.pattern === ref.pattern && x.line === 0);
    expect(again).toBeGreaterThan(r);
    const cell = useTrackerStore.getState().patterns[Math.floor(again / FRED_ROWS_PER_PATTERN)].channels[1].rows[again % FRED_ROWS_PER_PATTERN];
    expect(cell.note).toBe(newNote);
  });

  it('the replayer plays the swapped module from where it was: the edited note at its row, nothing before it changed', async () => {
    const { fredReplayerTransform } = await import('@/engine/fred-replayer/FredReplayerEngine');
    const file = bytes(FIREWORKS);
    const m = decodeFredModule(file);
    const tempo = m.tempos[0];
    const walk = walkFredSong(m);
    // Voice 3's first note after row 40 (row 40 = 3.2 s; the swap happens at 1 s).
    const r = walk.voices[3].findIndex((ref, i) => i >= 40 && !!ref && m.patterns[ref.pattern].lines[ref.line].note !== undefined);
    const ref = walk.voices[3][r]!;
    const oldNote = m.patterns[ref.pattern].lines[ref.line].note!;
    const newByte = oldNote === 36 ? 38 : 36;
    const edited = applyFredGridEdits(file, [{
      pattern: Math.floor(r / FRED_ROWS_PER_PATTERN), row: r % FRED_ROWS_PER_PATTERN, channel: 3,
      cell: { note: newByte - 11, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 },
    }]);

    /** Voice 3's period at the end of every 50 Hz tick, swapping in `swap` after 1 s when given. */
    const run = async (swap?: Uint8Array): Promise<number[]> => {
      const { proc, send, posted } = await startWorklet('fred-replayer', 'FredReplayer', fredReplayerTransform);
      const mod = proc.module as { _fred_get_channel_period(h: number, ch: number): number };
      await send({ type: 'loadModule', moduleData: file.slice().buffer });
      expect(posted.some((p) => p.type === 'moduleLoaded')).toBe(true);
      await send({ type: 'play' });
      const perTick: number[] = [];
      const framesPerTick = 48000 / 50;
      const ticks = (r + 4) * tempo;
      for (let frames = 0; perTick.length < ticks; frames += 128) {
        if (swap && frames === 48000) await send({ type: 'replaceModule', moduleData: swap.slice().buffer });
        proc.process([], stereoOutputs(1));
        const done = Math.floor((frames + 128) / framesPerTick);
        while (perTick.length < done) perTick.push(mod._fred_get_channel_period(proc.handle as number, 3));
      }
      expect(posted.filter((p) => p.type === 'error')).toEqual([]);
      return perTick;
    };
    const plain = await run();
    const live = await run(edited);
    // The play call runs the voice's first line on tick 1; row r starts on tick r * tempo + 1.
    const noteTick = r * tempo + 1;
    expect(live.slice(0, noteTick - 1)).toEqual(plain.slice(0, noteTick - 1));
    const ins = walk.voices[3].slice(0, r + 1).reduce((cur, x) => {
      const l = x ? m.patterns[x.pattern].lines[x.line] : undefined;
      return l?.instrument !== undefined ? l.instrument : cur;
    }, -1);
    const insPer = (m.instruments[ins][8] << 8) | m.instruments[ins][9];
    const period = (n: number) => Math.floor((PERIODS[n] * insPer) / 1024);
    const window = (t: number[]) => t.slice(noteTick - 1, noteTick - 1 + tempo);
    expect(window(plain)).toContain(period(oldNote));
    expect(window(live)).toContain(period(newByte));
    expect(window(live)).not.toContain(period(oldNote));
  });
});
