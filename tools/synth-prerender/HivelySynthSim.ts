/**
 * HivelyTracker / AHX tick simulator.
 *
 * Enhanced version of the existing bakeHivelyInstruments() — renders full
 * multi-cycle audio with ADSR envelope, performance list, filter/PWM sweeps,
 * and vibrato instead of a single static waveform.
 *
 * Reference: HivelyTracker source, NostalgicPlayer AHX implementation
 */

import type { HivelyConfig, HivelyPerfEntryConfig } from '../../src/types/instrument/exotic';
import type { ISynthSimulator, SynthTickState } from './SynthSimulator';
import { semitoneToAmigaPeriod } from './SynthSimulator';

// ── AHX waveform generation ─────────────────────────────────────────────────

function generateAHXWaveform(waveNum: number, length: number): Int8Array {
  const buf = new Int8Array(length);
  switch (waveNum & 0x03) {
    case 0: // Triangle
      for (let i = 0; i < length; i++) {
        const phase = i / length;
        const v = phase < 0.25 ? phase * 4 :
                  phase < 0.75 ? 2 - phase * 4 :
                  phase * 4 - 4;
        buf[i] = Math.round(v * 127);
      }
      break;
    case 1: // Sawtooth
      for (let i = 0; i < length; i++)
        buf[i] = Math.round(127 - (255 * i / (length - 1)));
      break;
    case 2: // Square (duty cycle applied separately)
      for (let i = 0; i < length; i++)
        buf[i] = i < length / 2 ? 127 : -128;
      break;
    case 3: // Noise
      for (let i = 0; i < length; i++)
        buf[i] = Math.round((Math.random() * 2 - 1) * 127);
      break;
  }
  return buf;
}

// ── ADSR phases ─────────────────────────────────────────────────────────────

const enum Phase { Attack, Decay, Sustain, Release, Done }

// ── Simulator ───────────────────────────────────────────────────────────────

export class HivelySynthSim implements ISynthSimulator {
  private config!: HivelyConfig;
  private basePeriod = 428;
  private skipPatternEffects = false;

  // ADSR (HVL envelope: aFrames/aVolume, dFrames/dVolume, sFrames, rFrames/rVolume)
  private phase = Phase.Attack;
  private volume = 0;
  private envTick = 0;

  // Performance list
  private perfEntries: HivelyPerfEntryConfig[] = [];
  private perfSpeed = 1;
  private perfPos = 0;
  private perfWait = 0;
  private currentWave = 0;

  // Filter sweep
  private filterPos = 0;
  private filterDir = 1;

  // Square sweep (PWM)
  private squarePos = 0;
  private squareDir = 1;

  // Vibrato
  private vibTick = 0;
  private vibPhase = 0;
  private vibOffset = 0;

  // Waveform
  private waveLength = 32;
  private currentWaveform!: Int8Array;

  init(config: unknown, baseNote: number, skipPatternEffects = false): void {
    this.config = config as HivelyConfig;
    this.basePeriod = semitoneToAmigaPeriod(baseNote);
    this.skipPatternEffects = skipPatternEffects;

    // Waveform length
    const waveLengths = [4, 8, 16, 32, 64, 128];
    this.waveLength = waveLengths[Math.min(this.config.waveLength ?? 3, 5)] || 32;

    // ADSR
    this.phase = Phase.Attack;
    this.volume = 0;
    this.envTick = 0;

    // Performance list
    this.perfEntries = this.config.performanceList?.entries ?? [];
    this.perfSpeed = this.config.performanceList?.speed ?? 1;
    this.perfPos = 0;
    this.perfWait = this.perfSpeed;
    this.currentWave = 0;

    // Filter
    this.filterPos = this.config.filterLowerLimit ?? 0;
    this.filterDir = 1;

    // Square
    this.squarePos = this.config.squareLowerLimit ?? 0;
    this.squareDir = 1;

    // Vibrato
    this.vibTick = 0;
    this.vibPhase = 0;
    this.vibOffset = 0;

    // Generate initial waveform
    this.currentWaveform = generateAHXWaveform(this.currentWave, this.waveLength);
  }

  tick(): SynthTickState {
    const cfg = this.config;

    // ── 1. ADSR envelope ──────────────────────────────────────────────
    this.processEnvelope(cfg);

    // ── 2. Performance list ──────────────────────────────────────────
    this.processPerformanceList();

    // ── 3. Filter sweep ──────────────────────────────────────────────
    if (cfg.filterSpeed > 0) {
      this.filterPos += this.filterDir * cfg.filterSpeed;
      if (this.filterPos >= cfg.filterUpperLimit) {
        this.filterPos = cfg.filterUpperLimit;
        this.filterDir = -1;
      }
      if (this.filterPos <= cfg.filterLowerLimit) {
        this.filterPos = cfg.filterLowerLimit;
        this.filterDir = 1;
      }
    }

    // ── 4. Square sweep (PWM) ────────────────────────────────────────
    if (cfg.squareSpeed > 0) {
      this.squarePos += this.squareDir * cfg.squareSpeed;
      if (this.squarePos >= cfg.squareUpperLimit) {
        this.squarePos = cfg.squareUpperLimit;
        this.squareDir = -1;
      }
      if (this.squarePos <= cfg.squareLowerLimit) {
        this.squarePos = cfg.squareLowerLimit;
        this.squareDir = 1;
      }
    }

    // ── 5. Vibrato ───────────────────────────────────────────────────
    // Skip when skipPatternEffects=true: MOD pattern column 4xy handles vibrato
    if (!this.skipPatternEffects) {
      this.processVibrato(cfg);
    } else {
      this.vibOffset = 0;
    }

    // ── 6. Generate waveform with current state ──────────────────────
    this.regenerateWaveform();

    // ── 7. Final period ──────────────────────────────────────────────
    let period = this.basePeriod + this.vibOffset;
    period = Math.max(113, Math.min(3424, period));

    return {
      volume: Math.max(0, Math.min(64, Math.round(this.volume))),
      period: period > 0 ? period : 0,
      waveform: this.currentWaveform,
    };
  }

  private processEnvelope(cfg: HivelyConfig): void {
    const env = cfg.envelope;
    if (!env) {
      this.volume = cfg.volume ?? 64;
      return;
    }

    this.envTick++;

    switch (this.phase) {
      case Phase.Attack: {
        const frames = env.aFrames || 1;
        this.volume = (env.aVolume * this.envTick) / frames;
        if (this.envTick >= frames) {
          this.volume = env.aVolume;
          this.phase = Phase.Decay;
          this.envTick = 0;
        }
        break;
      }
      case Phase.Decay: {
        const frames = env.dFrames || 1;
        const range = env.aVolume - env.dVolume;
        this.volume = env.aVolume - (range * this.envTick) / frames;
        if (this.envTick >= frames) {
          this.volume = env.dVolume;
          this.phase = Phase.Sustain;
          this.envTick = 0;
        }
        break;
      }
      case Phase.Sustain: {
        this.volume = env.dVolume;
        if (env.sFrames > 0 && this.envTick >= env.sFrames) {
          this.phase = Phase.Release;
          this.envTick = 0;
        }
        break;
      }
      case Phase.Release: {
        const frames = env.rFrames || 1;
        const range = env.dVolume - env.rVolume;
        this.volume = env.dVolume - (range * this.envTick) / frames;
        if (this.envTick >= frames) {
          this.volume = env.rVolume;
          this.phase = Phase.Done;
        }
        break;
      }
      case Phase.Done:
        this.volume = env.rVolume;
        break;
    }
  }

  private processPerformanceList(): void {
    if (this.perfEntries.length === 0) return;

    this.perfWait--;
    if (this.perfWait <= 0) {
      if (this.perfPos < this.perfEntries.length) {
        const entry = this.perfEntries[this.perfPos];
        if (entry) {
          if (entry.fixed !== undefined && typeof entry.fixed === 'number' && entry.fixed >= 0) {
            this.currentWave = entry.fixed & 0x03;
          }
          if (entry.waveform !== undefined && entry.waveform >= 0) {
            this.currentWave = entry.waveform & 0x03;
          }
        }
        this.perfPos++;
      }
      this.perfWait = this.perfSpeed;
    }
  }

  private processVibrato(cfg: HivelyConfig): void {
    const delay = cfg.vibratoDelay ?? 0;
    const speed = cfg.vibratoSpeed ?? 0;
    const depth = cfg.vibratoDepth ?? 0;

    if (speed === 0 || depth === 0) {
      this.vibOffset = 0;
      return;
    }

    this.vibTick++;
    if (this.vibTick < delay) {
      this.vibOffset = 0;
      return;
    }

    this.vibPhase += speed;
    // Sine-ish vibrato
    this.vibOffset = Math.round(Math.sin(this.vibPhase * Math.PI / 128) * depth);
  }

  private regenerateWaveform(): void {
    // Generate base waveform
    const wave = generateAHXWaveform(this.currentWave, this.waveLength);

    // Apply PWM for square wave
    if ((this.currentWave & 0x03) === 2) {
      const duty = this.squarePos / 255;
      for (let i = 0; i < wave.length; i++) {
        wave[i] = (i / wave.length) < duty ? 127 : -128;
      }
    }

    // Apply low-pass filter
    const filterAmount = this.filterPos / 127;
    if (filterAmount < 0.95) {
      let prev = wave[0];
      const fc = 0.1 + filterAmount * 0.9;
      for (let i = 1; i < wave.length; i++) {
        wave[i] = Math.round(prev + fc * (wave[i] - prev));
        prev = wave[i];
      }
    }

    this.currentWaveform = wave;
  }
}
