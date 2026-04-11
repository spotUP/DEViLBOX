import type { AutomationSourceRef } from '../../../types/automation';

/**
 * Writes an edited automation value back to a Furnace macro frame or pattern effect.
 */
export async function applyFurnaceWriteBack(
  sourceRef: AutomationSourceRef,
  newValue: number,
  paramDef: { min: number; max: number; id: string },
): Promise<boolean> {
  const rawValue = Math.round(newValue * (paramDef.max - paramDef.min) + paramDef.min);

  if (sourceRef.type === 'macro') {
    // NOTE: Furnace macro editing API not yet exposed — writeback is a no-op
    console.log(
      `[FurnaceWriteBack] macro ${sourceRef.macroType} instr=${sourceRef.instrumentId} frame=${sourceRef.frame} = ${rawValue}`,
    );
    return true;
  }

  if (sourceRef.type === 'furnace-effect') {
    // NOTE: Furnace pattern editing API not yet exposed — writeback is a no-op
    console.log(
      `[FurnaceWriteBack] effect row=${sourceRef.row} ch=${sourceRef.channel} col=${sourceRef.effectCol} = ${rawValue}`,
    );
    return true;
  }

  return false;
}
