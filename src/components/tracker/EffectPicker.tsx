/**
 * EffectPicker - Visual popup for selecting FT2 effect commands
 * Shows all effects organized by category with descriptions
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import {
  FT2_EFFECT_DESCRIPTIONS,
  FT2_E_COMMAND_DESCRIPTIONS,
  EFFECT_CATEGORY_COLORS,
  type EffectCategory,
  type EffectDescription,
} from '@utils/ft2EffectDescriptions';

interface EffectPickerProps {
  isOpen: boolean;
  position?: { x: number; y: number };
  onSelect: (effTyp: number, eff: number) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<EffectCategory, string> = {
  pitch: 'Pitch',
  volume: 'Volume',
  panning: 'Panning',
  timing: 'Timing',
  global: 'Global',
  sample: 'Sample',
  misc: 'Misc',
};

const CATEGORY_ORDER: EffectCategory[] = ['pitch', 'volume', 'panning', 'timing', 'global', 'sample', 'misc'];

export const EffectPicker: React.FC<EffectPickerProps> = ({ isOpen, position, onSelect, onClose }) => {
  const [filter, setFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<EffectCategory | 'all'>('all');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Collect all effects with their keys (memoized - static data)
  const allEffects = useMemo(() => {
    const effects: (EffectDescription & { key: string; isExtended: boolean })[] = [];

    Object.entries(FT2_EFFECT_DESCRIPTIONS).forEach(([key, desc]) => {
      effects.push({ ...desc, key, isExtended: false });
    });

    Object.entries(FT2_E_COMMAND_DESCRIPTIONS).forEach(([key, desc]) => {
      effects.push({ ...desc, key, isExtended: true });
    });

    return effects;
  }, []);

  // Filter effects (memoized on filter/category changes)
  const filtered = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    return allEffects.filter(eff => {
      if (selectedCategory !== 'all' && eff.category !== selectedCategory) return false;
      if (!filter) return true;
      return (
        eff.name.toLowerCase().includes(lowerFilter) ||
        eff.command.toLowerCase().includes(lowerFilter) ||
        eff.description.toLowerCase().includes(lowerFilter)
      );
    });
  }, [allEffects, filter, selectedCategory]);

  if (!isOpen) return null;

  const handleSelect = (eff: typeof allEffects[0]) => {
    // Parse the effect key to get effTyp and eff values
    if (eff.isExtended) {
      // E-command: effTyp = 14 (E), eff = subcommand << 4
      const subCmd = parseInt(eff.key.substring(1), 16);
      onSelect(14, subCmd << 4);
    } else {
      // Regular effect: parse key as hex
      const effTyp = parseInt(eff.key, 16);
      onSelect(effTyp, 0);
    }
    onClose();
  };

  const style: React.CSSProperties = position
    ? {
        position: 'fixed',
        left: Math.max(0, Math.min(position.x, window.innerWidth - 400)),
        top: Math.max(0, Math.min(position.y, window.innerHeight - 500)),
        zIndex: 60,
      }
    : {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 60,
      };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div
        ref={ref}
        className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[380px] max-h-[480px] flex flex-col z-[60]"
        style={style}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
          <h3 className="text-sm font-semibold text-neutral-100">Effect Commands</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-200" aria-label="Close effect picker">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-neutral-800">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search effects..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
            aria-label="Search effects"
          />
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b border-neutral-800">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2 py-0.5 text-[10px] rounded ${
              selectedCategory === 'all'
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            All
          </button>
          {CATEGORY_ORDER.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 text-[10px] rounded ${
                selectedCategory === cat
                  ? 'bg-neutral-700 text-white'
                  : `${EFFECT_CATEGORY_COLORS[cat]} hover:opacity-80`
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Effects list */}
        <div className="overflow-y-auto flex-1 p-1">
          {filtered.length === 0 ? (
            <div className="text-center text-neutral-500 text-xs py-4">No effects match</div>
          ) : (
            filtered.map((eff) => {
              const colorClass = EFFECT_CATEGORY_COLORS[eff.category];
              return (
                <button
                  key={eff.isExtended ? `e-${eff.key}` : `n-${eff.key}`}
                  onClick={() => handleSelect(eff)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800 transition-colors text-left group"
                >
                  <span className={`font-mono text-xs font-bold w-8 ${colorClass}`}>
                    {eff.command.substring(0, 3)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-neutral-200 truncate">{eff.name}</div>
                    <div className="text-[10px] text-neutral-500 truncate">{eff.description}</div>
                  </div>
                  <span className="text-[9px] text-neutral-600 group-hover:text-neutral-400">
                    {eff.tick === 'tick-0' ? 'T0' : eff.tick === 'tick-N' ? 'TN' : 'T*'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};
