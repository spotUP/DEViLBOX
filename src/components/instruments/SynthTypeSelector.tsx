/**
 * SynthTypeSelector - Grid of all synth types to choose from
 * Shows all 22 synth engines in a clean grid layout with search
 */

import React, { useState, useMemo } from 'react';
import * as LucideIcons from 'lucide-react';
import { Search, X } from 'lucide-react';
import type { InstrumentConfig, SynthType } from '../../types/instrument';
import { useInstrumentStore } from '../../stores';
import { SYNTH_INFO, ALL_SYNTH_TYPES, getSynthInfo } from '@constants/synthCategories';

interface SynthTypeSelectorProps {
  instrument: InstrumentConfig;
}

export const SynthTypeSelector: React.FC<SynthTypeSelectorProps> = ({ instrument }) => {
  const { updateInstrument } = useInstrumentStore();
  const [searchQuery, setSearchQuery] = useState('');

  // Filter synths based on search query
  const filteredSynths = useMemo(() => {
    if (!searchQuery.trim()) return ALL_SYNTH_TYPES;

    const query = searchQuery.toLowerCase();
    return ALL_SYNTH_TYPES.filter((synthType) => {
      const synth = SYNTH_INFO[synthType];
      return (
        synth.name.toLowerCase().includes(query) ||
        synth.shortName.toLowerCase().includes(query) ||
        synth.description.toLowerCase().includes(query) ||
        synth.bestFor.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [searchQuery]);

  const handleTypeChange = (type: SynthType) => {
    updateInstrument(instrument.id, {
      synthType: type,
      // Reset synth-specific configs when changing type
      tb303: type === 'TB303' ? instrument.tb303 : undefined,
      wavetable: type === 'Wavetable' ? instrument.wavetable : undefined,
    });
  };

  return (
    <div className="bg-dark-bg p-4">
      {/* Search field */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search synths... (e.g. bass, pad, 808)"
          className="w-full pl-9 pr-8 py-2 bg-dark-bgSecondary border border-dark-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:border-accent-primary focus:outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Current selection */}
      <CurrentSynthDisplay instrument={instrument} />


      {/* Results count when searching */}
      {searchQuery && (
        <div className="mb-2 text-xs text-text-muted">
          {filteredSynths.length} {filteredSynths.length === 1 ? 'synth' : 'synths'} found
        </div>
      )}

      {/* All synths grid */}
      <div className="grid grid-cols-3 gap-2">
        {filteredSynths.map((synthType) => (
          <SynthGridItem
            key={synthType}
            synthType={synthType}
            isActive={instrument.synthType === synthType}
            onSelect={handleTypeChange}
          />
        ))}
      </div>

      {/* No results message */}
      {filteredSynths.length === 0 && (
        <div className="text-center py-8 text-text-muted">
          <p>No synths match "{searchQuery}"</p>
          <button
            onClick={() => setSearchQuery('')}
            className="mt-2 text-accent-primary hover:underline text-sm"
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
};

/** Static icon helper to avoid creating components during render */
const SynthIcon: React.FC<{ iconName: string; size: number; className?: string }> = ({ iconName, size, className }) => {
  const Icon = (LucideIcons as unknown as Record<string, LucideIcons.LucideIcon>)[iconName] || LucideIcons.Music2;
  return <Icon size={size} className={className} />;
};

/** Extracted to avoid creating components during render */
const CurrentSynthDisplay: React.FC<{
  instrument: InstrumentConfig;
}> = ({ instrument }) => {
  const info = getSynthInfo(instrument.synthType);
  return (
    <div className="mb-4 p-3 bg-dark-bgSecondary rounded-lg border border-dark-border">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-md bg-dark-bgTertiary ${info.color}`}>
          <SynthIcon iconName={info.icon} size={20} />
        </div>
        <div>
          <span className="text-text-muted text-sm">Current: </span>
          <span className="text-accent-primary font-bold font-mono">{info.name}</span>
          <p className="text-xs text-text-muted">{info.description}</p>
        </div>
      </div>
    </div>
  );
};

/** Extracted to avoid creating components during render */
const SynthGridItem: React.FC<{
  synthType: SynthType;
  isActive: boolean;
  onSelect: (type: SynthType) => void;
}> = ({ synthType, isActive, onSelect }) => {
  const synth = SYNTH_INFO[synthType];
  return (
    <button
      onClick={() => onSelect(synthType)}
      className={`
        p-3 border rounded-lg transition-all text-left
        ${isActive
          ? 'bg-accent-primary/15 border-accent-primary'
          : 'bg-dark-bgSecondary border-dark-border hover:border-dark-borderLight hover:bg-dark-bgHover'
        }
      `}
    >
      <div className="flex items-center gap-2 mb-1">
        <SynthIcon iconName={synth.icon} size={16} className={isActive ? 'text-accent-primary' : synth.color} />
        <span className={`font-mono text-xs font-bold ${isActive ? 'text-accent-primary' : 'text-text-primary'}`}>
          {synth.shortName}
        </span>
      </div>
      <div className={`text-[10px] leading-tight ${isActive ? 'text-accent-primary/80' : 'text-text-muted'}`}>
        {synth.bestFor.slice(0, 2).join(', ')}
      </div>
    </button>
  );
};
