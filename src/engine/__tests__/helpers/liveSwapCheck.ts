/**
 * One measurement of "an edit is heard while the song plays" for a native worklet engine (G24), shared by the per-engine tests.
 *
 * The song is imported (the app's open path) and played in the engine's REAL worklet with its real WASM. After `pre` blocks a
 * keystroke's store action runs and sendCellEditsToEngine routes it (the engine class is replaced by a stand-in whose
 * swapModule posts the message the real class posts). The caller's test file has already mocked the engine module so that
 * `getInstance()` returns `globalThis.__liveEngine`. Returned:
 *   before / after : audio the listener hears around the edit
 *   oracleAll      : the edited module (what the next play loads) played from the start, pre + post blocks
 *   plainAll       : the unedited module played from the start
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openWorklet, type WorkletHarness } from './workletHarness';

export interface LiveSwapSpec {
  file: string;
  worklet: { dir: string; name: string; factory: string };
  /** Messages that start the song in the worklet. */
  start(module: ArrayBuffer): Array<Record<string, unknown>>;
  /** The message the engine class's swapModule posts. */
  swapMessage(module: ArrayBuffer, loadArgs: unknown[]): Record<string, unknown>;
  pre: number;
  post: number;
}

export interface LiveSwapResult {
  routeIs: string;
  swapped: boolean;
  grew: boolean;
  before: Float32Array[];
  after: Float32Array[];
  oracleAll: Float32Array[];
  plainAll: Float32Array[];
}

const settle = () => new Promise((r) => setTimeout(r, 200));

async function play(spec: LiveSwapSpec, bytes: ArrayBuffer): Promise<WorkletHarness> {
  const h = await openWorklet(spec.worklet);
  for (const m of spec.start(bytes.slice(0))) await h.send(m);
  return h;
}

export async function importSong(file: string): Promise<ArrayBuffer> {
  const f = readFileSync(resolve(process.cwd(), file));
  const bytes = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
  const name = file.split('/').pop()!;
  const blob = new File([bytes.slice(0)], name);
  const { importTrackerModule } = await import('@/lib/song/songBranches');
  await importTrackerModule({
    metadata: { title: name, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
    arrayBuffer: await blob.arrayBuffer(), file: blob,
  } as never, { useLibopenmpt: true } as never);
  const { liveTrackerSong } = await import('@/lib/song/liveSong');
  (globalThis as { __liveSong?: () => unknown }).__liveSong = () => liveTrackerSong();
  return bytes;
}

export async function measureLiveSwap(spec: LiveSwapSpec, at: { p: number; ch: number; row: number }, edit: () => void): Promise<LiveSwapResult> {
  const bytes = await importSong(spec.file);
  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  const { liveTrackerSong } = await import('@/lib/song/liveSong');
  const { liveEditRoute, sendCellEditsToEngine, playingDescriptor } = await import('@/engine/replayer/liveCellEdits');
  const { editedModuleForPlay } = await import('@/engine/replayer/editedModuleForPlay');
  const routeIs = liveEditRoute(liveTrackerSong()).route;

  const live = await play(spec, bytes);
  (globalThis as { __liveEngine?: unknown }).__liveEngine = {
    swapModule: (module: ArrayBuffer, ...loadArgs: unknown[]) => { void live.send(spec.swapMessage(module, loadArgs)); },
  };
  const before = live.render(spec.pre);
  useTrackerStore.getState().setCurrentPattern(at.p);
  edit();
  await sendCellEditsToEngine(liveTrackerSong(), [{ pattern: at.p, row: at.row, channel: at.ch, cell: useTrackerStore.getState().patterns[at.p].channels[at.ch].rows[at.row] }]);
  await settle();
  const swapped = live.posted.some((m) => m.type === 'moduleSwapped');
  const after = live.render(spec.post);
  (globalThis as { __liveEngine?: unknown }).__liveEngine = undefined;

  const edited = (await editedModuleForPlay(liveTrackerSong(), playingDescriptor(liveTrackerSong())!))!;
  const oracle = await play(spec, (edited instanceof Uint8Array ? edited.slice().buffer : edited) as ArrayBuffer);
  const oracleAll = oracle.render(spec.pre + spec.post);
  const plain = await play(spec, bytes);
  const plainAll = plain.render(spec.pre + spec.post);
  return { routeIs, swapped, grew: edited.byteLength > bytes.byteLength, before, after, oracleAll, plainAll };
}
