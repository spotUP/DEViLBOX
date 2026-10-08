/**
 * G24 / Hively (AHX, HVL): a step typed in the Hively view is heard WHILE the song plays, without a restart.
 *
 * The view's own write path (hivelyEdit.editHivelyCell) hands the step to the running tune through the engine's
 * setTrackStep, which is the C player's memory write (hively_set_track_step). The REAL worklet and WASM play the song:
 *   - what is heard before and after the keystroke is, sample for sample, what the edited module sounds like played from the
 *     start (the write changed nothing the player had already read);
 *   - and it differs from the unedited song (the step is reached and heard).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { openWorklet, sameAudio, peak, type WorkletHarness } from './helpers/workletHarness';

vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => new Proxy({}, { get: () => () => Promise.resolve() }) }));
vi.mock('@/engine/TrackerReplayer', () => ({ getTrackerReplayer: () => new Proxy({}, { get: () => () => undefined }), peekTrackerReplayer: () => null }));
vi.mock('@/engine/hively/HivelyEngine', async () => ({
  ...(await vi.importActual<typeof import('@/engine/hively/HivelyEngine')>('@/engine/hively/HivelyEngine')),
  HivelyEngine: {
    hasInstance: () => !!(globalThis as { __liveEngine?: unknown }).__liveEngine,
    getInstance: () => (globalThis as { __liveEngine?: unknown }).__liveEngine,
  },
}));

import '@stores'; // the store index first: the stores import each other in a cycle
import { parseHivelyFile } from '@/lib/import/formats/HivelyParser';
import { exportAsHively } from '@/lib/export/HivelyExporter';
import { editHivelyCell } from '@/components/hively/hivelyEdit';
import { hivelyTransform } from '@/engine/hively/HivelyEngine';
import { useFormatStore } from '@stores/useFormatStore';
import { useTrackerStore } from '@stores/useTrackerStore';

const FILE = 'public/data/songs/ahx/amanda.ahx';
const worklet = { dir: 'hively', name: 'Hively', factory: 'createHively', transformJs: hivelyTransform };
const PRE = 120, POST = 900;
const settle = () => new Promise((r) => setTimeout(r, 150));

async function play(bytes: ArrayBuffer): Promise<WorkletHarness> {
  const h = await openWorklet(worklet);
  await h.send({ type: 'loadTune', buffer: bytes.slice(0), defStereo: 2 });
  await h.send({ type: 'play' });
  return h;
}

describe('Hively: a step typed in the view is heard while the song plays', { timeout: 300000 }, () => {
  it('plays on from where it was, as the edited module', async () => {
    const f = readFileSync(FILE);
    const bytes = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    const plain = await (await play(bytes)).render(PRE + POST);
    const tried: string[] = [];
    // Steps of the first position, later steps first run out of the window: try a few in order.
    const first = parseHivelyFile(bytes.slice(0), FILE);
    const cands: Array<{ ch: number; row: number }> = [];
    first.hivelyNative!.positions[0].track.forEach((t, ch) => first.hivelyNative!.tracks[t]?.steps.forEach((s, row) => { if (row >= 8 && s.note > 0) cands.push({ ch, row }); }));
    cands.sort((a, b) => a.row - b.row);
    for (const c of cands.slice(0, 6)) {
      const song = parseHivelyFile(bytes.slice(0), FILE);
      useFormatStore.setState({ hivelyNative: structuredClone(song.hivelyNative!) });
      useTrackerStore.setState({ patterns: structuredClone(song.patterns), currentPatternIndex: 0 });
      const live = await play(bytes);
      (globalThis as { __liveEngine?: unknown }).__liveEngine = {
        setTrackStep: (trackIdx: number, stepIdx: number, note: number, instrument: number, fx: number, fxParam: number, fxb: number, fxbParam: number) => {
          void live.send({ type: 'setTrackStep', trackIdx, stepIdx, note, instrument, fx, fxParam, fxb, fxbParam });
        },
      };
      const before = live.render(PRE);
      const cur = song.hivelyNative!.tracks[song.hivelyNative!.positions[0].track[c.ch]].steps[c.row].note;
      editHivelyCell(0, c.ch, c.row, 'note', cur + (cur > 40 ? -3 : 3));
      await settle();
      const after = live.render(POST);
      (globalThis as { __liveEngine?: unknown }).__liveEngine = undefined;

      const edited = useFormatStore.getState().hivelyNative!;
      const exported = await exportAsHively({ ...song, restartPosition: 0 }, { format: 'ahx', nativeOverride: edited }).data.arrayBuffer();
      const oracle = await (await play(exported)).render(PRE + POST);
      const same = sameAudio([...before, ...after], oracle);
      const heard = !sameAudio(after, plain.slice(PRE));
      tried.push(`${c.ch}:${c.row} same=${same} heard=${heard}`);
      if (!heard) continue;
      expect(peak(after), 'the song sounds (sentinel)').toBeGreaterThan(0.01);
      expect(same, 'live audio equals the edited module played from the start').toBe(true);
      return;
    }
    throw new Error(`no step was reached in the window: ${tried.join(' | ')}`);
  });
});
