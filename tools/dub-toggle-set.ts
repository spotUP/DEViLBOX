#!/usr/bin/env npx tsx
/**
 * The seven toggles, measured as a SET.
 *
 * Wide, Wobble, Sub Harm, Liquid, Ring, Starve and Ping-Pong were all reported
 * as "dead" across the evening of 2026-09-22 and were treated as one fault.
 * They are not one fault. Three different things produce that report:
 *
 *   NOT RUNNING           nothing moved anywhere — the move never engaged
 *   RUNNING, INAUDIBLE    the bus return moved and the master did not — the
 *                         move is working into a path nobody hears
 *   RUNNING, AUDIBLE      the master moved — and then the only question left
 *                         is whether it moved the right way
 *
 * Telling them apart needs the bus return and the master measured together,
 * which is why this sits beside the other two sweeps rather than inside them:
 *
 *   `dub-untested-sweep.ts`   does each move do SOMETHING (peak delta)
 *   `dub-invariant-sweep.ts`  does the song still reach the speakers
 *   this                      WHERE does each toggle land, and how much
 *
 * ── Why the protocol looks like this ──────────────────────────────────────
 *
 * The song moves more than the moves do. Two readings of a tracker tune taken
 * at two different moments differed by 36% in rms with nothing fired at all,
 * and by 110% over a longer window. Three earlier versions of this tool were
 * discarded for building verdicts on that:
 *
 *   1. before/after delta against a fixed threshold — measured the music
 *   2. longer averaging windows — the drift grew with the window
 *   3. reducing the order to one pattern so the material repeats — the store
 *      accepted the new order and the native replayer kept its own, warning
 *      "engine reported song position 1, outside the loaded order (length 1)".
 *      The material was never actually held still.
 *
 * So the song is cancelled twice over.
 *
 * FIRST, nothing here is a LEVEL. Every metric is a ratio, and a ratio of two
 * things the song scales together does not move when the song gets louder:
 *
 *   busGain   busReturn / busInput — what the bus DOES to what it is given
 *   subFrac   each band as a share of the total, so the spectral SHAPE moves
 *   bassFrac  when a filter, a ring modulator or a crusher changes it, and
 *   midFrac   stays put when the song simply plays a louder bar
 *   highFrac
 *   crest     peak / rms — dynamics, which is what a crusher or a compressor
 *             changes and a level meter cannot see
 *
 * Measured over the same song, the absolute levels drifted by 101% with nothing
 * fired; the band fractions drift by a few percent.
 *
 * SECOND, each move is fired and released REPEATEDLY, and every cycle
 * contributes its own before/after pair. The song's remaining drift is
 * uncorrelated with when the move is held, so it does not keep the same SIGN
 * across cycles. A real effect does. A metric counts as moved only when the
 * median change beats the residual a control pass measured AND the sign agrees
 * across nearly every cycle.
 *
 * What this instrument still cannot do: an effect that MODULATES rather than
 * shifts — combSweep runs an LFO at 0.8 Hz — averages toward its own mean over
 * a four-second window, so its readings swing (+4%, -82%, +61% in one probe)
 * without that meaning it is inconsistent. Those are flagged, not judged.
 *
 * NOT measured here: stereo width. `stereoDoubler` is a cross-fed doubler and
 * the MCP analyser sums to mono, so its rms FALLING is the expected reading and
 * says nothing about whether it widened. That one needs ears; the table flags
 * it rather than pretending to a verdict.
 *
 * ── WHAT THIS TOOL COULD NOT ANSWER, AND WHY ─────────────────────────────
 *
 * Read this before running it expecting a verdict. Four protocol generations
 * produced four different answers on the same seven moves and the same song:
 *
 *   run 1  global control          Starve audible, midFrac +100% crest +18%
 *   run 3  global control, full vol Ping-Pong audible, crest +17%
 *   run 4  interleaved control     Sub Harm audible crest -11%, Wide subFrac -5%
 *
 * Run 4's hits barely clear their own bars, and Starve's +100% never repeated
 * (-3% in run 4). A different winner each run, always marginal: that is noise
 * passing the filter, not effects.
 *
 * The cause is not the statistics. These moves act on the BUS RETURN — one
 * channel's send at 0.6 mixed into a four-channel master — and
 * `get_audio_analysis` taps the master sum. The effect is measured where it is
 * most diluted, and four generations of better statistics cannot fix a signal
 * read in the wrong place.
 *
 * What the runs DO agree on: no toggle changes the MASTER spectrum by a large,
 * repeatable amount. That is not the same as "they do not work" — a trace of
 * the code showed all seven reach the bus and engage their parameters.
 *
 * So: to ask "did this move run", read its own line instead —
 * `fire_dub_move` then `get_console_errors`, which since 2546b3d24 returns
 * `[DubBus] combSweep ▶ mode=phaser amount=0.75 rate=0.8Hz ...`. One call, no
 * statistics. To ask "is it audible", use ears, or first put an FFT tap on the
 * bus return (`readHandlers.ts` has the rms tap already, band energies exist
 * only for the master).
 *
 * This file is kept for the protocol, the per-cycle data in
 * `tools/baselines/dub-toggle-set.json`, and because the residual numbers are
 * a real measurement of how much a tracker song moves on its own.
 *
 * Prereq: `npm run dev:fullstack`, a browser tab on the app, audio unlocked.
 * The tool loads its own song and leaves the order alone.
 *
 * Usage: npx tsx tools/dub-toggle-set.ts
 *        npx tsx tools/dub-toggle-set.ts --only combSweep      # repeatable
 *        npx tsx tools/dub-toggle-set.ts --resume              # skip recorded
 *        npx tsx tools/dub-toggle-set.ts --cycles 8            # more evidence
 *        DUB_SONG=path/to/file.ahx npx tsx tools/dub-toggle-set.ts
 *
 * Results accumulate in `tools/baselines/dub-toggle-set.json`, so an
 * interruption costs one move rather than the whole set.
 */

import { connect, call as rawCall, sleep, close, WS_URL } from './lib/mcpRelay';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { basename, dirname } from 'path';

/**
 * Every MCP call, with one reconnect.
 *
 * A full pass is ten minutes of continuous polling, and the relay socket drops
 * inside it: on 2026-09-23 three runs died mid-control-pass with "Browser
 * disconnected" while the page itself was fine — the CED classifier was
 * fetching an 87 MB model and running inference on the same thread. Losing ten
 * minutes of measurement to a socket is not a measurement problem, so the
 * socket is simply re-dialled and the call repeated.
 */
async function call(method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<any> {
  try {
    return await rawCall(method, params, timeoutMs);
  } catch (e) {
    const msg = (e as Error).message;
    if (!/disconnect|not connected|timeout/i.test(msg)) throw e;
    console.log(`[toggles] relay lost (${msg}) — reconnecting`);
    for (let attempt = 1; attempt <= 6; attempt++) {
      await sleep(2000);
      try {
        await connect();
        return await rawCall(method, params, timeoutMs);
      } catch (retryErr) {
        if (attempt === 6) throw retryErr;
      }
    }
    throw e;
  }
}

const SONG = process.env.DUB_SONG ?? 'public/data/songs/ahx/amanda.ahx';
const RESULTS = 'tools/baselines/dub-toggle-set.json';

const ONLY: Set<string> = (() => {
  const picked = new Set<string>();
  process.argv.forEach((a, i) => { if (a === '--only' && process.argv[i + 1]) picked.add(process.argv[i + 1]); });
  return picked;
})();
const RESUME = process.argv.includes('--resume');
/**
 * Measure whatever is already open instead of loading a song.
 *
 * The default loads its own song so a run is reproducible, but that overwrites
 * unsaved work — on 2026-09-23 the editor held a restored crash snapshot that
 * existed nowhere else. With this flag the tool touches no project state at
 * all: it starts the transport if it is stopped, opens a send, and puts both
 * back at the end.
 */
const USE_LOADED = process.argv.includes('--use-loaded');
const CYCLES = (() => {
  const i = process.argv.indexOf('--cycles');
  const n = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(n) && n >= 3 ? Math.floor(n) : 5;
})();

/** How long one reading averages for. */
const WINDOW_MS = 4000;
/**
 * Target spacing between samples inside a window. Each sample is two MCP round
 * trips, so 120 ms meant sixteen calls a second into a page that is also
 * rendering, playing and — when the instrument classifier wakes up — running
 * ONNX inference. That is enough to lose the relay socket.
 */
const SAMPLE_GAP_MS = 250;
/** A window whose loudest frame is below this has nothing in it at all. */
const SIGNAL_FLOOR = 1e-5;
/**
 * How quiet a cycle may be, as a SHARE of what this run's control pass found
 * the song reading.
 *
 * It was an absolute 0.002, which is a threshold that cannot tell "the graph is
 * dead" from "the master fader is down". On 2026-09-23 the owner lowered the
 * master to hear a meeting; the song was still playing at rms 0.001595 and
 * every cycle would have been thrown away as silent. The ratio metrics do not
 * care about the master fader — that is the whole point of them — so neither
 * should the guard that decides whether they count.
 *
 * A dead graph reads 1e-6 against a reference of 1e-3, which is 0.1% and far
 * under this; a quiet-but-playing song sits near 100% of its own reference.
 */
const SILENT_RUN_SHARE = 0.1;
/** And an absolute floor under everything, for a run whose reference is itself
 *  silence. */
const SILENT_RUN_FLOOR = 1e-5;

/** Set from the control pass: what this song reads while it is playing. */
let referenceRms = 0;
/**
 * A frame counts toward the ratios only when it is at least this share of the
 * loudest frame in its own window. Between notes a tracker song drops to
 * near-silence, and a ratio of two near-zero numbers is noise with the
 * authority of a measurement.
 */
const ACTIVE_FRAME_SHARE = 0.25;
/**
 * How long a move is given to reach its steady state before the held reading
 * starts. Ramp-up moves (tapeWobble, subHarmonic) climb into an envelope, and
 * reading them mid-climb is how they were called FLAT before.
 */
const SETTLE_MS = 2000;
/**
 * And how long after release before the next cycle's before-reading, so an echo
 * or reverb tail is not counted as the next baseline.
 */
const TAIL_SETTLE_MS = 2500;

/**
 * The share of cycles that must agree on the direction of a change.
 *
 * At five cycles this means four. Pure chance gives one metric a run of four
 * agreeing signs about 19% of the time, which is why agreement alone is not
 * enough and the median must also beat the residual.
 */
const SIGN_AGREEMENT = 0.8;

/** Below this many cycles with signal, a move is reported as NOT MEASURED. */
const MIN_USABLE_CYCLES = 3;

interface Toggle { label: string; id: string; widthOnly?: boolean }

/** The `group: 'toggle'` row of the deck, minus Ghost and Sweep — both are
 *  queued for a change of control kind and are measured once that lands. */
const TOGGLES: Toggle[] = [
  { label: 'Wide',      id: 'stereoDoubler', widthOnly: true },
  { label: 'Wobble',    id: 'tapeWobble' },
  { label: 'Sub Harm',  id: 'subHarmonic' },
  { label: 'Liquid',    id: 'combSweep' },
  { label: 'Ring',      id: 'ringMod' },
  { label: 'Starve',    id: 'voltageStarve' },
  { label: 'Ping-Pong', id: 'madProfPingPong' },
];

// ── Measurement ─────────────────────────────────────────────────────────────

/**
 * One reading. Nothing here is an absolute level — see the header: the song's
 * own level moves further than any of these moves do.
 */
interface Reading {
  /** busReturn / busInput: what the bus does to what it is given. */
  busGain: number;
  /** Each band as a share of the total — the spectral shape, not the volume. */
  subFrac: number; bassFrac: number; midFrac: number; highFrac: number;
  /** peak / rms: dynamics. A crusher or a compressor moves this. */
  crest: number;
  /** Kept for the record, excluded from every verdict. */
  rmsAbs: number; busInputAbs: number; busReturnAbs: number;
}

const METRICS = ['busGain', 'subFrac', 'bassFrac', 'midFrac', 'highFrac', 'crest'] as const;
type Metric = typeof METRICS[number];
/** The ones that say the MASTER changed, i.e. that a listener would hear it. */
const MASTER_METRICS: Metric[] = ['subFrac', 'bassFrac', 'midFrac', 'highFrac', 'crest'];
/** And the one that says the BUS changed, whether or not it reached anyone. */
const BUS_METRICS: Metric[] = ['busGain'];

/**
 * One reading, averaged over a window.
 *
 * `get_audio_analysis` returns a single frame, and a single frame of a tracker
 * song is whatever happened to be on that tick — a hat or a rest. Averaging
 * over several bars is what makes two readings comparable at all.
 *
 * Each ratio is formed PER FRAME and then averaged, never as a ratio of two
 * averages: a frame where the song is silent carries no information about the
 * bus's gain, and letting it through as 0/0 is how a rest becomes a finding.
 */
async function measure(durationMs = WINDOW_MS): Promise<Reading> {
  const raw: { rms: number; peak: number; total: number;
               sub: number; bass: number; mid: number; high: number;
               busIn: number; busRet: number }[] = [];
  const until = Date.now() + durationMs;
  while (Date.now() < until) {
    const [an, st] = await Promise.all([
      call('get_audio_analysis'),
      call('get_dub_bus_state'),
    ]);
    const sub = an?.bandEnergy?.sub ?? 0;
    const bass = an?.bandEnergy?.bass ?? 0;
    const mid = an?.bandEnergy?.mid ?? 0;
    const high = an?.bandEnergy?.high ?? 0;
    raw.push({
      rms: an?.rms ?? 0, peak: an?.peak ?? 0,
      total: sub + bass + mid + high, sub, bass, mid, high,
      busIn: st?.masterInsertLevels?.busInput ?? 0,
      busRet: st?.masterInsertLevels?.busReturn ?? 0,
    });
    if (Date.now() + SAMPLE_GAP_MS < until) await sleep(SAMPLE_GAP_MS);
  }

  // Frames where the song is between notes carry no information about a ratio
  // and enormous noise: busReturn / busInput at 1e-5 swings by orders of
  // magnitude, which is what made busGain read an 87% residual with nothing
  // fired. Keep only the frames that are loud RELATIVE TO THIS WINDOW, so the
  // gate follows the song instead of being a level this file invented.
  const loud = <T>(rows: T[], of: (r: T) => number): T[] => {
    const max = Math.max(...rows.map(of), 0);
    if (max <= SIGNAL_FLOOR) return [];
    return rows.filter(r => of(r) >= max * ACTIVE_FRAME_SHARE);
  };
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const banded = loud(raw, r => r.total);
  const busy = loud(raw, r => r.busIn);
  const voiced = loud(raw, r => r.rms);

  return {
    busGain: mean(busy.map(r => r.busRet / r.busIn)),
    subFrac: mean(banded.map(r => r.sub / r.total)),
    bassFrac: mean(banded.map(r => r.bass / r.total)),
    midFrac: mean(banded.map(r => r.mid / r.total)),
    highFrac: mean(banded.map(r => r.high / r.total)),
    crest: mean(voiced.map(r => r.peak / r.rms)),
    rmsAbs: mean(raw.map(r => r.rms)),
    busInputAbs: mean(raw.map(r => r.busIn)),
    busReturnAbs: mean(raw.map(r => r.busRet)),
  };
}

/** Relative change, guarded so a metric that was already at zero cannot make
 *  an infinite one. */
function relDelta(before: number, after: number): number {
  const floor = 1e-6;
  if (Math.abs(before) < floor && Math.abs(after) < floor) return 0;
  if (Math.abs(before) < floor) return 1;
  return (after - before) / Math.abs(before);
}

/** Linear-interpolated percentile, 0..1. */
function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** How many of the cycles agreed on the direction, as a share of them all. */
function signAgreement(xs: number[]): number {
  if (!xs.length) return 0;
  const pos = xs.filter(x => x > 0).length;
  const neg = xs.filter(x => x < 0).length;
  return Math.max(pos, neg) / xs.length;
}

// ── Cycles ──────────────────────────────────────────────────────────────────

const openHandles = new Set<string>();

/**
 * One before/after pair. `moveId` null runs the control: the same timing, the
 * same windows, nothing fired — which is the only way to know what this
 * procedure reports when the answer is "nothing happened".
 */
async function cycle(moveId: string | null): Promise<{
  deltas: Record<Metric, number>;
  before: Reading;
  after: Reading;
  silent: boolean;
  fireError?: string;
}> {
  const before = await measure();

  let handle: string | null = null;
  let fireError: string | undefined;
  if (moveId) {
    try {
      const r = await call('fire_dub_move', { moveId, channelId: 0 });
      handle = r?.heldHandle ?? null;
      if (handle) openHandles.add(handle);
    } catch (e) { fireError = (e as Error).message; }
  }

  await sleep(SETTLE_MS);
  const after = await measure();

  if (handle) {
    try { await call('release_dub_move', { heldHandle: handle }); }
    catch (e) { fireError = `${fireError ?? ''} release: ${(e as Error).message}`; }
    openHandles.delete(handle);
  }
  await sleep(TAIL_SETTLE_MS);

  const deltas = Object.fromEntries(
    METRICS.map(m => [m, relDelta(before[m], after[m])]),
  ) as Record<Metric, number>;
  // A cycle measured against silence says nothing, and says it in the shape of
  // a confident zero: every ratio comes back 0 with no sign to disagree about,
  // which reads exactly like "the move does nothing". The 2026-09-21 sweep
  // reported 28 failures that way. A cycle that had no signal is marked here
  // and excluded from the verdict rather than averaged into it.
  const floor = Math.max(referenceRms * SILENT_RUN_SHARE, SILENT_RUN_FLOOR);
  const silent = before.rmsAbs < floor || after.rmsAbs < floor;
  return { deltas, before, after, silent, fireError };
}

// ── Results file ────────────────────────────────────────────────────────────

interface MoveResult {
  label: string;
  id: string;
  measuredAt: string;
  song: string;
  cycles: number;
  fireError?: string;
  /** Every USABLE cycle's change, kept so a verdict can be re-argued without re-running. */
  perCycle: Record<Metric, number>[];
  /** The interleaved control cycles for THIS move, in the same bars. */
  controlCycle: Record<Metric, number>[];
  /** The bar this move had to clear, derived from its own control cycles. */
  residual: Record<Metric, number>;
  residualAgreement: Record<Metric, number>;
  /** What the song was actually doing in each cycle — the audit trail that says
   *  whether a verdict was measured against music or against silence. */
  levels: { rms: number; busIn: number; busRet: number; silent: boolean }[];
  silentCycles: number;
  /** The typical change across cycles. */
  medianDelta: Record<Metric, number>;
  /** How consistently the cycles agreed on its direction, 0.5 = coin flip. */
  agreement: Record<Metric, number>;
  moved: Metric[];
  verdict: string;
  warnings: string[];
}

interface ResultsFile {
  /** What this procedure reports with nothing fired. */
  residual?: Record<Metric, number>;
  residualAgreement?: Record<Metric, number>;
  residualMeasuredAt?: string;
  cycles?: number;
  /** What the song read while playing, for this run. Every silence decision
   *  below is relative to it, so a lowered master fader does not invalidate a
   *  run whose metrics are ratios anyway. */
  referenceRms?: number;
  moves: Record<string, MoveResult>;
}

function loadResults(): ResultsFile {
  if (!existsSync(RESULTS)) return { moves: {} };
  try { return JSON.parse(readFileSync(RESULTS, 'utf8')) as ResultsFile; }
  catch { return { moves: {} }; }
}

function saveResults(r: ResultsFile): void {
  mkdirSync(dirname(RESULTS), { recursive: true });
  writeFileSync(RESULTS, JSON.stringify(r, null, 2) + '\n');
}

// ── Teardown ────────────────────────────────────────────────────────────────

let panicking = false;

/** Silence everything this tool could have started. A held toggle keeps making
 *  sound until something releases it, and an interrupt is exactly when that
 *  matters most. */
async function panic(reason: string): Promise<void> {
  if (panicking) return;
  panicking = true;
  console.log(`\n[toggles] teardown (${reason})`);
  for (const h of openHandles) {
    try { await call('release_dub_move', { heldHandle: h }, 3000); } catch { /* ok */ }
  }
  openHandles.clear();
  try { await call('release_all_notes', {}, 3000); } catch { /* ok */ }
  try { await call('set_channel_dub_send', { channel: 0, amount: 0 }, 3000); } catch { /* ok */ }
  try { await call('stop', {}, 3000); } catch { /* ok */ }
  try { await call('set_dub_bus_enabled', { enabled: false }, 3000); } catch { /* ok */ }
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { void panic(sig).then(() => { close(); process.exit(130); }); });
}

// ── Sweep ───────────────────────────────────────────────────────────────────

/**
 * Use whatever is open. Starts the transport if it is stopped and returns the
 * song's name for the record; changes nothing else.
 */
async function useLoadedSong(): Promise<string> {
  const info = await call('get_song_info');
  // `numPatterns`, not `patterns` — the wrong field reads undefined for every
  // song, which in the sweep next door silently meant "nothing is open, load
  // mine" over the user's unsaved work.
  if (!info?.numPatterns) throw new Error('--use-loaded: nothing is loaded in the browser');
  const st = await call('get_playback_state');
  if (!st?.isPlaying) { await call('play'); await sleep(1500); }
  const name = info?.projectName || 'loaded song';
  console.log(`[toggles] measuring against what is already open: ${name}`);
  return String(name);
}

async function loadSong(path: string): Promise<void> {
  const bytes = readFileSync(path);
  await call('load_file', { filename: basename(path), data: bytes.toString('base64') }, 30000);
  await sleep(1200);
  const st = await call('get_playback_state');
  if (!st?.isPlaying) { await call('play'); }
  await sleep(1500);
}

function verdictFor(t: Toggle, moved: Metric[]): string {
  const busMoved = moved.some(m => BUS_METRICS.includes(m));
  const masterMoved = moved.some(m => MASTER_METRICS.includes(m));

  if (t.widthOnly) {
    // A mono sum cannot show width, so no reading here is a verdict on this
    // move. Say what it did to the sum and leave the judgement to ears.
    return masterMoved || busMoved ? 'NEEDS EARS (mono sum moved)' : 'NEEDS EARS (mono sum flat)';
  }
  if (!busMoved && !masterMoved) return 'NOT RUNNING';
  if (busMoved && !masterMoved) return 'RUNNING, INAUDIBLE';
  return 'RUNNING, AUDIBLE';
}

async function main(): Promise<void> {
  console.log(`[toggles] connecting to ${WS_URL}`);
  await connect();

  const results = loadResults();
  const wanted = ONLY.size ? TOGGLES.filter(t => ONLY.has(t.id) || ONLY.has(t.label)) : TOGGLES;
  const todo = RESUME ? wanted.filter(t => !results.moves[t.id]) : wanted;

  if (!wanted.length) {
    console.log('[toggles] nothing matched --only');
    close();
    return;
  }
  if (!todo.length) {
    console.log('[toggles] everything requested is already recorded — drop --resume to re-measure');
    close();
    return;
  }

  const song = USE_LOADED ? await useLoadedSong() : (await loadSong(SONG), SONG);
  await call('set_dub_bus_enabled', { enabled: true });
  // Every toggle in this set is `needsSend: true`: with no send open the bus is
  // starved and each of them measures as dead for a reason that has nothing to
  // do with the move.
  await call('set_channel_dub_send', { channel: 0, amount: 0.6 });
  await sleep(1500);

  // Establish what "playing" reads as, before anything is judged against it.
  // Without this the first control cycle has no reference and the guard is a
  // number picked in advance — which is how a lowered master fader became
  // "every cycle silent".
  const reference = await measure();
  referenceRms = reference.rmsAbs;
  if (referenceRms < SILENT_RUN_FLOOR) {
    throw new Error(`the song reads rms ${referenceRms.toExponential(2)} — it is not playing`);
  }
  console.log(`[toggles] reference rms ${referenceRms.toFixed(6)} — cycles below `
    + `${Math.max(referenceRms * SILENT_RUN_SHARE, SILENT_RUN_FLOOR).toFixed(6)} are dropped as silent`);

  console.log(`\n[toggles] control pass — ${CYCLES} cycles with nothing fired`);
  const controlDeltas = Object.fromEntries(METRICS.map(m => [m, [] as number[]])) as Record<Metric, number[]>;
  // ── The control is INTERLEAVED, not taken once up front ─────────────────
  //
  // A single control pass at the start of the run was the last thing wrong with
  // this tool, and it made the verdicts flip between runs: Starve read
  // RUNNING/AUDIBLE (midFrac +100%) in one run and NOT RUNNING (midFrac -2%) in
  // the next, and Ping-Pong did the opposite. The seven moves run ~60 s apart
  // and amanda.ahx is eight patterns, about 80 s — so every move is measured
  // against a different section of the song while the bar it must clear was
  // measured against one particular section, once. Five cycles cancel the
  // song's LEVEL. They do not cancel its STRUCTURE: a busy passage drifts far
  // more between two readings than a sparse one, so a threshold borrowed from
  // elsewhere in the song is the wrong threshold.
  //
  // Each move now carries its own control, cycle by cycle, from the same bars:
  // control, move, control, move. Twice the runtime and the difference between
  // a number and a guess.
  results.cycles = CYCLES;
  // The reference every silence decision in this run was made against. Without
  // it the recorded verdicts cannot be re-checked for "was the song playing".
  results.referenceRms = referenceRms;
  saveResults(results);

  console.log(`\n[toggles] measuring ${todo.length} toggle(s), ${CYCLES} paired cycles each\n`);
  for (const t of todo) {
    await call('clear_console_errors');

    const perCycle: Record<Metric, number>[] = [];
    const controlCycle: Record<Metric, number>[] = [];
    const levels: { rms: number; busIn: number; busRet: number; silent: boolean }[] = [];
    let fireError: string | undefined;
    for (let i = 0; i < CYCLES; i++) {
      // The control for THIS move, in THIS passage, immediately before it.
      const c = await cycle(null);
      if (!c.silent) controlCycle.push(c.deltas);

      const r = await cycle(t.id);
      levels.push({
        rms: +r.before.rmsAbs.toFixed(6),
        busIn: +r.before.busInputAbs.toFixed(6),
        busRet: +r.before.busReturnAbs.toFixed(6),
        silent: r.silent,
      });
      if (!r.silent) perCycle.push(r.deltas);
      if (r.fireError) fireError = r.fireError;
    }

    // This move's own bar, from its own control cycles. The 80th percentile
    // rather than the worst, so one freak cycle cannot hide everything behind
    // it; the floor stops a freakishly steady passage making every move "move".
    const residual = Object.fromEntries(
      METRICS.map(m => [m, Math.max(percentile(controlCycle.map(c => Math.abs(c[m])), 0.8), 0.03)]),
    ) as Record<Metric, number>;
    const residualAgreement = Object.fromEntries(
      METRICS.map(m => [m, signAgreement(controlCycle.map(c => c[m]))]),
    ) as Record<Metric, number>;

    const silentCycles = levels.filter(l => l.silent).length;
    const medianDelta = Object.fromEntries(
      METRICS.map(m => [m, median(perCycle.map(c => c[m]))]),
    ) as Record<Metric, number>;
    const agreement = Object.fromEntries(
      METRICS.map(m => [m, signAgreement(perCycle.map(c => c[m]))]),
    ) as Record<Metric, number>;

    // Both conditions, because either alone is met by chance often enough to
    // have produced a wrong verdict in an earlier version of this tool.
    const measurable = perCycle.length >= MIN_USABLE_CYCLES
      && controlCycle.length >= MIN_USABLE_CYCLES;
    const moved = measurable
      ? METRICS.filter(m => Math.abs(medianDelta[m]) > residual[m] && agreement[m] >= SIGN_AGREEMENT)
      : [];
    const verdict = measurable
      ? verdictFor(t, moved)
      : `NOT MEASURED (${silentCycles}/${CYCLES} move cycles silent,`
        + ` ${CYCLES - controlCycle.length}/${CYCLES} control cycles silent)`;

    const errs = await call('get_console_errors');
    const warnings: string[] = (errs?.entries ?? [])
      .filter((e: { level: string }) => e.level === 'warn' || e.level === 'error')
      .map((e: { level: string; message: string }) => `${e.level}: ${e.message.slice(0, 150)}`);

    results.moves[t.id] = {
      label: t.label, id: t.id,
      measuredAt: new Date().toISOString(),
      song, cycles: CYCLES, fireError,
      perCycle, controlCycle, residual, residualAgreement,
      levels, silentCycles, medianDelta, agreement, moved, verdict, warnings,
    };
    saveResults(results);

    const cell = (m: Metric) => (moved.includes(m)
      ? `${medianDelta[m] >= 0 ? '+' : ''}${(medianDelta[m] * 100).toFixed(0)}%`.padStart(6)
      : '     -');
    console.log(
      `${t.label.padEnd(10)} ${verdict.padEnd(26)} ` +
      `busGain${cell('busGain')} sub${cell('subFrac')} bass${cell('bassFrac')} ` +
      `mid${cell('midFrac')} high${cell('highFrac')} crest${cell('crest')}`,
    );
    console.log(`${' '.repeat(10)} bar for this passage: `
      + METRICS.map(m => `${m} ${(residual[m] * 100).toFixed(0)}%`).join('  '));
    if (fireError) console.log(`${' '.repeat(10)} FIRE: ${fireError}`);
    for (const w of new Set(warnings)) console.log(`${' '.repeat(10)} ${w}`);
  }

  await panic('end of run');

  console.log(`\n=== recorded to ${RESULTS} ===`);
  const byVerdict = new Map<string, string[]>();
  for (const t of wanted) {
    const r = results.moves[t.id];
    if (!r) continue;
    const list = byVerdict.get(r.verdict) ?? [];
    list.push(r.label);
    byVerdict.set(r.verdict, list);
  }
  for (const [v, labels] of byVerdict) console.log(`  ${v.padEnd(26)} ${labels.join(', ')}`);

  close();
}

main().catch(async (e) => {
  console.error('[toggles] fatal:', e);
  await panic('fatal error');
  close();
  process.exit(2);
});
