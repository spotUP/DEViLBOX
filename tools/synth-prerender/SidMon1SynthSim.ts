/**
 * SidMon 1.0 tick simulator.
 *
 * Simulates ADSR envelope, arpeggio cycling, phase modulation (blending
 * mainWave + phaseWave), and pitch fall.
 *
 * Reference: NostalgicPlayer SidMon10Worker.cs PlayNote() lines 1384-1591
 */

import type { SidMon1Config } from '../../src/types/instrument/exotic';
import type { ISynthSimulator, SynthTickState } from './SynthSimulator';
import { AMIGA_PERIODS, semitoneToAmigaPeriod } from './SynthSimulator';

// ── ADSR phases ─────────────────────────────────────────────────────────────

const enum Phase { Attack, Decay, Sustain, Release, Done }

// ── Simulator ───────────────────────────────────────────────────────────────

export class SidMon1SynthSim implements ISynthSimulator {
  private config!: SidMon1Config;
  private basePeriod = 428;

  // ADSR
  private phase = Phase.Attack;
  private volume = 0;
  private sustainTicks = 0;

  // Arpeggio
  private arpIdx = 0;
  private arpPeriodOffset = 0;

  // Phase modulation
  private phaseOffset = 0;
  private currentWaveform!: Int8Array;
  private mainWave!: Int8Array;
  private phaseWave!: Int8Array;

  // Pitch fall
  private pitchFallAccum = 0;

  // Tick counter
  private tickCount = 0;

  init(config: unknown, baseNote: number, _skipPatternEffects = false): void {
    this.config = config as SidMon1Config;
    this.basePeriod = semitoneToAmigaPeriod(baseNote);

    // ADSR
    this.phase = Phase.Attack;
    this.volume = 0;
    this.sustainTicks = 0;

    // Arpeggio
    this.arpIdx = 0;
    this.arpPeriodOffset = 0;

    // Waveform
    const mainLen = this.config.mainWave?.length || 32;
    if (this.config.mainWave && this.config.mainWave.length > 0) {
      this.mainWave = new Int8Array(this.config.mainWave);
    } else {
      // Default sawtooth
      this.mainWave = new Int8Array(32);
      for (let i = 0; i < 32; i++) this.mainWave[i] = Math.round(127 - (255 * i / 31));
    }

    if (this.config.phaseWave && this.config.phaseWave.length > 0) {
      this.phaseWave = new Int8Array(this.config.phaseWave);
    } else {
      this.phaseWave = new Int8Array(mainLen); // Silent
    }

    this.currentWaveform = new Int8Array(this.mainWave.length);
    this.currentWaveform.set(this.mainWave);

    // Phase modulation
    this.phaseOffset = this.config.phaseShift ?? 0;

    // Pitch fall
    this.pitchFallAccum = 0;

    this.tickCount = 0;
  }

  tick(): SynthTickState {
    const cfg = this.config;
    this.tickCount++;

    // ── 1. ADSR envelope ──────────────────────────────────────────────
    this.processADSR(cfg);

    // ── 2. Arpeggio ──────────────────────────────────────────────────
    this.processArpeggio(cfg);

    // ── 3. Phase modulation ──────────────────────────────────────────
    this.processPhaseModulation(cfg);

    // ── 4. Pitch fall ────────────────────────────────────────────────
    const pitchFall = cfg.pitchFall ?? 0;
    if (pitchFall !== 0) {
      this.pitchFallAccum += pitchFall;
    }

    // ── 5. Final period ──────────────────────────────────────────────
    let period = this.basePeriod + this.arpPeriodOffset + this.pitchFallAccum;
    period = Math.max(113, Math.min(3424, period));

    return {
      volume: Math.max(0, Math.min(64, Math.round(this.volume))),
      period: period > 0 ? period : 0,
      waveform: this.currentWaveform,
    };
  }

  private processADSR(cfg: SidMon1Config): void {
    switch (this.phase) {
      case Phase.Attack: {
        const speed = cfg.attackSpeed ?? 1;
        const max = cfg.attackMax ?? 64;
        this.volume += speed;
        if (this.volume >= max) {
          this.volume = max;
          this.phase = Phase.Decay;
        }
        break;
      }
      case Phase.Decay: {
        const speed = cfg.decaySpeed ?? 1;
        const min = cfg.decayMin ?? 0;
        this.volume -= speed;
        if (this.volume <= min) {
          this.volume = min;
          this.phase = Phase.Sustain;
          this.sustainTicks = 0;
        }
        break;
      }
      case Phase.Sustain: {
        const sustainLen = cfg.sustain ?? 0;
        this.sustainTicks++;
        if (sustainLen > 0 && this.sustainTicks >= sustainLen) {
          this.phase = Phase.Release;
        }
        // Volume stays at current level
        break;
      }
      case Phase.Release: {
        const speed = cfg.releaseSpeed ?? 1;
        const min = cfg.releaseMin ?? 0;
        this.volume -= speed;
        if (this.volume <= min) {
          this.volume = min;
          this.phase = Phase.Done;
        }
        break;
      }
      case Phase.Done:
        this.volume = 0;
        break;
    }
  }

  private processArpeggio(cfg: SidMon1Config): void {
    if (!cfg.arpeggio || cfg.arpeggio.length === 0) {
      this.arpPeriodOffset = 0;
      return;
    }

    // Cycle through arpeggio table (index wraps with & 0x0F per SidMon spec)
    const semitone = cfg.arpeggio[this.arpIdx & 0x0F] ?? 0;

    if (semitone !== 0) {
      const baseIdx = findClosestPeriodIndex(this.basePeriod);
      const targetIdx = Math.max(0, Math.min(AMIGA_PERIODS.length - 1, baseIdx + semitone));
      this.arpPeriodOffset = AMIGA_PERIODS[targetIdx] - this.basePeriod;
    } else {
      this.arpPeriodOffset = 0;
    }

    this.arpIdx = (this.arpIdx + 1) % (cfg.arpeggio.length || 1);
  }

  private processPhaseModulation(cfg: SidMon1Config): void {
    const phaseSpeed = cfg.phaseSpeed ?? 0;
    if (phaseSpeed === 0 && (cfg.phaseShift ?? 0) === 0) return;

    // Advance phase offset
    this.phaseOffset += phaseSpeed;

    // Blend mainWave and phaseWave at rotating position
    const waveLen = this.mainWave.length;
    for (let i = 0; i < waveLen; i++) {
      const mainSample = this.mainWave[i];
      const phaseIdx = (i + Math.floor(this.phaseOffset)) % waveLen;
      const phaseSample = this.phaseWave[Math.abs(phaseIdx) % this.phaseWave.length] ?? 0;

      // 50/50 blend
      const blended = Math.round((mainSample + phaseSample) / 2);
      this.currentWaveform[i] = Math.max(-128, Math.min(127, blended));
    }
  }
}

/** Find the index of the closest Amiga period in the table. */
function findClosestPeriodIndex(period: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < AMIGA_PERIODS.length; i++) {
    const d = Math.abs(AMIGA_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}
