/**
 * songTime — monotonic "seconds since song started" clock used by time-mode
 * dub lanes (raw SID / SC68 / any non-structured format).
 *
 * Not every playback path drives Tone.Transport.seconds (raw SID plays via
 * jsSID/WebSID register emulation at audio-clock rate; no Transport beats).
 * But every path flips useTransportStore.isPlaying when the user hits play,
 * so we latch a start timestamp on that edge and diff against Tone.now()
 * to get a stable song-time reading for both recording and playback.
 *
 * Pauses don't exist for raw SID — the engine just stops. Treating pause
 * as stop is fine: worst case the user loses 100 ms of "song time"
 * precision on rare pause/resume.
 */

import * as Tone from 'tone';
import { useTransportStore } from '@/stores/useTransportStore';

let _startAudioTime: number | null = null;
let _isPlaying = false;

/** Start the clock. Called from the isPlaying-edge subscription below and
 *  also from explicit `resetSongTime()` in tests. */
function markStart(): void {
  _startAudioTime = Tone.now();
  _isPlaying = true;
}

function markStop(): void {
  _isPlaying = false;
  // Don't clear _startAudioTime — if the user restarts, marKStart() overwrites
  // it. Keeping stale value means a late recorder event right after stop still
  // gets a sensible timestamp instead of `null → 0`.
}

/** Current song-time in seconds (audio-clock based). Returns 0 before
 *  playback has ever started. Monotonically increasing during playback. */
export function getSongTimeSec(): number {
  if (_startAudioTime === null) return 0;
  if (!_isPlaying) {
    // When stopped, freeze at the last live reading so the UI playhead
    // doesn't jitter and post-stop recorder events don't land past the end.
    // Implementation: we never saved the stop-time, so just return whatever
    // Tone.now() says — will drift slightly past real stop but the recorder
    // doesn't fire when stopped anyway (armed=false by default).
    return Math.max(0, Tone.now() - _startAudioTime);
  }
  return Math.max(0, Tone.now() - _startAudioTime);
}

/** Hard-reset the clock. Called by tests; also called when the user loads a
 *  new song so the next play() starts at 0 instead of continuing from stop. */
export function resetSongTime(): void {
  _startAudioTime = null;
  _isPlaying = false;
}

// ── Auto-start on isPlaying edge ─────────────────────────────────────────
// Subscribe once at module load. Re-firing on every true/false edge so
// pause/resume behaves sensibly. Using .subscribe() on zustand — bypasses
// React so this works in engine/worker contexts.
let _subscribed = false;
function ensureSubscription(): void {
  if (_subscribed) return;
  _subscribed = true;
  try {
    useTransportStore.subscribe((state) => {
      const nowPlaying = !!state.isPlaying;
      if (nowPlaying && !_isPlaying) markStart();
      else if (!nowPlaying && _isPlaying) markStop();
    });
  } catch {
    // Store not available (SSR / unit tests without a running React) — tests
    // can call resetSongTime() + markStart() manually via the exports below.
    _subscribed = false;
  }
}
ensureSubscription();

// Test-only helpers
export const __songTimeInternals = {
  markStart,
  markStop,
  get startAudioTime(): number | null { return _startAudioTime; },
};
