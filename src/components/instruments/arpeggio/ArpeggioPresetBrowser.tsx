/**
 * ArpeggioPresetBrowser - Modal browser for 40+ presets organized by chip era
 */

import React, { useState, useMemo } from 'react';
import { X, Search, Music, Gamepad2, Cpu, CheckCircle } from 'lucide-react';
import {
  ALL_PRESETS,
  PRESETS_BY_ERA,
  ERAS,
  presetToConfig,
  type ArpeggioPreset,
} from '@constants/arpeggioPresets';
import type { ArpeggioConfig } from '@typedefs/instrument';

interface ArpeggioPresetBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (config: ArpeggioConfig, presetName: string) => void;
  currentPresetId?: string;
}

// Era icons and colors
const ERA_STYLES: Record<string, { icon: React.ReactNode; color: string; description: string }> = {
  NES: {
    icon: <Gamepad2 size={14} />,
    color: 'text-red-400 border-red-400/30 bg-red-400/10',
    description: 'Nintendo Entertainment System era (1983-1990s)',
  },
  C64: {
    icon: <Cpu size={14} />,
    color: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
    description: 'Commodore 64 SID chip (1982-1994)',
  },
  Gameboy: {
    icon: <Gamepad2 size={14} />,
    color: 'text-green-400 border-green-400/30 bg-green-400/10',
    description: 'Nintendo Gameboy (1989-2000s)',
  },
  Amiga: {
    icon: <Music size={14} />,
    color: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
    description: 'Amiga MOD tracker scene (1987-1995)',
  },
  Arcade: {
    icon: <Gamepad2 size={14} />,
    color: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
    description: 'Arcade machines (1980s-1990s)',
  },
  Chords: {
    icon: <Music size={14} />,
    color: 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10',
    description: 'Standard musical chord voicings',
  },
};

export const ArpeggioPresetBrowser: React.FC<ArpeggioPresetBrowserProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentPresetId,
}) => {
  const [selectedEra, setSelectedEra] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredPreset, setHoveredPreset] = useState<ArpeggioPreset | null>(null);

  // Filter presets based on era and search
  const filteredPresets = useMemo(() => {
    let presets = selectedEra ? PRESETS_BY_ERA[selectedEra] || [] : ALL_PRESETS;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      presets = presets.filter(
        (preset) =>
          preset.name.toLowerCase().includes(query) ||
          preset.description.toLowerCase().includes(query) ||
          preset.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return presets;
  }, [selectedEra, searchQuery]);

  const handleSelectPreset = (preset: ArpeggioPreset) => {
    onSelect(presetToConfig(preset), preset.name);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[80vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Arpeggio Presets</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search presets by name or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Era tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-800 overflow-x-auto">
          <button
            onClick={() => setSelectedEra(null)}
            className={`
              px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap
              ${selectedEra === null
                ? 'bg-white/10 text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
              }
            `}
          >
            All ({ALL_PRESETS.length})
          </button>
          {ERAS.map((era) => {
            const style = ERA_STYLES[era];
            const count = PRESETS_BY_ERA[era]?.length || 0;
            return (
              <button
                key={era}
                onClick={() => setSelectedEra(era)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                  transition-colors whitespace-nowrap border
                  ${selectedEra === era
                    ? style.color
                    : 'text-gray-400 border-transparent hover:text-white hover:bg-white/5'
                  }
                `}
              >
                {style.icon}
                {era} ({count})
              </button>
            );
          })}
        </div>

        {/* Era description */}
        {selectedEra && (
          <div className="px-4 py-2 text-xs text-gray-500 bg-gray-800/30">
            {ERA_STYLES[selectedEra]?.description}
          </div>
        )}

        {/* Preset list */}
        <div className="flex h-[400px]">
          {/* Main list */}
          <div className="flex-1 overflow-y-auto p-2">
            {filteredPresets.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                No presets found
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredPresets.map((preset) => {
                  const style = ERA_STYLES[preset.era];
                  const isSelected = preset.id === currentPresetId;

                  return (
                    <button
                      key={preset.id}
                      onClick={() => handleSelectPreset(preset)}
                      onMouseEnter={() => setHoveredPreset(preset)}
                      onMouseLeave={() => setHoveredPreset(null)}
                      className={`
                        relative flex flex-col items-start p-3 rounded-lg border text-left
                        transition-all group
                        ${isSelected
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-gray-800 hover:border-gray-700 hover:bg-gray-800/50'
                        }
                      `}
                    >
                      {/* Selected indicator */}
                      {isSelected && (
                        <CheckCircle
                          size={14}
                          className="absolute top-2 right-2 text-green-500"
                        />
                      )}

                      {/* Era badge */}
                      <span
                        className={`
                          inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
                          font-medium border mb-1.5 ${style.color}
                        `}
                      >
                        {style.icon}
                        {preset.era}
                      </span>

                      {/* Name */}
                      <div className="font-medium text-sm text-white group-hover:text-blue-400 transition-colors">
                        {preset.name}
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {preset.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 text-[9px] rounded bg-gray-800 text-gray-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      {/* Pattern preview */}
                      <div className="flex items-center gap-0.5 mt-2">
                        {preset.steps.map((step, i) => (
                          <div
                            key={i}
                            className="w-1.5 bg-current opacity-60"
                            style={{
                              height: Math.max(4, Math.min(20, 10 + step.noteOffset * 0.5)),
                              backgroundColor: step.noteOffset >= 0 ? '#22c55e' : '#ef4444',
                            }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview panel */}
          <div className="w-64 border-l border-gray-800 p-4 bg-gray-800/30">
            {hoveredPreset ? (
              <>
                <h3 className="font-semibold text-white mb-2">{hoveredPreset.name}</h3>
                <p className="text-xs text-gray-400 mb-4">{hoveredPreset.description}</p>

                <div className="space-y-3">
                  {/* Settings */}
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Speed</span>
                      <span className="text-white">
                        {hoveredPreset.speed} {hoveredPreset.speedUnit}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Mode</span>
                      <span className="text-white capitalize">{hoveredPreset.mode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Steps</span>
                      <span className="text-white">{hoveredPreset.steps.length}</span>
                    </div>
                  </div>

                  {/* Steps preview */}
                  <div className="bg-gray-900/50 rounded-lg p-2">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Pattern</div>
                    <div className="flex flex-wrap gap-1">
                      {hoveredPreset.steps.map((step, i) => (
                        <span
                          key={i}
                          className={`
                            px-1.5 py-0.5 rounded text-[10px] font-mono
                            ${step.noteOffset > 0
                              ? 'bg-green-500/20 text-green-400'
                              : step.noteOffset < 0
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-gray-800 text-gray-400'
                            }
                            ${step.effect === 'accent' ? 'ring-1 ring-orange-400' : ''}
                          `}
                        >
                          {step.noteOffset >= 0 ? '+' : ''}{step.noteOffset}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    {hoveredPreset.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 text-[9px] rounded bg-gray-800 text-gray-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-600">
                <Music size={24} className="mb-2 opacity-50" />
                <div className="text-xs text-center">
                  Hover over a preset<br />to see details
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
