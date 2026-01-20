import { useState, useEffect } from 'react';
import { getCCMapManager } from '../../midi/CCMapManager';

/**
 * Hook to use MIDI CC value for a parameter
 * Returns the current value from MIDI CC input
 */
export function useMIDILearnValue(
  instrumentId: number,
  parameterPath: string,
  currentValue: number
): number {
  const [value, setValue] = useState(currentValue);
  const manager = getCCMapManager();

  useEffect(() => {
    setValue(currentValue);
  }, [currentValue]);

  useEffect(() => {
    const unsubscribe = manager.onParameterChange((instId, path, newValue) => {
      if (instId === instrumentId && path === parameterPath) {
        setValue(newValue);
      }
    });
    return unsubscribe;
  }, [instrumentId, parameterPath, manager]);

  return value;
}
