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
    // TODO: Wire to Furnace instrument macro editing API when available
    console.log(
      `[FurnaceWriteBack] macro ${sourceRef.macroType} instr=${sourceRef.instrumentId} frame=${sourceRef.frame} = ${rawValue}`,
    );
    return true;
  }

  if (sourceRef.type === 'furnace-effect') {
    // TODO: Wire to Furnace pattern editing API when available
    console.log(
      `[FurnaceWriteBack] effect row=${sourceRef.row} ch=${sourceRef.channel} col=${sourceRef.effectCol} = ${rawValue}`,
    );
    return true;
  }

  return false;
}
