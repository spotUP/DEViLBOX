/**
 * UnifiedInstrumentEditor - Single source of truth for instrument editing
 * Matches the clean layout of the Create Instrument modal
 */

import React, { useState, useCallback } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { InstrumentList } from './InstrumentList';
import { CategorizedSynthSelector } from './CategorizedSynthSelector';
import { EffectChain } from './EffectChain';
import { SavePresetDialog } from './SavePresetDialog';
import { TestKeyboard } from './TestKeyboard';
import { VisualTB303Editor } from './VisualTB303Editor';
import { VisualSynthEditor } from './VisualSynthEditor';
import { ProInstrumentEditor } from './ProInstrumentEditor';
import { getSynthInfo } from '@constants/synthCategories';
import { Music2, Sparkles, Save, Plus, ArrowLeft, List, X, Settings2 } from 'lucide-react';
import { SynthIcon } from './SynthIcon';
import type { SynthType, InstrumentConfig, TB303Config } from '@typedefs/instrument';
import { DEFAULT_TB303, DEFAULT_WAVETABLE } from '@typedefs/instrument';

type EditorView = 'editor' | 'pro' | 'browse' | 'effects';
type SidebarTab = 'instruments' | 'synths';

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
  onClose,
}) => {
  const {
    currentInstrument,
    updateInstrument,
    createInstrument,
  } = useInstrumentStore();

  const [view, setView] = useState<EditorView>('editor');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('instruments');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Get synth info for current instrument
  const synthInfo = currentInstrument ? getSynthInfo(currentInstrument.synthType) : null;

  // Handle synth type change
  const handleSynthTypeChange = useCallback((synthType: SynthType) => {
    if (!currentInstrument) return;
    
    updateInstrument(currentInstrument.id, {
      synthType,
      // Reset synth-specific configs to defaults if switching
      tb303: synthType === 'TB303' ? { ...DEFAULT_TB303 } : undefined,
      wavetable: synthType === 'Wavetable' ? { ...DEFAULT_WAVETABLE } : undefined,
    });
    
    setView('editor');
  }, [currentInstrument, updateInstrument]);

  // Handle general instrument updates
  const handleUpdateInstrument = useCallback((updates: Partial<InstrumentConfig>) => {
    if (!currentInstrument) return;
    updateInstrument(currentInstrument.id, updates);
  }, [currentInstrument, updateInstrument]);

  // Handle adding new instrument
  const handleAddInstrument = useCallback(() => {
    createInstrument();
    setView('editor');
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

  const handleTB303Change = (config: Partial<TB303Config>) => {
    if (!currentInstrument || !currentInstrument.tb303) return;
    updateInstrument(currentInstrument.id, {
      tb303: { ...currentInstrument.tb303, ...config },
    });
  };

  return (
    <div className={`flex h-full bg-dark-bg ${mode === 'modal' ? '' : 'rounded-lg overflow-hidden'}`}>
      {/* Left Sidebar: Instrument List or Synth Picker */}
      {showInstrumentList && (
        <div className="w-64 border-r border-dark-border flex-shrink-0 bg-dark-bgSecondary flex flex-col">
          {/* Sidebar Tabs */}
          <div className="flex border-b border-dark-border shrink-0">
            <button
              onClick={() => setSidebarTab('instruments')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                sidebarTab === 'instruments' ? 'bg-dark-bg text-accent-primary border-b border-accent-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <List size={14} />
              Instruments
            </button>
            <button
              onClick={() => setSidebarTab('synths')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                sidebarTab === 'synths' ? 'bg-dark-bg text-accent-primary border-b border-accent-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Plus size={14} />
              Synths
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {sidebarTab === 'instruments' ? (
              <InstrumentList maxHeight="100%" showActions={true} />
            ) : (
              <div className="h-full overflow-y-auto scrollbar-modern">
                <CategorizedSynthSelector compact onSelect={handleSynthTypeChange} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header - Clean style matching CreateInstrumentModal */}
        <div className="flex items-center justify-between px-4 py-2 bg-dark-bgSecondary border-b border-dark-border shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded ${synthInfo?.color || 'text-text-muted'} bg-dark-bgTertiary`}>
              <SynthIcon iconName={synthInfo?.icon || 'Music2'} size={18} />
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-text-primary font-bold text-sm uppercase tracking-wider">
                {view === 'editor' ? 'Edit Instrument' : view === 'browse' ? 'Select Synth' : 'Effects Chain'}
              </h2>
              {currentInstrument && (
                <input
                  type="text"
                  value={currentInstrument.name}
                  onChange={(e) => updateInstrument(currentInstrument.id, { name: e.target.value })}
                  className="px-3 py-1 text-sm bg-dark-bg border border-dark-border text-text-primary rounded focus:border-accent-primary focus:outline-none font-mono"
                  placeholder="Instrument name..."
                />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {view !== 'editor' ? (
              <button
                onClick={() => setView('editor')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-bgTertiary hover:bg-dark-bgHover text-text-primary text-sm font-bold transition-colors rounded border border-dark-border"
              >
                <ArrowLeft size={14} />
                Editor
              </button>
            ) : (
              <>
                <button
                  onClick={() => setView('browse')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 bg-dark-bgTertiary hover:bg-dark-bgHover text-xs font-bold transition-colors rounded border border-dark-border ${view === ('browse' as EditorView) ? 'text-accent-primary border-accent-primary/30' : 'text-text-secondary'}`}
                >
                  <Music2 size={14} />
                  Engine
                </button>
                <button
                  onClick={() => setView('pro')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 bg-dark-bgTertiary hover:bg-dark-bgHover text-xs font-bold transition-colors rounded border border-dark-border ${view === ('pro' as EditorView) ? 'text-accent-primary border-accent-primary/30' : 'text-text-secondary'}`}
                >
                  <Settings2 size={14} />
                  Pro
                </button>
                <button
                  onClick={() => setView('effects')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 bg-dark-bgTertiary hover:bg-dark-bgHover text-xs font-bold transition-colors rounded border border-dark-border ${view === ('effects' as EditorView) ? 'text-accent-primary border-accent-primary/30' : 'text-text-secondary'}`}
                >
                  <Sparkles size={14} />
                  FX ({currentInstrument?.effects?.length || 0})
                </button>
              </>
            )}
            <div className="w-px h-6 bg-dark-border mx-1" />
            <button
              onClick={() => setShowSaveDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-bgTertiary hover:bg-dark-bgHover text-accent-primary text-xs font-bold transition-colors rounded border border-accent-primary/30"
            >
              <Save size={14} />
              <span className="uppercase">Save Preset</span>
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="ml-2 p-1.5 text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary rounded transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!currentInstrument ? (
            <div className="flex-1 flex items-center justify-center text-text-muted">
              <div className="text-center">
                <Music2 size={48} className="mx-auto mb-4 opacity-20" />
                <p>Select an instrument to start editing</p>
              </div>
            </div>
          ) : (
            <>
              {view === 'editor' && (
                <div className="flex-1 overflow-y-auto scrollbar-modern">
                  {currentInstrument.synthType === 'TB303' && currentInstrument.tb303 ? (
                    <VisualTB303Editor config={currentInstrument.tb303} onChange={handleTB303Change} />
                  ) : (
                    <VisualSynthEditor
                      instrument={currentInstrument}
                      onChange={handleUpdateInstrument}
                    />
                  )}
                </div>
              )}

              {view === 'pro' && (
                <div className="flex-1 overflow-y-auto scrollbar-modern">
                  <ProInstrumentEditor instrument={currentInstrument} />
                </div>
              )}

              {view === 'browse' && (
                <div className="flex-1 overflow-y-auto scrollbar-modern p-6">
                  <div className="max-w-4xl mx-auto">
                    <CategorizedSynthSelector onSelect={handleSynthTypeChange} />
                  </div>
                </div>
              )}

              {view === 'effects' && (
                <div className="flex-1 overflow-y-auto scrollbar-modern p-6">
                  <div className="max-w-2xl mx-auto">
                    <EffectChain instrumentId={currentInstrument.id} effects={currentInstrument.effects || []} />
                  </div>
                </div>
              )}

              {/* Test Keyboard - Integrated at the bottom of the content area, always visible in editor */}
              <div className="p-3 border-t border-dark-border bg-dark-bgSecondary shrink-0 flex flex-col items-center">
                <TestKeyboard instrument={currentInstrument} />
                <p className="text-[9px] text-text-muted mt-1 uppercase tracking-tighter">
                  Z-M: NOTES • Q-P: UPPER OCTAVE • K/L: OCTAVE
                </p>
              </div>
            </>
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
  );
};