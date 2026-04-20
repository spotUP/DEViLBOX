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

// Ordered so the bridge-disrupting `transportTapeStop` fires LAST — otherwise
// the browser briefly drops off the WS relay while the tracker stops, and
// the remaining moves race against a re-connecting bridge. Also keeps
// `tapeStop` near the end for the same reason (softer variant).
const MOVES: Array<{ short: string; id: string }> = [
  { short: 'SLAM',   id: 'springSlam' },
  { short: 'FILT',   id: 'filterDrop' },
  { short: 'SIREN',  id: 'dubSiren' },
  { short: 'WOBBLE', id: 'tapeWobble' },
  { short: 'CRACK',  id: 'snareCrack' },
  { short: 'DELAY',  id: 'delayTimeThrow' },
  { short: 'BACK',   id: 'backwardReverb' },
  { short: 'DROP',   id: 'masterDrop' },
  { short: 'TOAST',  id: 'toast' },
  { short: 'SCREAM', id: 'tubbyScream' },
  { short: 'WIDE',   id: 'stereoDoubler' },
  { short: 'RVRSE',  id: 'reverseEcho' },
  { short: 'PING',   id: 'sonarPing' },
  { short: 'RADIO',  id: 'radioRiser' },
  { short: 'SUB',    id: 'subSwell' },
  { short: 'BASS',   id: 'oscBass' },
  { short: 'CRUSH',  id: 'crushBass' },
  { short: 'SUBH',   id: 'subHarmonic' },
  { short: '380',    id: 'delayPreset380' },
  { short: 'DOT',    id: 'delayPresetDotted' },
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

  const rows: Row[] = [];

  for (const { short, id } of MOVES) {
    const row: Row = {
      short, id,
      held: false,
      baselineRms: NaN, baselinePeak: NaN,
      peakRms: NaN, peakPeak: NaN, peakSilent: true,
      tailRms: NaN, tailSilent: true,
      errors: 0,
    };

    try { await call('clear_console_errors'); } catch { /* ignore */ }

    // Per-move baseline — song loudness JUST before the move fires. We
    // compare against this (not the global sweep-start baseline) because
    // the song loudness drifts over a 2-minute sweep as the pattern progresses.
    try {
      const pre = await call('get_audio_level', { durationMs: 300 });
      row.baselineRms = pre?.rmsAvg ?? NaN;
      row.baselinePeak = pre?.peakMax ?? NaN;
    } catch { /* ignore */ }

    // Fire.
    let heldHandle: string | null = null;
    try {
      const fireResult = await call('fire_dub_move', { moveId: id, channelId: 0 });
      heldHandle = fireResult?.heldHandle ?? null;
      row.held = !!heldHandle;
    } catch (err) {
      row.fireError = (err as Error).message;
    }

    // Peak during.
    await sleep(1500);
    try {
      const peak = await call('get_audio_level', { durationMs: 1000 });
      row.peakRms = peak?.rmsAvg ?? NaN;
      row.peakPeak = peak?.peakMax ?? NaN;
      row.peakSilent = !!peak?.isSilent;
    } catch { /* ignore */ }

    // Release.
    if (heldHandle) {
      try {
        await call('release_dub_move', { heldHandle });
      } catch (err) {
        row.releaseError = (err as Error).message;
      }
    }

    // Tail.
    await sleep(1000);
    try {
      const tail = await call('get_audio_level', { durationMs: 500 });
      row.tailRms = tail?.rmsAvg ?? NaN;
      row.tailSilent = !!tail?.isSilent;
    } catch { /* ignore */ }

    // Errors.
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

  // Reset channel send.
  await call('set_channel_dub_send', { channel: 0, amount: 0 }).catch(() => {});

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
