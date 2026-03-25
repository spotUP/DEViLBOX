/**
 * Delta Music 2.0 tick simulator.
 *
 * Simulates volume table (multi-phase), vibrato table, and pitch bend.
 *
 * Reference: NostalgicPlayer DeltaMusic20Worker.cs ProcessChannel()
 */

import type { DeltaMusic2Config } from '../../src/types/instrument/exotic';
import type { ISynthSimulator, SynthTickState } from './SynthSimulator';
import { semitoneToAmigaPeriod } from './SynthSimulator';

export class DeltaMusic2SynthSim implements ISynthSimulator {
  private config!: DeltaMusic2Config;
  private basePeriod = 428;
  private skipPatternEffects = false;

  // Volume table
  private volPhaseIdx = 0;
  private volCounter = 0;
  private volSustainCounter = 0;
  private volume = 0;

  // Vibrato table
  private vibPhaseIdx = 0;
  private vibCounter = 0;
  private vibDelayCounter = 0;
  private vibSustainCounter = 0;
  private vibOffset = 0;

  // Pitch bend
  private bendAccum = 0;

  // Waveform
  private waveform!: Int8Array;

  init(config: unknown, baseNote: number, skipPatternEffects = false): void {
    this.config = config as DeltaMusic2Config;
    this.basePeriod = semitoneToAmigaPeriod(baseNote);
    this.skipPatternEffects = skipPatternEffects;

    this.volPhaseIdx = 0;
    this.volCounter = 0;
    this.volSustainCounter = 0;
    this.volume = 0;

    this.vibPhaseIdx = 0;
    this.vibCounter = 0;
    this.vibDelayCounter = 0;
    this.vibSustainCounter = 0;
    this.vibOffset = 0;

    this.bendAccum = 0;

    // Build waveform from table data if available
    if (this.config.table && this.config.table.length >= 32) {
      this.waveform = new Int8Array(32);
      for (let i = 0; i < 32; i++) {
        const v = this.config.table[i];
        this.waveform[i] = v > 127 ? v - 256 : v;
      }
    } else {
      // Sawtooth fallback
      this.waveform = new Int8Array(32);
      for (let i = 0; i < 32; i++) this.waveform[i] = Math.round(127 - (255 * i / 31));
    }
  }

  tick(): SynthTickState {
    const cfg = this.config;

    // ── 1. Volume table processing ───────────────────────────────────
    this.processVolumeTable(cfg);

    // ── 2. Vibrato table processing ──────────────────────────────────
    this.processVibratoTable(cfg);

    // ── 3. Pitch bend ────────────────────────────────────────────────
    if (cfg.pitchBend) {
      this.bendAccum += cfg.pitchBend;
    }

    // ── 4. Final period ──────────────────────────────────────────────
    let period = this.basePeriod + this.vibOffset + this.bendAccum;
    period = Math.max(113, Math.min(3424, period));

    return {
      volume: Math.max(0, Math.min(64, Math.round(this.volume))),
      period: period > 0 ? period : 0,
      waveform: this.waveform,
    };
  }

  private processVolumeTable(cfg: DeltaMusic2Config): void {
    if (!cfg.volTable || cfg.volTable.length === 0) {
      this.volume = 64;
      return;
    }

    if (this.volPhaseIdx >= cfg.volTable.length) return;

    const entry = cfg.volTable[this.volPhaseIdx];
    if (!entry) return;

    // Speed counter
    this.volCounter++;
    if (this.volCounter >= (entry.speed || 1)) {
      this.volCounter = 0;

      // Set volume from current phase level
      this.volume = Math.min(64, entry.level * 64 / 255);

      // Check sustain
      if (entry.sustain > 0) {
        this.volSustainCounter++;
        if (this.volSustainCounter >= entry.sustain) {
          this.volSustainCounter = 0;
          this.volPhaseIdx++;
        }
      } else {
        this.volPhaseIdx++;
      }
    }
  }

  private processVibratoTable(cfg: DeltaMusic2Config): void {
    if (!cfg.vibTable || cfg.vibTable.length === 0) return;

    if (this.vibPhaseIdx >= cfg.vibTable.length) return;

    const entry = cfg.vibTable[this.vibPhaseIdx];
    if (!entry) return;

    // Delay before vibrato starts
    if (entry.delay > 0) {
      this.vibDelayCounter++;
      if (this.vibDelayCounter < entry.delay) return;
    }

    // Speed counter
    this.vibCounter++;
    if (this.vibCounter >= (entry.speed || 1)) {
      this.vibCounter = 0;

      // Sine-based vibrato at current phase speed
      this.vibOffset = Math.round(
        Math.sin(this.vibCounter * Math.PI / 16) * entry.speed
      );

      // Check sustain
      if (entry.sustain > 0) {
        this.vibSustainCounter++;
        if (this.vibSustainCounter >= entry.sustain) {
          this.vibSustainCounter = 0;
          this.vibPhaseIdx++;
        }
      }
    }
  }
}
