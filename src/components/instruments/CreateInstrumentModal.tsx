/**
 * CreateInstrumentModal - Compact modal for creating new instruments
 * Single view with synth selection, parameters preview, and name input
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { SYNTH_INFO, ALL_SYNTH_TYPES, getSynthInfo } from '@constants/synthCategories';
import { VisualTB303Editor } from './VisualTB303Editor';
import { VisualSynthEditor } from './VisualSynthEditor';
import { TestKeyboard } from './TestKeyboard';
import * as LucideIcons from 'lucide-react';
import { X, Check, Search } from 'lucide-react';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';
import {
  DEFAULT_OSCILLATOR,
  DEFAULT_ENVELOPE,
  DEFAULT_FILTER,
  DEFAULT_TB303,
  DEFAULT_DRUM_MACHINE,
} from '@typedefs/instrument';
import { ToneEngine } from '@engine/ToneEngine';

interface CreateInstrumentModalProps {
  onClose: () => void;
}

export const CreateInstrumentModal: React.FC<CreateInstrumentModalProps> = ({ onClose }) => {
  const { createInstrument, updateInstrument, setPreviewInstrument } = useInstrumentStore();

  const [selectedSynthType, setSelectedSynthType] = useState<SynthType>('TB303');
  const [synthSearch, setSynthSearch] = useState('');
  const [instrumentName, setInstrumentName] = useState('303 Classic');

  // Create a temporary instrument config for editing
  const [tempInstrument, setTempInstrument] = useState<InstrumentConfig>(() => createTempInstrument('TB303'));

  // Set preview instrument for MIDI keyboard to use
  useEffect(() => {
    setPreviewInstrument(tempInstrument);
    return () => setPreviewInstrument(null);
  }, [tempInstrument, setPreviewInstrument]);

  // Get icon component dynamically
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Music2;
  };

  // Filter synths based on search
  const filteredSynths = ALL_SYNTH_TYPES.filter((synthType) => {
    if (!synthSearch.trim()) return true;
    const synth = SYNTH_INFO[synthType];
    const query = synthSearch.toLowerCase();
    return (
      synth.name.toLowerCase().includes(query) ||
      synth.shortName.toLowerCase().includes(query) ||
      synth.description.toLowerCase().includes(query) ||
      synth.bestFor.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  // Handle synth type selection
  const handleSelectSynth = (synthType: SynthType) => {
    // Invalidate the cached temp instrument so a new one is created with the new synth type
    ToneEngine.getInstance().invalidateInstrument(-1);

    setSelectedSynthType(synthType);
    setTempInstrument(createTempInstrument(synthType));
    setInstrumentName(getSynthInfo(synthType).name);
  };

  // Handle saving the instrument
  const handleSave = () => {
    // Clear preview instrument before closing
    setPreviewInstrument(null);

    // Create the actual instrument
    const newId = createInstrument();

    // Update it with our configured values
    updateInstrument(newId, {
      ...tempInstrument,
      name: instrumentName,
    });

    onClose();
  };

  // Handle close without saving
  const handleClose = () => {
    setPreviewInstrument(null);
    onClose();
  };

  // Update temp instrument
  const handleUpdateInstrument = useCallback((updates: Partial<InstrumentConfig>) => {
    setTempInstrument((prev) => ({ ...prev, ...updates }));
  }, []);

  // Handle TB303 changes
  const handleTB303Change = useCallback((config: Partial<typeof tempInstrument.tb303>) => {
    if (!tempInstrument.tb303) return;
    setTempInstrument((prev) => ({
      ...prev,
      tb303: { ...prev.tb303!, ...config },
    }));
  }, [tempInstrument.tb303]);

  const synthInfo = getSynthInfo(selectedSynthType);
  const IconComponent = getIcon(synthInfo.icon);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="w-full h-full bg-dark-bg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-dark-bgSecondary border-b border-dark-border shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded ${synthInfo.color} bg-dark-bgTertiary`}>
              <IconComponent size={18} />
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-text-primary font-bold text-sm">CREATE INSTRUMENT</h2>
              <input
                type="text"
                value={instrumentName}
                onChange={(e) => setInstrumentName(e.target.value)}
                className="px-3 py-1 text-sm bg-dark-bg border border-dark-border text-text-primary rounded focus:border-accent-primary focus:outline-none font-mono"
                placeholder="Instrument name..."
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!instrumentName.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm font-bold hover:bg-green-500 transition-colors rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={14} />
              Create
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary rounded transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Synth Selection */}
          <div className="w-64 shrink-0 bg-dark-bgSecondary border-r border-dark-border flex flex-col">
            {/* Search */}
            <div className="p-2 border-b border-dark-border">
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={synthSearch}
                  onChange={(e) => setSynthSearch(e.target.value)}
                  placeholder="Search synths..."
                  className="w-full pl-7 pr-2 py-1.5 text-xs bg-dark-bg border border-dark-border text-text-primary rounded focus:border-accent-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Synth List */}
            <div className="flex-1 overflow-y-auto scrollbar-modern">
              {filteredSynths.map((synthType) => {
                const synth = SYNTH_INFO[synthType];
                const SynthIcon = getIcon(synth.icon);
                const isSelected = selectedSynthType === synthType;

                return (
                  <button
                    key={synthType}
                    onClick={() => handleSelectSynth(synthType)}
                    className={`
                      w-full px-2 py-1.5 text-left transition-all flex items-center gap-2 border-b border-dark-border
                      ${isSelected
                        ? 'bg-accent-primary text-dark-bg'
                        : 'hover:bg-dark-bgTertiary'
                      }
                    `}
                  >
                    <SynthIcon size={14} className={isSelected ? 'text-dark-bg' : synth.color} />
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold text-xs truncate ${isSelected ? 'text-dark-bg' : 'text-text-primary'}`}>
                        {synth.shortName}
                      </div>
                      <div className={`text-[10px] truncate ${isSelected ? 'text-dark-bg/70' : 'text-text-muted'}`}>
                        {synth.bestFor[0]}
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredSynths.length === 0 && (
                <div className="text-center py-4 text-text-muted text-xs">
                  No synths found
                </div>
              )}
            </div>
          </div>

          {/* Right: Editor + Keyboard */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Editor */}
            <div className="flex-1 overflow-y-auto scrollbar-modern">
              {tempInstrument.synthType === 'TB303' && tempInstrument.tb303 ? (
                <VisualTB303Editor config={tempInstrument.tb303} onChange={handleTB303Change} />
              ) : (
                <VisualSynthEditor
                  instrument={tempInstrument}
                  onChange={handleUpdateInstrument}
                />
              )}
            </div>

            {/* Test Keyboard */}
            <div className="p-2 border-t border-dark-border bg-dark-bgSecondary shrink-0">
              <TestKeyboard instrument={tempInstrument} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Create a temporary instrument config for a given synth type
 */
function createTempInstrument(synthType: SynthType): InstrumentConfig {
  const base: InstrumentConfig = {
    id: -1, // Temp ID
    name: getSynthInfo(synthType).name,
    type: 'synth' as const,
    synthType,
    volume: -6,
    pan: 0,
    oscillator: DEFAULT_OSCILLATOR,
    envelope: DEFAULT_ENVELOPE,
    filter: DEFAULT_FILTER,
    effects: [],
  };

  if (synthType === 'TB303') {
    base.tb303 = DEFAULT_TB303;
  }

  if (synthType === 'DrumMachine') {
    base.drumMachine = { ...DEFAULT_DRUM_MACHINE };
  }

  return base;
}
