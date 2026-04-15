/**
 * Effect handler implementations — vibrato, arpeggio, portamento,
 * volume slide, panning, tremolo, retrigger.
 *
 * These are standalone functions that mutate ChannelState in-place.
 * Functions that need replayer state receive it via explicit parameters.
 */

import type { ChannelState } from '../TrackerReplayer';
import { VIBRATO_TABLE } from './PeriodTables';
import { FT2_ARPEGGIO_TAB, ft2ArpeggioPeriod, ft2Period2NotePeriod } from '../effects/FT2Tables';

// ---------------------------------------------------------------------------
// Callback types for replayer integration
// ---------------------------------------------------------------------------

/** Callback to apply a new period to a channel's audio output */
export type UpdatePeriodDirect = (ch: ChannelState, period: number) => void;
/** Callback to apply the channel's current .period field to audio output */
export type UpdatePeriod = (ch: ChannelState) => void;
/** Callback to look up a period shifted by semitones from a base period */
export type PeriodPlusSemitones = (basePeriod: number, semitones: number, finetune: number) => number;
/** Callback to apply panning to a channel */
export type ApplyPanEffect = (ch: ChannelState, pan255: number, time: number) => void;
/** Callback to trigger a note on a channel */
export type TriggerNote = (ch: ChannelState, time: number, offset: number, chIndex: number, accent: boolean, slide: boolean, currentSlide: boolean) => void;

// ---------------------------------------------------------------------------
// Arpeggio
// ---------------------------------------------------------------------------

export function doArpeggio(
  ch: ChannelState,
  param: number,
  currentTick: number,
  speed: number,
  useXMPeriods: boolean,
  linearPeriods: boolean,
  updatePeriodDirect: UpdatePeriodDirect,
  periodPlusSemitones: PeriodPlusSemitones,
): void {
  if (useXMPeriods) {
    // FT2 arpeggio: uses arpeggioTab indexed by DOWNWARD-counting tick (song.tick).
    // FT2's song.tick counts from speed down to 1. Our currentTick counts 0 up to speed-1.
    // Convert: ft2Tick = speed - currentTick.
    const ft2Tick = speed - currentTick;
    const tick = FT2_ARPEGGIO_TAB[ft2Tick & 31];
    if (tick === 0) {
      updatePeriodDirect(ch, ch.period);
    } else {
      const noteOffset = tick === 1 ? (param >> 4) & 0x0F : param & 0x0F;
      const newPeriod = ft2ArpeggioPeriod(ch.period, noteOffset, ch.finetune, linearPeriods);
      updatePeriodDirect(ch, newPeriod);
    }
  } else {
    // MOD arpeggio: simple tick % 3 cycle with period table lookup
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    const tick = currentTick % 3;
    let period = ch.note;

    if (tick === 1) {
      period = periodPlusSemitones(ch.note, x, ch.finetune);
    } else if (tick === 2) {
      period = periodPlusSemitones(ch.note, y, ch.finetune);
    }

    updatePeriodDirect(ch, period);
  }
}

// ---------------------------------------------------------------------------
// Tone Portamento
// ---------------------------------------------------------------------------

export function doTonePortamento(
  ch: ChannelState,
  useXMPeriods: boolean,
  linearPeriods: boolean,
  updatePeriod: UpdatePeriod,
  updatePeriodDirect: UpdatePeriodDirect,
): void {
  if (ch.portaTarget === 0 || ch.period === ch.portaTarget) return;

  if (ch.period < ch.portaTarget) {
    ch.period += ch.tonePortaSpeed;
    if (ch.period > ch.portaTarget) ch.period = ch.portaTarget;
  } else {
    ch.period -= ch.tonePortaSpeed;
    if (ch.period < ch.portaTarget) ch.period = ch.portaTarget;
  }

  // FT2: E3x glissando — quantize output period to nearest note
  // Reference: ft2_replayer.c portamento() line 1901-1904
  if (ch.glissandoMode && useXMPeriods) {
    const quantized = ft2Period2NotePeriod(ch.period, ch.finetune, linearPeriods);
    updatePeriodDirect(ch, quantized);
  } else {
    updatePeriod(ch);
  }
}

// ---------------------------------------------------------------------------
// Vibrato
// ---------------------------------------------------------------------------

export function doVibrato(
  ch: ChannelState,
  useXMPeriods: boolean,
  updatePeriodDirect: UpdatePeriodDirect,
): void {
  const speed = (ch.vibratoCmd >> 4) & 0x0F;
  const depth = ch.vibratoCmd & 0x0F;

  if (useXMPeriods) {
    // FT2 vibrato: phase is uint8_t (0-255), extracted as (pos>>2) & 0x1F
    const waveform = ch.waveControl & 0x03;
    let tmpVib = (ch.vibratoPos >> 2) & 0x1F;

    if (waveform === 0) {
      tmpVib = VIBRATO_TABLE[tmpVib];
    } else if (waveform === 1) {
      tmpVib <<= 3;
      if ((ch.vibratoPos & 0x80) !== 0) tmpVib = ~tmpVib & 0xFF;
    } else {
      tmpVib = 255;
    }

    tmpVib = (tmpVib * depth) >> 5; // FT2 uses >> 5 (not >> 7)

    if ((ch.vibratoPos & 0x80) !== 0)
      updatePeriodDirect(ch, ch.period - tmpVib);
    else
      updatePeriodDirect(ch, ch.period + tmpVib);

    // FT2 stores vibratoSpeed as (param >> 4) << 2, i.e. 4x our extracted speed
    ch.vibratoPos = (ch.vibratoPos + (speed * 4)) & 0xFF; // uint8_t wrapping
  } else {
    // MOD vibrato: original ProTracker style
    const waveform = ch.waveControl & 0x03;
    let value: number;

    if (waveform === 0) {
      value = VIBRATO_TABLE[ch.vibratoPos & 31];
    } else if (waveform === 1) {
      value = (ch.vibratoPos & 31) * 8;
      if (ch.vibratoPos >= 32) value = 255 - value;
    } else {
      value = 255;
    }

    let delta = (value * depth) >> 7;
    if (ch.vibratoPos >= 32) delta = -delta;

    updatePeriodDirect(ch, ch.period + delta);
    ch.vibratoPos = (ch.vibratoPos + speed) & 63;
  }
}

// ---------------------------------------------------------------------------
// Tremolo
// ---------------------------------------------------------------------------

export function doTremolo(
  ch: ChannelState,
  time: number,
  useXMPeriods: boolean,
): void {
  if (useXMPeriods) {
    // FT2 tremolo: phase is uint8_t (0-255), same extraction as vibrato
    const waveform = (ch.waveControl >> 4) & 0x03;
    let tmpTrem = (ch.tremoloPos >> 2) & 0x1F;

    if (waveform === 0) {
      tmpTrem = VIBRATO_TABLE[tmpTrem];
    } else if (waveform === 1) {
      tmpTrem <<= 3;
      // FT2 BUG: checks vibratoPos instead of tremoloPos for ramp direction
      if ((ch.vibratoPos & 0x80) !== 0) tmpTrem = ~tmpTrem & 0xFF;
    } else {
      tmpTrem = 255;
    }

    tmpTrem = (tmpTrem * ch.tremoloDepth) >> 6;

    let tremVol: number;
    if ((ch.tremoloPos & 0x80) !== 0) {
      tremVol = ch.volume - tmpTrem;
      if (tremVol < 0) tremVol = 0;
    } else {
      tremVol = ch.volume + tmpTrem;
      if (tremVol > 64) tremVol = 64;
    }

    // FT2: tremolo modifies outVol (not gainNode directly) so it combines with
    // volume envelope. processEnvelopesAndVibrato reads outVol for the final formula.
    ch.outVol = tremVol;
    ch._tremoloThisTick = true;
    ch.tremoloPos = (ch.tremoloPos + ch.tremoloSpeed) & 0xFF;
  } else {
    // MOD tremolo: original ProTracker style
    const speed = (ch.tremoloCmd >> 4) & 0x0F;
    const depth = ch.tremoloCmd & 0x0F;

    const waveform = (ch.waveControl >> 4) & 0x03;
    let value: number;

    if (waveform === 0) {
      value = VIBRATO_TABLE[ch.tremoloPos & 31];
    } else if (waveform === 1) {
      value = (ch.tremoloPos & 31) * 8;
      if (ch.tremoloPos >= 32) value = 255 - value;
    } else {
      value = 255;
    }

    let delta = (value * depth) >> 6;
    if (ch.tremoloPos >= 32) delta = -delta;

    const newVol = Math.max(0, Math.min(64, ch.volume + delta));
    ch.gainNode.gain.setValueAtTime(newVol / 64, time);

    ch.tremoloPos = (ch.tremoloPos + speed) & 63;
  }
}

// ---------------------------------------------------------------------------
// Volume Slide
// ---------------------------------------------------------------------------

export function doVolumeSlide(ch: ChannelState, param: number, time: number): void {
  // FT2: use speed memory when param is 0
  if (param === 0) param = ch.volSlideSpeed;
  ch.volSlideSpeed = param;

  const x = (param >> 4) & 0x0F;
  const y = param & 0x0F;

  if (x > 0) {
    ch.volume = Math.min(64, ch.volume + x);
  } else if (y > 0) {
    ch.volume = Math.max(0, ch.volume - y);
  }

  ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
}

// ---------------------------------------------------------------------------
// Global Volume Slide
// ---------------------------------------------------------------------------

/**
 * Global volume slide (effect Hxx).
 * Returns the new globalVolume value for the caller to store.
 */
export function doGlobalVolumeSlide(
  param: number,
  globalVolume: number,
): number {
  const x = (param >> 4) & 0x0F;
  const y = param & 0x0F;

  if (x > 0) {
    return Math.min(64, globalVolume + x);
  } else if (y > 0) {
    return Math.max(0, globalVolume - y);
  }
  return globalVolume;
}

// ---------------------------------------------------------------------------
// Pan Slide
// ---------------------------------------------------------------------------

export function doPanSlide(
  ch: ChannelState,
  param: number,
  time: number,
  applyPanEffect: ApplyPanEffect,
): void {
  const x = (param >> 4) & 0x0F;
  const y = param & 0x0F;

  if (x > 0) {
    ch.panning = Math.min(255, ch.panning + x);
  } else if (y > 0) {
    ch.panning = Math.max(0, ch.panning - y);
  }

  applyPanEffect(ch, ch.panning, time);
}

// ---------------------------------------------------------------------------
// Multi-Note Retrigger (FT2 Rxy)
// ---------------------------------------------------------------------------

/**
 * FT2 doMultiNoteRetrig — counter-based retrigger with volume slide.
 * Reference: ft2_replayer.c lines 1202-1251
 */
export function doMultiNoteRetrig(
  ch: ChannelState,
  chIndex: number,
  time: number,
  triggerNote: TriggerNote,
): void {
  const cnt = ch.noteRetrigCounter + 1;
  if (cnt < ch.noteRetrigSpeed) {
    ch.noteRetrigCounter = cnt;
    return;
  }
  ch.noteRetrigCounter = 0;

  // Apply volume slide
  let vol = ch.volume;
  switch (ch.noteRetrigVol) {
    case 0x1: vol -= 1; break;
    case 0x2: vol -= 2; break;
    case 0x3: vol -= 4; break;
    case 0x4: vol -= 8; break;
    case 0x5: vol -= 16; break;
    case 0x6: vol = (vol >> 1) + (vol >> 3) + (vol >> 4); break; // FT2: 11/16 = 0.6875
    case 0x7: vol >>= 1; break;
    case 0x8: break;
    case 0x9: vol += 1; break;
    case 0xA: vol += 2; break;
    case 0xB: vol += 4; break;
    case 0xC: vol += 8; break;
    case 0xD: vol += 16; break;
    case 0xE: vol = (vol >> 1) + vol; break; // 1.5x
    case 0xF: vol += vol; break; // 2x
    default: break;
  }
  if (vol < 0) vol = 0;
  if (vol > 64) vol = 64;
  ch.volume = vol;
  ch.outVol = vol;

  // FT2: apply volume column set-volume / set-panning overrides
  if (ch.volColumnVol >= 0x10 && ch.volColumnVol <= 0x50) {
    ch.outVol = ch.volColumnVol - 0x10;
    ch.volume = ch.outVol;
  } else if (ch.volColumnVol >= 0xC0 && ch.volColumnVol <= 0xCF) {
    ch.outPan = (ch.volColumnVol & 0x0F) << 4;
  }

  ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
  triggerNote(ch, time, 0, chIndex, false, false, false);
}

// ---------------------------------------------------------------------------
// Tremor (FT2 Txy — effect 29)
// ---------------------------------------------------------------------------

/**
 * Tremor effect: alternates between volume on/off.
 * x = on-time ticks, y = off-time ticks.
 */
export function doTremor(ch: ChannelState, param: number, time: number, applySynthVolume?: (vol: number) => void): void {
  const tp = param !== 0 ? param : ch.tremorParam;
  ch.tremorParam = tp;

  let tremorSign = ch.tremorPos & 0x80; // bit 7: on/off state
  let tremorData = ch.tremorPos & 0x7F; // bits 0-6: counter

  tremorData--;
  if (tremorData < 0 || (tremorData & 0x80) !== 0) {
    // Counter underflow — toggle state
    if (tremorSign === 0x80) {
      tremorSign = 0x00; // switch to OFF
      tremorData = tp & 0x0F; // off-time = low nibble
    } else {
      tremorSign = 0x80; // switch to ON
      tremorData = (tp >> 4) & 0x0F; // on-time = high nibble
    }
  }

  ch.tremorPos = tremorSign | (tremorData & 0x7F);
  const tremorVol = tremorSign === 0x80 ? ch.volume : 0;
  ch.gainNode.gain.setValueAtTime(tremorVol / 64, time);
  // Apply to synths if callback provided
  if (applySynthVolume) {
    applySynthVolume(tremorVol / 64);
  }
}
