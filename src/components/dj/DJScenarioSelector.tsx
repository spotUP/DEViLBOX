/**
 * DJScenarioSelector - Dropdown to select DJ performance scenarios
 *
 * Allows switching between different DJ styles (Scratch, House, Battle, etc.)
 * without changing the physical controller. Scenarios optimize parameter
 * priorities and pad mappings for specific techniques.
 *
 * Works alongside DJControllerSelector:
 *   1. Select hardware controller (e.g., Pioneer DDJ-SB3)
 *   2. Select DJ scenario (e.g., "Turntablism")
 *   3. System applies scenario overrides to generic knob/pad mappings
 */

import React, { useCallback, useState, useEffect } from 'react';
import { DJ_SCENARIO_PRESETS, getScenarioById, getScenariosByCategory } from '@/midi/djScenarioPresets';
import { getDJControllerMapper } from '@/midi/DJControllerMapper';
import { useDJStore } from '@/stores/useDJStore';

const STORAGE_KEY = 'devilbox-dj-scenario-preset';

export const DJScenarioSelector: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || 'open-format';  // Default to open format
  });

  // Load scenario on mount
  useEffect(() => {
    if (selectedId) {
      const scenario = getScenarioById(selectedId);
      if (scenario) {
        applyScenario(scenario);
      }
    }
  }, []);

  const applyScenario = useCallback((scenario: ReturnType<typeof getScenarioById>) => {
    if (!scenario) return;

    const store = useDJStore.getState();
    const mapper = getDJControllerMapper();
    const currentPreset = mapper.getPreset();

    // Apply scenario behaviors to DJ store
    if (scenario.jogWheelSensitivity !== undefined) {
      store.setJogWheelSensitivity(scenario.jogWheelSensitivity);
    }

    if (scenario.crossfaderCurve) {
      store.setCrossfaderCurve(scenario.crossfaderCurve);
    }

    if (scenario.keyLockDefault !== undefined) {
      // Apply key lock to both decks
      store.setDeckKeyLock('A', scenario.keyLockDefault);
      store.setDeckKeyLock('B', scenario.keyLockDefault);
    }

    // If using a generic controller, apply scenario knob/pad mappings
    if (currentPreset?.manufacturer === 'Generic' && scenario.knobMappings && scenario.padMappings) {
      // Create a new preset that combines generic controller hardware + scenario mappings
      const hybridPreset = {
        ...currentPreset,
        ccMappings: scenario.knobMappings,
        noteMappings: scenario.padMappings,
      };
      mapper.setPreset(hybridPreset);
    }

    console.log(`Applied DJ scenario: ${scenario.name}`, {
      jogWheelSensitivity: scenario.jogWheelSensitivity,
      crossfaderCurve: scenario.crossfaderCurve,
      autoSync: scenario.autoSync,
      keyLockDefault: scenario.keyLockDefault,
    });
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedId(id);

    if (id) {
      const scenario = getScenarioById(id);
      applyScenario(scenario);
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [applyScenario]);

  // Group by category
  const grouped = getScenariosByCategory();

  // Find current scenario for icon display
  const currentScenario = getScenarioById(selectedId);

  return (
    <div className="flex items-center gap-1">
      {currentScenario && (
        <span className="text-sm" title={currentScenario.description}>
          {currentScenario.icon}
        </span>
      )}
      <select
        value={selectedId}
        onChange={handleChange}
        className="px-2 py-1 text-[10px] font-mono bg-dark-bgTertiary text-text-secondary border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer"
        title="Select DJ scenario / performance style"
      >
        <option value="">Scenario: Default</option>
        {Object.entries(grouped).map(([category, presets]) => (
          <optgroup key={category} label={category}>
            {presets.map(p => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
};
