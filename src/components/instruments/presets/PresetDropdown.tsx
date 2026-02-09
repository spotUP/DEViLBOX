/**
 * PresetDropdown - Synth preset selector
 * Provides quick access to quality presets for each synth type
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Music, Tag } from 'lucide-react';
import { FACTORY_PRESETS } from '@constants/factoryPresets';
import type { SynthType, InstrumentConfig, InstrumentPreset } from '@typedefs/instrument';
import { getSynthInfo } from '@constants/synthCategories';

interface PresetDropdownProps {
  synthType: SynthType;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const PresetDropdown: React.FC<PresetDropdownProps> = ({
  synthType,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter factory presets by the current synth type
  const presets = useMemo(() => {
    return FACTORY_PRESETS.filter(p => p.synthType === synthType);
  }, [synthType]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Apply preset
  const applyPreset = (preset: InstrumentPreset['config']) => {
    // We can just pass the entire preset (minus name/type if we want to keep current)
    // but usually user wants the named preset.
    const { name: _name, type: _type, synthType: _synthType, ...config } = preset;
    void _name; void _type; void _synthType;
    
    onChange(config as any);
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

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-bgSecondary border border-dark-border hover:border-text-muted transition-colors text-sm"
      >
        <Music size={14} className="text-text-muted" />
        <span className="text-text-secondary">Presets ({presets.length})</span>
        <ChevronDown
          size={14}
          className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-64 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-dark-border bg-dark-bgTertiary flex items-center justify-between">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
              {getSynthInfo(synthType).name} Presets
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto scrollbar-ft2">
            {presets.map((preset, idx) => (
              <button
                key={`${preset.name}-${idx}`}
                onClick={() => applyPreset(preset)}
                className="w-full px-3 py-2 text-left hover:bg-dark-bgTertiary transition-colors border-b border-dark-border/50 last:border-b-0 flex flex-col gap-0.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-text-primary truncate">
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
};