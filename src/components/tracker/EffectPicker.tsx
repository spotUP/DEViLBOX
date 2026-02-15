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
  hasFurnaceEffects,
  getAllFurnaceEffects,
} from '@utils/ft2EffectDescriptions';
import { HelpCircle } from 'lucide-react';

interface EffectPickerProps {
  isOpen: boolean;
  position?: { x: number; y: number };
  onSelect: (effTyp: number, eff: number) => void;
  onClose: () => void;
  /** Optional synth type to show platform-specific effects */
  synthType?: string;
}

type ExtendedCategory = EffectCategory | 'chip';

const CATEGORY_LABELS: Record<ExtendedCategory, string> = {
  pitch: 'Pitch',
  volume: 'Volume',
  panning: 'Panning',
  timing: 'Timing',
  global: 'Global',
  sample: 'Sample',
  misc: 'Misc',
  chip: 'Chip',
};

const CATEGORY_ORDER: EffectCategory[] = ['pitch', 'volume', 'panning', 'timing', 'global', 'sample', 'misc'];

// Add chip color to the color map
const EXTENDED_CATEGORY_COLORS: Record<ExtendedCategory, string> = {
  ...EFFECT_CATEGORY_COLORS,
  chip: 'text-pink-400',
};

export const EffectPicker: React.FC<EffectPickerProps> = ({ isOpen, position, onSelect, onClose, synthType }) => {
  const [filter, setFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExtendedCategory | 'all'>('all');
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

  // Check if we have a Furnace synth type
  const showFurnaceEffects = synthType && hasFurnaceEffects(synthType);

  // Collect all effects with their keys (memoized)
  const allEffects = useMemo(() => {
    const effects: (EffectDescription & { key: string; isExtended: boolean; isFurnace: boolean })[] = [];

    // Standard FT2 effects
    Object.entries(FT2_EFFECT_DESCRIPTIONS).forEach(([key, desc]) => {
      effects.push({ ...desc, key, isExtended: false, isFurnace: false });
    });

    // Extended E-commands
    Object.entries(FT2_E_COMMAND_DESCRIPTIONS).forEach(([key, desc]) => {
      effects.push({ ...desc, key, isExtended: true, isFurnace: false });
    });

    // Furnace platform-specific effects (if applicable)
    if (showFurnaceEffects && synthType) {
      const furnaceEffects = getAllFurnaceEffects(synthType);
      furnaceEffects.forEach((desc) => {
        // Extract hex code from command (e.g., "10xx" -> "10")
        const hexCode = desc.command.substring(0, 2);
        effects.push({
          ...desc,
          key: hexCode,
          isExtended: false,
          isFurnace: true,
          category: 'misc' as EffectCategory, // Override for filtering - chip effects shown in "Chip" tab
        });
      });
    }

    return effects;
  }, [showFurnaceEffects, synthType]);

  // Filter effects (memoized on filter/category changes)
  const filtered = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    return allEffects.filter(eff => {
      // Special handling for "chip" category - show only Furnace effects
      if (selectedCategory === 'chip') {
        if (!eff.isFurnace) return false;
      } else if (selectedCategory !== 'all') {
        // For regular categories, exclude Furnace effects (they go in "Chip" tab)
        if (eff.isFurnace) return false;
        if (eff.category !== selectedCategory) return false;
      }
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
    } else if (eff.isFurnace) {
      // Furnace platform effect: key is hex code like "10", "11", etc.
      const effTyp = parseInt(eff.key, 16);
      onSelect(effTyp, 0);
    } else {
      // Regular FT2 effect: parse key as hex
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
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-100">Effect Commands</h3>
            <button
              onClick={() => {
                onClose();
                // We don't have a direct way to open HelpModal from here without a store or prop
                // But we can trigger a global shortcut or use UIStore if we wire it up
                const event = new KeyboardEvent('keydown', { key: '?' });
                window.dispatchEvent(event);
              }}
              className="p-1 text-neutral-500 hover:text-accent-primary transition-colors"
              title="Open full reference"
            >
              <HelpCircle size={14} />
            </button>
          </div>
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
                  : `${EXTENDED_CATEGORY_COLORS[cat]} hover:opacity-80`
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
          {/* Show Chip tab only when Furnace synth is selected */}
          {showFurnaceEffects && (
            <button
              onClick={() => setSelectedCategory('chip')}
              className={`px-2 py-0.5 text-[10px] rounded ${
                selectedCategory === 'chip'
                  ? 'bg-pink-700 text-white'
                  : `${EXTENDED_CATEGORY_COLORS.chip} hover:opacity-80`
              }`}
            >
              {CATEGORY_LABELS.chip} ({synthType?.replace('Furnace', '')})
            </button>
          )}
        </div>

        {/* Effects list */}
        <div className="overflow-y-auto flex-1 p-1">
          {filtered.length === 0 ? (
            <div className="text-center text-neutral-500 text-xs py-4">No effects match</div>
          ) : (
            filtered.map((eff) => {
              const colorClass = eff.isFurnace
                ? EXTENDED_CATEGORY_COLORS.chip
                : EXTENDED_CATEGORY_COLORS[eff.category];
              return (
                <button
                  key={eff.isFurnace ? `f-${eff.key}` : eff.isExtended ? `e-${eff.key}` : `n-${eff.key}`}
                  onClick={() => handleSelect(eff)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800 transition-colors text-left group"
                >
                  <span className={`font-mono text-xs font-bold w-8 ${colorClass}`}>
                    {eff.command.substring(0, 3)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-neutral-200 truncate">
                      {eff.name}
                      {eff.isFurnace && <span className="ml-1 text-[9px] text-pink-400">(Chip)</span>}
                    </div>
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
