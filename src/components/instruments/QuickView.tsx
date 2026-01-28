/**
 * QuickView - Default landing tab for instrument editor
 * Shows current sound, quick controls, and preset carousel
 */

import React, { useState, useRef } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { usePresetStore } from '@stores/usePresetStore';
import { getSynthInfo } from '@constants/synthCategories';
import { TB303_PRESETS } from '@constants/tb303Presets';
import { Settings2, ChevronLeft, ChevronRight, Sparkles, Save } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { InstrumentConfig } from '@typedefs/instrument';

interface QuickViewProps {
  /** Callback to switch to Sound tab */
  onEditSound?: () => void;
  /** Callback to switch to Browse tab */
  onBrowseAll?: () => void;
  /** Callback to save preset */
  onSavePreset?: () => void;
}

// Quick parameter definition
interface QuickParam {
  key: string;
  label: string;
  getValue: (inst: InstrumentConfig) => number | undefined;
  format: (val: number) => string;
  min: number;
  max: number;
}

// TB303 quick parameters
const TB303_QUICK_PARAMS: QuickParam[] = [
  {
    key: 'cutoff',
    label: 'Cutoff',
    getValue: (i) => i.tb303?.filter.cutoff,
    format: (v) => `${v}Hz`,
    min: 200,
    max: 20000,
  },
  {
    key: 'resonance',
    label: 'Reso',
    getValue: (i) => i.tb303?.filter.resonance,
    format: (v) => `${v}%`,
    min: 0,
    max: 100,
  },
  {
    key: 'envMod',
    label: 'Env Mod',
    getValue: (i) => i.tb303?.filterEnvelope.envMod,
    format: (v) => `${v}%`,
    min: 0,
    max: 100,
  },
  {
    key: 'decay',
    label: 'Decay',
    getValue: (i) => i.tb303?.filterEnvelope.decay,
    format: (v) => v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(1)}s`,
    min: 30,
    max: 3000,
  },
  {
    key: 'accent',
    label: 'Accent',
    getValue: (i) => i.tb303?.accent.amount,
    format: (v) => `${v}%`,
    min: 0,
    max: 100,
  },
];

// Generic quick parameters for other synths
const GENERIC_QUICK_PARAMS: QuickParam[] = [
  {
    key: 'attack',
    label: 'Attack',
    getValue: (i) => i.envelope?.attack,
    format: (v) => v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(1)}s`,
    min: 0,
    max: 2000,
  },
  {
    key: 'decay',
    label: 'Decay',
    getValue: (i) => i.envelope?.decay,
    format: (v) => v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(1)}s`,
    min: 0,
    max: 2000,
  },
  {
    key: 'sustain',
    label: 'Sustain',
    getValue: (i) => i.envelope?.sustain,
    format: (v) => `${v}%`,
    min: 0,
    max: 100,
  },
  {
    key: 'release',
    label: 'Release',
    getValue: (i) => i.envelope?.release,
    format: (v) => v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(1)}s`,
    min: 0,
    max: 5000,
  },
  {
    key: 'filterFreq',
    label: 'Filter',
    getValue: (i) => i.filter?.frequency,
    format: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}kHz` : `${v}Hz`,
    min: 20,
    max: 20000,
  },
];

export const QuickView: React.FC<QuickViewProps> = ({
  onEditSound,
  onBrowseAll,
  onSavePreset,
}) => {
  // Use selectors for proper reactivity - don't use the getter!
  const currentInstrumentId = useInstrumentStore(state => state.currentInstrumentId);
  const instruments = useInstrumentStore(state => state.instruments);
  const updateInstrument = useInstrumentStore(state => state.updateInstrument);

  // Derive currentInstrument from state for proper re-renders
  const currentInstrument = instruments.find(inst => inst.id === currentInstrumentId) || null;
  const { userPresets, addToRecent } = usePresetStore();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [carouselOffset, setCarouselOffset] = useState(0);

  // Get synth info for current instrument
  const synthInfo = currentInstrument ? getSynthInfo(currentInstrument.synthType) : null;

  // Get appropriate quick params based on synth type
  const quickParams = currentInstrument?.synthType === 'TB303'
    ? TB303_QUICK_PARAMS
    : GENERIC_QUICK_PARAMS;

  // Get available presets for current synth type
  const availablePresets = currentInstrument?.synthType === 'TB303'
    ? TB303_PRESETS.slice(0, 10) // Factory presets
    : [];

  // Get icon component dynamically
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Music2;
  };

  // Scroll carousel
  const scrollCarousel = (direction: 'left' | 'right') => {
    const itemWidth = 100; // Approximate preset item width
    const maxOffset = Math.max(0, (availablePresets.length - 4) * itemWidth);

    if (direction === 'left') {
      setCarouselOffset(Math.max(0, carouselOffset - itemWidth * 2));
    } else {
      setCarouselOffset(Math.min(maxOffset, carouselOffset + itemWidth * 2));
    }
  };

  // Load preset into current instrument
  const handleLoadPreset = (preset: Omit<InstrumentConfig, 'id'>) => {
    if (!currentInstrument) return;

    // Apply preset to current instrument
    updateInstrument(currentInstrument.id, {
      name: preset.name,
      synthType: preset.synthType,
      oscillator: preset.oscillator,
      envelope: preset.envelope,
      filter: preset.filter,
      filterEnvelope: preset.filterEnvelope,
      tb303: preset.tb303,
      wavetable: preset.wavetable,
      effects: preset.effects,
      volume: preset.volume,
      pan: preset.pan,
    });
  };

  if (!currentInstrument || !synthInfo) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        <p>No instrument selected</p>
      </div>
    );
  }

  const IconComponent = getIcon(synthInfo.icon);

  return (
    <div className="p-4 space-y-4">
      {/* Current Sound Card */}
      <div className="bg-dark-bgSecondary rounded-lg p-4 border border-dark-border">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg bg-dark-bgTertiary ${synthInfo.color}`}>
              <IconComponent size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">{currentInstrument.name}</h3>
              <p className="text-sm text-text-muted">
                {synthInfo.name} <span className="text-text-muted/50">|</span> {synthInfo.description.slice(0, 40)}...
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSavePreset}
              className="p-2 rounded hover:bg-dark-bgHover text-text-muted hover:text-text-primary transition-colors"
              title="Save as preset"
            >
              <Save size={16} />
            </button>
            <button
              onClick={onEditSound}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-dark-bgTertiary hover:bg-dark-bgHover text-text-secondary hover:text-text-primary transition-colors text-sm"
            >
              <Settings2 size={14} />
              Edit Sound
            </button>
          </div>
        </div>
      </div>

      {/* Quick Controls */}
      <div>
        <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
          Quick Controls
        </h4>
        <div className="grid grid-cols-5 gap-3">
          {quickParams.map((param) => {
            const value = param.getValue(currentInstrument);
            if (value === undefined) return null;

            return (
              <div
                key={param.key}
                className="bg-dark-bgSecondary rounded-lg p-3 text-center border border-dark-border"
              >
                <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">
                  {param.label}
                </p>
                <p className="text-sm font-mono text-text-primary">
                  {param.format(value)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Presets Carousel */}
      {availablePresets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Quick Presets
            </h4>
            <button
              onClick={onBrowseAll}
              className="text-xs text-text-muted hover:text-accent-primary transition-colors flex items-center gap-1"
            >
              <Sparkles size={12} />
              Browse All
            </button>
          </div>

          <div className="relative">
            {/* Left Arrow */}
            {carouselOffset > 0 && (
              <button
                onClick={() => scrollCarousel('left')}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-dark-bg/90 rounded-full border border-dark-border hover:bg-dark-bgHover transition-colors"
              >
                <ChevronLeft size={16} className="text-text-secondary" />
              </button>
            )}

            {/* Carousel */}
            <div className="overflow-hidden mx-6">
              <div
                ref={carouselRef}
                className="flex gap-2 transition-transform duration-200"
                style={{ transform: `translateX(-${carouselOffset}px)` }}
              >
                {availablePresets.map((preset, index) => (
                  <button
                    key={`preset-${index}`}
                    onClick={() => handleLoadPreset(preset)}
                    className={`
                      flex-shrink-0 px-4 py-2 rounded-lg border transition-all
                      ${currentInstrument.name === preset.name
                        ? 'bg-accent-primary/20 border-accent-primary text-accent-primary'
                        : 'bg-dark-bgSecondary border-dark-border text-text-secondary hover:border-text-muted hover:text-text-primary'
                      }
                    `}
                  >
                    <span className="text-sm font-medium whitespace-nowrap">
                      {preset.name.replace('303 ', '')}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Arrow */}
            {carouselOffset < (availablePresets.length - 4) * 100 && (
              <button
                onClick={() => scrollCarousel('right')}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-dark-bg/90 rounded-full border border-dark-border hover:bg-dark-bgHover transition-colors"
              >
                <ChevronRight size={16} className="text-text-secondary" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* User Presets (if any for this synth type) */}
      {userPresets.filter(p => p.synthType === currentInstrument.synthType).length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
            Your Presets
          </h4>
          <div className="flex flex-wrap gap-2">
            {userPresets
              .filter(p => p.synthType === currentInstrument.synthType)
              .slice(0, 6)
              .map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    handleLoadPreset(preset.config as any);
                    addToRecent(preset.id);
                  }}
                  className="px-3 py-1.5 rounded bg-dark-bgSecondary border border-dark-border text-sm text-text-secondary hover:border-accent-primary hover:text-text-primary transition-colors"
                >
                  {preset.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Best For Tags */}
      <div className="pt-2 border-t border-dark-border">
        <p className="text-xs text-text-muted">
          <span className="font-medium">Best for:</span>{' '}
          {synthInfo.bestFor.join(', ')}
        </p>
      </div>
    </div>
  );
};
