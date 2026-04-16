/**
 * DeckEngine - One DJ deck: owns a TrackerReplayer + audio chain
 *
 * Audio chain: TrackerReplayer.masterGain → deckGain → EQ3 → filter → channelGain → output
 *                                                                  ↘ reverbSend → reverb → output (bypasses fader gate)
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
import { snapPositionToBeat, snapLoopLength, phaseAlign } from './DJAutoSync';
import { getQuantizeMode } from './DJQuantizedFX';
import { DeckScratchBuffer } from './DeckScratchBuffer';
import { DeckAudioPlayer, type AudioFileInfo } from './DeckAudioPlayer';
import { TurntablePhysics } from '@/engine/turntable/TurntablePhysics';
import { clearPatternGuard } from '../keyboard/commands/djScratch';

export type PlaybackMode = 'tracker' | 'audio';

// Monkey-patch Tone.Player._onSourceEnd to suppress StateTimeline assertion errors.
// When scratch patterns change playback rates dramatically, sample buffers can end at
// times that violate Tone.js's chronological ordering requirement. The assertion is
// purely bookkeeping — swallowing it has no functional impact on audio output.
// If the original throws, we still clean up _activeSources to prevent source accumulation.
const _origOnSourceEnd = (Tone.Player.prototype as any)._onSourceEnd;
if (_origOnSourceEnd && !(Tone.Player.prototype as any).__scratchPatched) {
  (Tone.Player.prototype as any).__scratchPatched = true;
  (Tone.Player.prototype as any)._onSourceEnd = function (source: any) {
    try {
      return _origOnSourceEnd.call(this, source);
    } catch {
      // Original threw (StateTimeline assertion) — manually clean up the source
      // to prevent accumulation in _activeSources.
      (this as any)._activeSources?.delete?.(source);
    }
  };
}

export type FaderLFODivision = '1/4' | '1/8' | '1/16' | '1/32';

export type DeckId = 'A' | 'B' | 'C';

export interface DeckEngineOptions {
  id: DeckId;
  outputNode: Tone.ToneAudioNode;
}

export class DeckEngine {
  readonly id: DeckId;
  readonly replayer: TrackerReplayer;
  readonly audioPlayer: DeckAudioPlayer;
  readonly physics: TurntablePhysics;
  private _playbackMode: PlaybackMode = 'audio';

  // Audio chain nodes
  private deckGain: Tone.Gain;
  private eq3: Tone.EQ3;
  private filterHPF: Tone.Filter;
  private filterLPF: Tone.Filter;
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
  private _isScratchActive = false;   // true while jog wheel is physically held
  /** Whether jog wheel scratch is currently active (hand on record). */
  get isScratchActive(): boolean { return this._isScratchActive; }
  private backwardPauseTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private decayRafId: number | null = null;

  // Pattern scratch state — when a scratch preset button is active, the tracker
  // plays live at scratch speed during forward phases (full audio quality) and
  // switches to ring-buffer reverse playback for backward phases.
  private patternScratchActive = false;
  private patternScratchDir: 1 | -1 = 1;  // current direction in pattern scratch

  // Reverse scratch state
  private scratchBuffer: DeckScratchBuffer | null = null;
  private scratchBufferReady = false;
  private scratchDirection = 1;          // 1 = forward, -1 = backward
  private backwardStartSongPos = 0;
  private backwardStartPattPos = 0;
  private backwardStartElapsedMs = 0;
  private backwardDisplacementMs = 0;   // accumulated backward travel (ms of audio)
  private lastBackwardVelocityTime = 0; // performance.now() of last backward velocity update
  private lastBackwardRate = 0;         // rate at last backward velocity update
  // Direction-switch cooldown: prevents gain accumulation from rapid back/forth jog gestures
  private _lastJogDirSwitchTime = 0;
  private static readonly JOG_DIR_SWITCH_COOLDOWN_MS = 20;
  private songTimeIndex: number[] = [];
  /** Per-song-position rowMs value (accounts for Fxx speed/BPM changes) */
  private songRowMs: number[] = [];

  // EQ kill state (stored separately from gain values)
  private eqKillState = { low: false, mid: false, high: false };
  private eqValues = { low: 0, mid: 0, high: 0 }; // dB values before kill

  // Filter state
  private filterPosition = 0;  // -1 (HPF) to 0 (off) to +1 (LPF)
  private filterResonance = 1; // Q value

  // Current pitch state (for hot-swap)
  private _currentPitchSemitones = 0;

  // Slip mode for audio playback + scratch
  private _slipEnabled = false;
  private slipGhostPosition = 0;       // Where the track "would be" if not scratching/looping
  private slipGhostStartTime = 0;      // performance.now() when ghost started
  private slipGhostRate = 1;           // playback rate for ghost advancement

  // Raw native AudioParam for deckGain — bypasses Tone.Signal entirely
  // to avoid any Tone.js interception that corrupts automation during scratch.
  private _rawDeckGainParam: AudioParam | null = null;
  private _brickwallLimiter: DynamicsCompressorNode | null = null;

  // Scratch/LFO reverb send — taps audio pre-fader, feeds through a short
  // reverb that bypasses the channelGain gate, creating a reverb tail that
  // bleeds through during fader chops.
  private _reverbSend: GainNode | null = null;
  private _reverbNode: ConvolverNode | null = null;
  private _reverbWet: GainNode | null = null;
  private _reverbActive = false;

  /**
   * Safely ramp deckGain to a target value using the RAW native AudioParam.
   * Completely bypasses Tone.Signal to avoid any automation corruption.
   */
  private _rampDeckGain(target: number, durationSec: number): void {
    const param = this._rawDeckGainParam;
    if (!param) return;
    const now = Tone.getContext().rawContext.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + durationSec);
  }

  /** Hard-set deckGain to an exact value with no ramp (atomic). */
  private _setDeckGain(value: number): void {
    const param = this._rawDeckGainParam;
    if (!param) return;
    const now = Tone.getContext().rawContext.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(value, now);
  }

  constructor(options: DeckEngineOptions) {
    this.id = options.id;

    // Create the audio chain nodes (order: replayer → deckGain → EQ3 → HPF → LPF → channelGain → output)
    this.deckGain = new Tone.Gain(1);
    // Cache raw native AudioParam to bypass Tone.Signal for scratch gain transitions
    const nativeGain = getNativeAudioNode(this.deckGain as unknown as Record<string, unknown>);
    if (nativeGain && 'gain' in nativeGain) {
      this._rawDeckGainParam = (nativeGain as GainNode).gain;
    }
    this.eq3 = new Tone.EQ3({ low: 0, mid: 0, high: 0 });
    this.filterHPF = new Tone.Filter({ type: 'highpass', frequency: 20, Q: 1, rolloff: -24 });
    this.filterLPF = new Tone.Filter({ type: 'lowpass', frequency: 20000, Q: 1, rolloff: -24 });
    this.channelGain = new Tone.Gain(1);
    this.meter = new Tone.Meter({ smoothing: 0.8 });
    this.waveformAnalyser = new Tone.Analyser('waveform', 256);
    this.fftAnalyser = new Tone.FFT(1024);

    // Wire: deckGain → EQ3 → HPF → LPF → channelGain → limiter → [output + meter + analyser]
    try {
      this.deckGain.connect(this.eq3);
      this.eq3.connect(this.filterHPF);
      this.filterHPF.connect(this.filterLPF);
      this.filterLPF.connect(this.channelGain);
    } catch (err) {
      console.error('[DeckEngine] audio chain wiring failed:', err);
    }

    // Brick-wall limiter — prevents output from exceeding 0 dBFS regardless of
    // internal gain transients from rapid scratch transitions or Player source overlap.
    const ctx = Tone.getContext().rawContext as AudioContext;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;   // Start limiting at -1 dBFS
    limiter.knee.value = 0;          // Hard knee (brick-wall)
    limiter.ratio.value = 20;        // Near-infinite ratio
    limiter.attack.value = 0.001;    // 1ms attack (catch transients)
    limiter.release.value = 0.01;    // 10ms release (fast recovery)
    this._brickwallLimiter = limiter;
    const nativeChannelGain = getNativeAudioNode(this.channelGain as unknown as Record<string, unknown>);
    if (nativeChannelGain) {
      nativeChannelGain.connect(limiter);
      limiter.connect((getNativeAudioNode(options.outputNode as unknown as Record<string, unknown>))!);
    } else {
      this.channelGain.connect(options.outputNode);
    }
    // Analysers tap from channelGain (pre-limiter) for accurate waveform/spectrum display
    this.channelGain.connect(this.waveformAnalyser);
    this.channelGain.connect(this.fftAnalyser);
    // VU meter taps post-limiter to show actual output level
    const nativeMeterInput = getNativeAudioNode(this.meter as unknown as Record<string, unknown>);
    if (nativeMeterInput) {
      limiter.connect(nativeMeterInput);
    } else {
      this.channelGain.connect(this.meter);
    }

    // Scratch/LFO reverb send: taps pre-fader audio → short reverb → limiter
    // Bypasses channelGain so reverb tail bleeds through during fader chops.
    // Send gain starts at 0 (silent) — enabled when scratch/LFO effects are active.
    try {
      this._reverbSend = ctx.createGain();
      this._reverbSend.gain.value = 0;
      this._reverbNode = ctx.createConvolver();
      this._reverbNode.buffer = DeckEngine._createReverbIR(ctx, 0.6, 4000);
      this._reverbWet = ctx.createGain();
      this._reverbWet.gain.value = 0.25; // 25% wet level

      const nativeLPF = getNativeAudioNode(this.filterLPF as unknown as Record<string, unknown>);
      if (nativeLPF) {
        nativeLPF.connect(this._reverbSend);
      }
      this._reverbSend.connect(this._reverbNode);
      this._reverbNode.connect(this._reverbWet);
      this._reverbWet.connect(limiter);
    } catch (err) {
      console.warn('[DeckEngine] reverb send setup failed:', err);
    }

    // Create TrackerReplayer connected to our deckGain input
    this.replayer = new TrackerReplayer(this.deckGain);
    this.replayer.setMuted(true); // Silent by default in DJ mode

    // Create AudioPlayer for audio file playback (MP3/WAV/FLAC etc.)
    this.audioPlayer = new DeckAudioPlayer(this.deckGain);

    // Per-deck turntable physics (one instance shared by all views)
    this.physics = new TurntablePhysics();

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
      clearPatternGuard(this.id); // Clear guard when pattern ends naturally
      if (!this._isScratchActive) {
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
    const pitch = this._currentPitchSemitones;

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
      await this.audioPlayer.play();
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
      // Capture from LPF output, play back directly to channelGain.
      this.scratchBuffer.wireIntoChain(this.filterLPF, this.channelGain);
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
  async loadAudioFile(buffer: ArrayBuffer, filename: string, precomputedPeaks?: Float32Array): Promise<AudioFileInfo> {
    // Stop any current playback
    this.replayer.stop();
    this.audioPlayer.stop();
    this._playbackMode = 'audio';

    return this.audioPlayer.loadAudioFile(buffer, filename, precomputedPeaks);
  }

  get playbackMode(): PlaybackMode {
    return this._playbackMode;
  }

  async play(): Promise<void> {
    if (this._playbackMode === 'audio') {
      console.log(`[DeckEngine] play() in audio mode`);
      await this.audioPlayer.play();
      // DON'T start replayer if there's no song loaded (we skipped tracker mode)
      // The replayer is only for tracker mode playback
    } else if (this._playbackMode === 'tracker') {
      console.log(`[DeckEngine] play() in tracker mode`);
      await this.replayer.play();
    } else {
      console.warn(`[DeckEngine] play() called in unknown mode: ${this._playbackMode}`);
    }
  }

  pause(): void {
    if (this._playbackMode === 'audio') {
      this.audioPlayer.pause();
    } else if (this._playbackMode === 'tracker') {
      this.replayer.pause();
    }
  }

  async resume(): Promise<void> {
    if (this._playbackMode === 'audio') {
      await this.audioPlayer.play();
    } else if (this._playbackMode === 'tracker') {
      this.replayer.resume();
    }
  }

  stop(): void {
    if (this._playbackMode === 'audio') {
      this.audioPlayer.stop();
    } else if (this._playbackMode === 'tracker') {
      this.replayer.stop();
    }
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
    this._currentPitchSemitones = semitones;

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
  }

  /** Temporary BPM bump for beat matching */
  nudge(offset: number, ticks: number = 8): void {
    this.replayer.setNudge(offset, ticks);
  }

  /** Key lock removed — was causing echo artifacts from granular delay buffer. */
  setKeyLock(_enabled: boolean): void { /* no-op */ }
  getKeyLock(): boolean { return false; }

  // ==========================================================================
  // SCRATCH
  // ==========================================================================

  /**
   * Build a cumulative time index (ms) for each song position boundary.
   * Index[i] = time in ms when song position i starts.
   * Used to estimate seek position after a backward scratch.
   */
  private _buildTimeIndex(song: TrackerSong): number[] {
    let bpm   = song.initialBPM   ?? 125;
    let speed = song.initialSpeed ?? 6;
    const times: number[] = [0];
    const rowMsArr: number[] = [];

    for (let i = 0; i < song.songLength; i++) {
      const patternIdx = song.songPositions[i];
      const pattern    = song.patterns[patternIdx];
      const numRows    = pattern?.length ?? 64;
      let patternMs = 0;

      // Walk each row to detect Fxx speed/BPM changes
      for (let row = 0; row < numRows; row++) {
        const rowMs = (speed * 2500 / bpm);
        patternMs += rowMs;

        if (!pattern) continue;
        // Scan all channels for Fxx (effect type 0xF)
        for (const ch of pattern.channels) {
          const cell = ch.rows[row];
          if (!cell) continue;
          // Check primary effect column
          if (cell.effTyp === 0xF && cell.eff > 0) {
            if (cell.eff < 0x20) speed = cell.eff;
            else bpm = cell.eff;
          }
          // Check second effect column
          if (cell.effTyp2 === 0xF && cell.eff2 > 0) {
            if (cell.eff2 < 0x20) speed = cell.eff2;
            else bpm = cell.eff2;
          }
        }
      }

      // Store the rowMs at the END of this pattern (for row interpolation)
      rowMsArr.push(speed * 2500 / bpm);
      times.push(times[i]! + patternMs);
    }

    this.songRowMs = rowMsArr;
    return times;
  }

  /** Map elapsed ms to { songPos, pattPos } using the pre-built time index */
  getPositionAtTime(ms: number): { songPos: number; pattPos: number } | null {
    const song = this.replayer.getSong();
    if (!song || this.songTimeIndex.length <= 1) return null;
    let lo = 0, hi = this.songTimeIndex.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.songTimeIndex[mid] ?? 0) <= ms) lo = mid; else hi = mid - 1;
    }
    const songPos = lo;
    const rowMs = this.songRowMs[songPos] ?? ((song.initialSpeed ?? 6) * 2500 / (song.initialBPM ?? 125));
    const rowsIn = Math.max(0, Math.floor((ms - (this.songTimeIndex[songPos] ?? 0)) / rowMs));
    const patternIdx = song.songPositions[songPos];
    const pattern = song.patterns[patternIdx];
    const pattPos = Math.min(rowsIn, (pattern?.length ?? 64) - 1);
    return { songPos, pattPos };
  }

  /** Returns effective BPM: replayer BPM × tempo multiplier */
  getEffectiveBPM(): number {
    return this.replayer.getBPM() * this.replayer.getTempoMultiplier();
  }

  /** Enter scratch mode — cancels any in-progress decay and marks jog wheel as active */
  startScratch(): void {
    if (this._isScratchActive) return;
    this._isScratchActive = true;
    // Cancel any in-progress restore animation so scratch takes full control
    if (this.decayRafId !== null) {
      cancelAnimationFrame(this.decayRafId);
      this.decayRafId = null;
    }
    this.scratchDirection = 1; // Reset for fresh scratch session
    this._lastJogDirSwitchTime = 0; // Reset cooldown for fresh scratch session
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

    // Pattern scratch: forward phases use audio source at variable rate,
    // backward phases use ring-buffer reverse playback.
    // Pattern scratches use a tight dead zone (±0.02) because the velocity curve
    // is smooth and algorithmic — no jitter. This eliminates the perceptible pause
    // at zero-crossings that a wider dead zone (0.1) would cause.
    if (this.patternScratchActive) {
      const absV = Math.abs(v);
      const isAudio = this._playbackMode === 'audio';

      if (absV < 0.02) {
        // Tight dead zone: hold current direction at near-zero rate.
        // Brief enough to be imperceptible during smooth zero-crossings.
        if (this.patternScratchDir === 1) {
          if (isAudio) {
            this.audioPlayer.setPlaybackRate(0.02);
          } else {
            this.replayer.setTempoMultiplier(0.02);
            this.replayer.setPitchMultiplier(0.02);
          }
        } else {
          this._accumulateBackwardDisplacement(0.02);
          this.scratchBuffer?.setRate(-0.02);
        }
        return;
      }

      if (v > 0) {
        // ── FORWARD: audio at scratch speed ──
        const fwdRate = Math.max(0.02, v);
        if (this.patternScratchDir === -1) {
          // Transition backward → forward
          this.scratchBuffer?.silenceAndStop();
          this.scratchBuffer?.unfreezeCapture();
          this._rampDeckGain(1, 0.002);
          this.patternScratchDir = 1;
        }
        if (isAudio) {
          this.audioPlayer.setPlaybackRate(fwdRate);
        } else {
          this.replayer.setTempoMultiplier(fwdRate);
          this.replayer.setPitchMultiplier(fwdRate);
        }
      } else {
        // ── BACKWARD: ring-buffer reverse playback ──
        if (this.patternScratchDir === 1) {
          // Transition forward → backward: freeze capture, mute forward source,
          // start ring buffer backward from the exact worklet write position.
          this.scratchBuffer?.freezeCapture();
          this._setDeckGain(0);
          this.scratchBuffer?.startReverseFromWritePos(absV);
          if (isAudio) {
            this.audioPlayer.setPlaybackRate(0.001);
          } else {
            this.replayer.setTempoMultiplier(0.001);
            this.replayer.setPitchMultiplier(0.001);
          }
          this.patternScratchDir = -1;
        } else {
          this._accumulateBackwardDisplacement(absV);
          this.scratchBuffer?.setRate(-absV);
        }
      }
      return;
    }

    // Jog wheel scratch: full pitch + tempo control
    // Direction-switch cooldown prevents gain accumulation from rapid back/forth jog gestures.
    // During cooldown, stay in the current direction at minimum speed.
    const now = performance.now();
    const canSwitchDir = (now - this._lastJogDirSwitchTime) >= DeckEngine.JOG_DIR_SWITCH_COOLDOWN_MS;

    if (this._playbackMode === 'audio') {
      // Audio mode: manipulate audioPlayer rate, not replayer
      if (v >= 0) {
        if (this.scratchDirection === -1) {
          if (canSwitchDir) {
            this._lastJogDirSwitchTime = now;
            this._switchToForward(Math.max(0.15, v));
          } else {
            // Cooldown: stay backward at minimum speed
            this._accumulateBackwardDisplacement(0.15);
            this.scratchBuffer?.setScratchRate(-0.15);
          }
        } else {
          this.audioPlayer.setPlaybackRate(Math.max(0.15, v));
        }
      } else {
        if (this.scratchDirection !== -1) {
          if (canSwitchDir) {
            this._lastJogDirSwitchTime = now;
            this._switchToBackward(Math.abs(v));
          } else {
            // Cooldown: stay forward at minimum speed
            this.audioPlayer.setPlaybackRate(0.15);
          }
        } else {
          this._accumulateBackwardDisplacement(Math.abs(v));
          this.scratchBuffer?.setScratchRate(-Math.abs(v));
        }
      }
    } else {
      // Tracker mode: manipulate replayer
      if (v >= 0) {
        if (this.scratchDirection === -1) {
          if (canSwitchDir) {
            this._lastJogDirSwitchTime = now;
            this._switchToForward(Math.max(0.15, v));
          } else {
            this._accumulateBackwardDisplacement(0.15);
            this.scratchBuffer?.setScratchRate(-0.15);
          }
        } else {
          const fwdRate = Math.max(0.15, v);
          this.replayer.setPitchMultiplier(fwdRate);
          this.replayer.setTempoMultiplier(fwdRate);
        }
      } else {
        if (this.scratchDirection !== -1) {
          if (canSwitchDir) {
            this._lastJogDirSwitchTime = now;
            this._switchToBackward(Math.abs(v));
          } else {
            // Cooldown: stay forward at minimum speed
            this.replayer.setTempoMultiplier(0.15);
            this.replayer.setPitchMultiplier(0.15);
          }
        } else {
          this._accumulateBackwardDisplacement(Math.abs(v));
          this.scratchBuffer?.setScratchRate(-Math.abs(v));
        }
      }
    }
  }

  /**
   * Exit scratch mode — smoothly decays pitch/tempo back to the pitch-slider value over decayMs.
   * If slip mode is active, snaps back to the ghost position.
   */
  stopScratch(decayMs = 200): void {
    if (!this._isScratchActive) return;
    this._isScratchActive = false;

    // Slip mode: snap back to ghost position
    this.slipSnapBack();

    if (this.scratchDirection === -1) {
      // End backward scratch (synchronous), then decay to rest
      this._switchToForward(1);
    }
    this._decayToRest(decayMs);

    // Hard-set gains after decay to clean, definitive values.
    // Uses cancelScheduledValues + setValueAtTime (atomic) instead of rampTo
    // (which relies on cancelAndHoldAtTime that can misbehave with rapid overlapping ramps).
    const hardReset = () => {
      if (this._isScratchActive) return; // scratch restarted, don't interfere
      const now = Tone.getContext().rawContext.currentTime;
      // Kill any residual scratch buffer output
      if (this.scratchBufferReady && this.scratchBuffer) {
        this.scratchBuffer.playbackGain.gain.cancelScheduledValues(now);
        this.scratchBuffer.playbackGain.gain.setValueAtTime(0, now);
      }
      // Hard-set deckGain to exactly 1.0 via raw native AudioParam
      this._setDeckGain(1);
      // Force playback rate to restMultiplier — prevents rate drift from
      // incomplete _decayToRest animations or stale physics velocities
      if (this._playbackMode === 'audio') {
        this.audioPlayer.setPlaybackRate(this.restMultiplier);
      } else {
        this.replayer.setPitchMultiplier(this.restMultiplier);
        this.replayer.setTempoMultiplier(this.restMultiplier);
      }
    };
    setTimeout(hardReset, decayMs + 50);
    setTimeout(hardReset, decayMs + 300);

    // After the decay settles, nudge this deck back onto the beat grid so a
    // scratch never leaves the deck out of phase with the master. Only fires
    // when quantize is on, the OTHER deck is currently playing with a beat
    // grid, and this deck has its own grid.
    setTimeout(() => {
      if (this._isScratchActive) return;
      const mode = getQuantizeMode();
      if (mode === 'off') return;
      const otherDeckId: DeckId = this.id === 'A' ? 'B' : this.id === 'B' ? 'A' : 'A';
      const store = useDJStore.getState();
      const otherDeck = store.decks[otherDeckId];
      const thisDeck = store.decks[this.id];
      if (!otherDeck.isPlaying || !otherDeck.beatGrid || !thisDeck.beatGrid) return;
      try {
        phaseAlign(this.id, otherDeckId, mode === 'bar' ? 'bar' : 'beat');
      } catch { /* engine not ready */ }
    }, decayMs + 350);
  }

  /** Switch from forward playback to backward (reverse scratch). */
  private _switchToBackward(rate: number): void {
    if (!this.scratchBufferReady || !this.scratchBuffer) {
      // Graceful fallback: clamp to near-stop forward
      if (this._playbackMode === 'audio') {
        this.audioPlayer.setPlaybackRate(0.02);
      } else {
        this.replayer.setPitchMultiplier(0.02);
        this.replayer.setTempoMultiplier(0.02);
      }
      return;
    }

    this.backwardStartSongPos   = this.replayer.getSongPos();
    this.backwardStartPattPos   = this.replayer.getPattPos();
    this.backwardStartElapsedMs = this._playbackMode === 'audio'
      ? this.audioPlayer.getPosition() * 1000
      : this.replayer.getElapsedMs();
    // Reset backward displacement tracking
    this.backwardDisplacementMs = 0;
    this.lastBackwardVelocityTime = performance.now();
    this.lastBackwardRate = rate;
    // Stop any running preset scratch pattern
    this.scratchPlayback.stopPattern();

    // Hard-zero BOTH audio paths to prevent overlap during rapid switching
    this._setDeckGain(0);
    const now = Tone.getContext().rawContext.currentTime;
    this.scratchBuffer.playbackGain.gain.cancelScheduledValues(now);
    this.scratchBuffer.playbackGain.gain.setValueAtTime(0, now);

    // Start reverse audio (startReverse ramps scratch buffer gain from 0→1)
    this.scratchBuffer.startReverse(rate);

    this.scratchDirection = -1;

    // Clear any stale backward pause timeout before scheduling a new one
    if (this.backwardPauseTimeoutId !== null) {
      clearTimeout(this.backwardPauseTimeoutId);
    }

    // Stop the forward source after the fade so it's not playing underneath the reverse.
    // For audio mode, use pause() to preserve state without creating new source nodes.
    this.backwardPauseTimeoutId = setTimeout(() => {
      this.backwardPauseTimeoutId = null;
      if (this.scratchDirection === -1) {
        if (this._playbackMode === 'audio') {
          this.audioPlayer.pause();
        } else {
          this.replayer.pause();
        }
      }
    }, 10);
  }

  /**
   * Accumulate backward displacement between velocity updates.
   * Called on each backward velocity update to track how far
   * the scratch has traveled backward (for accurate resume position).
   */
  private _accumulateBackwardDisplacement(absRate: number): void {
    const now = performance.now();
    const dtSec = (now - this.lastBackwardVelocityTime) / 1000;
    // Use the PREVIOUS rate × elapsed time to estimate displacement
    this.backwardDisplacementMs += this.lastBackwardRate * dtSec * 1000;
    this.lastBackwardVelocityTime = now;
    this.lastBackwardRate = absRate;
  }

  /**
   * Switch from backward playback to forward, seeking to estimated position.
   *
   * FULLY SYNCHRONOUS — no awaits. This prevents the volume-accumulation bug
   * caused by rapid backward→forward→backward gestures racing through async gaps.
   * The scratch buffer is hard-zeroed and stopped immediately via silenceAndStop().
   */
  private _switchToForward(fwdRate: number): void {
    this.scratchDirection = 1;

    // Cancel the backward pause timeout — if it hasn't fired yet, prevent it
    // from pausing the player now that we're going forward again.
    if (this.backwardPauseTimeoutId !== null) {
      clearTimeout(this.backwardPauseTimeoutId);
      this.backwardPauseTimeoutId = null;
    }

    // Immediately silence AND stop the scratch buffer worklet synchronously.
    if (this.scratchBuffer) {
      const now = Tone.getContext().rawContext.currentTime;
      this.scratchBuffer.playbackGain.gain.cancelScheduledValues(now);
      this.scratchBuffer.playbackGain.gain.setValueAtTime(0, now);
      this.scratchBuffer.silenceAndStop();
    }

    // Flush the final backward displacement segment (from last velocity update to now)
    this._accumulateBackwardDisplacement(0);

    // Resume from backward start minus how far backward we actually traveled
    const targetMs = Math.max(0, this.backwardStartElapsedMs - this.backwardDisplacementMs);

    if (this._playbackMode === 'audio') {
      this.audioPlayer.seek(targetMs / 1000);
      this.audioPlayer.setPlaybackRate(fwdRate);
      this._rampDeckGain(1, 0.002);
      if (!this.audioPlayer.isCurrentlyPlaying()) {
        this.audioPlayer.resume();
      }
    } else {
      const song = this.replayer.getSong();
      if (song && this.songTimeIndex.length > 1) {
        let lo = 0, hi = this.songTimeIndex.length - 2;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if ((this.songTimeIndex[mid] ?? 0) <= targetMs) lo = mid; else hi = mid - 1;
        }
        const songPos = lo;
        const rowMs   = this.songRowMs[songPos] ?? ((song.initialSpeed ?? 6) * 2500 / (song.initialBPM ?? 125));
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
      this._rampDeckGain(1, 0.002);
      this.replayer.setPitchMultiplier(fwdRate);
      this.replayer.setTempoMultiplier(fwdRate);
    }
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

    const isAudio = this._playbackMode === 'audio';
    const startVal = isAudio
      ? this.audioPlayer.getPlaybackRate()
      : this.replayer.getTempoMultiplier();
    const targetVal = this.restMultiplier;

    // Already at target — nothing to do
    if (Math.abs(startVal - targetVal) < 0.001) {
      if (isAudio) {
        this.audioPlayer.setPlaybackRate(targetVal);
      } else {
        this.replayer.setPitchMultiplier(targetVal);
        this.replayer.setTempoMultiplier(targetVal);
      }
      return;
    }

    const startTime = performance.now();
    const animate = () => {
      const t = Math.min(1, (performance.now() - startTime) / decayMs);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
      const val = startVal + (targetVal - startVal) * ease;
      if (isAudio) {
        this.audioPlayer.setPlaybackRate(val);
      } else {
        this.replayer.setPitchMultiplier(val);
        this.replayer.setTempoMultiplier(val);
      }
      if (t < 1) {
        this.decayRafId = requestAnimationFrame(animate);
      } else {
        this.decayRafId = null;
      }
    };
    this.decayRafId = requestAnimationFrame(animate);
  }

  /** Get the channel gain AudioParam for fader automation.
   *  Also marks the Tone.js Signal as overridden so its internal value (1.0)
   *  doesn't sum on top of our scheduled values. */
  getChannelGainParam(): AudioParam {
    (this.channelGain.gain as unknown as { overridden: boolean }).overridden = true;
    return (this.channelGain.gain as unknown as { _param: AudioParam })._param;
  }

  /** Release the channel gain AudioParam from direct scheduling back to Tone.js control. */
  releaseChannelGainParam(): void {
    (this.channelGain.gain as unknown as { overridden: boolean }).overridden = false;
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
    this._enableReverbSend();
  }

  /** Stop the currently looping scratch pattern and restore speed to the pitch-slider value */
  stopPattern(): void {
    this.scratchPlayback.stopPattern();
    this._endPatternScratch();
    clearPatternGuard(this.id); // Clear guard when manually stopped
    // Only disable reverb if fader LFO isn't also active
    if (!this.scratchPlayback.isFaderLFOActive) this._disableReverbSend();
    // Only restore if the jog wheel isn't actively being held (it has its own restore path)
    if (!this._isScratchActive) {
      this._decayToRest(300);
    }
  }

  /** Clean up pattern scratch state: stop ring buffer, restore audio source, seek back. */
  private _endPatternScratch(): void {
    if (!this.patternScratchActive) return;
    this.patternScratchActive = false;

    // If we ended in a backward phase, stop ring buffer and unmute forward chain
    if (this.patternScratchDir === -1 && this.scratchBufferReady && this.scratchBuffer) {
      this.scratchBuffer.silenceAndStop();
      this.scratchBuffer.unfreezeCapture();
      this._rampDeckGain(1, 0.005);
    }

    // Don't seek back — let the music continue from its current position.
    // Scratches are beat-synced and the DJ expects seamless flow back to normal playback.
    if (this._playbackMode === 'audio') {
      this.audioPlayer.setPlaybackRate(this.restMultiplier);
    } else {
      this.replayer.setTempoMultiplier(this.restMultiplier);
      this.replayer.setPitchMultiplier(this.restMultiplier);
    }
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
    this._enableReverbSend();
  }

  /** Stop fader LFO */
  stopFaderLFO(): void {
    this.scratchPlayback.stopFaderLFO();
    // Only disable reverb if no pattern scratch is also active
    if (!this.patternScratchActive) this._disableReverbSend();
  }

  /** Called by DJDeck RAF when effectiveBPM changes — relays to ScratchPlayback for LFO resync */
  notifyBPMChange(bpm: number): void {
    this.scratchPlayback.onBPMChange(bpm);
  }

  // ── Scratch/LFO reverb send ────────────────────────────────────────

  /** Generate a short exponentially-decaying noise impulse response for reverb. */
  static _createReverbIR(ctx: AudioContext, durationSec: number, decayHz: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * durationSec);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        // Exponential decay × white noise
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate / decayHz));
      }
    }
    return ir;
  }

  /** Fade in the reverb send (called when scratch/LFO effects activate). */
  private _enableReverbSend(): void {
    if (this._reverbActive || !this._reverbSend) return;
    this._reverbActive = true;
    const now = Tone.getContext().rawContext.currentTime;
    this._reverbSend.gain.cancelScheduledValues(now);
    this._reverbSend.gain.setValueAtTime(this._reverbSend.gain.value, now);
    this._reverbSend.gain.linearRampToValueAtTime(1, now + 0.05);
  }

  /** Fade out the reverb send (called when effects deactivate). */
  private _disableReverbSend(): void {
    if (!this._reverbActive || !this._reverbSend) return;
    this._reverbActive = false;
    const now = Tone.getContext().rawContext.currentTime;
    this._reverbSend.gain.cancelScheduledValues(now);
    this._reverbSend.gain.setValueAtTime(this._reverbSend.gain.value, now);
    // Slow fade-out (500ms) so the reverb tail finishes naturally
    this._reverbSend.gain.linearRampToValueAtTime(0, now + 0.5);
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
    const clamped = Math.max(-12, Math.min(12, dB));
    this.eqValues[band] = clamped;
    if (!this.eqKillState[band]) {
      this.eq3[band].value = clamped;
    }
  }

  setEQKill(band: 'low' | 'mid' | 'high', kill: boolean): void {
    this.eqKillState[band] = kill;
    // Ramp over 3ms to avoid digital click/pop on instant kill toggle
    this.eq3[band].rampTo(kill ? -Infinity : this.eqValues[band], 0.003);
  }

  getEQKill(band: 'low' | 'mid' | 'high'): boolean {
    return this.eqKillState[band];
  }

  // ==========================================================================
  // FILTER (single knob: -1 = HPF, 0 = off, +1 = LPF)
  // ==========================================================================

  setFilterPosition(position: number): void {
    this.filterPosition = Math.max(-1, Math.min(1, position));

    // Both filters are always in the chain: eq3 → HPF → LPF → channelGain
    // At center (0): HPF@20Hz + LPF@20kHz = transparent bypass
    // Moving right (+): LPF sweeps down from 20kHz to 100Hz, HPF stays at 20Hz
    // Moving left (-): HPF sweeps up from 20Hz to 10kHz, LPF stays at 20kHz

    const RAMP = 0.03; // 30ms ramp for smooth sweeps

    if (this.filterPosition >= 0) {
      // LPF active: sweep 20kHz → 100Hz as position goes 0 → 1
      const lpfFreq = 20000 * Math.pow(100 / 20000, this.filterPosition);
      this.filterLPF.frequency.rampTo(lpfFreq, RAMP);
      // HPF fully open
      this.filterHPF.frequency.rampTo(20, RAMP);
    } else {
      // HPF active: sweep 20Hz → 10kHz as position goes 0 → -1
      const amount = -this.filterPosition; // 0..1
      const hpfFreq = 20 * Math.pow(10000 / 20, amount);
      this.filterHPF.frequency.rampTo(hpfFreq, RAMP);
      // LPF fully open
      this.filterLPF.frequency.rampTo(20000, RAMP);
    }
  }

  setFilterResonance(q: number): void {
    this.filterResonance = Math.max(0.5, Math.min(15, q));
    this.filterHPF.Q.rampTo(this.filterResonance, 0.05);
    this.filterLPF.Q.rampTo(this.filterResonance, 0.05);
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
    const patLen = this.replayer.getCurrentPatternLength();
    // Cap loop size to pattern length
    const effectiveSize = Math.min(size, patLen);
    // Quantize DOWN to nearest boundary so the loop captures the current phrase
    const startRow = Math.floor(currentRow / effectiveSize) * effectiveSize;
    this.replayer.setLineLoop(startRow, effectiveSize);
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

  /**
   * Set the audio loop in/out region (seconds). Both must be set for the
   * loop to activate.
   *
   * Quantize-aware: when this deck has an analysis-derived beat grid, the
   * loop in-point is snapped to the nearest beat and the loop length is
   * rounded to the nearest power-of-2 beats (1/4..16). Pass nulls to clear.
   */
  setAudioLoop(loopIn: number | null, loopOut: number | null): void {
    if (loopIn == null || loopOut == null) {
      this.audioPlayer.setLoopRegion(loopIn, loopOut);
      return;
    }

    let snappedIn = loopIn;
    let snappedOut = loopOut;
    const grid = useDJStore.getState().decks[this.id].beatGrid;
    if (grid && grid.bpm > 0) {
      snappedIn = snapPositionToBeat(this.id, loopIn, 'beat');
      const beatPeriod = 60 / grid.bpm;
      const lengthBeats = (loopOut - loopIn) / beatPeriod;
      const snappedBeats = snapLoopLength(lengthBeats);
      snappedOut = snappedIn + snappedBeats * beatPeriod;
    }

    this.audioPlayer.setLoopRegion(snappedIn, snappedOut);
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

  /** Get per-channel waveform data for oscilloscope display (128 samples each) */
  getChannelWaveforms(maxChannels = 4): Float32Array[] {
    return this.replayer.getChannelWaveforms(maxChannels);
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
    this.filterHPF.dispose();
    this.filterLPF.dispose();
    this.eq3.dispose();
    this.deckGain.dispose();
    try { this._brickwallLimiter?.disconnect(); } catch { /* already disconnected */ }
    try { this._reverbSend?.disconnect(); } catch { /* already disconnected */ }
    try { this._reverbNode?.disconnect(); } catch { /* already disconnected */ }
    try { this._reverbWet?.disconnect(); } catch { /* already disconnected */ }
  }
}
