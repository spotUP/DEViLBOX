/**
 * InstrumentEditorPopout - Standalone instrument editor for pop-out window.
 *
 * Renders the same editor content as EditInstrumentModal but without the
 * modal overlay. Reads directly from stores (same JS context as main window).
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { getSynthInfo } from '@constants/synthCategories';
import { UnifiedInstrumentEditor } from './editors';
import { EffectChain, TestKeyboard } from './shared';
import { SavePresetDialog } from './presets';
import * as LucideIcons from 'lucide-react';
import { Settings, Sparkles, Save, Keyboard, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import type { InstrumentConfig } from '@typedefs/instrument';

type EditorTab = 'sound' | 'effects';

export const InstrumentEditorPopout: React.FC = () => {
  const instruments = useInstrumentStore((state) => state.instruments);
  const currentInstrumentId = useInstrumentStore((state) => state.currentInstrumentId);
  const updateInstrument = useInstrumentStore((state) => state.updateInstrument);
  const setCurrentInstrument = useInstrumentStore((state) => state.setCurrentInstrument);

  const currentInstrument = instruments.find((inst) => inst.id === currentInstrumentId) || null;

  // Debug: verify store is shared (log on mount)
  useEffect(() => {
    console.log('[InstrumentEditorPopout] Mounted with currentInstrumentId:', currentInstrumentId);
    console.log('[InstrumentEditorPopout] Store instruments count:', instruments.length);
  }, []);

  const [activeTab, setActiveTab] = useState<EditorTab>('sound');
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Navigate instruments
  const sortedInstruments = [...instruments].sort((a, b) => a.id - b.id);
  const currentIndex = sortedInstruments.findIndex((i) => i.id === currentInstrumentId);

  const handlePrevInstrument = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentInstrument(sortedInstruments[currentIndex - 1].id);
    } else if (sortedInstruments.length > 0) {
      setCurrentInstrument(sortedInstruments[sortedInstruments.length - 1].id);
    }
  }, [currentIndex, sortedInstruments, setCurrentInstrument]);

  const handleNextInstrument = useCallback(() => {
    if (currentIndex < sortedInstruments.length - 1) {
      setCurrentInstrument(sortedInstruments[currentIndex + 1].id);
    } else if (sortedInstruments.length > 0) {
      setCurrentInstrument(sortedInstruments[0].id);
    }
  }, [currentIndex, sortedInstruments, setCurrentInstrument]);

  const synthInfo = currentInstrument?.synthType
    ? getSynthInfo(currentInstrument.synthType)
    : getSynthInfo('TB303');

  const tabs = [
    { id: 'sound' as const, label: 'Sound', icon: Settings },
    { id: 'effects' as const, label: 'Effects', icon: Sparkles },
  ];

  if (!currentInstrument) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: '#0b0909', color: '#f2f0f0' }}
      >
        <div className="text-center">
          <LucideIcons.Music2 size={48} className="mx-auto mb-4 opacity-50 text-gray-500" />
          <p className="text-gray-400 mb-2">No instrument selected</p>
          <p className="text-gray-500 text-sm">Select an instrument in the main window</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-bg w-full h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-bgSecondary shrink-0">
        <div className="flex items-center gap-2">
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
              {synthInfo?.name || currentInstrument.synthType}{' '}
              <span className="opacity-50">|</span> ID:{' '}
              {currentInstrument.id.toString(16).toUpperCase().padStart(2, '0')}
            </p>
          </div>

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
            onClick={() => setShowSaveDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-bg hover:bg-dark-bgTertiary text-text-primary transition-colors text-sm border border-dark-border"
            title="Save as preset"
          >
            <Save size={14} />
            Save
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-dark-border bg-dark-bg shrink-0">
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
          <UnifiedInstrumentEditor
            instrument={currentInstrument}
            onChange={(updates: Partial<InstrumentConfig>) => {
              console.log('[InstrumentEditorPopout] onChange called with updates:', updates);
              updateInstrument(currentInstrument.id, updates);
            }}
          />
        )}

        {activeTab === 'effects' && (
          <div className="p-4">
            <EffectChain
              instrumentId={currentInstrument.id}
              effects={currentInstrument.effects || []}
            />
          </div>
        )}
      </div>

      {/* Test Keyboard (Collapsible) */}
      <div className="border-t border-dark-border shrink-0">
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

/** Static sub-component to avoid creating components during render */
const SynthIconDisplay: React.FC<{ iconName: string; size: number }> = ({ iconName, size }) => {
  const Icon = (LucideIcons as unknown as Record<string, LucideIcons.LucideIcon>)[iconName] || LucideIcons.Music2;
  return <Icon size={size} />;
};

export default InstrumentEditorPopout;
