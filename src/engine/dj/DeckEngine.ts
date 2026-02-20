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

    // Wire: deckGain → EQ3 → filter → channelGain → [output + meter]
    this.deckGain.connect(this.eq3);
    this.eq3.connect(this.filter);
    this.filter.connect(this.channelGain);
    this.channelGain.connect(options.outputNode);
    this.channelGain.connect(this.meter);

    // Create TrackerReplayer connected to our deckGain input
    this.replayer = new TrackerReplayer(this.deckGain);
  }

  // ==========================================================================
  // TRANSPORT
  // ==========================================================================

  async loadSong(song: TrackerSong): Promise<void> {
    this.replayer.loadSong(song);
    // Ensure WASM synths are ready for this song's instruments
    const engine = getToneEngine();
    await engine.ensureWASMSynthsReady(song.instruments);
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

  /** Set pitch offset in semitones. Updates playback rate and detune. */
  setPitch(semitones: number): void {
    const playbackRate = Math.pow(2, semitones / 12);
    const engine = getToneEngine();
    // For DJ decks, we set the playback rate per-deck via the replayer
    // The replayer's updateAllPlaybackRates will handle currently playing samples
    engine.setGlobalPlaybackRate(playbackRate);
    engine.setGlobalDetune(semitones * 100);
    this.replayer.updateAllPlaybackRates();
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

  dispose(): void {
    this.replayer.dispose();
    this.meter.dispose();
    this.channelGain.dispose();
    this.filter.dispose();
    this.eq3.dispose();
    this.deckGain.dispose();
  }
}
