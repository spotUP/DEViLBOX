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
  beatMatchedTransition, setTrackedFilterPosition,
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
const SKIP_TRANSITION_BARS = 4;


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
  private shufflePosition = 0;
  // Stale position detection — if timeRemaining doesn't change for too long, force preload
  private lastTimeRemaining = Infinity;
  private staleCount = 0;
  // Network-down backoff — exponential delay between retry attempts
  private preloadFailCount = 0;
  private lastPreloadFailTime = 0;


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
    const modlandCount = playlist.tracks.filter(t => t.fileName.startsWith('modland:')).length;
    if (modlandCount < 2) {
      console.warn('[AutoDJ] Need at least 2 downloadable (modland) tracks — have:', modlandCount);
      return `Need at least 2 downloadable tracks (have ${modlandCount} — add tracks from Modland browser)`;
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

    const currentIndex = startIndex ?? 0;
    const nextIndex = this.computeNextIndex(currentIndex, playlist.tracks.length);

    // Set crossfader to the active deck's side so the correct audio plays
    const crossfaderTarget = this.activeDeck === 'A' ? 0 : 1;
    try { getDJEngine().setCrossfader(crossfaderTarget); } catch { /* engine not ready */ }
    store.setCrossfader(crossfaderTarget);

    store.setAutoDJEnabled(true);
    store.setAutoDJStatus('playing');
    store.setAutoDJTrackIndices(currentIndex, nextIndex);

    // Apply playlist's saved master FX if present
    if (playlist.masterEffects && playlist.masterEffects.length > 0) {
      console.log(`[AutoDJ] Applying playlist master FX (${playlist.masterEffects.length} effects)`);
      useAudioStore.getState().setMasterEffects(playlist.masterEffects);
    }

    // If shuffle, generate shuffle order
    if (store.autoDJShuffle) {
      this.generateShuffleOrder(playlist.tracks.length, currentIndex);
    }

    // If nothing is playing, find the first loadable track and play it
    if (!store.decks[this.activeDeck].isPlaying) {
      console.log(`[AutoDJ] No deck playing, loading first track to deck ${this.activeDeck}...`);
      let idx = currentIndex;
      let loaded = false;

      for (let attempts = 0; attempts < playlist.tracks.length; attempts++) {
        const track = playlist.tracks[idx];
        if (track) {
          console.log(`[AutoDJ] Trying track ${idx}: "${track.trackName}" (${track.fileName.substring(0, 60)}...)`);
          loaded = await loadPlaylistTrackToDeck(track, this.activeDeck);
          if (loaded) {
            const nextIdx = this.computeNextIndex(idx, playlist.tracks.length);
            useDJStore.getState().setAutoDJTrackIndices(idx, nextIdx);
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
        if (idx === currentIndex) break; // Wrapped around — no loadable tracks
      }

      if (!loaded) {
        console.warn('[AutoDJ] No loadable tracks found in playlist');
        this.disable();
        return 'Could not load any tracks from playlist — check network connection';
      }
    }

    this.preloading = false;
    this.preloadedDeck = null;
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

    const track = playlist.tracks[index];
    store.setAutoDJStatus('preloading');
    store.setAutoDJTrackIndices(index, (index + 1) % playlist.tracks.length);

    const loaded = await loadPlaylistTrackToDeck(track, this.idleDeck);
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
      const playlist = this.getActivePlaylist();
      if (!playlist) return;

      const nextIdx = store.autoDJNextTrackIndex;
      const track = playlist.tracks[nextIdx];
      if (!track) return;

      store.setAutoDJStatus('preloading');

      const loaded = await loadPlaylistTrackToDeck(track, this.idleDeck);

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

    // Debug log every 10th poll (~5s)
    if (this.pollCount % 10 === 0) {
      const cf = store.crossfaderPosition.toFixed(2);
      const aPlay = store.decks.A.isPlaying;
      const bPlay = store.decks.B.isPlaying;
      const aFile = store.decks.A.fileName?.split('/').pop() ?? 'empty';
      const bFile = store.decks.B.fileName?.split('/').pop() ?? 'empty';
      console.log(`[AutoDJ poll #${this.pollCount}] status=${status} active=${this.activeDeck} idle=${this.idleDeck} cf=${cf} timeLeft=${timeRemaining.toFixed(1)}s A:[${aPlay ? 'PLAY' : 'stop'}]${aFile} B:[${bPlay ? 'PLAY' : 'stop'}]${bFile} preloaded=${this.preloadedDeck ?? 'none'} preloading=${this.preloading} staleCount=${this.staleCount}`);
    }

    switch (status) {
      case 'playing': {
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
        // Check if it's time to start the transition
        const transitionDuration = this.getTransitionDurationSec();
        if (this.pollCount % 4 === 0) {
          console.log(`[AutoDJ transition-pending] timeLeft=${timeRemaining.toFixed(1)}s, transitionDur=${transitionDuration.toFixed(1)}s, preloadedDeck=${this.preloadedDeck}`);
        }
        if (timeRemaining <= transitionDuration) {
          console.log(`[AutoDJ] Triggering transition: timeLeft=${timeRemaining.toFixed(1)}s <= transitionDur=${transitionDuration.toFixed(1)}s`);
          this.triggerTransition(store.autoDJTransitionBars);
        }
        break;
      }

      case 'transitioning': {
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
        const crossfaderDone = this.idleDeck === 'B' ? crossfader >= 0.98
          : this.idleDeck === 'A' ? crossfader <= 0.02 : false;

        if (this.pollCount % 4 === 0) {
          const incomingPlaying = store.decks[this.idleDeck].isPlaying;
          console.log(`[AutoDJ transition] outgoing=${this.activeDeck}:${outgoingPlaying} incoming=${this.idleDeck}:${incomingPlaying} cf=${crossfader.toFixed(2)} cfDone=${crossfaderDone}`);
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
        // Exponential backoff: 5s, 10s, 20s, 40s… capped at 60s
        const backoffMs = Math.min(60_000, 5_000 * Math.pow(2, this.preloadFailCount - 1));
        const elapsed = Date.now() - this.lastPreloadFailTime;
        if (this.pollCount % 4 === 0) {
          console.log(`[AutoDJ preload-failed] failCount=${this.preloadFailCount}, backoffMs=${backoffMs}, elapsed=${elapsed}ms, waiting=${elapsed < backoffMs}`);
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

    const store = useDJStore.getState();
    const playlist = this.getActivePlaylist();
    if (!playlist) {
      console.warn('[AutoDJ] preloadNextTrack() no playlist — aborting');
      this.preloading = false;
      return;
    }

    store.setAutoDJStatus('preloading');
    let nextIdx = store.autoDJNextTrackIndex;
    let attempts = 0;
    let consecutiveNetworkFailures = 0;

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
        const { preRenderTrack } = await import('./DJTrackLoader');
        const preRendered = await preRenderTrack(track);
        
        if (preRendered) {
          // Success - save pre-rendered data for instant loading during transition
          this.preRenderedTrack = { track, data: preRendered };
          this.preloadedDeck = this.idleDeck;
          this.preloadFailCount = 0;

          useDJStore.getState().setAutoDJTrackIndices(
            useDJStore.getState().autoDJCurrentTrackIndex,
            nextIdx,
          );
          useDJStore.getState().setAutoDJStatus('transition-pending');
          console.log(`[AutoDJ] Preload SUCCESS → deck ${this.idleDeck}, status=transition-pending`);
          this.preloading = false;
          return;
        } else {
          console.warn(`[AutoDJ] loadPlaylistTrackToDeck returned false for ${track.fileName}`);
        }
      } catch (err) {
        console.error(`[AutoDJ] Preload exception for ${track.fileName}:`, err);
      }

      // Detect network-down vs bad-track: "Failed to fetch" means the server is unreachable
      const isNetworkError = !navigator.onLine || await this.isServerUnreachable();
      console.log(`[AutoDJ] Track load failed - network error: ${isNetworkError}, consecutiveNetworkFailures: ${consecutiveNetworkFailures}`);
      if (isNetworkError) {
        consecutiveNetworkFailures++;
        if (consecutiveNetworkFailures >= MAX_CONSECUTIVE_NETWORK_FAILURES) {
          console.error(`[AutoDJ] Server unreachable — stopping preload after ${consecutiveNetworkFailures} consecutive network failures`);
          this.preloadFailCount++;
          this.lastPreloadFailTime = Date.now();
          useDJStore.getState().setAutoDJStatus('preload-failed');
          this.preloading = false;
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
    this.preloading = false;
  }

  // ── Private: Transition ──────────────────────────────────────────────────

  private async triggerTransition(_userBars: number): Promise<void> {
    const store = useDJStore.getState();
    if (!this.preloadedDeck) return;

    // Load pre-rendered track instantly if available (background render complete)
    if (this.preRenderedTrack) {
      console.log(`[AutoDJ] Loading pre-rendered track to deck ${this.idleDeck}: ${this.preRenderedTrack.track.trackName}`);
      const { loadPreRenderedTrackToDeck } = await import('./DJTrackLoader');
      const loaded = await loadPreRenderedTrackToDeck(
        this.preRenderedTrack.data,
        this.preRenderedTrack.track,
        this.idleDeck,
      );
      if (!loaded) {
        console.error('[AutoDJ] Failed to load pre-rendered track — aborting transition');
        this.preRenderedTrack = null;
        this.preloadedDeck = null;
        useDJStore.getState().setAutoDJStatus('preload-failed');
        return;
      }
      this.preRenderedTrack = null; // Clear after use
    }

    const outState = store.decks[this.activeDeck];
    const inState = store.decks[this.idleDeck];

    // Smart transition type selection
    const transType = this.selectTransitionType(outState, inState);

    // Smart transition duration
    const bars = this.getSmartTransitionBars(outState, inState, transType);

    // Mark incoming deck as playing in the store
    store.setDeckPlaying(this.idleDeck, true);
    store.setAutoDJStatus('transitioning');

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

  /**
   * Smart transition duration based on context.
   */
  private getSmartTransitionBars(
    outgoing: { effectiveBPM: number; energy?: number },
    incoming: { effectiveBPM: number; energy?: number },
    transType: TransitionType,
  ): number {
    // Cuts are instant
    if (transType === 'cut') return 1;
    // Echo out is short
    if (transType === 'echo-out') return 4;

    const bpmDiff = Math.abs((outgoing.effectiveBPM || 125) - (incoming.effectiveBPM || 125));
    const energyJump = Math.abs((outgoing.energy ?? 0.5) - (incoming.energy ?? 0.5));

    // Close BPM + high energy = short punchy
    if (bpmDiff < 3 && (outgoing.energy ?? 0.5) > 0.6) return 4;
    // Big BPM gap = longer blend to mask the difference
    if (bpmDiff > 10) return 32;
    // Big energy jump = medium to smooth it
    if (energyJump > 0.3) return 16;
    // Default
    return 8;
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
      setTrackedFilterPosition(this.activeDeck, 0);
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
        if (this.pollCount % 20 === 0) {
          console.log(`[AutoDJ getTimeRemaining] deck=${this.activeDeck} mode=audio pos=${pos.toFixed(2)}s dur=${dur.toFixed(2)}s remaining=${(dur - pos).toFixed(2)}s`);
        }
        if (dur > 0) return dur - pos;
      } else {
        const replayer = deck.replayer;
        const elapsedMs = replayer.getElapsedMs();
        const state = useDJStore.getState().decks[this.activeDeck];
        if (this.pollCount % 20 === 0) {
          console.log(`[AutoDJ getTimeRemaining] deck=${this.activeDeck} mode=tracker elapsedMs=${elapsedMs} durationMs=${state.durationMs} remaining=${((state.durationMs - elapsedMs) / 1000).toFixed(2)}s`);
        }
        if (state.durationMs > 0) return (state.durationMs - elapsedMs) / 1000;
      }
    } catch (err) {
      // Engine not ready — fall back to store
      if (this.pollCount % 20 === 0) {
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
      // Use shuffle order
      this.shufflePosition++;
      if (this.shufflePosition >= this.shuffleOrder.length) {
        this.generateShuffleOrder(trackCount, currentIndex);
      }
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
    this.shufflePosition = 0;
  }
}
