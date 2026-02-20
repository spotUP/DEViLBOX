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
import { ScratchPlayback, getPatternByName } from './DJScratchEngine';
import { DeckScratchBuffer } from './DeckScratchBuffer';

type FaderLFODivision = '1/4' | '1/8' | '1/16' | '1/32';

export type DeckId = 'A' | 'B';

export interface DeckEngineOptions {
  id: DeckId;
  outputNode: Tone.ToneAudioNode;
}

export class DeckEngine {
  readonly id: DeckId;
  readonly replayer: TrackerReplayer;

  // Audio chain nodes
  private deckGain: Tone.Gain;
  private eq3: Tone.EQ3;
  private filter: Tone.Filter;
  readonly channelGain: Tone.Gain;

  // Meter for VU display
  readonly meter: Tone.Meter;

  // Waveform analyser for scope display
  readonly waveformAnalyser: Tone.Analyser;

  // FFT analyser for visualizer display
  readonly fftAnalyser: Tone.FFT;

  // Instrument IDs from the currently loaded song (for output override cleanup)
  private currentSongInstrumentIds: number[] = [];

  // Track which Furnace engine keys this deck has rerouted (for cleanup)
  private routedFurnaceEngines: Set<string> = new Set();

  // Scratch
  private scratchPlayback: ScratchPlayback;
  /**
   * The canonical "rest" multiplier — always tracks the pitch slider value.
   * Both jog-wheel release and pattern stop decay back to this.
   */
  private restMultiplier = 1;
  private isScratchActive = false;   // true while jog wheel is physically held
  private decayRafId: number | null = null;

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

  constructor(options: DeckEngineOptions) {
    this.id = options.id;

    // Create the audio chain nodes (order: replayer → deckGain → EQ3 → filter → channelGain → output)
    this.deckGain = new Tone.Gain(1);
    this.eq3 = new Tone.EQ3({ low: 0, mid: 0, high: 0 });
    this.filter = new Tone.Filter({ type: 'lowpass', frequency: 20000, Q: 1 });
    this.channelGain = new Tone.Gain(1);
    this.meter = new Tone.Meter({ smoothing: 0.8 });
    this.waveformAnalyser = new Tone.Analyser('waveform', 256);
    this.fftAnalyser = new Tone.FFT(1024);

    // Wire: deckGain → EQ3 → filter → channelGain → [output + meter + analyser]
    this.deckGain.connect(this.eq3);
    this.eq3.connect(this.filter);
    this.filter.connect(this.channelGain);
    this.channelGain.connect(options.outputNode);
    this.channelGain.connect(this.meter);
    this.channelGain.connect(this.waveformAnalyser);
    this.channelGain.connect(this.fftAnalyser);

    // Create TrackerReplayer connected to our deckGain input
    this.replayer = new TrackerReplayer(this.deckGain);

    // Create ScratchPlayback (per-deck scratch pattern + fader LFO engine)
    this.scratchPlayback = new ScratchPlayback(
      () => this,
      () => this.getEffectiveBPM(),
    );

    // Wire TrackerReplayer scratch effect callback (Xnn pattern effect)
    this.replayer.onScratchEffect = (param: number) => this._handleScratchEffect(param);

    // Kick off async worklet init (non-blocking)
    void this._initScratchBuffer();
  }

  // ==========================================================================
  // SCRATCH BUFFER INIT (async, non-blocking)
  // ==========================================================================

  private async _initScratchBuffer(): Promise<void> {
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const bufferId: 0 | 1 = this.id === 'A' ? 0 : 1;
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
    this.unregisterOutputOverrides();
    this.restoreFurnaceRouting();

    const engine = getToneEngine();

    // Register output overrides BEFORE preloadInstruments so effect chains
    // route through the deck's audio chain on first build
    this.currentSongInstrumentIds = song.instruments.map(inst => inst.id);
    for (const id of this.currentSongInstrumentIds) {
      engine.setInstrumentOutputOverride(id, this.deckGain);
    }

    this.replayer.loadSong(song);
    this.songTimeIndex = this._buildTimeIndex(song);
    await engine.preloadInstruments(song.instruments);
    await engine.ensureWASMSynthsReady(song.instruments);

    // Reroute Furnace singleton engine output to this deck's deckGain
    // so Furnace audio goes through the deck's EQ, filter, and crossfader
    const nativeDeckGain = getNativeAudioNode(this.deckGain as any);
    if (nativeDeckGain) {
      for (const inst of song.instruments) {
        const synthType = inst.synthType || '';
        if (synthType.startsWith('Furnace')) {
          engine.rerouteNativeEngine('FurnaceChipEngine', nativeDeckGain);
          engine.rerouteNativeEngine('FurnaceDispatchEngine', nativeDeckGain);
          this.routedFurnaceEngines.add('FurnaceChipEngine');
          this.routedFurnaceEngines.add('FurnaceDispatchEngine');
          break; // Only need to detect once
        }
      }
    }
  }

  async play(): Promise<void> {
    await this.replayer.play();
  }

  pause(): void {
    this.replayer.pause();
  }

  resume(): void {
    this.replayer.resume();
  }

  stop(): void {
    this.replayer.stop();
  }

  isPlaying(): boolean {
    return this.replayer.isPlaying();
  }

  // ==========================================================================
  // CUE / SEEK
  // ==========================================================================

  cue(songPos: number, pattPos: number = 0): void {
    this.replayer.jumpToPosition(songPos, pattPos);
  }

  // ==========================================================================
  // PITCH / NUDGE
  // ==========================================================================

  /** Set pitch offset in semitones. Updates per-deck tempo and sample playback rates. */
  setPitch(semitones: number): void {
    const multiplier = Math.pow(2, semitones / 12);
    this.restMultiplier = multiplier;                // Always track — scratch/pattern restore target
    // Per-deck isolation: only touches this replayer's state, not ToneEngine globals
    this.replayer.setTempoMultiplier(multiplier);   // Changes scheduler speed
    this.replayer.setPitchMultiplier(multiplier);    // Changes sample playback rates
    this.replayer.setDetuneCents(semitones * 100);   // Changes synth pitch
  }

  /** Temporary BPM bump for beat matching */
  nudge(offset: number, ticks: number = 8): void {
    this.replayer.setNudge(offset, ticks);
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
  }

  /**
   * Set scratch velocity — signed float, 1.0 = normal forward speed.
   * Positive = forward, negative = backward.
   * Clamps to [-4, 4].
   */
  setScratchVelocity(velocity: number): void {
    const v = Math.max(-4, Math.min(4, velocity));
    if (v >= 0) {
      if (this.scratchDirection === -1) {
        // Transitioning from backward → forward
        void this._switchToForward(Math.max(0.02, v));
      } else {
        const fwdRate = Math.max(0.02, v);
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
   */
  stopScratch(decayMs = 200): void {
    if (!this.isScratchActive) return;
    this.isScratchActive = false;
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
    setTimeout(() => {
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

    // Special handling for BPM-synced patterns with custom fader scheduling
    const bpm = this.getEffectiveBPM();
    if (pattern.name === 'Transformer') {
      this.scratchPlayback.scheduleTransformerFader(bpm);
    } else if (pattern.name === 'Crab') {
      this.scratchPlayback.scheduleCrabFader(bpm);
    }

    this.scratchPlayback.play(pattern, onWaiting);
  }

  /** Stop the currently looping scratch pattern and restore speed to the pitch-slider value */
  stopPattern(): void {
    this.scratchPlayback.stopPattern();
    // Only restore if the jog wheel isn't actively being held (it has its own restore path)
    if (!this.isScratchActive) {
      this._decayToRest(300);
    }
  }

  /** Is a pattern waiting for quantize? */
  isPatternWaiting(): boolean {
    return this.scratchPlayback.isWaiting();
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

    if (Math.abs(this.filterPosition) < 0.05) {
      // Center dead zone — bypass filter
      this.filter.frequency.rampTo(20000, 0.05);
      this.filter.type = 'lowpass';
      return;
    }

    if (this.filterPosition > 0) {
      // Positive = LPF sweep (20kHz → 100Hz)
      this.filter.type = 'lowpass';
      const freq = 20000 * Math.pow(100 / 20000, this.filterPosition);
      this.filter.frequency.rampTo(freq, 0.05);
    } else {
      // Negative = HPF sweep (20Hz → 10kHz)
      this.filter.type = 'highpass';
      const amount = -this.filterPosition;
      const freq = 20 * Math.pow(10000 / 20, amount);
      this.filter.frequency.rampTo(freq, 0.05);
    }
  }

  setFilterResonance(q: number): void {
    this.filterResonance = Math.max(0.5, Math.min(15, q));
    this.filter.Q.rampTo(this.filterResonance, 0.05);
  }

  // ==========================================================================
  // VOLUME (channel fader)
  // ==========================================================================

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

  setSlipEnabled(enabled: boolean): void {
    this.replayer.setSlipEnabled(enabled);
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

  private restoreFurnaceRouting(): void {
    if (this.routedFurnaceEngines.size > 0) {
      const engine = getToneEngine();
      for (const key of this.routedFurnaceEngines) {
        engine.restoreNativeEngineRouting(key);
      }
      this.routedFurnaceEngines.clear();
    }
  }

  dispose(): void {
    this.unregisterOutputOverrides();
    this.restoreFurnaceRouting();
    this.scratchPlayback.dispose();
    this.scratchBuffer?.dispose();
    if (this.decayRafId !== null) {
      cancelAnimationFrame(this.decayRafId);
      this.decayRafId = null;
    }
    this.replayer.dispose();
    this.fftAnalyser.dispose();
    this.waveformAnalyser.dispose();
    this.meter.dispose();
    this.channelGain.dispose();
    this.filter.dispose();
    this.eq3.dispose();
    this.deckGain.dispose();
  }
}
