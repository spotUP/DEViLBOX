/**
 * PadEditor - Detailed pad parameter editor with tabs
 */

import React, { useState, useCallback } from 'react';
import type { DrumPad, FilterType, OutputBus } from '../../types/drumpad';
import { useDrumPadStore } from '../../stores/useDrumPadStore';

interface PadEditorProps {
  padId: number;
  onClose?: () => void;
}

type TabName = 'main' | 'adsr' | 'filter' | 'layers';

export const PadEditor: React.FC<PadEditorProps> = ({ padId, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabName>('main');

  const { programs, currentProgramId, updatePad, clearPad } = useDrumPadStore();
  const currentProgram = programs.get(currentProgramId);
  const pad = currentProgram?.pads.find(p => p.id === padId);

  const handleUpdate = useCallback((updates: Partial<DrumPad>) => {
    updatePad(padId, updates);
  }, [padId, updatePad]);

  if (!pad) {
    return (
      <div className="p-4 text-text-muted text-center">
        Pad {padId} not found
      </div>
    );
  }

  const tabs: { id: TabName; label: string }[] = [
    { id: 'main', label: 'Main' },
    { id: 'adsr', label: 'ADSR' },
    { id: 'filter', label: 'Filter' },
    { id: 'layers', label: 'Layers' },
  ];

  return (
    <div className="bg-dark-bg border border-dark-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <div>
          <div className="text-sm font-bold text-white">Pad {pad.id}: {pad.name}</div>
          <div className="text-xs text-text-muted">
            {pad.sample ? 'Sample loaded' : 'No sample'}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-text-muted hover:text-white"
          >
            Close
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-dark-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 px-4 py-2 text-xs font-bold transition-colors
              ${activeTab === tab.id
                ? 'bg-dark-surface text-accent-primary border-b-2 border-accent-primary'
                : 'text-text-muted hover:text-white'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'main' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Name</label>
              <input
                type="text"
                value={pad.name}
                onChange={(e) => handleUpdate({ name: e.target.value })}
                className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">
                Level: {pad.level}
              </label>
              <input
                type="range"
                min="0"
                max="127"
                value={pad.level}
                onChange={(e) => handleUpdate({ level: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">
                Tune: {pad.tune > 0 ? '+' : ''}{pad.tune} st
              </label>
              <input
                type="range"
                min="-36"
                max="36"
                value={pad.tune}
                onChange={(e) => handleUpdate({ tune: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">
                Pan: {pad.pan === 0 ? 'C' : pad.pan > 0 ? `R${pad.pan}` : `L${-pad.pan}`}
              </label>
              <input
                type="range"
                min="-64"
                max="63"
                value={pad.pan}
                onChange={(e) => handleUpdate({ pan: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">Output Bus</label>
              <select
                value={pad.output}
                onChange={(e) => handleUpdate({ output: e.target.value as OutputBus })}
                className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                <option value="stereo">Stereo Mix</option>
                <option value="out1">Output 1</option>
                <option value="out2">Output 2</option>
                <option value="out3">Output 3</option>
                <option value="out4">Output 4</option>
              </select>
            </div>

            <button
              onClick={() => clearPad(padId)}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded transition-colors"
            >
              Clear Pad
            </button>
          </div>
        )}

        {activeTab === 'adsr' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Attack: {pad.attack}ms
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={pad.attack}
                onChange={(e) => handleUpdate({ attack: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">
                Decay: {pad.decay}ms
              </label>
              <input
                type="range"
                min="0"
                max="2000"
                value={pad.decay}
                onChange={(e) => handleUpdate({ decay: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">
                Sustain: {pad.sustain}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={pad.sustain}
                onChange={(e) => handleUpdate({ sustain: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">
                Release: {pad.release}ms
              </label>
              <input
                type="range"
                min="0"
                max="5000"
                value={pad.release}
                onChange={(e) => handleUpdate({ release: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            {/* Visual ADSR envelope */}
            <div className="mt-6 p-4 bg-dark-surface border border-dark-border rounded">
              <div className="text-xs text-text-muted mb-2 text-center">ENVELOPE SHAPE</div>
              <div className="h-24 flex items-end justify-around">
                <div className="flex items-end space-x-1">
                  <div
                    className="w-8 bg-accent-primary"
                    style={{ height: `${(pad.attack / 100) * 100}%` }}
                    title="Attack"
                  />
                  <div
                    className="w-8 bg-accent-secondary"
                    style={{ height: `${(pad.decay / 2000) * 100}%` }}
                    title="Decay"
                  />
                  <div
                    className="w-8 bg-emerald-600"
                    style={{ height: `${pad.sustain}%` }}
                    title="Sustain"
                  />
                  <div
                    className="w-8 bg-blue-600"
                    style={{ height: `${(pad.release / 5000) * 100}%` }}
                    title="Release"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'filter' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Filter Type</label>
              <select
                value={pad.filterType}
                onChange={(e) => handleUpdate({ filterType: e.target.value as FilterType })}
                className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                <option value="off">Off</option>
                <option value="lpf">Low Pass</option>
                <option value="hpf">High Pass</option>
                <option value="bpf">Band Pass</option>
              </select>
            </div>

            {pad.filterType !== 'off' && (
              <>
                <div>
                  <label className="block text-xs text-text-muted mb-1">
                    Cutoff: {pad.cutoff}Hz
                  </label>
                  <input
                    type="range"
                    min="20"
                    max="20000"
                    value={pad.cutoff}
                    onChange={(e) => handleUpdate({ cutoff: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs text-text-muted mb-1">
                    Resonance: {pad.resonance}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={pad.resonance}
                    onChange={(e) => handleUpdate({ resonance: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'layers' && (
          <div className="space-y-4">
            <div className="text-xs text-text-muted">
              Layers allow velocity-sensitive sample switching.
            </div>
            {pad.layers.length === 0 ? (
              <div className="p-8 text-center text-text-muted border-2 border-dashed border-dark-border rounded">
                No layers configured
              </div>
            ) : (
              <div className="space-y-2">
                {pad.layers.map((layer, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-dark-surface border border-dark-border rounded"
                  >
                    <div className="text-sm text-white">{layer.sample.name}</div>
                    <div className="text-xs text-text-muted">
                      Velocity: {layer.velocityRange[0]}-{layer.velocityRange[1]}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="w-full px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white text-xs font-bold rounded transition-colors">
              + Add Layer
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
