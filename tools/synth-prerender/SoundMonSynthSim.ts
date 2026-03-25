/**
 * SoundMon (BP2/BP3) tick simulator.
 *
 * Simulates ADSR (table-based), LFO (pitch modulation), EG (waveform morph),
 * FX (waveform transforms), arpeggio, and vibrato.
 *
 * Reference: NostalgicPlayer SoundMonitorWorker.cs DoSynths() / DoEffects()
 */

import type { SoundMonConfig } from '../../src/types/instrument/exotic';
import type { ISynthSimulator, SynthTickState } from './SynthSimulator';
import { AMIGA_PERIODS, semitoneToAmigaPeriod } from './SynthSimulator';

// Vibrato table from SoundMon (8 entries)
const VIBRATO_TABLE = [0, 64, 128, 64, 0, -64, -128, -64];

// ── ADSR phases ─────────────────────────────────────────────────────────────

const enum Phase { Attack, Decay, Sustain, Release, Done }

// ── Simulator ───────────────────────────────────────────────────────────────

export class SoundMonSynthSim implements ISynthSimulator {
  private config!: SoundMonConfig;
  private basePeriod = 428;
  private skipPatternEffects = false;

  // ADSR
  private phase = Phase.Attack;
  private volume = 0;
  private adsrCounter = 0;
  private sustainTicks = 0;

  // Arpeggio
  private arpIdx = 0;
  private arpCounter = 0;
  private arpPeriodOffset = 0;

  // Vibrato
  private vibIndex = 0;
  private vibOffset = 0;

  // Waveform
  private waveform!: Int8Array;
  private synthBuffer!: Int8Array; // Original backup for morphing

  // Waveform morph
  private waveCounter = 0;

  init(config: unknown, baseNote: number, skipPatternEffects = false): void {
    this.config = config as SoundMonConfig;
    this.basePeriod = semitoneToAmigaPeriod(baseNote);
    this.skipPatternEffects = skipPatternEffects;

    // ADSR
    this.phase = Phase.Attack;
    this.volume = 0;
    this.adsrCounter = 0;
    this.sustainTicks = 0;

    // Arpeggio
    this.arpIdx = 0;
    this.arpCounter = 0;
    this.arpPeriodOffset = 0;

    // Vibrato
    this.vibIndex = 0;
    this.vibOffset = 0;

    // Waveform
    if (this.config.wavePCM && this.config.wavePCM.length > 0) {
      this.waveform = new Int8Array(this.config.wavePCM);
      this.synthBuffer = new Int8Array(this.config.wavePCM);
    } else {
      // Generate default waveform based on waveType
      const len = 32;
      this.waveform = new Int8Array(len);
      this.synthBuffer = new Int8Array(len);
      this.generateWave(this.config.waveType ?? 0, this.waveform);
      this.synthBuffer.set(this.waveform);
    }

    this.waveCounter = 0;
  }

  tick(): SynthTickState {
    const cfg = this.config;

    // ── 1. ADSR envelope ──────────────────────────────────────────────
    this.processADSR(cfg);

    // ── 2. Arpeggio ──────────────────────────────────────────────────
    // Skip when skipPatternEffects=true: MOD pattern column 0xy handles arpeggio
    if (!this.skipPatternEffects) {
      this.processArpeggio(cfg);
    } else {
      this.arpPeriodOffset = 0;
    }

    // ── 3. Vibrato ───────────────────────────────────────────────────
    // Skip when skipPatternEffects=true: MOD pattern column 4xy handles vibrato
    if (!this.skipPatternEffects) {
      this.processVibrato(cfg);
    } else {
      this.vibOffset = 0;
    }

    // ── 4. Waveform morph (simplified EG/FX) ─────────────────────────
    this.processWaveformMorph(cfg);

    // ── 5. Final period ──────────────────────────────────────────────
    let period = this.basePeriod + this.arpPeriodOffset + this.vibOffset;
    period = Math.max(113, Math.min(3424, period));

    return {
      volume: Math.max(0, Math.min(64, Math.round(this.volume))),
      period: period > 0 ? period : 0,
      waveform: this.waveform,
    };
  }

  private processADSR(cfg: SoundMonConfig): void {
    switch (this.phase) {
      case Phase.Attack: {
        const speed = cfg.attackSpeed || 1;
        this.adsrCounter++;
        if (this.adsrCounter >= speed) {
          this.adsrCounter = 0;
          this.volume += 1;
          if (this.volume >= (cfg.attackVolume ?? 64)) {
            this.volume = cfg.attackVolume ?? 64;
            this.phase = Phase.Decay;
          }
        }
        break;
      }
      case Phase.Decay: {
        const speed = cfg.decaySpeed || 1;
        this.adsrCounter++;
        if (this.adsrCounter >= speed) {
          this.adsrCounter = 0;
          this.volume -= 1;
          if (this.volume <= (cfg.decayVolume ?? 0)) {
            this.volume = cfg.decayVolume ?? 0;
            this.phase = Phase.Sustain;
            this.sustainTicks = 0;
          }
        }
        break;
      }
      case Phase.Sustain: {
        this.volume = cfg.sustainVolume ?? cfg.decayVolume ?? 0;
        this.sustainTicks++;
        if (cfg.sustainLength && this.sustainTicks >= cfg.sustainLength) {
          this.phase = Phase.Release;
        }
        break;
      }
      case Phase.Release: {
        const speed = cfg.releaseSpeed || 1;
        this.adsrCounter++;
        if (this.adsrCounter >= speed) {
          this.adsrCounter = 0;
          this.volume -= 1;
          if (this.volume <= (cfg.releaseVolume ?? 0)) {
            this.volume = cfg.releaseVolume ?? 0;
            this.phase = Phase.Done;
          }
        }
        break;
      }
      case Phase.Done:
        this.volume = 0;
        break;
    }
  }

  private processArpeggio(cfg: SoundMonConfig): void {
    if (!cfg.arpTable || cfg.arpTable.length === 0) {
      this.arpPeriodOffset = 0;
      return;
    }

    const speed = cfg.arpSpeed || 1;
    this.arpCounter++;
    if (this.arpCounter >= speed) {
      this.arpCounter = 0;
      const semitone = cfg.arpTable[this.arpIdx % cfg.arpTable.length] ?? 0;

      if (semitone !== 0) {
        const baseIdx = findClosestPeriodIndex(this.basePeriod);
        const targetIdx = Math.max(0, Math.min(AMIGA_PERIODS.length - 1, baseIdx + semitone));
        this.arpPeriodOffset = AMIGA_PERIODS[targetIdx] - this.basePeriod;
      } else {
        this.arpPeriodOffset = 0;
      }

      this.arpIdx++;
      if (this.arpIdx >= cfg.arpTable.length) {
        this.arpIdx = 0;
      }
    }
  }

  private processVibrato(cfg: SoundMonConfig): void {
    const vibSpeed = cfg.vibratoSpeed ?? 0;
    const vibDepth = cfg.vibratoDepth ?? 0;
    const vibDelay = cfg.vibratoDelay ?? 0;

    if (vibSpeed === 0 || vibDepth === 0) {
      this.vibOffset = 0;
      return;
    }

    this.vibIndex++;
    if (this.vibIndex < vibDelay) {
      this.vibOffset = 0;
      return;
    }

    // SoundMon vibrato: table-driven, depth as divisor
    const tableIdx = ((this.vibIndex - vibDelay) * vibSpeed) & 7;
    const tableVal = VIBRATO_TABLE[tableIdx];
    this.vibOffset = vibDepth !== 0 ? Math.round(tableVal / vibDepth) : 0;
  }

  private processWaveformMorph(cfg: SoundMonConfig): void {
    const waveSpeed = cfg.waveSpeed ?? 0;
    if (waveSpeed === 0) return;

    this.waveCounter++;
    if (this.waveCounter >= waveSpeed) {
      this.waveCounter = 0;

      // Simple averaging morph (SoundMon FX mode 1)
      // Smooths the waveform over time
      const len = this.waveform.length;
      let prev = this.waveform[0];
      for (let i = 0; i < len - 1; i++) {
        prev = Math.round((prev + this.waveform[i + 1]) / 2);
        this.waveform[i] = Math.max(-128, Math.min(127, prev));
      }
    }
  }

  private generateWave(type: number, buf: Int8Array): void {
    const len = buf.length;
    switch (type & 3) {
      case 0: // Sawtooth
        for (let i = 0; i < len; i++) buf[i] = Math.round(127 - (255 * i / (len - 1)));
        break;
      case 1: // Square
        for (let i = 0; i < len; i++) buf[i] = i < len / 2 ? 127 : -128;
        break;
      case 2: // Sine
        for (let i = 0; i < len; i++) buf[i] = Math.round(Math.sin(2 * Math.PI * i / len) * 127);
        break;
      case 3: // Triangle
        for (let i = 0; i < len; i++) {
          const phase = i / len;
          buf[i] = Math.round((phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase) * 127);
        }
        break;
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
