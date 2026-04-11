/**
 * Supreme Synthetics Soak Test — 237-track end-to-end auto-DJ stress run.
 *
 * Trigger: open http://localhost:5174/?soak=supreme in a fresh browser.
 * The conditional import in main.tsx calls runSupremeSynthSoak() on load.
 *
 * What it does:
 *   1. Waits for the DJ playlist store to hydrate and bundled playlists to auto-import
 *   2. Finds "Spot-Supreme Synthetics" by name (237 tracks)
 *   3. Sets it active, switches to DJ view, enables auto-DJ
 *   4. Subscribes to useDJStore.autoDJCurrentTrackIndex for per-track events
 *   5. Samples heap / audio level / console errors every 30s
 *   6. Runs an 8-minute per-track watchdog — force-skips stuck tracks
 *   7. Writes incremental progress to localStorage after every track
 *   8. On finish (all tracks done OR 3 consecutive force-skips OR manual stop):
 *      computes a summary table and offers a JSON download
 *
 * NO MCP bridge involvement — runs fully in the browser tab, so it cannot
 * interfere with other Claude Code agents driving the :5173 dev instance.
 *
 * Failure classes per track:
 *   PASS             — audio confirmed non-silent, no errors, advanced cleanly
 *   FAIL_SILENT      — stayed silent > 10 s
 *   FAIL_ERROR       — console error logged during the track
 *   FAIL_STUCK       — watchdog fired; force-skip invoked
 *   FAIL_LOAD        — next-track-start was never reached
 */

import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { useDJStore } from '@/stores/useDJStore';
import { useUIStore } from '@/stores/useUIStore';
import { enableAutoDJ, disableAutoDJ, skipAutoDJ } from '@/engine/dj/DJActions';
import { getAudioLevel } from '@/bridge/handlers/writeHandlers';
import { startConsoleCapture, getConsoleEntries, clearConsoleEntries } from '@/bridge/consoleCapture';

// ── Config ──────────────────────────────────────────────────────────────────

const PLAYLIST_NAME_MATCH = 'supreme synthetics';
const SAMPLE_INTERVAL_MS = 30_000;
const TRACK_STUCK_TIMEOUT_MS = 8 * 60 * 1000;
const SILENT_FAIL_TIMEOUT_MS = 10_000;
const MAX_CONSECUTIVE_STUCK = 3;
const PROGRESS_STORAGE_KEY = 'soak-progress';

// ── Types ───────────────────────────────────────────────────────────────────

type TrackStatus = 'PASS' | 'FAIL_SILENT' | 'FAIL_ERROR' | 'FAIL_STUCK' | 'FAIL_LOAD' | 'PENDING';

interface TrackResult {
  index: number;
  fileName: string;
  trackName: string;
  format: string;
  status: TrackStatus;
  startMs: number;
  endMs: number;
  durationMs: number;
  heapBeforeMB: number;
  heapAfterMB: number;
  peakRms: number;
  silenceFraction: number;
  audioConfirmedMs: number | null;
  errors: string[];
  forceSkipped: boolean;
}

interface HeapSample {
  tMs: number;
  trackIndex: number;
  usedMB: number;
  totalMB: number;
  limitMB: number;
}

interface SoakReport {
  startedAt: string;
  finishedAt: string | null;
  runTimeMs: number;
  playlistName: string;
  totalTracks: number;
  results: TrackResult[];
  heapSamples: HeapSample[];
  summary: {
    pass: number;
    failSilent: number;
    failError: number;
    failStuck: number;
    failLoad: number;
    heapDeltaMB: number;
    worstSilenceMs: number;
    totalErrors: number;
  };
}

// ── Small helpers ───────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function getHeapMB(): { used: number; total: number; limit: number } {
  // performance.memory is a Chrome extension — not in the standard TS DOM types.
  const mem = (performance as unknown as {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  }).memory;
  if (!mem) return { used: 0, total: 0, limit: 0 };
  return {
    used: +(mem.usedJSHeapSize / 1024 / 1024).toFixed(1),
    total: +(mem.totalJSHeapSize / 1024 / 1024).toFixed(1),
    limit: +(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1),
  };
}

function log(...args: unknown[]): void {
  // Using plain console.log so the messages are visible + captured by the
  // overridden console.error/warn interceptors won't swallow them.
  console.log('%c[soak]', 'color: #ff00ff; font-weight: bold', ...args);
}

function warn(...args: unknown[]): void {
  console.warn('[soak]', ...args);
}

function persistProgress(report: SoakReport): void {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(report));
  } catch (e) {
    // localStorage quota exceeded — fine, the in-memory copy is still good
    warn('localStorage write failed (quota?):', e);
  }
}

function downloadReport(report: SoakReport): void {
  try {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `soak-report-${iso}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) {
    warn('Download failed:', e);
  }
}

// ── Wait for the bundled playlists to hydrate ───────────────────────────────

async function waitForPlaylist(): Promise<string> {
  const maxWaitMs = 30_000;
  const startMs = performance.now();
  while (performance.now() - startMs < maxWaitMs) {
    const { playlists } = useDJPlaylistStore.getState();
    const match = playlists.find((p) =>
      p.name.toLowerCase().includes(PLAYLIST_NAME_MATCH),
    );
    if (match && match.tracks.length > 0) {
      log(`Found playlist "${match.name}" — ${match.tracks.length} tracks`);
      return match.id;
    }
    await sleep(500);
  }
  throw new Error(
    `Playlist containing "${PLAYLIST_NAME_MATCH}" not found after ${maxWaitMs}ms. ` +
    `Found ${useDJPlaylistStore.getState().playlists.length} playlists.`,
  );
}

// ── Main run ────────────────────────────────────────────────────────────────

export async function runSupremeSynthSoak(): Promise<void> {
  log('Supreme Synthetics soak test starting — this will take ~12-15 hours');
  log('Press Ctrl+C / close tab to abort; progress is persisted per-track');

  // Console capture so we can attribute errors to tracks
  startConsoleCapture();
  clearConsoleEntries();

  const playlistId = await waitForPlaylist();
  const playlist = useDJPlaylistStore.getState().playlists.find((p) => p.id === playlistId)!;
  const totalTracks = playlist.tracks.length;

  // Switch to DJ view and set the playlist active
  useUIStore.getState().setActiveView('dj');
  useDJPlaylistStore.getState().setActivePlaylist(playlistId);
  await sleep(500);

  // Kick off auto-DJ
  log('Enabling auto-DJ…');
  const enableErr = await enableAutoDJ(0);
  if (enableErr) {
    warn('enableAutoDJ returned error:', enableErr);
    warn('Common cause: AudioContext still locked. Click anywhere in the page.');
    warn('Waiting 10 s then retrying…');
    await sleep(10_000);
    const retry = await enableAutoDJ(0);
    if (retry) throw new Error(`Auto-DJ failed to start: ${retry}`);
  }

  const startedAt = new Date().toISOString();
  const runStartMs = performance.now();
  const initialHeap = getHeapMB();
  log(`Run start — heap: ${initialHeap.used}/${initialHeap.total}MB (limit ${initialHeap.limit}MB)`);

  const results: TrackResult[] = [];
  const heapSamples: HeapSample[] = [];

  // Seed the report so persistProgress always has a valid object
  const report: SoakReport = {
    startedAt,
    finishedAt: null,
    runTimeMs: 0,
    playlistName: playlist.name,
    totalTracks,
    results,
    heapSamples,
    summary: {
      pass: 0, failSilent: 0, failError: 0, failStuck: 0, failLoad: 0,
      heapDeltaMB: 0, worstSilenceMs: 0, totalErrors: 0,
    },
  };

  // Per-track tracking state. currentTrack lives inside a ref container so
  // TypeScript's control-flow analysis doesn't get confused by the closures
  // that mutate it (startTrack, finalizeTrack, the sampling loop).
  const state = {
    currentIdx: -1,
    currentTrack: null as TrackResult | null,
    lastTrackStartMs: performance.now(),
    consecutiveStuck: 0,
    silenceAccumMs: 0,
    trackSilenceStartMs: null as number | null,
    trackSilentFailed: false,
    trackAudioConfirmedAtMs: null as number | null,
    trackPeakRms: 0,
  };

  const finalizeTrack = (nextStartMs: number): void => {
    const t = state.currentTrack;
    if (!t) return;
    t.endMs = nextStartMs - runStartMs;
    t.durationMs = t.endMs - t.startMs;
    t.heapAfterMB = getHeapMB().used;
    t.peakRms = +state.trackPeakRms.toFixed(6);
    t.silenceFraction = t.durationMs > 0
      ? +(state.silenceAccumMs / t.durationMs).toFixed(3)
      : 0;
    t.audioConfirmedMs = state.trackAudioConfirmedAtMs;

    // Pull any console errors that arrived during this track
    const errs = getConsoleEntries()
      .filter((e) => e.timestamp >= runStartMs + t.startMs)
      .map((e) => `[${e.level}] ${e.message}`)
      .slice(-20); // cap per-track so the report doesn't blow up
    t.errors = errs;

    // Classify
    if (t.status === 'PENDING') {
      if (t.forceSkipped) t.status = 'FAIL_STUCK';
      else if (state.trackSilentFailed) t.status = 'FAIL_SILENT';
      else if (errs.some((e) => e.includes('[error]'))) t.status = 'FAIL_ERROR';
      else if (state.trackAudioConfirmedAtMs === null) t.status = 'FAIL_SILENT';
      else t.status = 'PASS';
    }

    log(
      `track ${t.index + 1}/${totalTracks} ${t.status} ` +
      `"${t.trackName}" (${t.format}) ` +
      `played ${(t.durationMs / 1000).toFixed(0)}s ` +
      `peak ${t.peakRms.toFixed(3)} ` +
      `heap ${t.heapBeforeMB}→${t.heapAfterMB}MB` +
      (errs.length ? ` errors:${errs.length}` : ''),
    );

    results.push(t);
    persistProgress(report);
  };

  const startTrack = (idx: number): void => {
    const tracks = useDJPlaylistStore.getState().playlists.find((p) => p.id === playlistId)?.tracks ?? [];
    const t = tracks[idx];
    if (!t) {
      warn(`Track index ${idx} out of range`);
      return;
    }
    state.currentTrack = {
      index: idx,
      fileName: t.fileName,
      trackName: t.trackName,
      format: t.format,
      status: 'PENDING',
      startMs: performance.now() - runStartMs,
      endMs: 0,
      durationMs: 0,
      heapBeforeMB: getHeapMB().used,
      heapAfterMB: 0,
      peakRms: 0,
      silenceFraction: 0,
      audioConfirmedMs: null,
      errors: [],
      forceSkipped: false,
    };
    state.lastTrackStartMs = performance.now();
    state.silenceAccumMs = 0;
    state.trackSilenceStartMs = null;
    state.trackSilentFailed = false;
    state.trackAudioConfirmedAtMs = null;
    state.trackPeakRms = 0;
    log(`track ${idx + 1}/${totalTracks} START  "${t.trackName}" [${t.format}]`);
  };

  // Subscribe to the auto-DJ track index. Every change = current finished, next started.
  const unsubDJ = useDJStore.subscribe((djState, prev) => {
    if (djState.autoDJCurrentTrackIndex !== prev.autoDJCurrentTrackIndex) {
      const nextStartAbsMs = performance.now();
      if (state.currentIdx >= 0) finalizeTrack(nextStartAbsMs);
      state.currentIdx = djState.autoDJCurrentTrackIndex;
      state.consecutiveStuck = 0; // reset on clean advance
      startTrack(state.currentIdx);
    }
  });

  // Seed the first track manually (the subscription only fires on change)
  state.currentIdx = useDJStore.getState().autoDJCurrentTrackIndex;
  startTrack(state.currentIdx);

  // ── Sampling + watchdog loop ──────────────────────────────────────────────

  let stopped = false;
  const stopReasonRef: { value: string | null } = { value: null };

  // Expose a manual stop hook for DevTools (`window.__stopSoak()`)
  (window as unknown as { __stopSoak: () => void }).__stopSoak = () => {
    stopReasonRef.value = 'manual-stop';
    stopped = true;
  };

  while (!stopped) {
    await sleep(SAMPLE_INTERVAL_MS);

    // Abort conditions
    if (results.length >= totalTracks) {
      stopReasonRef.value = 'completed-all-tracks';
      break;
    }
    if (state.consecutiveStuck >= MAX_CONSECUTIVE_STUCK) {
      stopReasonRef.value = 'too-many-stuck-tracks';
      break;
    }

    // Heap sample
    const heap = getHeapMB();
    heapSamples.push({
      tMs: performance.now() - runStartMs,
      trackIndex: state.currentIdx,
      usedMB: heap.used,
      totalMB: heap.total,
      limitMB: heap.limit,
    });

    // Audio level check — 1s window, cheap
    const audio = (await getAudioLevel({ durationMs: 1000 })) as {
      rmsMax?: number;
      peakMax?: number;
      silent?: boolean;
    };
    const peak = audio.peakMax ?? 0;
    const silent = audio.silent ?? true;
    if (peak > state.trackPeakRms) state.trackPeakRms = peak;

    if (silent) {
      if (state.trackSilenceStartMs === null) state.trackSilenceStartMs = performance.now();
      const silentFor = performance.now() - state.trackSilenceStartMs;
      state.silenceAccumMs += Math.min(SAMPLE_INTERVAL_MS, silentFor);
      if (!state.trackSilentFailed && state.trackAudioConfirmedAtMs === null && silentFor > SILENT_FAIL_TIMEOUT_MS) {
        state.trackSilentFailed = true;
        warn(`track ${state.currentIdx + 1} silent > ${SILENT_FAIL_TIMEOUT_MS}ms`);
      }
    } else {
      state.trackSilenceStartMs = null;
      if (state.trackAudioConfirmedAtMs === null) {
        state.trackAudioConfirmedAtMs = performance.now() - state.lastTrackStartMs;
        log(`  audio confirmed @ +${(state.trackAudioConfirmedAtMs / 1000).toFixed(1)}s peak ${peak.toFixed(3)}`);
      }
    }

    // Stuck-track watchdog
    const sinceTrackStart = performance.now() - state.lastTrackStartMs;
    if (sinceTrackStart > TRACK_STUCK_TIMEOUT_MS) {
      warn(`track ${state.currentIdx + 1} stuck > ${TRACK_STUCK_TIMEOUT_MS / 60_000}min — force skip`);
      const stuckTrack = state.currentTrack;
      if (stuckTrack) {
        stuckTrack.forceSkipped = true;
        stuckTrack.status = 'FAIL_STUCK';
      }
      state.consecutiveStuck++;
      try {
        await skipAutoDJ();
      } catch (e) {
        warn('skipAutoDJ failed:', e);
      }
      // Give it a moment to transition; the store subscription handles the rest.
    }
  }

  // ── Finalize ──────────────────────────────────────────────────────────────

  unsubDJ();
  if (state.currentTrack) finalizeTrack(performance.now());

  try {
    disableAutoDJ();
  } catch {
    // ignore
  }

  const finalHeap = getHeapMB();
  report.finishedAt = new Date().toISOString();
  report.runTimeMs = performance.now() - runStartMs;

  // Summary
  for (const r of results) {
    if (r.status === 'PASS') report.summary.pass++;
    else if (r.status === 'FAIL_SILENT') report.summary.failSilent++;
    else if (r.status === 'FAIL_ERROR') report.summary.failError++;
    else if (r.status === 'FAIL_STUCK') report.summary.failStuck++;
    else if (r.status === 'FAIL_LOAD') report.summary.failLoad++;
    report.summary.totalErrors += r.errors.length;
    const silenceMs = r.silenceFraction * r.durationMs;
    if (silenceMs > report.summary.worstSilenceMs) {
      report.summary.worstSilenceMs = silenceMs;
    }
  }
  report.summary.heapDeltaMB = +(finalHeap.used - initialHeap.used).toFixed(1);

  log('=== SOAK COMPLETE ===');
  log(`Reason: ${stopReasonRef.value ?? 'unknown'}`);
  log(`Run time: ${(report.runTimeMs / 1000 / 60).toFixed(1)} min`);
  log(`Tracks: ${results.length}/${totalTracks}`);
  log(`Heap: ${initialHeap.used}MB → ${finalHeap.used}MB (Δ ${report.summary.heapDeltaMB}MB)`);
  console.table({
    PASS: report.summary.pass,
    FAIL_SILENT: report.summary.failSilent,
    FAIL_ERROR: report.summary.failError,
    FAIL_STUCK: report.summary.failStuck,
    FAIL_LOAD: report.summary.failLoad,
  });

  persistProgress(report);
  downloadReport(report);
}
