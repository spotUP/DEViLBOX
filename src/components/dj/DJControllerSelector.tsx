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

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
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
    <select
      value={selectedId}
      onChange={handleChange}
      className="px-2 py-1 text-[10px] font-mono bg-dark-bgTertiary text-text-secondary border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer"
      title="Select DJ controller for MIDI mapping"
    >
      <option value="">Controller: None</option>
      {Array.from(grouped.entries()).map(([mfr, presets]) => (
        <optgroup key={mfr} label={mfr}>
          {presets.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};
