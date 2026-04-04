import type { AutomationSourceRef } from '../../../types/automation';
import type { AutomationParamDef } from '../AutomationParams';

/**
 * Unified write-back dispatcher — routes point edits to the correct format handler.
 */
export async function applyWriteBack(
  sourceRef: AutomationSourceRef,
  newValue: number,
  paramDef: AutomationParamDef,
): Promise<boolean> {
  switch (sourceRef.type) {
    case 'table': {
      const { applyGTUltraWriteBack } = await import('./GTUltraWriteBack');
      return applyGTUltraWriteBack(sourceRef, newValue, paramDef);
    }
    case 'effect': {
      const { applyUADEWriteBack } = await import('./UADEWriteBack');
      return applyUADEWriteBack(sourceRef, newValue, paramDef);
    }
    case 'macro':
    case 'furnace-effect': {
      const { applyFurnaceWriteBack } = await import('./FurnaceWriteBack');
      return applyFurnaceWriteBack(sourceRef, newValue, paramDef);
    }
    default:
      return false;
  }
}
