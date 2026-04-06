/**
 * syncCurveToCells — Live bake automation curves into pattern cells.
 *
 * The automation lane is a UI tool for creating effect commands quickly.
 * When the user draws an automation curve, the corresponding effect commands
 * should appear immediately in the tracker editor's effect columns.
 *
 * This module provides the live sync between the curve store and the tracker
 * pattern cells. It runs after every curve modification (addPoint/removePoint/
 * updatePoint/etc.) to keep the cells in sync with the curves.
 *
 * Each curve owns a FIXED effect slot determined by its parameter type:
 *   - volume → volume column (XM/IT/S3M) or effect col Cxx (MOD)
 *   - panning → effect col 8xx
 *   - cutoff → effect col Zxx (IT/S3M only)
 *   - resonance → effect col Zxx (IT/S3M only)
 *   - C64 chip params → chip-specific Furnace effects
 *
 * Tracking: a module-level Map records which rows each curve has written to,
 * so we can clear them on re-bake. Manual edits to OTHER slots are preserved.
 * Manual edits to the curve's owned slot will be overwritten on next sync.
 */

import { interpolateAutomationValue } from '@/types/automation';
import type { AutomationCurve } from '@/types/automation';
import type { TrackerCell, Pattern } from '@/types/tracker';
import type { FormatConstraints } from '@/lib/formatCompatibility';

// ── Types ────────────────────────────────────────────────────────────────────

/** Identifies which slot in a TrackerCell a curve owns */
type SlotKey =
  | 'volume'        // volume column
  | 'effect1'       // effTyp/eff
  | 'effect2';      // effTyp2/eff2

interface CurveBakeRecord {
  slotKey: SlotKey;
  rowsWritten: number[]; // rows where the curve wrote a value
}

// ── Module State ─────────────────────────────────────────────────────────────

/**
 * Tracks per-curve which cells were last baked. Cleared on curve removal,
 * updated on every sync. Not persisted — rebuilt as curves change.
 */
const curveBakeRecords = new Map<string, CurveBakeRecord>();

/** Clear tracking for a specific curve (call when curve is deleted) */
export function forgetCurveBake(curveId: string): void {
  curveBakeRecords.delete(curveId);
}

/** Clear all tracking (call on song load) */
export function forgetAllCurveBakes(): void {
  curveBakeRecords.clear();
}

// ── Slot Selection ──────────────────────────────────────────────────────────

/**
 * Determine which slot a curve should own based on its parameter type and format.
 * Volume curves prefer the volume column when available, falling back to the
 * effect column. Other curves use the effect column.
 */
function getSlotForCurve(parameter: string, format: FormatConstraints): SlotKey {
  const p = parameter.toLowerCase();
  const isVolumeParam = p.includes('volume') || p.includes('.vol') || p === 'gain';
  if (isVolumeParam) {
    // XM/IT/S3M have volume column; MOD does not
    const hasVolCol = format.name !== 'MOD' && format.name !== 'FC' &&
                      format.name !== 'HVL' && format.name !== 'AHX';
    return hasVolCol ? 'volume' : 'effect1';
  }
  // Non-volume: prefer effect col 1
  return 'effect1';
}

// ── Effect Encoding ─────────────────────────────────────────────────────────

interface EffectValue {
  /** For 'volume' slot: the byte to write to cell.volume */
  volumeByte?: number;
  /** For 'effect1'/'effect2' slots: effect type + parameter */
  effTyp?: number;
  effParam?: number;
}

/**
 * Encode a normalized 0-1 value into an effect byte for a given parameter + format.
 * Returns null if the parameter has no encoding for this format.
 */
function encodeValue(parameter: string, value: number, format: FormatConstraints): EffectValue | null {
  const p = parameter.toLowerCase();
  const v = Math.max(0, Math.min(1, value));

  // ── Volume ────────────────────────────────────────────────────────────
  if (p.includes('volume') || p.includes('.vol') || p === 'gain') {
    const vol = Math.round(v * 64);
    const hasVolCol = format.name !== 'MOD' && format.name !== 'FC' &&
                      format.name !== 'HVL' && format.name !== 'AHX';
    if (hasVolCol) {
      return { volumeByte: 0x10 + Math.min(vol, 64) };
    }
    return { effTyp: 12, effParam: Math.min(vol, 64) }; // Cxx
  }

  // ── Panning ───────────────────────────────────────────────────────────
  if (p.includes('pan') && format.supportsPanning) {
    return { effTyp: 8, effParam: Math.round(v * 255) }; // 8xx
  }

  // ── Filter Cutoff (IT/S3M Zxx) ────────────────────────────────────────
  if ((p.includes('cutoff') || (p.includes('filter') && !p.includes('filtermode'))) &&
      (format.name === 'IT' || format.name === 'S3M')) {
    return { effTyp: 26, effParam: Math.round(v * 127) }; // Zxx 0-7F
  }

  // ── Resonance (IT/S3M Zxx high nibble) ────────────────────────────────
  if ((p.includes('resonance') || p.includes('reso')) &&
      (format.name === 'IT' || format.name === 'S3M')) {
    return { effTyp: 26, effParam: 0x80 + Math.round(v * 15) };
  }

  return null;
}

// ── Cell Slot I/O ───────────────────────────────────────────────────────────

/** Clear a specific slot in a cell */
function clearSlot(cell: TrackerCell, slotKey: SlotKey): void {
  switch (slotKey) {
    case 'volume':  cell.volume = 0; break;
    case 'effect1': cell.effTyp = 0; cell.eff = 0; break;
    case 'effect2': cell.effTyp2 = 0; cell.eff2 = 0; break;
  }
}

/** Write an encoded effect value into a specific slot */
function writeSlot(cell: TrackerCell, slotKey: SlotKey, ev: EffectValue): void {
  switch (slotKey) {
    case 'volume':
      if (ev.volumeByte !== undefined) cell.volume = ev.volumeByte;
      break;
    case 'effect1':
      if (ev.effTyp !== undefined && ev.effParam !== undefined) {
        cell.effTyp = ev.effTyp;
        cell.eff = ev.effParam;
      }
      break;
    case 'effect2':
      if (ev.effTyp !== undefined && ev.effParam !== undefined) {
        cell.effTyp2 = ev.effTyp;
        cell.eff2 = ev.effParam;
      }
      break;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface SyncResult {
  /** Whether any cells were modified */
  changed: boolean;
  /** Rows that received new effect commands */
  rowsWritten: number;
}

/**
 * Sync a single automation curve to its pattern cells.
 *
 * 1. Look up the previous bake record for this curve
 * 2. Clear the curve's slot in all previously-written rows
 * 3. Compute the curve at every row, write to the curve's slot
 * 4. Update the bake record
 *
 * @param curve   The curve to sync
 * @param pattern The pattern to mutate (in place)
 * @param format  Format constraints (determines slot + effect numbers)
 * @returns sync stats
 */
export function syncCurveToCells(
  curve: AutomationCurve,
  pattern: Pattern,
  format: FormatConstraints,
): SyncResult {
  const ch = curve.channelIndex;
  if (ch < 0 || ch >= pattern.channels.length) {
    return { changed: false, rowsWritten: 0 };
  }
  const channel = pattern.channels[ch];

  // Determine slot for this curve
  const slotKey = getSlotForCurve(curve.parameter, format);

  // Check if encoding is supported for this format
  const testEncoding = encodeValue(curve.parameter, 0.5, format);
  if (!testEncoding) {
    // Parameter not bakeable for this format — clear any prior bake and bail
    const prior = curveBakeRecords.get(curve.id);
    if (prior) {
      for (const row of prior.rowsWritten) {
        const cell = channel.rows[row];
        if (cell) clearSlot(cell, prior.slotKey);
      }
      curveBakeRecords.delete(curve.id);
      return { changed: true, rowsWritten: 0 };
    }
    return { changed: false, rowsWritten: 0 };
  }

  // Clear previously-baked rows in the previously-used slot
  const prior = curveBakeRecords.get(curve.id);
  if (prior) {
    for (const row of prior.rowsWritten) {
      const cell = channel.rows[row];
      if (cell) clearSlot(cell, prior.slotKey);
    }
  }

  // If curve is disabled or empty, just clear (we already did) and forget
  if (!curve.enabled || curve.points.length === 0) {
    curveBakeRecords.delete(curve.id);
    return { changed: !!prior, rowsWritten: 0 };
  }

  // Re-bake: compute value at every row and write
  const newRowsWritten: number[] = [];
  for (let row = 0; row < pattern.length; row++) {
    const cell = channel.rows[row];
    if (!cell) continue;

    const value = interpolateAutomationValue(
      curve.points,
      row,
      curve.interpolation,
      curve.mode,
    );
    if (value === null) continue;

    const encoded = encodeValue(curve.parameter, value, format);
    if (!encoded) continue;

    writeSlot(cell, slotKey, encoded);
    newRowsWritten.push(row);
  }

  // Update tracking
  curveBakeRecords.set(curve.id, { slotKey, rowsWritten: newRowsWritten });

  return { changed: true, rowsWritten: newRowsWritten.length };
}
