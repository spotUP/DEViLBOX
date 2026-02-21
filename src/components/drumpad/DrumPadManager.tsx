/**
 * DrumPadManager - Main drum pad interface container
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PadGrid } from './PadGrid';
import { PadEditor } from './PadEditor';
import { SamplePackBrowser } from '../instruments/SamplePackBrowser';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorBoundary } from './ErrorBoundary';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import type { SampleData, MpcResampleConfig } from '../../types/drumpad';
import {
  getAllKitSources,
  loadKitSource,
} from '../../lib/drumpad/defaultKitLoader';
import { useInstrumentStore, useAllSamplePacks } from '../../stores';
import { X, Download, Piano } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';

interface DrumPadManagerProps {
  onClose?: () => void;
}

export const DrumPadManager: React.FC<DrumPadManagerProps> = ({ onClose }) => {
  const [selectedPadId, setSelectedPadId] = useState<number | null>(null);
  const [showSampleBrowser, setShowSampleBrowser] = useState(false);
  const [showPadEditor, setShowPadEditor] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Local state for immediate UI updates (debounced save)
  const [localMasterLevel, setLocalMasterLevel] = useState<number | null>(null);
  const [localMasterTune, setLocalMasterTune] = useState<number | null>(null);

  // Debounce timers
  const masterLevelTimerRef = useRef<NodeJS.Timeout | null>(null);
  const masterTuneTimerRef = useRef<NodeJS.Timeout | null>(null);

  const {
    programs,
    currentProgramId,
    loadProgram,
    createProgram,
    deleteProgram,
    copyProgram,
    loadSampleToPad,
    saveProgram,
    preferences,
    setPreference,
    busLevels,
    setBusLevel,
    noteRepeatEnabled,
    noteRepeatRate,
    setNoteRepeatEnabled,
    setNoteRepeatRate,
  } = useDrumPadStore();

  // Get all available kit sources (presets + sample packs)
  const allSamplePacks = useAllSamplePacks();
  const allKitSources = React.useMemo(
    () => getAllKitSources(allSamplePacks),
    [allSamplePacks]
  );
  const [selectedKitSourceId, setSelectedKitSourceId] = useState<string>(
    allKitSources[0]?.id || ''
  );

  // Get instrument store for creating instruments
  const { createInstrument } = useInstrumentStore();

  const handleProgramChange = useCallback((programId: string) => {
    loadProgram(programId);
    setSelectedPadId(null); // Clear selection when changing programs
  }, [loadProgram]);

  const handleNewProgram = useCallback(() => {
    // Find next available ID
    const existingIds = Array.from(programs.keys());
    let letter = 'A';
    let number = 1;

    // Simple algorithm: try A-01, A-02, ... B-01, etc.
    while (existingIds.includes(`${letter}-${String(number).padStart(2, '0')}`)) {
      number++;
      if (number > 99) {
        number = 1;
        letter = String.fromCharCode(letter.charCodeAt(0) + 1);
      }
    }

    const newId = `${letter}-${String(number).padStart(2, '0')}`;
    createProgram(newId, `New Kit ${letter}${number}`);
  }, [programs, createProgram]);

  const handleCopyProgram = useCallback(() => {
    const existingIds = Array.from(programs.keys());
    let letter = 'A';
    let number = 1;
    while (existingIds.includes(`${letter}-${String(number).padStart(2, '0')}`)) {
      number++;
      if (number > 99) {
        number = 1;
        letter = String.fromCharCode(letter.charCodeAt(0) + 1);
      }
    }
    const newId = `${letter}-${String(number).padStart(2, '0')}`;
    copyProgram(currentProgramId, newId);
    loadProgram(newId);
  }, [programs, currentProgramId, copyProgram, loadProgram]);

  const handleDeleteProgram = useCallback(() => {
    if (programs.size <= 1) {
      setConfirmDialog({
        isOpen: true,
        title: 'Cannot Delete',
        message: 'Cannot delete the last program. At least one program must exist.',
        onConfirm: () => {},
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Delete Program',
      message: `Are you sure you want to delete program ${currentProgramId}? This action cannot be undone.`,
      onConfirm: () => {
        deleteProgram(currentProgramId);
      },
    });
  }, [programs.size, currentProgramId, deleteProgram]);

  const handleLoadSample = useCallback((sample: SampleData) => {
    if (selectedPadId !== null) {
      loadSampleToPad(selectedPadId, sample);
    }
  }, [selectedPadId, loadSampleToPad]);

  const handleLoadKit = useCallback(() => {
    try {
      const selectedSource = allKitSources.find(s => s.id === selectedKitSourceId);
      if (!selectedSource) {
        throw new Error('Kit source not found');
      }

      console.log(`[DrumPadManager] Loading kit: ${selectedSource.name} (${selectedSource.type})`);

      // Load kit and create instruments
      const createdIds = loadKitSource(
        selectedSource,
        allSamplePacks,
        createInstrument
      );

      console.log(`[DrumPadManager] Created ${createdIds.length} instruments`);

      // Show success message
      setConfirmDialog({
        isOpen: true,
        title: 'Kit Loaded',
        message: `Successfully added ${createdIds.length} instruments from "${selectedSource.name}" to your instrument list.`,
        onConfirm: () => {},
      });
    } catch (error) {
      console.error('[DrumPadManager] Failed to load kit:', error);
      setConfirmDialog({
        isOpen: true,
        title: 'Error Loading Kit',
        message: `Failed to load drum kit. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        onConfirm: () => {},
      });
    }
  }, [selectedKitSourceId, allKitSources, allSamplePacks, createInstrument]);

  const handleMasterLevelChange = useCallback((level: number) => {
    // Update UI immediately
    setLocalMasterLevel(level);

    // Debounce the actual save (300ms)
    if (masterLevelTimerRef.current) {
      clearTimeout(masterLevelTimerRef.current);
    }

    masterLevelTimerRef.current = setTimeout(() => {
      const currentProgram = programs.get(currentProgramId);
      if (currentProgram) {
        saveProgram({
          ...currentProgram,
          masterLevel: level,
        });
        setLocalMasterLevel(null); // Clear local state after save
      }
    }, 300);
  }, [programs, currentProgramId, saveProgram]);

  const handleMasterTuneChange = useCallback((tune: number) => {
    // Update UI immediately
    setLocalMasterTune(tune);

    // Debounce the actual save (300ms)
    if (masterTuneTimerRef.current) {
      clearTimeout(masterTuneTimerRef.current);
    }

    masterTuneTimerRef.current = setTimeout(() => {
      const currentProgram = programs.get(currentProgramId);
      if (currentProgram) {
        saveProgram({
          ...currentProgram,
          masterTune: tune,
        });
        setLocalMasterTune(null); // Clear local state after save
      }
    }, 300);
  }, [programs, currentProgramId, saveProgram]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (masterLevelTimerRef.current) {
        clearTimeout(masterLevelTimerRef.current);
      }
      if (masterTuneTimerRef.current) {
        clearTimeout(masterTuneTimerRef.current);
      }
    };
  }, []);

  // Keyboard shortcuts for triggering pads (bank-aware)
  // Uses mousedown simulation on pad buttons instead of broken click approach
  const currentBank = useDrumPadStore(s => s.currentBank);
  useEffect(() => {
    // Map keys to pad index within bank (0-15)
    const keyToPadIndex: Record<string, number> = {
      // Top row: Q W E R (pads 0-3)
      'q': 0, 'w': 1, 'e': 2, 'r': 3,
      // Second row: A S D F (pads 4-7)
      'a': 4, 's': 5, 'd': 6, 'f': 7,
      // Third row: Z X C V (pads 8-11)
      'z': 8, 'x': 9, 'c': 10, 'v': 11,
      // Fourth row: T G B N (pads 12-15)
      't': 12, 'g': 13, 'b': 14, 'n': 15,
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts if typing in input/textarea/select
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      const key = event.key.toLowerCase();
      const padIndex = keyToPadIndex[key];

      if (padIndex !== undefined) {
        if (!isInputFocused) {
          // Calculate bank-aware pad ID
          const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[currentBank];
          const padId = bankOffset + padIndex + 1;
          const program = programs.get(currentProgramId);
          if (program) {
            event.preventDefault();
            const pad = program.pads.find((p) => p.id === padId);
            if (pad?.sample) {
              // Trigger via mousedown event on the pad button for proper audio triggering
              const padButton = document.querySelector(`[data-pad-id="${padId}"]`) as HTMLElement;
              if (padButton) {
                const rect = padButton.getBoundingClientRect();
                const mouseEvent = new MouseEvent('mousedown', {
                  bubbles: true,
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top + rect.height * 0.3, // Upper area = medium velocity
                });
                padButton.dispatchEvent(mouseEvent);
              }
            }
          }
        }
      }

      // Escape to close (always works, even in inputs)
      if (event.key === 'Escape' && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [programs, currentProgramId, currentBank, onClose]);

  // Determine if we're rendered as a full view (no onClose) or as a modal
  const isViewMode = !onClose;

  const content = (
    <div className={
      isViewMode
        ? 'flex flex-col h-full w-full overflow-hidden select-none bg-dark-bg font-mono'
        : 'fixed inset-0 z-50 bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in-0 duration-300'
    }>
      <div className={
        isViewMode
          ? 'flex flex-col h-full w-full overflow-hidden'
          : 'bg-dark-surface border border-dark-border rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-8 duration-400'
      }>
        {/* Header / Top Bar */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-dark-bgSecondary border-b border-dark-border">
          <div className="flex items-center gap-3">
            {isViewMode && (
              <>
                <select
                  value="drumpad"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'dj') {
                      useUIStore.getState().setActiveView('dj');
                    } else if (val === 'arrangement') {
                      useUIStore.getState().setActiveView('arrangement');
                    } else if (val !== 'drumpad') {
                      useUIStore.getState().setActiveView('tracker');
                    }
                  }}
                  className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-dark-bgTertiary text-text-muted border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer"
                  title="Switch view"
                >
                  <option value="tracker">Tracker</option>
                  <option value="grid">Grid</option>
                  <option value="pianoroll">Piano Roll</option>
                  <option value="tb303">TB-303</option>
                  <option value="arrangement">Arrangement</option>
                  <option value="dj">DJ Mixer</option>
                  <option value="drumpad">Drum Pads</option>
                </select>
                <div className="h-4 w-px bg-dark-border" />
              </>
            )}
            <span className="font-mono text-sm font-bold tracking-widest uppercase text-accent-primary">
              DRUM PADS
            </span>
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
              MPC-style 64-pad drum machine
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => useUIStore.getState().openModal('midi-pads')}
              className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-white bg-dark-bgTertiary border border-dark-border rounded transition-colors flex items-center gap-1.5"
              title="Open MIDI Pad Mapper"
            >
              <Piano className="w-3.5 h-3.5" />
              MIDI Map
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-dark-border rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-text-muted" />
              </button>
            )}
          </div>
        </div>

        {/* Main content area */}
        <ErrorBoundary fallbackMessage="An error occurred in the drum pad interface.">
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
            {/* Left: Pad Grid (takes 2 columns on large screens) */}
            <div className="lg:col-span-2">
              <div className="bg-dark-bg border border-dark-border rounded-lg">
                <PadGrid
                  onPadSelect={setSelectedPadId}
                  selectedPadId={selectedPadId}
                />
              </div>
            </div>

            {/* Right: Controls and Info */}
            <div className="space-y-4">
              {/* Program Selector */}
              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <div className="text-xs font-mono text-text-muted mb-2">PROGRAM</div>
                <select
                  value={currentProgramId}
                  onChange={(e) => handleProgramChange(e.target.value)}
                  className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-accent-primary"
                >
                  {Array.from(programs.entries()).map(([id, program]) => (
                    <option key={id} value={id}>
                      {id} - {program.name}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <button
                    onClick={handleNewProgram}
                    className="px-3 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white text-xs font-bold rounded transition-colors"
                  >
                    + New
                  </button>
                  <button
                    onClick={handleCopyProgram}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded transition-colors"
                  >
                    Copy
                  </button>
                  <button
                    onClick={handleDeleteProgram}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded transition-colors"
                    disabled={programs.size <= 1}
                  >
                    Delete
                  </button>
                </div>

                {/* Kit Selector */}
                <div className="mt-3">
                  <label className="block text-xs text-text-muted mb-1">Kit Source</label>
                  <select
                    value={selectedKitSourceId}
                    onChange={(e) => setSelectedKitSourceId(e.target.value)}
                    className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  >
                    {allKitSources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.type === 'preset' ? '🎵 ' : '📦 '}
                        {source.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-text-muted mt-1">
                    {allKitSources.find(s => s.id === selectedKitSourceId)?.description || ''}
                  </p>
                </div>

                {/* Add to Instruments Button */}
                <button
                  onClick={handleLoadKit}
                  className="w-full mt-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-3 h-3" />
                  Add to Instruments
                </button>
              </div>

              {/* Master Controls */}
              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <div className="text-xs font-mono text-text-muted mb-3">MASTER</div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-text-muted">
                      Level: {localMasterLevel !== null ? localMasterLevel : (programs.get(currentProgramId)?.masterLevel || 100)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="127"
                      value={localMasterLevel !== null ? localMasterLevel : (programs.get(currentProgramId)?.masterLevel || 100)}
                      onChange={(e) => handleMasterLevelChange(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted">
                      Tune: {localMasterTune !== null ? localMasterTune : (programs.get(currentProgramId)?.masterTune || 0)} st
                    </label>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      value={localMasterTune !== null ? localMasterTune : (programs.get(currentProgramId)?.masterTune || 0)}
                      onChange={(e) => handleMasterTuneChange(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Output Bus Levels */}
              {(() => {
                const currentProg = programs.get(currentProgramId);
                const busesInUse = ['out1', 'out2', 'out3', 'out4'].filter(
                  bus => currentProg?.pads.some(p => p.output === bus)
                );
                if (busesInUse.length === 0) return null;
                return (
                  <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                    <div className="text-xs font-mono text-text-muted mb-3">OUTPUT BUSES</div>
                    <div className="space-y-2">
                      {busesInUse.map(bus => (
                        <div key={bus}>
                          <label className="text-xs text-text-muted">
                            {bus}: {busLevels[bus] ?? 100}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="127"
                            value={busLevels[bus] ?? 100}
                            onChange={(e) => setBusLevel(bus, parseInt(e.target.value))}
                            className="w-full"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Settings */}
              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <div className="text-xs font-mono text-text-muted mb-3">SETTINGS</div>
                <div>
                  <label className="text-xs text-text-muted">
                    Velocity Sensitivity: {preferences.velocitySensitivity.toFixed(1)}x
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={preferences.velocitySensitivity}
                    onChange={(e) => setPreference('velocitySensitivity', parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Note Repeat */}
              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <div className="text-xs font-mono text-text-muted mb-3">NOTE REPEAT</div>
                <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={noteRepeatEnabled}
                    onChange={(e) => setNoteRepeatEnabled(e.target.checked)}
                    className="rounded border-dark-border bg-dark-surface text-accent-primary focus:ring-accent-primary"
                  />
                  Enable
                </label>
                <div className="flex flex-wrap gap-1">
                  {(['1/4', '1/8', '1/16', '1/32', '1/8T', '1/16T'] as const).map(rate => (
                    <button
                      key={rate}
                      onClick={() => setNoteRepeatRate(rate)}
                      className={`px-2 py-1 text-[10px] font-mono rounded transition-colors ${
                        noteRepeatRate === rate
                          ? 'bg-accent-primary text-white'
                          : 'bg-dark-surface border border-dark-border text-text-muted hover:text-white'
                      }`}
                    >
                      {rate}
                    </button>
                  ))}
                </div>
              </div>

              {/* MPC Resampling */}
              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <div className="text-xs font-mono text-text-muted mb-3">MPC RESAMPLING</div>
                <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={programs.get(currentProgramId)?.mpcResample?.enabled ?? false}
                    onChange={(e) => {
                      const currentProg = programs.get(currentProgramId);
                      if (currentProg) {
                        saveProgram({
                          ...currentProg,
                          mpcResample: {
                            enabled: e.target.checked,
                            model: currentProg.mpcResample?.model ?? 'MPC60',
                          },
                        });
                      }
                    }}
                    className="rounded border-dark-border bg-dark-surface text-accent-primary focus:ring-accent-primary"
                  />
                  Enable on sample load
                </label>
                {programs.get(currentProgramId)?.mpcResample?.enabled && (
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Model</label>
                    <select
                      value={programs.get(currentProgramId)?.mpcResample?.model ?? 'MPC60'}
                      onChange={(e) => {
                        const currentProg = programs.get(currentProgramId);
                        if (currentProg) {
                          saveProgram({
                            ...currentProg,
                            mpcResample: {
                              enabled: true,
                              model: e.target.value as MpcResampleConfig['model'],
                            },
                          });
                        }
                      }}
                      className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
                    >
                      <option value="MPC60">MPC 60 (12-bit, 40kHz)</option>
                      <option value="MPC3000">MPC 3000 (16-bit, 44.1kHz)</option>
                      <option value="SP1200">SP-1200 (12-bit, 26kHz)</option>
                      <option value="MPC2000XL">MPC 2000XL (16-bit, 44.1kHz)</option>
                    </select>
                    <p className="text-[10px] text-text-muted mt-1">
                      Samples loaded to pads will be processed through the selected MPC emulation.
                    </p>
                  </div>
                )}
              </div>

              {/* Selected Pad Info */}
              {selectedPadId !== null && (
                <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                  <div className="text-xs font-mono text-text-muted mb-2">
                    PAD {selectedPadId}
                  </div>
                  <div className="text-sm text-white mb-3">
                    {programs.get(currentProgramId)?.pads[selectedPadId - 1]?.name || 'Empty'}
                  </div>
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowSampleBrowser(true)}
                      className="w-full px-3 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white text-xs font-bold rounded transition-colors"
                    >
                      Load Sample
                    </button>
                    <button
                      onClick={() => setShowPadEditor(true)}
                      className="w-full px-3 py-2 bg-dark-border hover:bg-dark-border/80 text-white text-xs font-bold rounded transition-colors"
                    >
                      Edit Parameters
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Info */}
              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <div className="text-xs font-mono text-text-muted mb-2">SHORTCUTS</div>
                <div className="space-y-1 text-xs text-text-muted font-mono">
                  <div>Click: Trigger pad</div>
                  <div>Shift+Click: Select pad</div>
                  <div>Q-P / A-; / Z-/: Trigger pads</div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </ErrorBoundary>

        {/* Sample Browser Modal */}
        {showSampleBrowser && (
          <div className="animate-in fade-in-0 duration-200">
            <SamplePackBrowser
              mode="drumpad"
              onSelectSample={handleLoadSample}
              onClose={() => setShowSampleBrowser(false)}
            />
          </div>
        )}

        {/* Pad Editor Modal */}
        {showPadEditor && selectedPadId !== null && (
          <div className="fixed inset-0 z-50 bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in-0 duration-200">
            <div className="max-w-2xl w-full mx-4 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-300">
              <PadEditor
                padId={selectedPadId}
                onClose={() => setShowPadEditor(false)}
              />
            </div>
          </div>
        )}

        {/* Confirm Dialog */}
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={programs.size <= 1 ? 'warning' : 'danger'}
          confirmLabel={programs.size <= 1 ? 'OK' : 'Delete'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        />
      </div>
    </div>
  );

  return content;
};
