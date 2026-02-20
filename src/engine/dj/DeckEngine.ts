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
  private channelGain: Tone.Gain;

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
