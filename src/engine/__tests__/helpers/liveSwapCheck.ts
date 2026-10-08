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
  worklet: { dir: string; name: string; factory: string; worklet?: string };
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
  /** The module the next play loads differs from the one that was opened. */
  carriesEdit: boolean;
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
  let swapError = '';
  (globalThis as { __liveEngine?: unknown }).__liveEngine = {
    swapModule: (module: ArrayBuffer, ...loadArgs: unknown[]) => { live.send(spec.swapMessage(module, loadArgs)).catch((err) => { swapError = String(err); }); },
    // SidMon II's exporter asks the running engine for its module; this stand-in has none to give, so the stored one is used.
    save: async () => null,
  };
  const before = live.render(spec.pre);
  useTrackerStore.getState().setCurrentPattern(at.p);
  edit();
  await sendCellEditsToEngine(liveTrackerSong(), [{ pattern: at.p, row: at.row, channel: at.ch, cell: useTrackerStore.getState().patterns[at.p].channels[at.ch].rows[at.row] }]);
  await settle();
  const swapped = live.posted.some((m) => m.type === 'moduleSwapped');
  if (!swapped && process.env.LS_DEBUG) console.log('[ls] not swapped; worklet posted', JSON.stringify(live.posted.map((m) => [m.type, m.message])), 'swap error', swapError);
  const after = live.render(spec.post);
  (globalThis as { __liveEngine?: unknown }).__liveEngine = undefined;

  const edited = (await editedModuleForPlay(liveTrackerSong(), playingDescriptor(liveTrackerSong())!))!;
  const oracle = await play(spec, (edited instanceof Uint8Array ? edited.slice().buffer : edited) as ArrayBuffer);
  const oracleAll = oracle.render(spec.pre + spec.post);
  const plain = await play(spec, bytes);
  const plainAll = plain.render(spec.pre + spec.post);
  const editedBytes = edited instanceof Uint8Array ? edited : new Uint8Array(edited);
  const carriesEdit = editedBytes.length !== bytes.byteLength || editedBytes.some((v, i) => v !== new Uint8Array(bytes)[i]);
  return { routeIs, swapped, grew: edited.byteLength > bytes.byteLength, carriesEdit, before, after, oracleAll, plainAll };
}

/** A grid cell the edit is tried on: pattern, channel, row. */
export interface LiveCell { p: number; ch: number; row: number }

/**
 * The first of `cells` whose edit is audible in the rendered window and does not touch the audio before it (a pattern is shared by
 * positions; a note far into the song is past the window), checked: before the edit the live audio is the song's, after it the
 * edited module's from the start sample for sample, and it differs from the unedited song. `edit(cell)` is the keystroke.
 */
export async function assertLiveSwap(
  expectFn: (v: unknown, msg?: string) => { toBe(x: unknown): void },
  spec: LiveSwapSpec,
  cells: LiveCell[],
  edit: (cell: LiveCell) => void,
): Promise<LiveCell> {
  const { sameAudio } = await import('./workletHarness');
  const tried: string[] = [];
  for (const cell of cells) {
    const r = await measureLiveSwap(spec, cell, () => edit(cell));
    const preOk = sameAudio(r.before, r.oracleAll.slice(0, spec.pre));
    const heard = !sameAudio(r.after, r.plainAll.slice(spec.pre));
    tried.push(`${cell.p}:${cell.ch}:${cell.row} pre=${preOk} heard=${heard} swapped=${r.swapped} carriesEdit=${r.carriesEdit} route=${r.routeIs}`);
    if (!preOk || !heard) continue;
    expectFn(r.routeIs, 'the song is edited through the engine-swap route').toBe('engine-swap');
    expectFn(r.swapped, 'the worklet swapped the module (sentinel)').toBe(true);
    expectFn(sameAudio(r.before, r.oracleAll.slice(0, spec.pre)), 'before the edit it is the song').toBe(true);
    expectFn(sameAudio(r.after, r.oracleAll.slice(spec.pre)), 'after the edit it is the edited module at the same position').toBe(true);
    expectFn(heard, 'and the edit is heard').toBe(true);
    return cell;
  }
  throw new Error(`no candidate cell gave an edit that is audible in the window and leaves the audio before it alone: ${tried.join(' | ')}`);
}
