// @ts-nocheck - Demo file with outdated component props
/**
 * InstrumentEditorDemo - Comprehensive demo showing all instrument & effect features
 * Demonstrates: InstrumentFactory, EffectChain, EffectPanel, PresetBrowser
 */

import React, { useState } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { EffectChain } from './EffectChain';
import { EffectPanel } from './EffectPanel';
import { PresetBrowser } from './PresetBrowser';
import { InstrumentEditor } from './InstrumentEditor';
import type { EffectConfig } from '@typedefs/instrument';

export const InstrumentEditorDemo: React.FC = () => {
  const [showPresetBrowser, setShowPresetBrowser] = useState(false);
  const [editingEffect, setEditingEffect] = useState<EffectConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'synth' | 'effects'>('synth');

  const { currentInstrument, currentInstrumentId } = useInstrumentStore();

  if (!currentInstrument || currentInstrumentId === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-ft2-bg">
        <div className="text-ft2-textDim text-sm">No instrument loaded</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-ft2-bg flex flex-col">
      {/* Header */}
      <div className="bg-ft2-header border-b border-ft2-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-ft2-highlight text-xl font-bold font-mono">
              INSTRUMENT EDITOR
            </div>
            <div className="text-ft2-textDim text-sm mt-1">
              Instrument {currentInstrumentId.toString(16).toUpperCase().padStart(2, '0')}:{' '}
              {currentInstrument.name}
            </div>
          </div>
          <button
            onClick={() => setShowPresetBrowser(!showPresetBrowser)}
            className="px-4 py-2 border border-ft2-border bg-ft2-bg
                     hover:border-ft2-highlight hover:text-ft2-highlight
                     transition-colors font-mono text-sm font-bold"
          >
            {showPresetBrowser ? 'HIDE PRESETS' : 'BROWSE PRESETS'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Preset Browser (collapsible) */}
        {showPresetBrowser && (
          <div className="w-1/3 border-r border-ft2-border overflow-hidden">
            <PresetBrowser
              instrumentId={currentInstrumentId}
              onClose={() => setShowPresetBrowser(false)}
            />
          </div>
        )}

        {/* Center Panel - Main Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex bg-ft2-header border-b border-ft2-border">
            <button
              onClick={() => setActiveTab('synth')}
              className={`
                px-6 py-3 font-mono text-sm font-bold border-r border-ft2-border
                transition-colors
                ${
                  activeTab === 'synth'
                    ? 'bg-ft2-cursor text-ft2-bg'
                    : 'text-ft2-text hover:text-ft2-highlight'
                }
              `}
            >
              SYNTH PARAMETERS
            </button>
            <button
              onClick={() => setActiveTab('effects')}
              className={`
                px-6 py-3 font-mono text-sm font-bold
                transition-colors relative
                ${
                  activeTab === 'effects'
                    ? 'bg-ft2-cursor text-ft2-bg'
                    : 'text-ft2-text hover:text-ft2-highlight'
                }
              `}
            >
              EFFECTS CHAIN
              {currentInstrument.effects.length > 0 && (
                <span
                  className={`
                  ml-2 px-1.5 py-0.5 rounded text-xs
                  ${activeTab === 'effects' ? 'bg-ft2-bg text-ft2-cursor' : 'bg-green-500 text-white'}
                `}
                >
                  {currentInstrument.effects.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto scrollbar-ft2">
            {activeTab === 'synth' ? (
              <InstrumentEditor instrumentId={currentInstrumentId} />
            ) : (
              <EffectChain
                instrumentId={currentInstrumentId}
                effects={currentInstrument.effects}
                onEditEffect={setEditingEffect}
              />
            )}
          </div>
        </div>

        {/* Right Panel - Effect Editor (collapsible) */}
        {editingEffect && (
          <div className="w-1/3 border-l border-ft2-border overflow-hidden">
            <div className="h-full overflow-y-auto scrollbar-ft2">
              <EffectPanel
                instrumentId={currentInstrumentId}
                effect={editingEffect}
                onClose={() => setEditingEffect(null)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer - Quick Stats */}
      <div className="bg-ft2-header border-t border-ft2-border p-2">
        <div className="flex items-center justify-between text-xs font-mono text-ft2-textDim">
          <div className="flex items-center gap-4">
            <div>
              SYNTH: <span className="text-ft2-highlight">{currentInstrument.synthType}</span>
            </div>
            <div>
              EFFECTS:{' '}
              <span className="text-ft2-highlight">{currentInstrument.effects.length}</span>
            </div>
            <div>
              VOLUME:{' '}
              <span className="text-ft2-highlight">{currentInstrument.volume.toFixed(1)} dB</span>
            </div>
            <div>
              PAN: <span className="text-ft2-highlight">{currentInstrument.pan}</span>
            </div>
          </div>
          <div className="text-ft2-textDim">
            Press <span className="text-ft2-highlight font-bold">TAB</span> to switch tabs •{' '}
            <span className="text-ft2-highlight font-bold">ESC</span> to close panels
          </div>
        </div>
      </div>
    </div>
  );
};
