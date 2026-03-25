/**
 * David Whittaker tick simulator.
 *
 * Simulates volseq[] (per-tick volumes) and frqseq[] (per-tick period offsets),
 * plus vibrato.
 *
 * Reference: NostalgicPlayer DavidWhittakerWorker.cs DoFrameStuff()
 */

import type { DavidWhittakerConfig } from '../../src/types/instrument/exotic';
import type { ISynthSimulator, SynthTickState } from './SynthSimulator';
import { semitoneToAmigaPeriod } from './SynthSimulator';

export class DavidWhittakerSynthSim implements ISynthSimulator {
  private config!: DavidWhittakerConfig;
  private basePeriod = 428;

  // Volume sequence
  private volIdx = 0;
  private volume = 64;

  // Frequency sequence
  private frqIdx = 0;
  private freqAccum = 0;

  // Vibrato
  private vibPhase = 0;
  private vibOffset = 0;

  // Default waveform
  private waveform!: Int8Array;

  init(config: unknown, baseNote: number, _skipPatternEffects = false): void {
    this.config = config as DavidWhittakerConfig;
    this.basePeriod = semitoneToAmigaPeriod(baseNote);

    this.volIdx = 0;
    this.volume = this.config.defaultVolume ?? 64;

    this.frqIdx = 0;
    this.freqAccum = 0;

    this.vibPhase = 0;
    this.vibOffset = 0;

    // Sawtooth waveform
    this.waveform = new Int8Array(32);
    for (let i = 0; i < 32; i++) this.waveform[i] = Math.round(127 - (255 * i / 31));
  }

  tick(): SynthTickState {
    const cfg = this.config;

    // ── 1. Volume sequence ───────────────────────────────────────────
    if (cfg.volseq && cfg.volseq.length > 0) {
      if (this.volIdx < cfg.volseq.length) {
        const v = cfg.volseq[this.volIdx];
        if (v === -128) {
          // Loop marker — find loop target (previous entry or restart)
          // Simple: loop to start
          this.volIdx = 0;
        } else if (v !== undefined) {
          this.volume = Math.max(0, Math.min(64, v));
          this.volIdx++;
        }
      }
      // If past end, hold last volume
    }

    // ── 2. Frequency sequence ────────────────────────────────────────
    if (cfg.frqseq && cfg.frqseq.length > 0) {
      if (this.frqIdx < cfg.frqseq.length) {
        const f = cfg.frqseq[this.frqIdx];
        if (f === -128) {
          // Loop marker
          this.frqIdx = 0;
        } else if (f !== undefined) {
          this.freqAccum += f;
          this.frqIdx++;
        }
      }
    }

    // ── 3. Vibrato ───────────────────────────────────────────────────
    const vibSpeed = cfg.vibratoSpeed ?? 0;
    const vibDepth = cfg.vibratoDepth ?? 0;

    if (vibSpeed > 0 && vibDepth > 0) {
      this.vibPhase += vibSpeed;
      this.vibOffset = Math.round(Math.sin(this.vibPhase * Math.PI / 128) * vibDepth);
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
