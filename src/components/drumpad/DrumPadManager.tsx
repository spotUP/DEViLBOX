/**
 * DrumPadManager - Main drum pad interface container
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PadGrid } from './PadGrid';
import { PadEditor } from './PadEditor';
import { SampleBrowser } from './SampleBrowser';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorBoundary } from './ErrorBoundary';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import type { SampleData } from '../../types/drumpad';
import {
  getAllKitSources,
  loadKitSource,
} from '../../lib/drumpad/defaultKitLoader';
import { useInstrumentStore, useAllSamplePacks } from '../../stores';
import { X, Download } from 'lucide-react';

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
    loadSampleToPad,
    saveProgram,
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

  // Keyboard shortcuts for triggering pads
  useEffect(() => {
    // Map keys to pad IDs (QWERTY keyboard layout)
    const keyMap: Record<string, number> = {
      // Top row: Q W E R (pads 1-4)
      'q': 1, 'w': 2, 'e': 3, 'r': 4,
      // Second row: A S D F (pads 5-8)
      'a': 5, 's': 6, 'd': 7, 'f': 8,
      // Third row: Z X C V (pads 9-12)
      'z': 9, 'x': 10, 'c': 11, 'v': 12,
      // Fourth row: T G B (pads 13-16)
      't': 13, 'g': 14, 'b': 15, 'n': 16,
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
      const padId = keyMap[key];

      if (padId) {
        // Only trigger pads if not typing in an input
        if (!isInputFocused) {
          const program = programs.get(currentProgramId);
          if (program) {
            event.preventDefault();
            const pad = program.pads.find((p) => p.id === padId);
            if (pad?.sample) {
              // Trigger via the PadGrid's audio engine
              // We'll simulate a click with medium velocity
              const padButton = document.querySelector(`[data-pad-id="${padId}"]`) as HTMLElement;
              padButton?.click();
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
  }, [programs, currentProgramId, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in-0 duration-300">
      <div className="bg-dark-surface border border-dark-border rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-8 duration-400">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <div>
            <h2 className="text-xl font-bold text-white">Drum Pad Manager</h2>
            <p className="text-sm text-text-muted">MPC-inspired 16-pad drum machine</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-dark-border rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-text-muted" />
            </button>
          )}
        </div>

        {/* Main content area */}
        <ErrorBoundary fallbackMessage="An error occurred in the drum pad interface.">
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-6">
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

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    onClick={handleNewProgram}
                    className="px-3 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white text-xs font-bold rounded transition-colors"
                  >
                    + New
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
            <SampleBrowser
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
};
