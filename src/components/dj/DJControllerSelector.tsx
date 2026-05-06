/**
 * DJControllerSelector - Dropdown to select a DJ controller preset
 *
 * When a preset is selected, the DJControllerMapper auto-maps MIDI messages
 * from the controller to DJ engine parameters (EQ, filter, crossfader, etc.)
 * and transport actions (play, cue, sync, hot cues, jog wheel scratch).
 */

import React, { useCallback, useState, useEffect } from 'react';
import { DJ_CONTROLLER_PRESETS, getPresetById, detectDJPreset } from '@/midi/djControllerPresets';
import { getDJControllerMapper } from '@/midi/DJControllerMapper';
import { getMIDIManager } from '@/midi/MIDIManager';
import { getControllerLayout, mergeOverridesIntoPreset } from '@/midi/controllerLayouts';
import { useMIDIPresetStore } from '@/stores/useMIDIPresetStore';
import { CustomSelect } from '@components/common/CustomSelect';

const STORAGE_KEY = 'devilbox-dj-controller-preset';

/** Apply a preset with user overrides merged in */
function applyPresetWithOverrides(presetId: string): void {
  const preset = getPresetById(presetId);
  if (!preset) {
    getDJControllerMapper().setPreset(null);
    return;
  }
  const layout = getControllerLayout(preset.id);
  const overrides = useMIDIPresetStore.getState().getOverrides(preset.id);
  if (layout && Object.keys(overrides).length > 0) {
    getDJControllerMapper().setPreset(mergeOverridesIntoPreset(preset, overrides, layout));
  } else {
    getDJControllerMapper().setPreset(preset);
  }
}

export const DJControllerSelector: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || '';
  });

  // Restore saved preset OR auto-detect from connected MIDI device
  useEffect(() => {
    if (selectedId) {
      applyPresetWithOverrides(selectedId);
      return;
    }

    // No saved preset — try auto-detecting from connected MIDI device
    const manager = getMIDIManager();
    const input = manager.getSelectedInput();
    if (input?.name) {
      const detected = detectDJPreset(input.name);
      if (detected) {
        console.log(`[DJ] Auto-detected controller: ${input.name} → ${detected.name}`);
        setSelectedId(detected.id);
        applyPresetWithOverrides(detected.id);
        localStorage.setItem(STORAGE_KEY, detected.id);
      }
    }
  }, []);

  const handleChange = useCallback((id: string) => {
    setSelectedId(id);

    if (id) {
      applyPresetWithOverrides(id);
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
