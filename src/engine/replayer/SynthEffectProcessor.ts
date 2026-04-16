/**
 * SynthEffectProcessor — Tick-level effect processing for synth instruments in hybrid mode.
 *
 * When a module instrument is replaced with a synth (TB-303, FM, etc.), libopenmpt still
 * processes the audio for those channels internally, but the user hears ToneEngine synths.
 * This processor reads pattern data and applies tick-level effects (portamento, vibrato,
 * arpeggio, volume slides) to the synth channels, matching XM/IT behavior.
 *
 * Driven by the worklet's position callbacks (~344/sec at 44.1kHz). Detects row changes
 * to initialize effect state, then computes tick positions from timing to apply effects.
 */

import { VIBRATO_TABLE } from './PeriodTables';

// XM effect types (matching effTyp from TrackerCell)
const FX_ARPEGGIO = 0;
const FX_PORTA_UP = 1;
const FX_PORTA_DOWN = 2;
const FX_TONE_PORTA = 3;
const FX_VIBRATO = 4;
const FX_TONE_PORTA_VOL_SLIDE = 5;
const FX_VIBRATO_VOL_SLIDE = 6;
const FX_TREMOLO = 7;
const FX_VOLUME_SLIDE = 0xA;
const FX_SET_VOLUME = 0xC;
const FX_EXTENDED = 0xE;

// Extended effects (E sub-commands)
const EFX_FINE_PORTA_UP = 0x1;
const EFX_FINE_PORTA_DOWN = 0x2;
const EFX_VIBRATO_WAVEFORM = 0x4;
const EFX_FINE_VOLUME_UP = 0xA;
const EFX_FINE_VOLUME_DOWN = 0xB;
const EFX_NOTE_CUT = 0xC;

// XM linear period → frequency: period change of 1 = 2^(1/768) frequency ratio
// Porta speed of N → N*4 period units per tick in XM
const FREQ_RATIO_PER_PERIOD_UNIT = Math.pow(2, 1 / 768);

/** Pattern cell data needed for effect processing */
export interface EffectPatternCell {
  note: number;
  instrument: number;
  effTyp: number;
  eff: number;
  volume: number;
  flag1?: number;
  flag2?: number;
  effTyp2?: number;
  eff2?: number;
  effTyp3?: number;
  eff3?: number;
  effTyp4?: number;
  eff4?: number;
}

/** Dependencies injected from TrackerReplayer */
export interface SynthEffectDeps {
  /** Get the set of instrument IDs that are synth-replaced */
  getReplacedInstruments(): Set<number>;
  /** Get pattern cell data for a given channel and row */
  getPatternCell(channel: number, row: number): EffectPatternCell | null;
  /** Get the number of channels */
  getChannelCount(): number;
  /** Set frequency on a synth channel via ToneEngine */
  applySynthFrequency(instrumentId: number, frequency: number, channelIndex: number, rampTime?: number): void;
  /** Set volume on a channel's gain node (0-1 linear) */
  setChannelGain(channelIndex: number, gain: number, time: number): void;
  /** Get the last triggered frequency for a channel from ToneEngine */
  getChannelBaseFrequency(channelIndex: number): number;
  /** Get the instrument ID currently active on a channel */
  getChannelInstrumentId(channelIndex: number): number;
}

interface EffectChannelState {
  instrumentId: number;

  // Base state (from note trigger)
  baseFrequency: number;
  currentFrequency: number;
  baseVolume: number;       // 0-64
  currentVolume: number;    // 0-64

  // Portamento
  portaSpeed: number;
  portaTarget: number;      // Hz, for tone portamento
  portaActive: boolean;

  // Vibrato
  vibratoSpeed: number;
  vibratoDepth: number;
  vibratoPos: number;       // 0-255 phase
  vibratoWaveform: number;  // 0=sine, 1=ramp, 2=square

  // Tremolo
  tremoloSpeed: number;
  tremoloDepth: number;
  tremoloPos: number;
  tremoloWaveform: number;

  // Arpeggio
  arpeggioX: number;        // semitones up for tick phase 1
  arpeggioY: number;        // semitones up for tick phase 2

  // Volume slide
  volSlideSpeed: number;    // +x up, -y down (with memory)

  // Current effect
  effectType: number;
  effectParam: number;
}

export class SynthEffectProcessor {
  private deps: SynthEffectDeps;

  // Tick timing
  private lastRow = -1;
  private lastOrder = -1;
  private rowStartTime = 0;
  private lastProcessedTick = -1;
  private speed = 6;
  private tempo = 125;

  // Per-channel effect state (sparse — only replaced instrument channels)
  private channels = new Map<number, EffectChannelState>();

  constructor(deps: SynthEffectDeps) {
    this.deps = deps;
  }

  /** Called on every worklet position callback (~344/sec) */
  process(audioTime: number, row: number, order: number, speed: number, tempo: number): void {
    this.speed = speed;
    this.tempo = tempo;

    const isRowChange = (row !== this.lastRow || order !== this.lastOrder);

    if (isRowChange) {
      this.lastRow = row;
      this.lastOrder = order;
      this.rowStartTime = audioTime;
      this.lastProcessedTick = 0;
      // Tick 0 — note triggering is handled by fireHybridNotesForRow(),
      // we only initialize effect state here
      this.initRowEffects(row, audioTime);
    } else {
      // Compute tick from elapsed time since row start
      const tickDuration = 2.5 / this.tempo;
      const elapsed = audioTime - this.rowStartTime;
      const newTick = Math.min(
        Math.floor(elapsed / tickDuration),
        this.speed - 1
      );

      // Process any new ticks (tick 1+ only — tick 0 is handled on row change)
      while (this.lastProcessedTick < newTick) {
        this.lastProcessedTick++;
        this.processEffectTick(this.lastProcessedTick, audioTime);
      }
    }
  }

  /** Reset state (on stop/seek) */
  reset(): void {
    this.channels.clear();
    this.lastRow = -1;
    this.lastOrder = -1;
    this.lastProcessedTick = -1;
  }

  // ============================================================
  // Row-level initialization (tick 0)
  // ============================================================

  private initRowEffects(row: number, time: number): void {
    const replaced = this.deps.getReplacedInstruments();
    const numChannels = this.deps.getChannelCount();

    for (let ch = 0; ch < numChannels; ch++) {
      const instId = this.deps.getChannelInstrumentId(ch);
      if (!instId || !replaced.has(instId)) {
        this.channels.delete(ch);
        continue;
      }

      const cell = this.deps.getPatternCell(ch, row);
      if (!cell) continue;

      let state = this.channels.get(ch);
      if (!state) {
        state = createDefaultState(instId);
        this.channels.set(ch, state);
      }

      state.instrumentId = instId;

      // Get base frequency from ToneEngine (set by fireHybridNotesForRow → triggerNote)
      const baseFreq = this.deps.getChannelBaseFrequency(ch);
      if (baseFreq > 0) {
        state.baseFrequency = baseFreq;
        state.currentFrequency = baseFreq;
      }

      // Parse volume column (direct set volume 0x10-0x50 range in XM)
      if (cell.volume > 0 && cell.volume <= 64) {
        state.baseVolume = cell.volume;
        state.currentVolume = cell.volume;
      }

      // Parse primary effect column
      const fx = cell.effTyp ?? 0;
      const param = cell.eff ?? 0;
      state.effectType = fx;
      state.effectParam = param;
      this.initEffect(ch, state, fx, param, cell, time);

      // Check additional effect columns (IT multi-column)
      if (cell.effTyp2 && cell.eff2 !== undefined) {
        this.initEffect(ch, state, cell.effTyp2, cell.eff2, cell, time);
      }
    }
  }

  private initEffect(ch: number, state: EffectChannelState, fx: number, param: number,
    cell: EffectPatternCell, time: number): void {
    switch (fx) {
      case FX_ARPEGGIO:
        if (param !== 0) {
          state.arpeggioX = (param >> 4) & 0x0F;
          state.arpeggioY = param & 0x0F;
        } else {
          state.arpeggioX = 0;
          state.arpeggioY = 0;
        }
        break;

      case FX_PORTA_UP:
        if (param !== 0) state.portaSpeed = param;
        break;

      case FX_PORTA_DOWN:
        if (param !== 0) state.portaSpeed = param;
        break;

      case FX_TONE_PORTA:
        if (param !== 0) state.portaSpeed = param;
        if (cell.note > 0 && cell.note < 97) {
          state.portaTarget = xmNoteToFreq(cell.note);
          state.portaActive = true;
        }
        break;

      case FX_VIBRATO:
        if ((param >> 4) !== 0) state.vibratoSpeed = (param >> 4) & 0x0F;
        if ((param & 0x0F) !== 0) state.vibratoDepth = param & 0x0F;
        break;

      case FX_TONE_PORTA_VOL_SLIDE:
        if (param !== 0) initVolSlide(state, param);
        break;

      case FX_VIBRATO_VOL_SLIDE:
        if (param !== 0) initVolSlide(state, param);
        break;

      case FX_TREMOLO:
        if ((param >> 4) !== 0) state.tremoloSpeed = (param >> 4) & 0x0F;
        if ((param & 0x0F) !== 0) state.tremoloDepth = param & 0x0F;
        break;

      case FX_VOLUME_SLIDE:
        if (param !== 0) initVolSlide(state, param);
        break;

      case FX_SET_VOLUME:
        state.currentVolume = Math.min(64, param);
        state.baseVolume = state.currentVolume;
        this.deps.setChannelGain(ch, state.currentVolume / 64, time);
        break;

      case FX_EXTENDED: {
        const subCmd = (param >> 4) & 0x0F;
        const subParam = param & 0x0F;
        switch (subCmd) {
          case EFX_FINE_PORTA_UP:
            state.currentFrequency *= Math.pow(FREQ_RATIO_PER_PERIOD_UNIT, subParam * 4);
            this.deps.applySynthFrequency(state.instrumentId, state.currentFrequency, ch, 0.002);
            break;
          case EFX_FINE_PORTA_DOWN:
            state.currentFrequency /= Math.pow(FREQ_RATIO_PER_PERIOD_UNIT, subParam * 4);
            this.deps.applySynthFrequency(state.instrumentId, state.currentFrequency, ch, 0.002);
            break;
          case EFX_VIBRATO_WAVEFORM:
            state.vibratoWaveform = subParam & 0x03;
            break;
          case EFX_FINE_VOLUME_UP:
            state.currentVolume = Math.min(64, state.currentVolume + subParam);
            state.baseVolume = state.currentVolume;
            this.deps.setChannelGain(ch, state.currentVolume / 64, time);
            break;
          case EFX_FINE_VOLUME_DOWN:
            state.currentVolume = Math.max(0, state.currentVolume - subParam);
            state.baseVolume = state.currentVolume;
            this.deps.setChannelGain(ch, state.currentVolume / 64, time);
            break;
        }
        break;
      }
    }
  }

  // ============================================================
  // Tick-level processing (tick 1+)
  // ============================================================

  private processEffectTick(tick: number, time: number): void {
    this.channels.forEach((state, ch) => {
      switch (state.effectType) {
        case FX_ARPEGGIO:
          if (state.arpeggioX !== 0 || state.arpeggioY !== 0) {
            this.processArpeggio(ch, state, tick);
          }
          break;
        case FX_PORTA_UP:
          this.processPortaUp(ch, state);
          break;
        case FX_PORTA_DOWN:
          this.processPortaDown(ch, state);
          break;
        case FX_TONE_PORTA:
          this.processTonePorta(ch, state);
          break;
        case FX_VIBRATO:
          this.processVibrato(ch, state);
          break;
        case FX_TONE_PORTA_VOL_SLIDE:
          this.processTonePorta(ch, state);
          this.processVolSlide(ch, state, time);
          break;
        case FX_VIBRATO_VOL_SLIDE:
          this.processVibrato(ch, state);
          this.processVolSlide(ch, state, time);
          break;
        case FX_TREMOLO:
          this.processTremolo(ch, state, time);
          break;
        case FX_VOLUME_SLIDE:
          this.processVolSlide(ch, state, time);
          break;
        case FX_EXTENDED: {
          const subCmd = (state.effectParam >> 4) & 0x0F;
          const subParam = state.effectParam & 0x0F;
          if (subCmd === EFX_NOTE_CUT && tick === subParam) {
            state.currentVolume = 0;
            this.deps.setChannelGain(ch, 0, time);
          }
          break;
        }
      }
    });
  }

  // ============================================================
  // Individual effect processors
  // ============================================================

  private processArpeggio(ch: number, state: EffectChannelState, tick: number): void {
    const phase = tick % 3;
    let freq = state.baseFrequency;
    if (phase === 1) freq *= Math.pow(2, state.arpeggioX / 12);
    else if (phase === 2) freq *= Math.pow(2, state.arpeggioY / 12);

    state.currentFrequency = freq;
    this.deps.applySynthFrequency(state.instrumentId, freq, ch);
  }

  private processPortaUp(ch: number, state: EffectChannelState): void {
    state.currentFrequency *= Math.pow(FREQ_RATIO_PER_PERIOD_UNIT, state.portaSpeed * 4);
    state.currentFrequency = Math.min(state.currentFrequency, 22050);
    this.deps.applySynthFrequency(state.instrumentId, state.currentFrequency, ch, 0.002);
  }

  private processPortaDown(ch: number, state: EffectChannelState): void {
    state.currentFrequency /= Math.pow(FREQ_RATIO_PER_PERIOD_UNIT, state.portaSpeed * 4);
    state.currentFrequency = Math.max(state.currentFrequency, 1);
    this.deps.applySynthFrequency(state.instrumentId, state.currentFrequency, ch, 0.002);
  }

  private processTonePorta(ch: number, state: EffectChannelState): void {
    if (!state.portaActive || state.portaTarget <= 0) return;

    const slideAmount = Math.pow(FREQ_RATIO_PER_PERIOD_UNIT, state.portaSpeed * 4);

    if (state.currentFrequency < state.portaTarget) {
      state.currentFrequency *= slideAmount;
      if (state.currentFrequency >= state.portaTarget) {
        state.currentFrequency = state.portaTarget;
        state.portaActive = false;
      }
    } else if (state.currentFrequency > state.portaTarget) {
      state.currentFrequency /= slideAmount;
      if (state.currentFrequency <= state.portaTarget) {
        state.currentFrequency = state.portaTarget;
        state.portaActive = false;
      }
    }

    this.deps.applySynthFrequency(state.instrumentId, state.currentFrequency, ch, 0.002);
  }

  private processVibrato(ch: number, state: EffectChannelState): void {
    // Advance phase (XM: speed is multiplied by 4 internally)
    state.vibratoPos = (state.vibratoPos + state.vibratoSpeed * 4) & 0xFF;

    const phase = (state.vibratoPos >> 2) & 0x1F;
    let waveValue: number;
    switch (state.vibratoWaveform) {
      case 1: // Ramp down
        waveValue = (phase << 3);
        if (state.vibratoPos & 0x80) waveValue = 255 - waveValue;
        break;
      case 2: // Square
        waveValue = 255;
        break;
      default: // Sine
        waveValue = VIBRATO_TABLE[phase & 31] ?? 0;
        break;
    }

    // Convert period delta to frequency multiplier
    const periodDelta = (waveValue * state.vibratoDepth) >> 5;
    const sign = (state.vibratoPos & 0x80) ? -1 : 1;
    const freqMultiplier = Math.pow(FREQ_RATIO_PER_PERIOD_UNIT, sign * periodDelta);

    const freq = state.baseFrequency * freqMultiplier;
    this.deps.applySynthFrequency(state.instrumentId, freq, ch, 0.002);
  }

  private processTremolo(ch: number, state: EffectChannelState, time: number): void {
    state.tremoloPos = (state.tremoloPos + state.tremoloSpeed * 4) & 0xFF;

    const phase = (state.tremoloPos >> 2) & 0x1F;
    let waveValue: number;
    switch (state.tremoloWaveform) {
      case 1:
        waveValue = (phase << 3);
        if (state.tremoloPos & 0x80) waveValue = 255 - waveValue;
        break;
      case 2:
        waveValue = 255;
        break;
      default:
        waveValue = VIBRATO_TABLE[phase & 31] ?? 0;
        break;
    }

    const tremDelta = (waveValue * state.tremoloDepth) >> 6;
    let vol: number;
    if (state.tremoloPos & 0x80) {
      vol = Math.max(0, state.baseVolume - tremDelta);
    } else {
      vol = Math.min(64, state.baseVolume + tremDelta);
    }

    state.currentVolume = vol;
    this.deps.setChannelGain(ch, vol / 64, time);
  }

  private processVolSlide(ch: number, state: EffectChannelState, time: number): void {
    state.currentVolume += state.volSlideSpeed;
    state.currentVolume = Math.max(0, Math.min(64, state.currentVolume));
    this.deps.setChannelGain(ch, state.currentVolume / 64, time);
  }
}

// ============================================================
// Helpers (module-level for performance — no allocations)
// ============================================================

function initVolSlide(state: EffectChannelState, param: number): void {
  const hi = (param >> 4) & 0x0F;
  const lo = param & 0x0F;
  if (hi > 0) state.volSlideSpeed = hi;
  else if (lo > 0) state.volSlideSpeed = -lo;
}

function xmNoteToFreq(xmNote: number): number {
  // XM note 49 = C-4 = MIDI 60 = 261.63 Hz
  const midiNote = xmNote + 11;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

function createDefaultState(instrumentId: number): EffectChannelState {
  return {
    instrumentId,
    baseFrequency: 440,
    currentFrequency: 440,
    baseVolume: 64,
    currentVolume: 64,
    portaSpeed: 0,
    portaTarget: 0,
    portaActive: false,
    vibratoSpeed: 0,
    vibratoDepth: 0,
    vibratoPos: 0,
    vibratoWaveform: 0,
    tremoloSpeed: 0,
    tremoloDepth: 0,
    tremoloPos: 0,
    tremoloWaveform: 0,
    arpeggioX: 0,
    arpeggioY: 0,
    volSlideSpeed: 0,
    effectType: 0,
    effectParam: 0,
  };
}
