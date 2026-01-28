/**
 * PresetDropdown - Synth preset selector
 * Provides quick access to quality presets for each synth type
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Music, Tag, X } from 'lucide-react';
import { getPresetsForSynthType, type SynthPreset } from '@constants/synthPresets';
import type { SynthType, InstrumentConfig } from '@typedefs/instrument';

interface PresetDropdownProps {
  synthType: SynthType;
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const PresetDropdown: React.FC<PresetDropdownProps> = ({
  synthType,
  instrument,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const presets = getPresetsForSynthType(synthType);

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

  // Get unique categories
  const categories = Array.from(new Set(presets.map(p => p.category)));

  // Filter presets by category
  const filteredPresets = selectedCategory
    ? presets.filter(p => p.category === selectedCategory)
    : presets;

  // Apply preset
  const applyPreset = (preset: SynthPreset) => {
    // Map synth type to config key
    const configKeyMap: Record<string, string> = {
      TB303: 'tb303',
      ChipSynth: 'chipSynth',
      SuperSaw: 'superSaw',
      Organ: 'organ',
      DrumMachine: 'drumMachine',
      PWMSynth: 'pwmSynth',
      StringMachine: 'stringMachine',
      FormantSynth: 'formantSynth',
      PolySynth: 'polySynth',
      Wavetable: 'wavetable',
      GranularSynth: 'granular',
      WobbleBass: 'wobbleBass',
    };

    const configKey = configKeyMap[synthType];
    if (!configKey) return;

    // Get current config and merge with preset
    const currentConfig = (instrument as any)[configKey] || {};
    const updates: Partial<InstrumentConfig> = {
      [configKey]: { ...currentConfig, ...preset.config },
    };

    // Also handle envelope and oscillator if present
    if (preset.config.envelope) {
      updates.envelope = { ...instrument.envelope, ...preset.config.envelope };
    }
    if (preset.config.oscillator) {
      updates.oscillator = { ...instrument.oscillator, ...preset.config.oscillator };
    }

    onChange(updates);
    setIsOpen(false);
  };

  // Category colors
  const categoryColors: Record<string, string> = {
    bass: 'text-red-400',
    lead: 'text-yellow-400',
    pad: 'text-blue-400',
    key: 'text-green-400',
    fx: 'text-purple-400',
    drum: 'text-orange-400',
    pluck: 'text-cyan-400',
    string: 'text-pink-400',
  };

  if (presets.length === 0) {
    return null; // Don't show if no presets for this synth type
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-bgSecondary border border-dark-border hover:border-text-muted transition-colors text-sm"
      >
        <Music size={14} className="text-text-muted" />
        <span className="text-text-secondary">Presets</span>
        <ChevronDown
          size={14}
          className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header with category filter */}
          <div className="p-2 border-b border-dark-border bg-dark-bgTertiary">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                {synthType} Presets
              </span>
              <span className="text-xs text-text-muted">
                {filteredPresets.length} presets
              </span>
            </div>

            {/* Category chips */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                  selectedCategory === null
                    ? 'bg-accent-primary text-dark-bg'
                    : 'bg-dark-bg text-text-muted hover:text-text-secondary'
                }`}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                  className={`px-2 py-0.5 text-xs rounded-full transition-colors flex items-center gap-1 ${
                    selectedCategory === cat
                      ? 'bg-accent-primary text-dark-bg'
                      : 'bg-dark-bg text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <span className={categoryColors[cat]}>{cat}</span>
                  {selectedCategory === cat && <X size={10} />}
                </button>
              ))}
            </div>
          </div>

          {/* Preset list */}
          <div className="max-h-64 overflow-y-auto">
            {filteredPresets.map(preset => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="w-full px-3 py-2 text-left hover:bg-dark-bgTertiary transition-colors border-b border-dark-border/50 last:border-b-0"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {preset.name}
                      </span>
                      <Tag size={10} className={categoryColors[preset.category]} />
                    </div>
                    <p className="text-xs text-text-muted truncate mt-0.5">
                      {preset.description}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
