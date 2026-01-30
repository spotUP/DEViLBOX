/**
 * CategorizedSynthSelector - Grouped synth picker with descriptions and guidance
 * Replaces the flat grid with organized categories
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { SYNTH_CATEGORIES, getSynthInfo, type SynthInfo } from '@constants/synthCategories';
import type { SynthType, InstrumentConfig } from '@typedefs/instrument';

// localStorage keys for persisting UI state
const STORAGE_KEY_CATEGORY = 'devilbox-synth-selector-category';
const STORAGE_KEY_SEARCH = 'devilbox-synth-selector-search';
const STORAGE_KEY_SCROLL = 'devilbox-synth-selector-scroll';
import {
  DEFAULT_TB303,
  DEFAULT_DRUM_MACHINE,
  DEFAULT_CHIP_SYNTH,
  DEFAULT_PWM_SYNTH,
  DEFAULT_WAVETABLE,
  DEFAULT_GRANULAR,
  DEFAULT_SUPERSAW,
  DEFAULT_POLYSYNTH,
  DEFAULT_ORGAN,
  DEFAULT_STRING_MACHINE,
  DEFAULT_FORMANT_SYNTH,
  DEFAULT_FURNACE,
  DEFAULT_CHIPTUNE_MODULE,
  DEFAULT_WOBBLE_BASS,
  DEFAULT_DRUMKIT,
} from '@typedefs/instrument';
import * as LucideIcons from 'lucide-react';
import { Check, ChevronRight, Search, X } from 'lucide-react';
import { ToneEngine } from '@engine/ToneEngine';

interface CategorizedSynthSelectorProps {
  /** Callback when synth type is selected */
  onSelect?: (synthType: SynthType) => void;
  /** Show compact grid instead of full list */
  compact?: boolean;
}

export const CategorizedSynthSelector: React.FC<CategorizedSynthSelectorProps> = ({
  onSelect,
  compact = false,
}) => {
  // Use selectors for proper reactivity - don't use the getter!
  const currentInstrumentId = useInstrumentStore(state => state.currentInstrumentId);
  const instruments = useInstrumentStore(state => state.instruments);
  const updateInstrument = useInstrumentStore(state => state.updateInstrument);

  // Derive currentInstrument from state for proper re-renders
  const currentInstrument = instruments.find(inst => inst.id === currentInstrumentId) || null;
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [hoveredSynth, setHoveredSynth] = useState<SynthType | null>(null);

  // Initialize state from localStorage for persistence
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_SEARCH) || '';
    } catch {
      return '';
    }
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_CATEGORY) || null;
    } catch {
      return null;
    }
  });

  // Ref for scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isRestoringScroll = useRef(false);

  // Persist filter state to localStorage
  useEffect(() => {
    try {
      if (selectedCategory) {
        localStorage.setItem(STORAGE_KEY_CATEGORY, selectedCategory);
      } else {
        localStorage.removeItem(STORAGE_KEY_CATEGORY);
      }
    } catch {
      // Ignore storage errors
    }
  }, [selectedCategory]);

  useEffect(() => {
    try {
      if (searchQuery) {
        localStorage.setItem(STORAGE_KEY_SEARCH, searchQuery);
      } else {
        localStorage.removeItem(STORAGE_KEY_SEARCH);
      }
    } catch {
      // Ignore storage errors
    }
  }, [searchQuery]);

  // Save scroll position on scroll (debounced)
  const handleScroll = useCallback(() => {
    if (isRestoringScroll.current) return;
    const container = scrollContainerRef.current;
    if (container) {
      try {
        localStorage.setItem(STORAGE_KEY_SCROLL, String(container.scrollTop));
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  // Restore scroll position on mount
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      try {
        const savedScroll = localStorage.getItem(STORAGE_KEY_SCROLL);
        if (savedScroll) {
          isRestoringScroll.current = true;
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            container.scrollTop = parseInt(savedScroll, 10) || 0;
            // Reset flag after a short delay
            setTimeout(() => {
              isRestoringScroll.current = false;
            }, 100);
          });
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  // Filter categories and synths based on search and category selection
  const filteredCategories = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return SYNTH_CATEGORIES
      .filter(cat => !selectedCategory || cat.id === selectedCategory)
      .map(cat => ({
        ...cat,
        synths: cat.synths.filter(synth => {
          if (!synth || !synth.icon) return false;
          if (!query) return true;
          // Search in name, shortName, description, and bestFor tags
          return (
            synth.name.toLowerCase().includes(query) ||
            synth.shortName.toLowerCase().includes(query) ||
            synth.description.toLowerCase().includes(query) ||
            synth.bestFor.some(tag => tag.toLowerCase().includes(query))
          );
        })
      }))
      .filter(cat => cat.synths.length > 0);
  }, [searchQuery, selectedCategory]);

  // Count total visible synths
  const totalVisibleSynths = useMemo(() =>
    filteredCategories.reduce((sum, cat) => sum + cat.synths.length, 0),
    [filteredCategories]
  );

  // Get icon component dynamically (with full error handling)
  const getIcon = (iconName: string | undefined): typeof LucideIcons.Music2 => {
    if (!iconName) return LucideIcons.Music2;
    try {
      const icons = LucideIcons as unknown as Record<string, typeof LucideIcons.Music2>;
      const Icon = icons[iconName];
      return Icon || LucideIcons.Music2;
    } catch (error) {
      console.warn('[CategorizedSynthSelector] Failed to load icon:', iconName, error);
      return LucideIcons.Music2;
    }
  };

  // Handle synth selection
  const handleSelectSynth = (synthType: SynthType) => {
    if (!currentInstrument) return;

    // Invalidate cached instrument so ToneEngine recreates it
    ToneEngine.getInstance().invalidateInstrument(currentInstrument.id);

    // Build the update with new synth type and appropriate config
    const updates: Partial<InstrumentConfig> = {
      synthType,
      // Clear all synth-specific configs
      tb303: undefined,
      drumMachine: undefined,
      chipSynth: undefined,
      pwmSynth: undefined,
      wavetable: undefined,
      granular: undefined,
      superSaw: undefined,
      polySynth: undefined,
      organ: undefined,
      stringMachine: undefined,
      formantSynth: undefined,
      furnace: undefined,
      chiptuneModule: undefined,
      wobbleBass: undefined,
      drumKit: undefined,
    };

    // Initialize the appropriate synth-specific config
    switch (synthType) {
      case 'TB303':
        updates.tb303 = { ...DEFAULT_TB303 };
        break;
      case 'DrumMachine':
        updates.drumMachine = { ...DEFAULT_DRUM_MACHINE };
        break;
      case 'ChipSynth':
        updates.chipSynth = { ...DEFAULT_CHIP_SYNTH };
        break;
      case 'PWMSynth':
        updates.pwmSynth = { ...DEFAULT_PWM_SYNTH };
        break;
      case 'Wavetable':
        updates.wavetable = { ...DEFAULT_WAVETABLE };
        break;
      case 'GranularSynth':
        updates.granular = { ...DEFAULT_GRANULAR };
        break;
      case 'SuperSaw':
        updates.superSaw = { ...DEFAULT_SUPERSAW };
        break;
      case 'PolySynth':
        updates.polySynth = { ...DEFAULT_POLYSYNTH };
        break;
      case 'Organ':
        updates.organ = { ...DEFAULT_ORGAN };
        break;
      case 'StringMachine':
        updates.stringMachine = { ...DEFAULT_STRING_MACHINE };
        break;
      case 'FormantSynth':
        updates.formantSynth = { ...DEFAULT_FORMANT_SYNTH };
        break;
      case 'Furnace':
        updates.furnace = { ...DEFAULT_FURNACE };
        break;
      case 'ChiptuneModule':
        updates.chiptuneModule = { ...DEFAULT_CHIPTUNE_MODULE };
        break;
      case 'WobbleBass':
        updates.wobbleBass = { ...DEFAULT_WOBBLE_BASS };
        break;
      case 'DrumKit':
        updates.drumKit = { ...DEFAULT_DRUMKIT };
        break;
    }

    updateInstrument(currentInstrument.id, updates);
    onSelect?.(synthType);
  };

  // Render a single synth card
  const renderSynthCard = (synth: SynthInfo | undefined, isSelected: boolean) => {
    if (!synth || !synth.icon) return null;
    const IconComponent = getIcon(synth.icon);
    void hoveredSynth; // Used for future hover effects

    return (
      <div
        key={synth.type}
        onClick={() => handleSelectSynth(synth.type)}
        onMouseEnter={() => setHoveredSynth(synth.type)}
        onMouseLeave={() => setHoveredSynth(null)}
        className={`
          relative p-4 rounded-lg border cursor-pointer transition-all
          ${isSelected
            ? 'bg-accent-primary/15 border-accent-primary'
            : 'bg-dark-bgSecondary border-dark-border hover:border-text-muted hover:bg-dark-bgHover'
          }
        `}
      >
        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent-primary flex items-center justify-center">
            <Check size={12} className="text-dark-bg" />
          </div>
        )}

        {/* Icon + Name row */}
        <div className="flex items-center gap-3 mb-2">
          <div className={`p-2 rounded-md bg-dark-bgTertiary ${synth.color}`}>
            <IconComponent size={18} />
          </div>
          <div>
            <h4 className="font-medium text-text-primary">{synth.name}</h4>
            <p className="text-xs text-text-muted">{synth.shortName}</p>
          </div>
        </div>

        {/* Description */}
        {!compact && (
          <>
            <p className="text-sm text-text-secondary mb-2">{synth.description}</p>

            {/* Best for tags */}
            <div className="flex flex-wrap gap-1">
              {synth.bestFor.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-[10px] rounded-full bg-dark-bgTertiary text-text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  // Compact grid view
  if (compact) {
    const allSynths = filteredCategories.flatMap(cat => cat.synths);
    const uniqueSynths = Array.from(new Map(allSynths.map(s => [s.type, s])).values());

    return (
      <div className="space-y-3">
        {/* Search bar for compact view */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search synths..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-dark-bgSecondary border border-dark-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Synth grid */}
        <div className="grid grid-cols-3 gap-2">
          {uniqueSynths.map((synth) => {
            const isSelected = currentInstrument?.synthType === synth.type;
            const IconComponent = getIcon(synth.icon);

            return (
              <button
                key={synth.type}
                onClick={() => handleSelectSynth(synth.type)}
                className={`
                  flex items-center gap-2 p-2 rounded-lg border text-left transition-all
                  ${isSelected
                    ? 'bg-accent-primary/15 border-accent-primary'
                    : 'bg-dark-bgSecondary border-dark-border hover:border-text-muted'
                  }
                `}
              >
                <IconComponent size={14} className={synth.color} />
                <span className={`text-sm truncate ${isSelected ? 'text-accent-primary' : 'text-text-secondary'}`}>
                  {synth.shortName}
                </span>
              </button>
            );
          })}
        </div>

        {/* No results */}
        {uniqueSynths.length === 0 && (
          <div className="text-center py-4 text-text-muted text-sm">
            No synths found for "{searchQuery}"
          </div>
        )}
      </div>
    );
  }

  // Full categorized view
  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="space-y-4 max-h-full overflow-y-auto"
    >
      {/* Search and Filter Header */}
      <div className="space-y-3 sticky top-0 bg-dark-bg pb-3 z-10">
        {/* Search bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search synths by name, description, or use case..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2 text-sm bg-dark-bgSecondary border border-dark-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Category filter tabs */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1 text-xs rounded-full border transition-all ${
              selectedCategory === null
                ? 'bg-accent-primary text-dark-bg border-accent-primary'
                : 'bg-dark-bgSecondary text-text-secondary border-dark-border hover:border-text-muted'
            }`}
          >
            All ({SYNTH_CATEGORIES.reduce((sum, cat) => sum + cat.synths.filter(s => s?.icon).length, 0)})
          </button>
          {SYNTH_CATEGORIES.map(cat => {
            const count = cat.synths.filter(s => s?.icon).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                className={`px-3 py-1 text-xs rounded-full border transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-accent-primary text-dark-bg border-accent-primary'
                    : 'bg-dark-bgSecondary text-text-secondary border-dark-border hover:border-text-muted'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Results count */}
        {(searchQuery || selectedCategory) && (
          <div className="text-xs text-text-muted">
            Showing {totalVisibleSynths} synth{totalVisibleSynths !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
            {selectedCategory && ` in ${SYNTH_CATEGORIES.find(c => c.id === selectedCategory)?.name}`}
          </div>
        )}
      </div>

      {/* Categories and Synths */}
      {filteredCategories.map((category) => (
        <div key={category.id}>
          {/* Category Header */}
          <button
            onClick={() => setExpandedCategory(
              expandedCategory === category.id ? null : category.id
            )}
            className="w-full flex items-center justify-between mb-3 group"
          >
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{category.name}</h3>
              <p className="text-xs text-text-muted">{category.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">{category.synths.length}</span>
              <ChevronRight
                size={16}
                className={`
                  text-text-muted transition-transform
                  ${expandedCategory === category.id ? 'rotate-90' : ''}
                `}
              />
            </div>
          </button>

          {/* Category Synths */}
          {(expandedCategory === category.id || expandedCategory === null) && (
            <div className="grid grid-cols-2 gap-3">
              {category.synths.map((synth) => {
                const isSelected = currentInstrument?.synthType === synth.type;
                return renderSynthCard(synth, isSelected);
              })}
            </div>
          )}
        </div>
      ))}

      {/* No results */}
      {filteredCategories.length === 0 && (
        <div className="text-center py-8 text-text-muted">
          <p className="text-sm">No synths found</p>
          <p className="text-xs mt-1">Try a different search term or category</p>
          <button
            onClick={() => { setSearchQuery(''); setSelectedCategory(null); }}
            className="mt-3 px-4 py-1.5 text-xs bg-dark-bgSecondary border border-dark-border rounded-lg hover:border-text-muted"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Synth Info Panel (when hovering) */}
      {hoveredSynth && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-dark-bgTertiary border border-dark-border rounded-lg p-3 shadow-xl z-50 max-w-sm">
          {(() => {
            const info = getSynthInfo(hoveredSynth);
            if (!info || !info.icon) return null;
            const IconComponent = getIcon(info.icon);
            return (
              <div className="flex gap-3">
                <div className={`p-2 rounded-md bg-dark-bg ${info.color}`}>
                  <IconComponent size={20} />
                </div>
                <div>
                  <h4 className="font-medium text-text-primary">{info.name}</h4>
                  <p className="text-xs text-text-secondary">{info.description}</p>
                  <p className="text-[10px] text-text-muted mt-1">
                    Best for: {info.bestFor.join(', ')}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
