/**
 * PixiDJControllerSelect — Native GL DJ controller preset selector using PixiSelect.
 */

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { PixiSelect, type SelectOption } from '@/pixi/components/PixiSelect';
import { DJ_CONTROLLER_PRESETS, getPresetById } from '@/midi/djControllerPresets';
import { getDJControllerMapper } from '@/midi/DJControllerMapper';

const STORAGE_KEY = 'devilbox-dj-controller-preset';

interface Props {
  width?: number;
  height?: number;
  layout?: Record<string, unknown>;
}

export const PixiDJControllerSelect: React.FC<Props> = ({ width = 130, height = 24, layout: layoutProp }) => {
  const [selectedId, setSelectedId] = useState<string>(() =>
    localStorage.getItem(STORAGE_KEY) || '',
  );

  // Restore preset on mount
  useEffect(() => {
    if (selectedId) {
      const preset = getPresetById(selectedId);
      getDJControllerMapper().setPreset(preset);
    }
  }, []);

  const options = useMemo((): SelectOption[] => {
    const opts: SelectOption[] = [
      { value: '', label: 'None' },
    ];
    for (const p of DJ_CONTROLLER_PRESETS) {
      opts.push({ value: p.id, label: p.name, group: p.manufacturer });
    }
    return opts;
  }, []);

  const handleChange = useCallback((value: string) => {
    setSelectedId(value);
    if (value) {
      const preset = getPresetById(value);
      getDJControllerMapper().setPreset(preset);
      localStorage.setItem(STORAGE_KEY, value);
    } else {
      getDJControllerMapper().setPreset(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <PixiSelect
      options={options}
      value={selectedId}
      onChange={handleChange}
      width={width}
      height={height}
      placeholder="Controller"
      layout={layoutProp}
    />
  );
};
