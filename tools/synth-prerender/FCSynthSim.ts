/**
 * Future Composer (FC14) tick simulator.
 *
 * Simulates ADSR envelope, synth table (waveform sequence), arpeggio,
 * and vibrato tick-by-tick per the NostalgicPlayer FC14 replayer.
 *
 * Reference: NostalgicPlayer FutureComposerWorker.cs Effect() lines 971-1336
 */

import type { FCConfig } from '../../src/types/instrument/exotic';
import type { ISynthSimulator, SynthTickState } from './SynthSimulator';
import { AMIGA_PERIODS, semitoneToAmigaPeriod } from './SynthSimulator';
import { extractFC13Wave } from '../../src/lib/import/formats/FCParser';

// ── Default waveforms ───────────────────────────────────────────────────────

/** Generate a standard waveform (32 samples signed 8-bit). */
function generateDefaultWave(waveNum: number): Int8Array {
  const len = 32;
  const buf = new Int8Array(len);
  switch (waveNum % 4) {
    case 0: // Sawtooth (most common FC default)
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
  return buf;
}

// ── ADSR phases ─────────────────────────────────────────────────────────────

const enum ADSRPhase { Attack, Decay, Sustain, Release, Done }

// ── Simulator ───────────────────────────────────────────────────────────────

export class FCSynthSim implements ISynthSimulator {
  private config!: FCConfig;
  private basePeriod = 428; // C-2 default

  // ADSR
  private adsrPhase = ADSRPhase.Attack;
  private adsrTick = 0;
  private volume = 0;

  // Synth table
  private synthIdx = 0;
  private synthCounter = 0;
  private currentWaveform!: Int8Array;

  // Arpeggio
  private arpIdx = 0;
  private arpPeriod = 0;

  // Vibrato
  private vibTick = 0;
  private vibPos = 0;
  private vibDir = 1;
  private vibOffset = 0;

  init(config: unknown, baseNote: number): void {
    this.config = config as FCConfig;
    this.basePeriod = semitoneToAmigaPeriod(baseNote);

    // ADSR
    this.adsrPhase = ADSRPhase.Attack;
    this.adsrTick = 0;
    this.volume = 0;

    // Synth table
    this.synthIdx = 0;
    this.synthCounter = 0;

    // Use wavePCM if available, else generate from waveNumber
    if (this.config.wavePCM && this.config.wavePCM.length > 0) {
      this.currentWaveform = new Int8Array(this.config.wavePCM);
    } else {
      this.currentWaveform = generateDefaultWave(this.config.waveNumber ?? 0);
    }

    // Arpeggio
    this.arpIdx = 0;
    this.arpPeriod = 0;

    // Vibrato
    this.vibTick = 0;
    this.vibPos = 0;
    this.vibDir = 1;
    this.vibOffset = 0;
  }

  tick(): SynthTickState {
    const cfg = this.config;

    // ── 1. ADSR envelope ──────────────────────────────────────────────
    this.processADSR(cfg);

    // ── 2. Synth table (waveform sequence) ────────────────────────────
    this.processSynthTable(cfg);

    // ── 3. Arpeggio ──────────────────────────────────────────────────
    this.processArpeggio(cfg);

    // ── 4. Vibrato ───────────────────────────────────────────────────
    this.processVibrato(cfg);

    // ── 5. Final period ──────────────────────────────────────────────
    let period = this.basePeriod + this.arpPeriod + this.vibOffset;
    period = Math.max(113, Math.min(3424, period));

    return {
      volume: Math.max(0, Math.min(64, Math.round(this.volume))),
      period: period > 0 ? period : 0,
      waveform: this.currentWaveform,
    };
  }

  private processADSR(cfg: FCConfig): void {
    switch (this.adsrPhase) {
      case ADSRPhase.Attack: {
        const atkLen = cfg.atkLength || 1;
        const atkVol = cfg.atkVolume ?? 64;
        this.volume += atkVol / atkLen;
        if (this.volume >= atkVol) {
          this.volume = atkVol;
          this.adsrPhase = ADSRPhase.Decay;
          this.adsrTick = 0;
        }
        this.adsrTick++;
        break;
      }
      case ADSRPhase.Decay: {
        const decLen = cfg.decLength || 1;
        const decVol = cfg.decVolume ?? 0;
        const atkVol = cfg.atkVolume ?? 64;
        this.volume -= (atkVol - decVol) / decLen;
        if (this.volume <= decVol) {
          this.volume = decVol;
          this.adsrPhase = ADSRPhase.Sustain;
          this.adsrTick = 0;
        }
        this.adsrTick++;
        break;
      }
      case ADSRPhase.Sustain: {
        const susVol = cfg.sustVolume ?? cfg.decVolume ?? 0;
        this.volume = susVol;
        // Sustain indefinitely for pre-render (loop detection will find it)
        break;
      }
      case ADSRPhase.Release: {
        const relLen = cfg.relLength || 1;
        this.volume -= this.volume / relLen;
        if (this.volume <= 0) {
          this.volume = 0;
          this.adsrPhase = ADSRPhase.Done;
        }
        this.adsrTick++;
        break;
      }
      case ADSRPhase.Done:
        this.volume = 0;
        break;
    }
  }

  private processSynthTable(cfg: FCConfig): void {
    if (!cfg.synthTable || cfg.synthTable.length === 0) return;

    this.synthCounter++;
    const speed = cfg.synthSpeed || 1;
    if (this.synthCounter >= speed) {
      this.synthCounter = 0;
      const entry = cfg.synthTable[this.synthIdx % cfg.synthTable.length];
      if (entry) {
        // Switch waveform from FC13 built-in wave table
        if (entry.waveNum !== undefined && entry.waveNum >= 0 && entry.waveNum < 47) {
          const raw = extractFC13Wave(entry.waveNum);
          if (raw.length > 0) {
            const wave = new Int8Array(raw.length);
            for (let i = 0; i < raw.length; i++) {
              wave[i] = raw[i] < 128 ? raw[i] : raw[i] - 256;
            }
            this.currentWaveform = wave;
          }
        }
      }
      this.synthIdx++;
      if (this.synthIdx >= cfg.synthTable.length) {
        this.synthIdx = 0; // Loop synth table
      }
    }
  }

  private processArpeggio(cfg: FCConfig): void {
    if (!cfg.arpTable || cfg.arpTable.length === 0) {
      this.arpPeriod = 0;
      return;
    }

    const arpEntry = cfg.arpTable[this.arpIdx % cfg.arpTable.length] ?? 0;

    // Convert semitone offset to period difference
    if (arpEntry !== 0) {
      const baseIdx = AMIGA_PERIODS.indexOf(
        AMIGA_PERIODS.reduce((closest, p) =>
          Math.abs(p - this.basePeriod) < Math.abs(closest - this.basePeriod) ? p : closest
        )
      );
      const targetIdx = Math.max(0, Math.min(AMIGA_PERIODS.length - 1, baseIdx + arpEntry));
      this.arpPeriod = AMIGA_PERIODS[targetIdx] - this.basePeriod;
    } else {
      this.arpPeriod = 0;
    }

    this.arpIdx++;
    if (this.arpIdx >= cfg.arpTable.length) {
      this.arpIdx = 0;
    }
  }

  private processVibrato(cfg: FCConfig): void {
    const vibDelay = cfg.vibDelay ?? 0;
    const vibSpeed = cfg.vibSpeed ?? 0;
    const vibDepth = cfg.vibDepth ?? 0;

    if (vibSpeed === 0 || vibDepth === 0) {
      this.vibOffset = 0;
      return;
    }

    this.vibTick++;
    if (this.vibTick < vibDelay) {
      this.vibOffset = 0;
      return;
    }

    // Triangle wave vibrato (matches FC reference)
    // Updates every other tick
    if (this.vibTick % 2 === 0) {
      this.vibPos += this.vibDir * vibSpeed;
      if (this.vibPos >= vibDepth) {
        this.vibPos = vibDepth;
        this.vibDir = -1;
      } else if (this.vibPos <= -vibDepth) {
        this.vibPos = -vibDepth;
        this.vibDir = 1;
      }
    }

    this.vibOffset = this.vibPos;
  }
}
