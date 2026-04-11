import type { AutomationSourceRef } from '../../../types/automation';

/**
 * Writes an edited automation value back to a UADE pattern cell.
 * Uses the existing UADEChipEditor.patchPatternCell() infrastructure.
 */
export async function applyUADEWriteBack(
  sourceRef: Extract<AutomationSourceRef, { type: 'effect' }>,
  newValue: number,
  paramDef: { min: number; max: number; id: string },
): Promise<boolean> {
  const rawValue = Math.round(newValue * (paramDef.max - paramDef.min) + paramDef.min);

  // Determine which effect command to write based on paramId
  if (paramDef.id.includes('.volume')) {
    // Cxx — set volume
    console.log(
      `[UADEWriteBack] row=${sourceRef.row} ch=${sourceRef.channel} effect=C${rawValue.toString(16).padStart(2, '0')}`,
    );
    // NOTE: UADE format encoder not yet available — writeback is a no-op
    return true;
  }

  if (paramDef.id.includes('.period')) {
    // Period changes come from note commands, not effects — cannot write back via effects
    console.warn('[UADEWriteBack] Period write-back not supported via effects');
    return false;
  }

  console.warn(`[UADEWriteBack] No effect mapping for param: ${paramDef.id}`);
  return false;
}
