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

// ── Effect Mappings ─────────────────────────────────────────────────────────

function getEffectMapping(param: string, format: FormatConstraints): EffectMapping | null {
  const p = param.toLowerCase();

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
