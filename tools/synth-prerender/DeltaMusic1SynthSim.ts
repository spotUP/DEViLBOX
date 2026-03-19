/**
 * Delta Music 1.0 tick simulator.
 *
 * Simulates ADSR with step/delay timing, arpeggio table, vibrato,
 * and pitch bend.
 *
 * Reference: NostalgicPlayer DeltaMusic10Worker.cs
 */

import type { DeltaMusic1Config } from '../../src/types/instrument/exotic';
import type { ISynthSimulator, SynthTickState } from './SynthSimulator';
import { AMIGA_PERIODS, semitoneToAmigaPeriod } from './SynthSimulator';

const enum Phase { Attack, Decay, Sustain, Release, Done }

export class DeltaMusic1SynthSim implements ISynthSimulator {
  private config!: DeltaMusic1Config;
  private basePeriod = 428;

  // ADSR
  private phase = Phase.Attack;
  private volume = 0;
  private delayCounter = 0;

  // Arpeggio
  private arpIdx = 0;
  private arpPeriodOffset = 0;

  // Vibrato
  private vibTick = 0;
  private vibPhase = 0;
  private vibOffset = 0;

  // Bend
  private bendAccum = 0;

  // Waveform
  private waveform!: Int8Array;

  init(config: unknown, baseNote: number): void {
    this.config = config as DeltaMusic1Config;
    this.basePeriod = semitoneToAmigaPeriod(baseNote);

    this.phase = Phase.Attack;
    this.volume = 0;
    this.delayCounter = 0;

    this.arpIdx = 0;
    this.arpPeriodOffset = 0;

    this.vibTick = 0;
    this.vibPhase = 0;
    this.vibOffset = 0;
    this.bendAccum = 0;

    // Sawtooth waveform
    this.waveform = new Int8Array(32);
    for (let i = 0; i < 32; i++) this.waveform[i] = Math.round(127 - (255 * i / 31));
  }

  tick(): SynthTickState {
    const cfg = this.config;

    // ── 1. ADSR ──────────────────────────────────────────────────────
    this.processADSR(cfg);

    // ── 2. Arpeggio ──────────────────────────────────────────────────
    if (cfg.arpeggio && cfg.arpeggio.length > 0) {
      const tableDelay = cfg.tableDelay || 1;
      this.delayCounter++;
      if (this.delayCounter >= tableDelay) {
        this.delayCounter = 0;
        const semitone = cfg.arpeggio[this.arpIdx % cfg.arpeggio.length] ?? 0;
        if (semitone !== 0) {
          const baseIdx = findClosestPeriodIndex(this.basePeriod);
          const targetIdx = Math.max(0, Math.min(AMIGA_PERIODS.length - 1, baseIdx + semitone));
          this.arpPeriodOffset = AMIGA_PERIODS[targetIdx] - this.basePeriod;
        } else {
          this.arpPeriodOffset = 0;
        }
        this.arpIdx++;
        if (this.arpIdx >= cfg.arpeggio.length) this.arpIdx = 0;
      }
    }

    // ── 3. Vibrato ───────────────────────────────────────────────────
    const vibWait = cfg.vibratoWait ?? 0;
    const vibStep = cfg.vibratoStep ?? 0;
    const vibLen = cfg.vibratoLength ?? 0;

    if (vibStep > 0 && vibLen > 0) {
      this.vibTick++;
      if (this.vibTick > vibWait) {
        this.vibPhase += vibStep;
        this.vibOffset = Math.round(Math.sin(this.vibPhase * Math.PI / (vibLen * 2)) * vibStep * 2);
      }
    }

    // ── 4. Bend ──────────────────────────────────────────────────────
    if (cfg.bendRate) {
      this.bendAccum += cfg.bendRate;
    }

    // ── 5. Final period ──────────────────────────────────────────────
    let period = this.basePeriod + this.arpPeriodOffset + this.vibOffset + this.bendAccum;
    period = Math.max(113, Math.min(3424, period));

    return {
      volume: Math.max(0, Math.min(64, Math.round(this.volume))),
      period: period > 0 ? period : 0,
      waveform: this.waveform,
    };
  }

  private processADSR(cfg: DeltaMusic1Config): void {
    switch (this.phase) {
      case Phase.Attack: {
        const step = cfg.attackStep || 1;
        const delay = cfg.attackDelay || 1;
        if (this.vibTick % delay === 0) {
          this.volume += step;
        }
        if (this.volume >= (cfg.volume ?? 64)) {
          this.volume = cfg.volume ?? 64;
          this.phase = Phase.Decay;
        }
        break;
      }
      case Phase.Decay: {
        const step = cfg.decayStep || 1;
        const delay = cfg.decayDelay || 1;
        if (this.vibTick % delay === 0) {
          this.volume -= step;
        }
        if (this.volume <= (cfg.sustain ?? 0)) {
          this.volume = cfg.sustain ?? 0;
          this.phase = Phase.Sustain;
        }
        break;
      }
      case Phase.Sustain:
        // Hold sustain volume indefinitely
        break;
      case Phase.Release: {
        const step = cfg.releaseStep || 1;
        const delay = cfg.releaseDelay || 1;
        if (this.vibTick % delay === 0) {
          this.volume -= step;
        }
        if (this.volume <= 0) {
          this.volume = 0;
          this.phase = Phase.Done;
        }
        break;
      }
      case Phase.Done:
        this.volume = 0;
        break;
    }
  }
}

function findClosestPeriodIndex(period: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < AMIGA_PERIODS.length; i++) {
    const d = Math.abs(AMIGA_PERIODS[i] - period);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}
