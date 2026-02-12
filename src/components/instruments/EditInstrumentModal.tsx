/**
 * EditInstrumentModal - Unified modal for creating and editing instruments
 * Supports both "create" mode (with synth selection) and "edit" mode (direct editing)
 *
 * Routes to specialized VST-style editors based on synth type:
 * - TB303 → VisualTB303Editor
 * - Furnace/FurnaceXXX → FurnaceEditor
 * - Buzzmachine/BuzzXXX → BuzzmachineEditor
 * - Sampler/Player/GranularSynth → SampleEditor
 * - Everything else → VisualSynthEditor
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { SYNTH_INFO, ALL_SYNTH_TYPES, getSynthInfo } from '@constants/synthCategories';
import { UnifiedInstrumentEditor } from './editors';
import { EffectChain, TestKeyboard, CategorizedSynthSelector } from './shared';
import { SavePresetDialog } from './presets';
import { InstrumentList } from './InstrumentList';
import * as LucideIcons from 'lucide-react';
import { X, Check, Search, Settings, Sparkles, Music2, Save, Keyboard, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { focusPopout } from '@components/ui/PopOutWindow';
import type { InstrumentConfig, SynthType, BuzzmachineType } from '@typedefs/instrument';
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
  DEFAULT_FURNACE,
  DEFAULT_BUZZMACHINE,
  DEFAULT_WOBBLE_BASS,
  DEFAULT_DUB_SIREN,
  DEFAULT_SPACE_LASER,
  DEFAULT_SYNARE,
  DEFAULT_DRUMKIT,
  DEFAULT_SAM,
  DEFAULT_V2,
} from '@typedefs/instrument';
import { ToneEngine } from '@engine/ToneEngine';
import { getFirstPresetForSynthType } from '@constants/factoryPresets';

// ============================================================================
// SYNTH TYPE CATEGORIZATION HELPERS
// ============================================================================

/** Check if synth type uses Furnace chip emulation editor */
function isFurnaceType(synthType: SynthType): boolean {
  return synthType === 'Furnace' || synthType.startsWith('Furnace');
}

/** Check if synth type uses Buzzmachine editor */
function isBuzzmachineType(synthType: SynthType): boolean {
  return synthType === 'Buzzmachine' || synthType.startsWith('Buzz');
}

type EditorTab = 'sound' | 'effects';

/** Static sub-component to avoid creating icon components during render */
const SynthIconDisplay: React.FC<{ iconName: string; size: number }> = ({ iconName, size }) => {
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[iconName] || LucideIcons.Music2;
  return React.createElement(Icon, { size });
};

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
  const instruments = useInstrumentStore((state) => state.instruments);
  const currentInstrumentId = useInstrumentStore((state) => state.currentInstrumentId);
  const createInstrument = useInstrumentStore((state) => state.createInstrument);
  const updateInstrument = useInstrumentStore((state) => state.updateInstrument);
  const setPreviewInstrument = useInstrumentStore((state) => state.setPreviewInstrument);
  const setCurrentInstrument = useInstrumentStore((state) => state.setCurrentInstrument);

  // Compute currentInstrument from instruments and currentInstrumentId
  const currentInstrument = instruments.find((inst) => inst.id === currentInstrumentId) || null;

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
  const [showSynthBrowser, setShowSynthBrowser] = useState(false);

  // Left panel collapsed state (persisted)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('devilbox-editor-left-panel-collapsed');
      return saved === null ? true : saved === 'true'; // Default collapsed
    } catch {
      return true;
    }
  });

  // Persist left panel state
  useEffect(() => {
    try {
      localStorage.setItem('devilbox-editor-left-panel-collapsed', String(leftPanelCollapsed));
    } catch {
      // Ignore storage errors
    }
  }, [leftPanelCollapsed]);

  // Reset to create mode when prop changes
  useEffect(() => {
    requestAnimationFrame(() => {
      if (isOpen && createMode) {
        setIsCreating(true);
        setSelectedSynthType('TB303');
        setInstrumentName('303 Classic');
        setTempInstrument(createTempInstrument('TB303'));
      } else if (isOpen && !createMode) {
        if (instruments.length === 0) {
          // No instruments exist - auto-enter create mode
          setIsCreating(true);
          setSelectedSynthType('TB303');
          setInstrumentName('303 Classic');
          setTempInstrument(createTempInstrument('TB303'));
        } else if (!currentInstrument) {
          // Instruments exist but none selected - select first one
          setIsCreating(false);
          setTempInstrument(null);
          setCurrentInstrument(instruments[0].id);
        } else {
          // Instrument already selected - just edit it
          setIsCreating(false);
          setTempInstrument(null);
        }
      }
    });
  }, [isOpen, createMode, currentInstrument, instruments, setCurrentInstrument]);

  // Set preview instrument for MIDI keyboard in create mode
  useEffect(() => {
    if (isCreating && tempInstrument) {
      setPreviewInstrument(tempInstrument);
      return () => setPreviewInstrument(null);
    }
  }, [isCreating, tempInstrument, setPreviewInstrument]);

  // Handle close
  const handleClose = () => {
    setPreviewInstrument(null);
    setIsCreating(false);
    setTempInstrument(null);
    onClose();
  };

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
  }, [isOpen, handleClose]);

  // getIcon removed - using SynthIconDisplay sub-component at module scope instead

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

  // Handle pop-out: close modal and open in separate window, or focus existing
  const handlePopOut = () => {
    const alreadyPoppedOut = useUIStore.getState().instrumentEditorPoppedOut;
    if (alreadyPoppedOut) {
      focusPopout('DEViLBOX — Instrument Editor');
      onClose();
      return;
    }
    setPreviewInstrument(null);
    setIsCreating(false);
    setTempInstrument(null);
    onClose();
    useUIStore.getState().setInstrumentEditorPoppedOut(true);
  };

  // Update temp instrument in create mode
  const handleUpdateTempInstrument = useCallback((updates: Partial<InstrumentConfig>) => {
    ToneEngine.getInstance().invalidateInstrument(-1);
    setTempInstrument((prev) => prev ? { ...prev, ...updates } : null);
  }, []);

  // Handle switching to create mode
  const handleStartCreate = () => {
    setIsCreating(true);
    setSelectedSynthType('TB303');
    setInstrumentName('303 Classic');
    setTempInstrument(createTempInstrument('TB303'));
  };

  // Handle synth type change from browse tab
  const handleSynthTypeChange = useCallback(() => {
    setActiveTab('sound');
  }, [setActiveTab]) as (synthType: SynthType) => void;

  // Navigate to previous/next instrument
  const sortedInstruments = [...instruments].sort((a, b) => a.id - b.id);
  const currentIndex = sortedInstruments.findIndex((i) => i.id === currentInstrumentId);

  const handlePrevInstrument = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentInstrument(sortedInstruments[currentIndex - 1].id);
    } else if (sortedInstruments.length > 0) {
      // Wrap to last instrument
      setCurrentInstrument(sortedInstruments[sortedInstruments.length - 1].id);
    }
  }, [currentIndex, sortedInstruments, setCurrentInstrument]);

  const handleNextInstrument = useCallback(() => {
    if (currentIndex < sortedInstruments.length - 1) {
      setCurrentInstrument(sortedInstruments[currentIndex + 1].id);
    } else if (sortedInstruments.length > 0) {
      // Wrap to first instrument
      setCurrentInstrument(sortedInstruments[0].id);
    }
  }, [currentIndex, sortedInstruments, setCurrentInstrument]);

  if (!isOpen) return null;

  // Get current instrument info
  const instrument = isCreating ? tempInstrument : currentInstrument;
  const synthInfo = instrument?.synthType ? getSynthInfo(instrument.synthType) : getSynthInfo('TB303');
  // Icon rendered via SynthIconDisplay sub-component (module scope)

  // CREATE MODE UI
  if (isCreating) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="w-full h-full bg-dark-bg flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-dark-bgSecondary border-b border-dark-border shrink-0">
            <div className="flex items-center gap-3">
              <div className={`p-1.5 rounded ${synthInfo.color} bg-dark-bgTertiary`}>
                <SynthIconDisplay iconName={synthInfo.icon} size={18} />
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
                      <SynthIconDisplay iconName={synth.icon} size={14} />
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
              {/* Editor - Route to specialized editor based on synth type */}
              <div className="flex-1 overflow-y-auto scrollbar-modern">
                {tempInstrument && (
                  <InstrumentEditor
                    instrument={tempInstrument}
                    onChange={handleUpdateTempInstrument}
                  />
                )}
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

  // Tab definitions
  const tabs = [
    { id: 'sound' as const, label: 'Sound', icon: Settings },
    { id: 'effects' as const, label: 'Effects', icon: Sparkles },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/90">
      <div className="bg-dark-bg w-full h-full flex flex-col overflow-hidden">
        <div className="flex h-full">
          {/* Left Sidebar: Instrument List (Collapsible) */}
          <div className={`border-r border-dark-border flex-shrink-0 bg-dark-bgSecondary transition-all duration-200 ${leftPanelCollapsed ? 'w-8' : 'w-52'}`}>
            {leftPanelCollapsed ? (
              // Collapsed state - just show expand button
              <button
                onClick={() => setLeftPanelCollapsed(false)}
                className="w-full h-full flex items-start justify-center pt-3 text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary transition-colors"
                title="Show instrument list"
              >
                <ChevronRight size={16} />
              </button>
            ) : (
              // Expanded state - show instrument list with collapse button
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-2 py-1 border-b border-dark-border">
                  <span className="text-xs font-medium text-text-muted">Instruments</span>
                  <button
                    onClick={() => setLeftPanelCollapsed(true)}
                    className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary rounded transition-colors"
                    title="Hide instrument list"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <InstrumentList
                    maxHeight="100%"
                    showActions={true}
                    onCreateNew={handleStartCreate}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {currentInstrument ? (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-bgSecondary">
                  <div className="flex items-center gap-2">
                    {/* Previous Instrument Button */}
                    <button
                      onClick={handlePrevInstrument}
                      className="p-1.5 rounded hover:bg-dark-bgTertiary text-text-muted hover:text-text-primary transition-colors"
                      title="Previous instrument"
                    >
                      <ChevronLeft size={20} />
                    </button>

                    <div className={`p-2 rounded-lg bg-dark-bg ${synthInfo?.color || 'text-text-primary'}`}>
                      <SynthIconDisplay iconName={synthInfo.icon} size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={currentInstrument.name}
                          onChange={(e) => updateInstrument(currentInstrument.id, { name: e.target.value })}
                          className="bg-transparent text-text-primary font-semibold text-lg focus:outline-none focus:ring-1 focus:ring-accent-primary rounded px-1 -ml-1"
                        />
                        <span className="text-xs text-text-muted font-mono">
                          ({currentIndex + 1}/{sortedInstruments.length})
                        </span>
                      </div>
                      <p className="text-xs text-text-muted">
                        {synthInfo?.name || currentInstrument.synthType} <span className="opacity-50">|</span> ID: {currentInstrument.id.toString(16).toUpperCase().padStart(2, '0')}
                      </p>
                    </div>

                    {/* Next Instrument Button */}
                    <button
                      onClick={handleNextInstrument}
                      className="p-1.5 rounded hover:bg-dark-bgTertiary text-text-muted hover:text-text-primary transition-colors"
                      title="Next instrument"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowSynthBrowser(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-bg hover:bg-dark-bgTertiary text-text-primary transition-colors text-sm border border-dark-border"
                      title="Change synth type"
                    >
                      <Music2 size={14} />
                      Browse Synths
                    </button>
                    <button
                      onClick={() => setShowSaveDialog(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-bg hover:bg-dark-bgTertiary text-text-primary transition-colors text-sm border border-dark-border"
                      title="Save as preset"
                    >
                      <Save size={14} />
                      Save
                    </button>
                    <button
                      onClick={handlePopOut}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-bg hover:bg-dark-bgTertiary text-text-primary transition-colors text-sm border border-dark-border"
                      title="Pop out to separate window"
                    >
                      <ExternalLink size={14} />
                      Pop Out
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
                      <InstrumentEditor
                        instrument={currentInstrument}
                        onChange={(updates) => updateInstrument(currentInstrument.id, updates)}
                      />
                    </div>
                  )}

                  {activeTab === 'effects' && (
                    <div className="p-4">
                      <EffectChain instrumentId={currentInstrument.id} effects={currentInstrument.effects || []} />
                    </div>
                  )}
                </div>

                {/* Synth Browser Modal */}
                {showSynthBrowser && (
                  <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center">
                    <div className="bg-dark-bg border border-dark-border rounded-lg shadow-2xl w-[90%] max-w-4xl max-h-[85vh] flex flex-col">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
                        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                          <Music2 size={20} className="text-accent-primary" />
                          Browse Synth Types
                        </h3>
                        <button
                          onClick={() => setShowSynthBrowser(false)}
                          className="p-1.5 rounded hover:bg-dark-bgHover text-text-muted hover:text-text-primary transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <CategorizedSynthSelector
                          onSelect={(type) => {
                            handleSynthTypeChange(type);
                            setShowSynthBrowser(false);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* No instrument selected - show prompt */
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-bgSecondary">
                  <h2 className="text-lg font-semibold text-text-primary">Instrument Editor</h2>
                  <button
                    onClick={handleClose}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-bg hover:bg-dark-bgHover transition-colors text-text-muted hover:text-text-primary border border-dark-border"
                    title="Close (Escape)"
                  >
                    <X size={18} />
                    <span className="text-sm font-medium">Close</span>
                  </button>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Music2 size={48} className="mx-auto mb-4 opacity-50 text-text-muted" />
                    <p className="text-text-muted mb-2">No instrument selected</p>
                    <p className="text-text-muted text-sm mb-4">Select an instrument from the list or create a new one</p>
                    <button
                      onClick={handleStartCreate}
                      className="flex items-center gap-2 px-4 py-2 bg-accent-primary rounded-lg text-text-inverse hover:bg-accent-primary/80 transition-colors mx-auto"
                    >
                      <LucideIcons.Plus size={16} />
                      Create Instrument
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Test Keyboard (Collapsible) - only show when instrument selected */}
            {currentInstrument && (
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
            )}
          </div>
        </div>

        {/* Save Preset Dialog */}
        {showSaveDialog && currentInstrument && (
          <SavePresetDialog
            instrument={currentInstrument}
            onClose={() => setShowSaveDialog(false)}
          />
        )}
      </div>
    </div>
  );
};

// ============================================================================
// INSTRUMENT EDITOR COMPONENT - Uses UnifiedInstrumentEditor
// ============================================================================

interface InstrumentEditorProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

/**
 * InstrumentEditor - Wrapper that renders the UnifiedInstrumentEditor
 *
 * This component provides a clean interface for both create mode and edit mode
 * while delegating all the rendering logic to UnifiedInstrumentEditor.
 */
const InstrumentEditor: React.FC<InstrumentEditorProps> = ({ instrument, onChange }) => {
  return (
    <div className="instrument-editor-wrapper">
      <UnifiedInstrumentEditor
        instrument={instrument}
        onChange={onChange}
      />
    </div>
  );
};

// ============================================================================
// CREATE TEMP INSTRUMENT - Initializes config for any synth type
// ============================================================================

/**
 * Create a temporary instrument config for a given synth type.
 * Always applies the first available factory preset so synths produce
 * musically useful sound out of the box (e.g. V2 needs patch data, MAME chips need _program).
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

  // --- Set type-specific defaults (structural setup) ---

  if (synthType === 'TB303' || synthType === 'Buzz3o3') {
    base.tb303 = { ...DEFAULT_TB303 };
    if (synthType === 'Buzz3o3') {
      base.buzzmachine = {
        ...DEFAULT_BUZZMACHINE,
        machineType: 'OomekAggressor' as BuzzmachineType,
        parameters: {
          0: 0, 1: 0x78, 2: 0x40, 3: 0x40, 4: 0x40, 5: 0x40, 6: 100, 7: 100,
        }
      };
    }
  } else if (isFurnaceType(synthType)) {
    base.furnace = { ...DEFAULT_FURNACE };
    const chipTypeMap: Partial<Record<SynthType, number>> = {
      'Furnace': 1, 'FurnaceOPN': 0, 'FurnaceOPNA': 13, 'FurnaceOPNB': 14,
      'FurnaceOPM': 1, 'FurnaceOPL': 2, 'FurnaceOPLL': 23, 'FurnaceOPL4': 26,
      'FurnaceOPZ': 24, 'FurnaceESFM': 25, 'FurnaceNES': 3, 'FurnaceGB': 4,
      'FurnaceC64': 5, 'FurnaceSID6581': 5, 'FurnaceSID8580': 5, 'FurnaceAY': 6,
      'FurnacePSG': 7, 'FurnaceTIA': 8, 'FurnaceVERA': 9, 'FurnaceSAA': 10,
      'FurnaceVIC': 11, 'FurnaceLynx': 12,
    };
    if (chipTypeMap[synthType] !== undefined) {
      base.furnace.chipType = chipTypeMap[synthType]!;
    }
  } else if (isBuzzmachineType(synthType)) {
    base.buzzmachine = { ...DEFAULT_BUZZMACHINE };
    const machineTypeMap: Partial<Record<SynthType, string>> = {
      'Buzzmachine': 'ArguruDistortion', 'BuzzDTMF': 'CyanPhaseDTMF',
      'BuzzFreqBomb': 'ElenzilFrequencyBomb', 'BuzzKick': 'FSMKick',
      'BuzzKickXP': 'FSMKickXP', 'BuzzNoise': 'JeskolaNoise',
      'BuzzTrilok': 'JeskolaTrilok', 'Buzz4FM2F': 'MadBrain4FM2F',
      'BuzzDynamite6': 'MadBrainDynamite6', 'BuzzM3': 'MakkM3',
      'Buzz3o3': 'OomekAggressor',
    };
    if (machineTypeMap[synthType]) {
      base.buzzmachine.machineType = machineTypeMap[synthType] as BuzzmachineType;
    }
  } else if (synthType === 'GranularSynth') {
    base.granular = { ...DEFAULT_GRANULAR };
  } else if (synthType === 'DrumKit') {
    base.drumKit = { ...DEFAULT_DRUMKIT };
  } else if (synthType === 'Sam') {
    base.sam = { ...DEFAULT_SAM };
  } else if (synthType === 'V2') {
    base.v2 = { ...DEFAULT_V2 };
  } else if (synthType !== 'Sampler' && synthType !== 'Player' && synthType !== 'ChiptuneModule') {
    // Standard synth types
    switch (synthType) {
      case 'DrumMachine': base.drumMachine = { ...DEFAULT_DRUM_MACHINE }; break;
      case 'ChipSynth': base.chipSynth = { ...DEFAULT_CHIP_SYNTH }; break;
      case 'PWMSynth': base.pwmSynth = { ...DEFAULT_PWM_SYNTH }; break;
      case 'Wavetable': base.wavetable = { ...DEFAULT_WAVETABLE }; break;
      case 'SuperSaw': base.superSaw = { ...DEFAULT_SUPERSAW }; break;
      case 'PolySynth': base.polySynth = { ...DEFAULT_POLYSYNTH }; break;
      case 'Organ': base.organ = { ...DEFAULT_ORGAN }; break;
      case 'StringMachine': base.stringMachine = { ...DEFAULT_STRING_MACHINE }; break;
      case 'FormantSynth': base.formantSynth = { ...DEFAULT_FORMANT_SYNTH }; break;
      case 'WobbleBass': base.wobbleBass = { ...DEFAULT_WOBBLE_BASS }; break;
      case 'DubSiren': base.dubSiren = { ...DEFAULT_DUB_SIREN }; break;
      case 'SpaceLaser': base.spaceLaser = { ...DEFAULT_SPACE_LASER }; break;
      case 'Synare': base.synare = { ...DEFAULT_SYNARE }; break;
    }
  }

  // --- Auto-apply first factory preset for ALL synth types ---
  // This ensures synths get musically useful settings out of the box.
  // Critical for V2 (needs patch data), MAME chips (need _program), TB303 (better defaults).
  const savedFurnaceChipType = base.furnace?.chipType;
  const savedBuzzMachineType = base.buzzmachine?.machineType;

  const firstPreset = getFirstPresetForSynthType(synthType);
  if (firstPreset) {
    const presetRecord = { ...(firstPreset as Record<string, unknown>) };
    delete presetRecord.name;
    delete presetRecord.type;
    delete presetRecord.synthType;
    Object.assign(base, presetRecord);
    // Preserve structural fields that must match the selected synthType
    base.synthType = synthType;
    base.id = -1;
    base.name = getSynthInfo(synthType).name;
    // Restore Furnace chipType (preset may be generic Furnace, but user chose specific chip)
    if (savedFurnaceChipType !== undefined && base.furnace) {
      base.furnace.chipType = savedFurnaceChipType;
    }
    // Restore Buzzmachine machineType
    if (savedBuzzMachineType && base.buzzmachine) {
      base.buzzmachine.machineType = savedBuzzMachineType;
    }
  }

  return base;
}
