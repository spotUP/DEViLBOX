/**
 * DrumPadManager - Main drum pad interface container
 */

import React, { useState, useCallback, useEffect } from 'react';
import { PadGrid } from './PadGrid';
import { PadEditor } from './PadEditor';
import { SampleBrowser } from './SampleBrowser';
import { ConfirmDialog } from './ConfirmDialog';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import type { SampleData } from '../../types/drumpad';
import { X } from 'lucide-react';

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

  const {
    programs,
    currentProgramId,
    loadProgram,
    createProgram,
    deleteProgram,
    loadSampleToPad,
    saveProgram,
  } = useDrumPadStore();

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

  const handleMasterLevelChange = useCallback((level: number) => {
    const currentProgram = programs.get(currentProgramId);
    if (currentProgram) {
      saveProgram({
        ...currentProgram,
        masterLevel: level,
      });
    }
  }, [programs, currentProgramId, saveProgram]);

  const handleMasterTuneChange = useCallback((tune: number) => {
    const currentProgram = programs.get(currentProgramId);
    if (currentProgram) {
      saveProgram({
        ...currentProgram,
        masterTune: tune,
      });
    }
  }, [programs, currentProgramId, saveProgram]);

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
      const key = event.key.toLowerCase();
      const padId = keyMap[key];

      if (padId) {
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

      // Escape to close
      if (event.key === 'Escape' && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [programs, currentProgramId, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-dark-surface border border-dark-border rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
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
              </div>

              {/* Master Controls */}
              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <div className="text-xs font-mono text-text-muted mb-3">MASTER</div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-text-muted">
                      Level: {programs.get(currentProgramId)?.masterLevel || 100}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="127"
                      value={programs.get(currentProgramId)?.masterLevel || 100}
                      onChange={(e) => handleMasterLevelChange(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted">
                      Tune: {programs.get(currentProgramId)?.masterTune || 0} st
                    </label>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      value={programs.get(currentProgramId)?.masterTune || 0}
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

        {/* Sample Browser Modal */}
        {showSampleBrowser && (
          <SampleBrowser
            onSelectSample={handleLoadSample}
            onClose={() => setShowSampleBrowser(false)}
          />
        )}

        {/* Pad Editor Modal */}
        {showPadEditor && selectedPadId !== null && (
          <div className="fixed inset-0 z-50 bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center">
            <div className="max-w-2xl w-full mx-4">
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
