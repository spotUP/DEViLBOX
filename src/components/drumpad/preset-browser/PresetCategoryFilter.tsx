/**
 * PresetCategoryFilter — Horizontal pill buttons for category filtering
 */

import React from 'react';
import type { PresetCategory } from '../types/preset';

interface PresetCategoryFilterProps {
  selectedCategory: PresetCategory | 'all';
  onSelectCategory: (category: PresetCategory | 'all') => void;
  categoryCounts: Record<PresetCategory | 'all', number>;
}

const CATEGORIES: { id: PresetCategory | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '🎵' },
  { id: 'speech', label: 'Speech', icon: '🗣️' },
  { id: 'bass', label: 'Bass', icon: '🎸' },
  { id: 'lead', label: 'Lead', icon: '🎹' },
  { id: 'drums-perc', label: 'Drums', icon: '🥁' },
  { id: 'chip', label: 'Chip', icon: '🎮' },
  { id: 'fx', label: 'FX', icon: '✨' },
  { id: 'vintage', label: 'Vintage', icon: '📻' },
  { id: 'modern', label: 'Modern', icon: '🔮' },
];

export const PresetCategoryFilter: React.FC<PresetCategoryFilterProps> = ({
  selectedCategory,
  onSelectCategory,
  categoryCounts
}) => {
  return (
    <div className="flex flex-wrap gap-1">
      {CATEGORIES.map((category) => {
        const count = categoryCounts[category.id] || 0;
        const isActive = selectedCategory === category.id;
        
        if (count === 0 && category.id !== 'all') return null;

        return (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            className={`
              flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono font-bold
              transition-all duration-150 border
              ${isActive
                ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40'
                : 'bg-dark-bgTertiary text-text-muted border-dark-border hover:bg-dark-bgHover hover:text-text-primary'
              }
            `}
          >
            <span>{category.label}</span>
            <span className={`
              px-1 py-px rounded text-[9px]
              ${isActive ? 'bg-accent-primary/20 text-accent-primary' : 'bg-dark-bg text-text-muted'}
            `}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};
