/**
 * ModularToolbar - Top toolbar for modular editor
 *
 * Contains actions: add module, polyphony, view mode selector, clear patch
 */

import React from 'react';
import { Trash2 } from 'lucide-react';
import type { ModularPatchConfig, ModularViewMode } from '../../../../types/modular';
import { ModuleShelf } from './widgets/ModuleShelf';
import { MODULAR_PRESETS } from '../../../../constants/modularPresets';

interface ModularToolbarProps {
  config: ModularPatchConfig;
  onChange: (config: ModularPatchConfig) => void;
}

export const ModularToolbar: React.FC<ModularToolbarProps> = ({ config, onChange }) => {
  const handleAddModule = (descriptorId: string) => {
    const newModule = {
      id: `mod_${Date.now()}`,
      descriptorId,
      parameters: {},
      position: { x: 100, y: 100 },
      rackSlot: config.modules.length,
    };

    onChange({
      ...config,
      modules: [...config.modules, newModule],
    });
  };

  const handleClearPatch = () => {
    if (confirm('Clear all modules and connections?')) {
      onChange({
        ...config,
        modules: [],
        connections: [],
      });
    }
  };

  const handlePolyphonyChange = (polyphony: number) => {
    onChange({ ...config, polyphony });
  };

  const handleViewModeChange = (viewMode: ModularViewMode) => {
    onChange({ ...config, viewMode });
  };

  const handleLoadPreset = (presetKey: string) => {
    const preset = MODULAR_PRESETS[presetKey as keyof typeof MODULAR_PRESETS];
    if (preset) {
      onChange(preset);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-surface-secondary border-b border-border">
      {/* Preset selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">Preset:</span>
        <select
          onChange={(e) => handleLoadPreset(e.target.value)}
          value=""
          className="px-2 py-1 bg-surface-tertiary border border-border rounded text-sm"
        >
          <option value="" disabled>
            Load preset...
          </option>
          <option value="init">Init</option>
          <option value="bass">Bass</option>
          <option value="pad">Pad</option>
          <option value="percussion">Percussion</option>
          <option value="fmBell">FM Bell</option>
          <option value="lead">Lead</option>
        </select>
      </div>

      {/* Add Module */}
      <ModuleShelf onAddModule={handleAddModule} />

      {/* Polyphony selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">Voices:</span>
        <select
          value={config.polyphony}
          onChange={(e) => handlePolyphonyChange(parseInt(e.target.value, 10))}
          className="px-2 py-1 bg-surface-tertiary border border-border rounded text-sm"
        >
          {[1, 2, 4, 8].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {/* View mode selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">View:</span>
        <div className="flex gap-1 bg-surface-tertiary rounded p-0.5">
          {(['rack', 'canvas', 'matrix'] as ModularViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => handleViewModeChange(mode)}
              className={`
                px-3 py-1 text-xs rounded transition-colors capitalize
                ${
                  config.viewMode === mode
                    ? 'bg-accent-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }
              `}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      {/* Clear patch */}
      <button
        onClick={handleClearPatch}
        className="flex items-center gap-1 px-2 py-1 hover:bg-surface-tertiary rounded text-sm text-text-secondary hover:text-red-400 transition-colors"
        title="Clear patch"
      >
        <Trash2 className="w-4 h-4" />
        Clear
      </button>
    </div>
  );
};
