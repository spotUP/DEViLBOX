/**
 * EditInstrumentModal - Unified modal for creating and editing instruments
 * Supports both "create" mode (with synth selection) and "edit" mode (direct editing)
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { SYNTH_INFO, ALL_SYNTH_TYPES, getSynthInfo } from '@constants/synthCategories';
import { VisualTB303Editor } from './VisualTB303Editor';
import { VisualSynthEditor } from './VisualSynthEditor';
import { EffectChain } from './EffectChain';
import { TestKeyboard } from './TestKeyboard';
import { SavePresetDialog } from './SavePresetDialog';
import { InstrumentList } from './InstrumentList';
import { CategorizedSynthSelector } from './CategorizedSynthSelector';
import * as LucideIcons from 'lucide-react';
import { X, Check, Search, Settings, Sparkles, Music2, Save, Keyboard, ChevronDown, ChevronUp } from 'lucide-react';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';
import {
  DEFAULT_OSCILLATOR,
  DEFAULT_ENVELOPE,
  DEFAULT_FILTER,
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
} from '@typedefs/instrument';
import { ToneEngine } from '@engine/ToneEngine';

type EditorTab = 'sound' | 'effects' | 'browse';

interface EditInstrumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Start in create mode with synth selection */
  createMode?: boolean;
}

export const EditInstrumentModal: React.FC<EditInstrumentModalProps> = ({
  isOpen,
  onClose,
  createMode = false,
}) => {
  // Use selectors for proper reactivity - don't use the getter!
  const currentInstrumentId = useInstrumentStore(state => state.currentInstrumentId);
  const instruments = useInstrumentStore(state => state.instruments);
  const createInstrument = useInstrumentStore(state => state.createInstrument);
  const updateInstrument = useInstrumentStore(state => state.updateInstrument);
  const setPreviewInstrument = useInstrumentStore(state => state.setPreviewInstrument);
  const setCurrentInstrument = useInstrumentStore(state => state.setCurrentInstrument);

  // Derive currentInstrument from state for proper re-renders
  const currentInstrument = instruments.find(inst => inst.id === currentInstrumentId) || null;

  // Create mode state
  const [isCreating, setIsCreating] = useState(createMode);
  const [selectedSynthType, setSelectedSynthType] = useState<SynthType>('TB303');
  const [synthSearch, setSynthSearch] = useState('');
  const [instrumentName, setInstrumentName] = useState('303 Classic');
  const [tempInstrument, setTempInstrument] = useState<InstrumentConfig | null>(null);

  // Edit mode state
  const [activeTab, setActiveTab] = useState<EditorTab>('sound');
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Reset to create mode when prop changes
  useEffect(() => {
    if (isOpen && createMode) {
      setIsCreating(true);
      setSelectedSynthType('TB303');
      setInstrumentName('303 Classic');
      setTempInstrument(createTempInstrument('TB303'));
    } else if (isOpen && !createMode) {
      setIsCreating(false);
      setTempInstrument(null);
    }
  }, [isOpen, createMode]);

  // Set preview instrument for MIDI keyboard in create mode
  useEffect(() => {
    if (isCreating && tempInstrument) {
      setPreviewInstrument(tempInstrument);
      return () => setPreviewInstrument(null);
    }
  }, [isCreating, tempInstrument, setPreviewInstrument]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

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

  // Handle synth type selection in create mode
  const handleSelectSynth = (synthType: SynthType) => {
    ToneEngine.getInstance().invalidateInstrument(-1);
    setSelectedSynthType(synthType);
    setTempInstrument(createTempInstrument(synthType));
    setInstrumentName(getSynthInfo(synthType).name);
  };

  // Handle saving new instrument
  const handleSaveNew = () => {
    setPreviewInstrument(null);
    const newId = createInstrument();
    if (tempInstrument) {
      updateInstrument(newId, {
        ...tempInstrument,
        name: instrumentName,
      });
    }
    setCurrentInstrument(newId);
    setIsCreating(false);
    setTempInstrument(null);
  };

  // Handle close
  const handleClose = () => {
    setPreviewInstrument(null);
    setIsCreating(false);
    setTempInstrument(null);
    onClose();
  };

  // Update temp instrument in create mode
  const handleUpdateTempInstrument = useCallback((updates: Partial<InstrumentConfig>) => {
    ToneEngine.getInstance().invalidateInstrument(-1);
    setTempInstrument((prev) => prev ? { ...prev, ...updates } : null);
  }, []);

  // Handle TB303 changes in create mode
  const handleTB303Change = useCallback((config: Partial<NonNullable<InstrumentConfig['tb303']>>) => {
    if (!tempInstrument?.tb303) return;
    ToneEngine.getInstance().invalidateInstrument(-1);
    setTempInstrument((prev) => prev ? {
      ...prev,
      tb303: { ...prev.tb303!, ...config },
    } : null);
  }, [tempInstrument?.tb303]);

  // Handle switching to create mode
  const handleStartCreate = () => {
    setIsCreating(true);
    setSelectedSynthType('TB303');
    setInstrumentName('303 Classic');
    setTempInstrument(createTempInstrument('TB303'));
  };

  // Handle synth type change from browse tab
  const handleSynthTypeChange = useCallback((_synthType: SynthType) => {
    setActiveTab('sound');
  }, []);

  if (!isOpen) return null;

  // Get current instrument info
  const instrument = isCreating ? tempInstrument : currentInstrument;
  const synthInfo = instrument?.synthType ? getSynthInfo(instrument.synthType) : getSynthInfo('TB303');
  const IconComponent = getIcon(synthInfo.icon);

  // CREATE MODE UI
  if (isCreating) {
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
            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-900/50 text-red-300 text-sm font-bold hover:bg-red-800/60 hover:text-red-200 transition-colors rounded border border-red-700"
              >
                <X size={14} />
                Cancel
              </button>
              <button
                onClick={handleSaveNew}
                disabled={!instrumentName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-bold hover:bg-green-500 transition-colors rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={14} />
                Add Instrument
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
                {tempInstrument?.synthType === 'TB303' && tempInstrument.tb303 ? (
                  <VisualTB303Editor config={tempInstrument.tb303} onChange={handleTB303Change} />
                ) : tempInstrument ? (
                  <VisualSynthEditor
                    instrument={tempInstrument}
                    onChange={handleUpdateTempInstrument}
                  />
                ) : null}
              </div>

              {/* Test Keyboard */}
              <div className="p-2 border-t border-dark-border bg-dark-bgSecondary shrink-0">
                {tempInstrument && <TestKeyboard instrument={tempInstrument} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // EDIT MODE UI
  if (!currentInstrument) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90">
        <div className="bg-dark-bg w-full h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Music2 size={48} className="mx-auto mb-4 opacity-50 text-text-muted" />
              <p className="text-text-muted mb-4">No instrument selected</p>
              <button
                onClick={handleStartCreate}
                className="flex items-center gap-2 px-4 py-2 bg-accent-primary rounded-lg text-text-inverse hover:bg-accent-primary/80 transition-colors mx-auto"
              >
                <LucideIcons.Plus size={16} />
                Create Instrument
              </button>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="fixed top-3 right-3 z-10 flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-text-muted hover:text-text-primary border border-dark-border"
            title="Close (Escape)"
          >
            <X size={18} />
            <span className="text-sm font-medium">Close</span>
          </button>
        </div>
      </div>
    );
  }

  // Tab definitions
  const tabs = [
    { id: 'sound' as const, label: 'Sound', icon: Settings },
    { id: 'effects' as const, label: 'Effects', icon: Sparkles },
    { id: 'browse' as const, label: 'Browse', icon: Music2 },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/90">
      <div className="bg-dark-bg w-full h-full flex flex-col overflow-hidden">
        <div className="flex h-full">
          {/* Left Sidebar: Instrument List */}
          <div className="w-fit min-w-48 max-w-80 border-r border-dark-border flex-shrink-0 bg-dark-bgSecondary">
            <InstrumentList
              maxHeight="100%"
              showActions={true}
            />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-bgSecondary">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-dark-bg ${synthInfo?.color || 'text-text-primary'}`}>
                  <IconComponent size={20} />
                </div>
                <div>
                  <input
                    type="text"
                    value={currentInstrument.name}
                    onChange={(e) => updateInstrument(currentInstrument.id, { name: e.target.value })}
                    className="bg-transparent text-text-primary font-semibold text-lg focus:outline-none focus:ring-1 focus:ring-accent-primary rounded px-1 -ml-1"
                  />
                  <p className="text-xs text-text-muted">
                    {synthInfo?.name || currentInstrument.synthType} <span className="opacity-50">|</span> ID: {currentInstrument.id.toString(16).toUpperCase().padStart(2, '0')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-bg hover:bg-dark-bgTertiary text-text-primary transition-colors text-sm border border-dark-border"
                  title="Save as preset"
                >
                  <Save size={14} />
                  Save
                </button>
                <button
                  onClick={handleClose}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-bg hover:bg-dark-bgHover transition-colors text-text-muted hover:text-text-primary border border-dark-border"
                  title="Close (Escape)"
                >
                  <X size={18} />
                  <span className="text-sm font-medium">Close</span>
                </button>
              </div>
            </div>

            {/* Tab Bar */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-dark-border bg-dark-bg">
              {tabs.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border
                      ${isActive
                        ? 'bg-dark-bgSecondary text-accent-primary border-accent-primary'
                        : 'text-text-muted hover:text-text-primary hover:bg-dark-bgSecondary border-transparent'
                      }
                    `}
                  >
                    <TabIcon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto scrollbar-modern">
              {activeTab === 'sound' && (
                <div className="overflow-y-auto">
                  {currentInstrument.synthType === 'TB303' && currentInstrument.tb303 ? (
                    <VisualTB303Editor
                      config={currentInstrument.tb303}
                      onChange={(tb303Updates) => updateInstrument(currentInstrument.id, {
                        tb303: { ...currentInstrument.tb303!, ...tb303Updates }
                      })}
                    />
                  ) : (
                    <VisualSynthEditor
                      instrument={currentInstrument}
                      onChange={(updates) => updateInstrument(currentInstrument.id, updates)}
                    />
                  )}
                </div>
              )}

              {activeTab === 'effects' && (
                <div className="p-4">
                  <EffectChain instrumentId={currentInstrument.id} effects={currentInstrument.effects || []} />
                </div>
              )}

              {activeTab === 'browse' && (
                <div className="p-4">
                  <CategorizedSynthSelector onSelect={handleSynthTypeChange} />
                </div>
              )}
            </div>

            {/* Test Keyboard (Collapsible) */}
            <div className="border-t border-dark-border">
              <button
                onClick={() => setShowKeyboard(!showKeyboard)}
                className="w-full px-4 py-2 flex items-center justify-between text-sm text-text-muted hover:text-text-primary hover:bg-dark-bgHover transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Keyboard size={14} />
                  Test Keyboard
                </span>
                {showKeyboard ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>

              {showKeyboard && (
                <div className="p-4 bg-dark-bgSecondary">
                  <TestKeyboard instrument={currentInstrument} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Save Preset Dialog */}
        {showSaveDialog && (
          <SavePresetDialog
            instrument={currentInstrument}
            onClose={() => setShowSaveDialog(false)}
          />
        )}
      </div>
    </div>
  );
};

/**
 * Create a temporary instrument config for a given synth type
 */
function createTempInstrument(synthType: SynthType): InstrumentConfig {
  const base: InstrumentConfig = {
    id: -1,
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

  switch (synthType) {
    case 'TB303':
      base.tb303 = { ...DEFAULT_TB303 };
      break;
    case 'DrumMachine':
      base.drumMachine = { ...DEFAULT_DRUM_MACHINE };
      break;
    case 'ChipSynth':
      base.chipSynth = { ...DEFAULT_CHIP_SYNTH };
      break;
    case 'PWMSynth':
      base.pwmSynth = { ...DEFAULT_PWM_SYNTH };
      break;
    case 'Wavetable':
      base.wavetable = { ...DEFAULT_WAVETABLE };
      break;
    case 'GranularSynth':
      base.granular = { ...DEFAULT_GRANULAR };
      break;
    case 'SuperSaw':
      base.superSaw = { ...DEFAULT_SUPERSAW };
      break;
    case 'PolySynth':
      base.polySynth = { ...DEFAULT_POLYSYNTH };
      break;
    case 'Organ':
      base.organ = { ...DEFAULT_ORGAN };
      break;
    case 'StringMachine':
      base.stringMachine = { ...DEFAULT_STRING_MACHINE };
      break;
    case 'FormantSynth':
      base.formantSynth = { ...DEFAULT_FORMANT_SYNTH };
      break;
  }

  return base;
}
