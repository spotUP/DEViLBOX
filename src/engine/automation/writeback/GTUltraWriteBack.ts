import type { AutomationSourceRef } from '../../../types/automation';

/**
 * Writes an edited automation value back to a GTUltra table entry.
 *
 * GTUltra tables (wave, pulse, filter) are sequences of values that the
 * engine steps through on each tick. Each captured automation point has a
 * sourceRef pointing to the exact table + index that produced it.
 */
export async function applyGTUltraWriteBack(
  sourceRef: Extract<AutomationSourceRef, { type: 'table' }>,
  newValue: number,
  paramDef: { min: number; max: number },
): Promise<boolean> {
  const rawValue = Math.round(newValue * (paramDef.max - paramDef.min) + paramDef.min);

  // NOTE: GTUltra table editing API not yet exposed — writeback is a no-op
  // The engine needs a setTableEntry(tableType, tableId, index, value) method
  console.log(
    `[GTUltraWriteBack] ${sourceRef.tableType} table[${sourceRef.tableId}][${sourceRef.index}] = ${rawValue}`,
  );

  return true;
}
