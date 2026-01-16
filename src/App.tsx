/**
 * App - Main application component
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { AppLayout } from '@components/layout/AppLayout';
import { TrackerView } from '@components/tracker/TrackerView';
import { InstrumentModal } from '@components/instruments/InstrumentModal';
import { AutomationPanel } from '@components/automation/AutomationPanel';
import { HelpModal } from '@components/help/HelpModal';
import { ExportDialog } from '@lib/export/ExportDialog';
import { PatternManagement } from '@components/pattern/PatternManagement';
import { MasterEffectsModal, EffectParameterEditor } from '@components/effects';
import { TD3PatternDialog } from '@components/midi/TD3PatternDialog';
import { useAudioStore, useTrackerStore, useUIStore } from './stores';
import { useMIDIStore } from './stores/useMIDIStore';
import { useHistoryStore } from './stores/useHistoryStore';
import { useLiveModeStore } from './stores/useLiveModeStore';
import { useButtonMappings } from './hooks/midi/useButtonMappings';
import { useProjectPersistence } from './hooks/useProjectPersistence';
import { getToneEngine } from '@engine/ToneEngine';
import type { EffectConfig } from './types/instrument';
import { ChevronDown, ChevronUp, Zap, Music, Sliders, Download, List } from 'lucide-react';
import { ToastNotification } from '@components/ui/ToastNotification';

function App() {
  const { initialized, contextState, setInitialized, setContextState, setToneEngineInstance, setAnalyserNode, setFFTNode } = useAudioStore();
  const [initError, setInitError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showAutomation, setShowAutomation] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);
  const [showMasterFX, setShowMasterFX] = useState(false);
  const [editingEffect, setEditingEffect] = useState<{ effect: EffectConfig; channelIndex: number | null } | null>(null);
  const [showInstrumentModal, setShowInstrumentModal] = useState(false);
  const automationPanelRef = useRef<HTMLDivElement>(null);

  const { showPatternDialog: showTD3Pattern, closePatternDialog } = useMIDIStore();
  const { applyAutoCompact } = useUIStore();

  // Register MIDI button mappings for transport/navigation control
  useButtonMappings();

  const { updateMasterEffect } = useAudioStore();

  // Apply auto-compact mode on small screens (runs once on mount)
  useEffect(() => {
    applyAutoCompact();
  }, [applyAutoCompact]);

  // Close automation panel when clicking outside
  useEffect(() => {
    if (!showAutomation) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the automation panel and toggle button
      if (
        automationPanelRef.current &&
        !automationPanelRef.current.contains(target) &&
        !target.closest('[data-automation-toggle]')
      ) {
        setShowAutomation(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAutomation]);
  const { save: saveProject } = useProjectPersistence();

  useEffect(() => {
    // Initialize audio engine
    const initAudio = async () => {
      try {
        const engine = getToneEngine();

        // Store engine instance in store
        setToneEngineInstance(engine);
        setAnalyserNode(engine.analyser);
        setFFTNode(engine.fft);

        // Set initial context state
        setContextState(engine.getContextState() as 'suspended' | 'running' | 'closed');
        setInitialized(true);

        console.log('ToneEngine initialized');
      } catch (error) {
        console.error('Failed to initialize audio engine:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    initAudio();
  }, []);

  // Get undo/redo functions from history store
  const { undo, redo, canUndo, canRedo } = useHistoryStore();
  const { replacePattern, currentPatternIndex } = useTrackerStore();

  // Handle undo action
  const handleUndo = useCallback(() => {
    if (!canUndo()) return;
    const pattern = undo();
    if (pattern) {
      replacePattern(currentPatternIndex, pattern);
    }
  }, [undo, canUndo, replacePattern, currentPatternIndex]);

  // Handle redo action
  const handleRedo = useCallback(() => {
    if (!canRedo()) return;
    const pattern = redo();
    if (pattern) {
      replacePattern(currentPatternIndex, pattern);
    }
  }, [redo, canRedo, replacePattern, currentPatternIndex]);

  // Keyboard shortcuts (global level - only handle non-tracker keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+Shift+Z or Ctrl+Y: Redo
      if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
          ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Ctrl+S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveProject();
        return;
      }

      // Escape: Close modals (highest priority)
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showHelp) setShowHelp(false);
        else if (showExport) setShowExport(false);
        else if (showPatterns) setShowPatterns(false);
        return;
      }

      // Shift+/: Help (? key)
      if (e.shiftKey && e.key === '?') {
        e.preventDefault();
        setShowHelp(true);
        return;
      }

      // Ctrl+Shift+E: Export (changed to avoid conflict with common editor shortcuts)
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        setShowExport(true);
        return;
      }

      // Ctrl+Shift+P: Patterns (changed to avoid conflict with browser commands)
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setShowPatterns(!showPatterns);
        return;
      }

      // L: Toggle Live Mode
      if (e.key === 'l' || e.key === 'L') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          useLiveModeStore.getState().toggleLiveMode();
          return;
        }
      }

      // 1-9: Queue patterns in Live Mode
      const keyNum = parseInt(e.key);
      if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 9) {
        const liveModeState = useLiveModeStore.getState();
        if (liveModeState.isLiveMode && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const patternIndex = keyNum - 1; // 1 = pattern 0, 9 = pattern 8
          const patterns = useTrackerStore.getState().patterns;
          if (patternIndex < patterns.length) {
            liveModeState.queuePattern(patternIndex);
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPatterns, showHelp, showExport, handleUndo, handleRedo, saveProject]);

  const handleUpdateEffectParameter = (key: string, value: number) => {
    if (!editingEffect) return;
    const updatedParams = { ...editingEffect.effect.parameters, [key]: value };
    updateMasterEffect(editingEffect.effect.id, { parameters: updatedParams });
    setEditingEffect({
      ...editingEffect,
      effect: { ...editingEffect.effect, parameters: updatedParams }
    });
  };

  const handleUpdateEffectWet = (wet: number) => {
    if (!editingEffect) return;
    updateMasterEffect(editingEffect.effect.id, { wet });
    setEditingEffect({
      ...editingEffect,
      effect: { ...editingEffect.effect, wet }
    });
  };

  // Handler to start audio context on user interaction
  const handleStartAudio = async () => {
    try {
      const engine = getToneEngine();
      await engine.init();
      setContextState(engine.getContextState() as 'suspended' | 'running' | 'closed');
      setShowWelcome(false); // Show tracker after audio starts
    } catch (error) {
      console.error('Failed to start audio context:', error);
      setInitError(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  if (initError) {
    return (
      <div className="h-screen flex items-center justify-center bg-dark-bg text-text-primary">
        <div className="panel p-8 max-w-md">
          <h2 className="text-xl font-bold text-accent-error mb-4">Audio Initialization Error</h2>
          <p className="text-text-secondary mb-4">{initError}</p>
          <button className="btn-primary" onClick={() => window.location.reload()}>
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-dark-bg text-text-primary">
        <div className="panel p-8">
          <div className="flex items-center gap-3 text-accent-primary">
            <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            <span>Initializing audio engine...</span>
          </div>
        </div>
      </div>
    );
  }

  // Show welcome screen if audio context hasn't been started
  if (showWelcome && contextState !== 'running') {
    return (
      <AppLayout>
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="text-center max-w-2xl">
            {/* Logo */}
            <div className="mb-8">
              <h1 className="text-5xl font-bold text-text-primary mb-2 tracking-tight">
                DEViLBOX
              </h1>
              <p className="text-lg text-text-secondary">
                TB-303 Acid Tracker with Devil Fish Mod
              </p>
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartAudio}
              className="group relative px-8 py-4 bg-accent-primary text-text-inverse font-semibold text-lg rounded-lg
                         hover:bg-emerald-400 transition-all duration-200 shadow-glow hover:shadow-glow
                         animate-pulse-glow"
            >
              <span className="flex items-center gap-2">
                <Zap size={20} />
                Start Audio Engine
              </span>
            </button>

            {/* Features Grid */}
            <div className="mt-12 grid grid-cols-2 gap-4 text-left">
              <div className="card p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-md bg-accent-primary/20 text-accent-primary">
                    <Music size={18} />
                  </div>
                  <h3 className="font-semibold text-text-primary">22 Synth Engines</h3>
                </div>
                <p className="text-sm text-text-secondary">
                  Including authentic TB-303 with accent and slide
                </p>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-md bg-accent-secondary/20 text-accent-secondary">
                    <List size={18} />
                  </div>
                  <h3 className="font-semibold text-text-primary">Pattern Editor</h3>
                </div>
                <p className="text-sm text-text-secondary">
                  4-16 channels with FT2-style keyboard layout
                </p>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-md bg-accent-warning/20 text-accent-warning">
                    <Sliders size={18} />
                  </div>
                  <h3 className="font-semibold text-text-primary">Automation</h3>
                </div>
                <p className="text-sm text-text-secondary">
                  Real-time parameter curves for filter sweeps
                </p>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-md bg-accent-success/20 text-accent-success">
                    <Download size={18} />
                  </div>
                  <h3 className="font-semibold text-text-primary">36+ Presets</h3>
                </div>
                <p className="text-sm text-text-secondary">
                  Factory sounds for instant acid basslines
                </p>
              </div>
            </div>

            {/* Keyboard hint */}
            <p className="mt-8 text-sm text-text-muted">
              Press <kbd className="px-2 py-0.5 rounded bg-dark-bgTertiary border border-dark-border text-text-secondary">?</kbd> anytime for help
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Show main tracker interface
  return (
    <AppLayout>
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top: Main workspace */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left side - Pattern Editor (expands when instrument panel is hidden) */}
          <div className="flex flex-col min-h-0 flex-1">
            {/* Pattern Management (optional) */}
            {showPatterns && (
              <div className="h-48 border-b border-dark-border animate-fade-in">
                <PatternManagement />
              </div>
            )}
            {/* Pattern Editor */}
            <div className="flex-1 min-h-0">
              <TrackerView
                onShowPatterns={() => setShowPatterns(!showPatterns)}
                onShowExport={() => setShowExport(true)}
                onShowHelp={() => setShowHelp(true)}
                onShowMasterFX={() => setShowMasterFX(!showMasterFX)}
                onShowInstruments={() => setShowInstrumentModal(true)}
                showPatterns={showPatterns}
                showMasterFX={showMasterFX}
              />
            </div>
          </div>

        </div>

        {/* Bottom: Automation Panel (toggleable) */}
        {showAutomation && (
          <div
            ref={automationPanelRef}
            className="h-80 flex-shrink-0 border-t border-dark-border overflow-y-auto scrollbar-modern animate-fade-in"
          >
            <AutomationPanel />
          </div>
        )}

        {/* Automation Toggle Button */}
        <button
          data-automation-toggle
          onClick={() => setShowAutomation(!showAutomation)}
          className={`
            w-full px-4 py-2 flex items-center justify-between text-sm font-medium
            border-t border-dark-border transition-all duration-150
            ${showAutomation
              ? 'bg-dark-bgTertiary text-accent-primary'
              : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary hover:bg-dark-bgTertiary'
            }
          `}
        >
          <span className="flex items-center gap-2">
            <Sliders size={16} />
            Automation Editor
          </span>
          {showAutomation ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {/* Modals */}
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
      <ExportDialog isOpen={showExport} onClose={() => setShowExport(false)} />
      <InstrumentModal isOpen={showInstrumentModal} onClose={() => setShowInstrumentModal(false)} />
      <MasterEffectsModal isOpen={showMasterFX} onClose={() => setShowMasterFX(false)} />
      <TD3PatternDialog isOpen={showTD3Pattern} onClose={closePatternDialog} />

      {/* Effect Parameter Editor Modal */}
      {editingEffect && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
          <div className="max-w-md w-full mx-4 animate-slide-in-up">
            <EffectParameterEditor
              effect={editingEffect.effect}
              onUpdateParameter={handleUpdateEffectParameter}
              onUpdateWet={handleUpdateEffectWet}
              onClose={() => setEditingEffect(null)}
            />
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <ToastNotification />
    </AppLayout>
  );
}

export default App;
