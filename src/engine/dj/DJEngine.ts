/**
 * DJEngine - Top-level orchestrator for DJ mode
 *
 * Creates 2 DeckEngines + DJMixerEngine and wires them together.
 * This is the main entry point for all DJ audio operations.
 */

import * as Tone from 'tone';
import { DeckEngine, type DeckId } from './DeckEngine';
import { DJMixerEngine, type CrossfaderCurve } from './DJMixerEngine';
import { DJCueEngine } from './DJCueEngine';
import { useDJStore } from '@/stores/useDJStore';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { AudioFileInfo } from './DeckAudioPlayer';
import type { DJSetRecorder } from './recording/DJSetRecorder';
import type { TrackSource } from './recording/DJSetEvent';
import { DJMicEngine } from './DJMicEngine';

// Instrument ID offsets to avoid collisions with the tracker view (IDs 1-999)
// and between decks. Each deck gets a 10000-wide namespace.
const DECK_ID_OFFSETS: Record<DeckId, number> = { A: 10000, B: 20000, C: 30000 };

export class DJEngine {
  readonly deckA: DeckEngine;
  readonly deckB: DeckEngine;
  readonly deckC: DeckEngine;
  readonly mixer: DJMixerEngine;
  readonly cueEngine: DJCueEngine;

  private disposed = false;
  private _visibilityHandler: (() => void) | null = null;

  /** Active set recorder (null when not recording) */
  recorder: DJSetRecorder | null = null;

  /** Track source for the next loadToDeck/loadAudioToDeck call (set by UI before load) */
  private _pendingTrackSource: TrackSource | null = null;

  /** Microphone engine (lazy-init on first toggleMic) */
  mic: DJMicEngine | null = null;

  /** Set the track source for the next load operation (called by UI/browser before loading) */
  setTrackSource(source: TrackSource): void {
    this._pendingTrackSource = source;
  }

  /** Toggle microphone on/off. Lazy-initializes on first call. */
  async toggleMic(): Promise<boolean> {
    if (!this.mic) {
      if (!DJMicEngine.isSupported()) return false;
      this.mic = new DJMicEngine(this.mixer.samplerInput);
    }
    if (this.mic.isActive) {
      this.mic.stop();
      return false;
    } else {
      await this.mic.start();
      return true;
    }
  }

  constructor() {
    // Create cue engine for headphone monitoring
    this.cueEngine = new DJCueEngine();

    // Create mixer first (provides the input nodes for decks)
    this.mixer = new DJMixerEngine();

    // Wire cue engine to mixer
    this.mixer.setCueEngine(this.cueEngine);

    // Tap master output into cue engine for cue mix (PFL ↔ master blend)
    this.mixer.getMasterGain().connect(this.cueEngine.getMasterTap());

    // Create decks connected to mixer inputs
    this.deckA = new DeckEngine({ id: 'A', outputNode: this.mixer.inputA });
    this.deckB = new DeckEngine({ id: 'B', outputNode: this.mixer.inputB });
    this.deckC = new DeckEngine({ id: 'C', outputNode: this.mixer.inputC });

    // Initialize cue engine (async, but non-blocking)
    void this.cueEngine.init().catch(err => {
      console.warn('[DJEngine] Cue engine init failed:', err);
    });

    // Tab visibility handler — resume AudioContext when user returns to tab
    // (audio worklets keep running in background, but AudioContext may suspend)
    this._visibilityHandler = () => {
      if (document.hidden) {
        console.log('[DJ] tab backgrounded');
      } else {
        if (Tone.context.state === 'suspended') {
          Tone.start().catch(() => {});
        }
        console.log('[DJ] tab restored, AudioContext:', Tone.context.state);
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  // ==========================================================================
  // DECK ACCESS
  // ==========================================================================

  getDeck(id: DeckId): DeckEngine {
    switch (id) {
      case 'A': return this.deckA;
      case 'B': return this.deckB;
      case 'C': return this.deckC;
    }
  }

  // ==========================================================================
  // LOAD
  // ==========================================================================

  async loadToDeck(id: DeckId, song: TrackerSong, filename: string, bpm: number): Promise<void> {
    // Remap instrument IDs to a deck-specific range so they don't collide
    // with the main tracker view or the other deck's instruments.
    const offset = DECK_ID_OFFSETS[id];
    this.remapInstrumentIds(song, offset);

    const deck = this.getDeck(id);
    await deck.loadSong(song);

    // Record track load event
    if (this.recorder?.isRecording) {
      const source = this._pendingTrackSource ?? { type: 'local' as const, fileName: filename };
      this.recorder.recordTrackLoad(id, source, filename, song.name || filename, bpm);
      this._pendingTrackSource = null;
    }

    // Update store state
    useDJStore.getState().setDeckState(id, {
      fileName: filename,
      trackName: song.name || filename,
      detectedBPM: bpm,
      effectiveBPM: bpm,
      playbackMode: 'tracker',
      durationMs: 0,
      waveformPeaks: null,
      totalPositions: song.songLength,
      songPos: 0,
      pattPos: 0,
      elapsedMs: 0,
    });
  }

  /**
   * Shift all instrument IDs in a song by a fixed offset.
   * Mutates the song in-place (instruments array, pattern cells, channel instrumentId).
   */
  private remapInstrumentIds(song: TrackerSong, offset: number): void {
    // Remap instrument config IDs
    for (const inst of song.instruments) {
      inst.id = inst.id + offset;
    }

    // Remap ALL pattern cell instrument references by adding the offset directly.
    // This handles instruments that exist in pattern data but not in song.instruments
    // (e.g. empty MOD instrument slots 25-31 that have no samples).
    for (const pattern of song.patterns) {
      for (const channel of pattern.channels) {
        if (channel.instrumentId && channel.instrumentId > 0) {
          channel.instrumentId = channel.instrumentId + offset;
        }
        for (const cell of channel.rows) {
          if (cell.instrument && cell.instrument > 0) {
            cell.instrument = cell.instrument + offset;
          }
        }
      }
    }
  }

  /**
   * Load an audio file (MP3, WAV, FLAC, etc.) to a deck.
   * Switches the deck to audio playback mode.
   */
  async loadAudioToDeck(id: DeckId, buffer: ArrayBuffer, filename: string, trackName?: string, bpm?: number, song?: TrackerSong): Promise<AudioFileInfo> {
    console.log(`[DJEngine] loadAudioToDeck: ${filename}, buffer size: ${buffer.byteLength} bytes`);
    const deck = this.getDeck(id);

    // If we have a TrackerSong, load it into the replayer for visual data (pattern display)
    // but use audio mode for actual playback
    if (song) {
      const offset = DECK_ID_OFFSETS[id];
      this.remapInstrumentIds(song, offset);
      await deck.loadSong(song);
    }

    const info = await deck.loadAudioFile(buffer, filename);
    console.log(`[DJEngine] loadAudioFile returned: duration=${info.duration.toFixed(2)}s, sampleRate=${info.sampleRate}, channels=${info.numberOfChannels}`);

    // Record track load event
    if (this.recorder?.isRecording) {
      const source = this._pendingTrackSource ?? { type: 'local' as const, fileName: filename };
      this.recorder.recordTrackLoad(id, source, filename, trackName || filename, bpm || 125);
      this._pendingTrackSource = null;
    }

    // Update store state
    useDJStore.getState().setDeckState(id, {
      fileName: filename,
      trackName: trackName || filename,
      detectedBPM: bpm || 125,
      effectiveBPM: bpm || 125,
      playbackMode: 'audio',
      durationMs: info.duration * 1000,
      waveformPeaks: info.waveformPeaks,
      audioPosition: 0,
      elapsedMs: 0,
      ...(song ? { totalPositions: song.songLength, songPos: 0, pattPos: 0 } : {}),
    });

    return info;
  }

  // ==========================================================================
  // CROSSFADER SHORTCUTS
  // ==========================================================================

  setCrossfader(position: number): void {
    this.mixer.setCrossfader(position);
  }

  setCrossfaderCurve(curve: CrossfaderCurve): void {
    this.mixer.setCurve(curve);
  }

  // ==========================================================================
  // KILL ALL — Emergency stop
  // ==========================================================================

  killAll(): void {
    this.deckA.stop();
    this.deckB.stop();
    this.deckC.stop();
    this.mixer.setCrossfader(0.5);
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    this.deckA.dispose();
    this.deckB.dispose();
    this.deckC.dispose();
    this.mixer.dispose();
    this.cueEngine.dispose();
  }
}

// ============================================================================
// SINGLETON (separate from TrackerReplayer singleton)
// ============================================================================

let djEngineInstance: DJEngine | null = null;

export function getDJEngine(): DJEngine {
  if (!djEngineInstance) {
    djEngineInstance = new DJEngine();
  }
  return djEngineInstance;
}

/** Returns the existing DJEngine instance or null (does NOT create one). */
export function getDJEngineIfActive(): DJEngine | null {
  return djEngineInstance;
}

export function disposeDJEngine(): void {
  if (djEngineInstance) {
    djEngineInstance.dispose();
    djEngineInstance = null;
  }
}
