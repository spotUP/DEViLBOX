#!/usr/bin/env npx tsx
/**
 * Untested-FX sweep — drives the 22 newer dub moves through DubRouter via the
 * WS relay on :4003 and records peak/tail audio level + console errors for
 * each one. Matches the protocol in
 * `thoughts/shared/handoffs/2026-04-20_dub-mixer-desk-layout-and-mcp-tool-surface.md`.
 *
 * Prereq: dev server + browser tab already running with a song loaded and
 * playing. The sweep does NOT load a song — it uses whatever is playing,
 * which matches how the user asked to test ("i loaded the tracker view now").
 *
 * Usage: npx tsx tools/dub-untested-sweep.ts
 */

import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';

const WS_URL = 'ws://localhost:4003/mcp';
const MODLAND_API = 'http://localhost:3011/api/modland';
// Optional: `MODLAND_QUERY="world class dub"` loads the first matching result
// from Modland before running the sweep. Otherwise the sweep uses whatever
// song is already loaded + playing in the browser.
const MODLAND_QUERY = process.env.MODLAND_QUERY;
// Optional: `DUB_PLATE_STAGE=madprofessor` (or `dattorro`) engages the
// dub-bus plate-stage insert before running the sweep, so the full
// 27-move pass can be tested with each plate character active.
const DUB_PLATE_STAGE = process.env.DUB_PLATE_STAGE as
  | 'madprofessor' | 'dattorro' | 'off' | undefined;
const DUB_PLATE_MIX = process.env.DUB_PLATE_MIX
  ? parseFloat(process.env.DUB_PLATE_MIX)
  : 0.5;

// `holdMs` overrides the default 1.5 s hold window for ramp-up moves whose
// peak arrives late (tapeWobble, radioRiser, subSwell): measuring at 1.5 s
// clips their envelope and falsely flags them FLAT. `channelScan` forces a
// per-channel-ID fire pass for moves whose audibility is entirely a function
// of WHICH tracker channel is targeted (channelMute, channelThrow) — firing
// always on channel 0 misses them whenever channel 0 happens to be quiet
// during the 1.5-s measurement window. Ordered so bridge-disrupting moves
// (`transportTapeStop`, `tapeStop`) fire LAST.
interface MoveEntry {
  short: string;
  id: string;
  holdMs?: number;       // override default 1500 ms
  channelScan?: boolean; // fire on channels 0..3, keep the biggest delta
}

const MOVES: MoveEntry[] = [
  // Trigger / short moves
  { short: 'SLAM',   id: 'springSlam' },
  { short: 'FILT',   id: 'filterDrop' },
  { short: 'SIREN',  id: 'dubSiren' },
  { short: 'CRACK',  id: 'snareCrack' },
  { short: 'DELAY',  id: 'delayTimeThrow' },
  { short: 'BACK',   id: 'backwardReverb' },
  { short: 'DROP',   id: 'masterDrop' },
  { short: 'TOAST',  id: 'toast' },
  { short: 'SCREAM', id: 'tubbyScream' },
  { short: 'WIDE',   id: 'stereoDoubler' },
  { short: 'RVRSE',  id: 'reverseEcho' },
  { short: 'PING',   id: 'sonarPing' },
  { short: 'BASS',   id: 'oscBass' },
  { short: 'CRUSH',  id: 'crushBass' },
  { short: 'SUBH',   id: 'subHarmonic', holdMs: 3000 },
  { short: '380',    id: 'delayPreset380' },
  { short: 'DOT',    id: 'delayPresetDotted' },
  // Ramp-up moves — need longer hold for envelope to land
  { short: 'WOBBLE', id: 'tapeWobble', holdMs: 3000 },
  { short: 'RADIO',  id: 'radioRiser', holdMs: 3000 },
  { short: 'SUB',    id: 'subSwell',   holdMs: 3000 },
  // New coverage: moves that were missing from the pre-G3 sweep list
  { short: 'THROW',  id: 'echoThrow' },
  { short: 'STAB',   id: 'dubStab' },
  { short: 'BUILD',  id: 'echoBuildUp', holdMs: 3000 },
  // Channel-targeted moves — need a loud channel
  { short: 'MUTE',   id: 'channelMute',   channelScan: true },
  { short: 'CTHROW', id: 'channelThrow',  channelScan: true },
  // Disruptive moves last (WS can briefly drop)
  { short: 'STOP',   id: 'tapeStop' },
  { short: 'STOP!',  id: 'transportTapeStop' },
];

// ── WS bridge ───────────────────────────────────────────────────────────────

let ws: WebSocket;
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };
const pending = new Map<string, Pending>();

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    ws.on('open', () => resolve());
    ws.on('error', reject);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new Error(msg.error || 'bridge error'));
      else p.resolve(msg.data);
    });
  });
}

function call(method: string, params: Record<string, any> = {}, timeoutMs = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`timeout: ${method}`)); }, timeoutMs);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timeout); resolve(v); },
      reject: (e) => { clearTimeout(timeout); reject(e); },
    });
    ws.send(JSON.stringify({ id, type: 'call', method, params }));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Row ─────────────────────────────────────────────────────────────────────

interface Row {
  short: string;
  id: string;
  held: boolean;
  baselineRms: number;     // rms sampled IMMEDIATELY before firing this move
  baselinePeak: number;
  peakRms: number;
  peakPeak: number;
  peakSilent: boolean;
  tailRms: number;
  tailSilent: boolean;
  errors: number;
  firstError?: string;
  fireError?: string;
  releaseError?: string;
}

function fmt(n: number | undefined): string {
  if (n === undefined || !isFinite(n)) return '   —  ';
  return n.toFixed(4).padStart(6);
}

// ── Sweep ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[sweep] connecting to ${WS_URL}…`);
  await connect();
  console.log('[sweep] connected.');

  // Optional pre-load from Modland so the sweep runs deterministically
  // against a known song. Set MODLAND_QUERY env var to the title.
  if (MODLAND_QUERY) {
    console.log(`[sweep] MODLAND_QUERY="${MODLAND_QUERY}" — searching Modland…`);
    const searchResp = await fetch(`${MODLAND_API}/search?q=${encodeURIComponent(MODLAND_QUERY)}&limit=10`);
    if (!searchResp.ok) throw new Error(`Modland search failed: HTTP ${searchResp.status}`);
    const searchJson = await searchResp.json() as { results: Array<{ filename: string; format: string; full_path: string }> };
    if (!searchJson.results?.length) throw new Error(`Modland search returned no results for "${MODLAND_QUERY}"`);
    const hit = searchJson.results[0];
    console.log(`[sweep] loading: ${hit.filename} (${hit.format}) — ${hit.full_path}`);

    // Download via the server proxy so caching + rate-limiting is shared.
    const dlResp = await fetch(`${MODLAND_API}/download?path=${encodeURIComponent(hit.full_path)}`);
    if (!dlResp.ok) throw new Error(`Modland download failed: HTTP ${dlResp.status}`);
    const bytes = Buffer.from(await dlResp.arrayBuffer());
    const base64 = bytes.toString('base64');

    // Send to the browser via the WS bridge's load_file method. Same
    // code path that the MCP `load_file` / `load_modland` tools use.
    const loaded = await call('load_file', {
      filename: hit.filename,
      data: base64,
    });
    console.log(`[sweep] loaded: ${JSON.stringify(loaded).slice(0, 160)}`);
    // Give the replayer a moment to spin up + start producing audio.
    await sleep(1500);
  }

  // Ensure playback is running — otherwise the audio-level measurements pick
  // up only the dry dub output (many moves are *processors* and produce
  // nothing without a song feeding them). Safe no-op if already playing.
  try {
    const playState = await call('get_playback_state');
    if (!playState?.isPlaying) {
      console.log('[sweep] playback not running — issuing play()');
      await call('play');
      await sleep(1200); // let the replayer spin up + audio start flowing
    }
  } catch { /* older bridges may not expose get_playback_state */ }

  // Baseline — confirm something is audible before the sweep.
  const baseline = await call('get_audio_level', { durationMs: 1000 });
  console.log(`[sweep] baseline rms=${fmt(baseline?.rmsAvg)} peak=${fmt(baseline?.peakMax)} silent=${baseline?.isSilent}`);

  if (baseline?.isSilent || (baseline?.rmsAvg ?? 0) < 0.001) {
    console.warn('[sweep] WARNING: baseline is SILENT — load a song in the browser before running the sweep.');
  }

  // Arm the bus + raise channel 0 send.
  console.log('[sweep] enabling dub bus + channel 0 send = 0.6');
  await call('set_dub_bus_enabled', { enabled: true });
  await call('set_channel_dub_send', { channel: 0, amount: 0.6 });

  // Optional plate-stage insert — exercises the 27 moves with a WASM
  // plate processing the bus post-stage. Catches regressions where a
  // move's audio path trips over the plate's send gain or the post-
  // stereoMerge branch. Reset to 'off' at teardown.
  if (DUB_PLATE_STAGE && DUB_PLATE_STAGE !== 'off') {
    console.log(`[sweep] engaging plateStage=${DUB_PLATE_STAGE} mix=${DUB_PLATE_MIX}`);
    await call('set_dub_bus_settings', {
      settings: { plateStage: DUB_PLATE_STAGE, plateStageMix: DUB_PLATE_MIX },
    });
    await sleep(2000);  // WASM worklet boot
  }

  const rows: Row[] = [];

  // Single fire-and-measure pass against one channel. Returns measurement +
  // any error captured. Used by both the normal path and the channelScan
  // path; factoring it out lets channelScan retry on ch 0..3 and keep the
  // biggest delta (cf. `channelMute` / `channelThrow`).
  async function fireAndMeasure(
    moveId: string,
    channelId: number,
    holdMs: number,
  ): Promise<{
    baselineRms: number; baselinePeak: number;
    peakRms: number; peakPeak: number; peakSilent: boolean;
    tailRms: number; tailSilent: boolean;
    held: boolean; fireError?: string; releaseError?: string;
  }> {
    let baselineRms = NaN, baselinePeak = NaN;
    let peakRms = NaN, peakPeak = NaN, peakSilent = true;
    let tailRms = NaN, tailSilent = true;
    let held = false;
    let fireError: string | undefined;
    let releaseError: string | undefined;

    try {
      const pre = await call('get_audio_level', { durationMs: 300 });
      baselineRms = pre?.rmsAvg ?? NaN;
      baselinePeak = pre?.peakMax ?? NaN;
    } catch { /* ignore */ }

    let heldHandle: string | null = null;
    try {
      const fireResult = await call('fire_dub_move', { moveId, channelId });
      heldHandle = fireResult?.heldHandle ?? null;
      held = !!heldHandle;
    } catch (err) {
      fireError = (err as Error).message;
    }

    await sleep(holdMs);
    try {
      const peak = await call('get_audio_level', { durationMs: 1000 });
      peakRms = peak?.rmsAvg ?? NaN;
      peakPeak = peak?.peakMax ?? NaN;
      peakSilent = !!peak?.isSilent;
    } catch { /* ignore */ }

    if (heldHandle) {
      try { await call('release_dub_move', { heldHandle }); }
      catch (err) { releaseError = (err as Error).message; }
    }

    await sleep(1000);
    try {
      const tail = await call('get_audio_level', { durationMs: 500 });
      tailRms = tail?.rmsAvg ?? NaN;
      tailSilent = !!tail?.isSilent;
    } catch { /* ignore */ }

    return { baselineRms, baselinePeak, peakRms, peakPeak, peakSilent, tailRms, tailSilent, held, fireError, releaseError };
  }

  for (const entry of MOVES) {
    const { short, id } = entry;
    const holdMs = entry.holdMs ?? 1500;
    const row: Row = {
      short, id,
      held: false,
      baselineRms: NaN, baselinePeak: NaN,
      peakRms: NaN, peakPeak: NaN, peakSilent: true,
      tailRms: NaN, tailSilent: true,
      errors: 0,
    };

    try { await call('clear_console_errors'); } catch { /* ignore */ }

    // channelScan: fire on each of channels 0..3 and keep the pass with the
    // largest |Δpeak|. Needed for channelMute / channelThrow because their
    // audibility depends entirely on the target channel being loud right
    // now; always firing ch=0 would flag them FLAT whenever ch=0 is quiet.
    const channelsToTry = entry.channelScan ? [0, 1, 2, 3] : [0];
    let best: Awaited<ReturnType<typeof fireAndMeasure>> | null = null;
    let bestDelta = -Infinity;
    for (const ch of channelsToTry) {
      const m = await fireAndMeasure(id, ch, holdMs);
      const d = Math.abs((m.peakPeak || 0) - (m.baselinePeak || 0));
      if (d > bestDelta) { bestDelta = d; best = m; }
      // Short-circuit once we have a clear detect — saves ~8 s per scan move.
      if (entry.channelScan && d > 0.05) break;
    }
    const m = best!;
    row.baselineRms  = m.baselineRms;
    row.baselinePeak = m.baselinePeak;
    row.peakRms      = m.peakRms;
    row.peakPeak     = m.peakPeak;
    row.peakSilent   = m.peakSilent;
    row.tailRms      = m.tailRms;
    row.tailSilent   = m.tailSilent;
    row.held         = m.held;
    row.fireError    = m.fireError;
    row.releaseError = m.releaseError;

    try {
      const errs = await call('get_console_errors');
      const entries: Array<{ level: string; message: string }> = errs?.entries ?? [];
      row.errors = entries.length;
      if (entries.length > 0) row.firstError = `${entries[0].level}: ${entries[0].message.slice(0, 80)}`;
    } catch { /* ignore */ }

    // Delta over per-move baseline — this is the TRUE "did the move change
    // the audio?" test. A processor like stereoDoubler may not bump the
    // peak at all if its effect is spectral/spatial rather than amplitude;
    // we still flag those as "silent" to surface them for manual checks.
    const deltaRms = (row.peakRms || 0) - (row.baselineRms || 0);
    const deltaPeak = (row.peakPeak || 0) - (row.baselinePeak || 0);
    const DELTA_THRESHOLD = 0.015; // ~-37 dBFS change — catches subtle but audible moves
    const ABS_PEAK_CLIP = 0.98;    // flag near-unity peaks as potential clipping
    const changedAudio = Math.abs(deltaRms) > DELTA_THRESHOLD || Math.abs(deltaPeak) > DELTA_THRESHOLD;
    const clipping = (row.peakPeak || 0) >= ABS_PEAK_CLIP;
    const flag = row.fireError ? 'FIRE✗'
      : clipping ? 'CLIP'
      : !changedAudio ? 'FLAT'
      : row.errors > 0 ? '!'
      : '✓';
    const deltaStr = `Δpk=${(deltaPeak >= 0 ? '+' : '') + deltaPeak.toFixed(3)}`;
    console.log(`  ${flag.padEnd(5)}  ${row.short.padEnd(6)} ${row.id.padEnd(22)} base=${fmt(row.baselinePeak)}  peak=${fmt(row.peakPeak)}  ${deltaStr.padEnd(11)}  tail=${fmt(row.tailRms)}  held=${row.held ? 'Y' : '-'}  errs=${row.errors}${row.fireError ? ` [fire:${row.fireError.slice(0, 40)}]` : ''}${row.firstError ? ` [${row.firstError}]` : ''}`);

    rows.push(row);
  }

  // Reset channel send + tear down any plate-stage insert.
  await call('set_channel_dub_send', { channel: 0, amount: 0 }).catch(() => {});
  if (DUB_PLATE_STAGE && DUB_PLATE_STAGE !== 'off') {
    await call('set_dub_bus_settings', { settings: { plateStage: 'off' } }).catch(() => {});
  }

  // ── Tail-leak check ───────────────────────────────────────────────────────
  // Catches held moves whose disposer doesn't kill their internal loop /
  // oscillator (e.g. rAF-driven transient-followers, feedback-fed delays
  // that never silence). Every released move should have stopped emitting
  // sound by now; stopping the song AND disabling the bus too means ANY
  // remaining audio is a leaked move, not the song / echo / spring tail.
  //
  // The bus MUST be disabled — zeroing the channel send alone doesn't
  // stop echo+spring feedback decay or the plate-stage tail, so the leak
  // check would false-positive on legitimate tail.
  console.log('');
  console.log('─── tail-leak check ──────────────────────────────');
  console.log('[sweep] stopping song + disabling bus + waiting 15 s…');
  try { await call('stop'); } catch { /* ok */ }
  await call('set_dub_bus_enabled', { enabled: false }).catch(() => {});
  await sleep(15_000);
  const tail15 = await call('get_audio_level', { durationMs: 1000 });
  console.log(`  t=15s  rms=${fmt(tail15?.rmsAvg)} peak=${fmt(tail15?.peakMax)} silent=${tail15?.isSilent}`);
  console.log('[sweep] waiting another 15 s…');
  await sleep(15_000);
  const tail30 = await call('get_audio_level', { durationMs: 1000 });
  console.log(`  t=30s  rms=${fmt(tail30?.rmsAvg)} peak=${fmt(tail30?.peakMax)} silent=${tail30?.isSilent}`);
  // Anything above -60 dBFS RMS at t+30s is a leaked move. Reverb tails
  // from springSlam / backwardReverb are ≤ 2 s; feedback-delays like
  // delayTimeThrow are ≤ 4 s. Nothing legitimate should persist 30 s.
  const LEAK_RMS_THRESHOLD = 0.001;  // ~-60 dBFS
  const leaked = (tail30?.rmsAvg ?? 0) > LEAK_RMS_THRESHOLD;
  if (leaked) {
    console.log(`  LEAK — audio still audible 30s after stop (rms=${tail30?.rmsAvg?.toFixed(6)}) — some held move didn't dispose cleanly`);
  } else {
    console.log('  ✓ no tail leak — bus fell silent within 30s of song stop');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const DELTA_THRESHOLD = 0.015;
  const ABS_PEAK_CLIP = 0.98;
  const changed = (r: Row) => {
    const dPeak = (r.peakPeak || 0) - (r.baselinePeak || 0);
    const dRms = (r.peakRms || 0) - (r.baselineRms || 0);
    return Math.abs(dPeak) > DELTA_THRESHOLD || Math.abs(dRms) > DELTA_THRESHOLD;
  };
  const clipped = (r: Row) => (r.peakPeak || 0) >= ABS_PEAK_CLIP;
  const pass = rows.filter((r) => !r.fireError && !clipped(r) && changed(r) && r.errors === 0);
  const flat = rows.filter((r) => !r.fireError && !clipped(r) && !changed(r));
  const clip = rows.filter((r) => clipped(r));
  const errored = rows.filter((r) => r.fireError || r.errors > 0);

  console.log('');
  console.log('─── summary ──────────────────────────────────────');
  console.log(`  ✓ pass      : ${pass.length}/${rows.length}  (move changed audio > ${DELTA_THRESHOLD})`);
  console.log(`  FLAT        : ${flat.length}/${rows.length}  (no detectable change vs baseline)`);
  console.log(`  CLIP        : ${clip.length}/${rows.length}  (peak ≥ ${ABS_PEAK_CLIP})`);
  console.log(`  ! errored   : ${errored.length}/${rows.length}`);
  console.log(`  LEAK        : ${leaked ? 'YES — post-stop audio still audible at t+30s' : 'no'}`);
  console.log('');
  if (flat.length > 0) {
    console.log(`  flat moves  : ${flat.map((r) => r.short).join(', ')}`);
  }
  if (clip.length > 0) {
    console.log(`  clipping    : ${clip.map((r) => `${r.short}(${r.peakPeak.toFixed(3)})`).join(', ')}`);
  }
  if (errored.length > 0) {
    for (const r of errored) {
      console.log(`  ! ${r.short}: ${r.fireError ?? r.firstError ?? r.releaseError ?? '?'}`);
    }
  }

  // Persist a machine-readable snapshot so reruns can diff.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = `/tmp/dub-sweep-${stamp}.json`;
  writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), rows }, null, 2));
  console.log(`[sweep] wrote ${outPath}`);

  ws.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[sweep] fatal:', err.message);
  process.exit(1);
});
