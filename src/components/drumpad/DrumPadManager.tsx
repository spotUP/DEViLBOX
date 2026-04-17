/**
 * DrumPadManager - Main drum pad interface container
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useDrumPadKeyboard } from '@/hooks/drumpad/useDrumPadKeyboard';
import { PadGrid } from './PadGrid';
import { PadEditor } from './PadEditor';
import { MpkStatusBar } from './MpkStatusBar';
import { SamplePackBrowser } from '../instruments/SamplePackBrowser';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorBoundary } from './ErrorBoundary';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import type { SampleData } from '../../types/drumpad';
import { useTransportStore } from '../../stores/useTransportStore';
import { useDJStore } from '../../stores/useDJStore';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { CustomSelect } from '@components/common/CustomSelect';
import { DJ_PAD_PRESETS } from '../../constants/djPadPresets';


/** Mini performance status: BPM + active deck letters */
const PerformanceStatus: React.FC = () => {
  const bpm = useTransportStore(s => s.bpm);
  const decks = useDJStore(s => s.decks);
  const activeLetters = Object.entries(decks)
    .filter(([, d]) => d.isPlaying)
    .map(([id]) => id.toUpperCase());
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="text-accent-primary font-bold">{bpm} BPM</span>
      {activeLetters.length > 0 && (
        <span className="text-text-muted">
          Deck {activeLetters.join('+')}
        </span>
      )}
    </div>
  );
};

interface DrumPadManagerProps {
  onClose?: () => void;
}

export const DrumPadManager: React.FC<DrumPadManagerProps> = ({ onClose }) => {
  // Register keyboard shortcuts for drum pad view
  useDrumPadKeyboard();

  const [selectedPadId, setSelectedPadId] = useState<number | null>(null);
  const [showSampleBrowser, setShowSampleBrowser] = useState(false);
  const [showPadEditor, setShowPadEditor] = useState(false);
  const [padEditorShowSamples, setPadEditorShowSamples] = useState(false);
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

  // Performance mode: fullscreen pads with minimal UI
  const [performanceMode, setPerformanceMode] = useState(false);

  // DJ presets — action-only select (no persistent selection)

  const {
    programs,
    currentProgramId,
    loadProgram,
    createProgram,
    deleteProgram,
    copyProgram,
    loadSampleToPad,
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

  const handleLoadDJPreset = useCallback((presetId: string) => {
    const preset = DJ_PAD_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const program = preset.create();
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[handleLoadDJPreset] Loading preset', {
        presetId,
        presetName: preset.name,
        programId: program.id,
        programName: program.name,
        padCount: program.pads.filter(p => p.djFxAction || p.synthConfig || p.scratchAction || p.sample).length,
        bankAPads: program.pads.slice(0, 16).map((p) => ({
          id: p.id,
          name: p.name,
          hasDjFx: !!p.djFxAction,
          hasSynth: !!p.synthConfig,
          djFxAction: p.djFxAction
        }))
      });
    }
    
    useDrumPadStore.getState().saveProgram(program);
    loadProgram(program.id);
    
    // Auto-switch to Bank A since presets load into Bank A
    useDrumPadStore.getState().setBank('A');
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[handleLoadDJPreset] After loading, current program:', {
        currentProgramId: useDrumPadStore.getState().currentProgramId,
        currentBank: useDrumPadStore.getState().currentBank
      });
    }
  }, [loadProgram]);

  // Escape key handler — pad triggering handled by useDrumPadKeyboard hook
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape to close (always works, even in inputs)
      if (event.key === 'Escape') {
        if (performanceMode) {
          setPerformanceMode(false);
        } else if (onClose) {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, performanceMode]);

  // Determine if we're rendered as a full view (no onClose) or as a modal
  const isViewMode = !onClose;

  const content = (
    <div className={
      isViewMode
        ? 'flex flex-col h-full w-full overflow-hidden select-none bg-dark-bg font-mono'
        : 'fixed inset-0 z-[99990] bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in-0 duration-300'
    }>
      <div className={
        isViewMode
          ? 'flex flex-col h-full w-full overflow-hidden'
          : 'bg-dark-surface border border-dark-border rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-8 duration-400'
      }>
        {/* Header / Top Bar */}
        <div className={`flex items-center justify-between px-4 py-2 shrink-0 border-b border-dark-border ${
          performanceMode ? 'bg-dark-bg' : 'bg-dark-bgSecondary'
        }`}>
          <div className="flex items-center gap-3">
            {isViewMode && !performanceMode && (
              <>
                <CustomSelect
                  value="drumpad"
                  onChange={(val) => {
                    if (val !== 'drumpad') {
                      useUIStore.getState().setActiveView(val as any);
                    }
                  }}
                  options={[
                    { value: 'tracker', label: 'Tracker' },
                    { value: 'grid', label: 'Grid' },
                    { value: 'tb303', label: 'TB-303' },
                    { value: 'dj', label: 'DJ Mixer' },
                    { value: 'drumpad', label: 'Drum Pads' },
                    { value: 'vj', label: 'VJ View' },
                  ]}
                  className="px-3 py-1.5 rounded-md text-xs font-mono font-bold tracking-widest uppercase border transition-all cursor-pointer border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"
                  title="Switch view"
                />
                <div className="h-4 w-px bg-dark-border" />
              </>
            )}
            <span className="font-mono text-sm font-bold tracking-widest uppercase text-accent-primary">
              {performanceMode ? 'LIVE' : 'DRUM PADS'}
            </span>
            {!performanceMode && (
              <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
                8 MPK slots · 2 banks · 8 pads each
              </span>
            )}
            {performanceMode && <PerformanceStatus />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPerformanceMode(!performanceMode)}
              className={`px-3 py-1.5 text-xs font-mono border rounded transition-colors flex items-center gap-1.5 ${
                performanceMode
                  ? 'bg-accent-primary text-text-primary border-accent-primary'
                  : 'text-text-muted hover:text-text-primary bg-dark-bgTertiary border-dark-border'
              }`}
              title={performanceMode ? 'Exit performance mode (Esc)' : 'Performance mode — fullscreen pads'}
            >
              {performanceMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {performanceMode ? 'EXIT' : 'PERFORM'}
            </button>
            {onClose && !performanceMode && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-dark-border rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-text-muted" />
              </button>
            )}
          </div>
        </div>

        {/* MPK-aligned status bar (slots 1-8, program name, bank A/B, knob labels) */}
        {!performanceMode && <MpkStatusBar />}

        {/* Preset strip */}
        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-dark-border bg-dark-bg shrink-0">
          <span className="text-[10px] font-mono text-text-muted mr-1">PRESETS</span>
          <CustomSelect
            value=""
            onChange={handleLoadDJPreset}
            placeholder="Load Preset..."
            options={DJ_PAD_PRESETS.map(p => ({ value: p.id, label: p.name }))}
            className="px-2.5 py-1 text-[10px] font-mono font-bold rounded transition-colors bg-dark-bgTertiary border border-dark-border text-text-muted hover:text-text-primary hover:border-accent-highlight/50 cursor-pointer"
          />
        </div>

        {/* Main content area */}
        <ErrorBoundary fallbackMessage="An error occurred in the drum pad interface.">
          {performanceMode ? (
            /* Performance Mode: fullscreen pads with minimal controls */
            <div className="flex-1 flex items-center justify-center overflow-auto">
              <div style={{ width: '100%', maxWidth: 'min(900px, calc(100vh - 176px))' }}>
                <PadGrid
                  onPadSelect={setSelectedPadId}
                  selectedPadId={selectedPadId}
                  performanceMode
                />
              </div>
            </div>
          ) : (
          <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
            <div className="flex flex-col gap-2 px-4 pt-3 pb-1 shrink-0">
              {/* Compact program bar */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-text-muted shrink-0">PGM</span>
                <CustomSelect
                  value={currentProgramId}
                  onChange={(v) => handleProgramChange(v)}
                  options={Array.from(programs.entries()).map(([id, program]) => ({
                    value: id,
                    label: `${id} - ${program.name}`,
                  }))}
                  className="flex-1 bg-dark-bgTertiary border border-dark-borderLight rounded px-2 py-1 text-xs text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-primary"
                />
                <button onClick={handleNewProgram}
                  className="px-2 py-1 bg-accent-primary hover:bg-accent-primary/80 text-text-primary text-[10px] font-bold rounded transition-colors shrink-0">
                  + New
                </button>
                <button onClick={handleCopyProgram}
                  className="px-2 py-1 bg-accent-secondary hover:bg-accent-secondary/80 text-text-primary text-[10px] font-bold rounded transition-colors shrink-0">
                  Copy
                </button>
                <button onClick={handleDeleteProgram}
                  className="px-2 py-1 bg-accent-error hover:bg-accent-error/80 text-text-primary text-[10px] font-bold rounded transition-colors shrink-0"
                  disabled={programs.size <= 1}>
                  Del
                </button>
              </div>
            </div>
            {/* Pad grid — fills remaining height */}
            <div className="flex-1 min-h-0 px-4 pb-3">
              <div className="bg-dark-bg border border-dark-border rounded-lg h-full">
                <PadGrid
                  onPadSelect={(id) => {
                    setSelectedPadId(id);
                    setPadEditorShowSamples(false);
                    setShowPadEditor(true);
                  }}
                  onLoadSample={(id) => {
                    setSelectedPadId(id);
                    setPadEditorShowSamples(true);
                    setShowPadEditor(true);
                  }}
                  selectedPadId={selectedPadId}
                />
              </div>
            </div>
          </div>
          )}
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
          <div
            className="fixed inset-0 z-[99990] bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in-0 duration-200"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setShowPadEditor(false); }}
          >
            <div className="max-w-6xl w-full mx-4 max-h-[95vh]">
              <PadEditor
                padId={selectedPadId}
                onClose={() => setShowPadEditor(false)}
                initialShowSampleBrowser={padEditorShowSamples}
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
