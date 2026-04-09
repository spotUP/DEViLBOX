/**
 * DJControllerSelector - Dropdown to select a DJ controller preset
 *
 * When a preset is selected, the DJControllerMapper auto-maps MIDI messages
 * from the controller to DJ engine parameters (EQ, filter, crossfader, etc.)
 * and transport actions (play, cue, sync, hot cues, jog wheel scratch).
 */

import React, { useCallback, useState, useEffect } from 'react';
import { DJ_CONTROLLER_PRESETS, getPresetById } from '@/midi/djControllerPresets';
import { getDJControllerMapper } from '@/midi/DJControllerMapper';
import { CustomSelect } from '@components/common/CustomSelect';

const STORAGE_KEY = 'devilbox-dj-controller-preset';

export const DJControllerSelector: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || '';
  });

  // Restore preset on mount
  useEffect(() => {
    if (selectedId) {
      const preset = getPresetById(selectedId);
      getDJControllerMapper().setPreset(preset);
    }
  }, []);

  const handleChange = useCallback((id: string) => {
    setSelectedId(id);

    if (id) {
      const preset = getPresetById(id);
      getDJControllerMapper().setPreset(preset);
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      getDJControllerMapper().setPreset(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Group by manufacturer
  const grouped = new Map<string, typeof DJ_CONTROLLER_PRESETS>();
  for (const p of DJ_CONTROLLER_PRESETS) {
    const list = grouped.get(p.manufacturer) || [];
    list.push(p);
    grouped.set(p.manufacturer, list);
  }

  return (
    <CustomSelect
      value={selectedId}
      onChange={handleChange}
      options={[
        { value: '', label: 'Controller: None' },
        ...Array.from(grouped.entries()).map(([mfr, presets]) => ({
          label: mfr,
          options: presets.map(p => ({
            value: p.id,
            label: p.name,
          })),
        })),
      ]}
      className="px-3 py-1.5 text-xs font-mono bg-dark-bgTertiary text-text-secondary border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer"
      title="Select DJ controller for MIDI mapping"
    />
  );
};
