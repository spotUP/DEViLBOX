/**
 * Every grid edit on a song a native replayer plays reaches that replayer.
 *
 * Only useTrackerStore.setCell knew the native replayers; clearCell and the
 * bulk edits (clear channel, delete row, paste, transpose ...) wrote UADE chip
 * RAM only, so on a Digital Sound Studio or Face The Music song a cleared or
 * pasted note kept playing. Now every mutation hands its changed cells to
 * sendCellEditsToEngine, which picks the engine the registry starts for the
 * song.
 *
 * Drives the store's real edit actions on parsed DSS and FTM songs and counts
 * the setCell calls each engine receives.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = resolve(__dirname, '../../..');
type Call = { engine: string; pattern: number; row: number; channel: number; note: number; instrument: number };
const calls: Call[] = [];
let loaded: TrackerSong | null = null;

function fakeEngine(engine: string) {
  const instance = {
    setCell: (pattern: number, row: number, channel: number, note: number, instrument: number) => {
      calls.push({ engine, pattern, row, channel, note, instrument });
    },
  };
  return { hasInstance: () => true, getInstance: () => instance };
}

vi.mock('@/engine/dss/DssEngine', () => ({ DssEngine: fakeEngine('Dss') }));
vi.mock('@/engine/facethemusic/FaceTheMusicEngine', () => ({ FaceTheMusicEngine: fakeEngine('FaceTheMusic') }));
vi.mock('@engine/TrackerReplayer', async (orig) => ({
  ...(await orig<object>()),
  getTrackerReplayer: () => ({
    getSong: () => loaded,
    syncCellToWasmSequencer: () => {},
    setChannelMuteMask: () => {},
    isPlaying: () => false,
  }),
}));

function bytes(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(ROOT, rel)));
}

async function load(kind: 'dss' | 'ftm'): Promise<TrackerSong> {
  if (kind === 'dss') {
    const { parseDigitalSoundStudioFile } = await import('@lib/import/formats/DigitalSoundStudioParser');
    return parseDigitalSoundStudioFile(bytes('public/data/songs/digital-sound-studio/zrimay.dss'), 'zrimay.dss')!;
  }
  const { parseFaceTheMusicFile } = await import('@lib/import/formats/FaceTheMusicParser');
  return parseFaceTheMusicFile(bytes('public/data/songs/face-the-music/rock.ftm'), 'rock.ftm')!;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('grid edits reach the native replayer playing the song', { timeout: 60000 }, () => {
  beforeEach(() => { calls.length = 0; });

  for (const [kind, engine] of [['dss', 'Dss'], ['ftm', 'FaceTheMusic']] as const) {
    it(`${engine}: set, clear and a bulk edit each reach setCell`, async () => {
      const { useTrackerStore } = await import('@/stores/useTrackerStore');
      loaded = await load(kind);
      const store = useTrackerStore.getState();
      store.loadPatterns(structuredClone(loaded.patterns));

      // A channel holding at least two notes: one to clear, one left for the
      // bulk edit, and an empty row to type on.
      const isNote = (n: number) => n > 0 && n < 97;
      let P = -1; let CH = -1;
      loaded.patterns.some((pat, p) => pat.channels.some((ch, c) => {
        if (ch.rows.filter((x) => isNote(x.note)).length < 2 || !ch.rows.some((x) => x.note === 0)) return false;
        P = p; CH = c; return true;
      }));
      expect(P, 'a channel with two notes').toBeGreaterThanOrEqual(0);
      useTrackerStore.setState({ currentPatternIndex: P });
      const rows = useTrackerStore.getState().patterns[P].channels[CH].rows;
      const noteRow = rows.findIndex((c) => isNote(c.note));
      const emptyRow = rows.findIndex((c) => c.note === 0);

      // set
      useTrackerStore.getState().setCell(CH, emptyRow, { note: 61, instrument: 1 });
      await settle();
      expect(calls).toContainEqual(expect.objectContaining({ engine, pattern: P, row: emptyRow, channel: CH, note: 61 }));

      // clear
      calls.length = 0;
      useTrackerStore.getState().clearCell(CH, noteRow);
      await settle();
      expect(calls).toEqual([expect.objectContaining({ engine, pattern: P, row: noteRow, channel: CH, note: 0 })]);

      // bulk: clear the channel — every cell that held something is sent empty,
      // and only the changed cells are sent.
      calls.length = 0;
      const held = useTrackerStore.getState().patterns[P].channels[CH].rows
        .map((c, r) => ({ c, r })).filter(({ c }) => c.note || c.instrument || c.effTyp || c.eff || c.volume);
      useTrackerStore.getState().clearChannel(CH);
      await settle();
      expect(held.length).toBeGreaterThan(0);
      expect(calls.length).toBe(held.length);
      expect(calls.every((c) => c.engine === engine && c.pattern === P && c.channel === CH && c.note === 0)).toBe(true);
      for (const { r } of held) expect(calls.some((c) => c.row === r)).toBe(true);
    });
  }
});
