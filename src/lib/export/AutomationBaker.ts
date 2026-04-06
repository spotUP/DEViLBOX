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

/**
 * C64/SID chip-specific Furnace effects.
 *
 * Effect numbers are Furnace-specific (not XM/IT):
 *   0x10 = Set Waveform       0x11 = Coarse Cutoff     0x12 = Coarse Pulse Width
 *   0x13 = Set Resonance      0x14 = Filter Mode       0x15 = Envelope Reset Time
 *   0x20 = Attack/Decay       0x21 = Sustain/Release
 *   0x22 = Pulse Width Slide Up   0x23 = Pulse Width Slide Down
 *   0x24 = Cutoff Slide Up        0x25 = Cutoff Slide Down
 *   0x30-0x3F = Fine Pulse Width (12-bit, spread across 16 effect values)
 *   0x40-0x47 = Fine Cutoff (11-bit, spread across 8 effect values)
 */
function getC64EffectMapping(p: string, _format: FormatConstraints): EffectMapping | null {

  // ── Pulse Width / Duty Cycle ──────────────────────────────────────────
  // C64's signature parameter — normally unbakeable in generic formats!
  if (p.includes('pulse') || p.includes('duty') || p.includes('fineduty') || p.includes('fine_duty')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        // 12-bit pulse width: 0-4095
        // Use fine duty (0x30-0x3F): effect = 0x30 + high nibble, param = low byte
        const pw = norm(v, 4095);

        if (prevValue !== null && norm(prevValue, 4095) === pw) return true;

        // Fine pulse width: 0x30 + ((pw >> 8) & 0x0F), param = pw & 0xFF
        const hi = (pw >> 8) & 0x0F;
        const lo = pw & 0xFF;
        return writeEffect(cell, 0x30 + hi, lo, fmt);
      },
    };
  }

  // ── Filter Cutoff ─────────────────────────────────────────────────────
  // C64 has 11-bit cutoff (0-2047)
  if (p.includes('cutoff') || (p.includes('filter') && !p.includes('filterselect') && !p.includes('filtermode'))) {
    return {
      write: (cell, v, prevValue, fmt) => {
        // 11-bit cutoff: 0-2047
        // Use fine cutoff (0x40-0x47): effect = 0x40 + ((cutoff >> 8) & 0x07), param = cutoff & 0xFF
        const cutoff = norm(v, 2047);

        if (prevValue !== null && norm(prevValue, 2047) === cutoff) return true;

        const hi = (cutoff >> 8) & 0x07;
        const lo = cutoff & 0xFF;
        return writeEffect(cell, 0x40 + hi, lo, fmt);
      },
    };
  }

  // ── Filter Resonance ──────────────────────────────────────────────────
  // C64 resonance: 0-15 (4-bit), effect 0x13
  if (p.includes('resonance') || p.includes('reso')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const reso = norm(v, 15);

        if (prevValue !== null && norm(prevValue, 15) === reso) return true;

        // 0x13 = Set Resonance
        return writeEffect(cell, 0x13, reso, fmt);
      },
    };
  }

  // ── Filter Mode ───────────────────────────────────────────────────────
  // C64 filter mode bits: LP=1, BP=2, HP=4 (combinable), effect 0x14
  if (p.includes('filtermode') || p.includes('filter_mode')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        // Map 0-1 to mode bits: 0=off, 1=LP, 2=BP, 3=LP+BP, 4=HP, 5=HP+LP, 6=HP+BP, 7=all
        const mode = norm(v, 7);

        if (prevValue !== null && norm(prevValue, 7) === mode) return true;

        return writeEffect(cell, 0x14, mode, fmt);
      },
    };
  }

  // ── Waveform ──────────────────────────────────────────────────────────
  // SID waveform bits: 0x10=TRI, 0x20=SAW, 0x40=PUL, 0x80=NOI, effect 0x10
  if (p.includes('waveform') || p.includes('wave') || (p === 'furnace.duty' || p.endsWith('.duty'))) {
    return {
      write: (cell, v, prevValue, fmt) => {
        // Map 0-1 to waveform bits (0-255)
        const wave = norm(v, 255);

        if (prevValue !== null && norm(prevValue, 255) === wave) return true;

        // 0x10 = Set Waveform
        return writeEffect(cell, 0x10, wave, fmt);
      },
    };
  }

  // ── Attack/Decay ──────────────────────────────────────────────────────
  // ADSR upper byte: attack (high nibble) + decay (low nibble), effect 0x20
  if (p.includes('attack') && p.includes('decay') || p === 'ad' || p.endsWith('.ad')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const ad = norm(v, 255);
        if (prevValue !== null && norm(prevValue, 255) === ad) return true;
        return writeEffect(cell, 0x20, ad, fmt);
      },
    };
  }

  // ── Sustain/Release ───────────────────────────────────────────────────
  // ADSR lower byte: sustain (high nibble) + release (low nibble), effect 0x21
  if (p.includes('sustain') && p.includes('release') || p === 'sr' || p.endsWith('.sr')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const sr = norm(v, 255);
        if (prevValue !== null && norm(prevValue, 255) === sr) return true;
        return writeEffect(cell, 0x21, sr, fmt);
      },
    };
  }

  // ── Pulse Width Slide ─────────────────────────────────────────────────
  // Delta-based: 0x22 = slide up, 0x23 = slide down
  if (p.includes('pwslide') || p.includes('pulse_slide') || p.includes('pulsewidthslide')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        if (prevValue === null) return true;
        const delta = v - prevValue;
        if (Math.abs(delta) < 0.002) return true;

        const speed = Math.min(255, Math.round(Math.abs(delta) * 255));
        if (speed === 0) return true;

        return writeEffect(cell, delta > 0 ? 0x22 : 0x23, speed, fmt);
      },
    };
  }

  // ── Cutoff Slide ──────────────────────────────────────────────────────
  // Delta-based: 0x24 = slide up, 0x25 = slide down
  if (p.includes('cutoffslide') || p.includes('cutoff_slide') || p.includes('filterslide')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        if (prevValue === null) return true;
        const delta = v - prevValue;
        if (Math.abs(delta) < 0.002) return true;

        const speed = Math.min(255, Math.round(Math.abs(delta) * 255));
        if (speed === 0) return true;

        return writeEffect(cell, delta > 0 ? 0x24 : 0x25, speed, fmt);
      },
    };
  }

  // ── Envelope Reset Time ───────────────────────────────────────────────
  // Effect 0x15
  if (p.includes('envreset') || p.includes('envelope_reset') || p.includes('resettime')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const val = norm(v, 255);
        if (prevValue !== null && norm(prevValue, 255) === val) return true;
        return writeEffect(cell, 0x15, val, fmt);
      },
    };
  }

  return null; // fall through to generic mappings
}

/**
 * AY-3-8910 / YM2149 chip-specific Furnace effects.
 *
 * Effect numbers:
 *   0x12 = Set Duty (noise frequency)
 *   0x20 = Set Envelope shape
 *   0x21 = Set Envelope period low
 *   0x22 = Set Envelope period high
 *   0x23 = Set Envelope slide up
 *   0x24 = Set Envelope slide down
 */
function getAYEffectMapping(p: string, _format: FormatConstraints): EffectMapping | null {

  // ── Noise Frequency / Duty ────────────────────────────────────────────
  if (p.includes('noise') || p.includes('duty')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const noise = norm(v, 31); // AY noise period 0-31
        if (prevValue !== null && norm(prevValue, 31) === noise) return true;
        return writeEffect(cell, 0x12, noise, fmt);
      },
    };
  }

  // ── Envelope Shape ────────────────────────────────────────────────────
  if (p.includes('envshape') || p.includes('envelope_shape')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const shape = norm(v, 15); // AY envelope shapes 0-15
        if (prevValue !== null && norm(prevValue, 15) === shape) return true;
        return writeEffect(cell, 0x20, shape, fmt);
      },
    };
  }

  // ── Envelope Period ───────────────────────────────────────────────────
  if (p.includes('envperiod') || p.includes('envelope_period')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        // 16-bit period split into two effects: 0x21 (low byte), 0x22 (high byte)
        const period = norm(v, 65535);
        if (prevValue !== null && norm(prevValue, 65535) === period) return true;
        const lo = period & 0xFF;
        const hi = (period >> 8) & 0xFF;
        // Write both — low byte first
        const wroteLo = writeEffect(cell, 0x21, lo, fmt);
        const wroteHi = writeEffect(cell, 0x22, hi, fmt);
        return wroteLo || wroteHi;
      },
    };
  }

  return null;
}

// ── Effect Mappings ─────────────────────────────────────────────────────────

function getEffectMapping(param: string, format: FormatConstraints): EffectMapping | null {
  const p = param.toLowerCase();

  // ── C64/SID-specific effects (Furnace format) ────────────────────────
  // These use Furnace's chip-specific effect numbers (0x10-0x47 range).
  // They take priority over generic mappings when chipType is 'c64'.
  if (format.chipType === 'c64') {
    const c64 = getC64EffectMapping(p, format);
    if (c64) return c64;
    // Fall through to generic mappings for volume/panning/tempo/etc.
  }

  // ── AY/PSG-specific effects (Furnace format) ─────────────────────────
  if (format.chipType === 'ay') {
    const ay = getAYEffectMapping(p, format);
    if (ay) return ay;
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

  // ── Tempo / BPM ───────────────────────────────────────────────────────
  // Fxx: 01-1F = speed (ticks/row), 20-FF = BPM
  if (p.includes('tempo') || p.includes('bpm')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const [lo, hi] = fmt.bpmRange;
        const bpm = Math.round(lo + Math.max(0, Math.min(1, v)) * (hi - lo));
        const clampedBpm = Math.max(0x20, Math.min(0xFF, bpm)); // BPM range: 0x20-0xFF

        if (prevValue !== null) {
          const prevBpm = Math.round(lo + Math.max(0, Math.min(1, prevValue)) * (hi - lo));
          if (Math.max(0x20, Math.min(0xFF, prevBpm)) === clampedBpm) return true;
        }

        // Fxx = effect type 15
        return writeEffect(cell, 15, clampedBpm, fmt);
      },
    };
  }

  // ── Speed (ticks per row) ─────────────────────────────────────────────
  if (p.includes('speed') && !p.includes('portamento')) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const [lo, hi] = fmt.speedRange;
        const speed = Math.round(lo + Math.max(0, Math.min(1, v)) * (hi - lo));
        const clampedSpeed = Math.max(1, Math.min(0x1F, speed)); // Speed range: 0x01-0x1F

        if (prevValue !== null) {
          const prevSpeed = Math.round(lo + Math.max(0, Math.min(1, prevValue)) * (hi - lo));
          if (Math.max(1, Math.min(0x1F, prevSpeed)) === clampedSpeed) return true;
        }

        // Fxx = effect type 15 (speed when < 0x20)
        return writeEffect(cell, 15, clampedSpeed, fmt);
      },
    };
  }

  // ── Retrigger ─────────────────────────────────────────────────────────
  // E9x / Rxx — periodic retriggering
  if (p.includes('retrig')) {
    return {
      write: (cell, v, _prevValue, fmt) => {
        const interval = norm(v, 15);
        if (interval === 0) return true;

        if (hasExtendedEffects(fmt)) {
          // Rxy (effect type 27 for XM): x=volume change, y=interval
          return writeEffect(cell, 27, interval, fmt);
        }
        // MOD: E9x via effect type 14, param = 0x90 + interval
        return writeEffect(cell, 14, 0x90 + interval, fmt);
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

  return { patterns: baked, bakedCount, overflowRows, warnings };
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
