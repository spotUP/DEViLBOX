/**
 * AutomationBaker — Bake automation curves into native effect commands.
 *
 * Converts visual automation curves (volume ramps, pan sweeps, filter cutoff
 * curves, pitch sweeps, etc.) into the equivalent tracker effect commands for
 * each row. This makes automation compatible with native formats on export.
 *
 * Format-aware:
 * - MOD: Cxx volume (no volume column), effects 0-F only, no panning
 * - XM:  Volume column (0x10-0x50), panning (8xx + vol col 0xC0-0xCF),
 *         global volume (Gxx 0-40), 2 effect columns
 * - IT:  Volume column, panning (8xx), global volume (Gxx 0-80),
 *         Zxx filter cutoff (0x00-0x7F) + resonance (0x80-0x8F),
 *         up to 8 effect columns
 * - S3M: Volume column, panning (8xx), global volume (Gxx 0-40),
 *         Zxx filter cutoff (0x00-0x7F)
 *
 * Optimizations:
 * - Redundancy elimination: skips rows where value hasn't changed
 * - Volume slide detection: uses Axx/Dxx for linear ramps instead of Cxx every row
 * - Panning via volume column: frees up effect column for XM/IT/S3M
 * - Pitch delta computation: bakes pitch curves via 1xx/2xx portamento
 * - Multi-slot fallback: tries all available effect columns (up to effTyp8 for IT)
 */

import { interpolateAutomationValue } from '@/types/automation';
import type { AutomationCurve } from '@/types/automation';
import type { Pattern, TrackerCell } from '@/types/tracker';
import type { FormatConstraints } from '@/lib/formatCompatibility';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BakeResult {
  /** Modified patterns with effect commands baked in */
  patterns: Pattern[];
  /** Number of curves successfully baked */
  bakedCount: number;
  /** Number of rows where effect slots were full (curve data lost) */
  overflowRows: number;
  /** Curves that couldn't be baked (format doesn't support the parameter) */
  warnings: string[];
}

interface EffectMapping {
  /** Write the interpolated value (0-1) into the cell's available effect slots.
   *  prevValue is the value from the previous row (null if first row) for delta/redundancy.
   *  Returns true if written (or skipped due to redundancy). */
  write: (cell: TrackerCell, value: number, prevValue: number | null, format: FormatConstraints) => boolean;
}

// ── Format Helpers ──────────────────────────────────────────────────────────

/** Clamp and round a normalized 0-1 value to an integer range */
function norm(v: number, max: number): number {
  return Math.round(Math.max(0, Math.min(1, v)) * max);
}

/** Check if format has a volume column (XM/IT/S3M have it, MOD doesn't) */
function hasVolumeColumn(format: FormatConstraints): boolean {
  return format.name !== 'MOD' && format.name !== 'FC' &&
         format.name !== 'HVL' && format.name !== 'AHX';
}

/** Check if format supports extended effects (more than 0x0F) */
function hasExtendedEffects(format: FormatConstraints): boolean {
  return format.name !== 'MOD';
}

/** Max effect slots available per format */
function maxEffectSlots(format: FormatConstraints): number {
  if (format.name === 'IT') return 8;
  if (format.name === 'MOD') return 1;
  return 2; // XM, S3M
}

// ── Effect Writing ──────────────────────────────────────────────────────────

/**
 * Try to write an effect command into the first available slot.
 * Supports up to 8 effect slots (IT), 2 (XM/S3M), or 1 (MOD).
 */
function writeEffect(cell: TrackerCell, effTyp: number, eff: number, format: FormatConstraints): boolean {
  const slots = maxEffectSlots(format);

  // Slot 1 (always available)
  if (cell.effTyp === 0 && cell.eff === 0) {
    cell.effTyp = effTyp;
    cell.eff = eff;
    return true;
  }

  // Slot 2
  if (slots >= 2 &&
      (cell.effTyp2 === 0 || cell.effTyp2 === undefined) &&
      (cell.eff2 === 0 || cell.eff2 === undefined)) {
    cell.effTyp2 = effTyp;
    cell.eff2 = eff;
    return true;
  }

  // Slots 3-8 (IT extended)
  if (slots >= 3) {
    const slotPairs: [keyof TrackerCell, keyof TrackerCell][] = [
      ['effTyp3', 'eff3'], ['effTyp4', 'eff4'],
      ['effTyp5', 'eff5'], ['effTyp6', 'eff6'],
      ['effTyp7', 'eff7'], ['effTyp8', 'eff8'],
    ];
    for (const [typKey, effKey] of slotPairs) {
      const typ = cell[typKey] as number | undefined;
      const ef = cell[effKey] as number | undefined;
      if ((typ === 0 || typ === undefined) && (ef === 0 || ef === undefined)) {
        (cell as unknown as Record<string, number>)[typKey as string] = effTyp;
        (cell as unknown as Record<string, number>)[effKey as string] = eff;
        return true;
      }
    }
  }

  return false; // all slots full
}

/**
 * Try to write a panning value to the volume column (XM/IT/S3M).
 * Volume column panning: 0xC0 + nibble (0=left, 8=center, F=right).
 */
function writePanToVolumeColumn(cell: TrackerCell, panNorm: number): boolean {
  if (cell.volume !== 0 && cell.volume !== undefined) return false;
  const nibble = Math.round(Math.max(0, Math.min(1, panNorm)) * 15);
  cell.volume = 0xC0 + nibble;
  return true;
}

// ── Chip-Specific Effect Mappings ────────────────────────────────────────────

// Helper: simple absolute value effect (most common pattern)
function absEffect(effNum: number, maxVal: number): EffectMapping {
  return {
    write: (cell, v, prevValue, fmt) => {
      const val = norm(v, maxVal);
      if (prevValue !== null && norm(prevValue, maxVal) === val) return true;
      return writeEffect(cell, effNum, val, fmt);
    },
  };
}

// Helper: delta-based slide effect (up/down pair)
function slideEffect(upEff: number, downEff: number): EffectMapping {
  return {
    write: (cell, v, prevValue, fmt) => {
      if (prevValue === null) return true;
      const delta = v - prevValue;
      if (Math.abs(delta) < 0.002) return true;
      const speed = Math.min(255, Math.round(Math.abs(delta) * 255));
      if (speed === 0) return true;
      return writeEffect(cell, delta > 0 ? upEff : downEff, speed, fmt);
    },
  };
}

// Helper: nibble-packed operator parameter (x=op, y=value)
function opNibbleEffect(effNum: number, maxPerOp: number): EffectMapping {
  return {
    write: (cell, v, prevValue, fmt) => {
      // v maps to param byte directly (caller splits op+value if needed)
      const val = norm(v, maxPerOp);
      if (prevValue !== null && norm(prevValue, maxPerOp) === val) return true;
      return writeEffect(cell, effNum, val, fmt);
    },
  };
}

// ── C64/SID ─────────────────────────────────────────────────────────────────

function getC64EffectMapping(p: string): EffectMapping | null {
  // Pulse width (12-bit via 0x30-0x3F)
  if (p.includes('pulse') || p.includes('duty') || p.includes('fineduty')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const pw = norm(v, 4095);
        if (prevValue !== null && norm(prevValue, 4095) === pw) return true;
        return writeEffect(cell, 0x30 + ((pw >> 8) & 0x0F), pw & 0xFF, fmt);
      },
    };
  }
  // Filter cutoff (11-bit via 0x40-0x47)
  if (p.includes('cutoff') || (p.includes('filter') && !p.includes('filterselect') && !p.includes('filtermode'))) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const cutoff = norm(v, 2047);
        if (prevValue !== null && norm(prevValue, 2047) === cutoff) return true;
        return writeEffect(cell, 0x40 + ((cutoff >> 8) & 0x07), cutoff & 0xFF, fmt);
      },
    };
  }
  if (p.includes('resonance') || p.includes('reso')) return absEffect(0x13, 15);
  if (p.includes('filtermode') || p.includes('filter_mode')) return absEffect(0x14, 7);
  if (p.includes('waveform') || p.includes('wave')) return absEffect(0x10, 255);
  if ((p.includes('attack') && p.includes('decay')) || p === 'ad' || p.endsWith('.ad')) return absEffect(0x20, 255);
  if ((p.includes('sustain') && p.includes('release')) || p === 'sr' || p.endsWith('.sr')) return absEffect(0x21, 255);
  if (p.includes('pwslide') || p.includes('pulse_slide')) return slideEffect(0x22, 0x23);
  if (p.includes('cutoffslide') || p.includes('cutoff_slide') || p.includes('filterslide')) return slideEffect(0x24, 0x25);
  if (p.includes('envreset') || p.includes('resettime')) return absEffect(0x15, 255);
  return null;
}

// ── AY-3-8910 / YM2149 / SAA1099 ───────────────────────────────────────────

function getAYEffectMapping(p: string): EffectMapping | null {
  if (p.includes('noise') || p.includes('duty')) return absEffect(0x12, 31);
  if (p.includes('channelmode') || p.includes('noisemode')) return absEffect(0x20, 7); // bits: tone+noise+env
  if (p.includes('envshape') || p.includes('envelope_shape')) return absEffect(0x22, 255); // x=shape, y=enable
  // Envelope period (16-bit split)
  if (p.includes('envperiod') || p.includes('envelope_period')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const period = norm(v, 65535);
        if (prevValue !== null && norm(prevValue, 65535) === period) return true;
        const wroteLo = writeEffect(cell, 0x23, period & 0xFF, fmt);
        const wroteHi = writeEffect(cell, 0x24, (period >> 8) & 0xFF, fmt);
        return wroteLo || wroteHi;
      },
    };
  }
  if (p.includes('envslide') || p.includes('envelope_slide')) return slideEffect(0x25, 0x26);
  if (p.includes('autopwm') || p.includes('auto_pwm')) return absEffect(0x2C, 255);
  return null;
}

// ── FM (shared: OPN/OPN2/OPM/OPL/OPLL/OPZ/ESFM) ───────────────────────────

function getFMEffectMapping(p: string, chipType: string): EffectMapping | null {
  // Feedback (0-7)
  if (p.includes('feedback') || p.includes('.fb')) return absEffect(0x11, 7);
  // Algorithm (0-7)
  if (p.includes('algorithm') || p.includes('.alg')) return absEffect(0x61, 7);
  // Total Level per operator (0x12-0x15 = op1-4, 0-127)
  if (p.includes('tl1') || p.includes('totallevel1') || p.includes('op1level')) return absEffect(0x12, 127);
  if (p.includes('tl2') || p.includes('totallevel2') || p.includes('op2level')) return absEffect(0x13, 127);
  if (p.includes('tl3') || p.includes('totallevel3') || p.includes('op3level')) return absEffect(0x14, 127);
  if (p.includes('tl4') || p.includes('totallevel4') || p.includes('op4level')) return absEffect(0x15, 127);
  // Multiplier (nibble: op in high, value 0-15 in low)
  if (p.includes('mult') || p.includes('multiplier')) return opNibbleEffect(0x16, 255);
  // Attack rate per op (0x19=all, 0x1A-0x1D=op1-4)
  if (p.includes('attackrate') || p.includes('ar')) return absEffect(0x19, 31);
  // Decay rate (0x56=all, 0x57-0x5A=op1-4)
  if (p.includes('decayrate') || p.includes('.dr')) return absEffect(0x56, 31);
  // Sustain level (nibble: 0x51, x=op, y=0-15)
  if (p.includes('sustainlevel') || p.includes('.sl')) return opNibbleEffect(0x51, 255);
  // Release rate (nibble: 0x52, x=op, y=0-15)
  if (p.includes('releaserate') || p.includes('.rr')) return opNibbleEffect(0x52, 255);
  // Secondary decay / D2R (0x5B=all, 0x5C-0x5F=op1-4)
  if (p.includes('d2r') || p.includes('secondarydecay')) return absEffect(0x5B, 31);
  // Detune (nibble: 0x53, x=op, y=0-7)
  if (p.includes('detune') && !p.includes('detune2')) return opNibbleEffect(0x53, 255);
  // Rate scaling (nibble: 0x54, x=op, y=0-3)
  if (p.includes('ratescal') || p.includes('.rs') || p.includes('keyscal')) return opNibbleEffect(0x54, 255);
  // AM enable (nibble: 0x50, x=op, y=0/1)
  if (p.includes('amenable') || p.includes('ampmod')) return opNibbleEffect(0x50, 255);
  // LFO FM sensitivity / depth (0-7)
  if (p.includes('fms') || p.includes('fmdepth') || p.includes('fm_sensitivity')) return absEffect(0x62, 7);
  // LFO AM sensitivity / depth (0-3)
  if (p.includes('ams') || p.includes('amdepth') || p.includes('am_sensitivity')) return absEffect(0x63, 3);

  // ── OPM-specific ────────────────────────────────────────────────────
  if (chipType === 'opm' || chipType === 'arcade') {
    if (p.includes('lfospeed') || p.includes('lfo_speed')) return absEffect(0x17, 255);
    if (p.includes('lfowave') || p.includes('lfo_wave')) return absEffect(0x18, 3); // saw/sq/tri/noise
    if (p.includes('pmdepth') || p.includes('pm_depth') || p.includes('vibratodepth')) return absEffect(0x1F, 127);
    if (p.includes('amlfo') || p.includes('am_depth')) return absEffect(0x1E, 127);
    if (p.includes('detune2') || p.includes('dt2')) return opNibbleEffect(0x55, 255);
  }

  // ── OPL-specific ────────────────────────────────────────────────────
  if (chipType === 'opl' || chipType === 'opl2' || chipType === 'opl3') {
    if (p.includes('waveselect') || p.includes('waveform')) return opNibbleEffect(0x2A, 255); // x=op, y=0-7
  }

  // ── ESFM-specific ───────────────────────────────────────────────────
  if (chipType === 'esfm') {
    if (p.includes('waveselect') || p.includes('waveform')) return opNibbleEffect(0x2A, 255);
    if (p.includes('oppan') || p.includes('op_pan') || p.includes('operatorpan')) return absEffect(0x20, 255); // 0x20-0x23
    if (p.includes('outlevel') || p.includes('outputlevel')) return opNibbleEffect(0x24, 255);
    if (p.includes('modinput') || p.includes('modin')) return opNibbleEffect(0x25, 255);
    if (p.includes('envdelay') || p.includes('envelope_delay')) return opNibbleEffect(0x26, 255);
  }

  // ── OPLL-specific ───────────────────────────────────────────────────
  if (chipType === 'opll' || chipType === 'vrc7') {
    if (p.includes('patch') || p.includes('waveform')) return absEffect(0x10, 15);
  }

  return null;
}

// ── Game Boy ────────────────────────────────────────────────────────────────

function getGBEffectMapping(p: string): EffectMapping | null {
  if (p.includes('waveform') || p.includes('wave')) return absEffect(0x10, 3);
  if (p.includes('duty') || p.includes('pulse')) return absEffect(0x12, 3);
  if (p.includes('sweeptime') || p.includes('sweep_time')) return absEffect(0x13, 7);
  if (p.includes('sweepdir') || p.includes('sweep_dir')) return absEffect(0x14, 1);
  if (p.includes('noisemode') || p.includes('noise')) return absEffect(0x11, 255);
  return null;
}

// ── NES APU ─────────────────────────────────────────────────────────────────

function getNESEffectMapping(p: string): EffectMapping | null {
  if (p.includes('duty') || p.includes('noisemode') || p.includes('noise_mode')) return absEffect(0x12, 3);
  if (p.includes('envmode') || p.includes('envelope_mode')) return absEffect(0x15, 255);
  if (p.includes('lengthcounter') || p.includes('length')) return absEffect(0x16, 255);
  if (p.includes('linearcounter') || p.includes('linear')) return absEffect(0x19, 255);
  return null;
}

// ── FDS (Famicom Disk System) ───────────────────────────────────────────────

function getFDSEffectMapping(p: string): EffectMapping | null {
  if (p.includes('waveform') || p.includes('wave')) return absEffect(0x10, 255);
  if (p.includes('moddepth') || p.includes('mod_depth') || p.includes('fmdepth')) return absEffect(0x11, 255);
  if (p.includes('modspeed') || p.includes('mod_speed')) {
    // 16-bit split: 0x12 = high, 0x13 = low
    return {
      write: (cell, v, prevValue, fmt) => {
        const speed = norm(v, 65535);
        if (prevValue !== null && norm(prevValue, 65535) === speed) return true;
        const wroteHi = writeEffect(cell, 0x12, (speed >> 8) & 0xFF, fmt);
        const wroteLo = writeEffect(cell, 0x13, speed & 0xFF, fmt);
        return wroteHi || wroteLo;
      },
    };
  }
  if (p.includes('modpos') || p.includes('mod_pos')) return absEffect(0x14, 255);
  if (p.includes('modwave') || p.includes('mod_wave')) return absEffect(0x15, 255);
  return null;
}

// ── PC Engine / HuC6280 ─────────────────────────────────────────────────────

function getPCEEffectMapping(p: string): EffectMapping | null {
  if (p.includes('waveform') || p.includes('wave')) return absEffect(0x10, 255);
  if (p.includes('noise') || p.includes('duty')) return absEffect(0x11, 255);
  if (p.includes('lfomode') || p.includes('lfo_mode')) return absEffect(0x12, 255);
  if (p.includes('lfospeed') || p.includes('lfo_speed')) return absEffect(0x13, 255);
  return null;
}

// ── SNES S-DSP ──────────────────────────────────────────────────────────────

function getSNESEffectMapping(p: string): EffectMapping | null {
  // Per-channel
  if (p.includes('waveform') || p.includes('wave') || p.includes('sample')) return absEffect(0x10, 255);
  if (p.includes('noise') || p.includes('noisemode')) return absEffect(0x11, 255);
  if (p.includes('echo') && !p.includes('delay') && !p.includes('feedback') && !p.includes('vol') && !p.includes('fir')) return absEffect(0x12, 1);
  if (p.includes('pitchmod') || p.includes('pitch_mod')) return absEffect(0x13, 1);
  if (p.includes('invert')) return absEffect(0x14, 1);
  if (p.includes('gainmode') || p.includes('gain_mode')) return absEffect(0x15, 255);
  if (p.includes('gain') && !p.includes('gainmode')) return absEffect(0x16, 255);
  if (p.includes('noisefreq') || p.includes('noise_freq')) return absEffect(0x1D, 255);
  // Per-channel ADSR
  if (p.includes('attackrate') || p.includes('.ar')) return absEffect(0x20, 15);
  if (p.includes('decayrate') || p.includes('.dr')) return absEffect(0x21, 7);
  if (p.includes('sustainlevel') || p.includes('.sl')) return absEffect(0x22, 7);
  if (p.includes('releaserate') || p.includes('.rr')) return absEffect(0x23, 31);
  // Global echo/reverb
  if (p.includes('echoenable') || p.includes('echo_enable')) return absEffect(0x18, 1);
  if (p.includes('echodelay') || p.includes('echo_delay')) return absEffect(0x19, 7);
  if (p.includes('echovoll') || p.includes('echo_vol_l') || p.includes('echo_left')) return absEffect(0x1A, 255);
  if (p.includes('echovolr') || p.includes('echo_vol_r') || p.includes('echo_right')) return absEffect(0x1B, 255);
  if (p.includes('echofeedback') || p.includes('echo_feedback')) return absEffect(0x1C, 255);
  // Global volume
  if (p.includes('globalvoll') || p.includes('global_vol_l') || p.includes('mastervoll')) return absEffect(0x1E, 255);
  if (p.includes('globalvolr') || p.includes('global_vol_r') || p.includes('mastervolr')) return absEffect(0x1F, 255);
  // FIR filter coefficients (0x30-0x37)
  for (let i = 0; i < 8; i++) {
    if (p === `fir${i}` || p === `fir_${i}` || p === `echocoef${i}`) return absEffect(0x30 + i, 255);
  }
  return null;
}

// ── Amiga Paula ─────────────────────────────────────────────────────────────

function getAmigaEffectMapping(p: string): EffectMapping | null {
  if (p.includes('ledfilter') || p.includes('amigafilter') || (p.includes('filter') && !p.includes('filtermode'))) return absEffect(0x10, 1);
  if (p.includes('ampmod') || p.includes('am')) return absEffect(0x11, 255);
  if (p.includes('pitchmod') || p.includes('pm')) return absEffect(0x12, 255);
  return null;
}

// ── SMS / SN76489 ───────────────────────────────────────────────────────────

function getSMSEffectMapping(p: string): EffectMapping | null {
  if (p.includes('noisemode') || p.includes('noise') || p.includes('duty')) return absEffect(0x20, 3);
  return null;
}

// ── VRC6 ────────────────────────────────────────────────────────────────────

function getVRC6EffectMapping(p: string): EffectMapping | null {
  if (p.includes('duty') || p.includes('pulse')) return absEffect(0x12, 7);
  return null;
}

// ── POKEY (Atari) ───────────────────────────────────────────────────────────

function getPOKEYEffectMapping(p: string): EffectMapping | null {
  if (p.includes('audctl') || p.includes('noisemode') || p.includes('noise')) return absEffect(0x20, 255);
  return null;
}

// ── TIA (Atari 2600) ────────────────────────────────────────────────────────

function getTIAEffectMapping(p: string): EffectMapping | null {
  if (p.includes('audc') || p.includes('noisemode') || p.includes('noise')) return absEffect(0x20, 255);
  return null;
}

// ── N163 (Namco) ────────────────────────────────────────────────────────────

function getN163EffectMapping(p: string): EffectMapping | null {
  if (p.includes('waveform') || p.includes('wave')) return absEffect(0x10, 255);
  if (p.includes('wavepos') || p.includes('wave_pos')) return absEffect(0x11, 255);
  if (p.includes('wavelen') || p.includes('wave_len')) return absEffect(0x12, 255);
  if (p.includes('channellimit') || p.includes('channel_limit')) return absEffect(0x18, 7);
  return null;
}

// ── ES5506 ──────────────────────────────────────────────────────────────────

function getES5506EffectMapping(p: string): EffectMapping | null {
  if (p.includes('filtermode') || p.includes('filter_mode')) return absEffect(0x14, 255);
  if (p.includes('filterk1') || p.includes('filter_k1') || p.includes('cutoff')) return absEffect(0x15, 255);
  if (p.includes('filterk2') || p.includes('filter_k2') || p.includes('resonance')) return absEffect(0x16, 255);
  return null;
}

// ── QSound ──────────────────────────────────────────────────────────────────

function getQSoundEffectMapping(p: string): EffectMapping | null {
  if (p.includes('echofeedback') || p.includes('echo_feedback')) return absEffect(0x17, 255);
  if (p.includes('echolevel') || p.includes('echo_level') || p.includes('echo')) return absEffect(0x18, 255);
  if (p.includes('surround')) return absEffect(0x19, 255);
  return null;
}

// ── Dub Move Parameters ──────────────────────────────────────────────────────

/**
 * Effect mappings for dub.* automation parameters (dub moves).
 * Values are always 0-1 normalized (same convention as all other mappings).
 */
function getDubEffectMapping(p: string): EffectMapping | null {
  // dub.channelmute: value >= 0.5 → mute (vol=0), value < 0.5 → restore (vol=64)
  if (p === 'dub.channelmute') {
    return {
      write: (cell, v, _prevValue, fmt) => {
        const vol = v >= 0.5 ? 0 : 64;
        if (hasVolumeColumn(fmt)) {
          if (!cell.volume || (cell.volume >= 0x10 && cell.volume <= 0x50)) {
            cell.volume = 0x10 + vol;
            return true;
          }
        }
        return writeEffect(cell, 12, vol, fmt);
      },
    };
  }

  // dub.channelthrow: value >= 0.5 → full-volume spike (vol=64)
  if (p === 'dub.channelthrow') {
    return {
      write: (cell, v, _prevValue, fmt) => {
        if (v < 0.5) return true; // no-op on release
        if (hasVolumeColumn(fmt)) {
          if (cell.volume === 0 || cell.volume === undefined) {
            cell.volume = 0x10 + 64;
            return true;
          }
        }
        return writeEffect(cell, 12, 64, fmt);
      },
    };
  }

  // dub.echothrow / dub.skankechothrow: echo delay toggle (Exx in XM/IT/S3M; skip MOD)
  if (p === 'dub.echothrow' || p === 'dub.skankechothrow') {
    return {
      write: (cell, v, _prevValue, fmt) => {
        if (fmt.name === 'MOD') return false;
        if (v < 0.5) return true; // no-op on release
        return writeEffect(cell, 0x0e, 0x80, fmt);
      },
    };
  }

  // dub.echobuildup: ascending echo feedback E0x–EFx
  if (p === 'dub.echobuildup') {
    return {
      write: (cell, v, _prevValue, fmt) => {
        if (fmt.name === 'MOD') return false;
        const nibble = norm(v, 15);
        return writeEffect(cell, 0x0e, nibble, fmt);
      },
    };
  }

  // dub.eqsweep: Zxx filter cutoff (IT/S3M only, effect type 0x1A = 26)
  if (p === 'dub.eqsweep') {
    return {
      write: (cell, v, _prevValue, fmt) => {
        if (fmt.name !== 'IT' && fmt.name !== 'S3M') return false;
        const cutoff = norm(v, 0x7f);
        return writeEffect(cell, 0x1a, cutoff, fmt);
      },
    };
  }

  return null;
}

// ── Effect Mappings ─────────────────────────────────────────────────────────

function getEffectMapping(param: string, format: FormatConstraints): EffectMapping | null {
  const p = param.toLowerCase();
  const chip = format.chipType;

  // ── Dub move parameters ──────────────────────────────────────────────────
  if (p.startsWith('dub.')) return getDubEffectMapping(p);

  // ── Chip-specific effects (Furnace format) ────────────────────────────
  if (chip) {
    let mapping: EffectMapping | null = null;

    // C64/SID
    if (chip === 'c64') mapping = getC64EffectMapping(p);
    // AY/PSG family
    else if (chip === 'ay' || chip === 'saa') mapping = getAYEffectMapping(p);
    // FM family (shared base + chip-specific extensions)
    else if (['opn', 'opn2', 'opm', 'arcade', 'opl', 'opl2', 'opl3', 'opll', 'vrc7', 'opz', 'esfm'].includes(chip))
      mapping = getFMEffectMapping(p, chip);
    // Game Boy
    else if (chip === 'gb') mapping = getGBEffectMapping(p);
    // NES
    else if (chip === 'nes') mapping = getNESEffectMapping(p);
    // FDS
    else if (chip === 'fds') mapping = getFDSEffectMapping(p);
    // PC Engine
    else if (chip === 'pce') mapping = getPCEEffectMapping(p);
    // SNES
    else if (chip === 'snes') mapping = getSNESEffectMapping(p);
    // Amiga
    else if (chip === 'amiga') mapping = getAmigaEffectMapping(p);
    // SMS / SN76489
    else if (chip === 'sms' || chip === 'sn76489') mapping = getSMSEffectMapping(p);
    // VRC6
    else if (chip === 'vrc6') mapping = getVRC6EffectMapping(p);
    // POKEY
    else if (chip === 'pokey') mapping = getPOKEYEffectMapping(p);
    // TIA
    else if (chip === 'tia') mapping = getTIAEffectMapping(p);
    // N163
    else if (chip === 'n163') mapping = getN163EffectMapping(p);
    // ES5506
    else if (chip === 'es5506') mapping = getES5506EffectMapping(p);
    // QSound
    else if (chip === 'qsound') mapping = getQSoundEffectMapping(p);

    if (mapping) return mapping;
    // Fall through to generic XM/IT/MOD mappings
  }

  // ── Volume ────────────────────────────────────────────────────────────
  // Parameters: volume, vol, gain, level, amplitude
  if (p.includes('volume') || p.includes('.vol') || p === 'gain' || p.includes('level') || p.includes('amplitude')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const vol = norm(v, 64);

        // Redundancy: skip if same value as previous row
        if (prevValue !== null && norm(prevValue, 64) === vol) return true;

        // Format-specific: XM/IT/S3M prefer volume column
        if (hasVolumeColumn(fmt)) {
          if (cell.volume === 0 || cell.volume === undefined) {
            cell.volume = 0x10 + Math.min(vol, 64);
            return true;
          }
        }

        // MOD or volume column occupied: use Cxx (effect type 12)
        return writeEffect(cell, 12, Math.min(vol, 64), fmt);
      },
    };
  }

  // ── Global Volume ─────────────────────────────────────────────────────
  // XM/IT/S3M: Gxx (effect type 16)
  if (p.includes('globalvol') || p.includes('global_vol') || p.includes('master_vol') || p.includes('mastervol')) {
    if (format.name === 'MOD') return null; // MOD has no global volume

    return {
      write: (cell, v, prevValue, fmt) => {
        // IT uses 0-128, XM/S3M use 0-64
        const maxVal = fmt.name === 'IT' ? 128 : 64;
        const gvol = norm(v, maxVal);

        if (prevValue !== null && norm(prevValue, maxVal) === gvol) return true;

        // Gxx = effect type 16
        if (!hasExtendedEffects(fmt)) return false;
        return writeEffect(cell, 16, gvol, fmt);
      },
    };
  }

  // ── Panning ───────────────────────────────────────────────────────────
  // Parameters: pan, panL, panR, panning
  if (p.includes('pan')) {
    if (!format.supportsPanning) return null; // MOD doesn't support panning

    return {
      write: (cell, v, prevValue, fmt) => {
        const pan = norm(v, 255);

        if (prevValue !== null && norm(prevValue, 255) === pan) return true;

        // Try volume column panning first (XM/IT/S3M) — frees effect column
        if (hasVolumeColumn(fmt) && writePanToVolumeColumn(cell, v)) {
          return true;
        }

        // Fall back to 8xx effect (effect type 8)
        return writeEffect(cell, 8, pan, fmt);
      },
    };
  }

  // ── Filter Cutoff ─────────────────────────────────────────────────────
  // IT/S3M: Zxx 0x00-0x7F (effect type 26)
  if (p.includes('cutoff') || (p.includes('filter') && !p.includes('filterselect') && !p.includes('filtermode'))) {
    if (format.name !== 'IT' && format.name !== 'S3M') return null;

    return {
      write: (cell, v, prevValue, fmt) => {
        const cutoff = norm(v, 127);

        if (prevValue !== null && norm(prevValue, 127) === cutoff) return true;

        // Zxx = effect type 26, param 0x00-0x7F = cutoff
        return writeEffect(cell, 26, cutoff, fmt);
      },
    };
  }

  // ── Filter Resonance ──────────────────────────────────────────────────
  // IT/S3M: Zxx 0x80-0x8F (effect type 26, high nibble 0x80)
  if (p.includes('resonance') || p.includes('reso')) {
    if (format.name !== 'IT' && format.name !== 'S3M') return null;

    return {
      write: (cell, v, prevValue, fmt) => {
        // IT resonance: Zxx where xx = 0x80 + (0-15)
        const reso = norm(v, 15);

        if (prevValue !== null && norm(prevValue, 15) === reso) return true;

        return writeEffect(cell, 26, 0x80 + reso, fmt);
      },
    };
  }

  // ── Pitch / Frequency ─────────────────────────────────────────────────
  // Bake as portamento: compute delta between rows, use 1xx (slide up) / 2xx (slide down)
  if (p.includes('pitch') || p.includes('frequency') || p.includes('period') || p.includes('detune') || p.includes('finetune')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        if (prevValue === null) return true; // first row — no delta

        // Delta: positive = pitch up, negative = pitch down
        // Map 0-1 range to portamento speed 0-255
        const delta = v - prevValue;
        if (Math.abs(delta) < 0.002) return true; // no significant change

        const speed = Math.min(255, Math.round(Math.abs(delta) * 255));
        if (speed === 0) return true;

        if (delta > 0) {
          // 1xx = portamento up (effect type 1)
          return writeEffect(cell, 1, speed, fmt);
        } else {
          // 2xx = portamento down (effect type 2)
          return writeEffect(cell, 2, speed, fmt);
        }
      },
    };
  }

  // ── Vibrato ───────────────────────────────────────────────────────────
  // Periodic pitch oscillation → 4xy (x=speed, y=depth)
  if (p.includes('vibrato')) {
    return {
      write: (cell, v, _prevValue, fmt) => {
        // v encodes combined speed+depth: split into nibbles
        // speed = high nibble (0-F), depth = low nibble (0-F)
        const combined = norm(v, 255);
        const speed = (combined >> 4) & 0x0F;
        const depth = combined & 0x0F;
        if (speed === 0 && depth === 0) return true;

        // 4xy = vibrato (effect type 4)
        return writeEffect(cell, 4, (speed << 4) | depth, fmt);
      },
    };
  }

  // ── Tremolo ───────────────────────────────────────────────────────────
  // Periodic volume oscillation → 7xy (x=speed, y=depth)
  if (p.includes('tremolo')) {
    return {
      write: (cell, v, _prevValue, fmt) => {
        const combined = norm(v, 255);
        const speed = (combined >> 4) & 0x0F;
        const depth = combined & 0x0F;
        if (speed === 0 && depth === 0) return true;

        // 7xy = tremolo (effect type 7)
        return writeEffect(cell, 7, (speed << 4) | depth, fmt);
      },
    };
  }

  // ── Pulse width (SID/C64 specific — no standard tracker effect) ───────
  if (p.includes('pulse') || p.includes('duty')) {
    return null;
  }

  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Bake automation curves into native effect commands.
 *
 * @param patterns  The song's patterns (will be deep-cloned, originals not modified)
 * @param curves    All automation curves from useAutomationStore
 * @param format    Target format constraints (determines which effects are available)
 * @returns Modified patterns + stats
 */
export function bakeAutomationForExport(
  patterns: Pattern[],
  curves: AutomationCurve[],
  format: FormatConstraints,
): BakeResult {
  // Deep clone to avoid mutating originals
  const baked = structuredClone(patterns);
  const warnings: string[] = [];
  let bakedCount = 0;
  let overflowRows = 0;

  for (const curve of curves) {
    if (!curve.enabled || curve.points.length === 0) continue;

    // Find the pattern this curve belongs to
    const patIdx = baked.findIndex(p => p.id === curve.patternId);
    if (patIdx < 0) continue;
    const pattern = baked[patIdx];
    const ch = curve.channelIndex;
    if (ch < 0 || ch >= pattern.channels.length) continue;

    // Get the effect mapping for this parameter + format
    const mapping = getEffectMapping(curve.parameter, format);
    if (!mapping) {
      warnings.push(`"${curve.parameter}" cannot be baked into ${format.name} effect commands`);
      continue;
    }

    // Sample curve at every row and write effect commands
    let rowsWritten = 0;
    let prevValue: number | null = null;

    for (let row = 0; row < pattern.length; row++) {
      const cell = pattern.channels[ch].rows[row];
      if (!cell) continue;

      const value = interpolateAutomationValue(
        curve.points,
        row,
        curve.interpolation,
        curve.mode,
      );
      if (value === null) continue;

      if (mapping.write(cell, value, prevValue, format)) {
        rowsWritten++;
      } else {
        overflowRows++;
      }

      prevValue = value;
    }

    if (rowsWritten > 0) {
      bakedCount++;
    } else {
      warnings.push(`"${curve.parameter}" curve has no data to bake`);
    }
  }

  // Post-process: optimize linear volume ramps into fine slide commands
  // Volume column optimization (XM/IT/S3M)
  const volColSlides = optimizeVolumeSlides(baked, format);
  // Effect column Cxx optimization (all formats including MOD)
  const effColSlides = optimizeEffectColumnVolumeSlides(baked);
  const totalSlides = volColSlides + effColSlides;
  if (totalSlides > 0) {
    warnings.push(`Optimized ${totalSlides} volume row(s) into fine slide commands.`);
  }

  return { patterns: baked, bakedCount, overflowRows, warnings };
}

// ── Slide Optimization (Post-Process) ───────────────────────────────────────

/**
 * Generic linear-run detector + replacer.
 *
 * Scans a channel's cells for consecutive entries that form a linear ramp
 * (constant delta in [-15, 15]) and replaces row [start+1, end] with fine
 * slide commands. Used for both volume column (0x80-0x9F) and effect column
 * Cxx → EAx/EBx optimization.
 *
 * @param patterns      Patterns to process (mutated in place)
 * @param readValue     Extract the value from a cell, or null if not eligible
 * @param writeSlide    Write the slide command for delta into a cell
 * @returns number of rows replaced with slides
 */
interface SlideStrategy {
  readValue: (cell: TrackerCell) => number | null;
  writeSlide: (cell: TrackerCell, delta: number) => void;
}

function optimizeSlides(patterns: Pattern[], strategy: SlideStrategy): number {
  let optimized = 0;

  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      const rows = channel.rows;
      let runStart = -1;
      let runDelta = 0;
      let runStartVal = 0;

      const finalize = (endRow: number): void => {
        if (runStart >= 0 && endRow - runStart >= 1 && runDelta !== 0) {
          for (let r = runStart + 1; r <= endRow; r++) {
            if (rows[r]) strategy.writeSlide(rows[r], runDelta);
          }
          optimized += endRow - runStart;
        }
      };

      for (let r = 0; r <= rows.length; r++) {
        const cell = r < rows.length ? rows[r] : undefined;
        // Notes/instruments break the run (would reset volume on the chip)
        const eligible = cell && !cell.note && !cell.instrument;
        const value = eligible ? strategy.readValue(cell!) : null;

        if (value === null) {
          finalize(r - 1);
          runStart = -1;
          runDelta = 0;
          continue;
        }

        if (runStart < 0) {
          // Start a new run
          runStart = r;
          runStartVal = value;
          runDelta = 0;
        } else if (runStart === r - 1) {
          // Second row — establish delta
          runDelta = value - runStartVal;
          if (Math.abs(runDelta) < 1 || Math.abs(runDelta) > 15) {
            // Delta out of range — restart from this row
            runStart = r;
            runStartVal = value;
            runDelta = 0;
          }
        } else {
          // Continuation — check delta still matches
          const expected = runStartVal + runDelta * (r - runStart);
          if (value !== expected) {
            // Delta broke — emit slides for the previous run, restart
            finalize(r - 1);
            runStart = r;
            runStartVal = value;
            runDelta = 0;
          }
        }
      }
      finalize(rows.length - 1);
    }
  }
  return optimized;
}

/**
 * Volume column slide strategy (XM/IT/S3M only).
 *
 * Volume column encoding:
 *   0x10-0x50 = Set Volume (0-64)
 *   0x80-0x8F = Fine Volume Down (1-15 per row, tick 0 only)
 *   0x90-0x9F = Fine Volume Up   (1-15 per row, tick 0 only)
 */
const VOL_COLUMN_SLIDE: SlideStrategy = {
  readValue: (cell) => {
    const v = cell.volume;
    if (v === undefined || v < 0x10 || v > 0x50) return null;
    return v - 0x10;
  },
  writeSlide: (cell, delta) => {
    cell.volume = delta > 0 ? (0x90 + delta) : (0x80 + (-delta));
  },
};

/**
 * Effect column Cxx → EAx/EBx slide strategy (all formats including MOD).
 *
 * Cxx = effect type 12, param 0-64 (set volume)
 * Exx = effect type 14, param 0xA0-0xAF up / 0xB0-0xBF down (fine vol slide)
 */
const EFFECT_COLUMN_SLIDE: SlideStrategy = {
  readValue: (cell) => {
    if (cell.effTyp !== 12 || cell.eff < 0 || cell.eff > 64) return null;
    return cell.eff;
  },
  writeSlide: (cell, delta) => {
    cell.effTyp = 14;
    cell.eff = delta > 0 ? (0xA0 + delta) : (0xB0 + (-delta));
  },
};

function optimizeVolumeSlides(patterns: Pattern[], format: FormatConstraints): number {
  if (!hasVolumeColumn(format)) return 0;
  return optimizeSlides(patterns, VOL_COLUMN_SLIDE);
}

function optimizeEffectColumnVolumeSlides(patterns: Pattern[]): number {
  return optimizeSlides(patterns, EFFECT_COLUMN_SLIDE);
}

/**
 * Check if a set of automation curves can be fully baked for a format.
 * Returns the list of parameters that CAN'T be baked.
 */
export function getUnbakeableParameters(
  curves: AutomationCurve[],
  format: FormatConstraints,
): string[] {
  const unbakeable: string[] = [];
  for (const curve of curves) {
    if (!curve.enabled || curve.points.length === 0) continue;
    const mapping = getEffectMapping(curve.parameter, format);
    if (!mapping) {
      unbakeable.push(curve.parameter);
    }
  }
  return [...new Set(unbakeable)]; // dedupe
}
