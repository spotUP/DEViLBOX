/**
 * Jochen Hippel CoSo tick simulator.
 *
 * Simulates fseq[] (per-tick signed period offsets) and vseq[] (volume table),
 * plus vibrato.
 *
 * Reference: NostalgicPlayer HippelWorker.cs ParseEffects/RunEffects
 */

import type { HippelCoSoConfig } from '../../src/types/instrument/exotic';
import type { ISynthSimulator, SynthTickState } from './SynthSimulator';
import { semitoneToAmigaPeriod } from './SynthSimulator';

export class HippelCoSoSynthSim implements ISynthSimulator {
  private config!: HippelCoSoConfig;
  private basePeriod = 428;

  // Volume sequence
  private volIdx = 0;
  private volCounter = 0;
  private volume = 64;

  // Frequency sequence
  private fseqIdx = 0;
  private freqAccum = 0;

  // Vibrato
  private vibTick = 0;
  private vibPhase = 0;
  private vibOffset = 0;

  // Default waveform (sawtooth)
  private waveform!: Int8Array;

  init(config: unknown, baseNote: number, _skipPatternEffects = false): void {
    this.config = config as HippelCoSoConfig;
    this.basePeriod = semitoneToAmigaPeriod(baseNote);

    this.volIdx = 0;
    this.volCounter = 0;
    this.volume = 64;

    this.fseqIdx = 0;
    this.freqAccum = 0;

    this.vibTick = 0;
    this.vibPhase = 0;
    this.vibOffset = 0;

    // Generate sawtooth waveform
    this.waveform = new Int8Array(32);
    for (let i = 0; i < 32; i++) this.waveform[i] = Math.round(127 - (255 * i / 31));
  }

  tick(): SynthTickState {
    const cfg = this.config;

    // ── 1. Volume sequence ───────────────────────────────────────────
    if (cfg.vseq && cfg.vseq.length > 0) {
      const volSpeed = cfg.volSpeed || 1;
      this.volCounter++;
      if (this.volCounter >= volSpeed) {
        this.volCounter = 0;
        const v = cfg.vseq[this.volIdx % cfg.vseq.length] ?? 64;
        this.volume = Math.max(0, Math.min(64, v));
        this.volIdx++;
        if (this.volIdx >= cfg.vseq.length) {
          // Look for loop point — for now just loop entire table
          this.volIdx = 0;
        }
      }
    }

    // ── 2. Frequency sequence ────────────────────────────────────────
    if (cfg.fseq && cfg.fseq.length > 0) {
      if (this.fseqIdx < cfg.fseq.length) {
        const val = cfg.fseq[this.fseqIdx];
        // Signed period offset (negative values are valid — loop markers etc.)
        if (val !== undefined && val !== -128) { // -128 = loop marker
          this.freqAccum += val;
          this.fseqIdx++;
        } else if (val === -128) {
          // Loop to start
          this.fseqIdx = 0;
        } else {
          this.fseqIdx++;
        }
      }
    }

    // ── 3. Vibrato ───────────────────────────────────────────────────
    const vibDelay = cfg.vibDelay ?? 0;
    const vibSpeed = cfg.vibSpeed ?? 0;
    const vibDepth = cfg.vibDepth ?? 0;

    if (vibSpeed > 0 && vibDepth > 0) {
      this.vibTick++;
      if (this.vibTick > vibDelay) {
        this.vibPhase += vibSpeed;
        this.vibOffset = Math.round(Math.sin(this.vibPhase * Math.PI / 128) * vibDepth);
      }
    }

    // ── 4. Final period ──────────────────────────────────────────────
    let period = this.basePeriod + this.freqAccum + this.vibOffset;
    period = Math.max(113, Math.min(3424, period));

    return {
      volume: Math.max(0, Math.min(64, this.volume)),
      period: period > 0 ? period : 0,
      waveform: this.waveform,
    };
  }
}
