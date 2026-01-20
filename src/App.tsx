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
import { MasterEffectsModal, EffectParameterEditor } from '@components/effects';
import { TD3PatternDialog } from '@components/midi/TD3PatternDialog';
import WhatsNewModal from '@components/dialogs/WhatsNewModal';
import { useWhatsNew } from '@hooks/ui/useWhatsNew';
import { DownloadModal } from '@components/dialogs/DownloadModal';
import { useAudioStore, useTrackerStore, useUIStore } from './stores';
import { useMIDIStore } from './stores/useMIDIStore';
import { useHistoryStore } from './stores/useHistoryStore';
import { useLiveModeStore } from './stores/useLiveModeStore';
import { useButtonMappings } from './hooks/midi/useButtonMappings';
import { useProjectPersistence } from './hooks/useProjectPersistence';
import { useElectronMenu } from './hooks/useElectronMenu';
import { getToneEngine } from '@engine/ToneEngine';
import type { EffectConfig } from './types/instrument';
import { ChevronDown, ChevronUp, Sliders } from 'lucide-react';
import { ToastNotification } from '@components/ui/ToastNotification';

function App() {
  const { initialized, contextState, setInitialized, setContextState, setToneEngineInstance, setAnalyserNode, setFFTNode } = useAudioStore();
  const [initError, setInitError] = useState<string | null>(null);
  const [showAutomation, setShowAutomation] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showMasterFX, setShowMasterFX] = useState(false);
  const [editingEffect, setEditingEffect] = useState<{ effect: EffectConfig; channelIndex: number | null } | null>(null);
  const [showInstrumentModal, setShowInstrumentModal] = useState(false);
  const [showImportModule, setShowImportModule] = useState(false);
  const automationPanelRef = useRef<HTMLDivElement>(null);

  const { showPatternDialog: showTD3Pattern, closePatternDialog } = useMIDIStore();
  const { applyAutoCompact, showDownloadModal, setShowDownloadModal } = useUIStore();
  const { showModal: showWhatsNew, closeModal: closeWhatsNew } = useWhatsNew();

  // Register MIDI button mappings for transport/navigation control
  useButtonMappings();

  // Handle native OS menu actions in Electron
  useElectronMenu({
    onShowExport: () => setShowExport(true),
    onShowHelp: () => setShowHelp(true),
    onShowMasterFX: () => setShowMasterFX(!showMasterFX),
    onShowInstruments: () => setShowInstrumentModal(true),
    onImport: () => setShowImportModule(true),
  });

  const { updateMasterEffect } = useAudioStore();

  // Apply auto-compact mode on small screens (runs once on mount)
  useEffect(() => {
    applyAutoCompact();
  }, [applyAutoCompact]);

  // Handler to start audio context on user interaction
  const handleStartAudio = useCallback(async () => {
    if (contextState === 'running') return;
    try {
      const engine = getToneEngine();
      await engine.init();
      setContextState(engine.getContextState() as 'suspended' | 'running' | 'closed');
      
      // Update visualizer nodes now that they are created
      if (engine.analyser) setAnalyserNode(engine.analyser);
      if (engine.fft) setFFTNode(engine.fft);
      
      console.log('Audio engine started on user interaction');
    } catch (error) {
      console.error('Failed to start audio context:', error);
    }
  }, [contextState, setContextState]);

  // Auto-start audio on first click anywhere in the app
  useEffect(() => {
    const handleFirstInteraction = () => {
      handleStartAudio();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [handleStartAudio]);

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
        
        // Nodes are created on demand, but we should update store if they exist
        if (engine.analyser) setAnalyserNode(engine.analyser);
        if (engine.fft) setFFTNode(engine.fft);

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
  }, [setToneEngineInstance, setAnalyserNode, setFFTNode, setContextState, setInitialized]);

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

      // Ctrl+I: Instrument editor
      if ((e.ctrlKey || e.metaKey) && e.key === 'i' && !e.shiftKey) {
        e.preventDefault();
        setShowInstrumentModal(!showInstrumentModal);
        return;
      }

      // Ctrl+M: Master effects
      if ((e.ctrlKey || e.metaKey) && e.key === 'm' && !e.shiftKey) {
        e.preventDefault();
        setShowMasterFX(!showMasterFX);
        return;
      }

      // Ctrl+Shift+M: Toggle master mute
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        useAudioStore.getState().toggleMasterMute();
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
  }, [showHelp, showExport, showInstrumentModal, showMasterFX, handleUndo, handleRedo, saveProject]);

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

  // Show main tracker interface
  return (
    <AppLayout>
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top: Main workspace */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left side - Pattern Editor (expands when instrument panel is hidden) */}
          <div className="flex flex-col min-h-0 flex-1">
            {/* Pattern Editor */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <TrackerView
                onShowExport={() => setShowExport(true)}
                onShowHelp={() => setShowHelp(true)}
                onShowMasterFX={() => setShowMasterFX(!showMasterFX)}
                onShowInstruments={() => setShowInstrumentModal(true)}
                onShowImportModule={() => setShowImportModule(!showImportModule)}
                showMasterFX={showMasterFX}
                showImportModule={showImportModule}
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
      {showWhatsNew && <WhatsNewModal onClose={closeWhatsNew} />}
      <DownloadModal isOpen={showDownloadModal} onClose={() => setShowDownloadModal(false)} />

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
