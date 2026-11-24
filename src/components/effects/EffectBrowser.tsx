/**
 * EffectBrowser - the one effect picker (group select + search + grouped list).
 * Used by the master FX modal and the per-instrument FX panel.
 */
import React, { useMemo, useState } from 'react';
import { X, Search, Cpu, Globe } from 'lucide-react';
import { getEffectsByGroup, type AvailableEffect } from '@constants/unifiedEffects';

export interface EffectBrowserProps {
  onSelect: (effect: AvailableEffect) => void;
  compact?: boolean;
}

export const EffectBrowser: React.FC<EffectBrowserProps> = ({ onSelect, compact = false }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  const effectsByGroup = getEffectsByGroup();
  const allGroupNames = useMemo(() => Object.keys(effectsByGroup).sort(), [effectsByGroup]);
  const filteredEffectsByGroup = useMemo(() => {
    const source: typeof effectsByGroup =
      selectedGroup === 'all' ? effectsByGroup : { [selectedGroup]: effectsByGroup[selectedGroup] ?? [] };
    const q = searchQuery.trim().toLowerCase();
    const filtered: typeof effectsByGroup = {};
    for (const [group, effects] of Object.entries(source)) {
      const matched = q ? effects.filter((e) => e.label.toLowerCase().includes(q)) : effects;
      if (matched.length > 0) filtered[group] = matched;
    }
    return filtered;
  }, [effectsByGroup, searchQuery, selectedGroup]);

  const inputText = compact ? 'text-xs' : 'text-sm';

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className={`${compact ? 'p-2' : 'p-4'} border-b border-dark-border bg-dark-bgSecondary space-y-2 shrink-0`}>
        {!compact && <h3 className="text-sm font-bold text-text-primary">Effect Browser</h3>}
        <select
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="w-full py-1.5 px-2 text-xs bg-dark-bg border border-dark-border rounded-lg text-text-primary
                   focus:outline-none focus:border-accent-primary transition-colors cursor-pointer"
        >
          <option value="all">All Categories</option>
          {allGroupNames.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search effects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-8 py-2 ${inputText} bg-dark-bg border border-dark-border rounded-lg text-text-primary
                     placeholder-text-muted focus:outline-none focus:border-accent-primary transition-colors`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className={`flex-1 overflow-y-auto scrollbar-modern ${compact ? 'p-2' : 'p-3'}`}>
        <div className="space-y-3">
          {Object.keys(filteredEffectsByGroup).length === 0 && (
            <div className="p-6 text-center text-text-muted text-xs">No effects matching "{searchQuery}"</div>
          )}
          {Object.entries(filteredEffectsByGroup).map(([group, groupEffects]) => (
            <div key={group}>
              <h4 className="text-xs text-text-muted font-medium uppercase tracking-wide mb-1.5">{group}</h4>
              <div className="space-y-1">
                {groupEffects.map((effect) => (
                  <button
                    key={effect.label}
                    onClick={() => onSelect(effect)}
                    className={`w-full px-3 ${compact ? 'py-1.5 text-xs' : 'py-2 text-sm'} rounded-lg border border-dark-border bg-dark-bgSecondary
                             hover:bg-accent-primary/80 hover:text-text-primary hover:border-accent-primary
                             transition-colors text-left flex items-center justify-between gap-2`}
                  >
                    <span className="truncate">{effect.label}</span>
                    {effect.category === 'neural' && <Cpu size={12} className="flex-shrink-0 opacity-60" />}
                    {effect.category === 'wam' && <Globe size={12} className="flex-shrink-0 opacity-60" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
