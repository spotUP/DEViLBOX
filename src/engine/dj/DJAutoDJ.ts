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
  beatMatchedTransition,
  cutTransition, filterBuildTransition, bassSwapTransition, echoOutTransition,
} from './DJQuantizedFX';
import { loadPlaylistTrackToDeck } from './DJTrackLoader';
import { keyCompatibility } from './DJKeyUtils';

// ── Transition Types ────────────────────────────────────────────────────────

type TransitionType = 'crossfade' | 'cut' | 'echo-out' | 'filter-build' | 'bass-swap';

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 500;
const PRELOAD_LEAD_TIME_SEC = 60;
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
  private lastCrossfaderValue = -1;
  private crossfaderStuckCount = 0;
  // Watchdog for stuck transitions. Max possible legit duration is 32 bars
  // at 60 BPM = 128s. A transition running past 180s is almost certainly
  // stuck (crossfade scheduler died, incoming deck silent, etc) and worth
  // force-completing. Previously 30s, which force-aborted any 16-bar fade
  // below 125 BPM and any 32-bar fade at any BPM.
  private static readonly TRANSITION_TIMEOUT_MS = 180_000;
  private static readonly CROSSFADER_STUCK_POLLS = 10; // 5 seconds at 500ms


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
    const downloadableCount = playlist.tracks.filter(t =>
      t.fileName.startsWith('modland:') || t.fileName.startsWith('hvsc:')
    ).length;
    if (downloadableCount < 2) {
      console.warn('[AutoDJ] Need at least 2 downloadable tracks — have:', downloadableCount);
      return `Need at least 2 downloadable tracks (have ${downloadableCount} — add tracks from Online browser)`;
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

    // Set crossfader to the active deck's side so the correct audio plays
    const crossfaderTarget = this.activeDeck === 'A' ? 0 : 1;
    try { getDJEngine().setCrossfader(crossfaderTarget); } catch { /* engine not ready */ }
    store.setCrossfader(crossfaderTarget);

    store.setAutoDJEnabled(true);
    store.setAutoDJStatus('playing');

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
    this.stopPolling();
    this.cancelTransition();
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
    this.triggerTransition(SKIP_TRANSITION_BARS);
    console.log(`[AutoDJ] Transitioning to index ${index}: ${track.trackName}`);
  }

  /** Skip to the next track immediately with a short transition. */
  async skip(): Promise<void> {
    const store = useDJStore.getState();
    if (!store.autoDJEnabled) return;

    if (this.preloadedDeck) {
      // Next track is ready — do a short transition
      this.cancelTransition();
      this.triggerTransition(SKIP_TRANSITION_BARS);
    } else {
      // Not preloaded yet — try to load and play immediately
      this.cancelTransition();
      // Clear any stale preRenderedTrack so triggerTransition doesn't use it
      // in place of the track we're about to load directly to the deck.
      this.preRenderedTrack = null;
      const playlist = this.getActivePlaylist();
      if (!playlist) return;

      const nextIdx = store.autoDJNextTrackIndex;
      const track = nextIdx < playlist.tracks.length ? playlist.tracks[nextIdx] : undefined;
      if (!track) {
        // Track was removed — clamp index and retry on next skip
        if (playlist.tracks.length === 0) return;
        const fallbackIdx = Math.min(nextIdx, playlist.tracks.length - 1);
        store.setAutoDJTrackIndices(store.autoDJCurrentTrackIndex, fallbackIdx);
        return;
      }

      store.setAutoDJStatus('preloading');

      const loaded = await loadPlaylistTrackToDeck(track, this.idleDeck);

      // Bail if user disabled Auto DJ during the load
      if (!useDJStore.getState().autoDJEnabled) {
        console.log('[AutoDJ] skip cancelled — user disabled');
        return;
      }

      if (loaded) {
        this.preloadedDeck = this.idleDeck;
        this.triggerTransition(SKIP_TRANSITION_BARS);
      }
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
        const shouldPreload = timeRemaining < PRELOAD_LEAD_TIME_SEC || timeRemaining === Infinity || positionFrozen;
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

        // Check if it's time to start the transition
        const transitionDuration = this.getTransitionDurationSec();
        if (DEBUG_POLL && this.pollCount % 4 === 0) {
          console.log(`[AutoDJ transition-pending] timeLeft=${timeRemaining.toFixed(1)}s, transitionDur=${transitionDuration.toFixed(1)}s, preloadedDeck=${this.preloadedDeck}`);
        }
        if (timeRemaining <= transitionDuration) {
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
        const prevDistance = this.lastCrossfaderValue < 0
          ? Infinity
          : Math.abs(this.lastCrossfaderValue - crossfaderTarget);
        const currDistance = Math.abs(crossfader - crossfaderTarget);
        // Progressing = distance to target decreased by ANY amount
        if (currDistance < prevDistance) {
          this.crossfaderStuckCount = 0;
        } else {
          this.crossfaderStuckCount++;
        }
        this.lastCrossfaderValue = crossfader;

        if (this.crossfaderStuckCount >= DJAutoDJ.CROSSFADER_STUCK_POLLS && !crossfaderDone) {
          console.warn(`[AutoDJ] Crossfader stuck at ${crossfader.toFixed(2)} for ${this.crossfaderStuckCount} polls — forcing to ${crossfaderTarget}`);
          try { getDJEngine().setCrossfader(crossfaderTarget); } catch { /* */ }
          store.setCrossfader(crossfaderTarget);
          this.crossfaderStuckCount = 0;
        }

        if (DEBUG_POLL && this.pollCount % 4 === 0) {
          const incomingPlaying = store.decks[this.idleDeck].isPlaying;
          console.log(`[AutoDJ transition] outgoing=${this.activeDeck}:${outgoingPlaying} incoming=${this.idleDeck}:${incomingPlaying} cf=${crossfader.toFixed(2)} cfDone=${crossfaderDone} elapsed=${(transElapsed / 1000).toFixed(0)}s`);
        }

        // Complete when crossfader is done AND outgoing has stopped
        if (crossfaderDone && !outgoingPlaying) {
          this.completeTransition();
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
          nextIdx = this.computeNextIndex(nextIdx, playlist.tracks.length);
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
        nextIdx = this.computeNextIndex(nextIdx, playlist.tracks.length);
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

  // ── Private: Transition ──────────────────────────────────────────────────

  private async triggerTransition(userBars: number): Promise<void> {
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

    const outState = store.decks[this.activeDeck];
    const inState = store.decks[this.idleDeck];

    // Smart transition type selection (still informs WHICH transition)
    const transType = this.selectTransitionType(outState, inState);

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

    const aFile = store.decks.A.fileName?.split('/').pop() ?? 'empty';
    const bFile = store.decks.B.fileName?.split('/').pop() ?? 'empty';
    console.log(`[AutoDJ] ${transType.toUpperCase()} ${bars}-bar: ${this.activeDeck} → ${this.idleDeck} | A:${aFile} B:${bFile}`);

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

  /**
   * Intelligently select transition type based on track characteristics.
   */
  private selectTransitionType(outgoing: { effectiveBPM: number; energy?: number; musicalKey?: string | null }, incoming: { effectiveBPM: number; energy?: number; musicalKey?: string | null }): TransitionType {
    const bpmDiff = Math.abs((outgoing.effectiveBPM || 125) - (incoming.effectiveBPM || 125));
    const outEnergy = outgoing.energy ?? 0.5;
    const inEnergy = incoming.energy ?? 0.5;
    const keyCompat = keyCompatibility(outgoing.musicalKey, incoming.musicalKey);

    // High energy + close BPM = punchy cut or bass swap
    if (bpmDiff < 4 && outEnergy > 0.6) {
      const roll = Math.random();
      if (keyCompat === 'perfect' || keyCompat === 'energy-boost') {
        // Compatible key → bass swap sounds great
        if (roll < 0.3) return 'bass-swap';
        if (roll < 0.5) return 'cut';
      } else {
        if (roll < 0.3) return 'cut';
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
  }

  private completeTransition(): void {
    console.log('[AutoDJ] completeTransition() START');
    this.transitionCancel = null;

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

    // Advance indices
    const newCurrentIdx = store.autoDJNextTrackIndex;
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
    const bpm = deckState.beatGrid?.bpm || deckState.detectedBPM || deckState.effectiveBPM || 125;
    const beatsPerBar = deckState.beatGrid?.timeSignature || 4;
    const totalBeats = state.autoDJTransitionBars * beatsPerBar;
    return (totalBeats * 60) / bpm;
  }

  private computeNextIndex(currentIndex: number, trackCount: number): number {
    if (trackCount <= 1) return 0;

    const store = useDJStore.getState();
    if (store.autoDJShuffle) {
      // Regenerate if empty or exhausted — checked BEFORE increment so that
      // the first call after a fresh shuffle reads index 0 (the old code
      // incremented first, which skipped the 0th slot of every cycle and
      // also fell through to 0 on the very first call when the order was
      // still empty).
      if (this.shufflePosition + 1 >= this.shuffleOrder.length) {
        this.generateShuffleOrder(trackCount, currentIndex);
      }
      this.shufflePosition++;
      return this.shuffleOrder[this.shufflePosition] ?? 0;
    }

    return (currentIndex + 1) % trackCount;
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

  /** Check if the active deck is actually playing (reads engine first, falls back to store). */
  private isActiveDeckPlaying(store: ReturnType<typeof useDJStore.getState>): boolean {
    try {
      return getDJEngine().getDeck(this.activeDeck).isPlaying();
    } catch {
      return store.decks[this.activeDeck].isPlaying;
    }
  }
}
