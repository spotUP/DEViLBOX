/**
 * PresetBrowser - Browse and load factory presets
 * Category tabs, grid layout, search/filter
 */

import React, { useState, useMemo } from 'react';
import { PRESET_CATEGORIES, type PresetCategory } from '@constants/factoryPresets';
import type { InstrumentConfig } from '@typedefs/instrument';
import { useInstrumentStore } from '@stores/useInstrumentStore';

interface PresetBrowserProps {
  instrumentId: number;
  onClose?: () => void;
}

export const PresetBrowser: React.FC<PresetBrowserProps> = ({ instrumentId, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('Bass');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);

  const { updateInstrument } = useInstrumentStore();

  const categories = Object.keys(PRESET_CATEGORIES) as PresetCategory[];

  // Filter presets based on search query
  const filteredPresets = useMemo(() => {
    const categoryPresets = PRESET_CATEGORIES[activeCategory];

    if (!searchQuery.trim()) {
      return categoryPresets;
    }

    const query = searchQuery.toLowerCase();
    return categoryPresets.filter(
      (preset) =>
        preset.name.toLowerCase().includes(query) ||
        preset.synthType.toLowerCase().includes(query)
    );
  }, [activeCategory, searchQuery]);

  const handleLoadPreset = (preset: Omit<InstrumentConfig, 'id'>) => {
    // Load preset into current instrument while preserving ID
    updateInstrument(instrumentId, preset);

    // Close browser if callback provided
    if (onClose) {
      onClose();
    }
  };

  const getCategoryColor = (category: PresetCategory): string => {
    switch (category) {
      case 'Bass':
        return 'text-blue-400 border-blue-500';
      case 'Leads':
        return 'text-yellow-400 border-yellow-500';
      case 'Pads':
        return 'text-purple-400 border-purple-500';
      case 'Drums':
        return 'text-red-400 border-red-500';
      case 'FX':
        return 'text-green-400 border-green-500';
      case 'DubSiren':
        return 'text-red-500 border-red-500';
      case 'Synare':
        return 'text-yellow-500 border-yellow-500';
      default:
        return 'text-ft2-highlight border-ft2-highlight';
    }
  };

  const getSynthTypeColor = (synthType: string): string => {
    if (synthType === 'TB303') return 'text-cyan-400';
    if (synthType === 'DubSiren') return 'text-red-500';
    if (synthType === 'Synare') return 'text-yellow-500';
    if (synthType.includes('Synth')) return 'text-yellow-300';
    if (synthType.includes('Metal') || synthType.includes('Membrane')) return 'text-red-300';
    if (synthType.includes('Noise')) return 'text-purple-300';
    return 'text-ft2-textDim';
  };

  return (
    <div className="p-4 bg-ft2-bg h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-ft2-border">
        <div className="text-ft2-highlight text-sm font-bold">FACTORY PRESETS</div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs border border-ft2-border bg-ft2-header
                     hover:border-ft2-highlight hover:text-ft2-highlight transition-colors font-bold"
          >
            CLOSE
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search presets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-ft2-header border border-ft2-border
                   text-ft2-text text-sm font-mono
                   focus:outline-none focus:border-ft2-highlight
                   placeholder:text-ft2-textDim"
        />
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {categories.map((category) => {
          const isActive = activeCategory === category;
          const categoryColor = getCategoryColor(category);

          return (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`
                px-3 py-1.5 text-xs font-mono transition-colors border font-bold
                ${
                  isActive
                    ? `bg-ft2-cursor text-ft2-bg ${categoryColor}`
                    : `bg-ft2-header text-ft2-text border-ft2-border hover:${categoryColor}`
                }
              `}
            >
              {category.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Preset Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-ft2 mb-4">
        {filteredPresets.length === 0 ? (
          <div className="flex items-center justify-center h-full text-ft2-textDim text-sm">
            No presets found matching "{searchQuery}"
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filteredPresets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handleLoadPreset(preset)}
                onMouseEnter={() => setHoveredPreset(preset.name)}
                onMouseLeave={() => setHoveredPreset(null)}
                className={`
                  p-3 border text-left transition-all
                  ${
                    hoveredPreset === preset.name
                      ? 'bg-ft2-cursor text-ft2-bg border-ft2-highlight scale-105 shadow-lg'
                      : 'bg-ft2-header text-ft2-text border-ft2-border hover:border-ft2-highlight'
                  }
                `}
              >

                {/* Preset Name */}
                <div
                  className={`
                  font-mono text-sm font-bold mb-1 truncate
                  ${hoveredPreset === preset.name ? 'text-ft2-bg' : 'text-ft2-text'}
                `}
                  title={preset.name}
                >
                  {preset.name}
                </div>

                {/* Synth Type + Devil Fish Badge */}
                <div className="flex items-center gap-2">
                  <span
                    className={`
                    text-xs font-mono
                    ${hoveredPreset === preset.name ? 'text-ft2-bg opacity-80' : getSynthTypeColor(preset.synthType)}
                  `}
                  >
                    {preset.synthType}
                  </span>
                  {/* Devil Fish Badge */}
                  {preset.synthType === 'TB303' && preset.tb303?.devilFish?.enabled && (
                    <span
                      className={`
                        px-1.5 py-0.5 text-[10px] font-bold rounded
                        ${hoveredPreset === preset.name
                          ? 'bg-ft2-bg text-red-500'
                          : 'bg-red-600 text-white'}
                      `}
                    >
                      DF
                    </span>
                  )}
                </div>

                {/* Effects Badge */}
                {preset.effects && preset.effects.length > 0 && (
                  <div className="mt-2 flex items-center gap-1">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="currentColor"
                      className={hoveredPreset === preset.name ? 'text-ft2-bg' : 'text-green-400'}
                    >
                      <rect x="0" y="4" width="3" height="4" />
                      <rect x="4.5" y="2" width="3" height="8" />
                      <rect x="9" y="1" width="3" height="10" />
                    </svg>
                    <span
                      className={`
                      text-xs font-mono
                      ${hoveredPreset === preset.name ? 'text-ft2-bg' : 'text-green-400'}
                    `}
                    >
                      {preset.effects.length} FX
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className="space-y-2">
        {/* Stats */}
        <div className="p-2 bg-ft2-header border border-ft2-border text-xs text-ft2-textDim">
          <div className="flex items-center justify-between">
            <span>
              <span className="font-bold text-ft2-highlight">{filteredPresets.length}</span>{' '}
              {filteredPresets.length === 1 ? 'preset' : 'presets'} in{' '}
              <span className="font-bold">{activeCategory}</span>
            </span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-ft2-highlight hover:text-ft2-cursor transition-colors font-bold"
              >
                CLEAR
              </button>
            )}
          </div>
        </div>

        {/* Tips */}
        <div className="p-2 bg-ft2-header border border-ft2-border text-xs text-ft2-textDim">
          <div className="font-bold mb-1 text-ft2-text">QUICK TIPS:</div>
          <ul className="space-y-0.5">
            <li>• Click any preset to load it into instrument {instrumentId.toString(16).toUpperCase().padStart(2, '0')}</li>
            <li>• Use search to filter by name or synth type</li>
            <li>• Hover to preview preset details</li>
          </ul>
        </div>

        {/* Category Legend */}
        <div className="flex flex-wrap gap-2 p-2 bg-ft2-header border border-ft2-border">
          {categories.map((cat) => (
            <div key={cat} className="flex items-center gap-1">
              <div className={`w-2 h-2 ${getCategoryColor(cat).split(' ')[0].replace('text-', 'bg-')}`} />
              <span className="text-xs font-mono text-ft2-textDim">{cat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
