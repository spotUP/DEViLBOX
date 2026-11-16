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
  /** The live-edit route the song takes (default 'engine-swap'; Art of Noise re-encodes in its own 'aon-module' route and reloads). */
  route?: string;
  /** How the audio after the swap is compared with the edited module played from the start (default: sample for sample). */
  sameTail?(after: Float32Array[], oracleTail: Float32Array[]): boolean;
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
/** How long the store's send (export, parse, swap) may take before the swap counts as missing. */
const SWAP_WAIT_MS = 10_000;

const isSwap = (m: Record<string, unknown>) => m.type === 'moduleSwapped' || (m.type === 'moduleReloaded' && m.ok === true);

/**
 * Wait for the store's own send of a keystroke (sendCellEdits: export, parse, swapModule) to reach the worklet. The test
 * must not send the edit itself as well: two sends race for one swap and the newer drops the older.
 */
export async function awaitSwap(live: Pick<WorkletHarness, 'posted'>): Promise<boolean> {
  for (let waited = 0; waited < SWAP_WAIT_MS && !live.posted.some(isSwap); waited += 50) await new Promise((r) => setTimeout(r, 50));
  await settle();
  return live.posted.some(isSwap);
}

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
  const { liveEditRoute, playingDescriptor } = await import('@/engine/replayer/liveCellEdits');
  const { editedModuleForPlay } = await import('@/engine/replayer/editedModuleForPlay');
  const routeIs = liveEditRoute(liveTrackerSong()).route;

  const live = await play(spec, bytes);
  let swapError = '';
  // The module the route handed the engine: the oracle for routes editedModuleForPlay does not cover (Art of Noise).
  let sent: ArrayBuffer | null = null;
  (globalThis as { __liveEngine?: unknown }).__liveEngine = {
    swapModule: (module: ArrayBuffer, ...loadArgs: unknown[]) => { sent = module.slice(0); live.send(spec.swapMessage(module, loadArgs)).catch((err) => { swapError = String(err); }); },
    // Art of Noise's route hands the engine its module by this name.
    replaceModule: (module: ArrayBuffer) => { sent = module.slice(0); live.send(spec.swapMessage(module, [])).catch((err) => { swapError = String(err); }); },
    // SidMon II's exporter asks the running engine for its module; this stand-in has none to give, so the stored one is used.
    save: async () => null,
  };
  const before = live.render(spec.pre);
  useTrackerStore.getState().setCurrentPattern(at.p);
  // The keystroke alone: the store sends the edit to the engine (sendCellEdits), as in the product. Sending it here as
  // well raced the store's send for the same swap, and the newer call dropped the older one.
  edit();
  const swapped = await awaitSwap(live);
  if (!swapped && process.env.LS_DEBUG) console.log('[ls] not swapped; worklet posted', JSON.stringify(live.posted.map((m) => [m.type, m.message])), 'swap error', swapError);
  const after = live.render(spec.post);
  (globalThis as { __liveEngine?: unknown }).__liveEngine = undefined;

  const edited = ((await editedModuleForPlay(liveTrackerSong(), playingDescriptor(liveTrackerSong())!)) ?? sent)!;
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
    expectFn(r.routeIs, 'the song is edited through its live route').toBe(spec.route ?? 'engine-swap');
    expectFn(r.swapped, 'the worklet swapped the module (sentinel)').toBe(true);
    expectFn(sameAudio(r.before, r.oracleAll.slice(0, spec.pre)), 'before the edit it is the song').toBe(true);
    expectFn((spec.sameTail ?? sameAudio)(r.after, r.oracleAll.slice(spec.pre)), 'after the edit it is the edited module at the same position').toBe(true);
    expectFn(heard, 'and the edit is heard').toBe(true);
    return cell;
  }
  throw new Error(`no candidate cell gave an edit that is audible in the window and leaves the audio before it alone: ${tried.join(' | ')}`);
}

/** The left channel of rendered blocks as one run of frames. */
const flat = (blocks: Float32Array[]): Float32Array => {
  const out = new Float32Array(blocks.length * 128);
  blocks.forEach((b, i) => out.set(b.subarray(0, 128), i * 128));
  return out;
};
/** Short-time RMS of a run of frames, windows of 441 frames (10 ms). */
const envelope = (x: Float32Array): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 441 <= x.length; i += 441) { let s = 0; for (let k = 0; k < 441; k++) s += x[i + k] * x[i + k]; out.push(Math.sqrt(s / 441)); }
  return out;
};
const correlation = (a: number[], b: number[]): number => {
  const n = Math.min(a.length, b.length);
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n, mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
};
/**
 * For a worklet that reloads the edited module and seeks it to the time already played (TFMX, libtfmxaudiodecoder): it seeks the reloaded module to the time already played in whole milliseconds and the decoder's seek is not
 * sample-exact (measured: no shift of the oracle matches a single frame exactly), so "the same position" is the loudness
 * envelope: over the 10 ms windows of the tail it follows the edited module's played from the start (correlation >= 0.9 at a shift within 50 ms).
 */
export const followsOracleEnvelope = (after: Float32Array[], oracleTail: Float32Array[]): boolean => {
  const a = envelope(flat(after)), o = envelope(flat(oracleTail));
  if (process.env.LS_DEBUG) {
    const res: string[] = [];
    for (const d of [-300, -100, -30, -10, -3, -1, 0, 1, 3, 10, 30, 100, 300]) res.push(`${d}:${correlation(a.slice(Math.max(0, -d)), o.slice(Math.max(0, d))).toFixed(2)}`);
    console.log('[ls] envelope correlation by shift (10 ms windows)', res.join(' '), 'peak a', Math.max(...a), 'o', Math.max(...o));
  }
  // The reload lands a little off the played time (measured: 30 ms, a jiffy and a half); more than 50 ms off is a lost position.
  let best = 0;
  for (let d = -5; d <= 5; d++) best = Math.max(best, correlation(a.slice(Math.max(0, -d)), o.slice(Math.max(0, d))));
  return a.some((v) => v > 0.001) && best >= 0.9;
};
