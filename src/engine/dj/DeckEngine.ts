/**
 * DeckEngine - One DJ deck: owns a TrackerReplayer + audio chain
 *
 * Audio chain: TrackerReplayer.masterGain → deckGain → isolator EQ → filter → channelGain → output
 *                                                                  ↘ reverbSend → scratch bus (wet part) → output (bypasses fader gate)
 *
 * The output node is provided by the DJMixerEngine (crossfader input).
 */

import * as Tone from 'tone';
import { TrackerReplayer, type TrackerSong } from '@/engine/TrackerReplayer';
import { getToneEngine } from '@/engine/ToneEngine';
import { getNativeAudioNode } from '@/utils/audio-context';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useDJStore } from '@/stores/useDJStore';
import { ScratchPlayback, getPatternByName, type PatternStart } from './DJScratchEngine';
import { snapPositionToBeat, snapLoopLength, phaseAlign } from './DJAutoSync';
import { getQuantizeMode } from './DJQuantizedFX';
import { DeckScratchBuffer } from './DeckScratchBuffer';
import { createScratchBus, type ScratchBus } from './scratch/scratchBus';
import { DeckAudioPlayer, DeckLoadSuperseded, type AudioFileInfo } from './DeckAudioPlayer';
import { DeckStemPlayer } from './DeckStemPlayer';
import { heardPositionSec, outputLatencySec } from '@/engine/audioLatency';
import { songRowTimeline, rowAtTime, timeAtRow, EMPTY_ROW_TIMELINE, type SongRowTimeline } from './songRowTimeline';
import { attachChannelScopes, channelScopesFor, channelScopeWindow, releaseChannelStems, DECK_SCOPE_CHANNELS, type ChannelScopeTrack } from './channelScopeTrack';
import { DeckChannelMute, bufferWithStems, stemCountOf } from './DeckChannelMute';
import { decodeStemsFlac } from './channelStemCodec';
import { DeckKeyLock } from './DeckKeyLock';
import { DeckIsolatorEQ } from './DeckIsolatorEQ';
import { createSafetyLimiter, type SafetyLimiter } from './djLimiter';
import { HEARD_DELAY_MAX_SEC, syncHeardDelay, type LatencySource } from '../audioLatency';
import { computeKeyLockShift } from './computeKeyLockShift';
import { afterPendingMix } from './stopPlayerNow';
import { TurntablePhysics } from '@/engine/turntable/TurntablePhysics';
import { clearPatternGuard } from '../keyboard/commands/djScratch';
import { recueDeck, type DeckRecueResult } from './scratch/deckRecue';
import type { DeckScratchSnapshot } from './scratch/scratchSnapshot';

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

/** The deck filter's open positions: biquads there pass the signal unchanged. */
const HPF_OPEN_HZ = 1;
const lpfOpenHz = (): number => Tone.getContext().sampleRate / 2;

export interface DeckEngineOptions {
  id: DeckId;
  outputNode: Tone.ToneAudioNode;
}

export class DeckEngine {
  readonly id: DeckId;
  readonly replayer: TrackerReplayer;
  readonly audioPlayer: DeckAudioPlayer;
  readonly stemPlayer: DeckStemPlayer;
  readonly physics: TurntablePhysics;
  private _playbackMode: PlaybackMode = 'audio';
  /** The tracker song the deck holds for its pattern data. Playback is always audio; this is not a mode. */
  private _loadedSong: TrackerSong | null = null;
  private _stemMode = false; // When true, stem player drives audio output
  /** Key lock (master tempo): when true, the pitch fader changes tempo only;
   *  sample pitch and synth detune stay at their original values. Tracker path
   *  uses replayer's native pitch/tempo split. WAV path uses the SoundTouch
   *  insert (see `keyLock` below). */
  private keyLockEnabled = false;
  /** SoundTouch-backed pitch-shift insert, sits between audioPlayer and
   *  deckGain on the WAV-playback path. Bypassed by default; engaged only
   *  when keyLockEnabled is true. Zero added latency when bypassed. */
  private keyLock: DeckKeyLock;
  /** Per-channel mute of rendered audio (DeckChannelMute): between the audio player and keyLock. */
  readonly channelMute: DeckChannelMute;
  private unsubscribeChannelMask: (() => void) | null = null;

  // Audio chain nodes
  private deckGain: Tone.Gain;
  private eq3: DeckIsolatorEQ;
  private filterHPF: Tone.Filter;
  private filterLPF: Tone.Filter;
  readonly channelGain: Tone.Gain;

  /**
   * Per-channel FX chains — one entry per channel routed through the
   * deck's EQ/filter via a side-tap. Set/updated by enableChannelFX;
   * cleared by disableChannelFX.
   *
   * Layout: tap.output → eq3 → hpf → lpf → channelGain
   *
   * The original channel is pulled from the main mix via
   * `replayer.setChannelFxRouted(ch, true)` so the two paths don't
   * double-sum.
   */
  private channelFXChains: Map<number, {
    tap: { output: GainNode; dispose(): void };
    eq3: DeckIsolatorEQ;
    hpf: Tone.Filter;
    lpf: Tone.Filter;
  }> = new Map();

  // Meter for VU display
  readonly meter: Tone.Meter;

  // Waveform analyser for scope display
  readonly waveformAnalyser: Tone.Analyser;

  // FFT analyser for visualizer display
  readonly fftAnalyser: Tone.FFT;

  // Instrument IDs from the currently loaded song (for output override cleanup)
  private currentSongInstrumentIds: number[] = [];

  /** Per-channel scope signal of the loaded audio (setChannelScopes). */
  private _channelScopes: ChannelScopeTrack | undefined;
  /** The rendered WAV bytes the deck's audio was loaded from (null for a double or a song-only load); a late scope track attaches only to the WAV it was rendered for. */
  private _loadedWav: ArrayBuffer | null = null;

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
  /** Captured at startScratch() — true if the deck was playing before the
   *  scratch began. Consumed by _switchToForward + stopScratch to decide
   *  whether to resume() the player on release. Scratching a STOPPED deck
   *  should go silent on release, not auto-start playback (2026-04-21
   *  user report). */
  private _wasPlayingAtScratchStart = false;
  private backwardPauseTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private decayRafId: number | null = null;
  /* Timeouts scheduled by stopScratch (hardReset + phase-align). Tracked so
   * dispose() can clear them — otherwise they fire on disposed audio nodes. */
  private _stopScratchTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

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
  /** When each played row of the loaded song starts (songRowTimeline: the one order walk). */
  private songTimeline: SongRowTimeline = EMPTY_ROW_TIMELINE;

  // EQ kill state (stored separately from gain values)
  private eqKillState = { low: false, mid: false, high: false };
  private eqValues = { low: 0, mid: 0, high: 0 }; // dB values before kill

  // Filter state
  private filterPosition = 0;  // -1 (HPF) to 0 (off) to +1 (LPF)
  private filterResonance = 1; // Q value

  // Current pitch state (for hot-swap)
  private _currentPitchSemitones = 0;

  // Repitch lock — when true, fader moves update the store visually but do
  // NOT change the audible rate. Unlocking re-applies the fader position.
  private _repitchLocked = false;

  // Slip mode for audio playback + scratch
  private _slipEnabled = false;
  private slipGhostPosition = 0;       // Where the track "would be" if not scratching/looping
  private slipGhostStartTime = 0;      // performance.now() when ghost started
  private slipGhostRate = 1;           // playback rate for ghost advancement

  // Raw native AudioParam for deckGain — bypasses Tone.Signal entirely
  // to avoid any Tone.js interception that corrupts automation during scratch.
  private _rawDeckGainParam: AudioParam | null = null;
  private _brickwallLimiter: SafetyLimiter | null = null;
  /** Delays feeding the scopes / the meter the heard signal (output latency). */
  private _scopeDelay: DelayNode | null = null;
  private _meterDelay: DelayNode | null = null;

  // Scratch/LFO reverb send — taps audio pre-fader, feeds through a short
  // reverb that bypasses the channelGain gate, creating a reverb tail that
  // bleeds through during fader chops.
  private _reverbSend: GainNode | null = null;
  /** The deck scratch send's space: the scratch bus, wet part only (one scratch channel, owner 2026-10-12). */
  private _scratchSpace: ScratchBus | null = null;
  private _reverbActive = false;
  // Auto DJ echo send (pre-fader feedback delay, returned past the channel gain).
  private _echoSend: GainNode | null = null;
  private _echoDelay: DelayNode | null = null;
  private _echoFeedback: GainNode | null = null;
  private _echoTone: BiquadFilterNode | null = null;
  private _echoWet: GainNode | null = null;

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

    // Create the audio chain nodes (order: replayer → deckGain → isolator EQ → HPF → LPF → channelGain → output)
    this.deckGain = new Tone.Gain(1);
    // Cache raw native AudioParam to bypass Tone.Signal for scratch gain transitions
    const nativeGain = getNativeAudioNode(this.deckGain as unknown as Record<string, unknown>);
    if (nativeGain && 'gain' in nativeGain) {
      this._rawDeckGainParam = (nativeGain as GainNode).gain;
    }
    this.eq3 = new DeckIsolatorEQ({ low: 0, mid: 0, high: 0 });
    this.filterHPF = new Tone.Filter({ type: 'highpass', frequency: HPF_OPEN_HZ, Q: 1, rolloff: -12 });
    this.filterLPF = new Tone.Filter({ type: 'lowpass', frequency: lpfOpenHz(), Q: 1, rolloff: -12 });
    this.channelGain = new Tone.Gain(1);
    this.meter = new Tone.Meter({ smoothing: 0.8 });
    this.waveformAnalyser = new Tone.Analyser('waveform', 256);
    this.fftAnalyser = new Tone.FFT(1024);

    // Wire: deckGain → isolator EQ → HPF → LPF → channelGain → limiter → [output + meter + analyser]
    try {
      this.deckGain.connect(this.eq3);
      this.eq3.connect(this.filterHPF);
      this.filterHPF.connect(this.filterLPF);
      this.filterLPF.connect(this.channelGain);
    } catch (err) {
      console.error('[DeckEngine] audio chain wiring failed:', err);
    }

    // Safety limiter (djLimiter.ts) — catches overs from internal gain
    // transients (rapid scratch transitions, Player source overlap); unity
    // gain below its threshold, so a deck at its tracker level is untouched.
    const ctx = Tone.getContext().rawContext as AudioContext;
    const safety = createSafetyLimiter(ctx);
    const limiter = safety.input;
    this._brickwallLimiter = safety;
    const nativeChannelGain = getNativeAudioNode(this.channelGain as unknown as Record<string, unknown>);
    const nativeOutput = getNativeAudioNode(options.outputNode as unknown as Record<string, unknown>);
    if (nativeChannelGain && nativeOutput) {
      nativeChannelGain.connect(limiter);
      safety.output.connect(nativeOutput);
    } else {
      // Fallback to Tone-level wiring when either node has no native handle
      // (e.g., test doubles) — bypasses the limiter but keeps audio flowing.
      this.channelGain.connect(options.outputNode);
    }
    // Visual taps read the HEARD signal: each goes through a delay of the
    // output latency (audioLatency.syncHeardDelay), else scopes and meters
    // lead the audio by outputLatency.
    // Analysers tap from channelGain (pre-limiter) for accurate waveform/spectrum display
    this._scopeDelay = ctx.createDelay(HEARD_DELAY_MAX_SEC);
    this._meterDelay = ctx.createDelay(HEARD_DELAY_MAX_SEC);
    this._syncHeardDelays();
    if (nativeChannelGain) {
      nativeChannelGain.connect(this._scopeDelay);
      Tone.connect(this._scopeDelay, this.waveformAnalyser);
      Tone.connect(this._scopeDelay, this.fftAnalyser);
    } else {
      this.channelGain.connect(this.waveformAnalyser);
      this.channelGain.connect(this.fftAnalyser);
    }
    // VU meter taps post-limiter to show actual output level
    const nativeMeterInput = getNativeAudioNode(this.meter as unknown as Record<string, unknown>);
    if (nativeMeterInput) {
      safety.output.connect(this._meterDelay);
      this._meterDelay.connect(nativeMeterInput);
    } else {
      this.channelGain.connect(this.meter);
    }

    // Scratch/LFO reverb send: taps pre-fader audio → short reverb → limiter
    // Bypasses channelGain so reverb tail bleeds through during fader chops.
    // Send gain starts at 0 (silent) — enabled when scratch/LFO effects are active.
    try {
      this._reverbSend = ctx.createGain();
      this._reverbSend.gain.value = 0;
      // the scratch channel's tape delay and room (wet part only: the deck is the dry signal)
      this._scratchSpace = createScratchBus(ctx, limiter, { wetOnly: true });

      const nativeLPF = getNativeAudioNode(this.filterLPF as unknown as Record<string, unknown>);
      if (nativeLPF) {
        nativeLPF.connect(this._reverbSend);
      }
      this._reverbSend.connect(this._scratchSpace.input);
    } catch (err) {
      console.warn('[DeckEngine] reverb send setup failed:', err);
    }

    // Auto DJ echo send: a feedback delay fed pre-fader, returned to the
    // limiter past the channel gain, so an echo-out keeps ringing after the
    // dry signal has left the mix (plan section 18). Silent until used.
    try {
      this._echoSend = ctx.createGain();
      this._echoSend.gain.value = 0;
      this._echoDelay = ctx.createDelay(2.0);
      this._echoDelay.delayTime.value = 0.375;
      this._echoFeedback = ctx.createGain();
      this._echoFeedback.gain.value = 0.55;
      this._echoTone = ctx.createBiquadFilter();
      this._echoTone.type = 'lowpass';
      this._echoTone.frequency.value = 4200;
      this._echoWet = ctx.createGain();
      this._echoWet.gain.value = 0.6;
      const nativeLPF2 = getNativeAudioNode(this.filterLPF as unknown as Record<string, unknown>);
      if (nativeLPF2) nativeLPF2.connect(this._echoSend);
      this._echoSend.connect(this._echoDelay);
      this._echoDelay.connect(this._echoTone);
      this._echoTone.connect(this._echoFeedback);
      this._echoFeedback.connect(this._echoDelay);
      this._echoTone.connect(this._echoWet);
      this._echoWet.connect(limiter);
    } catch (err) {
      console.warn('[DeckEngine] echo send setup failed:', err);
    }

    // Create TrackerReplayer connected to our deckGain input
    this.replayer = new TrackerReplayer(this.deckGain);
    this.replayer.setMuted(true); // Silent by default in DJ mode

    // Key-lock insert for the audio-player (WAV) path:
    //   audioPlayer → keyLock → deckGain
    // Bypassed by default; engaged when setKeyLock(true) is called on an
    // audio-mode deck. The tracker path bypasses it entirely since the
    // replayer has native pitch/tempo decoupling.
    this.keyLock = new DeckKeyLock();
    this.keyLock.output.connect(this.deckGain);
    // The store owns the setting (default on); the engine follows it from the first frame.
    this.keyLockEnabled = useDJStore.getState().decks[this.id]?.keyLockEnabled ?? false;
    this.syncKeyLockInsert();

    // Create AudioPlayer for audio file playback (MP3/WAV/FLAC etc.)
    // Output threads through the channel mute (stems of a rendered module)
    // into keyLock.input (bypass wire if key-lock is off).
    this.channelMute = new DeckChannelMute();
    this.channelMute.output.connect(this.keyLock.input);
    this.audioPlayer = new DeckAudioPlayer(this.channelMute.input);

    // The deck's channel mask (useDJStore decks[id].channelMask, written by the
    // deck buttons, keys and pads) is the one mute path: it reaches the
    // replayer and the rendered audio's channel mute from here.
    this.applyChannelMask(useDJStore.getState().decks[this.id]?.channelMask ?? 0xFFFF);
    this.unsubscribeChannelMask = useDJStore.subscribe(
      (state) => state.decks[this.id]?.channelMask,
      (mask) => { if (mask !== undefined) this.applyChannelMask(mask); },
    );

    // Create StemPlayer for multi-stem playback (same output point).
    // Starts muted — only audible when stem mode is explicitly enabled.
    this.stemPlayer = new DeckStemPlayer(this.keyLock.input);

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
        this._applyRestRate();
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

    // Clear any pattern-scratch state before the mode swap — leftover
    // patternScratchActive=true in audio mode suppresses reverb-send cleanup
    // (see _disableReverbSend guard).
    if (this.patternScratchActive) {
      this.stopPattern();
    }

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

  /**
   * Capture records the deck only while its source plays. A stopped deck's
   * capture would fill the tape with silence and carry the needle (the write
   * position) away from the last audio, so a backward scratch on a stopped
   * deck read silence. DJ decks always sound through the audio / stem player.
   */
  private _syncCaptureRunning(): void {
    const running = this._playbackMode !== 'audio'
      || this.audioPlayer.isCurrentlyPlaying()
      || this.stemPlayer.isPlaying();
    this.scratchBuffer?.setSourceRunning(running);
  }

  private async _initScratchBuffer(): Promise<void> {
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const bufferId = this.id === 'A' ? 0 : this.id === 'B' ? 1 : 2;
      this.scratchBuffer = new DeckScratchBuffer(ctx, bufferId);
      await this.scratchBuffer.init();
      // Capture from LPF output, play back directly to channelGain.
      this.scratchBuffer.wireIntoChain(this.filterLPF, this.channelGain);
      this.scratchBufferReady = true;
      this.audioPlayer.onRunningChange = () => this._syncCaptureRunning();
      this.stemPlayer.onRunningChange = () => this._syncCaptureRunning();
      this._syncCaptureRunning();
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
    this.syncKeyLockInsert();
    // The previous track's scope signal goes with it; the audio load that
    // follows brings this song's.
    this.setChannelScopes(undefined);
    this._loadedWav = null;

    // Clear pattern-scratch state from the previous track. Without this, a
    // stuck patternScratchActive=true would steer setScratchVelocity into
    // the pattern-scratch branch (line ~648) and suppress reverb-send
    // cleanup in stopFaderLFO (line ~1139) even though no pattern is live.
    this.patternScratchActive = false;
    this.patternScratchDir = 1;

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
    this._loadedSong = song;
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

    this.songTimeline = songRowTimeline(song);
    // The deck holds this song from here: the pattern view reads it now, not
    // when the audio load that follows writes the file name.
    useDJStore.getState().setDeckState(this.id, { songVersion: (useDJStore.getState().decks[this.id]?.songVersion ?? 0) + 1 });
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
    this.prepareAudioLoad();
    this._loadedWav = buffer;
    this.setChannelScopes(channelScopesFor(buffer));
    const info = await this.audioPlayer.loadAudioFile(buffer, filename, precomputedPeaks);
    await this.applyChannelStems();
    releaseChannelStems(this._channelScopes);
    // Fire-and-forget prime so the scratch ring buffer has content even
    // before the user presses play. Mirrors a real turntable: a loaded
    // record is scratch-audible regardless of motor state.
    void this._primeScratchBuffer();
    return info;
  }

  /**
   * Load a buffer another deck already decoded - a double of its track (plan
   * 2026-10-11-dj-juggling, P4.2). Same deck state as a file load, no decode.
   */
  async loadDecodedAudio(audioBuffer: AudioBuffer, originalBytes: ArrayBuffer | null, precomputedPeaks?: Float32Array, channelScopes?: ChannelScopeTrack, sourceWav?: ArrayBuffer | null): Promise<AudioFileInfo> {
    this.prepareAudioLoad();
    // A double plays the very WAV of its source: a scope track the source gains later belongs to it too.
    this._loadedWav = sourceWav ?? null;
    this.setChannelScopes(channelScopes);
    const info = await this.audioPlayer.loadDecodedBuffer(audioBuffer, originalBytes, precomputedPeaks);
    await this.applyChannelStems();
    releaseChannelStems(this._channelScopes);
    void this._primeScratchBuffer();
    return info;
  }

  /**
   * The per-channel scope signal of the loaded audio (channelScopeTrack.ts):
   * set with every audio load, none for audio without one.
   */
  private setChannelScopes(track: ChannelScopeTrack | undefined): void {
    this._channelScopes = track;
    useDJStore.getState().setDeckState(this.id, {
      channelScopeCount: track ? Math.min(DECK_SCOPE_CHANNELS, track.channels.length) : 0,
    });
  }

  /**
   * A scope track that arrived after the audio loaded (the background re-render
   * of an old-shape cache entry): attach it to the deck without touching the
   * audio or playback. Only when this deck still holds exactly `wav` and has no
   * track yet, so a deck that moved on to another track is left alone.
   */
  async attachLateChannelScopes(wav: ArrayBuffer, track: ChannelScopeTrack): Promise<boolean> {
    if (this._loadedWav !== wav || this.channelMute.stemCount > 0) return false;
    attachChannelScopes(wav, track);
    this.setChannelScopes(track);
    // A playing source keeps the buffer it started with; the stems sound from its next start (seek, cue, loop, play).
    // The caller releases the int16 stems once every deck holding `wav` has its buffer (DJChannelScopeRerender).
    await this.applyChannelStems();
    return true;
  }

  /**
   * Put the loaded track's channel stems behind its mix (bufferWithStems) and
   * wire the channel mute for them; the deck's current mask applies at once.
   */
  private async applyChannelStems(): Promise<void> {
    let buffer = this.audioPlayer.getAudioBuffer();
    // A double shares its source's buffer, stems and all; otherwise build it from the WAV and the
    // track's FLAC stems (decoded off the main thread).
    const flac = this._channelScopes?.flacStems;
    if (stemCountOf(buffer) === 0 && flac && flac.length > 0) {
      const wav = this._loadedWav;
      const decoded = await decodeStemsFlac(flac);
      if (this._loadedWav !== wav) throw new DeckLoadSuperseded('channel stems'); // another track loaded meanwhile
      const ctx = Tone.getContext().rawContext as unknown as BaseAudioContext;
      const withStems = bufferWithStems(ctx, wav, decoded);
      if (withStems) { this.audioPlayer.replaceBuffer(withStems); buffer = withStems; }
    }
    const n = stemCountOf(buffer);
    this.channelMute.setStemCount(n);
    this.channelMute.setMask(useDJStore.getState().decks[this.id]?.channelMask ?? 0xFFFF);
    useDJStore.getState().setDeckState(this.id, { channelStemCount: n });
  }

  /** The deck's channel mask (bit k set = channel k audible) on the replayer and the rendered audio. */
  private applyChannelMask(mask: number): void {
    this.replayer.setChannelMuteMask(mask);
    this.channelMute.setMask(mask);
  }

  /** Channels of the loaded rendered audio a mute reaches (stems behind the mix); 0 = none. */
  get channelStemCount(): number {
    return this.channelMute.stemCount;
  }

  /** The rendered WAV bytes the deck's audio came from (a double is loaded with its source's). */
  get loadedWav(): ArrayBuffer | null {
    return this._loadedWav;
  }

  /** The per-channel scope track of the loaded audio, if it has one (a double carries it to the other deck). */
  get channelScopes(): ChannelScopeTrack | undefined {
    return this._channelScopes;
  }

  /** What every audio load does first: stop, leave stem and pattern-scratch mode, switch the deck to audio. */
  private prepareAudioLoad(): void {
    // Stop any current playback
    this.replayer.stop();
    this.audioPlayer.stop();
    // Reset stem state from previous track
    if (this._stemMode) {
      this.stemPlayer.stop();
      this.stemPlayer.disable();
      this._stemMode = false;
    }
    // Clear all stem-related store state (mutes, dub sends) for new track;
    // a new track starts with every channel audible.
    useDJStore.getState().setDeckState(this.id, {
      channelMask: 0xFFFF,
      stemsAvailable: false,
      stemNames: [],
      stemMode: false,
      stemMutes: {},
      stemDubSends: {},
      stemSeparationProgress: null,
    });
    this._playbackMode = 'audio';
    this.syncKeyLockInsert();

    // Clear pattern-scratch state from previous track (see loadSong).
    this.patternScratchActive = false;
    this.patternScratchDir = 1;
  }

  /**
   * Fill the scratch ring buffer with the first ~150 ms of the loaded
   * audio so scratching a loaded-but-never-played deck is audible.
   *
   * Mechanism:
   *   1. Force channelGain to 0 (output silent — user hears nothing).
   *   2. Resume the audio player where it stands — audio flows through
   *      `keyLock → deckGain → filter → captureNode`. The captureNode
   *      is wired INLINE (wireIntoChain) and writes every incoming
   *      frame to the ring buffer regardless of whether downstream is
   *      audible.
   *   3. After ~150 ms (ring buffer is 2048 frames ≈ 46 ms at 44.1 kHz,
   *      so 150 ms is 3× safety margin), pause the player and seek it
   *      back to where it stood - or to the target of a real seek that
   *      landed meanwhile - so the next play starts where it was asked to.
   *   4. Restore channelGain.
   *
   * Guarded against: ongoing playback (priming would disrupt it), prior
   * in-flight priming (Dup call races), and scratch-buffer not yet ready
   * (async init may not have finished by the time loadAudioFile resolves —
   * in that case we briefly poll up to 500 ms before giving up).
   *
   * Fire-and-forget from callers — errors are swallowed so a prime
   * failure never bubbles into the load path.
   */
  private _primingScratchBuffer = false;
  private _primingCancelRequested = false;

  /**
   * Cancel scratch-buffer priming if active, and wait for it to finish.
   *
   * Must be called before any real play() — otherwise priming's temporary
   * resume()/pause() cycle races with play():
   *   1. Priming calls resume() → player appears 'started', gain=0
   *   2. play() sees 'started' → no-op
   *   3. Priming finishes → pause() stops the player → silence
   *
   * This was the root cause of Auto DJ fading before the next song played.
   */
  private async _cancelPrimingIfActive(): Promise<void> {
    if (!this._primingScratchBuffer) return;
    this._primingCancelRequested = true;
    // Spin-wait for priming to exit (≤150ms worst case — priming checks
    // the cancel flag in its wait loop and exits early).
    for (let i = 0; i < 50 && this._primingScratchBuffer; i++) {
      await new Promise(r => setTimeout(r, 5));
    }
    this._primingCancelRequested = false;
  }

  private async _primeScratchBuffer(): Promise<void> {
    if (this._primingScratchBuffer) return;
    if (this._playbackMode !== 'audio') return;
    if (this.audioPlayer.isCurrentlyPlaying()) return;

    this._primingScratchBuffer = true;
    this._primingCancelRequested = false;
    try {
      // Wait up to 500 ms for the scratch buffer worklet to initialise.
      for (let t = 0; !this.scratchBufferReady && t < 10; t++) {
        if (this._primingCancelRequested) return;
        await new Promise(r => setTimeout(r, 50));
      }
      if (!this.scratchBufferReady) return;
      if (this._primingCancelRequested) return;

      // Another play() may have landed while we were waiting; re-check.
      if (this.audioPlayer.isCurrentlyPlaying()) return;

      const ctx = Tone.getContext().rawContext as AudioContext;
      const now = ctx.currentTime;
      const gainParam = (this.channelGain.gain as unknown as { _param: AudioParam })._param
        ?? this.channelGain.gain;
      const prevValue = gainParam.value;

      // Silence the output for the priming window so the user hears nothing.
      gainParam.cancelScheduledValues(now);
      gainParam.setValueAtTime(0, now);

      // Prime from where the transport is and put it back there afterwards -
      // unless a real seek lands while priming holds the player (Auto DJ's
      // executor seeks the freshly loaded incoming deck to the planned entry
      // point right after the load): then that seek is where the player stays.
      // Priming used to seek to 0 on exit unconditionally, so the incoming
      // deck started at 0.0 instead of its planned entry, off the grid.
      const resumeAt = this.audioPlayer.getPosition();
      let ownSeekCount = this.audioPlayer.seekCount;
      try {
        this.audioPlayer.seek(resumeAt);
        ownSeekCount = this.audioPlayer.seekCount;
        const startAt = this.audioPlayer.resume() ?? ctx.currentTime;
        // Give the capture worklet time to fill the ring buffer. Ring is
        // 2048 frames ≈ 46 ms @ 44.1 kHz; 150 ms of audio is 3× safety margin
        // to survive scheduler jitter and the Tone.Player's 10 ms fadeIn. The
        // audio starts one Tone lookAhead after resume(), so count from there.
        // Check cancel flag in a tight loop instead of a single long sleep
        // so play() doesn't have to wait the full duration.
        for (let t = 0; t < 40 && ctx.currentTime < startAt + 0.15; t++) {
          if (this._primingCancelRequested) break;
          await new Promise(r => setTimeout(r, 10));
        }
      } finally {
        // Always pause + seek-back + restore gain, even if resume() threw.
        const soughtMeanwhile = this.audioPlayer.seekCount !== ownSeekCount;
        const restoreTo = soughtMeanwhile ? this.audioPlayer.lastSeekTarget : resumeAt;
        let silentAt = ctx.currentTime;
        try { silentAt = this.audioPlayer.pause(); } catch { /* ok */ }
        this.audioPlayer.seek(restoreTo);
        // Unmute only once the paused player's fade-out has finished, or the
        // tail of the priming playback is heard.
        const restoreAt = Math.max(silentAt, ctx.currentTime);
        gainParam.cancelScheduledValues(restoreAt);
        gainParam.setValueAtTime(prevValue, restoreAt);
      }
    } catch {
      // Swallow — priming is a nice-to-have; a failure shouldn't block load.
    } finally {
      this._primingScratchBuffer = false;
    }
  }

  get playbackMode(): PlaybackMode {
    return this._playbackMode;
  }

  async play(): Promise<void> {
    // Cancel scratch-buffer priming if active. Priming temporarily starts +
    // stops the player; if we don't cancel it first, our play() either no-ops
    // (player appears 'started' during priming) or gets undone (priming's
    // pause() fires after our start). This was the root cause of Auto DJ
    // fading to silence before the incoming track played.
    await this._cancelPrimingIfActive();

    if (this._playbackMode === 'audio') {
      console.log(`[DeckEngine] play() in audio mode (stem=${this._stemMode})`);
      if (this._stemMode) {
        this.stemPlayer.play();
      } else {
        await this.audioPlayer.play();
      }
    } else if (this._playbackMode === 'tracker') {
      console.log(`[DeckEngine] play() in tracker mode`);
      await this.replayer.play();
    } else {
      console.warn(`[DeckEngine] play() called in unknown mode: ${this._playbackMode}`);
    }
  }

  pause(): void {
    if (this._playbackMode === 'audio') {
      if (this._stemMode) {
        this.stemPlayer.pause();
      } else {
        this.audioPlayer.pause();
      }
    } else if (this._playbackMode === 'tracker') {
      this.replayer.pause();
    }
  }

  async resume(): Promise<void> {
    if (this._playbackMode === 'audio') {
      if (this._stemMode) {
        this.stemPlayer.play();
      } else {
        await this.audioPlayer.play();
      }
    } else if (this._playbackMode === 'tracker') {
      this.replayer.resume();
    }
  }

  stop(): void {
    this._endBend();
    if (this._playbackMode === 'audio') {
      if (this._stemMode) {
        this.stemPlayer.stop();
      } else {
        this.audioPlayer.stop();
      }
    } else if (this._playbackMode === 'tracker') {
      this.replayer.stop();
    }
  }

  isPlaying(): boolean {
    if (this._playbackMode === 'audio') {
      return this._stemMode
        ? this.stemPlayer.isPlaying()
        : this.audioPlayer.isCurrentlyPlaying();
    }
    return this.replayer.isPlaying();
  }

  // ==========================================================================
  // CUE / SEEK
  // ==========================================================================

  /**
   * Cue the deck to a time in the track, seconds, in either playback mode: an
   * audio deck (or its stems) seeks, a tracker deck jumps to the row playing at
   * that time. False when a tracker deck has no row at that time.
   */
  cueSeconds(sec: number): boolean {
    if (this._playbackMode === 'audio') { this.cue(sec); return true; }
    const at = this.getPositionAtTime(sec * 1000);
    if (!at) return false;
    this.cue(at.songPos, at.pattPos);
    return true;
  }

  cue(songPos: number, pattPos: number = 0): void {
    if (this._playbackMode === 'audio') {
      // In audio mode, songPos is treated as seconds
      if (this._stemMode) {
        this.stemPlayer.seek(songPos);
      } else {
        this.audioPlayer.seek(songPos);
      }
    } else {
      this.replayer.jumpToPosition(songPos, pattPos);
    }
  }

  // ==========================================================================
  // PITCH / NUDGE
  // ==========================================================================

  /** Set pitch offset in semitones. Updates per-deck tempo and sample playback rates. */
  setPitch(semitones: number): void {
    /* Clamp defensively so direct DSP callers (MIDI mapper, parameter router,
     * drumpad FX actions) cannot push the playback rate into aliased ranges
     * that produce buzzing / random noise. Matches useDJStore.setDeckPitch. */
    if (!Number.isFinite(semitones)) semitones = 0;
    if (semitones > 16) semitones = 16;
    else if (semitones < -16) semitones = -16;

    // Always track the fader position — needed so unlock can restore it.
    this._currentPitchSemitones = semitones;

    // While repitchLock is on: store updates and the fader moves visually,
    // but we don't touch the audio graph. restMultiplier is also held so
    // scratch recovery returns to the locked rate, not the fader position.
    if (this._repitchLocked) return;

    const multiplier = Math.pow(2, semitones / 12);
    this.restMultiplier = multiplier;                // Always track — scratch/pattern restore target

    // KEY LOCK: when on, pitch/detune are pinned to neutral so the audible
    // pitch stays at the track's original key. Tempo still follows the fader.
    //   - Tracker path: native via replayer.setPitchMultiplier(1.0) + setDetuneCents(0)
    //   - Audio (WAV) path: SoundTouch insert applies -semitones compensation
    //     via computeKeyLockShift(), cancelling playbackRate's pitch shift.
    const pitchMultiplier = this.keyLockEnabled ? 1.0 : multiplier;
    const detuneCents      = this.keyLockEnabled ? 0   : semitones * 100;

    if (this._playbackMode === 'audio') {
      this.audioPlayer.setPlaybackRate(multiplier);
      // Keep stem player rate in sync even when not active,
      // so mode switching preserves pitch.
      this.stemPlayer.setPlaybackRate(multiplier);
      // Tell SoundTouch how much to cancel — zero when key-lock is off (bypassed),
      // -semitones when on (so playbackRate's pitch shift is nulled out).
      const { pitchCompensate } = computeKeyLockShift(semitones, this.keyLockEnabled);
      this.keyLock.setPitchSemiTones(pitchCompensate);
      // Ensure tracker is reset to normal speed if it's still somehow running
      this.replayer.setTempoMultiplier(1.0);
      this.replayer.setPitchMultiplier(1.0);
      this.replayer.setDetuneCents(0);
    } else {
      // Per-deck isolation: only touches this replayer's state, not ToneEngine globals
      this.replayer.setTempoMultiplier(multiplier);     // Changes scheduler speed (always follows fader)
      this.replayer.setPitchMultiplier(pitchMultiplier); // Changes sample playback rates (pinned by key-lock)
      this.replayer.setDetuneCents(detuneCents);         // Changes synth pitch (pinned by key-lock)
      // Ensure audio player is reset
      this.audioPlayer.setPlaybackRate(1.0);
      this.keyLock.setPitchSemiTones(0);
    }
  }

  /**
   * Temporary push for beat matching: `offset` is +-% of speed (tracker: BPM
   * offset), `ticks` its length (one tick ~20 ms). A tracker deck nudges in
   * the replayer; an audio deck has no replayer running, so it bends its
   * playback rate.
   */
  nudge(offset: number, ticks: number = 8): void {
    if (this._playbackMode === 'audio') {
      this.bendRate(1 + offset * 0.01, ticks * DeckEngine.NUDGE_TICK_MS);
      return;
    }
    this.replayer.setNudge(offset, ticks);
  }

  /**
   * Press-and-hold nudge (the nudge buttons): the deck stays bent by `offset`
   * until releaseNudge(), like holding a CDJ pitch-bend button. A click-length
   * nudge() is too short to hear on a held button.
   */
  holdNudge(offset: number): void {
    if (this._playbackMode === 'audio') {
      this.bendRate(1 + offset * 0.01, null);
      return;
    }
    this.replayer.setNudge(offset, Number.MAX_SAFE_INTEGER);
  }

  /** End a held nudge: the deck returns to the fader rate. */
  releaseNudge(): void {
    if (this._playbackMode === 'audio') {
      this._endBend();
      return;
    }
    this.replayer.setNudge(0, 0);
  }

  /** Length of one nudge tick on an audio deck (a tracker tick at 125 BPM). */
  private static readonly NUDGE_TICK_MS = 20;
  /** Largest rate bend either way (a jog-wheel push, not a pitch move). */
  private static readonly MAX_BEND = 0.06;
  private _bendTimer: ReturnType<typeof setTimeout> | null = null;
  /** A bend with no end time is in force (a held nudge button). */
  private _bendHeld = false;

  /**
   * Temporary rate bend around the rest (fader) rate - a jog-wheel push.
   * Phase correction of a playing deck rides on this instead of a seek.
   * The store's pitch is not touched; after `durationMs` the deck returns to
   * the fader rate through setPitch (the one rate path). With key lock on
   * the bend keeps the key, like the fader does. `durationMs` null holds the
   * bend until _endBend (a held nudge button).
   */
  bendRate(ratio: number, durationMs: number | null): void {
    if (this._repitchLocked || this._isScratchActive || this.isPatternActive()) return;
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    const r = Math.max(1 - DeckEngine.MAX_BEND, Math.min(1 + DeckEngine.MAX_BEND, ratio));
    this._clearBendTimer();
    const bent = this.restMultiplier * r;
    if (this._playbackMode === 'audio') {
      this.audioPlayer.setPlaybackRate(bent);
      this.stemPlayer.setPlaybackRate(bent);
      const { pitchCompensate } = computeKeyLockShift(12 * Math.log2(bent), this.keyLockEnabled);
      this.keyLock.setPitchSemiTones(pitchCompensate);
    } else {
      this.replayer.setTempoMultiplier(bent);
    }
    if (durationMs === null) {
      this._bendHeld = true;
      return;
    }
    this._bendTimer = setTimeout(() => {
      this._bendTimer = null;
      // A scratch that took the deck meanwhile returns it to the rest rate itself.
      if (this._isScratchActive || this.isPatternActive()) return;
      this.setPitch(this._currentPitchSemitones);
    }, Math.max(0, durationMs));
  }

  /** End a bend now: the deck returns to the fader rate. */
  private _endBend(): void {
    if (this._bendTimer === null && !this._bendHeld) return;
    this._clearBendTimer();
    this.setPitch(this._currentPitchSemitones);
  }

  private _clearBendTimer(): void {
    this._bendHeld = false;
    if (this._bendTimer !== null) {
      clearTimeout(this._bendTimer);
      this._bendTimer = null;
    }
  }

  /**
   * Enable/disable key lock (master tempo).
   * When enabled, the pitch fader changes TEMPO only — sample pitch and synth
   * detune stay at their original values. Applied via two different routes:
   *   - Tracker path: replayer's native pitch/tempo split (no WASM needed).
   *   - Audio (WAV) path: SoundTouch insert compensates for playbackRate's
   *     pitch shift.
   * Re-applies the current pitch so the change takes effect without having
   * to jiggle the fader.
   */
  setKeyLock(enabled: boolean): void {
    if (this.keyLockEnabled === enabled) return;
    this.keyLockEnabled = enabled;
    this.syncKeyLockInsert();
    this.setPitch(this._currentPitchSemitones);
  }
  getKeyLock(): boolean { return this.keyLockEnabled; }

  /** The stretcher insert follows (key lock on AND audio path). The one place keyLock.setActive runs:
   *  called on every setKeyLock and wherever the playback mode is set (module load, audio load, hot swap). */
  private syncKeyLockInsert(): void {
    this.keyLock.setActive(this.keyLockEnabled && this._playbackMode === 'audio');
  }

  /**
   * Enable / disable repitch lock.
   *
   * When ON: the pitch fader updates the store (visual) but does NOT change
   * the audible rate — useful for sliding the fader to a target position
   * during a mix without the tempo/pitch jumping. Matches the SL-1200's
   * "pitch lock" button behavior.
   *
   * When OFF: re-applies the current fader position to audio immediately,
   * so the playback rate snaps to wherever the fader is sitting.
   */
  setRepitchLock(locked: boolean): void {
    if (this._repitchLocked === locked) return;
    if (locked) {
      this._repitchLocked = true;
      // No audio change — already playing at the fader's current pitch.
    } else {
      this._repitchLocked = false;
      // Re-sync audio to wherever the fader is now.
      this.setPitch(this._currentPitchSemitones);
    }
  }
  getRepitchLock(): boolean { return this._repitchLocked; }

  // ==========================================================================
  // SCRATCH
  // ==========================================================================


  // ── Heard position (the one source for every DJ visual) ──────────────────

  /**
   * Audio mode: the position the listener hears now - the player's position
   * minus the latency behind it at the current playback rate (audioLatency.ts):
   * the output latency plus, with key lock on, the SoundTouch processing
   * latency (~91 ms; a key-locked deck sounds that much later than it plays).
   * Every DJ visual (waveform playhead, beat grid, overview, turntable, lights
   * derived from the time index) reads this through the DJ store, and phase
   * correction (DJAutoSync) locks on it.
   */
  getHeardPosition(): number {
    const player = this._stemMode ? this.stemPlayer : this.audioPlayer;
    const ctx = Tone.getContext().rawContext as AudioContext;
    return heardPositionSec(player.getPosition(), player.getPlaybackRate(), outputLatencySec(ctx) + this.keyLock.latencySec());
  }

  /**
   * Tracker mode: the row the listener hears now, from the replayer's display
   * ring (queued at heard times by PlaybackCoordinator), with the elapsed time
   * at that row from the song time index. Null when the ring has nothing yet.
   */
  getHeardTrackerState(): { songPos: number; pattPos: number; elapsedMs: number | null } | null {
    const ctx = Tone.getContext().rawContext as AudioContext;
    const state = this.replayer.getStateAtTime(ctx.currentTime);
    if (!state) return null;
    const songPos = state.position;
    const pattPos = state.row;
    const into = state.duration > 0 ? (ctx.currentTime - state.time) / state.duration : 0;
    const elapsedMs = timeAtRow(this.songTimeline, songPos, pattPos, into);
    return { songPos, pattPos, elapsedMs };
  }

  /** Map elapsed ms to { songPos, pattPos } using the pre-built time index */
  getPositionAtTime(ms: number): { songPos: number; pattPos: number } | null {
    if (!this.replayer.getSong()) return null;
    return rowAtTime(this.songTimeline, ms);
  }

  /** Returns effective BPM: replayer BPM × tempo multiplier */
  getEffectiveBPM(): number {
    return this.replayer.getBPM() * this.replayer.getTempoMultiplier();
  }

  /** Enter scratch mode — cancels any in-progress decay and marks jog wheel as active */
  startScratch(): void {
    if (this._isScratchActive) return;
    this._isScratchActive = true;
    // Snapshot the play-state before scratch so release can restore it
    // correctly. If the deck was stopped, we intentionally DO NOT resume
    // the audio source (would trigger a motor-stop forward burst on
    // release via _switchToForward). Backward scratch on a stopped deck
    // still produces sound from the scratch ring buffer if it has
    // captured audio from a prior play session. Forward scratch on a
    // never-played deck is silent — no audio source to drive.
    this._wasPlayingAtScratchStart = this._playbackMode === 'audio'
      ? this.audioPlayer.isCurrentlyPlaying()
      : this.replayer.isPlaying?.() ?? false;
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
          // A forward push on a stopped deck plays the record, as a backward
          // pull does; release (stopScratch) pauses it again at once.
          if (!this.audioPlayer.isCurrentlyPlaying()) this.audioPlayer.resume();
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

    // Deck was stopped before scratch started → release immediately, no
    // decay and no backward→forward transition. Both of those paths would
    // leave the deck audibly playing forward for the decay window (~250 ms)
    // before hardReset's pause() lands, producing a "moves forward by
    // itself" burst on release (2026-04-21 user report).
    if (!this._wasPlayingAtScratchStart) {
      // Cancel any in-progress decay
      if (this.decayRafId !== null) {
        cancelAnimationFrame(this.decayRafId);
        this.decayRafId = null;
      }
      // Kill scratch buffer output + reset the backward-pause timer
      if (this.backwardPauseTimeoutId !== null) {
        clearTimeout(this.backwardPauseTimeoutId);
        this.backwardPauseTimeoutId = null;
      }
      if (this.scratchBufferReady && this.scratchBuffer) {
        const now = Tone.getContext().rawContext.currentTime;
        this.scratchBuffer.playbackGain.gain.cancelScheduledValues(now);
        this.scratchBuffer.playbackGain.gain.setValueAtTime(0, now);
        this.scratchBuffer.silenceAndStop();
      }
      // Pause the player directly — no decay back to restMultiplier.
      if (this._playbackMode === 'audio') {
        try { this.audioPlayer.pause(); } catch { /* ok */ }
        // Reset rate so a subsequent play() starts at 1x, not at scratch rate.
        this.audioPlayer.setPlaybackRate(this.restMultiplier);
      } else {
        try { this.replayer.pause(); } catch { /* ok */ }
        this._applyRestRate();
      }
      // Hard-set gain back to 1.0 — the channel is gated by play-state now.
      this._setDeckGain(1);
      this.scratchDirection = 1;
      return;
    }

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
      // incomplete _decayToRest animations or stale physics velocities.
      // Only reached when `_wasPlayingAtScratchStart` was true (the
      // stopped-deck path returns early above and doesn't schedule hardReset).
      if (this._playbackMode === 'audio') {
        this.audioPlayer.setPlaybackRate(this.restMultiplier);
      } else {
        this._applyRestRate();
      }
    };
    const resetTimer = setTimeout(() => {
      this._stopScratchTimeouts.delete(resetTimer);
      hardReset();
    }, decayMs + 50);
    this._stopScratchTimeouts.add(resetTimer);

    // After the decay settles, nudge this deck back onto the beat grid so a
    // scratch never leaves the deck out of phase with the master. Only fires
    // when quantize is on, the OTHER deck is currently playing with a beat
    // grid, and this deck has its own grid.
    const alignTimer = setTimeout(() => {
      this._stopScratchTimeouts.delete(alignTimer);
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
    this._stopScratchTimeouts.add(alignTimer);
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
      ? (this._stemMode ? this.stemPlayer.getPosition() : this.audioPlayer.getPosition()) * 1000
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
      const at = song ? rowAtTime(this.songTimeline, targetMs) : null;
      if (at) {
        this.replayer.seekTo(at.songPos, at.pattPos);
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
        this._applyRestRate();
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
        this.replayer.setPitchMultiplier(this.keyLockEnabled ? 1 : val);
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

  /** Where a scratch gesture's `crossfader` fader windows are performed
   *  (owner plan section 20); DJEngine wires the mixer crossfader. */
  setScratchCrossfaderSink(sink: ((position: number) => void) | null): void {
    this.scratchPlayback.setCrossfaderSink(sink);
  }

  /** Where the tracker `Xnn` scratch effect goes (owner scratch plan section
   *  81, one action path): DJEngine wires the DJ FX registry. */
  private scratchEffectSink: ((param: number, deck: DeckId) => boolean) | null = null;
  setScratchEffectSink(sink: ((param: number, deck: DeckId) => boolean) | null): void {
    this.scratchEffectSink = sink;
  }

  /** The state a scratch touches on this deck (owner scratch plan section 60). */
  captureScratchSnapshot(): DeckScratchSnapshot {
    return {
      rate: this._playbackMode === 'audio' ? this.audioPlayer.getPlaybackRate() : this.replayer.getTempoMultiplier(),
      channelGain: this.channelGain.gain.value,
      captureFrozen: this.scratchBuffer?.captureFrozen ?? false,
      suppressNotes: this.replayer.isSuppressNotes,
    };
  }

  /**
   * Give back what a scratch changed: only the fields given (the ones the scratch
   * touched), only the values that moved. The rate goes back to the deck's REST
   * (the pitch fader as it is now), not to the captured number: a pitch or sync
   * move made while the scratch ran is kept (scratch audit SA-M4), and key lock
   * keeps the pitch (SA-m6). `suppressNotes` is never forced (2026-09-30:
   * forcing it off froze the pattern view of WASM-played songs): the snapshot
   * verifies it, the replayer owns it.
   */
  restoreScratchSnapshot(s: Partial<DeckScratchSnapshot>): void {
    const now = this.captureScratchSnapshot();
    if (s.rate !== undefined && Math.abs(now.rate - this.restMultiplier) > 1e-3) this._applyRestRate();
    if (s.channelGain !== undefined && Math.abs(now.channelGain - s.channelGain) > 1e-3) {
      this.releaseChannelGainParam();
      this.channelGain.gain.value = s.channelGain;
    }
    if (s.captureFrozen !== undefined && now.captureFrozen !== s.captureFrozen) {
      if (s.captureFrozen) this.scratchBuffer?.freezeCapture(); else this.scratchBuffer?.unfreezeCapture();
    }
  }

  /** The deck at its rest rate: the pitch fader's multiplier; under key lock a tracker's pitch stays 1. */
  private _applyRestRate(): void {
    if (this._playbackMode === 'audio') {
      this.audioPlayer.setPlaybackRate(this.restMultiplier);
    } else {
      this.replayer.setTempoMultiplier(this.restMultiplier);
      this.replayer.setPitchMultiplier(this.keyLockEnabled ? 1 : this.restMultiplier);
    }
  }

  /**
   * True re-cue (owner scratch plan section 18): put the deck's play position
   * back on `anchorSec` inside a returns-to-anchor gesture's closed fader
   * window; see `recueDeck` for the rule and the result.
   */
  recueScratch(anchorSec: number): DeckRecueResult {
    return recueDeck({
      playbackMode: this._playbackMode === 'audio' ? 'audio' : 'tracker',
      isFaderWindowClosed: () => this.scratchPlayback.currentFaderGain === 0,
      seekAudio: (sec) => { this.cueSeconds(sec); },
      cueTracker: (sec) => this.cueSeconds(sec),
      resetRing: () => this.scratchBuffer?.resetCapture(),
      isBending: () => this._bendTimer !== null || this._bendHeld,
    }, anchorSec);
  }

  /** Play a named scratch pattern (with optional beat quantization); `start` = a planned stroke (phase, cycles, velocity). */
  playPattern(name: string, onWaiting?: (ms: number) => void, start?: PatternStart): void {
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

    this.scratchPlayback.play(pattern, onWaiting, start);

    // Cut-grid gestures (Transformer / Crab / Eight-Finger Crab) schedule
    // their fader windows on the AudioParam — must run AFTER `play()`
    // because `play()` begins with a stopPattern() that cancels all
    // scheduled gain values. Scheduling before play would leave the fader
    // stuck at 1 (no chopping) — they would sound like normal playback.
    this.scratchPlayback.schedulePatternFader(pattern, this.getEffectiveBPM(), start);

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
    this._applyRestRate();
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

  // ==========================================================================
  // AUTO DJ SENDS (echo-out, reverb-out): pre-fader, returned past the fader
  // ==========================================================================

  /** Echo send level 0..1 (ramped 20 ms). The tail keeps ringing after the dry signal leaves. */
  setEchoSend(level: number): void {
    if (!this._echoSend) return;
    const v = Math.max(0, Math.min(1, level));
    // Never ahead of a pending crossfader move (a hand-back resets the sends of a deck still heard).
    const now = afterPendingMix();
    const g = this._echoSend.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(v, now + 0.02);
  }

  getEchoSend(): number { return this._echoSend ? this._echoSend.gain.value : 0; }

  /** Echo time in seconds (beat-synced by the caller) and feedback 0..0.95. */
  setEchoParams(timeSec: number, feedback: number): void {
    if (!this._echoDelay || !this._echoFeedback) return;
    const now = Tone.getContext().rawContext.currentTime;
    const t = Math.max(0.02, Math.min(2, timeSec));
    this._echoDelay.delayTime.cancelScheduledValues(now);
    this._echoDelay.delayTime.setValueAtTime(this._echoDelay.delayTime.value, now);
    this._echoDelay.delayTime.linearRampToValueAtTime(t, now + 0.05);
    const fb = Math.max(0, Math.min(0.95, feedback));
    this._echoFeedback.gain.cancelScheduledValues(now);
    this._echoFeedback.gain.setValueAtTime(this._echoFeedback.gain.value, now);
    this._echoFeedback.gain.linearRampToValueAtTime(fb, now + 0.05);
  }

  /** Reverb send level 0..1 for Auto DJ reverb-outs (the scratch reverb send, driven directly). */
  setReverbSend(level: number): void {
    if (!this._reverbSend) return;
    const v = Math.max(0, Math.min(1, level));
    // Never ahead of a pending crossfader move (a hand-back resets the sends of a deck still heard).
    const now = afterPendingMix();
    const g = this._reverbSend.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(v, now + 0.03);
    this._reverbActive = v > 0;
  }

  getReverbSend(): number { return this._reverbSend ? this._reverbSend.gain.value : 0; }

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

    if (hi === 0x0 || hi === 0x2) {
      // Scratch pattern slot (X00 stop, X01-X0F slots 1-15, X20-X2F slots 16+):
      // through the registry sink, never a direct pattern call.
      this.scratchEffectSink?.(param, this.id);
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

  setEQ(band: 'low' | 'mid' | 'high', dB: number, rampSec = 0.015): void {
    const clamped = Math.max(-12, Math.min(12, dB));
    this.eqValues[band] = clamped;
    if (!this.eqKillState[band]) {
      // Always ramp, even for knob twists — Tone.Signal.value = x is a zero-time
      // step that clicks audibly when the delta is large (e.g. EQ preset 0 → +9).
      // 15ms is short enough to feel instant for knob drags (smooths zipper
      // noise without perceived lag); preset jumps pass a longer ramp for a
      // proper audible crossfade.
      this.eq3[band].rampTo(clamped, rampSec);
      // Mirror into any active per-channel chains so targeted channels
      // sweep alongside the deck knob.
      for (const chain of this.channelFXChains.values()) {
        chain.eq3[band].rampTo(clamped, rampSec);
      }
    }
  }

  setEQKill(band: 'low' | 'mid' | 'high', kill: boolean): void {
    this.eqKillState[band] = kill;
    // Ramp over 3ms to avoid digital click/pop on instant kill toggle
    this.eq3[band].rampTo(kill ? -Infinity : this.eqValues[band], 0.003);
    for (const chain of this.channelFXChains.values()) {
      chain.eq3[band].rampTo(kill ? -Infinity : this.eqValues[band], 0.003);
    }
  }

  getEQKill(band: 'low' | 'mid' | 'high'): boolean {
    return this.eqKillState[band];
  }

  // ==========================================================================
  // STEM PLAYBACK
  // ==========================================================================

  /**
   * Load separated stems for playback.
   * Does NOT enable stem mode — call setStemMode(true) explicitly.
   */
  async loadStems(result: import('../demucs/types').StemResult, sampleRate: number): Promise<void> {
    const stemNames = await this.stemPlayer.loadStems(result, sampleRate);
    useDJStore.getState().setDeckState(this.id, {
      stemsAvailable: true,
      stemNames,
      stemMutes: Object.fromEntries(stemNames.map(n => [n, false])),
      stemDubSends: {},
    });
    console.log(`[DeckEngine ${this.id}] Stems loaded: ${stemNames.join(', ')}`);
  }

  /**
   * Toggle stem playback mode.
   * When enabled: mutes audioPlayer, enables stemPlayer at current position.
   * When disabled: mutes stemPlayer, resumes audioPlayer at current position.
   */
  setStemMode(enabled: boolean): void {
    if (enabled === this._stemMode) return;
    if (enabled && !this.stemPlayer.isLoaded()) {
      console.warn(`[DeckEngine ${this.id}] Cannot enable stem mode — no stems loaded`);
      return;
    }
    if (this._playbackMode !== 'audio') {
      console.warn(`[DeckEngine ${this.id}] Stem mode only works in audio playback mode`);
      return;
    }

    const wasPlaying = this.audioPlayer.isCurrentlyPlaying() || this.stemPlayer.isPlaying();
    const position = enabled
      ? this.audioPlayer.getPosition()
      : this.stemPlayer.getPosition();
    const rate = enabled
      ? this.audioPlayer.getPlaybackRate()
      : this.stemPlayer.getPlaybackRate();

    this._stemMode = enabled;

    if (enabled) {
      // Transfer state from audioPlayer to stemPlayer
      this.audioPlayer.pause();
      this.stemPlayer.setPlaybackRate(rate);
      this.stemPlayer.enable();
      // Sync loop region
      const loopIn = this.audioPlayer.getLoopIn();
      const loopOut = this.audioPlayer.getLoopOut();
      this.stemPlayer.setLoopRegion(loopIn, loopOut);
      if (wasPlaying) {
        this.stemPlayer.play(position);
      } else {
        this.stemPlayer.seek(position);
      }
    } else {
      // Transfer state from stemPlayer to audioPlayer
      this.stemPlayer.pause();
      this.stemPlayer.disable();
      this.audioPlayer.seek(position);
      if (wasPlaying) {
        void this.audioPlayer.play();
      }
    }

    useDJStore.getState().setDeckState(this.id, { stemMode: enabled });
  }

  /** Whether stem playback is currently active. */
  isStemMode(): boolean { return this._stemMode; }

  /** Mute/unmute an individual stem. */
  setStemMute(stemName: string, muted: boolean): void {
    this.stemPlayer.setStemMute(stemName, muted);
    const currentMutes = { ...useDJStore.getState().decks[this.id].stemMutes };
    currentMutes[stemName] = muted;
    useDJStore.getState().setDeckState(this.id, { stemMutes: currentMutes });
  }

  /**
   * Open a tap on an individual stem's GainNode for dub bus routing.
   * Creates an intermediate GainNode so the caller can disconnect
   * without affecting the main stem playback chain.
   */
  openStemTap(stemName: string): { output: GainNode; dispose(): void } | null {
    if (!this._stemMode || !this.stemPlayer.isLoaded()) return null;
    const stemGain = this.stemPlayer.getStemGainNode(stemName);
    if (!stemGain) return null;
    const ctx = stemGain.context as AudioContext;
    const tap = ctx.createGain();
    tap.gain.value = 1;
    stemGain.connect(tap);
    return {
      output: tap,
      dispose: () => {
        try { stemGain.disconnect(tap); } catch { /* ok */ }
        try { tap.disconnect(); } catch { /* ok */ }
      },
    };
  }

  // ==========================================================================
  // FILTER (single knob: -1 = HPF, 0 = off, +1 = LPF)
  // ==========================================================================

  setFilterPosition(position: number): void {
    this.filterPosition = Math.max(-1, Math.min(1, position));

    // Both filters are always in the chain: eq3 → HPF → LPF → channelGain
    // The filter on the inactive side is fully OPEN, not parked at 20 Hz /
    // 20 kHz: a resonant biquad parked there is audible (Q 1 dB peaks, the
    // low end lifted ~1-3 dB near 30 Hz and the top near 15 kHz), so the
    // centred knob coloured every deck. Open = HPF at ~1 Hz, LPF at Nyquist,
    // where the biquads pass the signal unchanged.
    // Moving right (+): LPF sweeps down from 20kHz to 100Hz, HPF open
    // Moving left (-): HPF sweeps up from 20Hz to 10kHz, LPF open

    const RAMP = 0.03; // 30ms ramp for smooth sweeps

    let lpfTarget: number;
    let hpfTarget: number;
    if (this.filterPosition > 0) {
      // LPF active: sweep 20kHz → 100Hz as position goes 0 → 1
      lpfTarget = Math.max(80, 20000 * Math.pow(100 / 20000, this.filterPosition));
      hpfTarget = HPF_OPEN_HZ;
    } else if (this.filterPosition < 0) {
      // HPF active: sweep 20Hz → 10kHz as position goes 0 → -1
      const amount = -this.filterPosition; // 0..1
      hpfTarget = Math.min(18000, 20 * Math.pow(10000 / 20, amount));
      lpfTarget = lpfOpenHz();
    } else {
      hpfTarget = HPF_OPEN_HZ;
      lpfTarget = lpfOpenHz();
    }
    this.filterLPF.frequency.rampTo(lpfTarget, RAMP);
    this.filterHPF.frequency.rampTo(hpfTarget, RAMP);
    // Mirror sweeps into active per-channel chains.
    for (const chain of this.channelFXChains.values()) {
      chain.lpf.frequency.rampTo(lpfTarget, RAMP);
      chain.hpf.frequency.rampTo(hpfTarget, RAMP);
    }
  }

  setFilterResonance(q: number): void {
    this.filterResonance = Math.max(0.5, Math.min(10, q));
    this.filterHPF.Q.rampTo(this.filterResonance, 0.05);
    this.filterLPF.Q.rampTo(this.filterResonance, 0.05);
    for (const chain of this.channelFXChains.values()) {
      chain.hpf.Q.rampTo(this.filterResonance, 0.05);
      chain.lpf.Q.rampTo(this.filterResonance, 0.05);
    }
  }

  /** Current filter position: -1 (HPF fully closed) … 0 (bypass) … +1 (LPF fully closed). */
  getFilterPosition(): number {
    return this.filterPosition;
  }

  // ==========================================================================
  // VOLUME (channel fader) + TRIM (auto-gain)
  // ==========================================================================

  /** Set the trim/auto-gain level in dB (applied to deckGain node) */
  setTrimGain(dB: number): void {
    const linear = Math.pow(10, dB / 20);
    this.deckGain.gain.rampTo(Math.max(0, Math.min(8, linear)), 0.05);
  }

  setVolume(value: number): void {
    this.channelGain.gain.rampTo(Math.max(0, Math.min(1.0, value)), 0.02);
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

  /** Keep the visual taps' delay at the current output latency. */
  private _syncHeardDelays(): void {
    const ctx = Tone.getContext().rawContext as unknown as LatencySource;
    if (this._scopeDelay) syncHeardDelay(this._scopeDelay, ctx);
    if (this._meterDelay) syncHeardDelay(this._meterDelay, ctx);
  }

  getLevel(): number {
    this._syncHeardDelays();
    return this.meter.getValue() as number;
  }

  // ==========================================================================
  // LOOP / SLIP (delegates to TrackerReplayer)
  // ==========================================================================

  setLineLoop(size: number): void {
    const currentRow = this.replayer.getCurrentRow();
    const patLen = this.replayer.getEffectivePatternLength();
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
    this._syncHeardDelays();
    return this.waveformAnalyser.getValue() as Float32Array;
  }

  /**
   * Per-channel waveforms for the deck scopes, at the position the listener
   * hears: the window of the loaded audio's scope track (rendered with it,
   * channelScopeTrack.ts) ending at getHeardPosition(). A replayer playing
   * live (tracker mode) reads its own channel analysers. Empty when the deck
   * has no per-channel signal.
   */
  getChannelWaveforms(maxChannels = DECK_SCOPE_CHANNELS): Float32Array[] {
    if (this._playbackMode === 'audio') {
      return this._channelScopes ? channelScopeWindow(this._channelScopes, this.getHeardPosition(), maxChannels) : [];
    }
    return this.replayer.getChannelWaveforms(maxChannels);
  }

  /**
   * Number of tracker channels in the loaded song. Returns 0 in audio
   * playback mode (no tracker song → no channels).
   */
  getChannelCount(): number {
    if (this._playbackMode !== 'tracker') return 0;
    return this.replayer.getChannelCount();
  }

  /**
   * Read-only access to the tracker song the deck holds for its pattern data.
   * Null when the track on the deck came without a song (an MP3, a WAV).
   * Playback is always audio, so this does not depend on the playback mode:
   * Auto DJ's chord deferral and Smart Cuts read the song through it, and
   * with a mode check they never saw one.
   */
  getLoadedSong(): TrackerSong | null {
    return this._loadedSong;
  }

  /** Forget the held song: the track now on the deck has none. */
  clearLoadedSong(): void {
    this._loadedSong = null;
  }

  /**
   * Open a per-channel side-tap on the loaded tracker song. The returned
   * GainNode carries a copy of that channel's audio in parallel with the
   * main mix — the deck's master output is unchanged.
   *
   * Returns null in audio mode (no channel concept) or when the channel
   * index is out of range. Callers must call dispose() when done.
   */
  openChannelTap(channelIndex: number): { output: GainNode; dispose(): void } | null {
    if (this._playbackMode !== 'tracker') return null;
    return this.replayer.openChannelTap(channelIndex);
  }

  // ==========================================================================
  // PER-CHANNEL FX ROUTING (fxTargetChannels audio layer)
  // ==========================================================================

  /**
   * Route a set of channels through their own EQ+HPF+LPF chain instead
   * of the deck's main chain. Targeted channels are pulled from the main
   * mix (via `replayer.setChannelFxRouted(ch, true)`) and re-enter via
   * `channelGain` after the per-channel chain, so the deck's volume /
   * crossfade / analyser stages still apply.
   *
   * Calling with a different set of channels grows/shrinks the active
   * chains incrementally — re-enabling an already-routed channel is a
   * no-op. Audio-file mode no-ops (the channel tap API returns null).
   *
   * Trade-off: per-channel chains tap ch.gainNode directly, bypassing
   * the deck's `deckGain` (auto-gain / trim). For fx-target use cases
   * this is acceptable — the deck trim is close to unity most of the
   * time. Fixing it later = add a per-channel trim mirror updated in
   * setTrimGain.
   */
  enableChannelFX(channels: number[]): void {
    if (this._playbackMode !== 'tracker') return;
    const wanted = new Set(channels);
    // Tear down chains for channels no longer in the wanted set.
    for (const [ch, chain] of this.channelFXChains) {
      if (!wanted.has(ch)) this._disposeChannelFXChain(ch, chain);
    }
    // Open new chains.
    for (const ch of wanted) {
      if (this.channelFXChains.has(ch)) continue;
      const tap = this.replayer.openChannelTap(ch);
      if (!tap) continue;

      const eq3 = new DeckIsolatorEQ({
        low: this.eqKillState.low ? -Infinity : this.eqValues.low,
        mid: this.eqKillState.mid ? -Infinity : this.eqValues.mid,
        high: this.eqKillState.high ? -Infinity : this.eqValues.high,
      });
      const hpfFreq = this.filterHPF.frequency.value;
      const lpfFreq = this.filterLPF.frequency.value;
      const hpf = new Tone.Filter({
        type: 'highpass',
        frequency: hpfFreq,
        Q: this.filterResonance,
        rolloff: -12,
      });
      const lpf = new Tone.Filter({
        type: 'lowpass',
        frequency: lpfFreq,
        Q: this.filterResonance,
        rolloff: -12,
      });

      // Wire tap.output (native GainNode) into the isolator EQ. `connect` on
      // a native GainNode accepts native destinations; getNativeAudioNode
      // unwraps the EQ's input.
      try {
        const eqIn = getNativeAudioNode(eq3 as unknown as Record<string, unknown>);
        if (eqIn) tap.output.connect(eqIn);
        else {
          // Fallback: Tone-to-Tone wiring would require wrapping the tap
          // in Tone.Gain. If we can't unwrap the EQ, bail and tear down.
          try { tap.dispose(); } catch { /* ok */ }
          try { eq3.dispose(); hpf.dispose(); lpf.dispose(); } catch { /* ok */ }
          continue;
        }
        eq3.connect(hpf);
        hpf.connect(lpf);
        lpf.connect(this.channelGain);
      } catch (e) {
        console.warn(`[DeckEngine] enableChannelFX(${ch}) connect failed:`, e);
        try { tap.dispose(); } catch { /* ok */ }
        try { eq3.dispose(); hpf.dispose(); lpf.dispose(); } catch { /* ok */ }
        continue;
      }

      // Pull the channel from the main mix.
      this.replayer.setChannelFxRouted(ch, true);
      this.channelFXChains.set(ch, { tap, eq3, hpf, lpf });
    }
  }

  /** Tear down all active per-channel FX chains and restore those channels to the main mix. */
  disableChannelFX(): void {
    for (const [ch, chain] of this.channelFXChains) {
      this._disposeChannelFXChain(ch, chain);
    }
    this.channelFXChains.clear();
  }

  private _disposeChannelFXChain(
    ch: number,
    chain: { tap: { dispose(): void }; eq3: DeckIsolatorEQ; hpf: Tone.Filter; lpf: Tone.Filter },
  ): void {
    // Un-route before disposing audio nodes so there's no "click" — the
    // replayer ramps fxRouteGain back to 1 over 10 ms and the tap still
    // carries audio for those 10 ms.
    try { this.replayer.setChannelFxRouted(ch, false); } catch { /* ok */ }
    try { chain.tap.dispose(); } catch { /* ok */ }
    try { chain.eq3.dispose(); } catch { /* ok */ }
    try { chain.hpf.dispose(); } catch { /* ok */ }
    try { chain.lpf.dispose(); } catch { /* ok */ }
    this.channelFXChains.delete(ch);
  }

  /** True when at least one channel is actively FX-routed. */
  hasChannelFX(): boolean {
    return this.channelFXChains.size > 0;
  }

  /** Get FFT data (1024 bins, dB values -100 to 0) */
  getFFT(): Float32Array {
    this._syncHeardDelays();
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
    this.unsubscribeChannelMask?.();
    this.unsubscribeChannelMask = null;
    this.channelMute.dispose();
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
    // Cancel any pending scratch-reset / phase-align timers so they can't
    // fire on disposed audio nodes.
    for (const t of this._stopScratchTimeouts) clearTimeout(t);
    this._stopScratchTimeouts.clear();
    this._clearBendTimer();
    // Tear down any per-channel FX chains before disposing the replayer
    // (chain disposal calls replayer.setChannelFxRouted which needs the
    // replayer still alive).
    this.disableChannelFX();
    this.replayer.dispose();
    this.audioPlayer.dispose();
    this.stemPlayer.dispose();
    this.fftAnalyser.dispose();
    this.waveformAnalyser.dispose();
    this.meter.dispose();
    this.channelGain.dispose();
    this.filterHPF.dispose();
    this.filterLPF.dispose();
    this.eq3.dispose();
    this.deckGain.dispose();
    try { this._brickwallLimiter?.disconnect(); } catch { /* already disconnected */ }
    try { this._scopeDelay?.disconnect(); } catch { /* already disconnected */ }
    try { this._meterDelay?.disconnect(); } catch { /* already disconnected */ }
    try { this._reverbSend?.disconnect(); } catch { /* already disconnected */ }
    try { this._scratchSpace?.dispose(); } catch { /* already disconnected */ }
  }
}
