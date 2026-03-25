/**
 * Digital Mugician (DM1/DM2) tick simulator.
 *
 * Simulates wavetable cycling, arpeggio, and vibrato.
 *
 * Reference: NostalgicPlayer DigitalMugicianWorker.cs DoEffects()
 */

import type { DigMugConfig } from '../../src/types/instrument/exotic';
import type { ISynthSimulator, SynthTickState } from './SynthSimulator';
import { AMIGA_PERIODS, semitoneToAmigaPeriod } from './SynthSimulator';

export class DigMugSynthSim implements ISynthSimulator {
  private config!: DigMugConfig;
  private basePeriod = 428;
  private volume = 64;
  private skipPatternEffects = false;

  // Wavetable
  private waveIdx = 0;
  private waveCounter = 0;
  private currentWaveform!: Int8Array;
  private waveforms: Int8Array[] = [];

  // Arpeggio
  private arpIdx = 0;
  private arpCounter = 0;
  private arpPeriodOffset = 0;

  // Vibrato
  private vibTick = 0;
  private vibPhase = 0;
  private vibOffset = 0;

  init(config: unknown, baseNote: number, skipPatternEffects = false): void {
    this.config = config as DigMugConfig;
    this.basePeriod = semitoneToAmigaPeriod(baseNote);
    this.volume = this.config.volume ?? 64;
    this.skipPatternEffects = skipPatternEffects;

    // Build waveform table from available data
    this.waveforms = [];
    if (this.config.waveformData && this.config.waveformData.length > 0) {
      // Split waveformData into 32-byte chunks (DM2 format)
      const data = this.config.waveformData;
      const chunkSize = 32;
      for (let i = 0; i < data.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, data.length);
        const chunk = new Int8Array(chunkSize);
        for (let j = 0; j < end - i; j++) {
          chunk[j] = data[i + j] > 127 ? data[i + j] - 256 : data[i + j];
        }
        this.waveforms.push(chunk);
      }
    }

    if (this.waveforms.length === 0) {
      // Fallback: generate sawtooth
      const saw = new Int8Array(32);
      for (let i = 0; i < 32; i++) saw[i] = Math.round(127 - (255 * i / 31));
      this.waveforms.push(saw);
    }

    this.currentWaveform = new Int8Array(this.waveforms[0]);
    this.waveIdx = 0;
    this.waveCounter = 0;

    // Arpeggio
    this.arpIdx = 0;
    this.arpCounter = 0;
    this.arpPeriodOffset = 0;

    // Vibrato
    this.vibTick = 0;
    this.vibPhase = 0;
    this.vibOffset = 0;
  }

  tick(): SynthTickState {
    const cfg = this.config;

    // ── 1. Wavetable cycling ─────────────────────────────────────────
    this.processWavetable(cfg);

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

    // ── 4. Final period ──────────────────────────────────────────────
    let period = this.basePeriod + this.arpPeriodOffset + this.vibOffset;
    period = Math.max(113, Math.min(3424, period));

    return {
      volume: Math.max(0, Math.min(64, this.volume)),
      period: period > 0 ? period : 0,
      waveform: this.currentWaveform,
    };
  }

  private processWavetable(cfg: DigMugConfig): void {
    if (this.waveforms.length <= 1) return;

    const speed = cfg.waveSpeed || 1;
    this.waveCounter++;
    if (this.waveCounter >= speed) {
      this.waveCounter = 0;

      // Cycle through waveforms using wavetable indices
      const wavetable = cfg.wavetable;
      if (wavetable && wavetable.length > 0) {
        const targetWaveIdx = wavetable[this.waveIdx % wavetable.length] ?? 0;
        if (targetWaveIdx < this.waveforms.length) {
          this.currentWaveform = new Int8Array(this.waveforms[targetWaveIdx]);
        }
        this.waveIdx++;
        if (this.waveIdx >= wavetable.length) this.waveIdx = 0;
      } else {
        // Linear sweep through available waveforms
        this.waveIdx = (this.waveIdx + 1) % this.waveforms.length;
        this.currentWaveform = new Int8Array(this.waveforms[this.waveIdx]);
      }
    }
  }

  private processArpeggio(cfg: DigMugConfig): void {
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
      if (this.arpIdx >= cfg.arpTable.length) this.arpIdx = 0;
    }
  }

  private processVibrato(cfg: DigMugConfig): void {
    const speed = cfg.vibSpeed ?? 0;
    const depth = cfg.vibDepth ?? 0;

    if (speed === 0 || depth === 0) {
      this.vibOffset = 0;
      return;
    }

    this.vibTick++;
    this.vibPhase += speed;
    this.vibOffset = Math.round(Math.sin(this.vibPhase * Math.PI / 128) * depth);
  }
}

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
