/**
 * DrumPadManager - Main drum pad interface container
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDrumPadKeyboard } from '@/hooks/drumpad/useDrumPadKeyboard';
import { PadGrid } from './PadGrid';
import { PadEditor } from './PadEditor';
import { PadSetupWizard } from './PadSetupWizard';
import { usePadSetupWizard } from '@/hooks/drumpad/usePadSetupWizard';
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
import { useTransportStore } from '../../stores/useTransportStore';
import { useDJStore } from '../../stores/useDJStore';
import { X, Download, Piano, Maximize2, Minimize2 } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { CustomSelect } from '@components/common/CustomSelect';
import { PAD_COLOR_PRESETS } from '@/constants/padColorPresets';
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

  const padWizard = usePadSetupWizard();

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

  // Performance mode: fullscreen pads with minimal UI
  const [performanceMode, setPerformanceMode] = useState(false);

  // DJ presets — action-only select (no persistent selection)

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

  const handleEmptyPadClick = useCallback((padId: number) => {
    setSelectedPadId(padId);
    padWizard.open(padId);
  }, [padWizard]);

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

      // Load kit and create instruments
      const createdIds = loadKitSource(
        selectedSource,
        allSamplePacks,
        createInstrument
      );

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
                MPC-style 64-pad drum machine
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
            {!performanceMode && (
              <button
                onClick={() => useUIStore.getState().openModal('midi-pads')}
                className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text-primary bg-dark-bgTertiary border border-dark-border rounded transition-colors flex items-center gap-1.5"
                title="Open MIDI Pad Mapper"
              >
                <Piano className="w-3.5 h-3.5" />
                MIDI Map
              </button>
            )}
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
                  onEmptyPadClick={handleEmptyPadClick}
                  selectedPadId={selectedPadId}
                  performanceMode
                />
              </div>
            </div>
          ) : (
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
            {/* Left: Pad Grid (takes 2 columns on large screens) */}
            <div className="lg:col-span-2">
              <div className="bg-dark-bg border border-dark-border rounded-lg">
                <PadGrid
                  onPadSelect={setSelectedPadId}
                  onEmptyPadClick={handleEmptyPadClick}
                  selectedPadId={selectedPadId}
                />
              </div>
            </div>

            {/* Right: Controls and Info */}
            <div className="space-y-3 overflow-y-auto max-h-full">
              {/* Program Selector (compact) */}
              <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                <div className="text-[10px] font-mono text-text-muted mb-1.5">PROGRAM</div>
                <CustomSelect
                  value={currentProgramId}
                  onChange={(v) => handleProgramChange(v)}
                  options={Array.from(programs.entries()).map(([id, program]) => ({
                    value: id,
                    label: `${id} - ${program.name}`,
                  }))}
                  className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />

                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  <button onClick={handleNewProgram}
                    className="px-2 py-1.5 bg-accent-primary hover:bg-accent-primary/80 text-text-primary text-[10px] font-bold rounded transition-colors">
                    + New
                  </button>
                  <button onClick={handleCopyProgram}
                    className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-text-primary text-[10px] font-bold rounded transition-colors">
                    Copy
                  </button>
                  <button onClick={handleDeleteProgram}
                    className="px-2 py-1.5 bg-red-600 hover:bg-red-700 text-text-primary text-[10px] font-bold rounded transition-colors"
                    disabled={programs.size <= 1}>
                    Delete
                  </button>
                </div>
              </div>

              {/* ── Inline Pad Quick-Edit ──────────────────────────────── */}
              <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                {selectedPadId !== null ? (() => {
                  const selectedPad = programs.get(currentProgramId)?.pads.find(p => p.id === selectedPadId);
                  if (!selectedPad) return null;
                  const { updatePad, clearPad } = useDrumPadStore.getState();
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-text-muted">PAD {selectedPadId}</span>
                        {selectedPad.synthConfig && (
                          <span className="text-[9px] font-mono text-blue-400 bg-blue-400/10 px-1 rounded">{selectedPad.synthConfig.synthType}</span>
                        )}
                        {selectedPad.sample && (
                          <span className="text-[9px] font-mono text-emerald-400 bg-emerald-400/10 px-1 rounded">{selectedPad.sample.name}</span>
                        )}
                      </div>
                      <input value={selectedPad.name}
                        onChange={(e) => updatePad(selectedPadId, { name: e.target.value })}
                        className="w-full px-2 py-1 text-xs font-mono bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary" placeholder="Pad name" />
                      <div>
                        <div className="flex justify-between text-[10px] font-mono text-text-muted mb-0.5"><span>Level</span><span>{selectedPad.level}</span></div>
                        <input type="range" min="0" max="127" value={selectedPad.level}
                          onChange={(e) => updatePad(selectedPadId, { level: parseInt(e.target.value) })} className="w-full accent-accent-primary" />
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] font-mono text-text-muted mb-0.5"><span>Tune</span><span>{(selectedPad.tune / 10).toFixed(1)} st</span></div>
                        <input type="range" min="-120" max="120" value={selectedPad.tune}
                          onChange={(e) => updatePad(selectedPadId, { tune: parseInt(e.target.value) })} className="w-full accent-accent-primary" />
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-text-muted mb-1">Mode</div>
                        <div className="flex gap-1.5">
                          {(['oneshot', 'sustain'] as const).map(m => (
                            <button key={m} onClick={() => updatePad(selectedPadId, { playMode: m })}
                              className={`flex-1 px-2 py-1 text-[10px] font-mono rounded border transition-all ${
                                selectedPad.playMode === m ? 'border-accent-primary bg-accent-primary/10 text-accent-primary font-bold' : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:border-text-muted'
                              }`}>{m === 'oneshot' ? 'One-shot' : 'Sustain'}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-text-muted mb-1">Mute Group</div>
                        <div className="flex gap-1">
                          {[0,1,2,3,4,5,6,7,8].map(g => (
                            <button key={g} onClick={() => updatePad(selectedPadId, { muteGroup: g })}
                              className={`w-6 h-6 text-[9px] font-mono rounded border transition-all ${
                                selectedPad.muteGroup === g ? 'border-accent-primary bg-accent-primary/10 text-accent-primary font-bold' : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:border-text-muted'
                              }`}>{g === 0 ? '-' : g}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-text-muted mb-1">Color</div>
                        <div className="flex gap-1.5 flex-wrap">
                          <button onClick={() => updatePad(selectedPadId, { color: undefined })}
                            className={`w-5 h-5 rounded border-2 transition-all ${!selectedPad.color ? 'border-accent-primary' : 'border-dark-borderLight hover:border-text-muted'}`}
                            style={{ backgroundColor: '#1e293b' }} title="Default" />
                          {PAD_COLOR_PRESETS.map(c => (
                            <button key={c.id} onClick={() => updatePad(selectedPadId, { color: c.hex })}
                              className={`w-5 h-5 rounded border-2 transition-all ${selectedPad.color === c.hex ? 'border-white' : 'border-transparent hover:border-white/30'}`}
                              style={{ backgroundColor: c.hex }} title={c.label} />
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setShowPadEditor(true)}
                          className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-text-primary text-[10px] font-bold rounded transition-colors">Full Editor</button>
                        <button onClick={() => clearPad(selectedPadId)}
                          className="px-2 py-1.5 bg-dark-bgTertiary hover:bg-accent-error/20 text-accent-error text-[10px] font-mono rounded border border-dark-borderLight transition-colors">Clear</button>
                      </div>
                    </div>
                  );
                })() : (
                  <div className="flex items-center justify-center py-6 text-text-muted">
                    <span className="text-[10px] font-mono">Click a pad to edit</span>
                  </div>
                )}
              </div>

              {/* ── Advanced Toggle ──────────────────────────────────────── */}
              <label className="flex items-center gap-2 px-1 cursor-pointer">
                <input type="checkbox" checked={preferences.showAdvanced}
                  onChange={(e) => setPreference('showAdvanced', e.target.checked)}
                  className="rounded border-dark-border bg-dark-surface text-accent-primary focus:ring-accent-primary" />
                <span className="text-[10px] font-mono text-text-muted">Advanced</span>
              </label>

              {/* ── Advanced Sections ────────────────────────────────────── */}
              {preferences.showAdvanced && (<>
                <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                  <div className="text-[10px] font-mono text-text-muted mb-1.5">KIT SOURCE</div>
                  <CustomSelect value={selectedKitSourceId} onChange={(v) => setSelectedKitSourceId(v)}
                    options={allKitSources.map(s => ({ value: s.id, label: s.name }))}
                    className="w-full bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary" />
                  <button onClick={handleLoadKit}
                    className="w-full mt-2 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-text-primary text-[10px] font-bold rounded transition-colors flex items-center justify-center gap-1">
                    <Download className="w-3 h-3" /> Load Kit
                  </button>
                </div>
                <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                  <div className="text-[10px] font-mono text-text-muted mb-2">MASTER</div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-text-muted mb-0.5">
                        <span>Level</span><span>{localMasterLevel !== null ? localMasterLevel : (programs.get(currentProgramId)?.masterLevel || 100)}</span>
                      </div>
                      <input type="range" min="0" max="127" value={localMasterLevel !== null ? localMasterLevel : (programs.get(currentProgramId)?.masterLevel || 100)}
                        onChange={(e) => handleMasterLevelChange(parseInt(e.target.value))} className="w-full accent-accent-primary" />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-text-muted mb-0.5">
                        <span>Tune</span><span>{localMasterTune !== null ? localMasterTune : (programs.get(currentProgramId)?.masterTune || 0)} st</span>
                      </div>
                      <input type="range" min="-12" max="12" value={localMasterTune !== null ? localMasterTune : (programs.get(currentProgramId)?.masterTune || 0)}
                        onChange={(e) => handleMasterTuneChange(parseInt(e.target.value))} className="w-full accent-accent-primary" />
                    </div>
                  </div>
                </div>
                {(() => {
                  const currentProg = programs.get(currentProgramId);
                  const busesInUse = ['out1', 'out2', 'out3', 'out4'].filter(bus => currentProg?.pads.some(p => p.output === bus));
                  if (busesInUse.length === 0) return null;
                  return (
                    <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                      <div className="text-[10px] font-mono text-text-muted mb-2">OUTPUT BUSES</div>
                      <div className="space-y-2">
                        {busesInUse.map(bus => (
                          <div key={bus}>
                            <div className="flex justify-between text-[10px] font-mono text-text-muted mb-0.5"><span>{bus}</span><span>{busLevels[bus] ?? 100}</span></div>
                            <input type="range" min="0" max="127" value={busLevels[bus] ?? 100}
                              onChange={(e) => setBusLevel(bus, parseInt(e.target.value))} className="w-full accent-accent-primary" />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                  <div className="text-[10px] font-mono text-text-muted mb-2">SETTINGS</div>
                  <div className="flex justify-between text-[10px] font-mono text-text-muted mb-0.5">
                    <span>Velocity Sensitivity</span><span>{preferences.velocitySensitivity.toFixed(1)}x</span>
                  </div>
                  <input type="range" min="0" max="2" step="0.1" value={preferences.velocitySensitivity}
                    onChange={(e) => setPreference('velocitySensitivity', parseFloat(e.target.value))} className="w-full accent-accent-primary" />
                </div>
                <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                  <div className="text-[10px] font-mono text-text-muted mb-2">NOTE REPEAT</div>
                  <label className="flex items-center gap-2 text-[10px] text-text-muted cursor-pointer mb-2">
                    <input type="checkbox" checked={noteRepeatEnabled} onChange={(e) => setNoteRepeatEnabled(e.target.checked)}
                      className="rounded border-dark-border bg-dark-surface text-accent-primary focus:ring-accent-primary" /> Enable
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {(['1/4', '1/8', '1/16', '1/32', '1/8T', '1/16T'] as const).map(rate => (
                      <button key={rate} onClick={() => setNoteRepeatRate(rate)}
                        className={`px-2 py-0.5 text-[9px] font-mono rounded transition-colors ${noteRepeatRate === rate ? 'bg-accent-primary text-text-primary' : 'bg-dark-surface border border-dark-border text-text-muted hover:text-text-primary'}`}>
                        {rate}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                  <div className="text-[10px] font-mono text-text-muted mb-2">MPC RESAMPLING</div>
                  <label className="flex items-center gap-2 text-[10px] text-text-muted cursor-pointer mb-2">
                    <input type="checkbox" checked={programs.get(currentProgramId)?.mpcResample?.enabled ?? false}
                      onChange={(e) => { const cp = programs.get(currentProgramId); if (cp) saveProgram({ ...cp, mpcResample: { enabled: e.target.checked, model: cp.mpcResample?.model ?? 'MPC60' } }); }}
                      className="rounded border-dark-border bg-dark-surface text-accent-primary focus:ring-accent-primary" /> Enable on sample load
                  </label>
                  {programs.get(currentProgramId)?.mpcResample?.enabled && (
                    <CustomSelect value={programs.get(currentProgramId)?.mpcResample?.model ?? 'MPC60'}
                      onChange={(v) => { const cp = programs.get(currentProgramId); if (cp) saveProgram({ ...cp, mpcResample: { enabled: true, model: v as MpcResampleConfig['model'] } }); }}
                      options={[
                        { value: 'MPC60', label: 'MPC 60 (12-bit, 40kHz)' },
                        { value: 'MPC3000', label: 'MPC 3000 (16-bit, 44.1kHz)' },
                        { value: 'SP1200', label: 'SP-1200 (12-bit, 26kHz)' },
                        { value: 'MPC2000XL', label: 'MPC 2000XL (16-bit, 44.1kHz)' },
                      ]}
                      className="w-full bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-[10px] text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono" />
                  )}
                </div>
              </>)}
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
            <div className="max-w-2xl w-full mx-4 max-h-[85vh] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-300">
              <PadEditor
                padId={selectedPadId}
                onClose={() => setShowPadEditor(false)}
              />
            </div>
          </div>
        )}

        {/* Pad Setup Wizard */}
        <PadSetupWizard wizard={padWizard} />

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
