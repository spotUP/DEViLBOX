/**
 * CreateInstrumentModal - Full-screen modal for creating new instruments
 * Step 1: Pick synth type, Step 2: Edit parameters, Step 3: Name and save
 */

import React, { useState, useCallback } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { SYNTH_INFO, ALL_SYNTH_TYPES, getSynthInfo } from '@constants/synthCategories';
import { TB303Editor } from './TB303Editor';
import { GenericSynthEditor } from './GenericSynthEditor';
import { TestKeyboard } from './TestKeyboard';
import * as LucideIcons from 'lucide-react';
import { X, ChevronRight, ChevronLeft, Check, Search } from 'lucide-react';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';
import {
  DEFAULT_OSCILLATOR,
  DEFAULT_ENVELOPE,
  DEFAULT_FILTER,
  DEFAULT_TB303,
} from '@typedefs/instrument';

interface CreateInstrumentModalProps {
  onClose: () => void;
}

type Step = 'select-synth' | 'edit-params' | 'name-save';

export const CreateInstrumentModal: React.FC<CreateInstrumentModalProps> = ({ onClose }) => {
  const { createInstrument, updateInstrument } = useInstrumentStore();

  const [step, setStep] = useState<Step>('select-synth');
  const [selectedSynthType, setSelectedSynthType] = useState<SynthType>('Synth');
  const [synthSearch, setSynthSearch] = useState('');
  const [instrumentName, setInstrumentName] = useState('New Instrument');

  // Create a temporary instrument config for editing
  const [tempInstrument, setTempInstrument] = useState<InstrumentConfig>(() => createTempInstrument('Synth'));

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
    setSelectedSynthType(synthType);
    setTempInstrument(createTempInstrument(synthType));
    setInstrumentName(getSynthInfo(synthType).name);
  };

  // Handle moving to edit step
  const handleContinueToEdit = () => {
    setStep('edit-params');
  };

  // Handle saving the instrument
  const handleSave = () => {
    // Create the actual instrument
    const newId = createInstrument();

    // Update it with our configured values
    updateInstrument(newId, {
      ...tempInstrument,
      name: instrumentName,
    });

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-[90vw] max-w-4xl h-[85vh] bg-ft2-bg border-2 border-ft2-border rounded-lg flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-ft2-header border-b-2 border-ft2-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded ${synthInfo.color} bg-ft2-bg`}>
              <IconComponent size={20} />
            </div>
            <div>
              <h2 className="text-ft2-highlight font-bold text-sm">CREATE NEW INSTRUMENT</h2>
              <p className="text-ft2-textDim text-xs">
                {step === 'select-synth' && 'Step 1: Choose a synth engine'}
                {step === 'edit-params' && 'Step 2: Customize your sound'}
                {step === 'name-save' && 'Step 3: Name and save'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ft2-textDim hover:text-ft2-text hover:bg-ft2-border rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Step 1: Select Synth */}
          {step === 'select-synth' && (
            <div className="flex-1 overflow-y-auto p-4">
              {/* Search */}
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ft2-textDim" />
                <input
                  type="text"
                  value={synthSearch}
                  onChange={(e) => setSynthSearch(e.target.value)}
                  placeholder="Search synths... (bass, pad, 808, lead)"
                  className="w-full pl-10 pr-4 py-2 bg-ft2-header border border-ft2-border text-ft2-text rounded focus:border-ft2-highlight focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Synth Grid */}
              <div className="grid grid-cols-4 gap-2">
                {filteredSynths.map((synthType) => {
                  const synth = SYNTH_INFO[synthType];
                  const SynthIcon = getIcon(synth.icon);
                  const isSelected = selectedSynthType === synthType;

                  return (
                    <button
                      key={synthType}
                      onClick={() => handleSelectSynth(synthType)}
                      className={`
                        p-3 rounded border-2 text-left transition-all
                        ${isSelected
                          ? 'bg-ft2-cursor text-ft2-bg border-ft2-cursor'
                          : 'bg-ft2-header border-ft2-border hover:border-ft2-highlight'
                        }
                      `}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <SynthIcon size={16} className={isSelected ? 'text-ft2-bg' : synth.color} />
                        <span className={`font-bold text-sm ${isSelected ? 'text-ft2-bg' : 'text-ft2-text'}`}>
                          {synth.shortName}
                        </span>
                      </div>
                      <p className={`text-xs ${isSelected ? 'text-ft2-bg/80' : 'text-ft2-textDim'}`}>
                        {synth.bestFor.slice(0, 2).join(', ')}
                      </p>
                    </button>
                  );
                })}
              </div>

              {filteredSynths.length === 0 && (
                <div className="text-center py-8 text-ft2-textDim">
                  No synths match "{synthSearch}"
                </div>
              )}

              {/* Selected Synth Info */}
              <div className="mt-4 p-4 bg-ft2-header border border-ft2-border rounded">
                <div className="flex items-center gap-3 mb-2">
                  <IconComponent size={24} className={synthInfo.color} />
                  <div>
                    <h3 className="font-bold text-ft2-text">{synthInfo.name}</h3>
                    <p className="text-xs text-ft2-textDim">{synthInfo.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {synthInfo.bestFor.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-xs rounded bg-ft2-bg text-ft2-textDim">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Edit Parameters */}
          {step === 'edit-params' && (
            <div className="flex-1 overflow-y-auto">
              {tempInstrument.synthType === 'TB303' && tempInstrument.tb303 ? (
                <TB303Editor config={tempInstrument.tb303} onChange={handleTB303Change} />
              ) : (
                <GenericSynthEditor
                  instrument={tempInstrument}
                  onChange={handleUpdateInstrument}
                />
              )}

              {/* Test Keyboard */}
              <div className="p-4 border-t border-ft2-border bg-ft2-header">
                <TestKeyboard instrument={tempInstrument} />
              </div>
            </div>
          )}

          {/* Step 3: Name and Save */}
          {step === 'name-save' && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="w-full max-w-md space-y-6">
                <div className="text-center">
                  <div className={`inline-flex p-4 rounded-full bg-ft2-header ${synthInfo.color} mb-4`}>
                    <IconComponent size={48} />
                  </div>
                  <h3 className="text-xl font-bold text-ft2-text mb-2">Name Your Instrument</h3>
                  <p className="text-ft2-textDim text-sm">Give your {synthInfo.name} a memorable name</p>
                </div>

                <input
                  type="text"
                  value={instrumentName}
                  onChange={(e) => setInstrumentName(e.target.value)}
                  className="w-full px-4 py-3 text-lg bg-ft2-header border-2 border-ft2-border text-ft2-text rounded focus:border-ft2-cursor focus:outline-none text-center font-bold"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && instrumentName.trim()) {
                      handleSave();
                    }
                  }}
                />

                <div className="p-4 bg-ft2-header border border-ft2-border rounded">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ft2-textDim">Synth Type:</span>
                    <span className="text-ft2-text font-bold">{synthInfo.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-ft2-textDim">Best for:</span>
                    <span className="text-ft2-text">{synthInfo.bestFor.slice(0, 2).join(', ')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Navigation */}
        <div className="flex items-center justify-between px-4 py-3 bg-ft2-header border-t-2 border-ft2-border">
          <div>
            {step !== 'select-synth' && (
              <button
                onClick={() => setStep(step === 'name-save' ? 'edit-params' : 'select-synth')}
                className="flex items-center gap-2 px-4 py-2 bg-ft2-bg border border-ft2-border text-ft2-text hover:border-ft2-highlight transition-colors rounded"
              >
                <ChevronLeft size={16} />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Step indicators */}
            <div className="flex items-center gap-1 mr-4">
              <div className={`w-2 h-2 rounded-full ${step === 'select-synth' ? 'bg-ft2-cursor' : 'bg-ft2-border'}`} />
              <div className={`w-2 h-2 rounded-full ${step === 'edit-params' ? 'bg-ft2-cursor' : 'bg-ft2-border'}`} />
              <div className={`w-2 h-2 rounded-full ${step === 'name-save' ? 'bg-ft2-cursor' : 'bg-ft2-border'}`} />
            </div>

            {step === 'select-synth' && (
              <button
                onClick={handleContinueToEdit}
                className="flex items-center gap-2 px-4 py-2 bg-ft2-cursor text-ft2-bg font-bold hover:bg-ft2-highlight transition-colors rounded"
              >
                Continue
                <ChevronRight size={16} />
              </button>
            )}

            {step === 'edit-params' && (
              <button
                onClick={() => setStep('name-save')}
                className="flex items-center gap-2 px-4 py-2 bg-ft2-cursor text-ft2-bg font-bold hover:bg-ft2-highlight transition-colors rounded"
              >
                Continue
                <ChevronRight size={16} />
              </button>
            )}

            {step === 'name-save' && (
              <button
                onClick={handleSave}
                disabled={!instrumentName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-bold hover:bg-green-500 transition-colors rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={16} />
                Create Instrument
              </button>
            )}
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

  return base;
}
