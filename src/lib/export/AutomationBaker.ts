/**
 * AutomationBaker — Bake automation curves into native effect commands.
 *
 * Converts visual automation curves (volume ramps, pan sweeps, filter cutoff
 * curves, etc.) into the equivalent tracker effect commands for each row.
 * This makes automation compatible with native formats on export.
 *
 * The user draws curves; the exporter writes effect values.
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
  /** Curves that couldn't be baked (format doesn't support the parameter) */
  warnings: string[];
}

interface EffectMapping {
  /** Write the interpolated value (0-1) into the cell's available effect slots */
  write: (cell: TrackerCell, value: number) => boolean; // returns true if written
}

// ── Effect Mapping ───────────────────────────────────────────────────────────

function getEffectMapping(param: string, format: FormatConstraints): EffectMapping | null {
  const p = param.toLowerCase();

  // Volume parameters (fur.*.volume, paula.*.volume, sid.*.volume, etc.)
  if (p.includes('volume') || p.includes('.vol')) {
    return {
      write: (cell, v) => {
        const vol = Math.round(Math.max(0, Math.min(1, v)) * 64);
        // Prefer volume column (XM/IT format: 0x10 + vol)
        if (cell.volume === 0 || cell.volume === undefined) {
          cell.volume = 0x10 + Math.min(vol, 64);
          return true;
        }
        // Fall back to Cxx effect (effect type 12)
        return writeEffect(cell, 12, Math.min(vol, 64));
      },
    };
  }

  // Panning parameters (fur.*.panL, fur.*.panR, pan, etc.)
  if (p.includes('pan')) {
    return {
      write: (cell, v) => {
        const pan = Math.round(Math.max(0, Math.min(1, v)) * 255);
        // 8xx = set panning (effect type 8)
        return writeEffect(cell, 8, pan);
      },
    };
  }

  // Filter cutoff (IT only via Zxx, effect type 26)
  if (p.includes('cutoff') || p.includes('filter')) {
    if (format.name !== 'IT' && format.name !== 'S3M') return null;
    return {
      write: (cell, v) => {
        const cutoff = Math.round(Math.max(0, Math.min(1, v)) * 127);
        // Zxx = MIDI macro / filter (effect type 26 in XM numbering)
        return writeEffect(cell, 26, cutoff);
      },
    };
  }

  // Resonance (IT only, high nibble of Zxx — too complex, skip)
  if (p.includes('resonance') || p.includes('reso')) {
    return null; // can't bake reliably
  }

  // Pitch/frequency — these are complex (portamento speed, not absolute values)
  // Would need delta computation between rows. Skip for now.
  if (p.includes('pitch') || p.includes('frequency') || p.includes('period')) {
    return null;
  }

  // Pulse width (SID/C64 specific — no standard tracker effect)
  if (p.includes('pulse') || p.includes('duty')) {
    return null;
  }

  return null;
}

/** Try to write an effect command into the first available slot */
function writeEffect(cell: TrackerCell, effTyp: number, eff: number): boolean {
  // Primary effect slot
  if (cell.effTyp === 0 && cell.eff === 0) {
    cell.effTyp = effTyp;
    cell.eff = eff;
    return true;
  }
  // Secondary effect slot (DEViLBOX extension — works for XM/IT)
  if ((cell.effTyp2 === 0 || cell.effTyp2 === undefined) &&
      (cell.eff2 === 0 || cell.eff2 === undefined)) {
    cell.effTyp2 = effTyp;
    cell.eff2 = eff;
    return true;
  }
  return false; // all slots full
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

      if (mapping.write(cell, value)) {
        rowsWritten++;
      }
    }

    if (rowsWritten > 0) {
      bakedCount++;
    } else {
      warnings.push(`"${curve.parameter}" curve has no data to bake`);
    }
  }

  return { patterns: baked, bakedCount, warnings };
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
