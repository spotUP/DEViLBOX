/**
 * LoadPresetModal - Modal for loading factory presets into current instrument
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useInstrumentStore } from '@stores';
import { PRESET_CATEGORIES, type PresetCategory } from '@constants/factoryPresets';
import { getSynthInfo } from '@constants/synthCategories';
import { getToneEngine } from '@engine/ToneEngine';
import * as LucideIcons from 'lucide-react';
import { X, Search, Check, Zap } from 'lucide-react';
import type { InstrumentConfig } from '@typedefs/instrument';

interface LoadPresetModalProps {
  onClose: () => void;
}

export const LoadPresetModal: React.FC<LoadPresetModalProps> = ({ onClose }) => {
  const { currentInstrumentId, updateInstrument, setPreviewInstrument } = useInstrumentStore();
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('Bass');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPresetName, setSelectedPresetName] = useState<string | null>(null);

  const categories = Object.keys(PRESET_CATEGORIES) as PresetCategory[];

  // Handle category change - reset selection and search
  const handleCategoryChange = (category: PresetCategory) => {
    setActiveCategory(category);
    setSelectedPresetName(null);
    setSearchQuery('');
  };

  // Find the selected preset object
  const selectedPreset = useMemo(() => {
    if (!selectedPresetName) return null;
    return (PRESET_CATEGORIES[activeCategory] as Omit<InstrumentConfig, 'id'>[]).find(p => p.name === selectedPresetName) || null;
  }, [selectedPresetName, activeCategory]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle preview instrument sync
  useEffect(() => {
    if (selectedPreset) {
      // Create a temporary instrument config for preview (ID 999 is reserved for browser/modal previews)
      const previewConfig: InstrumentConfig = {
        ...selectedPreset,
        id: 999,
        isLive: true, // Low latency for jamming
      } as any;

      setPreviewInstrument(previewConfig);
      // Force engine to reload the new synth for the preview ID
      try {
        getToneEngine().invalidateInstrument(999);
      } catch (e) {
        // Ignored
      }
    } else {
      setPreviewInstrument(null);
    }

    return () => {
      setPreviewInstrument(null);
    };
  }, [selectedPreset, setPreviewInstrument]);

  // Keyboard support for jamming (2 Octaves, Standard Tracker Layout)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      
      const keyMap: Record<string, string> = {
        'z': 'C4', 's': 'C#4', 'x': 'D4', 'd': 'D#4', 'c': 'E4', 'v': 'F4', 
        'g': 'F#4', 'b': 'G4', 'h': 'G#4', 'n': 'A4', 'j': 'A#4', 'm': 'B4',
        ',': 'C5',
        'q': 'C5', '2': 'C#5', 'w': 'D5', '3': 'D#5', 'e': 'E5', 'r': 'F5',
        '5': 'F#5', 't': 'G5', '6': 'G#5', 'y': 'A5', '7': 'A#5', 'u': 'B5',
        'i': 'C6'
      };

      const note = keyMap[e.key.toLowerCase()];
      if (note && selectedPreset) {
        const engine = getToneEngine();
        const previewConfig = { ...selectedPreset, id: 999, isLive: true } as any;
        engine.triggerPolyNoteAttack(999, note, 1, previewConfig);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      
      const keyMap: Record<string, string> = {
        'z': 'C4', 's': 'C#4', 'x': 'D4', 'd': 'D#4', 'c': 'E4', 'v': 'F4', 
        'g': 'F#4', 'b': 'G4', 'h': 'G#4', 'n': 'A4', 'j': 'A#4', 'm': 'B4',
        ',': 'C5',
        'q': 'C5', '2': 'C#5', 'w': 'D5', '3': 'D#5', 'e': 'E5', 'r': 'F5',
        '5': 'F#5', 't': 'G5', '6': 'G#5', 'y': 'A5', '7': 'A#5', 'u': 'B5',
        'i': 'C6'
      };

      const note = keyMap[e.key.toLowerCase()];
      if (note && selectedPreset) {
        const engine = getToneEngine();
        const previewConfig = { ...selectedPreset, id: 999, isLive: true } as any;
        engine.triggerPolyNoteRelease(999, note, previewConfig);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedPreset]);

  // Get icon for synth type
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Music2;
  };

  // Filter presets based on active category
  const categoryPresets = PRESET_CATEGORIES[activeCategory];

  const filteredPresets = (categoryPresets || []).filter((preset) => {
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

  // Auto-preview on click
  const handlePresetClick = (preset: Omit<InstrumentConfig, 'id'>) => {
    setSelectedPresetName(preset.name);
    
    // Quick preview trigger at C-4
    const engine = getToneEngine();
    const previewConfig = { ...preset, id: 999, isLive: true } as any;
    engine.triggerPolyNoteAttack(999, 'C4', 1, previewConfig);
    setTimeout(() => {
      engine.triggerPolyNoteRelease(999, 'C4', previewConfig);
    }, 300);
  };

  // Get category color
  const getCategoryColor = (category: PresetCategory) => {
    const colors: Record<PresetCategory, string> = {
      Bass: 'text-blue-400',
      Leads: 'text-yellow-400',
      Pads: 'text-purple-400',
      Drums: 'text-red-400',
      'TR-808': 'text-red-500',
      'TR-909': 'text-orange-400',
      'TR-707': 'text-rose-400',
      'TR-505': 'text-amber-400',
      Chip: 'text-cyan-400',
      Furnace: 'text-teal-400',
      FX: 'text-green-400',
      Dub: 'text-green-400',
      DubSiren: 'text-red-500',
      SpaceLaser: 'text-green-500',
      V2: 'text-amber-500',
      Synare: 'text-yellow-500',
      Drumnibus: 'text-emerald-400',
      Keys: 'text-amber-600',
      MAME: 'text-pink-400',
      Module: 'text-lime-400',
    };
    return colors[category] || 'text-ft2-highlight';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="w-full h-full bg-ft2-bg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-ft2-header border-b-2 border-ft2-border">
          <div>
            <h2 className="text-ft2-highlight font-bold text-sm uppercase tracking-widest">LOAD FACTORY PRESET</h2>
            <p className="text-ft2-textDim text-[10px]">Browse, Jam and Load high-quality sounds</p>
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
              placeholder="Search presets by name or synth type..."
              className="w-full pl-10 pr-4 py-2 bg-ft2-bg border border-ft2-border text-ft2-text rounded focus:border-ft2-highlight focus:outline-none placeholder:text-ft2-textDim/50"
              autoFocus
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1 px-4 py-2 bg-ft2-header border-b border-ft2-border">
          {categories.map((category) => {
            const isActive = activeCategory === category;
            return (
              <button
                key={category}
                onClick={() => handleCategoryChange(category)}
                className={`
                  px-3 py-1.5 text-[10px] font-black rounded transition-all uppercase tracking-tighter
                  ${isActive
                    ? 'bg-ft2-cursor text-ft2-bg shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                    : `bg-ft2-bg border border-ft2-border hover:border-ft2-highlight ${getCategoryColor(category)}`
                  }
                `}
              >
                {category}
              </button>
            );
          })}
        </div>

        {/* Preset Grid */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-ft2" key={activeCategory}>
          {filteredPresets.length === 0 ? (
            <div className="flex items-center justify-center h-full text-ft2-textDim font-mono text-sm uppercase">
              No presets found matching "{searchQuery}"
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filteredPresets.map((preset, index) => {
                const synthInfo = getSynthInfo(preset.synthType);
                const IconComponent = getIcon(synthInfo.icon);
                const isSelected = selectedPresetName === preset.name;

                return (
                  <button
                    key={`${activeCategory}-${preset.name}-${index}`}
                    onClick={() => handlePresetClick(preset)}
                    onDoubleClick={() => handleLoadPreset(preset)}
                    className={`
                      p-3 rounded border-2 text-left transition-all group
                      ${isSelected
                        ? 'bg-ft2-cursor text-ft2-bg border-ft2-cursor shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                        : 'bg-ft2-header border-ft2-border hover:border-ft2-highlight hover:bg-ft2-bg'
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
                      <span className={`text-[10px] font-mono uppercase ${isSelected ? 'text-ft2-bg/80' : 'text-ft2-textDim'}`}>
                        {preset.synthType}
                      </span>
                      {preset.effects && preset.effects.length > 0 && (
                        <span className={`text-[9px] px-1.5 font-bold rounded ${isSelected ? 'bg-ft2-bg/20 text-ft2-bg' : 'bg-green-600/20 text-green-400'}`}>
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
          <div className="flex items-center gap-4">
            <div className="text-ft2-textDim text-xs font-mono">
              {filteredPresets.length} PRESET{filteredPresets.length !== 1 ? 'S' : ''} • {activeCategory.toUpperCase()}
              {selectedPresetName && <span className="ml-2 text-ft2-text">• DOUBLE-CLICK TO APPLY</span>}
            </div>

            {/* Jam Indicator */}
            {selectedPreset && (
              <div className="flex items-center gap-2 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded animate-pulse-glow">
                <Zap size={12} className="text-amber-400 fill-amber-400" />
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">JAM ACTIVE</span>
              </div>
            )}
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-ft2-bg border border-ft2-border text-ft2-text hover:border-ft2-highlight rounded transition-colors font-bold text-xs uppercase"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (selectedPreset) handleLoadPreset(selectedPreset);
              }}
              disabled={!selectedPreset}
              className="flex items-center gap-2 px-6 py-2 bg-ft2-cursor text-ft2-bg font-black hover:bg-ft2-highlight rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed uppercase text-xs"
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
