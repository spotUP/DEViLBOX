/**
 * PresetBrowser — Dropdown select for current synth's presets using CustomSelect.
 */

import React, { useMemo, useCallback } from 'react';
import type { PresetMetadata } from '../types/preset';
import { buildPresetIndex, getAllPresets, filterBySynthType, sortPresets } from '../utils/presetLoader';
import { CustomSelect } from '@components/common/CustomSelect';

interface PresetBrowserProps {
  onSelectPreset: (preset: PresetMetadata) => void;
  currentSynthType?: string;
}

export const PresetBrowser: React.FC<PresetBrowserProps> = ({ 
  onSelectPreset,
  currentSynthType 
}) => {
  const presetIndex = useMemo(() => buildPresetIndex(), []);
  const allPresets = useMemo(() => getAllPresets(presetIndex), [presetIndex]);

  const presets = useMemo(() => {
    if (!currentSynthType) return [];
    return sortPresets(filterBySynthType(allPresets, currentSynthType), 'name');
  }, [allPresets, currentSynthType]);

  const options = useMemo(() => 
    presets.map((p, idx) => ({ value: String(idx), label: p.name })),
    [presets]
  );

  const handleChange = useCallback((val: string) => {
    const idx = parseInt(val);
    console.log('[PresetBrowser] handleChange called, val:', val, 'idx:', idx, 'presets.length:', presets.length);
    if (idx >= 0 && idx < presets.length) {
      console.log('[PresetBrowser] Calling onSelectPreset with:', presets[idx].name);
      onSelectPreset(presets[idx]);
    }
  }, [presets, onSelectPreset]);

  if (!currentSynthType || presets.length === 0) return null;

  return (
    <CustomSelect
      value=""
      onChange={handleChange}
      options={options}
      placeholder={`Presets (${presets.length})`}
      zIndex={100000}
    />
  );
};
