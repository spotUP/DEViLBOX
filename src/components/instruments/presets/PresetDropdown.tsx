/**
 * PresetDropdown - Synth preset selector
 * Provides quick access to quality presets for each synth type
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Music, Tag } from 'lucide-react';
import { FACTORY_PRESETS } from '@constants/factoryPresets';
import type { SynthType, InstrumentConfig, InstrumentPreset } from '@typedefs/instrument';
import { getSynthInfo } from '@constants/synthCategories';
import { useClickOutside } from '@hooks/useClickOutside';

interface PresetDropdownProps {
  synthType: SynthType;
  currentPresetName?: string;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const PresetDropdown: React.FC<PresetDropdownProps> = ({
  synthType,
  currentPresetName,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedName, setSelectedName] = useState<string | undefined>(currentPresetName);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync external preset name changes
  useEffect(() => { setSelectedName(currentPresetName); }, [currentPresetName]);

  // Filter factory presets by the current synth type
  const presets = useMemo(() => {
    return FACTORY_PRESETS.filter(p => p.synthType === synthType);
  }, [synthType]);

  // Close dropdown when clicking outside
  useClickOutside(dropdownRef, () => setIsOpen(false));

  // Scroll to selected preset when dropdown opens
  useEffect(() => {
    if (isOpen && listRef.current && selectedName) {
      const el = listRef.current.querySelector('[data-selected="true"]');
      if (el) el.scrollIntoView({ block: 'center' });
    }
  }, [isOpen, selectedName]);

  // Apply preset
  const applyPreset = (preset: InstrumentPreset['config']) => {
    const { type: _type, synthType: _synthType, ...config } = preset;
    void _type; void _synthType;
    setSelectedName(preset.name);
    onChange(config as Partial<InstrumentConfig>);
    setIsOpen(false);
  };

  if (presets.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-bgSecondary border border-dark-border opacity-50 cursor-not-allowed text-sm" title="No presets available for this synth type">
        <Music size={14} className="text-text-muted" />
        <span className="text-text-secondary">No Presets</span>
      </div>
    );
  }

  const displayName = selectedName || `Presets (${presets.length})`;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-bgSecondary border border-dark-border hover:border-text-muted transition-colors text-sm max-w-[200px]"
      >
        <Music size={14} className="text-text-muted flex-shrink-0" />
        <span className={`truncate ${selectedName ? 'text-text-primary' : 'text-text-secondary'}`}>
          {displayName}
        </span>
        <ChevronDown
          size={14}
          className={`text-text-muted transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-64 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-[99990] overflow-hidden">
          <div className="p-2 border-b border-dark-border bg-dark-bgTertiary flex items-center justify-between">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
              {getSynthInfo(synthType).name} Presets ({presets.length})
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto scrollbar-ft2" ref={listRef}>
            {presets.map((preset, idx) => {
              const isSelected = preset.name === selectedName;
              return (
                <button
                  key={`${preset.name}-${idx}`}
                  data-selected={isSelected}
                  onClick={() => applyPreset(preset)}
                  className={`w-full px-3 py-2 text-left transition-colors flex flex-col gap-0.5 ${
                    isSelected
                      ? 'bg-accent-primary/15 border-l-2 border-accent-primary'
                      : 'hover:bg-dark-bgTertiary border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold truncate ${isSelected ? 'text-accent-primary' : 'text-text-primary'}`}>
                      {preset.name}
                    </span>
                    {preset.effects && preset.effects.length > 0 && (
                      <Tag size={10} className="text-green-400" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-text-muted uppercase font-mono">
                      {preset.synthType}
                    </span>
                    {preset.effects && preset.effects.length > 0 && (
                      <span className="text-green-500/70">+{preset.effects.length} FX</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};