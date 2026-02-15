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
    <div className="flex items-center gap-3 px-4 py-2 bg-dark-bgSecondary border-b border-dark-border text-text-primary">
      {/* Preset selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">Preset:</span>
        <select
          onChange={(e) => handleLoadPreset(e.target.value)}
          value=""
          className="px-2 py-1 bg-dark-bgTertiary border border-dark-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary"
        >
          <option value="" disabled className="bg-dark-bgSecondary">
            Load preset...
          </option>
          <option value="init" className="bg-dark-bgSecondary">Init</option>
          <option value="bass" className="bg-dark-bgSecondary">Bass</option>
          <option value="pad" className="bg-dark-bgSecondary">Pad</option>
          <option value="percussion" className="bg-dark-bgSecondary">Percussion</option>
          <option value="fmBell" className="bg-dark-bgSecondary">FM Bell</option>
          <option value="lead" className="bg-dark-bgSecondary">Lead</option>
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
          className="px-2 py-1 bg-dark-bgTertiary border border-dark-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary"
        >
          {[1, 2, 4, 8].map((n) => (
            <option key={n} value={n} className="bg-dark-bgSecondary">
              {n}
            </option>
          ))}
        </select>
      </div>

      {/* View mode selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">View:</span>
        <div className="flex gap-1 bg-dark-bgTertiary rounded p-0.5 border border-dark-border">
          {(['rack', 'canvas', 'matrix'] as ModularViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => handleViewModeChange(mode)}
              className={`
                px-3 py-1 text-xs rounded transition-colors capitalize
                ${
                  config.viewMode === mode
                    ? 'bg-accent-primary text-white font-bold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-dark-bgHover'
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
        className="flex items-center gap-1 px-2 py-1 hover:bg-dark-bgHover rounded text-sm text-text-secondary hover:text-accent-error transition-colors"
        title="Clear patch"
      >
        <Trash2 className="w-4 h-4" />
        Clear
      </button>
    </div>
  );
};
