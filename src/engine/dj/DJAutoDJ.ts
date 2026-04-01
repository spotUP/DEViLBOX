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
import type { DeckId } from './DeckEngine';
import { getDJEngine } from './DJEngine';
import { beatMatchedTransition, setTrackedFilterPosition } from './DJQuantizedFX';
import { loadPlaylistTrackToDeck } from './DJTrackLoader';

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 500;
const PRELOAD_LEAD_TIME_SEC = 60;
const MAX_SKIP_ATTEMPTS = 3;
const SKIP_TRANSITION_BARS = 4;

/** Crossfader deviation threshold above which user intervention is assumed. */
const CROSSFADER_INTERVENTION_THRESHOLD = 0.08;

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

  // Manual intervention detection
  private crossfaderUnsubscribe: (() => void) | null = null;
  private deckFileUnsubscribe: (() => void) | null = null;
  private transitionStart = { crossfader: 0, target: 1, time: 0, durationMs: 0 };
  private loadingActive = false; // true while Auto DJ is loading to idle deck

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Enable Auto DJ mode. Starts playing through the active playlist.
   * If a deck is already playing, uses that as the starting point.
   */
  async enable(startIndex?: number): Promise<void> {
    const playlist = this.getActivePlaylist();
    if (!playlist || playlist.tracks.length < 2) {
      console.warn('[AutoDJ] Need at least 2 tracks in a playlist');
      return;
    }

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

    // If shuffle, generate shuffle order
    if (store.autoDJShuffle) {
      this.generateShuffleOrder(playlist.tracks.length, currentIndex);
    }

    // If nothing is playing, find the first loadable track and play it
    if (!store.decks[this.activeDeck].isPlaying) {
      let idx = currentIndex;
      let loaded = false;
      this.loadingActive = true;
      for (let attempts = 0; attempts < playlist.tracks.length; attempts++) {
        const track = playlist.tracks[idx];
        if (track) {
          loaded = await loadPlaylistTrackToDeck(track, this.activeDeck);
          if (loaded) {
            const nextIdx = this.computeNextIndex(idx, playlist.tracks.length);
            useDJStore.getState().setAutoDJTrackIndices(idx, nextIdx);
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
      this.loadingActive = false;
      if (!loaded) {
        console.warn('[AutoDJ] No loadable tracks found in playlist');
        this.disable();
        return;
      }
    }

    this.preloading = false;
    this.preloadedDeck = null;
    this.startPolling();
    this.startInterventionWatch();
    const finalIdx = useDJStore.getState().autoDJCurrentTrackIndex;
    console.log(`[AutoDJ] Enabled — starting from track ${finalIdx + 1}/${playlist.tracks.length}`);
  }

  /** Disable Auto DJ gracefully. Current track keeps playing. */
  disable(): void {
    this.stopPolling();
    this.stopInterventionWatch();
    this.cancelTransition();
    this.preloading = false;
    this.preloadedDeck = null;
    this.loadingActive = false;

    const store = useDJStore.getState();
    store.setAutoDJEnabled(false);
    store.setAutoDJStatus('idle');
    console.log('[AutoDJ] Disabled');
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
      this.loadingActive = true;
      const loaded = await loadPlaylistTrackToDeck(track, this.idleDeck);
      this.loadingActive = false;
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

  private pollLoop(): void {
    const store = useDJStore.getState();
    if (!store.autoDJEnabled) {
      this.stopPolling();
      return;
    }

    const status = store.autoDJStatus;
    const timeRemaining = this.getTimeRemaining();

    switch (status) {
      case 'playing': {
        // Check if it's time to preload (or always preload if duration unknown)
        const shouldPreload = timeRemaining < PRELOAD_LEAD_TIME_SEC || timeRemaining === Infinity;
        if (shouldPreload && !this.preloading && !this.preloadedDeck) {
          this.preloadNextTrack();
        }
        break;
      }

      case 'transition-pending': {
        // Check if it's time to start the transition
        const transitionDuration = this.getTransitionDurationSec();
        if (timeRemaining <= transitionDuration) {
          this.triggerTransition(store.autoDJTransitionBars);
        }
        break;
      }

      case 'transitioning': {
        // Check if the outgoing deck has stopped (transition complete)
        const outgoingPlaying = store.decks[this.activeDeck].isPlaying;
        const incomingPlaying = store.decks[this.idleDeck].isPlaying;

        // Transition is done when incoming is playing and outgoing has stopped
        // OR when the crossfader has fully moved to the incoming side
        const crossfader = store.crossfaderPosition;
        const crossfaderDone = this.idleDeck === 'B' ? crossfader >= 0.98
          : this.idleDeck === 'A' ? crossfader <= 0.02 : false;

        if (incomingPlaying && (!outgoingPlaying || crossfaderDone)) {
          this.completeTransition();
        }
        break;
      }

      case 'preloading':
        // Waiting for preload — handled by preloadNextTrack callback
        break;

      case 'preload-failed':
        // Retry preload — previous attempt failed, try again
        this.preloading = false;
        this.preloadedDeck = null;
        store.setAutoDJStatus('playing');
        break;

      case 'idle':
        this.stopPolling();
        break;
    }
  }

  // ── Private: Preloading ──────────────────────────────────────────────────

  private async preloadNextTrack(): Promise<void> {
    if (this.preloading) return;
    this.preloading = true;

    const store = useDJStore.getState();
    const playlist = this.getActivePlaylist();
    if (!playlist) {
      this.preloading = false;
      return;
    }

    store.setAutoDJStatus('preloading');
    let nextIdx = store.autoDJNextTrackIndex;
    let attempts = 0;

    this.loadingActive = true;
    while (attempts < MAX_SKIP_ATTEMPTS) {
      const track = playlist.tracks[nextIdx];
      if (!track) {
        // End of playlist — loop back
        nextIdx = 0;
        if (attempts > 0) break;
        attempts++;
        continue;
      }

      console.log(`[AutoDJ] Preloading track ${nextIdx + 1}/${playlist.tracks.length}: ${track.trackName}`);

      try {
        const loaded = await loadPlaylistTrackToDeck(track, this.idleDeck);
        if (loaded) {
          this.preloadedDeck = this.idleDeck;
          this.loadingActive = false;
          useDJStore.getState().setAutoDJTrackIndices(
            useDJStore.getState().autoDJCurrentTrackIndex,
            nextIdx,
          );
          useDJStore.getState().setAutoDJStatus('transition-pending');
          this.preloading = false;
          return;
        }
      } catch (err) {
        console.error(`[AutoDJ] Preload failed for ${track.fileName}:`, err);
      }

      // Track couldn't be loaded — skip to next
      attempts++;
      nextIdx = this.computeNextIndex(nextIdx, playlist.tracks.length);
      console.warn(`[AutoDJ] Skipping unloadable track, trying index ${nextIdx}`);
    }

    // All attempts failed
    console.error('[AutoDJ] Failed to preload any track after', MAX_SKIP_ATTEMPTS, 'attempts');
    useDJStore.getState().setAutoDJStatus('preload-failed');
    this.preloading = false;
    this.loadingActive = false;
  }

  // ── Private: Transition ──────────────────────────────────────────────────

  private triggerTransition(bars: number): void {
    const store = useDJStore.getState();
    if (!this.preloadedDeck) return;

    // Record transition timeline for intervention detection
    const crossfaderStart = store.crossfaderPosition;
    const crossfaderTarget = this.idleDeck === 'B' ? 1 : 0;
    const durationMs = this.getTransitionDurationSec() * 1000;
    this.transitionStart = {
      crossfader: crossfaderStart,
      target: crossfaderTarget,
      time: performance.now(),
      durationMs,
    };

    store.setAutoDJStatus('transitioning');
    console.log(`[AutoDJ] Starting ${bars}-bar transition: ${this.activeDeck} → ${this.idleDeck}`);

    this.transitionCancel = beatMatchedTransition(
      this.activeDeck,
      this.idleDeck,
      bars,
      store.autoDJWithFilter,
    );
  }

  private cancelTransition(): void {
    if (this.transitionCancel) {
      this.transitionCancel();
      this.transitionCancel = null;
    }
  }

  private completeTransition(): void {
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

    // Restart deck-file watch so it tracks the new active deck
    this.startInterventionWatch();

    console.log(`[AutoDJ] Transition complete — now playing track ${newCurrentIdx + 1}/${trackCount}`);
  }

  // ── Private: Intervention detection ─────────────────────────────────────

  private startInterventionWatch(): void {
    this.stopInterventionWatch();

    // 1. Watch crossfader — detect user grab during active transition
    this.crossfaderUnsubscribe = useDJStore.subscribe(
      s => s.crossfaderPosition,
      (current) => {
        const store = useDJStore.getState();
        if (!store.autoDJEnabled || store.autoDJStatus !== 'transitioning') return;

        // Compute where the crossfader should be right now based on linear interpolation
        const elapsed = performance.now() - this.transitionStart.time;
        const progress = Math.min(1, elapsed / Math.max(1, this.transitionStart.durationMs));
        const expected = this.transitionStart.crossfader +
          (this.transitionStart.target - this.transitionStart.crossfader) * progress;

        const deviation = Math.abs(current - expected);
        if (deviation > CROSSFADER_INTERVENTION_THRESHOLD) {
          console.log(`[AutoDJ] Manual crossfader intervention detected (deviation ${deviation.toFixed(2)}) — disabling`);
          this.disable();
        }
      },
    );

    // 2. Watch active deck's loaded track — detect user manually loading a track
    this.deckFileUnsubscribe = useDJStore.subscribe(
      s => s.decks[this.activeDeck].fileName,
      (_current) => {
        // Only flag as intervention if Auto DJ isn't the one loading
        if (this.loadingActive) return;
        const store = useDJStore.getState();
        if (!store.autoDJEnabled) return;
        console.log(`[AutoDJ] Manual track load on active deck ${this.activeDeck} — disabling`);
        this.disable();
      },
    );
  }

  private stopInterventionWatch(): void {
    if (this.crossfaderUnsubscribe) {
      this.crossfaderUnsubscribe();
      this.crossfaderUnsubscribe = null;
    }
    if (this.deckFileUnsubscribe) {
      this.deckFileUnsubscribe();
      this.deckFileUnsubscribe = null;
    }
  }

  // ── Private: Helpers ─────────────────────────────────────────────────────

  private getActivePlaylist() {
    const playlistStore = useDJPlaylistStore.getState();
    if (!playlistStore.activePlaylistId) return null;
    return playlistStore.playlists.find(p => p.id === playlistStore.activePlaylistId) ?? null;
  }

  private getTimeRemaining(): number {
    const state = useDJStore.getState().decks[this.activeDeck];
    if (state.playbackMode === 'audio' && state.durationMs > 0) {
      return (state.durationMs / 1000) - state.audioPosition;
    }
    // For tracker mode, use elapsed vs estimated duration
    if (state.durationMs > 0) {
      return (state.durationMs - state.elapsedMs) / 1000;
    }
    return Infinity; // Unknown duration
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
