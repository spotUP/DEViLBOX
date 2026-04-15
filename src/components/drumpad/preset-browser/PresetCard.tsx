/**
 * PresetCard — Visual card for displaying a single preset
 */

import React, { useCallback } from 'react';
import type { PresetMetadata } from '../types/preset';

interface PresetCardProps {
  preset: PresetMetadata;
  onSelect: (preset: PresetMetadata) => void;
  isActive?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  speech: 'bg-accent-primary/20 text-accent-primary border-accent-primary/30',
  bass: 'bg-accent-info/20 text-accent-info border-accent-info/30',
  lead: 'bg-accent-info/20 text-accent-info border-accent-info/30',
  pad: 'bg-accent-primary/20 text-accent-primary border-accent-primary/30',
  'drums-kick': 'bg-accent-error/20 text-accent-error border-accent-error/30',
  'drums-snare': 'bg-accent-error/20 text-accent-error border-accent-error/30',
  'drums-hihat': 'bg-accent-error/20 text-accent-error border-accent-error/30',
  'drums-perc': 'bg-accent-error/20 text-accent-error border-accent-error/30',
  chip: 'bg-accent-success/20 text-accent-success border-accent-success/30',
  fx: 'bg-accent-warning/20 text-accent-warning border-accent-warning/30',
  vintage: 'bg-accent-warning/20 text-accent-warning border-accent-warning/30',
  modern: 'bg-accent-success/20 text-accent-success border-accent-success/30',
};

export const PresetCard: React.FC<PresetCardProps> = ({ preset, onSelect, isActive }) => {
  const handleClick = useCallback(() => {
    onSelect(preset);
  }, [preset, onSelect]);

  const categoryColor = CATEGORY_COLORS[preset.category] || 'bg-dark-bgTertiary text-text-muted border-dark-borderLight';

  return (
    <div
      onClick={handleClick}
      className={`
        relative flex items-center gap-3 px-3 py-2.5 rounded-md border cursor-pointer
        transition-all duration-150
        ${isActive 
          ? 'bg-accent-primary/10 border-accent-primary' 
          : 'bg-dark-bgSecondary border-dark-border hover:border-accent-primary/50 hover:bg-dark-bgTertiary'
        }
      `}
    >
      {/* Category Badge */}
      <div className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${categoryColor}`}>
        {preset.category.replace('-', ' ').toUpperCase()}
      </div>

      {/* Preset Info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono font-bold text-text-primary truncate" title={preset.name}>
          {preset.name}
        </div>
        <div className="text-[10px] font-mono text-text-muted truncate">
          {preset.synthType}{preset.description ? ` — ${preset.description}` : ''}
        </div>
      </div>

      {/* Tags */}
      {preset.tags && preset.tags.length > 0 && (
        <div className="hidden sm:flex gap-1 shrink-0">
          {preset.tags.slice(0, 2).map((tag, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 text-[9px] font-mono bg-dark-bgTertiary text-text-muted rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Active Indicator */}
      {isActive && (
        <div className="shrink-0 w-2 h-2 bg-accent-primary rounded-full" />
      )}
    </div>
  );
};
