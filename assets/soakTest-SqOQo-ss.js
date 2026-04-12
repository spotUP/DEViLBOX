import { s as startConsoleCapture, u as useDJPlaylistStore, a as useUIStore, b as useDJStore, g as getConsoleEntries, c as clearConsoleEntries } from "./main-BbV5VyEH.js";
import { e as enableAutoDJ, s as skipAutoDJ, d as disableAutoDJ } from "./DJActions-Ap2A5JjP.js";
import { g as getAudioLevel } from "./writeHandlers-Dgd83ZOv.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./parseModuleToSong-B-Yqzlmn.js";
import "./AudioDataBus-DGyOo1ms.js";
const PLAYLIST_NAME_MATCH = "supreme synthetics";
const SAMPLE_INTERVAL_MS = 3e4;
const TRACK_STUCK_TIMEOUT_MS = 8 * 60 * 1e3;
const SILENT_FAIL_TIMEOUT_MS = 1e4;
const MAX_CONSECUTIVE_STUCK = 3;
const PROGRESS_STORAGE_KEY = "soak-progress";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getHeapMB() {
  const mem = performance.memory;
  if (!mem) return { used: 0, total: 0, limit: 0 };
  return {
    used: +(mem.usedJSHeapSize / 1024 / 1024).toFixed(1),
    total: +(mem.totalJSHeapSize / 1024 / 1024).toFixed(1),
    limit: +(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1)
  };
}
function log(...args) {
  console.log("%c[soak]", "color: #ff00ff; font-weight: bold", ...args);
}
function warn(...args) {
  console.warn("[soak]", ...args);
}
function persistProgress(report) {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(report));
  } catch (e) {
    warn("localStorage write failed (quota?):", e);
  }
}
function downloadReport(report) {
  try {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const iso = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `soak-report-${iso}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1e4);
  } catch (e) {
    warn("Download failed:", e);
  }
}
async function waitForPlaylist() {
  const maxWaitMs = 3e4;
  const startMs = performance.now();
  while (performance.now() - startMs < maxWaitMs) {
    const { playlists } = useDJPlaylistStore.getState();
    const match = playlists.find(
      (p) => p.name.toLowerCase().includes(PLAYLIST_NAME_MATCH)
    );
    if (match && match.tracks.length > 0) {
      log(`Found playlist "${match.name}" — ${match.tracks.length} tracks`);
      return match.id;
    }
    await sleep(500);
  }
  throw new Error(
    `Playlist containing "${PLAYLIST_NAME_MATCH}" not found after ${maxWaitMs}ms. Found ${useDJPlaylistStore.getState().playlists.length} playlists.`
  );
}
async function runSupremeSynthSoak() {
  log("Supreme Synthetics soak test starting — this will take ~12-15 hours");
  log("Press Ctrl+C / close tab to abort; progress is persisted per-track");
  startConsoleCapture();
  clearConsoleEntries();
  const playlistId = await waitForPlaylist();
  const playlist = useDJPlaylistStore.getState().playlists.find((p) => p.id === playlistId);
  const totalTracks = playlist.tracks.length;
  useUIStore.getState().setActiveView("dj");
  useDJPlaylistStore.getState().setActivePlaylist(playlistId);
  await sleep(500);
  log("Enabling auto-DJ…");
  const enableErr = await enableAutoDJ(0);
  if (enableErr) {
    warn("enableAutoDJ returned error:", enableErr);
    warn("Common cause: AudioContext still locked. Click anywhere in the page.");
    warn("Waiting 10 s then retrying…");
    await sleep(1e4);
    const retry = await enableAutoDJ(0);
    if (retry) throw new Error(`Auto-DJ failed to start: ${retry}`);
  }
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const runStartMs = performance.now();
  const initialHeap = getHeapMB();
  log(`Run start — heap: ${initialHeap.used}/${initialHeap.total}MB (limit ${initialHeap.limit}MB)`);
  const results = [];
  const heapSamples = [];
  const report = {
    startedAt,
    finishedAt: null,
    runTimeMs: 0,
    playlistName: playlist.name,
    totalTracks,
    results,
    heapSamples,
    summary: {
      pass: 0,
      failSilent: 0,
      failError: 0,
      failStuck: 0,
      failLoad: 0,
      heapDeltaMB: 0,
      worstSilenceMs: 0,
      totalErrors: 0
    }
  };
  const state = {
    currentIdx: -1,
    currentTrack: null,
    lastTrackStartMs: performance.now(),
    consecutiveStuck: 0,
    silenceAccumMs: 0,
    trackSilenceStartMs: null,
    trackSilentFailed: false,
    trackAudioConfirmedAtMs: null,
    trackPeakRms: 0
  };
  const finalizeTrack = (nextStartMs) => {
    const t = state.currentTrack;
    if (!t) return;
    t.endMs = nextStartMs - runStartMs;
    t.durationMs = t.endMs - t.startMs;
    t.heapAfterMB = getHeapMB().used;
    t.peakRms = +state.trackPeakRms.toFixed(6);
    t.silenceFraction = t.durationMs > 0 ? +(state.silenceAccumMs / t.durationMs).toFixed(3) : 0;
    t.audioConfirmedMs = state.trackAudioConfirmedAtMs;
    const errs = getConsoleEntries().filter((e) => e.timestamp >= runStartMs + t.startMs).map((e) => `[${e.level}] ${e.message}`).slice(-20);
    t.errors = errs;
    if (t.status === "PENDING") {
      if (t.forceSkipped) t.status = "FAIL_STUCK";
      else if (state.trackSilentFailed) t.status = "FAIL_SILENT";
      else if (errs.some((e) => e.includes("[error]"))) t.status = "FAIL_ERROR";
      else if (state.trackAudioConfirmedAtMs === null) t.status = "FAIL_SILENT";
      else t.status = "PASS";
    }
    log(
      `track ${t.index + 1}/${totalTracks} ${t.status} "${t.trackName}" (${t.format}) played ${(t.durationMs / 1e3).toFixed(0)}s peak ${t.peakRms.toFixed(3)} heap ${t.heapBeforeMB}→${t.heapAfterMB}MB` + (errs.length ? ` errors:${errs.length}` : "")
    );
    results.push(t);
    persistProgress(report);
  };
  const startTrack = (idx) => {
    var _a;
    const tracks = ((_a = useDJPlaylistStore.getState().playlists.find((p) => p.id === playlistId)) == null ? void 0 : _a.tracks) ?? [];
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
      status: "PENDING",
      startMs: performance.now() - runStartMs,
      endMs: 0,
      durationMs: 0,
      heapBeforeMB: getHeapMB().used,
      heapAfterMB: 0,
      peakRms: 0,
      silenceFraction: 0,
      audioConfirmedMs: null,
      errors: [],
      forceSkipped: false
    };
    state.lastTrackStartMs = performance.now();
    state.silenceAccumMs = 0;
    state.trackSilenceStartMs = null;
    state.trackSilentFailed = false;
    state.trackAudioConfirmedAtMs = null;
    state.trackPeakRms = 0;
    log(`track ${idx + 1}/${totalTracks} START  "${t.trackName}" [${t.format}]`);
  };
  const unsubDJ = useDJStore.subscribe((djState, prev) => {
    if (djState.autoDJCurrentTrackIndex !== prev.autoDJCurrentTrackIndex) {
      const nextStartAbsMs = performance.now();
      if (state.currentIdx >= 0) finalizeTrack(nextStartAbsMs);
      state.currentIdx = djState.autoDJCurrentTrackIndex;
      state.consecutiveStuck = 0;
      startTrack(state.currentIdx);
    }
  });
  state.currentIdx = useDJStore.getState().autoDJCurrentTrackIndex;
  startTrack(state.currentIdx);
  let stopped = false;
  const stopReasonRef = { value: null };
  window.__stopSoak = () => {
    stopReasonRef.value = "manual-stop";
    stopped = true;
  };
  while (!stopped) {
    await sleep(SAMPLE_INTERVAL_MS);
    if (results.length >= totalTracks) {
      stopReasonRef.value = "completed-all-tracks";
      break;
    }
    if (state.consecutiveStuck >= MAX_CONSECUTIVE_STUCK) {
      stopReasonRef.value = "too-many-stuck-tracks";
      break;
    }
    const heap = getHeapMB();
    heapSamples.push({
      tMs: performance.now() - runStartMs,
      trackIndex: state.currentIdx,
      usedMB: heap.used,
      totalMB: heap.total,
      limitMB: heap.limit
    });
    const audio = await getAudioLevel({ durationMs: 1e3 });
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
        log(`  audio confirmed @ +${(state.trackAudioConfirmedAtMs / 1e3).toFixed(1)}s peak ${peak.toFixed(3)}`);
      }
    }
    const sinceTrackStart = performance.now() - state.lastTrackStartMs;
    if (sinceTrackStart > TRACK_STUCK_TIMEOUT_MS) {
      warn(`track ${state.currentIdx + 1} stuck > ${TRACK_STUCK_TIMEOUT_MS / 6e4}min — force skip`);
      const stuckTrack = state.currentTrack;
      if (stuckTrack) {
        stuckTrack.forceSkipped = true;
        stuckTrack.status = "FAIL_STUCK";
      }
      state.consecutiveStuck++;
      try {
        await skipAutoDJ();
      } catch (e) {
        warn("skipAutoDJ failed:", e);
      }
    }
  }
  unsubDJ();
  if (state.currentTrack) finalizeTrack(performance.now());
  try {
    disableAutoDJ();
  } catch {
  }
  const finalHeap = getHeapMB();
  report.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  report.runTimeMs = performance.now() - runStartMs;
  for (const r of results) {
    if (r.status === "PASS") report.summary.pass++;
    else if (r.status === "FAIL_SILENT") report.summary.failSilent++;
    else if (r.status === "FAIL_ERROR") report.summary.failError++;
    else if (r.status === "FAIL_STUCK") report.summary.failStuck++;
    else if (r.status === "FAIL_LOAD") report.summary.failLoad++;
    report.summary.totalErrors += r.errors.length;
    const silenceMs = r.silenceFraction * r.durationMs;
    if (silenceMs > report.summary.worstSilenceMs) {
      report.summary.worstSilenceMs = silenceMs;
    }
  }
  report.summary.heapDeltaMB = +(finalHeap.used - initialHeap.used).toFixed(1);
  log("=== SOAK COMPLETE ===");
  log(`Reason: ${stopReasonRef.value ?? "unknown"}`);
  log(`Run time: ${(report.runTimeMs / 1e3 / 60).toFixed(1)} min`);
  log(`Tracks: ${results.length}/${totalTracks}`);
  log(`Heap: ${initialHeap.used}MB → ${finalHeap.used}MB (Δ ${report.summary.heapDeltaMB}MB)`);
  console.table({
    PASS: report.summary.pass,
    FAIL_SILENT: report.summary.failSilent,
    FAIL_ERROR: report.summary.failError,
    FAIL_STUCK: report.summary.failStuck,
    FAIL_LOAD: report.summary.failLoad
  });
  persistProgress(report);
  downloadReport(report);
}
export {
  runSupremeSynthSoak
};
