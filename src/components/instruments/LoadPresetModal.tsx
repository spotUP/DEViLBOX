/**
 * LoadPresetModal - Modal for loading factory presets into current instrument
 */

import React, { useState } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { PRESET_CATEGORIES, type PresetCategory } from '@constants/factoryPresets';
import { getSynthInfo } from '@constants/synthCategories';
import * as LucideIcons from 'lucide-react';
import { X, Search, Check } from 'lucide-react';
import type { InstrumentConfig } from '@typedefs/instrument';

interface LoadPresetModalProps {
  onClose: () => void;
}

export const LoadPresetModal: React.FC<LoadPresetModalProps> = ({ onClose }) => {
  const { currentInstrumentId, updateInstrument } = useInstrumentStore();
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('Bass');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const categories = Object.keys(PRESET_CATEGORIES) as PresetCategory[];

  // Get icon for synth type
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Music2;
  };

  // Filter presets
  const filteredPresets = PRESET_CATEGORIES[activeCategory].filter((preset) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      preset.name.toLowerCase().includes(query) ||
      preset.synthType.toLowerCase().includes(query)
    );
  });

  // Handle loading a preset
  const handleLoadPreset = (preset: Omit<InstrumentConfig, 'id'>) => {
    if (currentInstrumentId === null) return;
    updateInstrument(currentInstrumentId, preset);
    onClose();
  };

  // Get category color
  const getCategoryColor = (category: PresetCategory) => {
    const colors: Record<PresetCategory, string> = {
      Bass: 'text-blue-400',
      Leads: 'text-yellow-400',
      Pads: 'text-purple-400',
      Drums: 'text-red-400',
      Chip: 'text-cyan-400',
      FX: 'text-green-400',
    };
    return colors[category] || 'text-ft2-highlight';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="w-full h-full bg-ft2-bg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-ft2-header border-b-2 border-ft2-border">
          <div>
            <h2 className="text-ft2-highlight font-bold text-sm">LOAD PRESET</h2>
            <p className="text-ft2-textDim text-xs">Choose a factory preset to load</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ft2-textDim hover:text-ft2-text hover:bg-ft2-border rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-4 py-3 bg-ft2-header border-b border-ft2-border">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ft2-textDim" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search presets..."
              className="w-full pl-10 pr-4 py-2 bg-ft2-bg border border-ft2-border text-ft2-text rounded focus:border-ft2-highlight focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1 px-4 py-2 bg-ft2-header border-b border-ft2-border">
          {categories.map((category) => {
            const isActive = activeCategory === category;
            return (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`
                  px-4 py-1.5 text-xs font-bold rounded transition-colors
                  ${isActive
                    ? 'bg-ft2-cursor text-ft2-bg'
                    : `bg-ft2-bg border border-ft2-border hover:border-ft2-highlight ${getCategoryColor(category)}`
                  }
                `}
              >
                {category.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Preset Grid */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-ft2">
          {filteredPresets.length === 0 ? (
            <div className="flex items-center justify-center h-full text-ft2-textDim">
              No presets found matching "{searchQuery}"
            </div>
          ) : (
            <div className="grid grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filteredPresets.map((preset) => {
                const synthInfo = getSynthInfo(preset.synthType);
                const IconComponent = getIcon(synthInfo.icon);
                const isSelected = selectedPreset === preset.name;

                return (
                  <button
                    key={preset.name}
                    onClick={() => setSelectedPreset(preset.name)}
                    onDoubleClick={() => handleLoadPreset(preset)}
                    className={`
                      p-3 rounded border-2 text-left transition-all
                      ${isSelected
                        ? 'bg-ft2-cursor text-ft2-bg border-ft2-cursor'
                        : 'bg-ft2-header border-ft2-border hover:border-ft2-highlight'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <IconComponent size={14} className={isSelected ? 'text-ft2-bg' : synthInfo.color} />
                      <span className={`font-bold text-sm truncate ${isSelected ? 'text-ft2-bg' : 'text-ft2-text'}`}>
                        {preset.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${isSelected ? 'text-ft2-bg/80' : 'text-ft2-textDim'}`}>
                        {preset.synthType}
                      </span>
                      {preset.effects && preset.effects.length > 0 && (
                        <span className={`text-[10px] px-1.5 rounded ${isSelected ? 'bg-ft2-bg/20 text-ft2-bg' : 'bg-green-600/20 text-green-400'}`}>
                          {preset.effects.length} FX
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 bg-ft2-header border-t-2 border-ft2-border">
          <div className="text-ft2-textDim text-xs">
            {filteredPresets.length} preset{filteredPresets.length !== 1 ? 's' : ''} in {activeCategory}
            {selectedPreset && <span className="ml-2 text-ft2-text">• Double-click or click Load to apply</span>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-ft2-bg border border-ft2-border text-ft2-text hover:border-ft2-highlight rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const preset = filteredPresets.find((p) => p.name === selectedPreset);
                if (preset) handleLoadPreset(preset);
              }}
              disabled={!selectedPreset}
              className="flex items-center gap-2 px-4 py-2 bg-ft2-cursor text-ft2-bg font-bold hover:bg-ft2-highlight rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={16} />
              Load Preset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
