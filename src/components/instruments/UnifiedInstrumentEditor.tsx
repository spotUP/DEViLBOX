/**
 * UnifiedInstrumentEditor - Single source of truth for instrument editing
 * Replaces InstrumentModal, InstrumentPanel, and InstrumentEditor
 *
 * Tabs: Quick | Sound | Sample | Effects | Browse
 */

import React, { useState, useCallback } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { InstrumentList } from './InstrumentList';
import { QuickView } from './QuickView';
import { CategorizedSynthSelector } from './CategorizedSynthSelector';
import { GenericSynthEditor } from './GenericSynthEditor';
import { EffectChain } from './EffectChain';
import { SavePresetDialog } from './SavePresetDialog';
import { getSynthInfo } from '@constants/synthCategories';
import { Zap, Music2, FileAudio, Sparkles, Settings, Keyboard, ChevronDown, ChevronUp, Save, Plus } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { SynthType } from '@typedefs/instrument';

type EditorTab = 'quick' | 'sound' | 'sample' | 'effects' | 'browse';

interface UnifiedInstrumentEditorProps {
  /** Display mode - modal has more space, panel is compact */
  mode?: 'modal' | 'panel';
  /** Show instrument list sidebar */
  showInstrumentList?: boolean;
  /** Show test keyboard */
  showKeyboard?: boolean;
  /** Callback when closing (modal mode) */
  onClose?: () => void;
}

export const UnifiedInstrumentEditor: React.FC<UnifiedInstrumentEditorProps> = ({
  mode = 'modal',
  showInstrumentList = true,
  showKeyboard: initialShowKeyboard = true,
  onClose: _onClose,
}) => {
  void _onClose; // Prop available for future use
  const {
    currentInstrument,
    updateInstrument,
    createInstrument,
  } = useInstrumentStore();

  const [activeTab, setActiveTab] = useState<EditorTab>('quick');
  const [showKeyboard, setShowKeyboard] = useState(initialShowKeyboard);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Get synth info for current instrument
  const synthInfo = currentInstrument ? getSynthInfo(currentInstrument.synthType) : null;

  // Get icon component dynamically
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Music2;
  };

  // Tab definitions
  const tabs: { id: EditorTab; label: string; icon: React.ElementType; show: boolean }[] = [
    { id: 'quick', label: 'Quick', icon: Zap, show: true },
    { id: 'sound', label: 'Sound', icon: Settings, show: true },
    {
      id: 'sample',
      label: 'Sample',
      icon: FileAudio,
      show: currentInstrument?.synthType === 'Sampler' || currentInstrument?.synthType === 'Player',
    },
    { id: 'effects', label: 'Effects', icon: Sparkles, show: true },
    { id: 'browse', label: 'Browse', icon: Music2, show: true },
  ];

  // Handle tab navigation from QuickView
  const handleGoToSound = useCallback(() => setActiveTab('sound'), []);
  const handleGoToBrowse = useCallback(() => setActiveTab('browse'), []);

  // Handle synth type change from Browse
  const handleSynthTypeChange = useCallback((_synthType: SynthType) => {
    // Switch to Sound tab after selecting new type
    setActiveTab('sound');
  }, []);

  // Handle adding new instrument
  const handleAddInstrument = useCallback(() => {
    createInstrument();
  }, [createInstrument]);

  if (!currentInstrument) {
    return (
      <div className="flex items-center justify-center h-full bg-dark-bg text-text-muted">
        <div className="text-center">
          <Music2 size={48} className="mx-auto mb-4 opacity-50" />
          <p className="mb-4">No instrument selected</p>
          <button
            onClick={handleAddInstrument}
            className="flex items-center gap-2 px-4 py-2 bg-accent-primary rounded-lg text-text-inverse hover:bg-accent-primary/80 transition-colors"
          >
            <Plus size={16} />
            Create Instrument
          </button>
        </div>
      </div>
    );
  }

  const IconComponent = synthInfo ? getIcon(synthInfo.icon) : Music2;

  return (
    <div className={`flex h-full bg-dark-bg ${mode === 'modal' ? '' : 'rounded-lg overflow-hidden'}`}>
      {/* Left Sidebar: Instrument List */}
      {showInstrumentList && (
        <div className="w-52 border-r border-dark-border flex-shrink-0 bg-dark-bgSecondary">
          <InstrumentList
            maxHeight="100%"
            showActions={true}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-bgSecondary">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-dark-bgTertiary ${synthInfo?.color || 'text-text-muted'}`}>
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-bgTertiary hover:bg-dark-bgHover text-text-secondary hover:text-text-primary transition-colors text-sm"
              title="Save as preset"
            >
              <Save size={14} />
              Save
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-dark-border bg-dark-bgSecondary/50">
          {tabs
            .filter((tab) => tab.show)
            .map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${isActive
                      ? 'bg-accent-primary/20 text-accent-primary'
                      : 'text-text-secondary hover:text-text-primary hover:bg-dark-bgHover'
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
          {activeTab === 'quick' && (
            <QuickView
              onEditSound={handleGoToSound}
              onBrowseAll={handleGoToBrowse}
              onSavePreset={() => setShowSaveDialog(true)}
            />
          )}

          {activeTab === 'sound' && (
            <div className="p-4">
              <GenericSynthEditor
                instrument={currentInstrument}
                onChange={(updates) => updateInstrument(currentInstrument.id, updates)}
              />
            </div>
          )}

          {activeTab === 'sample' && (
            <div className="p-4">
              <div className="bg-dark-bgSecondary rounded-lg p-8 text-center border border-dark-border">
                <FileAudio size={48} className="mx-auto mb-4 text-text-muted" />
                <h3 className="text-lg font-semibold text-text-primary mb-2">Enhanced Sample Editor</h3>
                <p className="text-text-secondary mb-4">
                  Waveform visualization, loop points, and sample editing coming soon.
                </p>
                <p className="text-xs text-text-muted">
                  Current sample: {currentInstrument.parameters?.sampleUrl ? 'Loaded' : 'None'}
                </p>
              </div>
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
              <div className="flex gap-1">
                {/* Simple piano keyboard visualization */}
                {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'].map((note, i) => {
                  const isBlack = note.includes('#');
                  return (
                    <button
                      key={`${note}-${i}`}
                      className={`
                        ${isBlack
                          ? 'w-6 h-12 bg-dark-bg border border-dark-border text-[10px] -mx-3 z-10 rounded-b'
                          : 'w-8 h-16 bg-text-primary/90 border border-dark-border text-dark-bg text-xs rounded-b'
                        }
                        hover:opacity-80 transition-opacity
                      `}
                      title={`${note}${i < 12 ? '4' : '5'}`}
                    >
                      {!isBlack && note}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-text-muted mt-2 text-center">
                Use Z-M keys for notes, Q-P for upper octave. K/L for octave.
              </p>
            </div>
          )}
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
  );
};
