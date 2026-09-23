#!/usr/bin/env npx tsx
/**
 * Dub bus INVARIANT sweep — does the song still reach the speakers?
 *
 * `dub-untested-sweep.ts` beside this file asks whether each move DOES
 * something (peak delta against a baseline). That question cannot catch the
 * class of bug found on 2026-09-21, all three of which were a JavaScript record
 * disagreeing with the audio graph or the worklet:
 *
 *   - `DubChannelLifecycle.active` outlived the worklet, so a channel's dub
 *     send was dead after the next song load (fader moved, store updated, no
 *     audio split out).
 *   - `masterInsertActive` was cleared 15 ms before the graph work, so a second
 *     unwire in that window left the insert as the ONLY route to the
 *     destination — "the dub effects but not the song", then total silence when
 *     the bus was switched off.
 *   - `dispose()` cancelled the deferred rewire, leaving no route at all.
 *
 * None of them changed how anything SOUNDS. They removed a path, and what was
 * left still sounded plausible, which is why they survived listening tests. So
 * this sweep asserts properties instead:
 *
 *   DRY   the song still reaches the master (rms within a factor of the
 *         baseline taken before the step)
 *   SYNC  the worklet's `dubChannelEnabled` agrees with the store's
 *         `channelDubSends` for every channel
 *   MUTE  no mixer channel is left muted by a move that has been released
 *   REST  sends return to the values they had before a move borrowed them
 *   ERR   no new console errors
 *
 * Phase M adds the three RUNTIME METER checks, which are a different question
 * again: not "is a path missing" but "is the signal on the path at the level
 * everything downstream assumes". The night of 2026-09-22 was spent on faults
 * that were invisible to a green suite and plain in one `get_dub_bus_state`
 * read, because happy-dom has no AudioWorklet, no audio graph and no layout:
 *
 *   WET    the bus INPUT carries the song when a send is open. The "Liquid is
 *          dead" report began here, with `busInput` at 0.000001 while the suite
 *          was green and the master sounded normal — the moves were running on
 *          nothing. Absolute floor plus a ratio against the stage feeding the
 *          bus, so it holds through a quiet passage as well as a loud one.
 *   MASTER the engine's master gain agrees with the store that owns it. A
 *          −29.76 dB master with no hardware attached cost hours; the store
 *          said 0 dB throughout, so only comparing the two could see it.
 *   CAP    a capture move hears the bus. `backwardReverb` and `reverseEcho`
 *          snapshot the bus ring and abort when its peak is under
 *          CAPTURE_SILENCE_PEAK (1e-4 in DubBus.ts) — that abort is the
 *          earliest honest signal that the bus is starved, and it warns.
 *
 * Phase A drives the bus lifecycle (enable, sends, song reload, rapid toggles).
 * Phase M reads the meters with the bus armed and a send open.
 * Phase B fires every move and re-checks all five afterwards.
 *
 * Prereq: `npm run dev:fullstack`, a browser tab on the app, audio unlocked.
 * The sweep loads its own song, so it does not matter what is open.
 *
 * Usage: npx tsx tools/dub-invariant-sweep.ts
 *        DUB_SONG=path/to/file.ahx npx tsx tools/dub-invariant-sweep.ts
 *        npx tsx tools/dub-invariant-sweep.ts --phase M      # meters only
 *        npx tsx tools/dub-invariant-sweep.ts --phase A,M    # skip the moves
 *        npx tsx tools/dub-invariant-sweep.ts --move toast   # one move, repeatable
 *
 * Phase B holds the machine for several minutes and the meters answer a
 * question of their own, so re-running one phase or one move must not cost the
 * whole sweep.
 */

import { connect, call, sleep, close, WS_URL } from './lib/mcpRelay';
import {
  checkBusInputWet,
  checkMasterGainAgrees,
  checkCaptureNotAborted,
  type DubMeterState,
  checkTailDecays,
} from '../src/engine/dub/meterInvariants';
import { readFileSync } from 'fs';
import { basename } from 'path';

/** `--phase A,M` / `--phase M`; every phase when the flag is absent. */
const PHASES: Set<string> = (() => {
  const i = process.argv.indexOf('--phase');
  const raw = i >= 0 ? process.argv[i + 1] : undefined;
  if (!raw) return new Set(['A', 'M', 'B']);
  return new Set(raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
})();

/** `--move toast --move filterDrop`; every move when absent. Implies Phase B. */
const ONLY_MOVES: Set<string> = (() => {
  const picked = new Set<string>();
  process.argv.forEach((a, i) => { if (a === '--move' && process.argv[i + 1]) picked.add(process.argv[i + 1]); });
  return picked;
})();

const SONG_A = process.env.DUB_SONG ?? 'public/data/songs/ahx/amanda.ahx';
const SONG_B = process.env.DUB_SONG_B
  ?? 'server/data/modland-cache/files/pub__modules__AHX__Mortimer Twang__jennipha.ahx';

/** Below this the master is silent for practical purposes. */
const SILENCE_RMS = 0.001;
/**
 * How far the master may fall below the step's own baseline before it counts
 * as the song having gone missing.
 *
 * A move is allowed to duck the mix — masterDrop and channelMute exist to do
 * exactly that — so this is checked AFTER the move is released and its tail
 * has run, not while it is held. A quarter of baseline is generous enough for
 * a passage change and far above the 40x collapse the real bug produced.
 */
const DRY_FLOOR_RATIO = 0.25;

interface Check { name: string; ok: boolean; detail: string; }
interface StepResult { step: string; checks: Check[]; }

const results: StepResult[] = [];

function record(step: string, checks: Check[]): void {
  results.push({ step, checks });
  const bad = checks.filter(c => !c.ok);
  const mark = bad.length === 0 ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${step}`);
  for (const c of bad) console.log(`        ${c.name}: ${c.detail}`);
}

async function level(durationMs = 800): Promise<{ rms: number; silent: boolean }> {
  const l = await call('get_audio_level', { durationMs });
  return { rms: l?.rmsAvg ?? 0, silent: !!l?.silent };
}

/**
 * DRY — the song still reaches the master.
 *
 * `baseline` is the reading taken immediately before this step, so the
 * comparison is against the same song and roughly the same passage, not
 * against a number from a different bar. That mistake produced two wrong
 * conclusions in the 2026-09-21 investigation.
 */
function checkDry(rms: number, silent: boolean, baseline: number): Check {
  if (silent || rms < SILENCE_RMS) {
    return { name: 'DRY', ok: false, detail: `master silent (rms ${rms.toFixed(6)}), baseline ${baseline.toFixed(6)}` };
  }
  const floor = baseline * DRY_FLOOR_RATIO;
  if (baseline > SILENCE_RMS && rms < floor) {
    return {
      name: 'DRY', ok: false,
      detail: `master fell to ${rms.toFixed(6)} from ${baseline.toFixed(6)} (below ${(DRY_FLOOR_RATIO * 100)}%)`,
    };
  }
  return { name: 'DRY', ok: true, detail: `rms ${rms.toFixed(6)}` };
}

/** SYNC — the worklet's enable set agrees with the store's send values. */
function checkSync(state: any): Check {
  const sends: number[] = (state?.channelDubSends ?? []).map((c: any) => c?.dubSend ?? 0);
  const enabled: boolean[] = state?.hivelyRenderStats?.dubChannelEnabled ?? [];
  if (!enabled.length) {
    return { name: 'SYNC', ok: true, detail: 'no worklet diag (engine does not report one)' };
  }
  const wasmChannels: number = state?.hivelyRenderStats?.wasmChannels ?? sends.length;
  const wrong: string[] = [];
  for (let ch = 0; ch < wasmChannels; ch++) {
    const wants = (sends[ch] ?? 0) > 0;
    const has = !!enabled[ch];
    if (wants !== has) wrong.push(`ch${ch} send=${(sends[ch] ?? 0).toFixed(3)} enabled=${has}`);
  }
  return wrong.length
    ? { name: 'SYNC', ok: false, detail: `store and worklet disagree: ${wrong.join(', ')}` }
    : { name: 'SYNC', ok: true, detail: 'store and worklet agree' };
}

/** MUTE — nothing left a channel muted behind it. */
async function checkMute(): Promise<Check> {
  const mixer = await call('get_mixer_state');
  const muted = (mixer?.channels ?? [])
    .filter((c: any) => c?.muted)
    .map((c: any) => c.index);
  if (mixer?.masterMuted) return { name: 'MUTE', ok: false, detail: 'master is muted' };
  return muted.length
    ? { name: 'MUTE', ok: false, detail: `channels left muted: ${muted.join(', ')}` }
    : { name: 'MUTE', ok: true, detail: 'nothing muted' };
}

/** REST — the sends came back to where they were before the move. */
function checkRest(before: number[], after: number[]): Check {
  const drift: string[] = [];
  for (let ch = 0; ch < before.length; ch++) {
    const d = Math.abs((after[ch] ?? 0) - (before[ch] ?? 0));
    if (d > 0.02) drift.push(`ch${ch} ${before[ch].toFixed(3)} -> ${(after[ch] ?? 0).toFixed(3)}`);
  }
  return drift.length
    ? { name: 'REST', ok: false, detail: `sends not restored: ${drift.join(', ')}` }
    : { name: 'REST', ok: true, detail: 'sends restored' };
}

/** WET — see `checkBusInputWet`; the predicate is shared with the unit suite. */
function checkWet(state: unknown): Check {
  return checkBusInputWet(state as DubMeterState);
}

/** MASTER — see `checkMasterGainAgrees`. The mixer read is the only live part. */
async function checkMaster(state: unknown): Promise<Check> {
  const mixer = await call('get_mixer_state');
  return checkMasterGainAgrees(state as DubMeterState, mixer);
}

/**
 * CAP — a capture move hears the bus.
 *
 * `backwardReverb` takes a snapshot of the bus ring and refuses to play it when
 * its peak is below `CAPTURE_SILENCE_PEAK` (1e-4, `DubBus.ts`), warning
 * "captured SILENCE" and toasting the performer. That abort is the product's
 * own silence detector, so this check does not re-implement the threshold — it
 * fires the move and asks whether the product aborted.
 *
 * Clears the console first so an older abort cannot be read as this one's.
 */
async function checkCapture(): Promise<Check> {
  await call('clear_console_errors');
  let handle: string | null = null;
  try {
    const r = await call('fire_dub_move', { moveId: 'backwardReverb' });
    handle = r?.heldHandle ?? null;
    if (handle) openHandles.add(handle);
  } catch (e) {
    return { name: 'CAP', ok: false, detail: `backwardReverb did not fire: ${(e as Error).message}` };
  }
  // The snapshot is a round trip to the worklet; the abort warns on arrival.
  await sleep(1800);
  if (handle) {
    try { await call('release_dub_move', { heldHandle: handle }); } catch { /* reported below */ }
    openHandles.delete(handle);
  }

  const errs = await call('get_console_errors');
  return checkCaptureNotAborted(errs?.entries ?? []);
}

async function checkErrors(): Promise<Check> {
  const errs = await call('get_console_errors');
  const entries = (errs?.entries ?? []).filter((e: any) => e.level === 'error');
  return entries.length
    ? { name: 'ERR', ok: false, detail: `${entries.length} console error(s): ${String(entries[0]?.message).slice(0, 140)}` }
    : { name: 'ERR', ok: true, detail: 'no console errors' };
}

/**
 * Every hold handle this sweep has opened and not yet released.
 *
 * A held move keeps making sound until something releases it. Interrupting the
 * script used to leave whatever was held, held — on 2026-09-21 that was an
 * oscillator move screaming through the monitors with nothing left running to
 * close it. The registry plus `panic()` below is what makes Ctrl-C safe.
 */
const openHandles = new Set<string>();

let panicking = false;

/**
 * Silence everything this sweep could have started.
 *
 * Ordered loudest-first: release the holds, stop the transport, then take the
 * bus itself away, because the bus is what the holds are making noise through.
 * Every step is best-effort — panic runs when things are already going wrong,
 * so one failure must not stop the rest.
 */
async function panic(reason: string): Promise<void> {
  if (panicking) return;
  panicking = true;
  console.log(`\n[inv] panic teardown (${reason})`);
  for (const h of openHandles) {
    try { await call('release_dub_move', { heldHandle: h }, 3000); } catch { /* ok */ }
  }
  openHandles.clear();
  try { await call('release_all_notes', {}, 3000); } catch { /* ok */ }
  try { await call('set_channel_dub_send', { channel: 0, amount: 0 }, 3000); } catch { /* ok */ }
  try { await call('set_channel_dub_send', { channel: 1, amount: 0 }, 3000); } catch { /* ok */ }
  try { await call('stop', {}, 3000); } catch { /* ok */ }
  try { await call('set_dub_bus_enabled', { enabled: false }, 3000); } catch { /* ok */ }
  console.log('[inv] teardown done — bus disabled, transport stopped.');
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void panic(sig).then(() => { close(); process.exit(130); });
  });
}

/**
 * HOLD — the move stopped driving the bus when it was released.
 *
 * Two earlier versions of this check were unsound, both in ways the 2026-09-21
 * handoff warns about:
 *
 *  - It stopped the transport and measured the master. Every move came back at
 *    almost exactly the same level (0.0207 to 0.0232 across eight different
 *    moves), which is not eight stuck moves — it is the shared echo tail
 *    ringing out. A number that is the same for every input is measuring
 *    something other than the input.
 *  - Stopping the transport CHANGED the system. The six REST failures in that
 *    run were all moves that fired immediately after this check's stop/play
 *    cycle, and none of them ratchets the send when fired on its own.
 *
 * A third version touched nothing and sampled `busReturn` twice with the song
 * still feeding the bus — and `busReturn` carries the live send as well as the
 * tail, so a passage getting louder read exactly like a move that never
 * stopped (`filterDrop` 0.110 -> 0.181, `sonarPing` 0.073 -> 0.187,
 * 2026-09-23). Third instrument in a row that measured the music.
 *
 * So: close the sends, let the send ramp land, sample the return twice 1.5 s
 * apart, restore the sends. With no input the return can only be a tail or a
 * loop still running, and the judgement is `checkTailDecays`. The transport
 * is not touched, and the sends go back to exactly what they were, so the
 * next move's REST baseline is unchanged.
 */
async function checkQuietAfterRelease(moveId: string): Promise<Check> {
  const read = async () => {
    const st = await call('get_dub_bus_state');
    return st?.masterInsertLevels?.busReturn ?? 0;
  };
  const before = sendsOf(await call('get_dub_bus_state'));
  const open = before.map((v, i) => [i, v] as const).filter(([, v]) => v > 0);
  for (const [i] of open) {
    try { await call('set_channel_dub_send', { channel: i, amount: 0 }, 3000); } catch { /* best effort */ }
  }
  try {
    await sleep(300); // the send ramp
    const first = await read();
    await sleep(1500);
    const second = await read();
    return checkTailDecays(first, second, moveId);
  } finally {
    for (const [i, v] of open) {
      try { await call('set_channel_dub_send', { channel: i, amount: v }, 3000); } catch { /* best effort */ }
    }
  }
}

function sendsOf(state: any): number[] {
  return (state?.channelDubSends ?? []).map((c: any) => c?.dubSend ?? 0);
}

async function loadSong(path: string): Promise<void> {
  const bytes = readFileSync(path);
  await call('load_file', { filename: basename(path), data: bytes.toString('base64') }, 30000);
  await sleep(1200);
  const st = await call('get_playback_state');
  if (!st?.isPlaying) { await call('play'); await sleep(1200); }
}

/**
 * Put the app back into a state where the song is audible.
 *
 * Without this one broken move poisons every move after it: the first run on
 * 2026-09-21 had `springSlam` take the master to silence and then reported 28
 * further failures, all of them reading `baseline 0.000000` — silence measured
 * against silence. Those moves were never actually tested.
 *
 * Escalates: restart the transport, then re-arm the bus, then reload the song.
 * Returns the recovered level, or null when the app could not be brought back.
 */
async function recover(song: string): Promise<number | null> {
  // 1. Transport — a move may simply have stopped it.
  const play = await call('get_playback_state');
  if (!play?.isPlaying) { await call('play'); await sleep(1200); }
  let l = await level(600);
  if (l.rms > SILENCE_RMS) return l.rms;

  // 2. The bus insert sits across the whole master signal, so taking it out
  //    and putting it back re-runs the wiring.
  await call('set_dub_bus_enabled', { enabled: false });
  await sleep(400);
  await call('set_dub_bus_enabled', { enabled: true });
  await sleep(600);
  l = await level(600);
  if (l.rms > SILENCE_RMS) return l.rms;

  // 3. Full reload — engine rebuild, fresh worklet.
  await loadSong(song);
  await call('set_channel_dub_send', { channel: 0, amount: 0.6 });
  await sleep(800);
  l = await level(800);
  return l.rms > SILENCE_RMS ? l.rms : null;
}

/** Every move the bus exposes. Kept in step with `dub-untested-sweep.ts`. */
const MOVES: { id: string; holdMs?: number; channelScan?: boolean }[] = [
  { id: 'springSlam' }, { id: 'filterDrop' }, { id: 'dubSiren' }, { id: 'snareCrack' },
  { id: 'delayTimeThrow' }, { id: 'backwardReverb' }, { id: 'masterDrop' }, { id: 'toast' },
  { id: 'tubbyScream' }, { id: 'stereoDoubler' }, { id: 'reverseEcho' }, { id: 'sonarPing' },
  { id: 'oscBass' }, { id: 'crushBass' }, { id: 'subHarmonic', holdMs: 2500 },
  { id: 'delayPreset380' }, { id: 'delayPresetDotted' },
  { id: 'tapeWobble', holdMs: 2500 }, { id: 'radioRiser', holdMs: 2500 }, { id: 'subSwell', holdMs: 2500 },
  { id: 'echoThrow' }, { id: 'dubStab' }, { id: 'echoBuildUp', holdMs: 2500 },
  { id: 'channelMute', channelScan: true }, { id: 'channelThrow', channelScan: true },
  { id: 'ghostReverb' }, { id: 'riddimSection', holdMs: 2500 },
  // Disruptive last — these stop the transport, so the DRY check after them is
  // about recovery, not about the move.
  { id: 'tapeStop' }, { id: 'transportTapeStop' },
];

async function main(): Promise<void> {
  console.log(`[inv] connecting to ${WS_URL}`);
  await connect();

  // ── Phase A — bus lifecycle ────────────────────────────────────────────
  if (PHASES.has('A')) {
  console.log('\n=== Phase A — lifecycle ===');

  await call('set_dub_bus_enabled', { enabled: false });
  await loadSong(SONG_A);
  await call('clear_console_errors');
  const base = await level(1000);
  record('A1 song plays with the bus OFF', [
    checkDry(base.rms, base.silent, base.rms || 1),
    await checkErrors(),
  ]);

  let before = base.rms;
  let now: { rms: number; silent: boolean };
  await call('set_dub_bus_enabled', { enabled: true });
  await sleep(600);
  now = await level();
  record('A2 song survives enabling the bus', [
    checkDry(now.rms, now.silent, before),
    checkSync(await call('get_dub_bus_state')),
  ]);

  before = now.rms;
  await call('set_channel_dub_send', { channel: 0, amount: 0.6 });
  await sleep(600);
  now = await level();
  const a3State = await call('get_dub_bus_state');
  record('A3 song survives opening a send', [
    checkDry(now.rms, now.silent, before),
    checkSync(a3State),
    // The send is open here, so this is the first point the bus is required to
    // be carrying anything. Asking early means a starved bus is reported as
    // itself, not as every move downstream reading FLAT.
    checkWet(a3State),
  ]);

  before = now.rms;
  await call('set_channel_dub_send', { channel: 0, amount: 0 });
  await sleep(600);
  now = await level();
  record('A4 song survives closing the last send', [
    checkDry(now.rms, now.silent, before),
    checkSync(await call('get_dub_bus_state')),
  ]);

  before = now.rms;
  for (let i = 0; i < 4; i++) {
    await call('set_dub_bus_enabled', { enabled: i % 2 === 0 });
    await sleep(120);
  }
  await call('set_dub_bus_enabled', { enabled: true });
  await sleep(800);
  now = await level();
  record('A5 song survives four rapid bus toggles', [checkDry(now.rms, now.silent, before)]);

  // The 2026-09-21 bug in full: a send open across a song load.
  await call('set_channel_dub_send', { channel: 1, amount: 0.6 });
  await sleep(400);
  before = (await level()).rms;
  await loadSong(SONG_B);
  await sleep(800);
  now = await level();
  record('A6 a send survives a song load', [
    checkDry(now.rms, now.silent, before),
    checkSync(await call('get_dub_bus_state')),
  ]);

  before = now.rms;
  await call('set_dub_bus_enabled', { enabled: false });
  await sleep(700);
  now = await level();
  record('A7 song survives disabling the bus again', [checkDry(now.rms, now.silent, before)]);
  }

  // ── Phase M — runtime meters ───────────────────────────────────────────
  // Everything here is a level, not a wire. The suite cannot reach any of it.
  if (PHASES.has('M')) {
  console.log('\n=== Phase M — meters ===');
  // Phase A leaves a song playing; on its own, Phase M must load one. The
  // field is `numPatterns` — reading `patterns` returns undefined for every
  // song, so this loaded SONG_A over whatever the user had open.
  const loadedM = await call('get_song_info');
  if (!loadedM?.numPatterns) await loadSong(SONG_A);
  await call('set_dub_bus_enabled', { enabled: true });
  await call('set_channel_dub_send', { channel: 0, amount: 0.6 });
  const playM = await call('get_playback_state');
  if (!playM?.isPlaying) { await call('play'); }
  // The taps are analysers: they measure only what passes AFTER they attach, so
  // the first read of a freshly created tap is null by design. Give the graph a
  // moment to run past them before asking.
  await sleep(1500);
  await call('clear_console_errors');
  await sleep(800);

  const meterState = await call('get_dub_bus_state');
  record('M1 the bus receives the song with a send open', [
    checkWet(meterState),
    await checkMaster(meterState),
    await checkErrors(),
  ]);

  record('M2 a capture move hears the bus', [await checkCapture()]);
  // The capture move leaves a reversed tail; let it run out so Phase B's first
  // baseline is the song and not this.
  await sleep(2000);
  }

  // ── Phase B — every move ───────────────────────────────────────────────
  const moves = ONLY_MOVES.size ? MOVES.filter(m => ONLY_MOVES.has(m.id)) : MOVES;
  if (ONLY_MOVES.size && moves.length !== ONLY_MOVES.size) {
    const known = new Set(MOVES.map(m => m.id));
    for (const id of ONLY_MOVES) if (!known.has(id)) console.log(`[inv] --move ${id}: not in the sweep's move list, ignored`);
  }
  if ((PHASES.has('B') || ONLY_MOVES.size) && moves.length) {
  console.log('\n=== Phase B — moves ===');
  const loadedB = await call('get_song_info');
  if (!loadedB?.numPatterns) await loadSong(SONG_A);
  await call('set_dub_bus_enabled', { enabled: true });
  await call('set_channel_dub_send', { channel: 0, amount: 0.6 });
  const playB = await call('get_playback_state');
  if (!playB?.isPlaying) { await call('play'); }
  await sleep(800);

  for (const move of moves) {
    const holdMs = move.holdMs ?? 1200;
    await call('clear_console_errors');
    const stateBefore = await call('get_dub_bus_state');
    const sendsBefore = sendsOf(stateBefore);
    const pre = await level(400);

    let handle: string | null = null;
    let fireError: string | undefined;
    try {
      const r = await call('fire_dub_move', { moveId: move.id, channelId: move.channelScan ? 0 : 0 });
      handle = r?.heldHandle ?? null;
      // Registered before the hold, so an interrupt during it still releases.
      if (handle) openHandles.add(handle);
    } catch (e) { fireError = (e as Error).message; }

    await sleep(holdMs);
    if (handle) {
      try { await call('release_dub_move', { heldHandle: handle }); }
      catch (e) { fireError = `${fireError ?? ''} release: ${(e as Error).message}`; }
      openHandles.delete(handle);
    }
    // Let the move's tail run out before judging whether the song came back.
    await sleep(2000);

    // A transport-stopping move leaves playback stopped by design; restart it
    // so the DRY check measures recovery rather than the stop.
    const play = await call('get_playback_state');
    if (!play?.isPlaying) { await call('play'); await sleep(1500); }

    const post = await level(800);
    const stateAfter = await call('get_dub_bus_state');
    const checks: Check[] = [
      checkDry(post.rms, post.silent, pre.rms),
      checkSync(stateAfter),
      await checkMute(),
      checkRest(sendsBefore, sendsOf(stateAfter)),
      // A released move must leave the master gain where it found it. masterDrop
      // and toast both write it, so "the mix never came back up" is a real
      // failure mode here and reads as a quiet song rather than as a bug.
      await checkMaster(stateAfter),
      await checkErrors(),
    ];
    if (fireError) checks.push({ name: 'FIRE', ok: false, detail: fireError });
    checks.push(await checkQuietAfterRelease(move.id));
    record(`B ${move.id}`, checks);

    // Leave the next move a working song to measure against, and say plainly
    // whether this one needed rescuing — that is the finding, not the 28 rows
    // of silence it would otherwise produce downstream.
    const after = await level(500);
    if (after.rms <= SILENCE_RMS) {
      const rescued = await recover(SONG_B);
      if (rescued === null) {
        record('ABORT — the app could not be brought back', [{
          name: 'RECOVER', ok: false,
          detail: `master still silent after transport restart, bus re-arm and a song reload; last move fired was ${move.id}`,
        }]);
        break;
      }
      record(`  (recovered after ${move.id}: rms ${rescued.toFixed(6)})`, [{
        name: 'RECOVER', ok: true, detail: 'master audible again',
      }]);
    }
  }
  }

  // ── Teardown + report ──────────────────────────────────────────────────
  await panic('end of sweep');

  const failed = results.filter(r => r.checks.some(c => !c.ok));
  console.log(`\n=== ${results.length - failed.length}/${results.length} steps passed ===`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) {
      for (const c of f.checks.filter(x => !x.ok)) {
        console.log(`  ${f.step.padEnd(42)} ${c.name}  ${c.detail}`);
      }
    }
  }
  close();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error('[inv] fatal:', e);
  await panic('fatal error');
  close();
  process.exit(2);
});
