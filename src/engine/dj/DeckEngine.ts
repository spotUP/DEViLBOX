/**
 * DeckEngine - One DJ deck: owns a TrackerReplayer + audio chain
 *
 * Audio chain: TrackerReplayer.masterGain → deckGain → EQ3 → filter → channelGain → output
 *
 * The output node is provided by the DJMixerEngine (crossfader input).
 */

import * as Tone from 'tone';
import { TrackerReplayer, type TrackerSong } from '@/engine/TrackerReplayer';
import { getToneEngine } from '@/engine/ToneEngine';
import { getNativeAudioNode } from '@/utils/audio-context';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useDJStore } from '@/stores/useDJStore';
import { ScratchPlayback, getPatternByName } from './DJScratchEngine';
import { DeckScratchBuffer } from './DeckScratchBuffer';
import { DeckAudioPlayer, type AudioFileInfo } from './DeckAudioPlayer';

export type PlaybackMode = 'tracker' | 'audio';

// Monkey-patch Tone.Player._onSourceEnd to suppress StateTimeline assertion errors.
// When scratch patterns change playback rates dramatically, sample buffers can end at
// times that violate Tone.js's chronological ordering requirement. The assertion is
// purely bookkeeping — swallowing it has no functional impact on audio output.
const _origOnSourceEnd = (Tone.Player.prototype as any)._onSourceEnd;
if (_origOnSourceEnd && !(Tone.Player.prototype as any).__scratchPatched) {
  (Tone.Player.prototype as any).__scratchPatched = true;
  (Tone.Player.prototype as any)._onSourceEnd = function (...args: any[]) {
    try { return _origOnSourceEnd.apply(this, args); } catch { /* suppress */ }
  };
}

type FaderLFODivision = '1/4' | '1/8' | '1/16' | '1/32';

export type DeckId = 'A' | 'B' | 'C';

export interface DeckEngineOptions {
  id: DeckId;
  outputNode: Tone.ToneAudioNode;
}

export class DeckEngine {
  readonly id: DeckId;
  readonly replayer: TrackerReplayer;
  readonly audioPlayer: DeckAudioPlayer;
  private _playbackMode: PlaybackMode = 'tracker';

  // Audio chain nodes
  private deckGain: Tone.Gain;
  private eq3: Tone.EQ3;
  private filter: Tone.Filter;
  private pitchShift: Tone.PitchShift;  // For key lock (compensates pitch when tempo changes)
  readonly channelGain: Tone.Gain;

  // Meter for VU display
  readonly meter: Tone.Meter;

  // Waveform analyser for scope display
  readonly waveformAnalyser: Tone.Analyser;

  // FFT analyser for visualizer display
  readonly fftAnalyser: Tone.FFT;

  // Instrument IDs from the currently loaded song (for output override cleanup)
  private currentSongInstrumentIds: number[] = [];

  // Track which native engine keys this deck has rerouted (Furnace, UADE, Hively — for cleanup)
  private routedNativeEngines: Set<string> = new Set();

  // Scratch
  private scratchPlayback: ScratchPlayback;
  /**
   * The canonical "rest" multiplier — always tracks the pitch slider value.
   * Both jog-wheel release and pattern stop decay back to this.
   */
  private restMultiplier = 1;
  private isScratchActive = false;   // true while jog wheel is physically held
  private backwardPauseTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private decayRafId: number | null = null;

  // Pattern scratch state — when a scratch preset button is active, the tracker
  // plays live at scratch speed during forward phases (full audio quality) and
  // switches to ring-buffer reverse playback for backward phases.
  // On pattern end we seek back to the saved position.
  private patternScratchActive = false;
  private patternScratchDir: 1 | -1 = 1;  // current direction in pattern scratch
  private patternStartSongPos = 0;
  private patternStartPattPos = 0;

  // Reverse scratch state
  private scratchBuffer: DeckScratchBuffer | null = null;
  private scratchBufferReady = false;
  private scratchDirection = 1;          // 1 = forward, -1 = backward
  private backwardStartSongPos = 0;
  private backwardStartPattPos = 0;
  private backwardStartElapsedMs = 0;
  private songTimeIndex: number[] = [];

  // EQ kill state (stored separately from gain values)
  private eqKillState = { low: false, mid: false, high: false };
  private eqValues = { low: 0, mid: 0, high: 0 }; // dB values before kill

  // Filter state
  private filterPosition = 0;  // -1 (HPF) to 0 (off) to +1 (LPF)
  private filterResonance = 1; // Q value

  // Key lock state
  private keyLockEnabled = false;
  private currentPitchSemitones = 0;

  // Slip mode for audio playback + scratch
  private _slipEnabled = false;
  private slipGhostPosition = 0;       // Where the track "would be" if not scratching/looping
  private slipGhostStartTime = 0;      // performance.now() when ghost started
  private slipGhostRate = 1;           // playback rate for ghost advancement

  constructor(options: DeckEngineOptions) {
    this.id = options.id;

    // Create the audio chain nodes (order: replayer → deckGain → EQ3 → filter → pitchShift → channelGain → output)
    this.deckGain = new Tone.Gain(1);
    this.eq3 = new Tone.EQ3({ low: 0, mid: 0, high: 0 });
    this.filter = new Tone.Filter({ type: 'lowpass', frequency: 20000, Q: 1 });
    this.pitchShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.1, delayTime: 0 });
    this.channelGain = new Tone.Gain(1);
    this.meter = new Tone.Meter({ smoothing: 0.8 });
    this.waveformAnalyser = new Tone.Analyser('waveform', 256);
    this.fftAnalyser = new Tone.FFT(1024);

    // Wire: deckGain → EQ3 → filter → pitchShift → channelGain → [output + meter + analyser]
    this.deckGain.connect(this.eq3);
    this.eq3.connect(this.filter);
    this.filter.connect(this.pitchShift);
    this.pitchShift.connect(this.channelGain);
    this.channelGain.connect(options.outputNode);
    this.channelGain.connect(this.meter);
    this.channelGain.connect(this.waveformAnalyser);
    this.channelGain.connect(this.fftAnalyser);

    // Create TrackerReplayer connected to our deckGain input
    this.replayer = new TrackerReplayer(this.deckGain);
    this.replayer.setMuted(true); // Silent by default in DJ mode

    // Create AudioPlayer for audio file playback (MP3/WAV/FLAC etc.)
    this.audioPlayer = new DeckAudioPlayer(this.deckGain);

    // Create ScratchPlayback (per-deck scratch pattern + fader LFO engine)
    this.scratchPlayback = new ScratchPlayback(
      () => this,
      () => this.getEffectiveBPM(),
    );
    // When a pattern ends internally (pendingStop / non-loop), snap pitch/tempo to rest immediately.
    // Using _decayToRest (animated) here causes Tone.js StateTimeline errors because the gradual
    // rate ramp from 0.04x → 1.0x confuses sample buffer end-time tracking.
    this.scratchPlayback.onPatternEnd = () => {
      this._endPatternScratch();
      if (!this.isScratchActive) {
        if (this.decayRafId !== null) {
          cancelAnimationFrame(this.decayRafId);
          this.decayRafId = null;
        }
        this.replayer.setPitchMultiplier(this.restMultiplier);
        this.replayer.setTempoMultiplier(this.restMultiplier);
      }
    };

    // Wire TrackerReplayer scratch effect callback (Xnn pattern effect)
    this.replayer.onScratchEffect = (param: number) => this._handleScratchEffect(param);

    // Kick off async worklet init (non-blocking)
    void this._initScratchBuffer();
  }

  /**
   * Seamlessly transition from live tracker playback to a pre-rendered audio stream.
   * Maintains playback state, position, and pitch.
   */
  async hotSwapToAudio(wavData: ArrayBuffer, filename: string): Promise<void> {
    const wasPlaying = this.isPlaying();
    const positionSec = this.replayer.getElapsedMs() / 1000;
    const pitch = this.currentPitchSemitones;

    console.log(`[DeckEngine] Hot-swapping ${filename} from tracker to audio stream at ${positionSec.toFixed(2)}s`);

    // Load audio buffer (switches mode to 'audio' internally)
    const info = await this.loadAudioFile(wavData, filename);

    // Sync state
    this.setPitch(pitch);
    this.audioPlayer.seek(positionSec);

    // Update store state to reflect the new playback mode and data
    useDJStore.getState().setDeckState(this.id, {
      playbackMode: 'audio',
      durationMs: info.duration * 1000,
      waveformPeaks: info.waveformPeaks,
      audioPosition: positionSec,
      elapsedMs: positionSec * 1000,
    });

    if (wasPlaying) {
      // CRITICAL: Stop tracker BEFORE starting audio to prevent double audio / echo
      this.replayer.stop();
      this.audioPlayer.play();
    } else {
      this.replayer.stop();
    }

    // Clean up tracker-specific native routing
    this.restoreNativeRouting();
    this.unregisterOutputOverrides();
  }

  // ==========================================================================
  // SCRATCH BUFFER INIT (async, non-blocking)
  // ==========================================================================

  private async _initScratchBuffer(): Promise<void> {
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const bufferId = this.id === 'A' ? 0 : this.id === 'B' ? 1 : 2;
      this.scratchBuffer = new DeckScratchBuffer(ctx, bufferId);
      await this.scratchBuffer.init();
      this.scratchBuffer.wireIntoChain(this.filter, this.channelGain);
      this.scratchBufferReady = true;
    } catch (err) {
      console.warn('[DeckEngine] Scratch buffer init failed, reverse scratch disabled:', err);
    }
  }

  // ==========================================================================
  // TRANSPORT
  // ==========================================================================

  async loadSong(song: TrackerSong): Promise<void> {
    // Stop any audio file playback
    this.audioPlayer.stop();
    // In DJ view, we ALWAYS use audio mode for sound output.
    // Tracker replayer is only used for position tracking and visual feedback.
    this._playbackMode = 'audio';

    this.unregisterOutputOverrides();
    this.restoreNativeRouting();

    const engine = getToneEngine();

    // Register output overrides BEFORE preloadInstruments so effect chains
    // route through the deck's audio chain on first build
    this.currentSongInstrumentIds = song.instruments.map(inst => inst.id);
    for (const id of this.currentSongInstrumentIds) {
      engine.setInstrumentOutputOverride(id, this.deckGain);
    }

    this.replayer.loadSong(song);
    // Apply the user's stereo separation settings (loadSong sets format default;
    // these override it with the user's preferences, matching tracker view behavior)
    const settings = useSettingsStore.getState();
    this.replayer.setStereoSeparation(settings.stereoSeparation);
    this.replayer.setStereoSeparationMode(settings.stereoSeparationMode);
    this.replayer.setModplugSeparation(settings.modplugSeparation);

    // Apply Furnace compat flags to the dispatch engine (if this is a .fur song)
    if (song.compatFlags && Object.keys(song.compatFlags).length > 0) {
      const { FurnaceDispatchEngine } = await import('@engine/furnace-dispatch/FurnaceDispatchEngine');
      FurnaceDispatchEngine.getInstance().setCompatFlags(song.compatFlags as any);
    }

    this.songTimeIndex = this._buildTimeIndex(song);
    await engine.preloadInstruments(song.instruments);
    await engine.ensureWASMSynthsReady(song.instruments);

    // Reroute native singleton engine outputs into this deck's audio chain
    // so they go through the deck's EQ, filter, and crossfader.
    // Furnace → deckGain directly (no Amiga stereo separation needed).
    // UADE/Hively → replayer's separation chain → deckGain (applies stereo separation).
    const nativeDeckGain = getNativeAudioNode(this.deckGain as any);
    const nativeSeparationInput = getNativeAudioNode(this.replayer.getSeparationInput() as any);
    if (nativeDeckGain) {
      for (const inst of song.instruments) {
        const synthType = inst.synthType || '';
        if (synthType.startsWith('Furnace')) {
          engine.rerouteNativeEngine('FurnaceChipEngine', nativeDeckGain);
          engine.rerouteNativeEngine('FurnaceDispatchEngine', nativeDeckGain);
          this.routedNativeEngines.add('FurnaceChipEngine');
          this.routedNativeEngines.add('FurnaceDispatchEngine');
        } else if ((synthType === 'UADESynth' || synthType === 'HivelySynth') && nativeSeparationInput) {
          // Route through separation chain so Amiga hard-pan stereo mix setting applies
          engine.rerouteNativeEngine(synthType, nativeSeparationInput);
          this.routedNativeEngines.add(synthType);
        }
      }
    }
  }

  /**
   * Load an audio file (MP3, WAV, FLAC, etc.) for playback.
   * Switches the deck to 'audio' playback mode.
   */
  async loadAudioFile(buffer: ArrayBuffer, filename: string): Promise<AudioFileInfo> {
    // Stop any current playback
    this.replayer.stop();
    this.audioPlayer.stop();
    this._playbackMode = 'audio';

    return this.audioPlayer.loadAudioFile(buffer, filename);
  }

  get playbackMode(): PlaybackMode {
    return this._playbackMode;
  }

  async play(): Promise<void> {
    if (this._playbackMode === 'audio') {
      this.audioPlayer.play();
      // Start replayer for position tracking/visuals (it's connected to deckGain, but we can rely on audio mode being the master)
      if (this.replayer.getSong()) {
        await this.replayer.play();
      }
    } else {
      console.warn(`[DeckEngine] play() called while not in audio mode (current: ${this._playbackMode})`);
    }
  }

  pause(): void {
    this.audioPlayer.pause();
    this.replayer.pause();
  }

  resume(): void {
    if (this._playbackMode === 'audio') {
      this.audioPlayer.play();
      this.replayer.resume();
    }
  }

  stop(): void {
    this.audioPlayer.stop();
    this.replayer.stop();
  }

  isPlaying(): boolean {
    if (this._playbackMode === 'audio') {
      return this.audioPlayer.isCurrentlyPlaying();
    }
    return this.replayer.isPlaying();
  }

  // ==========================================================================
  // CUE / SEEK
  // ==========================================================================

  cue(songPos: number, pattPos: number = 0): void {
    if (this._playbackMode === 'audio') {
      // In audio mode, songPos is treated as seconds
      this.audioPlayer.seek(songPos);
    } else {
      this.replayer.jumpToPosition(songPos, pattPos);
    }
  }

  // ==========================================================================
  // PITCH / NUDGE
  // ==========================================================================

  /** Set pitch offset in semitones. Updates per-deck tempo and sample playback rates. */
  setPitch(semitones: number): void {
    const multiplier = Math.pow(2, semitones / 12);
    this.restMultiplier = multiplier;                // Always track — scratch/pattern restore target
    this.currentPitchSemitones = semitones;

    if (this._playbackMode === 'audio') {
      this.audioPlayer.setPlaybackRate(multiplier);
      // Ensure tracker is reset to normal speed if it's still somehow running
      this.replayer.setTempoMultiplier(1.0);
      this.replayer.setPitchMultiplier(1.0);
      this.replayer.setDetuneCents(0);
    } else {
      // Per-deck isolation: only touches this replayer's state, not ToneEngine globals
      this.replayer.setTempoMultiplier(multiplier);   // Changes scheduler speed
      this.replayer.setPitchMultiplier(multiplier);    // Changes sample playback rates
      this.replayer.setDetuneCents(semitones * 100);   // Changes synth pitch
      // Ensure audio player is reset
      this.audioPlayer.setPlaybackRate(1.0);
    }

    // Key lock: compensate pitch shift to maintain original key
    if (this.keyLockEnabled && Math.abs(semitones) > 0.01) {
      this.pitchShift.pitch = -semitones;
    } else if (!this.keyLockEnabled) {
      this.pitchShift.pitch = 0;
    }
  }

  /** Temporary BPM bump for beat matching */
  nudge(offset: number, ticks: number = 8): void {
    this.replayer.setNudge(offset, ticks);
  }

  /** Enable/disable key lock (master tempo). When on, pitch changes only affect tempo. */
  setKeyLock(enabled: boolean): void {
    this.keyLockEnabled = enabled;
    if (enabled && Math.abs(this.currentPitchSemitones) > 0.01) {
      // Apply compensating pitch shift
      this.pitchShift.pitch = -this.currentPitchSemitones;
    } else {
      // Disable pitch compensation
      this.pitchShift.pitch = 0;
    }
  }

  getKeyLock(): boolean {
    return this.keyLockEnabled;
  }

  // ==========================================================================
  // SCRATCH
  // ==========================================================================

  /**
   * Build a cumulative time index (ms) for each song position boundary.
   * Index[i] = time in ms when song position i starts.
   * Used to estimate seek position after a backward scratch.
   */
  private _buildTimeIndex(song: TrackerSong): number[] {
    const bpm   = song.initialBPM   ?? 125;
    const speed = song.initialSpeed ?? 6;
    const rowMs = (speed * 2.5 / bpm) * 1000;
    const times: number[] = [0];
    for (let i = 0; i < song.songLength; i++) {
      const patternIdx = song.songPositions[i];
      const pattern    = song.patterns[patternIdx];
      times.push(times[i]! + (pattern?.length ?? 64) * rowMs);
    }
    return times;
  }

  /** Returns effective BPM: replayer BPM × tempo multiplier */
  getEffectiveBPM(): number {
    return this.replayer.getBPM() * this.replayer.getTempoMultiplier();
  }

  /** Enter scratch mode — cancels any in-progress decay and marks jog wheel as active */
  startScratch(): void {
    if (this.isScratchActive) return;
    this.isScratchActive = true;
    // Cancel any in-progress restore animation so scratch takes full control
    if (this.decayRafId !== null) {
      cancelAnimationFrame(this.decayRafId);
      this.decayRafId = null;
    }
    this.scratchDirection = 1; // Reset for fresh scratch session
    // restMultiplier always tracks the pitch slider — no extra save needed

    // Slip mode: save position for snap-back when scratch ends
    if (this._slipEnabled && this._playbackMode === 'audio') {
      this.slipGhostPosition = this.audioPlayer.getPosition();
      this.slipGhostStartTime = performance.now();
      this.slipGhostRate = this.audioPlayer.getPlaybackRate();
    }
  }

  /**
   * Set scratch velocity — signed float, 1.0 = normal forward speed.
   * Positive = forward, negative = backward.
   * Clamps to [-4, 4].
   */
  setScratchVelocity(velocity: number): void {
    const v = Math.max(-4, Math.min(4, velocity));

    // Pattern scratch: forward phases use LIVE tracker audio (full quality),
    // backward phases use ring-buffer reverse playback.
    // Dead zone (±0.1) around zero prevents rapid direction switching during
    // smooth velocity interpolation zero-crossings.
    if (this.patternScratchActive) {
      const absV = Math.abs(v);

      if (absV < 0.1) {
        // Dead zone: hold current direction at minimum rate.
        // During interpolated zero-crossings the velocity passes smoothly through
        // this zone, so both the tracker and ring buffer are near-silent here.
        if (this.patternScratchDir === 1) {
          this.replayer.setTempoMultiplier(0.15);
          this.replayer.setPitchMultiplier(0.15);
        } else {
          this.scratchBuffer?.setRate(0.05);
        }
        return;
      }

      if (v > 0) {
        // ── FORWARD: live tracker audio at scratch speed ──
        const fwdRate = Math.max(0.15, v);
        if (this.patternScratchDir === -1) {
          // Transition backward → forward
          this.scratchBuffer?.silenceAndStop();
          this.scratchBuffer?.unfreezeCapture();
          this.deckGain.gain.rampTo(1, 0.005);
          this.patternScratchDir = 1;
        }
        this.replayer.setTempoMultiplier(fwdRate);
        this.replayer.setPitchMultiplier(fwdRate);
      } else {
        // ── BACKWARD: ring-buffer reverse playback ──
        if (this.patternScratchDir === 1) {
          // Transition forward → backward: freeze capture, mute tracker,
          // start ring buffer backward from the exact worklet write position.
          this.scratchBuffer?.freezeCapture();
          this.deckGain.gain.rampTo(0, 0.005);
          this.scratchBuffer?.startReverseFromWritePos(absV);
          this.replayer.setTempoMultiplier(0.001);
          this.replayer.setPitchMultiplier(0.001);
          this.patternScratchDir = -1;
        } else {
          this.scratchBuffer?.setRate(absV);
        }
      }
      return;
    }

    // Jog wheel scratch: full pitch + tempo control
    if (v >= 0) {
      // Floor at 0.15 — lower values cause Tone.js StateTimeline errors because
      // the huge rate ratio (e.g. 0.02→1.0 = 50×) confuses sample buffer end-time tracking.
      // 0.15 still sounds like a slow drag-back while keeping the ratio ≤ ~7×.
      if (this.scratchDirection === -1) {
        // Transitioning from backward → forward
        void this._switchToForward(Math.max(0.15, v));
      } else {
        const fwdRate = Math.max(0.15, v);
        this.replayer.setPitchMultiplier(fwdRate);
        this.replayer.setTempoMultiplier(fwdRate);
      }
    } else {
      if (this.scratchDirection !== -1) {
        // Transitioning from forward → backward
        this._switchToBackward(Math.abs(v));
      } else {
        // Already going backward — update rate
        this.scratchBuffer?.setRate(Math.abs(v));
      }
    }
  }

  /**
   * Exit scratch mode — smoothly decays pitch/tempo back to the pitch-slider value over decayMs.
   * If slip mode is active, snaps back to the ghost position.
   */
  stopScratch(decayMs = 200): void {
    if (!this.isScratchActive) return;
    this.isScratchActive = false;

    // Slip mode: snap back to ghost position
    this.slipSnapBack();

    if (this.scratchDirection === -1) {
      // End backward scratch, then decay to rest
      void this._switchToForward(1).then(() => this._decayToRest(decayMs));
    } else {
      this._decayToRest(decayMs);
    }
  }

  /** Switch from forward playback to backward (reverse scratch). */
  private _switchToBackward(rate: number): void {
    if (!this.scratchBufferReady || !this.scratchBuffer) {
      // Graceful fallback: clamp to near-stop forward
      this.replayer.setPitchMultiplier(0.02);
      this.replayer.setTempoMultiplier(0.02);
      return;
    }

    this.backwardStartSongPos   = this.replayer.getSongPos();
    this.backwardStartPattPos   = this.replayer.getPattPos();
    this.backwardStartElapsedMs = this.replayer.getElapsedMs();

    // Stop any running preset scratch pattern
    this.scratchPlayback.stopPattern();

    // Fade out forward chain (20ms)
    this.deckGain.gain.rampTo(0, 0.02);

    // Start reverse audio immediately
    this.scratchBuffer.startReverse(rate);

    this.scratchDirection = -1;

    // Pause replayer after fade so new note events are silent
    this.backwardPauseTimeoutId = setTimeout(() => {
      this.backwardPauseTimeoutId = null;
      if (this.scratchDirection === -1) this.replayer.pause();
    }, 25);
  }

  /** Switch from backward playback to forward, seeking replayer to estimated position. */
  private async _switchToForward(fwdRate: number): Promise<void> {
    this.scratchDirection = 1; // Mark early to prevent re-entry

    const framesBack = this.scratchBuffer
      ? await this.scratchBuffer.stopReverse()
      : 0;

    const ctx    = Tone.getContext().rawContext as AudioContext;
    const msBack = (framesBack / ctx.sampleRate) * 1000;
    const targetMs = Math.max(0, this.backwardStartElapsedMs - msBack);

    const song = this.replayer.getSong();
    if (song && this.songTimeIndex.length > 1) {
      // Binary search for the song position that contains targetMs
      let lo = 0, hi = this.songTimeIndex.length - 2;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((this.songTimeIndex[mid] ?? 0) <= targetMs) lo = mid; else hi = mid - 1;
      }
      const songPos = lo;
      const rowMs   = ((song.initialSpeed ?? 6) * 2.5 / (song.initialBPM ?? 125)) * 1000;
      const rowsIn  = Math.max(0,
        Math.floor((targetMs - (this.songTimeIndex[songPos] ?? 0)) / rowMs),
      );
      const patternIdx = song.songPositions[songPos];
      const pattern    = song.patterns[patternIdx];
      const pattPos    = Math.min(rowsIn, (pattern?.length ?? 64) - 1);
      this.replayer.seekTo(songPos, pattPos);
    } else {
      this.replayer.seekTo(this.backwardStartSongPos, this.backwardStartPattPos);
    }

    this.replayer.resume();
    this.deckGain.gain.rampTo(1, 0.02);
    this.replayer.setPitchMultiplier(fwdRate);
    this.replayer.setTempoMultiplier(fwdRate);
  }

  /**
   * Animate pitch/tempo multipliers from their current value back to `restMultiplier`
   * (i.e. whatever the pitch slider is set to) over decayMs using a cubic ease-out.
   * Shared by both jog-wheel release and pattern stop.
   */
  private _decayToRest(decayMs = 200): void {
    // Cancel any previous decay that's still running
    if (this.decayRafId !== null) {
      cancelAnimationFrame(this.decayRafId);
      this.decayRafId = null;
    }

    const startVal = this.replayer.getTempoMultiplier();
    const targetVal = this.restMultiplier;

    // Already at target — nothing to do
    if (Math.abs(startVal - targetVal) < 0.001) {
      this.replayer.setPitchMultiplier(targetVal);
      this.replayer.setTempoMultiplier(targetVal);
      return;
    }

    const startTime = performance.now();
    const animate = () => {
      const t = Math.min(1, (performance.now() - startTime) / decayMs);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
      const val = startVal + (targetVal - startVal) * ease;
      this.replayer.setPitchMultiplier(val);
      this.replayer.setTempoMultiplier(val);
      if (t < 1) {
        this.decayRafId = requestAnimationFrame(animate);
      } else {
        this.decayRafId = null;
      }
    };
    this.decayRafId = requestAnimationFrame(animate);
  }

  /** Get the channel gain AudioParam for fader automation */
  getChannelGainParam(): AudioParam {
    return (this.channelGain.gain as unknown as { _param: AudioParam })._param;
  }

  /** Play a named scratch pattern (with optional beat quantization) */
  playPattern(name: string, onWaiting?: (ms: number) => void): void {
    const pattern = getPatternByName(name);
    if (!pattern) return;

    // Cancel any restore-to-rest animation so the pattern can freely set the multipliers
    if (this.decayRafId !== null) {
      cancelAnimationFrame(this.decayRafId);
      this.decayRafId = null;
    }

    // Save replayer position so we can return here when the scratch ends.
    this.patternStartSongPos = this.replayer.getSongPos();
    this.patternStartPattPos = this.replayer.getPattPos();
    this.patternScratchActive = true;
    this.patternScratchDir = 1;  // start in forward mode

    // Forward scratch phases play the tracker LIVE at scratch speed — full audio
    // quality, no ring-buffer gaps. Backward phases switch to the ring buffer
    // (which continuously captures the forward audio). The tracker stays unmuted
    // and note processing stays enabled so forward phases produce the full mix.
    // deckGain stays at 1 until the first backward phase.

    // Special handling for BPM-synced patterns with custom fader scheduling
    const bpm = this.getEffectiveBPM();
    if (pattern.name === 'Transformer') {
      this.scratchPlayback.scheduleTransformerFader(bpm);
    } else if (pattern.name === 'Crab') {
      this.scratchPlayback.scheduleCrabFader(bpm);
    } else if (pattern.name === '8-Finger Crab') {
      this.scratchPlayback.scheduleEightFingerCrabFader(bpm);
    }

    this.scratchPlayback.play(pattern, onWaiting);
  }

  /** Stop the currently looping scratch pattern and restore speed to the pitch-slider value */
  stopPattern(): void {
    this.scratchPlayback.stopPattern();
    this._endPatternScratch();
    // Only restore if the jog wheel isn't actively being held (it has its own restore path)
    if (!this.isScratchActive) {
      this._decayToRest(300);
    }
  }

  /** Clean up pattern scratch state: stop ring buffer, unmute tracker, seek back. */
  private _endPatternScratch(): void {
    if (!this.patternScratchActive) return;
    this.patternScratchActive = false;

    // If we ended in a backward phase, stop ring buffer and unmute tracker
    if (this.patternScratchDir === -1 && this.scratchBufferReady && this.scratchBuffer) {
      this.scratchBuffer.silenceAndStop();
      this.scratchBuffer.unfreezeCapture();
      this.deckGain.gain.rampTo(1, 0.005);
    }

    // Seek replayer back to where the scratch started so the song resumes seamlessly
    this.replayer.seekTo(this.patternStartSongPos, this.patternStartPattPos);

    // Snap multipliers back to the pitch-slider value immediately.
    this.replayer.setTempoMultiplier(this.restMultiplier);
    this.replayer.setPitchMultiplier(this.restMultiplier);
    this.patternScratchDir = 1;
  }

  /** Is a pattern waiting for quantize? */
  isPatternWaiting(): boolean {
    return this.scratchPlayback.isWaiting();
  }

  /** Is a scratch pattern currently playing (or waiting to start)? */
  isPatternActive(): boolean {
    return this.scratchPlayback.isPatternActive();
  }

  /** Let the current pattern cycle finish then stop (tap/one-shot mode). */
  finishPatternCycle(): void {
    this.scratchPlayback.finishCurrentCycle();
  }

  /** Start fader LFO at given division (synced to current effective BPM) */
  startFaderLFO(division: FaderLFODivision): void {
    this.scratchPlayback.startFaderLFO(this.getEffectiveBPM(), division);
  }

  /** Stop fader LFO */
  stopFaderLFO(): void {
    this.scratchPlayback.stopFaderLFO();
  }

  /** Called by DJDeck RAF when effectiveBPM changes — relays to ScratchPlayback for LFO resync */
  notifyBPMChange(bpm: number): void {
    this.scratchPlayback.onBPMChange(bpm);
  }

  /** Get current scratch state for UI feedback (turntable spin, pattern scroll, fader indicators).
   *  Returns velocity (signed rate multiplier) and faderGain (0-1). */
  getScratchState(): { velocity: number; faderGain: number } {
    return {
      velocity: this.scratchPlayback.currentVelocity,
      faderGain: this.scratchPlayback.currentFaderGain,
    };
  }

  /**
   * Handle Xnn effect from the pattern editor.
   * High nibble 0 → scratch pattern (0=stop, 1=Baby, 2=Trans, 3=Flare, 4=Hydro, 5=Crab, 6=Orbit)
   * High nibble 1 → fader LFO (0=off, 1=¼, 2=⅛, 3=⅟₁₆, 4=⅟₃₂)
   */
  private _handleScratchEffect(param: number): void {
    const hi = (param >> 4) & 0x0F;
    const lo = param & 0x0F;

    if (hi === 0x0) {
      // Scratch pattern
      const PATTERN_NAMES = ['', 'Baby Scratch', 'Transformer', 'Flare', 'Hydroplane', 'Crab', 'Orbit'];
      if (lo === 0) {
        this.stopPattern();
      } else if (lo < PATTERN_NAMES.length) {
        this.stopPattern();
        this.playPattern(PATTERN_NAMES[lo]);
      }
    } else if (hi === 0x1) {
      // Fader LFO
      const LFO_DIVS: (FaderLFODivision | null)[] = [null, '1/4', '1/8', '1/16', '1/32'];
      const div = LFO_DIVS[lo] ?? null;
      if (div === null) {
        this.stopFaderLFO();
      } else {
        this.startFaderLFO(div);
      }
    }
  }

  // ==========================================================================
  // EQ (3-band: -24 to +6 dB)
  // ==========================================================================

  setEQ(band: 'low' | 'mid' | 'high', dB: number): void {
    const clamped = Math.max(-24, Math.min(6, dB));
    this.eqValues[band] = clamped;
    if (!this.eqKillState[band]) {
      this.eq3[band].value = clamped;
    }
  }

  setEQKill(band: 'low' | 'mid' | 'high', kill: boolean): void {
    this.eqKillState[band] = kill;
    this.eq3[band].value = kill ? -Infinity : this.eqValues[band];
  }

  getEQKill(band: 'low' | 'mid' | 'high'): boolean {
    return this.eqKillState[band];
  }

  // ==========================================================================
  // FILTER (single knob: -1 = HPF, 0 = off, +1 = LPF)
  // ==========================================================================

  setFilterPosition(position: number): void {
    this.filterPosition = Math.max(-1, Math.min(1, position));

    if (this.filterPosition >= 0) {
      // 0 → +1: LPF sweep from 20kHz (fully open / bypass) down to 100Hz
      this.filter.type = 'lowpass';
      // At 0: freq = 20000 (bypass). At 1: freq = 100.
      const freq = 20000 * Math.pow(100 / 20000, this.filterPosition);
      this.filter.frequency.rampTo(freq, 0.05);
    } else {
      // -1 → 0: HPF sweep from 10kHz down to 20Hz (bypass)
      this.filter.type = 'highpass';
      const amount = -this.filterPosition; // 0..1
      // At 0 (amount=0): freq = 20 (bypass). At -1 (amount=1): freq = 10kHz.
      const freq = 20 * Math.pow(10000 / 20, amount);
      this.filter.frequency.rampTo(freq, 0.05);
    }
  }

  setFilterResonance(q: number): void {
    this.filterResonance = Math.max(0.5, Math.min(15, q));
    this.filter.Q.rampTo(this.filterResonance, 0.05);
  }

  // ==========================================================================
  // VOLUME (channel fader) + TRIM (auto-gain)
  // ==========================================================================

  /** Set the trim/auto-gain level in dB (applied to deckGain node) */
  setTrimGain(dB: number): void {
    const linear = Math.pow(10, dB / 20);
    this.deckGain.gain.rampTo(Math.max(0, Math.min(4, linear)), 0.05);
  }

  setVolume(value: number): void {
    this.channelGain.gain.rampTo(Math.max(0, Math.min(1.5, value)), 0.02);
  }

  getVolume(): number {
    return this.channelGain.gain.value;
  }

  /** Get the channel gain node (for PFL/cue routing) */
  getChannelGain(): Tone.Gain {
    return this.channelGain;
  }

  // ==========================================================================
  // METERING
  // ==========================================================================

  getLevel(): number {
    return this.meter.getValue() as number;
  }

  // ==========================================================================
  // LOOP / SLIP (delegates to TrackerReplayer)
  // ==========================================================================

  setLineLoop(size: number): void {
    const currentRow = this.replayer.getCurrentRow();
    // Quantize to beat boundary
    const startRow = Math.floor(currentRow / size) * size;
    this.replayer.setLineLoop(startRow, size);
  }

  clearLineLoop(): void {
    this.replayer.clearLineLoop();
  }

  setPatternLoop(startPos: number, endPos: number): void {
    this.replayer.setPatternLoop(startPos, endPos);
  }

  clearPatternLoop(): void {
    this.replayer.clearPatternLoop();
  }

  // ==========================================================================
  // AUDIO LOOP (time-based, for audio playback mode)
  // ==========================================================================

  /** Set the audio loop in/out region (seconds). Both must be set for loop to activate. */
  setAudioLoop(loopIn: number | null, loopOut: number | null): void {
    this.audioPlayer.setLoopRegion(loopIn, loopOut);
  }

  /** Clear the audio loop region */
  clearAudioLoop(): void {
    this.audioPlayer.setLoopRegion(null, null);
  }

  setSlipEnabled(enabled: boolean): void {
    this._slipEnabled = enabled;
    if (this._playbackMode === 'audio') {
      if (enabled) {
        // Save current audio position as ghost start
        this.slipGhostPosition = this.audioPlayer.getPosition();
        this.slipGhostStartTime = performance.now();
        this.slipGhostRate = this.audioPlayer.getPlaybackRate();
      }
    } else {
      this.replayer.setSlipEnabled(enabled);
    }
  }

  /** Get the ghost position for slip mode (where the track "would be") */
  getSlipGhostPosition(): number {
    if (!this._slipEnabled) return -1;
    if (this._playbackMode === 'audio') {
      const elapsed = (performance.now() - this.slipGhostStartTime) / 1000;
      return this.slipGhostPosition + elapsed * this.slipGhostRate;
    }
    const slip = this.replayer.getSlipState();
    return slip.enabled ? slip.songPos : -1;
  }

  /** Snap back to slip ghost position (called when scratch/loop ends) */
  private slipSnapBack(): void {
    if (!this._slipEnabled) return;
    if (this._playbackMode === 'audio') {
      const ghostPos = this.getSlipGhostPosition();
      if (ghostPos >= 0) {
        this.audioPlayer.seek(ghostPos);
        // Reset ghost tracking
        this.slipGhostPosition = ghostPos;
        this.slipGhostStartTime = performance.now();
      }
    }
    // Tracker mode slip snap-back is handled by TrackerReplayer internally
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  /** Get waveform data (256 samples, -1 to +1) */
  getWaveform(): Float32Array {
    return this.waveformAnalyser.getValue() as Float32Array;
  }

  /** Get FFT data (1024 bins, dB values -100 to 0) */
  getFFT(): Float32Array {
    return this.fftAnalyser.getValue() as Float32Array;
  }

  private unregisterOutputOverrides(): void {
    if (this.currentSongInstrumentIds.length > 0) {
      const engine = getToneEngine();
      for (const id of this.currentSongInstrumentIds) {
        engine.removeInstrumentOutputOverride(id);
      }
      this.currentSongInstrumentIds = [];
    }
  }

  private restoreNativeRouting(): void {
    if (this.routedNativeEngines.size > 0) {
      const engine = getToneEngine();
      for (const key of this.routedNativeEngines) {
        engine.restoreNativeEngineRouting(key);
      }
      this.routedNativeEngines.clear();
    }
  }

  dispose(): void {
    this.unregisterOutputOverrides();
    this.restoreNativeRouting();
    this.scratchPlayback.dispose();
    this.scratchBuffer?.dispose();
    if (this.decayRafId !== null) {
      cancelAnimationFrame(this.decayRafId);
      this.decayRafId = null;
    }
    if (this.backwardPauseTimeoutId !== null) {
      clearTimeout(this.backwardPauseTimeoutId);
      this.backwardPauseTimeoutId = null;
    }
    this.replayer.dispose();
    this.audioPlayer.dispose();
    this.fftAnalyser.dispose();
    this.waveformAnalyser.dispose();
    this.meter.dispose();
    this.channelGain.dispose();
    this.filter.dispose();
    this.pitchShift.dispose();
    this.eq3.dispose();
    this.deckGain.dispose();
  }
}
