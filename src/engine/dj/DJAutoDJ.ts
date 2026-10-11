/**
 * DJAutoDJ — Automatic beatmixed playlist playback
 *
 * State machine that plays through a playlist, pre-loading the next track
 * on the idle deck, BPM-syncing, and executing beat-matched crossfade
 * transitions automatically.
 *
 * Uses existing building blocks:
 * - beatMatchedTransition() for crossfading
 * - DJPipeline for background rendering + analysis
 * - DJTrackLoader for automatic Modland track downloading
 */

import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import type { PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { useAudioStore } from '@/stores/useAudioStore';
import type { DeckId } from './DeckEngine';
import { getDJEngine } from './DJEngine';
import {
  beatMatchedTransition, skipTransition,
  cutTransition, filterBuildTransition, bassSwapTransition, echoOutTransition,
} from './DJQuantizedFX';
import { loadPlaylistTrackToDeck } from './DJTrackLoader';
import { keyCompatibility } from './DJKeyUtils';
import { detectDrumBreakTail, isChordChangeImminent } from './smartCuts';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { getSessionController, type SessionTrack } from './autodj/sessionController';
import { executeTransition, releaseAutoKeyLock, type ExecutionHandle } from './autodj/transitionExecutor';
import { buildDJTrackAnalysis, summarizeTrack } from './autodj/trackAnalysis';
import { getDecisionLog } from './autodj/decisionLog';
import type { DJTrackAnalysis, DJTransitionPlan } from './autodj/types';
import { DJJuggleController, analysisClock, type TickInput } from './autodj/juggle/juggleController';
import { createDeckJuggleSink } from './autodj/juggle/juggleDeckSink';
import { JUGGLE_MODES, type JuggleMode } from './autodj/juggle/juggleTypes';
import { POLICY_MIN } from './autodj/juggle/jugglePlanner';
import { seekDeckAudio, setCrossfader } from './DJActions';
import { registerAutoDJ } from './autoDJInstance';
import { phaseAlign, syncBPMToOther } from './DJAutoSync';

// ── Transition Types ────────────────────────────────────────────────────────

type TransitionType = 'crossfade' | 'cut' | 'echo-out' | 'filter-build' | 'bass-swap';

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 500;
const PRELOAD_LEAD_TIME_SEC = 60;

// ── Pattern-aware transition deferral tuning ─────────────────────────────
// Exported so tests can drive the scaling logic without instantiating the
// full Auto-DJ state machine (which needs DJ engine + deck state + store).

/** Absolute ceiling on deferrals. Even a 64-bar transition can't defer
 *  more than this many polls. Prevents a broken chord detector from
 *  stalling the mix indefinitely. */
export const HARD_MAX_PATTERN_DEFERS = 5;
/** Fraction of the transition duration we're willing to spend deferring.
 *  0.15 = at most 15% of the fade. Short fades get proportionally fewer
 *  deferrals so the cap doesn't eat the whole transition window. */
export const PATTERN_DEFER_BUDGET_RATIO = 0.15;
/** Transitions shorter than this never defer — no spare poll cycles. */
export const MIN_TRANSITION_FOR_DEFER_SEC = 2;

/**
 * Deferral cap scaled with transition duration. 500 ms poll interval.
 * Pure — unit-testable without any runtime state.
 *
 * Examples (at 500ms polls, 15% budget, hard cap 5):
 *   1s fade → 0 defers (below MIN_TRANSITION_FOR_DEFER_SEC, but this
 *            function returns 0 regardless — caller's short-fade
 *            guard is the first line of defence)
 *   2s      → floor(2 * 0.15 / 0.5)  = 0
 *   4s      → floor(4 * 0.15 / 0.5)  = 1
 *   10s     → floor(10 * 0.15 / 0.5) = 3
 *   20s     → min(5, floor(6)) = 5   (hard-capped)
 */
export function computeMaxPatternDefers(transitionDurationSec: number): number {
  const pollSec = POLL_INTERVAL_MS / 1000;
  const budget = Math.floor(
    transitionDurationSec * PATTERN_DEFER_BUDGET_RATIO / pollSec,
  );
  return Math.min(HARD_MAX_PATTERN_DEFERS, Math.max(0, budget));
}
const MAX_SKIP_ATTEMPTS = 50;
const MAX_CONSECUTIVE_NETWORK_FAILURES = 3;
const MAX_PRELOAD_RETRIES = 10;  // Stop auto-DJ after this many consecutive preload failures
const SKIP_TRANSITION_BARS = 4;

// Set to true to re-enable verbose per-poll diagnostics. Off during gigs —
// the chatty logs added noticeable overhead at 500ms × 20+ lines per tick.
const DEBUG_POLL = false;


// ── Singleton ────────────────────────────────────────────────────────────────

let instance: DJAutoDJ | null = null;

export function getAutoDJ(): DJAutoDJ {
  if (!instance) {
    instance = new DJAutoDJ();
    registerAutoDJ(instance);
  }
  return instance;
}

// ── Class ────────────────────────────────────────────────────────────────────

class DJAutoDJ {
  private activeDeck: DeckId = 'A';
  private idleDeck: DeckId = 'B';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private transitionCancel: (() => void) | null = null;
  private preloading = false;
  private preloadedDeck: DeckId | null = null;
  private shuffleOrder: number[] = [];
  private shufflePosition = -1;  // -1 = nothing played yet; next ++ yields 0
  // Stale position detection — if timeRemaining doesn't change for too long, force preload
  private lastTimeRemaining = Infinity;
  private staleCount = 0;
  // Network-down backoff — exponential delay between retry attempts
  private preloadFailCount = 0;
  private lastPreloadFailTime = 0;
  // Transition resilience — timeout + crossfader guard
  private transitionStartTime = 0;
  /**
   * Guard flag: set `false` at the START of `triggerTransition` (before any
   * await), set `true` AFTER the crossfade sweep is actually running. The
   * poll loop's 'transitioning' case checks this flag before calling
   * `completeTransition` — without it, the poll loop can fire during
   * `triggerTransition`'s await window (loading pre-rendered track, importing
   * DJPerSongFx) and prematurely complete the transition before the sweep
   * even starts, causing silence (outgoing stopped, incoming not yet started).
   */
  private transitionSweepStarted = false;
  /** Beat-juggling layer (juggling plan section 53): created on first use, performs through the DJ actions. */
  private juggle: DJJuggleController | null = null;
  private juggleSink: ReturnType<typeof createDeckJuggleSink> | null = null;
  /** The incoming deck was started early for a JUGGLE_TRANSITION prelude (juggling plan section 26). */
  private jugglePreludeStarted = false;
  /**
   * Pattern-aware deferral counter. When a chord change is imminent on
   * the outgoing track, `triggerTransition` is deferred by one poll tick
   * (~500 ms) so the crossfade lands past the chord resolution instead
   * of splitting it. Maximum defers is proportional to the transition
   * duration (see `maxPatternDefers()`) so short transitions don't get
   * eaten by deferrals — if the whole fade is only 2 s long, we can't
   * spend 2.5 s deferring. Reset on transition fire.
   */
  private patternDeferCount = 0;
  // Exported tuning constants live at module scope — see top of file.
  private lastCrossfaderValue = -1;
  private crossfaderStuckCount = 0;
  // Watchdog for stuck transitions. Max possible legit duration is 32 bars
  // at 60 BPM = 128s. A transition running past 45s is almost certainly
  // stuck (crossfade scheduler died, incoming deck silent, etc) and worth
  // force-completing.
  private static readonly TRANSITION_TIMEOUT_MS = 45_000;
  private static readonly CROSSFADER_STUCK_POLLS = 10; // 5 seconds at 500ms
  /**
   * The intelligence above this state machine (plan sections 56, 57): the
   * session controller plans the order, the transition and its fallback; the
   * executor runs the plan. This class only answers "what execution state
   * are we in". `plan` is the anticipated transition (made when the preload
   * finished), `incomingAnalysis` the next track's analysis before it is on
   * a deck, `execution` the running plan.
   */
  private plan: DJTransitionPlan | null = null;
  private incomingAnalysis: DJTrackAnalysis | null = null;
  private execution: ExecutionHandle | null = null;


  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Enable Auto DJ mode. Starts playing through the active playlist.
   * If a deck is already playing, uses that as the starting point.
   */
  async enable(startIndex?: number): Promise<string | null> {
    console.log('[AutoDJ] enable() called, startIndex:', startIndex);
    const playlist = this.getActivePlaylist();
    if (!playlist) {
      console.warn('[AutoDJ] No active playlist');
      return 'Create a playlist and add tracks first';
    }
    if (playlist.tracks.length < 2) {
      console.warn('[AutoDJ] Need at least 2 tracks — have:', playlist.tracks.length);
      return `Need at least 2 tracks in playlist (have ${playlist.tracks.length})`;
    }
    // Count playable tracks — anything not permanently marked bad.
    // Local files are fully playable; modland:/hvsc: tracks will be downloaded
    // on demand. The old "downloadable" check excluded local files entirely,
    // which was wrong.
    const playableCount = playlist.tracks.filter(t => !t.isBad).length;
    if (playableCount < 2) {
      console.warn('[AutoDJ] Need at least 2 playable tracks — have:', playableCount);
      return `Need at least 2 playable tracks (have ${playableCount})`;
    }
    console.log(`[AutoDJ] Playlist: "${playlist.name}", ${playlist.tracks.length} tracks`);

    const store = useDJStore.getState();

    // Determine which deck is currently active
    if (store.decks.A.isPlaying) {
      this.activeDeck = 'A';
      this.idleDeck = 'B';
    } else if (store.decks.B.isPlaying) {
      this.activeDeck = 'B';
      this.idleDeck = 'A';
    } else {
      this.activeDeck = 'A';
      this.idleDeck = 'B';
    }

    const startIdx = startIndex ?? 0;

    // Reset all transient per-session state. Without this, a previous
    // Auto DJ run's shuffle order / counters / timing would bleed into
    // the new run. Concretely: switching playlists between enables used
    // to leave shuffleOrder holding indices from the OLD playlist,
    // some possibly out-of-bounds for the new one.
    this.shuffleOrder = [];
    this.shufflePosition = -1;
    this.staleCount = 0;
    this.lastTimeRemaining = Infinity;
    this.preloadFailCount = 0;
    this.lastPreloadFailTime = 0;
    this.transitionStartTime = 0;
    this.transitionSweepStarted = false;
    this.lastCrossfaderValue = -1;
    this.crossfaderStuckCount = 0;

    // Set crossfader to the active deck's side so the correct audio plays
    const crossfaderTarget = this.activeDeck === 'A' ? 0 : 1;
    try { getDJEngine().setCrossfader(crossfaderTarget); } catch { /* engine not ready */ }
    store.setCrossfader(crossfaderTarget);

    store.setAutoDJEnabled(true);
    store.setAutoDJStatus('playing');

    // The performance order is the session controller's (plan section 10):
    // the user's playlist is never re-sorted by Auto DJ.
    this.plan = null;
    this.incomingAnalysis = null;
    this.execution = null;

    // Apply playlist's saved master FX if present
    if (playlist.masterEffects && playlist.masterEffects.length > 0) {
      console.log(`[AutoDJ] Applying playlist master FX (${playlist.masterEffects.length} effects)`);
      useAudioStore.getState().setMasterEffects(playlist.masterEffects);
    }

    // The actual currentIndex we end up on — may differ from startIdx if the
    // first few tracks fail to load. We compute nextIndex ONCE at the end so
    // shuffle mode's shufflePosition advances exactly one step per enable().
    let finalCurrentIdx = startIdx;

    // If nothing is playing, find the first loadable track and play it
    if (!store.decks[this.activeDeck].isPlaying) {
      console.log(`[AutoDJ] No deck playing, loading first track to deck ${this.activeDeck}...`);
      let idx = startIdx;
      let loaded = false;

      for (let attempts = 0; attempts < playlist.tracks.length; attempts++) {
        // Bail if the user disabled Auto DJ while we were awaiting a load.
        // Without this check, a stale load could resolve and start playing
        // on the deck after the user has already clicked Disable.
        if (!useDJStore.getState().autoDJEnabled) {
          console.log('[AutoDJ] enable() cancelled mid-load — user disabled');
          return null;
        }
        const track = playlist.tracks[idx];
        if (track) {
          console.log(`[AutoDJ] Trying track ${idx}: "${track.trackName}" (${track.fileName.substring(0, 60)}...)`);
          loaded = await loadPlaylistTrackToDeck(track, this.activeDeck);
          // Re-check after the await — user may have disabled during the load
          if (!useDJStore.getState().autoDJEnabled) {
            console.log('[AutoDJ] enable() cancelled after load — user disabled');
            return null;
          }
          if (loaded) {
            finalCurrentIdx = idx;
            // Mark track as played in the playlist
            const plId = useDJPlaylistStore.getState().activePlaylistId;
            if (plId) useDJPlaylistStore.getState().markTrackPlayed(plId, idx);
            // Apply per-song master FX for the first-up track so it lands
            // on the deck with the correct chain before play starts.
            try {
              const { applyPerSongMasterFx } = await import('./DJPerSongFx');
              applyPerSongMasterFx(track);
            } catch (err) {
              console.warn('[AutoDJ] per-song FX apply failed for first track:', err);
            }
            try {
              const deck = getDJEngine().getDeck(this.activeDeck);
              await deck.play();
              useDJStore.getState().setDeckPlaying(this.activeDeck, true);
            } catch (err) {
              console.error('[AutoDJ] Failed to start playback:', err);
            }
            break;
          }
        }
        // Skip to next track
        idx = (idx + 1) % playlist.tracks.length;
        if (idx === startIdx) break; // Wrapped around — no loadable tracks
      }

      if (!loaded) {
        console.warn('[AutoDJ] No loadable tracks found in playlist');
        this.disable();
        return 'Could not load any tracks from playlist — check network connection';
      }
    }

    // Start the session: order planned from the current track, memory reset.
    try {
      const controller = getSessionController();
      controller.startSession(this.sessionTracks(), finalCurrentIdx);
      const d = useDJStore.getState().decks[this.activeDeck];
      const first = playlist.tracks[finalCurrentIdx];
      controller.onTrackStarted(finalCurrentIdx, d.trackAnalysis, { artist: first?.author ?? null, bpm: d.beatGrid?.bpm || d.detectedBPM, key: d.musicalKey, energy: d.energy });
    } catch (err) {
      console.warn('[AutoDJ] session controller failed to start:', err);
    }

    // Now compute nextIndex — exactly once, against the final currentIndex
    const nextIndex = this.computeNextIndex(finalCurrentIdx, playlist.tracks.length);
    useDJStore.getState().setAutoDJTrackIndices(finalCurrentIdx, nextIndex);

    this.preloading = false;
    this.preloadedDeck = null;
    this.preRenderedTrack = null;
    this.startPolling();
    const finalIdx = useDJStore.getState().autoDJCurrentTrackIndex;
    console.log(`[AutoDJ] Enabled — starting from track ${finalIdx + 1}/${playlist.tracks.length}`);
    return null; // success
  }

  /** Disable Auto DJ gracefully. Current track keeps playing. */
  disable(): void {
    this.stopPolling();
    this.cancelTransition();
    this.juggle?.abort('Auto DJ off');
    this.jugglePreludeStarted = false;
    this.preloading = false;
    this.preloadedDeck = null;
    this.preRenderedTrack = null;

    const store = useDJStore.getState();
    store.setAutoDJEnabled(false);
    store.setAutoDJStatus('idle');
    console.log('[AutoDJ] Disabled');
  }

  /** Pause Auto DJ — stops polling/transitions but keeps current track playing. */
  pause(): void {
    const wasTransitioning = useDJStore.getState().autoDJStatus === 'transitioning';
    this.stopPolling();
    this.cancelTransition();

    if (wasTransitioning) {
      // Don't leave the decks mid-mixed with the crossfader frozen partway.
      // Force-complete the transition (stop outgoing, snap crossfader to
      // target, swap active/idle) so pause leaves a clean single-deck state
      // the poll loop can manage on resume.
      console.log('[AutoDJ] Paused mid-transition — force-completing swap');
      const store = useDJStore.getState();
      const targetCf = this.idleDeck === 'B' ? 1 : 0;
      try { getDJEngine().setCrossfader(targetCf); } catch { /* */ }
      store.setCrossfader(targetCf);
      try { getDJEngine().getDeck(this.activeDeck).stop(); } catch { /* */ }
      store.setDeckPlaying(this.activeDeck, false);
      this.completeTransition();
    }

    useDJStore.getState().setAutoDJStatus('playing'); // keep status visible
    console.log('[AutoDJ] Paused');
  }

  /** Resume Auto DJ — restarts polling from current position. */
  resume(): void {
    const store = useDJStore.getState();
    if (!store.autoDJEnabled) return;
    this.startPolling();
    store.setAutoDJStatus('playing');
    console.log('[AutoDJ] Resumed');
  }

  /** Jump to a specific track index with a smooth transition. */
  async playFromIndex(index: number): Promise<void> {
    const store = useDJStore.getState();
    if (!store.autoDJEnabled) return;

    const playlist = this.getActivePlaylist();
    if (!playlist || index < 0 || index >= playlist.tracks.length) return;

    this.cancelTransition();
    this.preloading = false;
    this.preloadedDeck = null;
    // CRITICAL: clear any stale pre-rendered track from a previous preload.
    // Without this, triggerTransition would see the cached preRenderedTrack
    // and load IT onto the idle deck, overwriting the jumped-to track
    // loaded below.
    this.preRenderedTrack = null;

    const track = playlist.tracks[index];
    store.setAutoDJStatus('preloading');
    store.setAutoDJTrackIndices(index, (index + 1) % playlist.tracks.length);

    const loaded = await loadPlaylistTrackToDeck(track, this.idleDeck);
    // Bail if user disabled Auto DJ during the load
    if (!useDJStore.getState().autoDJEnabled) {
      console.log('[AutoDJ] playFromIndex cancelled — user disabled');
      return;
    }
    if (!loaded) {
      store.setAutoDJStatus('playing');
      return;
    }

    // Use the same smooth transition as skip
    this.preloadedDeck = this.idleDeck;
    this.triggerTransition(SKIP_TRANSITION_BARS, true);
    console.log(`[AutoDJ] Transitioning to index ${index}: ${track.trackName}`);
  }

  /** Skip to the next track immediately with a short transition. */
  async skip(): Promise<void> {
    const store = useDJStore.getState();
    if (!store.autoDJEnabled) return;
    this.juggle?.noteUserControl('skip');
    this.juggle?.abort('user control: skip');

    // If a transition is in progress, fast-complete it first so indices
    // advance and the deck swap happens. Without this, cancelling a
    // transition mid-flight leaves activeDeck/idleDeck stale and the
    // playlist stuck on the same track.
    if (this.transitionCancel) {
      console.log('[AutoDJ] skip() — force-completing in-progress transition');
      this.cancelTransition();
      this.completeTransition();
    }

    // Sync to actual deck state in case the user manually loaded/played
    // a track on a different deck.
    this.syncDeckState();

    if (this.preloadedDeck) {
      // Next track is ready — do a short transition
      this.triggerTransition(SKIP_TRANSITION_BARS, true);
    } else {
      // Not preloaded yet — try to load and play immediately
      // Clear any stale preRenderedTrack so triggerTransition doesn't use it
      // in place of the track we're about to load directly to the deck.
      this.preRenderedTrack = null;
      const playlist = this.getActivePlaylist();
      if (!playlist) return;

      if (playlist.tracks.length === 0) return;
      let nextIdx = Math.min(store.autoDJNextTrackIndex, playlist.tracks.length - 1);
      store.setAutoDJStatus('preloading');

      // Mix Now must mix NOW: a queued track that fails to load (a Modland
      // timeout marks it bad) is skipped and the next loadable track is taken,
      // the way the preload path does. Owner live test 2026-10-08: the button
      // "did nothing" because it retried the same bad track and left the
      // state in 'preloading'.
      for (let attempts = 0; attempts < MAX_SKIP_ATTEMPTS; attempts++) {
        const current = useDJPlaylistStore.getState().playlists.find((p) => p.id === playlist.id) ?? playlist;
        const track = current.tracks[nextIdx];
        if (!track) break;
        if (!track.isBad || attempts >= MAX_SKIP_ATTEMPTS - 10) {
          const loaded = await loadPlaylistTrackToDeck(track, this.idleDeck);
          // Bail if user disabled Auto DJ during the load
          if (!useDJStore.getState().autoDJEnabled) {
            console.log('[AutoDJ] skip cancelled — user disabled');
            return;
          }
          if (loaded) {
            useDJStore.getState().setAutoDJTrackIndices(useDJStore.getState().autoDJCurrentTrackIndex, nextIdx);
            this.preloadedDeck = this.idleDeck;
            this.triggerTransition(SKIP_TRANSITION_BARS, true);
            return;
          }
        }
        // Bad or unloadable: replan around it and try the next candidate (never the playing track).
        nextIdx = this.nextIndexAfterUnloadable(nextIdx, current.tracks.length);
        console.warn(`[AutoDJ] Mix Now: track unloadable, trying index ${nextIdx} (attempt ${attempts + 1}/${MAX_SKIP_ATTEMPTS})`);
      }
      // Nothing loadable: back to playing, the current track continues.
      console.error('[AutoDJ] Mix Now: no loadable track found');
      useDJStore.getState().setAutoDJStatus('playing');
    }
  }

  // ── Private: Polling ─────────────────────────────────────────────────────

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.pollLoop(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private pollCount = 0;

  private pollLoop(): void {
    const store = useDJStore.getState();
    if (!store.autoDJEnabled) {
      this.stopPolling();
      return;
    }

    const status = store.autoDJStatus;
    const timeRemaining = this.getTimeRemaining();
    this.pollCount++;

    // Verbose poll diagnostics — gated so gig-time console stays readable
    if (DEBUG_POLL && this.pollCount % 10 === 0) {
      const cf = store.crossfaderPosition.toFixed(2);
      const aPlay = store.decks.A.isPlaying;
      const bPlay = store.decks.B.isPlaying;
      const aFile = store.decks.A.fileName?.split('/').pop() ?? 'empty';
      const bFile = store.decks.B.fileName?.split('/').pop() ?? 'empty';
      console.log(`[AutoDJ poll #${this.pollCount}] status=${status} active=${this.activeDeck} idle=${this.idleDeck} cf=${cf} timeLeft=${timeRemaining.toFixed(1)}s A:[${aPlay ? 'PLAY' : 'stop'}]${aFile} B:[${bPlay ? 'PLAY' : 'stop'}]${bFile} preloaded=${this.preloadedDeck ?? 'none'} preloading=${this.preloading} staleCount=${this.staleCount}`);
    }

    this.juggleTick(status, timeRemaining);

    switch (status) {
      case 'playing': {
        // ── Pause guard: if active deck got paused externally, resume it ──
        if (!this.isActiveDeckPlaying(store)) {
          console.warn(`[AutoDJ] Active deck ${this.activeDeck} paused externally — resuming`);
          try { getDJEngine().getDeck(this.activeDeck).play(); } catch { /* */ }
          store.setDeckPlaying(this.activeDeck, true);
        }

        // Detect stale position — browser throttling can freeze audioPosition
        if (Math.abs(timeRemaining - this.lastTimeRemaining) < 0.1) {
          this.staleCount++;
        } else {
          this.staleCount = 0;
        }
        this.lastTimeRemaining = timeRemaining;

        // Preload when: time is low, duration unknown, OR position has been frozen
        // (staleCount > 12 = ~6 seconds of frozen position at 500ms poll interval)
        const positionFrozen = this.staleCount > 12 && timeRemaining < Infinity;
        const shouldPreload = timeRemaining < this.preloadLeadSec() || timeRemaining === Infinity || positionFrozen;
        if (this.pollCount % 4 === 0) this.publishTelemetry(timeRemaining);
        if (shouldPreload && !this.preloading && !this.preloadedDeck) {
          if (positionFrozen) {
            console.warn(`[AutoDJ] Position frozen at ${timeRemaining.toFixed(1)}s for ${this.staleCount} polls — forcing preload`);
          }
          console.log(`[AutoDJ] PRELOAD TRIGGER: timeRemaining=${timeRemaining.toFixed(1)}s, positionFrozen=${positionFrozen}, preloading=${this.preloading}, preloadedDeck=${this.preloadedDeck}`);
          this.preloadNextTrack().catch(err =>
            console.warn('[AutoDJ] preload failed:', err instanceof Error ? err.message : err)
          );
        }
        break;
      }

      case 'transition-pending': {
        // ── Pause guard: if active deck got paused externally, resume it ──
        if (!this.isActiveDeckPlaying(store)) {
          console.warn(`[AutoDJ] Active deck ${this.activeDeck} paused during transition-pending — resuming`);
          try { getDJEngine().getDeck(this.activeDeck).play(); } catch { /* */ }
          store.setDeckPlaying(this.activeDeck, true);
        }

        // Continue tracking stale position in transition-pending state
        if (Math.abs(timeRemaining - this.lastTimeRemaining) < 0.1) {
          this.staleCount++;
        } else {
          this.staleCount = 0;
        }
        this.lastTimeRemaining = timeRemaining;

        // Check if it's time to start the transition
        const transitionDuration = this.getTransitionDurationSec();
        if (DEBUG_POLL && this.pollCount % 4 === 0) {
          console.log(`[AutoDJ transition-pending] timeLeft=${timeRemaining.toFixed(1)}s, transitionDur=${transitionDuration.toFixed(1)}s, staleCount=${this.staleCount}, preloadedDeck=${this.preloadedDeck}`);
        }
        // When timeRemaining is Infinity (duration unknown — e.g. looping
        // tracker modules) or position is frozen (song ended/looped back),
        // use the stale-position heuristic to force the transition.
        if (timeRemaining === Infinity || (this.staleCount > 6 && timeRemaining < 2)) {
          if (this.staleCount > 6) {
            // Position frozen ~3s — track has likely ended, force transition
            console.warn(`[AutoDJ] Stale position (${this.staleCount} polls, timeLeft=${timeRemaining.toFixed(1)}s) — forcing transition`);
            this.patternDeferCount = 0;
            this.triggerTransition(store.autoDJTransitionBars);
            break;
          }
          break;
        }
        if (this.plan) {
          // Plan-driven (plan section 32): trigger when the outgoing deck
          // reaches the planned mix-out point minus the load lead; the
          // executor then waits for the exact grid moment.
          const position = this.getOutgoingPosition();
          const lead = getSessionController().loadLeadSec;
          if (this.pollCount % 4 === 0) this.publishTelemetry(timeRemaining);
          if (position >= this.plan.startTimeSec - lead || timeRemaining <= Math.max(transitionDuration, lead)) {
            console.log(`[AutoDJ] Triggering planned ${this.plan.style} at ${position.toFixed(1)}s (plan start ${this.plan.startTimeSec.toFixed(1)}s)`);
            this.patternDeferCount = 0;
            this.triggerTransition(store.autoDJTransitionBars);
          }
          break;
        }
        if (timeRemaining <= transitionDuration) {
          // Pattern-aware deferral (default on — independent of the
          // Smart Cuts opt-in for transition TYPE). If a chord change
          // is imminent on the outgoing track we'd rather let it
          // resolve, then crossfade into the incoming. One-poll defer
          // (~500 ms) at a time; cap proportional to transitionDuration
          // so short fades don't get stalled by the defer budget.
          if (this.shouldDeferForPatternData(transitionDuration)) {
            const maxDefers = this.maxPatternDefers(transitionDuration);
            console.log(
              `[AutoDJ] Deferring transition: chord change imminent on outgoing (defer ${this.patternDeferCount + 1}/${maxDefers}, fade=${transitionDuration.toFixed(1)}s)`,
            );
            this.patternDeferCount += 1;
            break;
          }
          this.patternDeferCount = 0;
          console.log(`[AutoDJ] Triggering transition: timeLeft=${timeRemaining.toFixed(1)}s <= transitionDur=${transitionDuration.toFixed(1)}s`);
          this.triggerTransition(store.autoDJTransitionBars);
        }
        break;
      }

      case 'transitioning': {
        // ── Transition timeout guard ──
        const transElapsed = Date.now() - this.transitionStartTime;
        if (transElapsed > DJAutoDJ.TRANSITION_TIMEOUT_MS) {
          console.warn(`[AutoDJ] Transition timed out after ${(transElapsed / 1000).toFixed(0)}s — force completing`);
          // Force crossfader to target position
          const targetCf = this.idleDeck === 'B' ? 1 : 0;
          try { getDJEngine().setCrossfader(targetCf); } catch { /* */ }
          store.setCrossfader(targetCf);
          // Stop outgoing deck
          try { getDJEngine().getDeck(this.activeDeck).stop(); } catch { /* */ }
          store.setDeckPlaying(this.activeDeck, false);
          this.completeTransition();
          break;
        }

        // Check if the transition is done.
        // Read engine state directly — store state depends on rAF-based
        // useDeckStateSync which browsers throttle when DJView is hidden
        // (e.g. user is on drumpad view). The crossfader sweep is driven by
        // Web Audio scheduling which runs regardless of visibility.
        let outgoingPlaying: boolean;
        try {
          outgoingPlaying = getDJEngine().getDeck(this.activeDeck).isPlaying();
        } catch {
          outgoingPlaying = store.decks[this.activeDeck].isPlaying;
        }

        const crossfader = store.crossfaderPosition;
        const crossfaderTarget = this.idleDeck === 'B' ? 1 : 0;
        const crossfaderDone = this.idleDeck === 'B' ? crossfader >= 0.98
          : this.idleDeck === 'A' ? crossfader <= 0.02 : false;

        // ── Crossfader stuck guard ──
        // Measure distance-to-target per poll. If distance isn't decreasing,
        // the fade is stalled (user dragged it away, or the sweep died).
        // Old logic compared raw movement vs 0.01 which falsely flagged slow
        // legitimate fades (32-bar at 125 BPM moves only ~0.008/poll) as
        // stuck and force-snapped the crossfader mid-fade.
        //
        // The guard only watches a legacy sweep that is running with the
        // incoming deck audible. Before the sweep starts the fader is held on
        // purpose: a planned transition waits for its grid moment (the plan is
        // finalised at trigger time and may start a phrase later), and forcing
        // the fader then fades the set to a deck that is not playing - which
        // the executor's first curve sample then pulls back ("over, back, over
        // again"). A running executor owns the fader for the whole blend: its
        // curves may hold the fader still on purpose, and it has its own
        // emergency path.
        const sweepAudible = this.transitionSweepStarted && !this.execution && this.deckPlaying(this.idleDeck);
        const prevDistance = this.lastCrossfaderValue < 0
          ? Infinity
          : Math.abs(this.lastCrossfaderValue - crossfaderTarget);
        const currDistance = Math.abs(crossfader - crossfaderTarget);
        // Progressing = distance to target decreased by ANY amount
        if (!sweepAudible || currDistance < prevDistance) {
          this.crossfaderStuckCount = 0;
        } else {
          this.crossfaderStuckCount++;
        }
        this.lastCrossfaderValue = crossfader;

        if (sweepAudible && this.crossfaderStuckCount >= DJAutoDJ.CROSSFADER_STUCK_POLLS && !crossfaderDone) {
          console.warn(`[AutoDJ] Crossfader stuck at ${crossfader.toFixed(2)} for ${this.crossfaderStuckCount} polls — forcing to ${crossfaderTarget}`);
          try { getDJEngine().setCrossfader(crossfaderTarget); } catch { /* */ }
          store.setCrossfader(crossfaderTarget);
          this.crossfaderStuckCount = 0;
        }

        if (DEBUG_POLL && this.pollCount % 4 === 0) {
          const incomingPlaying = store.decks[this.idleDeck].isPlaying;
          console.log(`[AutoDJ transition] outgoing=${this.activeDeck}:${outgoingPlaying} incoming=${this.idleDeck}:${incomingPlaying} cf=${crossfader.toFixed(2)} cfDone=${crossfaderDone} sweepStarted=${this.transitionSweepStarted} elapsed=${(transElapsed / 1000).toFixed(0)}s`);
        }

        // Complete when crossfader is done AND outgoing has stopped AND the
        // sweep has actually started. Without the sweepStarted guard, the
        // poll loop fires during triggerTransition's await window (loading
        // pre-rendered track, importing DJPerSongFx) and completes the
        // transition before the crossfade even begins — causing silence.
        if (crossfaderDone && !outgoingPlaying && this.transitionSweepStarted) {
          // Also verify the incoming deck is actually producing audio.
          // Without this check, a failed play() on the incoming deck leads
          // to silence: the outgoing is stopped, crossfader is at target,
          // but nothing is playing on the incoming side.
          let incomingPlaying = false;
          try {
            incomingPlaying = getDJEngine().getDeck(this.idleDeck).isPlaying();
          } catch {
            incomingPlaying = store.decks[this.idleDeck].isPlaying;
          }
          if (incomingPlaying) {
            this.completeTransition();
          } else if (transElapsed > 10_000) {
            // Incoming deck still not playing after 10s — force-complete
            // to prevent infinite stuck state. The timeout guard above
            // catches the 45s case; this catches the "sweep done but
            // incoming silent" case faster.
            console.warn(`[AutoDJ] Incoming deck ${this.idleDeck} not playing after ${(transElapsed / 1000).toFixed(0)}s — force completing`);
            try { getDJEngine().getDeck(this.idleDeck).play(); } catch { /* */ }
            this.completeTransition();
          }
        }
        break;
      }

      case 'preloading':
        // Waiting for preload — handled by preloadNextTrack callback
        break;

      case 'preload-failed': {
        // Give up after too many consecutive failures
        if (this.preloadFailCount >= MAX_PRELOAD_RETRIES) {
          console.error(`[AutoDJ] Giving up after ${MAX_PRELOAD_RETRIES} preload failures — stopping`);
          this.disable();
          break;
        }
        // Exponential backoff: 5s, 10s, 20s, 40s… capped at 60s
        const backoffMs = Math.min(60_000, 5_000 * Math.pow(2, this.preloadFailCount - 1));
        const elapsed = Date.now() - this.lastPreloadFailTime;
        if (DEBUG_POLL && this.pollCount % 4 === 0) {
          console.log(`[AutoDJ preload-failed] failCount=${this.preloadFailCount}/${MAX_PRELOAD_RETRIES}, backoffMs=${backoffMs}, elapsed=${elapsed}ms, waiting=${elapsed < backoffMs}`);
        }
        if (elapsed < backoffMs) break; // Wait for backoff to expire
        console.log(`[AutoDJ] Retrying preload after ${(elapsed / 1000).toFixed(0)}s backoff (attempt ${this.preloadFailCount})`);
        this.preloading = false;
        this.preloadedDeck = null;
        store.setAutoDJStatus('playing');
        break;
      }

      case 'idle':
        this.stopPolling();
        break;
    }
  }

  // ── Private: Preloading ──────────────────────────────────────────────────

  private preRenderedTrack: { track: PlaylistTrack; data: any } | null = null;

  private async preloadNextTrack(): Promise<void> {
    if (this.preloading) {
      console.log('[AutoDJ] preloadNextTrack() called but already preloading — skipping');
      return;
    }
    this.preloading = true;
    console.log('[AutoDJ] preloadNextTrack() START');
    try { getSessionController().preloadStarted(); } catch { /* */ }

    // Single try/finally guarantees the preloading flag always resets, even
    // on unexpected sync throws (e.g. isServerUnreachable, computeNextIndex).
    // Previously the flag leaked on any throw path not explicitly guarded,
    // blocking all future preloads for the rest of the session.
    try {
      const store = useDJStore.getState();
      const playlist = this.getActivePlaylist();
      if (!playlist) {
        console.warn('[AutoDJ] preloadNextTrack() no playlist — aborting');
        return;
      }

      store.setAutoDJStatus('preloading');
      let nextIdx = store.autoDJNextTrackIndex;
      let attempts = 0;
      let consecutiveNetworkFailures = 0;
      // Cache the server-reachable check per preloadNextTrack call so we don't
      // ping the health endpoint once per failed track (was up to 50× per call).
      let serverReachableCached: boolean | null = null;

      console.log(`[AutoDJ] preloadNextTrack() starting loop: nextIdx=${nextIdx}, maxAttempts=${MAX_SKIP_ATTEMPTS}`);

      while (attempts < MAX_SKIP_ATTEMPTS) {
        const track = playlist.tracks[nextIdx];
        if (!track) {
          console.warn(`[AutoDJ] preloadNextTrack() track at index ${nextIdx} is null — wrapping to 0`);
          nextIdx = 0;
          if (attempts > 0) break;
          attempts++;
          continue;
        }

        // Skip tracks already marked as bad (unless we've tried everything else)
        if (track.isBad && attempts < MAX_SKIP_ATTEMPTS - 10) {
          console.log(`[AutoDJ] Skipping bad track ${nextIdx}: ${track.trackName} (reason: ${track.badReason})`);
          attempts++;
          nextIdx = this.nextIndexAfterUnloadable(nextIdx, playlist.tracks.length);
          continue;
        }

        console.log(`[AutoDJ] Pre-rendering track ${nextIdx + 1}/${playlist.tracks.length} in background: ${track.trackName} (attempt ${attempts + 1}/${MAX_SKIP_ATTEMPTS})${track.isBad ? ' [RETRY BAD TRACK]' : ''}`);

        try {
          // Pre-render in background - UADE crashes happen here, isolated from playback
          console.log(`[AutoDJ] ⏳ Starting background pre-render for: ${track.trackName}`);
          const { preRenderTrack } = await import('./DJTrackLoader');
          const preRendered = await preRenderTrack(track);

          if (preRendered) {
            // Success - save pre-rendered data for instant loading during transition
            console.log(`[AutoDJ] ✅ Pre-render complete, stored for later: ${track.trackName} (${(preRendered.wavData.byteLength / 1024 / 1024).toFixed(1)}MB)`);
            this.preRenderedTrack = { track, data: preRendered };
            this.preloadedDeck = this.idleDeck;
            this.preloadFailCount = 0;
            this.anticipate(track, nextIdx, preRendered);

            useDJStore.getState().setAutoDJTrackIndices(
              useDJStore.getState().autoDJCurrentTrackIndex,
              nextIdx,
            );
            useDJStore.getState().setAutoDJStatus('transition-pending');
            console.log(`[AutoDJ] Preload SUCCESS → deck ${this.idleDeck}, status=transition-pending`);
            return;
          } else {
            console.warn(`[AutoDJ] ❌ Pre-render returned null for ${track.fileName}`);
          }
        } catch (err) {
          console.error(`[AutoDJ] Preload exception for ${track.fileName}:`, err);
        }

        // Detect network-down vs bad-track. Cache the server check — on a
        // bad-link playlist (50 dead tracks), we'd otherwise ping the health
        // endpoint 50× per preload attempt.
        let isNetworkError: boolean;
        if (!navigator.onLine) {
          isNetworkError = true;
        } else {
          if (serverReachableCached === null) {
            serverReachableCached = !(await this.isServerUnreachable());
          }
          isNetworkError = !serverReachableCached;
        }
        if (DEBUG_POLL) console.log(`[AutoDJ] Track load failed - network error: ${isNetworkError}, consecutiveNetworkFailures: ${consecutiveNetworkFailures}`);
        if (isNetworkError) {
          consecutiveNetworkFailures++;
          if (consecutiveNetworkFailures >= MAX_CONSECUTIVE_NETWORK_FAILURES) {
            console.error(`[AutoDJ] Server unreachable — stopping preload after ${consecutiveNetworkFailures} consecutive network failures`);
            this.preloadFailCount++;
            this.lastPreloadFailTime = Date.now();
            useDJStore.getState().setAutoDJStatus('preload-failed');
            return;
          }
        } else {
          consecutiveNetworkFailures = 0;
        }

        attempts++;
        nextIdx = this.nextIndexAfterUnloadable(nextIdx, playlist.tracks.length);
        console.warn(`[AutoDJ] Skipping unloadable track, trying next index ${nextIdx} (attempt ${attempts}/${MAX_SKIP_ATTEMPTS})`);
      }

      // All attempts exhausted (bad tracks, not network)
      console.error('[AutoDJ] PRELOAD EXHAUSTED: Failed to preload any track after', MAX_SKIP_ATTEMPTS, 'attempts');
      this.preloadFailCount++;
      this.lastPreloadFailTime = Date.now();
      useDJStore.getState().setAutoDJStatus('preload-failed');
    } finally {
      this.preloading = false;
    }
  }

  /**
   * Pattern-aware deferral predicate. Returns true when the outgoing
   * deck's loaded song has a chord change inside the next 8 rows
   * (half a bar at typical tracker speed) from the current row — in
   * that tight window, a hard crossfade splits the chord transition
   * and sounds broken. One poll's defer (~500 ms) moves the fire
   * onto the resolved bar.
   *
   * Applies even when `autoDJSmartCuts` is OFF — this is a timing
   * refinement, not a transition-type change, so it doesn't run
   * afoul of the 2026-04-18 gig-fix rule against auto hard cuts.
   *
   * Early-outs that prevent deferral-stalls:
   * 1. `transitionDuration < MIN_TRANSITION_FOR_DEFER_SEC` — short
   *    fades can't afford ANY defer; firing on time beats firing
   *    musically.
   * 2. `patternDeferCount >= maxPatternDefers(transitionDuration)` —
   *    proportional cap (15% of fade duration) so a 10s fade burns
   *    at most ~1.5s on deferrals, a 2s fade burns none.
   * 3. `HARD_MAX_PATTERN_DEFERS` absolute ceiling regardless of
   *    transition length — a broken chord detector cannot stall the
   *    mix beyond 5 polls (~2.5s).
   */
  private shouldDeferForPatternData(transitionDurationSec: number): boolean {
    if (transitionDurationSec < MIN_TRANSITION_FOR_DEFER_SEC) return false;
    const maxDefers = computeMaxPatternDefers(transitionDurationSec);
    if (this.patternDeferCount >= maxDefers) return false;
    try {
      const deck = getDJEngine().getDeck(this.activeDeck);
      const song = deck.getLoadedSong();
      if (!song || !Array.isArray(song.patterns) || song.patterns.length === 0) return false;
      const state = useDJStore.getState().decks[this.activeDeck];
      const patternIndex = song.songPositions[state.songPos] ?? -1;
      return isChordChangeImminent({
        song,
        patternIndex,
        currentRow: state.pattPos,
        // Tight half-bar window — only catches TRULY imminent changes
        // (the one the crossfade would split). Wider windows produced
        // too many deferrals in dense tracker progressions where chord
        // changes happen every couple of bars anyway.
        windowRows: 8,
      });
    } catch {
      return false;
    }
  }

  /** Thin wrapper exposing the scaling helper for in-class callers. */
  private maxPatternDefers(transitionDurationSec: number): number {
    return computeMaxPatternDefers(transitionDurationSec);
  }

  // ── Private: Transition ──────────────────────────────────────────────────

  private async triggerTransition(userBars: number, isSkip: boolean = false): Promise<void> {
    const store = useDJStore.getState();
    if (!this.preloadedDeck) return;

    // Flip status IMMEDIATELY, before any await, so the poll loop doesn't
    // re-enter triggerTransition while loadPreRenderedTrackToDeck is in flight
    // (status stays 'transition-pending' through the await otherwise, and the
    // next 500ms poll would trigger a second transition — double deck swap).
    if (store.autoDJStatus === 'transitioning') {
      console.warn('[AutoDJ] triggerTransition() called while already transitioning — skipping duplicate');
      return;
    }
    store.setAutoDJStatus('transitioning');
    this.transitionStartTime = Date.now();
    // Reset sweep guard — the sweep hasn't started yet. The poll loop will
    // NOT call completeTransition until this flag is set to true (after the
    // crossfade sweep is actually running).
    this.transitionSweepStarted = false;

    // Load pre-rendered track instantly if available (background render complete)
    if (this.preRenderedTrack) {
      console.log(`[AutoDJ] 🚀 Loading PRE-RENDERED track to deck ${this.idleDeck}: ${this.preRenderedTrack.track.trackName}`);
      const { loadPreRenderedTrackToDeck } = await import('./DJTrackLoader');
      const loaded = await loadPreRenderedTrackToDeck(
        this.preRenderedTrack.data,
        this.preRenderedTrack.track,
        this.idleDeck,
      );
      if (!loaded) {
        console.error('[AutoDJ] ❌ Failed to load pre-rendered track — aborting transition');
        this.preRenderedTrack = null;
        this.preloadedDeck = null;
        // Revert to 'playing' rather than 'preload-failed'. The WAV data was
        // already rendered successfully — the failure here is deck-load level
        // (engine race, rare). 'preload-failed' would route into the network
        // backoff path (5s+ retries) which is wrong for a transient engine
        // issue. 'playing' lets the next poll try a fresh preload immediately.
        useDJStore.getState().setAutoDJStatus('playing');
        return;
      }
      console.log(`[AutoDJ] ✅ Pre-rendered track loaded successfully to deck ${this.idleDeck}`);
      this.preRenderedTrack = null; // Clear after use
    } else {
      console.warn(`[AutoDJ] ⚠️ No pre-rendered track available, deck should already have track loaded`);
    }

    // Read the decks AFTER the load: the `store` snapshot above predates it, so
    // the incoming deck looked like the track it replaced (no beat grid, the
    // old key and energy) when the transition type was chosen.
    const afterLoad = useDJStore.getState();
    const outState = afterLoad.decks[this.activeDeck];
    const inState = afterLoad.decks[this.idleDeck];

    // Smart Cuts — when enabled, pass loaded song data so selectTransitionType
    // can override with evidence-based decisions (drum-break tail cut,
    // chord-change defer, harmonic bass-swap). The store flag is
    // `autoDJSmartCuts` (defaults false). We only fetch songs for tracker-
    // format decks; a track without a song returns null from getLoadedSong.
    let outSong: TrackerSong | null = null;
    let inSong: TrackerSong | null = null;
    if (store.autoDJSmartCuts) {
      try {
        outSong = getDJEngine().getDeck(this.activeDeck).getLoadedSong();
        inSong = getDJEngine().getDeck(this.idleDeck).getLoadedSong();
      } catch { /* engine not ready — fall through without pattern data */ }
    }

    // Smart transition type selection (still informs WHICH transition)
    const transType = this.selectTransitionType(outState, inState, {
      smartCuts: store.autoDJSmartCuts,
      outSong,
      inSong,
      // Outgoing pattern index (via patternOrder lookup) + row — used by
      // the chord-change-imminent predicate. Falls back to -1 ("scan the
      // last pattern") when songPos is out of range or song is null.
      outPatternIndex: outSong ? (outSong.songPositions[outState.songPos] ?? -1) : -1,
      outRow: outState.pattPos,
    });

    // Transition duration is driven by the caller's userBars (either the
    // user-configured autoDJTransitionBars or SKIP_TRANSITION_BARS). Cut is
    // instant and echo-out has its own intrinsic 4-bar length. Using userBars
    // for crossfade/filter-build/bass-swap ensures the fade completes within
    // the time window the poll loop used to decide WHEN to trigger — an
    // earlier bug let smart bars (up to 32) overrun the trigger window.
    const bars = transType === 'cut' ? 1 : transType === 'echo-out' ? 4 : userBars;

    // Mark incoming deck as playing in the store
    // (status + transitionStartTime already set at top of function for race guard)
    store.setDeckPlaying(this.idleDeck, true);
    this.lastCrossfaderValue = -1;
    this.crossfaderStuckCount = 0;

    // Apply per-song master FX for the incoming track so the preset takes
    // effect the moment the crossfade starts. Manual loads do this in
    // DJPlaylistModal's loadTrackWithProgress; Auto DJ's own load path
    // (loadPreRenderedTrackToDeck / loadPlaylistTrackToDeck) doesn't, so
    // per-song FX would otherwise never fire during Auto DJ transitions.
    try {
      const playlist = this.getActivePlaylist();
      const incomingTrack = playlist?.tracks[store.autoDJNextTrackIndex];
      if (incomingTrack) {
        const { applyPerSongMasterFx } = await import('./DJPerSongFx');
        applyPerSongMasterFx(incomingTrack);
      }
    } catch (err) {
      console.warn('[AutoDJ] per-song FX apply failed:', err);
    }

    const aFile = store.decks.A.fileName?.split('/').pop() ?? 'empty';
    const bFile = store.decks.B.fileName?.split('/').pop() ?? 'empty';
    console.log(`[AutoDJ] ${isSkip ? 'SKIP ' : ''}${transType.toUpperCase()} ${bars}-bar: ${this.activeDeck} → ${this.idleDeck} | A:${aFile} B:${bFile}`);

    // Pre-start the incoming deck for skip transitions. The skip path
    // fires play() synchronously inside skipTransition, but it's
    // fire-and-forget (async play, no await). If the AudioContext
    // isn't running yet, play() awaits Tone.start() — meaning the
    // crossfade may reach the target before audio is audible. By
    // awaiting play() here BEFORE the sweep starts, we guarantee the
    // incoming deck is producing audio when the crossfader moves.
    // For non-skip transitions (beatMatched, etc.) play() is scheduled
    // on the next downbeat alongside the sweep, so pre-starting would
    // cause audio to leak before the crossfade begins.
    if (isSkip) {
      try {
        await getDJEngine().getDeck(this.idleDeck).play();
      } catch (err) {
        console.warn('[AutoDJ] Pre-start incoming deck failed (skip):', err);
      }
    }

    // Skip: use skipTransition which starts immediately (no quantize delay).
    // Normal transitions run the session controller's plan through the
    // executor (plan sections 15, 60); the legacy functions remain the
    // emergency path when no plan can be made.
    const planned = isSkip ? null : this.finalizePlan();
    if (isSkip) {
      this.transitionCancel = skipTransition(
        this.activeDeck, this.idleDeck, bars, store.autoDJWithFilter,
      );
    } else if (planned) {
      this.transitionCancel = this.executePlan(planned);
      console.log(`[AutoDJ] PLAN ${planned.style} ${planned.durationBars}-bar: ${this.activeDeck} → ${this.idleDeck} at ${planned.startTimeSec.toFixed(1)}s, incoming from ${planned.incomingPosition.toFixed(1)}s`);
      // The executor flips the sweep flag (onSweepStarted) once its automation clock runs.
      return;
    } else {
      switch (transType) {
        case 'cut':
          this.transitionCancel = cutTransition(this.activeDeck, this.idleDeck);
          break;
        case 'echo-out':
          this.transitionCancel = echoOutTransition(this.activeDeck, this.idleDeck, bars * 4);
          break;
        case 'filter-build':
          this.transitionCancel = filterBuildTransition(this.activeDeck, this.idleDeck, bars);
          break;
        case 'bass-swap':
          this.transitionCancel = bassSwapTransition(this.activeDeck, this.idleDeck, bars);
          break;
        case 'crossfade':
        default:
          this.transitionCancel = beatMatchedTransition(
            this.activeDeck, this.idleDeck, bars, store.autoDJWithFilter,
          );
          break;
      }
    }

    // The crossfade sweep (or cut/echo-out) is now running. Allow the poll
    // loop to detect completion.
    this.transitionSweepStarted = true;
  }

  /**
   * Intelligently select transition type based on track characteristics.
   *
   * When `smartCuts` is true, pattern-data analysis can override the
   * default decision:
   *   - Drum-break tail on outgoing → force 'cut' (opt-in only — bypasses
   *     the 2026-04-18 gig-fix that bans random cuts, since this cut is
   *     evidence-based, not probabilistic)
   *   - Perfect/energy-boost key compat + high energy → deterministic
   *     'bass-swap' instead of the 30% random roll used by the default
   *     path (harmonic bass-swap is always right when keys agree)
   */
  private selectTransitionType(
    outgoing: { effectiveBPM: number; energy?: number; musicalKey?: string | null },
    incoming: { effectiveBPM: number; energy?: number; musicalKey?: string | null },
    smartCtx?: {
      smartCuts: boolean;
      outSong: TrackerSong | null;
      inSong: TrackerSong | null;
      outPatternIndex: number;
      outRow: number;
    },
  ): TransitionType {
    const bpmDiff = Math.abs((outgoing.effectiveBPM || 125) - (incoming.effectiveBPM || 125));
    const outEnergy = outgoing.energy ?? 0.5;
    const inEnergy = incoming.energy ?? 0.5;
    const keyCompat = keyCompatibility(outgoing.musicalKey, incoming.musicalKey);

    // Smart Cuts — opt-in pattern-data override. Highest priority so drum-
    // break cuts win over every probabilistic path below.
    if (smartCtx?.smartCuts) {
      if (detectDrumBreakTail({ song: smartCtx.outSong })) {
        // Chord-change avoidance: hard cuts sound broken across a chord
        // change. If one's imminent on the outgoing pattern, fall through
        // to crossfade (natural harmonic cover) instead.
        const chordImminent = isChordChangeImminent({
          song: smartCtx.outSong,
          patternIndex: smartCtx.outPatternIndex,
          currentRow: smartCtx.outRow,
          windowRows: 16,
        });
        if (chordImminent) {
          console.log('[AutoDJ] Smart Cuts: drum-break tail but chord change imminent → crossfade');
          return 'crossfade';
        }
        console.log('[AutoDJ] Smart Cuts: drum-break tail detected → cut');
        return 'cut';
      }
      // Harmonic bass-swap — when keys agree AND energy is high, bass-swap
      // always sounds better than a plain crossfade. Remove the probabilistic
      // gate that the default path uses (Math.random < 0.3).
      if (bpmDiff < 4 && outEnergy > 0.6
          && (keyCompat === 'perfect' || keyCompat === 'energy-boost')) {
        console.log('[AutoDJ] Smart Cuts: harmonic bass-swap (keys compatible)');
        return 'bass-swap';
      }
    }

    // Gig-fix (2026-04-18): NEVER auto-select a hard 'cut' transition.
    // Previously the high-energy + close-BPM branch rolled a ~30-50%
    // random chance of `'cut'`, which during a live set delivered a
    // hard cut with no fade mid-song — caught on stage. Hard cuts
    // remain available for explicit user-triggered moves via
    // cutTransition() in DJQuantizedFX, but Auto DJ should only ever
    // produce *blended* transitions (crossfade / bass-swap / echo-out /
    // filter-build) that keep both tracks audible during the swap.
    if (bpmDiff < 4 && outEnergy > 0.6) {
      if (keyCompat === 'perfect' || keyCompat === 'energy-boost') {
        // Compatible key → bass swap sounds great (still a crossfade
        // under the hood, just with a bass-kill midpoint).
        if (Math.random() < 0.3) return 'bass-swap';
      }
    }

    // Energy dropping → echo out for dramatic effect
    if (inEnergy < outEnergy - 0.15) {
      if (Math.random() < 0.5) return 'echo-out';
    }

    // Energy building → filter build for anticipation
    if (inEnergy > outEnergy + 0.1) {
      if (Math.random() < 0.4) return 'filter-build';
    }

    // Default: standard crossfade (always safe)
    return 'crossfade';
  }

  private cancelTransition(): void {
    if (this.transitionCancel) {
      this.transitionCancel();
      this.transitionCancel = null;
    }
    this.transitionSweepStarted = false;
  }

  /**
   * Check which deck is actually playing and sync activeDeck/idleDeck.
   * The user may have manually loaded tracks or moved the crossfader,
   * making the stored activeDeck/idleDeck stale. Without this sync,
   * "Mix Now" can load the next track to the WRONG deck (the one that's
   * already playing) or try to crossfade in the wrong direction.
   */
  private syncDeckState(): void {
    const store = useDJStore.getState();
    const aPlaying = store.decks.A.isPlaying;
    const bPlaying = store.decks.B.isPlaying;

    if (aPlaying && !bPlaying) {
      this.activeDeck = 'A';
      this.idleDeck = 'B';
    } else if (bPlaying && !aPlaying) {
      this.activeDeck = 'B';
      this.idleDeck = 'A';
    }
    // If both or neither are playing, keep current assignment
  }

  private completeTransition(): void {
    console.log('[AutoDJ] completeTransition() START');
    this.transitionSweepStarted = false;
    this.jugglePreludeStarted = false;
    // Whatever completed the transition (the sweep itself, the timeout guard,
    // the incoming-not-playing guard), its automation stops here: a running
    // executor or legacy sweep would otherwise keep writing the crossfader
    // toward the deck this method is about to stop. Cancelling a finished
    // executor or sweep is a no-op.
    const cancelAutomation = this.transitionCancel;
    this.transitionCancel = null;
    try { cancelAutomation?.(); } catch (err) { console.warn('[AutoDJ] cancelling transition automation failed:', err); }

    // Stop and reset the outgoing deck
    try {
      const outgoing = getDJEngine().getDeck(this.activeDeck);
      outgoing.stop();
      outgoing.setFilterPosition(0);
      outgoing.setVolume(1);
    } catch { /* engine not ready */ }
    useDJStore.getState().setDeckPlaying(this.activeDeck, false);
    useDJStore.getState().setDeckFilter(this.activeDeck, 0);
    useDJStore.getState().setDeckVolume(this.activeDeck, 1);
    // The track Auto DJ key-locked has left the outgoing deck: its own key-lock state comes back.
    releaseAutoKeyLock(this.ab(this.activeDeck));

    // Swap decks
    const oldActive = this.activeDeck;
    this.activeDeck = this.idleDeck;
    this.idleDeck = oldActive;
    this.staleCount = 0;
    this.lastTimeRemaining = Infinity;

    // Snap crossfader to the exact position for the new active deck.
    // The sweep may have ended at 0.98 instead of 1.0 — force it to the
    // canonical value so the NEXT transition starts from the correct end.
    const crossfaderSnap = this.activeDeck === 'A' ? 0 : 1;
    try { getDJEngine().setCrossfader(crossfaderSnap); } catch { /* engine not ready */ }
    useDJStore.getState().setCrossfader(crossfaderSnap);

    const store = useDJStore.getState();
    const playlist = this.getActivePlaylist();
    const trackCount = playlist?.tracks.length ?? 1;

    // Advance indices: the controller records the new track and replans the
    // order before the next index is read from it.
    const newCurrentIdx = store.autoDJNextTrackIndex;
    this.plan = null;
    this.incomingAnalysis = null;
    this.execution = null;
    try {
      const d = useDJStore.getState().decks[this.activeDeck];
      const t = playlist?.tracks[newCurrentIdx];
      getSessionController().onTrackStarted(newCurrentIdx, d.trackAnalysis, { artist: t?.author ?? null, bpm: d.beatGrid?.bpm || d.detectedBPM, key: d.musicalKey, energy: d.energy });
    } catch (err) {
      console.warn('[AutoDJ] controller onTrackStarted failed:', err);
    }
    const newNextIdx = this.computeNextIndex(newCurrentIdx, trackCount);

    store.setAutoDJTrackIndices(newCurrentIdx, newNextIdx);
    store.setAutoDJStatus('playing');
    this.preloading = false;
    this.preloadedDeck = null;

    // Mark the new track as played
    const plId = useDJPlaylistStore.getState().activePlaylistId;
    if (plId) useDJPlaylistStore.getState().markTrackPlayed(plId, newCurrentIdx);

    const aFile = useDJStore.getState().decks.A.fileName?.split('/').pop() ?? 'empty';
    const bFile = useDJStore.getState().decks.B.fileName?.split('/').pop() ?? 'empty';
    console.log(`[AutoDJ] Transition complete — active=${this.activeDeck} idle=${this.idleDeck} cf=${crossfaderSnap} track ${newCurrentIdx + 1}/${trackCount} next=${newNextIdx} A:${aFile} B:${bFile}`);

    // Immediately start preloading the next track.
    // Don't wait for the poll loop — the new active deck's store position
    // may not have synced yet, so getTimeRemaining() could return a stale
    // value that prevents preload from triggering.
    console.log('[AutoDJ] completeTransition() triggering immediate preloadNextTrack()');
    this.preloadNextTrack().catch(err =>
      console.warn('[AutoDJ] preload failed after transition complete:', err instanceof Error ? err.message : err)
    );
  }

  // ── Private: Network Health ──────────────────────────────────────────────

  private async isServerUnreachable(): Promise<boolean> {
    const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';
    try {
      const resp = await fetch(`${API_URL}/modland/status`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      return !resp.ok;
    } catch {
      return true;
    }
  }

  // ── Private: Helpers ─────────────────────────────────────────────────────

  private getActivePlaylist() {
    const playlistStore = useDJPlaylistStore.getState();
    if (!playlistStore.activePlaylistId) return null;
    return playlistStore.playlists.find(p => p.id === playlistStore.activePlaylistId) ?? null;
  }

  private getTimeRemaining(): number {
    // Read position directly from the engine — NOT from the store.
    // The store is updated via requestAnimationFrame which browsers throttle
    // when the DJView is hidden (e.g. drumpad view active). Reading from
    // the engine ensures auto DJ transitions fire reliably regardless of
    // which view is visible.
    try {
      const deck = getDJEngine().getDeck(this.activeDeck);
      if (deck.playbackMode === 'audio') {
        const pos = deck.audioPlayer.getPosition();
        const dur = deck.audioPlayer.getDuration();
        if (DEBUG_POLL && this.pollCount % 20 === 0) {
          console.log(`[AutoDJ getTimeRemaining] deck=${this.activeDeck} mode=audio pos=${pos.toFixed(2)}s dur=${dur.toFixed(2)}s remaining=${(dur - pos).toFixed(2)}s`);
        }
        if (dur > 0) return dur - pos;
      } else {
        const replayer = deck.replayer;
        const elapsedMs = replayer.getElapsedMs();
        const state = useDJStore.getState().decks[this.activeDeck];
        if (DEBUG_POLL && this.pollCount % 20 === 0) {
          console.log(`[AutoDJ getTimeRemaining] deck=${this.activeDeck} mode=tracker elapsedMs=${elapsedMs} durationMs=${state.durationMs} remaining=${((state.durationMs - elapsedMs) / 1000).toFixed(2)}s`);
        }
        if (state.durationMs > 0) return (state.durationMs - elapsedMs) / 1000;
      }
    } catch (err) {
      // Engine not ready — fall back to store
      if (DEBUG_POLL && this.pollCount % 20 === 0) {
        console.log(`[AutoDJ getTimeRemaining] FALLBACK to store (engine error):`, err);
      }
      const state = useDJStore.getState().decks[this.activeDeck];
      if (state.playbackMode === 'audio' && state.durationMs > 0) {
        return (state.durationMs / 1000) - state.audioPosition;
      }
      if (state.durationMs > 0) return (state.durationMs - state.elapsedMs) / 1000;
    }
    return Infinity;
  }

  private getTransitionDurationSec(): number {
    const state = useDJStore.getState();
    const deckState = state.decks[this.activeDeck];
    if (this.plan) {
      const bpm = deckState.beatGrid?.bpm || deckState.detectedBPM || deckState.effectiveBPM || 125;
      return (this.plan.durationBeats * 60) / bpm;
    }
    const bpm = deckState.beatGrid?.bpm || deckState.detectedBPM || deckState.effectiveBPM || 125;
    const beatsPerBar = deckState.beatGrid?.timeSignature || 4;
    const totalBeats = state.autoDJTransitionBars * beatsPerBar;
    return (totalBeats * 60) / bpm;
  }

  /**
   * The playlist index to queue after `fromIndex`. `playingIndex` is the track
   * on air: it is never returned while another track exists, whichever branch
   * picks (the session order, shuffle, sequential). In the normal case the two
   * are the same; the skip-past-a-failed-track paths pass the failed index as
   * `fromIndex` and the playing track separately - before, the sequential
   * fallback there stepped from the failed track straight onto the playing one
   * and Auto DJ mixed the playing track into itself.
   */
  private computeNextIndex(fromIndex: number, trackCount: number, playingIndex: number = fromIndex): number {
    if (trackCount <= 1) return 0;
    const usable = (i: number) => i >= 0 && i < trackCount && i !== fromIndex && i !== playingIndex;

    const store = useDJStore.getState();
    if (!store.autoDJShuffle) {
      // The session order (plan sections 8, 10), never the playlist's own order.
      try {
        const next = getSessionController().nextIndex();
        if (next !== null && usable(next)) return next;
      } catch { /* fall through to sequential */ }
    }
    if (store.autoDJShuffle) {
      // Regenerate if empty or exhausted — checked BEFORE increment so that
      // the first call after a fresh shuffle reads index 0 (the old code
      // incremented first, which skipped the 0th slot of every cycle and
      // also fell through to 0 on the very first call when the order was
      // still empty).
      for (let tries = 0; tries <= trackCount; tries++) {
        if (this.shufflePosition + 1 >= this.shuffleOrder.length) {
          this.generateShuffleOrder(trackCount, playingIndex);
        }
        this.shufflePosition++;
        const next = this.shuffleOrder[this.shufflePosition];
        if (next !== undefined && usable(next)) return next;
      }
    }

    for (let step = 1; step < trackCount; step++) {
      const next = (fromIndex + step) % trackCount;
      if (usable(next)) return next;
    }
    // Only the failed track and the playing one exist: retry the failed one, never the one on air.
    return fromIndex !== playingIndex ? fromIndex : (fromIndex + 1) % trackCount;
  }

  /**
   * The next candidate after `failedIndex` could not be loaded (or is marked
   * bad). The controller replans its order first - the loader has marked the
   * track bad, so the new order leaves it out - and the playing track is
   * never the answer.
   */
  private nextIndexAfterUnloadable(failedIndex: number, trackCount: number): number {
    try {
      const controller = getSessionController();
      controller.setTracks(this.sessionTracks());
      controller.replanSession();
    } catch { /* sequential fallback below */ }
    return this.computeNextIndex(failedIndex, trackCount, useDJStore.getState().autoDJCurrentTrackIndex);
  }

  private generateShuffleOrder(trackCount: number, currentIndex: number): void {
    // Fisher-Yates shuffle of all indices except current
    const indices = Array.from({ length: trackCount }, (_, i) => i).filter(i => i !== currentIndex);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    this.shuffleOrder = indices;
    this.shufflePosition = -1;  // next computeNextIndex ++ yields 0
  }

  // ── Private: session controller glue (plan sections 32-34, 44) ─────────

  /** Auto DJ only ever uses decks A and B (deck C is the thru/sampler deck). */
  private ab(deck: DeckId): 'A' | 'B' { return deck === 'B' ? 'B' : 'A'; }

  private sessionTracks(): SessionTrack[] {
    const playlist = this.getActivePlaylist();
    if (!playlist) return [];
    return playlist.tracks.map((track, index) => ({ index, id: track.id, name: track.trackName, artist: track.author ?? null, track }));
  }

  private preloadLeadSec(): number {
    try {
      const playlist = this.getActivePlaylist();
      const next = playlist?.tracks[useDJStore.getState().autoDJNextTrackIndex] ?? null;
      const outgoing = useDJStore.getState().decks[this.activeDeck].trackAnalysis;
      return getSessionController().preloadTiming(next, outgoing).leadSec;
    } catch {
      return PRELOAD_LEAD_TIME_SEC;
    }
  }

  private getOutgoingPosition(): number {
    try {
      const deck = getDJEngine().getDeck(this.activeDeck);
      if (deck.playbackMode === 'audio') return deck.audioPlayer.getPosition();
      return deck.replayer.getElapsedMs() / 1000;
    } catch {
      return useDJStore.getState().decks[this.activeDeck].audioPosition;
    }
  }

  /**
   * Anticipatory planning (plan section 32): the preload finished, so the
   * incoming analysis exists before the track is on a deck. Build it, store
   * its summary on the playlist track (the set planner reads it next time),
   * and plan the transition now.
   */
  private anticipate(track: PlaylistTrack, index: number, preRendered: { duration: number; analysis?: import('./DJPipeline').PipelineResult['analysis']; song?: TrackerSong }): void {
    try {
      const controller = getSessionController();
      controller.preloadFinished();
      controller.setTracks(this.sessionTracks());
      if (!preRendered.analysis) { this.incomingAnalysis = null; this.plan = null; return; }
      this.incomingAnalysis = buildDJTrackAnalysis({
        id: track.fileName, durationSec: preRendered.duration, analysis: preRendered.analysis,
        extended: preRendered.analysis.extended ?? null, song: preRendered.song ?? null,
      });
      // The playlist converges on the deck's numbers: the same analysis the
      // deck gets on load (one tempo per track), written every time, not only
      // when the track had no summary yet.
      const summary = summarizeTrack(this.incomingAnalysis);
      const plId = useDJPlaylistStore.getState().activePlaylistId;
      if (plId) useDJPlaylistStore.getState().updateTrackMeta(plId, index, { bpm: summary.bpm, djSummary: summary });
      const outgoing = useDJStore.getState().decks[this.activeDeck].trackAnalysis;
      this.plan = controller.planTransitionFor(outgoing, this.incomingAnalysis, { outgoing: this.ab(this.activeDeck), incoming: this.ab(this.idleDeck) }, this.getOutgoingPosition());
    } catch (err) {
      console.warn('[AutoDJ] anticipatory planning failed:', err);
      this.plan = null;
    }
  }

  /** The final plan from the live position and both decks' analyses (the incoming deck is loaded now). */
  private finalizePlan(): DJTransitionPlan | null {
    try {
      const decks = useDJStore.getState().decks;
      const outgoing = decks[this.activeDeck].trackAnalysis;
      const incoming = decks[this.idleDeck].trackAnalysis ?? this.incomingAnalysis;
      const plan = getSessionController().planTransitionFor(outgoing, incoming, { outgoing: this.ab(this.activeDeck), incoming: this.ab(this.idleDeck) }, this.getOutgoingPosition());
      this.plan = plan;
      return plan;
    } catch (err) {
      console.warn('[AutoDJ] plan failed, legacy transition:', err);
      getDecisionLog().record('EMERGENCY', [`plan failed: ${err instanceof Error ? err.message : String(err)}`]);
      return null;
    }
  }

  /** Run a plan through the executor; the sweep flag flips when its automation clock runs, as the legacy sweeps do. */
  private executePlan(planned: DJTransitionPlan): () => void {
    const out = this.activeDeck;
    const handle = executeTransition(planned, {
      waitForStart: () => this.waitForDeckPosition(out, planned.startTimeSec),
      onSweepStarted: () => { this.transitionSweepStarted = true; },
      onComplete: (result) => {
        if (this.execution === handle) this.execution = null;
        try { getSessionController().onTransitionComplete(result, planned); } catch { /* */ }
      },
    });
    this.execution = handle;
    return () => handle.cancel();
  }

  /** Resolve when the deck reaches `targetSec` (the planned grid moment), or on a safety timeout. */
  private waitForDeckPosition(deck: DeckId, targetSec: number): Promise<void> {
    return new Promise((resolve) => {
      // The safety deadline is fixed once, from the wait the plan asked for.
      // Recomputing it from the shrinking `remaining` on every check made it
      // fire seconds before the planned grid moment (a 9 s wait resolved at
      // ~6.6 s), starting the incoming deck off-grid: double kicks in the blend.
      let deadline = Infinity;
      const check = () => {
        let pos = 0;
        try { pos = getDJEngine().getDeck(deck).audioPlayer.getPosition(); } catch { pos = targetSec; }
        const remaining = targetSec - pos;
        if (deadline === Infinity) deadline = Date.now() + Math.max(3000, remaining * 1500 + 3000);
        if (remaining <= 0.008 || Date.now() > deadline) { resolve(); return; }
        setTimeout(check, Math.min(15, Math.max(1, remaining * 1000 - 5)));
      };
      check();
    });
  }

  // ── Beat juggling (juggling plan sections 24, 26, 43, 53) ───────────────────

  /** Test/MCP access: the juggle controller (created on first use). */
  getJuggle(): DJJuggleController {
    if (!this.juggle) {
      const sink = createDeckJuggleSink();
      this.juggleSink = sink;
      this.juggle = new DJJuggleController({
        sink,
        positionOf: (deck) => this.deckPosition(deck),
        clockFor: (deck, analysis, position) => analysisClock(analysis, position, () => useDJStore.getState().decks[deck].effectiveBPM || 0),
        onTelemetry: (t) => useDJStore.getState().setAutoDJJuggleTelemetry(t),
        seed: Date.now() & 0xffff,
      });
    }
    return this.juggle;
  }

  private deckPosition(deck: DeckId): number {
    try { return getDJEngine().getDeck(deck).audioPlayer.getPosition(); } catch { return useDJStore.getState().decks[deck].audioPosition; }
  }

  private deckPlaying(deck: DeckId): boolean {
    try { return getDJEngine().getDeck(deck).isPlaying(); } catch { return useDJStore.getState().decks[deck].isPlaying; }
  }

  private deckInput(deck: DeckId): TickInput['decks']['A'] {
    const d = useDJStore.getState().decks[deck];
    const analysis = d.trackAnalysis ?? (deck === this.idleDeck ? this.incomingAnalysis : null);
    const bpm = d.effectiveBPM || d.detectedBPM || analysis?.bpm || 0;
    const loop = d.loopActive && d.audioLoopIn !== null && d.audioLoopOut !== null
      ? { startSec: d.audioLoopIn, endSec: d.audioLoopOut, lengthBeats: (d.audioLoopOut - d.audioLoopIn) / (60 / Math.max(60, bpm)) } : null;
    return { trackId: d.fileName ?? '', analysis, positionSec: this.deckPosition(deck), playing: this.deckPlaying(deck), bpm, loop, keyShiftSemitones: d.keyLockEnabled ? 0 : d.pitchOffset };
  }

  /**
   * One juggle tick per poll: the controller sees both decks on the shared
   * clock, decides, performs and yields to the user. During a transition the
   * transition executor owns the decks (performance mode NORMAL_MIX).
   */
  private juggleTick(status: string, timeRemaining: number): void {
    const s = useDJStore.getState();
    const mode = (JUGGLE_MODES as readonly string[]).includes(s.autoDJJuggleMode) ? (s.autoDJJuggleMode as JuggleMode) : 'OFF';
    if (mode === 'OFF' && !this.juggle) return;
    const j = this.getJuggle();
    j.setMode(mode);
    j.setIntensity(s.autoDJJuggleIntensity);
    if (mode === 'OFF' && !j.isActive()) return;
    if (!j.isActive() && this.pollCount % 2 === 1) return;
    try {
      const transitioning = status === 'transitioning';
      if (!transitioning && status === 'transition-pending') this.maybeStartJugglePrelude();
      const outgoingPosition = this.getOutgoingPosition();
      const transitionApproachingSec = this.plan ? Math.max(0, this.plan.startTimeSec - outgoingPosition) : Number.isFinite(timeRemaining) ? timeRemaining : null;
      const last = this.juggleSink?.lastCrossfader() ?? null;
      const userControl = j.isActive() && last !== null && Math.abs(s.crossfaderPosition - last) > 0.05 ? 'crossfader' : null;
      const decks = useDJStore.getState().decks;
      const ctx = getSessionController().context({
        currentDeck: this.ab(this.activeDeck), incomingDeck: this.preloadedDeck ? this.ab(this.preloadedDeck) : undefined,
        currentTrack: decks[this.activeDeck].trackAnalysis, incomingTrack: decks[this.idleDeck].trackAnalysis ?? this.incomingAnalysis,
        currentPosition: outgoingPosition, timeRemainingSec: Number.isFinite(timeRemaining) ? timeRemaining : -1,
      });
      j.tick({
        masterDeck: this.ab(this.activeDeck),
        decks: { A: this.deckInput('A'), B: this.deckInput('B') },
        setPhase: ctx.setPhase, energy: ctx.setEnergy, targetEnergy: ctx.targetEnergy,
        performanceMode: transitioning ? 'NORMAL_MIX' : this.jugglePreludeStarted ? 'JUGGLE_TRANSITION' : 'JUGGLE',
        transitionApproachingSec, userControl,
      });
    } catch (err) {
      console.warn('[AutoDJ] juggle tick failed:', err instanceof Error ? err.message : err);
    }
  }

  /**
   * JUGGLE_TRANSITION (juggling plan section 26): start the incoming deck a
   * prelude early, muted by the crossfader and locked to the outgoing grid,
   * so the controller can trade phrases into the planned mix-in; the ordinary
   * transition then runs from the plan's start as usual.
   */
  private maybeStartJugglePrelude(): void {
    if (this.jugglePreludeStarted || !this.plan || !this.preloadedDeck || !this.preRenderedTrack || !this.incomingAnalysis) return;
    const j = this.getJuggle();
    if (j.getMode() === 'OFF' || j.getMode() === 'SAFE') return;
    const outgoing = useDJStore.getState().decks[this.activeDeck].trackAnalysis;
    // The grids must carry at least phrase trading (the planner's own policy):
    // a stricter bar here kept every moderate-grid pair out of the prelude.
    const minGrid = POLICY_MIN.phrase.beat;
    if (!outgoing || outgoing.beatGrid.confidence < minGrid || this.incomingAnalysis.beatGrid.confidence < minGrid) return;
    const bpm = useDJStore.getState().decks[this.activeDeck].effectiveBPM || outgoing.bpm;
    const barSec = (60 / Math.max(60, bpm)) * (outgoing.meter.beatsPerBar || 4);
    const preludeBars = 8;
    const preludeSec = preludeBars * barSec;
    const secToStart = this.plan.startTimeSec - this.getOutgoingPosition();
    if (secToStart > preludeSec + 3 || secToStart < preludeSec + 0.5) return;
    const incomingStart = this.plan.incomingPosition - preludeSec;
    if (incomingStart < 0) return;
    this.jugglePreludeStarted = true;
    const pre = this.preRenderedTrack;
    const idle = this.idleDeck;
    this.preRenderedTrack = null;
    void (async () => {
      try {
        const { loadPreRenderedTrackToDeck } = await import('./DJTrackLoader');
        const loaded = await loadPreRenderedTrackToDeck(pre.data, pre.track, idle);
        if (!loaded) { this.preRenderedTrack = pre; this.jugglePreludeStarted = false; return; }
        setCrossfader(this.activeDeck === 'A' ? 0 : 1);
        syncBPMToOther(idle, this.activeDeck);
        const wait = Math.max(0, secToStart - preludeSec);
        await new Promise<void>((r) => setTimeout(r, wait * 1000));
        seekDeckAudio(idle, incomingStart);
        await getDJEngine().getDeck(idle).play();
        useDJStore.getState().setDeckPlaying(idle, true);
        try { phaseAlign(idle, this.activeDeck, 'bar'); } catch { /* grid missing */ }
        getDecisionLog().record('PLAN_TRANSITION', [`juggle transition prelude: ${preludeBars} bars on deck ${idle} from ${incomingStart.toFixed(1)} s`]);
      } catch (err) {
        console.warn('[AutoDJ] juggle prelude failed:', err instanceof Error ? err.message : err);
        this.jugglePreludeStarted = false;
      }
    })();
  }

  private publishTelemetry(timeRemaining: number): void {
    try {
      const controller = getSessionController();
      const decks = useDJStore.getState().decks;
      const playlist = this.getActivePlaylist();
      const s = useDJStore.getState();
      const ctx = controller.context({
        currentDeck: this.ab(this.activeDeck), incomingDeck: this.preloadedDeck ? this.ab(this.preloadedDeck) : undefined,
        currentTrack: decks[this.activeDeck].trackAnalysis, incomingTrack: decks[this.idleDeck].trackAnalysis ?? this.incomingAnalysis,
        currentPosition: this.getOutgoingPosition(), timeRemainingSec: Number.isFinite(timeRemaining) ? timeRemaining : -1,
      });
      controller.publishTelemetry(ctx, playlist?.tracks[s.autoDJCurrentTrackIndex]?.trackName ?? null, playlist?.tracks[s.autoDJNextTrackIndex]?.trackName ?? null);
    } catch { /* telemetry must never break the DJ */ }
  }

  /** Check if the active deck is actually playing (reads engine first, falls back to store). */
  private isActiveDeckPlaying(store: ReturnType<typeof useDJStore.getState>): boolean {
    try {
      return getDJEngine().getDeck(this.activeDeck).isPlaying();
    } catch {
      return store.decks[this.activeDeck].isPlaying;
    }
  }
}
