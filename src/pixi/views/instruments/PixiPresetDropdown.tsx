/**
 * PixiPresetDropdown — Pixi-native preset selector for the instrument editor header.
 * Shows a PixiSelect dropdown with factory presets filtered by synth type.
 */

import React, { useMemo, useCallback } from 'react';
import { PixiSelect, type SelectOption } from '../../components/PixiSelect';
import { FACTORY_PRESETS } from '../../../constants/factoryPresets';
import type { SynthType, InstrumentConfig, InstrumentPreset } from '../../../types/instrument';

interface PixiPresetDropdownProps {
  synthType: SynthType;
  currentPresetName?: string;
  onChange: (updates: Partial<InstrumentConfig>) => void;
  width?: number;
}

export const PixiPresetDropdown: React.FC<PixiPresetDropdownProps> = ({ synthType, currentPresetName, onChange, width = 160 }) => {
  const presets = useMemo(() => {
    return FACTORY_PRESETS.filter(p => p.synthType === synthType);
  }, [synthType]);

  const options: SelectOption[] = useMemo(() => {
    if (presets.length === 0) return [{ value: '__none', label: 'No presets' }];
    return presets.map((p, i) => ({
      value: String(i),
      label: p.name || `Preset ${i + 1}`,
    }));
  }, [presets]);

  // Find currently selected index by matching preset name
  const selectedValue = useMemo(() => {
    if (!currentPresetName) return '';
    const idx = presets.findIndex(p => p.name === currentPresetName);
    return idx >= 0 ? String(idx) : '';
  }, [presets, currentPresetName]);

  const handleChange = useCallback((val: string) => {
    if (val === '__none') return;
    const idx = Number(val);
    const preset = presets[idx];
    if (!preset) return;
    const { type: _t, synthType: _st, ...config } = preset as InstrumentPreset['config'] & { type?: string; synthType?: string };
    void _t; void _st;
    onChange(config as Partial<InstrumentConfig>);
  }, [presets, onChange]);

  if (presets.length === 0) return null;

  return (
    <PixiSelect
      options={options}
      value={selectedValue}
      placeholder={`Presets (${presets.length})`}
      onChange={handleChange}
      width={width}
    />
  );
};
