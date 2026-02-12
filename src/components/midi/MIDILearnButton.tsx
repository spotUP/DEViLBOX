/**
 * MIDILearnButton - Reusable MIDI Learn button for any parameter
 *
 * Place this button next to any knob or slider to enable MIDI CC mapping.
 * When clicked, enters learn mode and waits for a CC message.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Settings2, X, Unlink } from 'lucide-react';
import { getCCMapManager, type GeneralCCMapping } from '../../midi/CCMapManager';

interface MIDILearnButtonProps {
  instrumentId: number;
  parameterPath: string;
  displayName: string;
  min: number;
  max: number;
  curve?: 'linear' | 'logarithmic';
  className?: string;
  size?: 'sm' | 'md';
}

export const MIDILearnButton: React.FC<MIDILearnButtonProps> = ({
  instrumentId,
  parameterPath,
  displayName,
  min,
  max,
  curve = 'linear',
  className = '',
  size = 'sm',
}) => {
  const [isLearning, setIsLearning] = useState(false);
  const [mapping, setMapping] = useState<GeneralCCMapping | undefined>(undefined);

  const manager = getCCMapManager();

  // Load existing mapping and subscribe to changes
  useEffect(() => {
    const updateMapping = () => {
      const existing = manager.getMappingForParameter(instrumentId, parameterPath);
      setMapping(existing);
    };

    updateMapping();
    const unsubscribe = manager.onMappingChange(updateMapping);
    return unsubscribe;
  }, [instrumentId, parameterPath, manager]);

  // Subscribe to learn mode changes
  useEffect(() => {
    const unsubscribe = manager.onLearnChange((learning, path) => {
      setIsLearning(learning && path === parameterPath);
    });
    return unsubscribe;
  }, [parameterPath, manager]);

  const handleClick = useCallback(async () => {
    if (isLearning) {
      // Cancel learn mode
      manager.cancelLearn();
      return;
    }

    // Start learn mode
    const result = await manager.startLearn(
      instrumentId,
      parameterPath,
      displayName,
      min,
      max,
      curve
    );

    if (result) {
      // Create mapping from learned CC
      const newMapping: GeneralCCMapping = {
        id: `${instrumentId}-${parameterPath}`,
        ccNumber: result.ccNumber,
        midiChannel: result.channel >= 0 ? result.channel : undefined,
        instrumentId,
        parameterPath,
        min,
        max,
        curve,
        displayName,
      };

      manager.setMapping(newMapping);
    }
  }, [isLearning, instrumentId, parameterPath, displayName, min, max, curve, manager]);

  const handleUnlink = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (mapping) {
        manager.removeMapping(mapping.id);
      }
    },
    [mapping, manager]
  );

  const sizeClasses =
    size === 'sm' ? 'w-5 h-5 p-0.5' : 'w-6 h-6 p-1';

  const iconSize = size === 'sm' ? 12 : 14;

  // If we have a mapping, show the CC number with unlink option
  if (mapping && !isLearning) {
    return (
      <div className={`inline-flex items-center gap-0.5 ${className}`}>
        <button
          onClick={handleClick}
          className={`${sizeClasses} flex items-center justify-center rounded text-xs font-mono bg-cyan-500/30 text-cyan-300 hover:bg-cyan-500/50 transition-colors`}
          title={`CC ${mapping.ccNumber} mapped to ${displayName}. Click to remap.`}
        >
          {mapping.ccNumber}
        </button>
        <button
          onClick={handleUnlink}
          className={`${sizeClasses} flex items-center justify-center rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors`}
          title="Remove MIDI mapping"
        >
          <Unlink size={iconSize} />
        </button>
      </div>
    );
  }

  // Learning mode or no mapping
  return (
    <button
      onClick={handleClick}
      className={`${sizeClasses} flex items-center justify-center rounded transition-colors ${className} ${
        isLearning
          ? 'bg-amber-500/50 text-amber-200 animate-pulse'
          : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50 hover:text-gray-300'
      }`}
      title={isLearning ? 'Waiting for MIDI CC... Click to cancel' : `Click to learn MIDI CC for ${displayName}`}
    >
      {isLearning ? <X size={iconSize} /> : <Settings2 size={iconSize} />}
    </button>
  );
};

/**
 * Hook to use MIDI CC value for a parameter
 * Returns the current value from MIDI CC input
 */
// eslint-disable-next-line react-refresh/only-export-components
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

export default MIDILearnButton;
