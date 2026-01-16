/**
 * CategorizedSynthSelector - Grouped synth picker with descriptions and guidance
 * Replaces the flat grid with organized categories
 */

import React, { useState } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { SYNTH_CATEGORIES, getSynthInfo, type SynthInfo, type SynthCategory } from '@constants/synthCategories';
import type { SynthType } from '@typedefs/instrument';
import * as LucideIcons from 'lucide-react';
import { Check, ChevronRight } from 'lucide-react';

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
  const { currentInstrument, updateInstrument } = useInstrumentStore();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [hoveredSynth, setHoveredSynth] = useState<SynthType | null>(null);

  // Get icon component dynamically
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Music2;
  };

  // Handle synth selection
  const handleSelectSynth = (synthType: SynthType) => {
    if (!currentInstrument) return;

    // Update current instrument's synth type
    updateInstrument(currentInstrument.id, {
      synthType,
      // Reset synth-specific configs
      tb303: synthType === 'TB303' ? currentInstrument.tb303 : undefined,
      wavetable: synthType === 'Wavetable' ? currentInstrument.wavetable : undefined,
    });

    onSelect?.(synthType);
  };

  // Render a single synth card
  const renderSynthCard = (synth: SynthInfo, isSelected: boolean) => {
    const IconComponent = getIcon(synth.icon);
    const isHovered = hoveredSynth === synth.type;

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
    const allSynths = SYNTH_CATEGORIES.flatMap(cat => cat.synths);
    const uniqueSynths = Array.from(new Map(allSynths.map(s => [s.type, s])).values());

    return (
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
              <span className={`text-sm ${isSelected ? 'text-accent-primary' : 'text-text-secondary'}`}>
                {synth.shortName}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Full categorized view
  return (
    <div className="space-y-6">
      {SYNTH_CATEGORIES.map((category) => (
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
            <ChevronRight
              size={16}
              className={`
                text-text-muted transition-transform
                ${expandedCategory === category.id ? 'rotate-90' : ''}
              `}
            />
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

      {/* Synth Info Panel (when hovering) */}
      {hoveredSynth && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-dark-bgTertiary border border-dark-border rounded-lg p-3 shadow-xl z-50 max-w-sm">
          {(() => {
            const info = getSynthInfo(hoveredSynth);
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
