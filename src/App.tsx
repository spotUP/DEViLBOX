/**
 * App - Main application component
 */

import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AppLayout } from '@components/layout/AppLayout';
import { TrackerView } from '@components/tracker/TrackerView';
import { StatusBar } from '@components/layout/StatusBar';
import { useAudioStore, useTrackerStore, useUIStore } from './stores';
import { useMIDIStore } from './stores/useMIDIStore';
import { useDJStore } from './stores/useDJStore';
import { useSettingsStore } from './stores/useSettingsStore';
import { useHistoryStore } from './stores/useHistoryStore';
import { useLiveModeStore } from './stores/useLiveModeStore';
import { useButtonMappings } from './hooks/midi/useButtonMappings';
import { useMIDIActions } from './hooks/useMIDIActions';
import { usePadTriggers } from './hooks/usePadTriggers';
import { useProjectPersistence } from './hooks/useProjectPersistence';
import { useGlobalKeyboardHandler } from './hooks/useGlobalKeyboardHandler';
import { initKeyboardRouter, destroyKeyboardRouter } from './engine/keyboard/KeyboardRouter';
import { useCloudSync } from './hooks/useCloudSync';
import { setupCloudSyncSubscribers } from './lib/cloudSyncSubscribers';
import { getToneEngine } from '@engine/ToneEngine';
import type { EffectConfig } from './types/instrument';
import { Zap, Music, Sliders, Download, List } from 'lucide-react';
import { ToastNotification } from '@components/ui/ToastNotification';
import { PopOutWindow } from '@components/ui/PopOutWindow';
import { UpdateNotification } from '@components/ui/UpdateNotification';
import { SynthErrorDialog } from '@components/ui/SynthErrorDialog';
import { RomUploadDialog } from '@components/ui/RomUploadDialog';
import { Button } from '@components/ui/Button';
import { useVersionCheck } from '@hooks/useVersionCheck';
import { usePatternPlayback } from '@hooks/audio/usePatternPlayback';
import { GlobalDragDropHandler } from '@components/ui/GlobalDragDropHandler';
import { notify } from '@stores/useNotificationStore';
import { loadFile } from '@lib/file/UnifiedFileLoader';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { PeerMouseCursor } from '@components/collaboration/PeerMouseCursor';
import { PeerVideoWindow } from '@components/collaboration/PeerVideoWindow';

// Lazy-loaded components for better startup performance
const HelpModal = lazy(() => import('./components/help/HelpModal').then(m => ({ default: m.HelpModal })));
const ExportDialog = lazy(() => import('@lib/export/ExportDialog').then(m => ({ default: m.ExportDialog })));
const EditInstrumentModal = lazy(() => import('@components/instruments/EditInstrumentModal').then(m => ({ default: m.EditInstrumentModal })));
const MasterEffectsModal = lazy(() => import('@components/effects').then(m => ({ default: m.MasterEffectsModal })));
const InstrumentEffectsModal = lazy(() => import('@components/effects').then(m => ({ default: m.InstrumentEffectsModal })));
const EffectParameterEditor = lazy(() => import('@components/effects').then(m => ({ default: m.EffectParameterEditor })));
const TD3PatternDialog = lazy(() => import('@components/midi/TD3PatternDialog').then(m => ({ default: m.TD3PatternDialog })));
const DrumpadEditorModal = lazy(() => import('@components/midi/DrumpadEditorModal').then(m => ({ default: m.DrumpadEditorModal })));
const DrumPadManager = lazy(() => import('@components/drumpad/DrumPadManager').then(m => ({ default: m.DrumPadManager })));
const TipOfTheDay = lazy(() => import('@components/dialogs/TipOfTheDay').then(m => ({ default: m.TipOfTheDay })));
const PatternManagement = lazy(() => import('@components/pattern/PatternManagement').then(m => ({ default: m.PatternManagement })));
const SamplePackBrowser = lazy(() => import('@components/instruments/SamplePackBrowser').then(m => ({ default: m.SamplePackBrowser })));
const InstrumentEditorPopout = lazy(() => import('./components/instruments/InstrumentEditorPopout').then(m => ({ default: m.InstrumentEditorPopout })));
const PianoRoll = lazy(() => import('./components/pianoroll/PianoRoll').then(m => ({ default: m.PianoRoll })));
const OscilloscopePopout = lazy(() => import('./components/visualization/OscilloscopePopout').then(m => ({ default: m.OscilloscopePopout })));
const ArrangementView = lazy(() => import('./components/arrangement').then(m => ({ default: m.ArrangementView })));
const DJView = lazy(() => import('./components/dj/DJView').then(m => ({ default: m.DJView })));
const VJView = lazy(() => import('./components/vj/VJView').then(m => ({ default: m.VJView })));
const FileBrowser = lazy(() => import('@components/dialogs/FileBrowser').then(m => ({ default: m.FileBrowser })));
const AuthModal = lazy(() => import('@components/dialogs/AuthModal').then(m => ({ default: m.AuthModal })));
const SettingsModal = lazy(() => import('@components/dialogs/SettingsModal').then(m => ({ default: m.SettingsModal })));
const RevisionBrowserDialog = lazy(() => import('@components/dialogs/RevisionBrowserDialog').then(m => ({ default: m.RevisionBrowserDialog })));
const PixiApp = lazy(() => import('./pixi/PixiApp').then(m => ({ default: m.PixiApp })));
const WebGLModalBridge = lazy(() => import('./pixi/WebGLModalBridge').then(m => ({ default: m.WebGLModalBridge })));
const CollaborationSplitView = lazy(() => import('@components/collaboration/CollaborationSplitView').then(m => ({ default: m.CollaborationSplitView })));

function App() {
  // Check for application updates
  const { updateAvailable, latestVersion, currentVersion, refresh } = useVersionCheck();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  // PERFORMANCE: Use useShallow to prevent re-renders on unrelated audio store changes
  const { initialized, contextState, setInitialized, setContextState, setToneEngineInstance, setAnalyserNode, setFFTNode } = useAudioStore(
    useShallow((state) => ({
      initialized: state.initialized,
      contextState: state.contextState,
      setInitialized: state.setInitialized,
      setContextState: state.setContextState,
      setToneEngineInstance: state.setToneEngineInstance,
      setAnalyserNode: state.setAnalyserNode,
      setFFTNode: state.setFFTNode,
    }))
  );
  const {
    showSamplePackModal, setShowSamplePackModal, applyAutoCompact,
    activeView, toggleActiveView,
    instrumentEditorPoppedOut, setInstrumentEditorPoppedOut,
    masterEffectsPoppedOut, setMasterEffectsPoppedOut,
    instrumentEffectsPoppedOut, setInstrumentEffectsPoppedOut,
    pianoRollPoppedOut, setPianoRollPoppedOut,
    oscilloscopePoppedOut, setOscilloscopePoppedOut,
    arrangementPoppedOut, setArrangementPoppedOut,
    vjPoppedOut, setVJPoppedOut,
    showFileBrowser, setShowFileBrowser,
  } = useUIStore();
  const collabStatus = useCollaborationStore((s) => s.status);
  const collabViewMode = useCollaborationStore((s) => s.viewMode);
  const isCollabSplit = collabStatus === 'connected' && collabViewMode === 'split';
  const [initError, setInitError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [editingEffect, setEditingEffect] = useState<{ effect: EffectConfig; channelIndex: number | null } | null>(null);
  const [pendingSongFile, setPendingSongFile] = useState<File | null>(null);
  const [showSongLoadConfirm, setShowSongLoadConfirm] = useState(false);
  const djModeActive = useDJStore(s => s.djModeActive);

  // Modal state from store (single source of truth for DOM + WebGL)
  const modalOpen = useUIStore(s => s.modalOpen);
  const modalData = useUIStore(s => s.modalData);
  const showPatterns = useUIStore(s => s.showPatterns);
  const { openModal, closeModal, togglePatterns } = useUIStore();

  const { showPatternDialog: showTD3Pattern, closePatternDialog, showKnobBar, setShowKnobBar } = useMIDIStore();

  // Unified startup logic: Show Tips or What's New
  useEffect(() => {
    const SEEN_VERSION_KEY = 'devilbox-seen-version';
    const seenVersion = localStorage.getItem(SEEN_VERSION_KEY);
    const showTipsAtStartup = localStorage.getItem('show-tips-at-startup') !== 'false';

    const hasNewVersion = seenVersion !== currentVersion.buildNumber;

    if (hasNewVersion) {
      // Prioritize Changelog for new versions
      openModal('tips', { initialTab: 'changelog' });
    } else if (showTipsAtStartup) {
      // Otherwise show Tips if enabled
      openModal('tips', { initialTab: 'tips' });
    }
  }, [currentVersion.buildNumber, openModal]);

  // Cloud sync: pull on login, push on local mutations
  useCloudSync();
  useEffect(() => { setupCloudSyncSubscribers(); }, []);

  // Register MIDI button mappings for transport/navigation control
  useButtonMappings();

  // Register MIDI CC mappings for TB-303 parameters and tracker actions
  useMIDIActions();

  // Register MIDI Pad triggers
  usePadTriggers();

  // Pattern playback engine - mounted at App level so it persists across view switches
  // (tracker/grid/arrangement/303). Previously in TrackerView which caused audio cutoff
  // when switching views and inability to stop playback from other views.
  usePatternPlayback();

  // Register global keyboard shortcuts from active scheme
  useGlobalKeyboardHandler();

  const { updateMasterEffect } = useAudioStore();

  // Apply auto-compact mode on small screens (runs once on mount)
  useEffect(() => {
    applyAutoCompact();
  }, [applyAutoCompact]);

  const { save: saveProject } = useProjectPersistence();

  // Initialize KeyboardRouter once at app startup
  useEffect(() => {
    initKeyboardRouter();
    return () => {
      destroyKeyboardRouter();
    };
  }, []);

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

        
        // Show hardware preset notification
        useUIStore.getState().setStatusMessage('HARDWARE PRESETS READY', false, 5000);
      } catch (error) {
        console.error('Failed to initialize audio engine:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    initAudio();
  }, []);

  // Sync BLEP setting with ToneEngine
  const useBLEP = useSettingsStore(state => state.useBLEP);
  useEffect(() => {
    if (!initialized) return;

    const engine = getToneEngine();
    engine.setBlepEnabled(useBLEP);
  }, [useBLEP, initialized]);

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

      // Escape: Close modals (highest priority), or exit fullscreen views
      if (e.key === 'Escape') {
        e.preventDefault();
        const state = useUIStore.getState();
        if (state.modalOpen) state.closeModal();
        else if (state.showPatterns) state.togglePatterns();
        else if (state.activeView === 'vj' || state.activeView === 'drumpad') state.setActiveView('tracker');
        return;
      }

      // Shift+/: Help (? key)
      if (e.shiftKey && e.key === '?') {
        e.preventDefault();
        useUIStore.getState().openModal('help');
        return;
      }

      // Ctrl+Shift+E: Export (changed to avoid conflict with common editor shortcuts)
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        useUIStore.getState().openModal('export');
        return;
      }

      // Ctrl+Shift+P: Patterns (changed to avoid conflict with browser commands)
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        useUIStore.getState().togglePatterns();
        return;
      }

      // Ctrl+Shift+A: Toggle Arrangement View
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        toggleActiveView();
        return;
      }

      // Ctrl+Shift+D: Toggle DJ Mode
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        const uiStore = useUIStore.getState();
        uiStore.setActiveView(uiStore.activeView === 'dj' ? 'tracker' : 'dj');
        return;
      }

      // Ctrl+Shift+V: Toggle VJ View
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        const uiStore = useUIStore.getState();
        uiStore.setActiveView(uiStore.activeView === 'vj' ? 'tracker' : 'vj');
        return;
      }

      // Ctrl+K: Toggle MIDI Knob Bar
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowKnobBar(!showKnobBar);
        return;
      }

      // Ctrl+I: Instrument editor
      if ((e.ctrlKey || e.metaKey) && e.key === 'i' && !e.shiftKey) {
        e.preventDefault();
        const s = useUIStore.getState();
        s.modalOpen === 'instruments' ? s.closeModal() : s.openModal('instruments');
        return;
      }

      // Ctrl+M: Master effects
      if ((e.ctrlKey || e.metaKey) && e.key === 'm' && !e.shiftKey) {
        e.preventDefault();
        const s = useUIStore.getState();
        s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx');
        return;
      }

      // Ctrl+Shift+F: Instrument effects
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        const s = useUIStore.getState();
        s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx');
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
  }, [handleUndo, handleRedo, saveProject, toggleActiveView]);

  const handleUpdateEffectParameter = (key: string, value: number | string) => {
    if (!editingEffect) return;
    // Read fresh params from store to avoid stale closure losing concurrent knob moves
    const current = useAudioStore.getState().masterEffects.find(e => e.id === editingEffect.effect.id);
    const updatedParams = { ...(current?.parameters ?? editingEffect.effect.parameters), [key]: value };
    updateMasterEffect(editingEffect.effect.id, { parameters: updatedParams });
    setEditingEffect(prev => prev ? { ...prev, effect: { ...prev.effect, parameters: updatedParams } } : null);
  };

  const handleUpdateEffectWet = (wet: number) => {
    if (!editingEffect) return;
    updateMasterEffect(editingEffect.effect.id, { wet });
    setEditingEffect(prev => prev ? { ...prev, effect: { ...prev.effect, wet } } : null);
  };

  useEffect(() => {
    // Add a one-time global interaction listener to start audio if it hasn't been started.
    // iOS Safari requires 'touchstart' — click events have a 300ms delay and may not
    // qualify as a user gesture for AudioContext.resume(). We listen for all three
    // event types to cover desktop (click/keydown) and mobile (touchstart).
    const handleFirstInteraction = async () => {
      if (contextState !== 'running') {
        try {
          const engine = getToneEngine();
          await engine.init();
          setContextState(engine.getContextState() as 'suspended' | 'running' | 'closed');
        } catch (error) {
          console.error('Failed to resume audio engine:', error);
        }
      }
      // Remove all listeners after first interaction
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [contextState, setContextState]);

  // Check if a filename is a supported tracker/module format (lazy-loaded)
  // Load song file after confirmation (uses unified file loader)
  const loadSongFile = useCallback(async (file: File) => {
    const result = await loadFile(file, { requireConfirmation: false });
    if (result.success === true) {
      notify.success(result.message);
    } else if (result.success === false) {
      notify.error(result.error);
    }
  }, []);

  // Unified file loading handler for drag and drop (uses unified file loader)
  const handleFileDrop = useCallback(async (file: File) => {
    // In DJ mode, deck-level drop zones handle file loading — ignore here
    if (useUIStore.getState().activeView === 'dj') return;

    // Audio files get a dedicated import dialog (adds a Sampler instrument)
    if (/\.(wav|mp3|ogg|flac|aiff?|m4a|iff|8svx)$/i.test(file.name)) {
      useUIStore.getState().setPendingAudioFile(file);
      return;
    }

    // TD-3 / TB-303 pattern files get a dedicated import dialog
    if (/\.(sqs|seq)$/i.test(file.name)) {
      useUIStore.getState().setPendingTD3File(file);
      return;
    }

    const result = await loadFile(file, { requireConfirmation: true });
    
    if (result.success === 'pending-confirmation') {
      const dropFilename = result.file.name.toLowerCase();
      const isTrackerModule = !dropFilename.endsWith('.dbx');
      // Tracker modules (including .mid/.midi) open ImportModuleDialog (full UADE scan,
      // subsong picker, engine selector, MIDI options).  In WebGL mode this is rendered as
      // a portal by WebGLModalBridge (z-100 on body) so it sits above PixiDOMOverlay;
      // in DOM mode TrackerView renders the same dialog inside the React tree — both share
      // the pendingModuleFile store key.
      if (isTrackerModule) {
        useUIStore.getState().setPendingModuleFile(result.file);
      } else {
        // Non-module song formats (.dbx, .sqs, .seq): simple confirm dialog
        setPendingSongFile(result.file);
        setShowSongLoadConfirm(true);
      }
    } else if (result.success === true) {
      notify.success(result.message);
    } else if (result.success === false) {
      notify.error(result.error);
    }
  }, []);

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

  // WebGL render mode — render PixiJS UI instead of DOM
  const renderMode = useSettingsStore(state => state.renderMode);
  if (renderMode === 'webgl') {
    return (
      <Suspense fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-dark-bg">
          <span className="text-text-muted font-mono text-sm">Loading WebGL UI...</span>
        </div>
      }>
        <GlobalDragDropHandler onFileLoaded={handleFileDrop}>
          <PixiApp />
          {/* Store-driven overlays — render null when inactive */}
          <ToastNotification />
          <SynthErrorDialog />
          <RomUploadDialog />
          {updateAvailable && !updateDismissed && (
            <UpdateNotification
              onRefresh={refresh}
              onDismiss={() => setUpdateDismissed(true)}
              currentVersion={currentVersion.buildNumber}
              latestVersion={latestVersion?.buildNumber || 'unknown'}
            />
          )}
          <WebGLModalBridge />
          <PeerMouseCursor />
          <PeerVideoWindow />

          {/* Effect Parameter Editor Modal */}
          <Suspense fallback={null}>
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
          </Suspense>

          {/* Song Load Confirmation Dialog */}
          {showSongLoadConfirm && pendingSongFile && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
              <div className="bg-dark-bgPrimary border-2 border-accent-primary rounded-xl p-6 max-w-md mx-4 animate-slide-in-up shadow-2xl">
                <h2 className="text-xl font-bold text-white mb-4">Load Song File?</h2>
                <p className="text-text-secondary mb-6">
                  Loading <span className="text-accent-primary font-mono">{pendingSongFile.name}</span> will replace your current project.
                </p>
                <p className="text-text-muted text-sm mb-6">
                  Make sure you've saved any unsaved changes before continuing.
                </p>
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowSongLoadConfirm(false);
                      setPendingSongFile(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={async () => {
                      if (pendingSongFile) {
                        await loadSongFile(pendingSongFile);
                      }
                      setShowSongLoadConfirm(false);
                      setPendingSongFile(null);
                    }}
                  >
                    Load File
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Pop-out windows — rendered outside WebGL canvas as separate browser windows */}
          {instrumentEditorPoppedOut && (
            <Suspense fallback={null}>
              <PopOutWindow
                isOpen={true}
                onClose={() => setInstrumentEditorPoppedOut(false)}
                title="DEViLBOX — Instrument Editor"
                width={1000}
                height={800}
              >
                <InstrumentEditorPopout />
              </PopOutWindow>
            </Suspense>
          )}
          {masterEffectsPoppedOut && (
            <Suspense fallback={null}>
              <PopOutWindow
                isOpen={true}
                onClose={() => setMasterEffectsPoppedOut(false)}
                title="DEViLBOX — Master Effects"
                width={1000}
                height={800}
              >
                <MasterEffectsModal isOpen={true} onClose={() => setMasterEffectsPoppedOut(false)} />
              </PopOutWindow>
            </Suspense>
          )}
          {instrumentEffectsPoppedOut && (
            <Suspense fallback={null}>
              <PopOutWindow
                isOpen={true}
                onClose={() => setInstrumentEffectsPoppedOut(false)}
                title="DEViLBOX — Instrument Effects"
                width={1000}
                height={800}
              >
                <InstrumentEffectsModal isOpen={true} onClose={() => setInstrumentEffectsPoppedOut(false)} />
              </PopOutWindow>
            </Suspense>
          )}
          {pianoRollPoppedOut && (
            <Suspense fallback={null}>
              <PopOutWindow
                isOpen={true}
                onClose={() => setPianoRollPoppedOut(false)}
                title="DEViLBOX — Piano Roll"
                width={1200}
                height={600}
              >
                <div className="h-screen w-screen bg-dark-bgSecondary">
                  <PianoRoll />
                </div>
              </PopOutWindow>
            </Suspense>
          )}
          {arrangementPoppedOut && (
            <Suspense fallback={null}>
              <PopOutWindow
                isOpen={true}
                onClose={() => setArrangementPoppedOut(false)}
                title="DEViLBOX — Arrangement"
                width={1400}
                height={700}
              >
                <div className="h-screen w-screen bg-dark-bg">
                  <ArrangementView />
                </div>
              </PopOutWindow>
            </Suspense>
          )}
          {oscilloscopePoppedOut && (
            <Suspense fallback={null}>
              <PopOutWindow
                isOpen={true}
                onClose={() => setOscilloscopePoppedOut(false)}
                title="DEViLBOX — Visualizer"
                width={800}
                height={500}
              >
                <OscilloscopePopout />
              </PopOutWindow>
            </Suspense>
          )}
          {vjPoppedOut && (
            <Suspense fallback={null}>
              <PopOutWindow
                isOpen={true}
                onClose={() => setVJPoppedOut(false)}
                title="DEViLBOX — VJ"
                width={1280}
                height={720}
              >
                <div className="h-screen w-screen bg-black">
                  <VJView isPopout />
                </div>
              </PopOutWindow>
            </Suspense>
          )}
        </GlobalDragDropHandler>
      </Suspense>
    );
  }

  if (initError) {
    return (
      <div className="h-screen flex items-center justify-center bg-dark-bg text-text-primary">
        <div className="panel p-8 max-w-md">
          <h2 className="text-xl font-bold text-accent-error mb-4">Audio Initialization Error</h2>
          <p className="text-text-secondary mb-4">{initError}</p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload Application
          </Button>
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
      <AppLayout
        onShowExport={() => openModal('export')}
        onShowHelp={() => openModal('help')}
        onShowMasterFX={() => { const s = useUIStore.getState(); s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx'); }}
        onShowPatterns={() => togglePatterns()}
        onShowInstruments={() => openModal('instruments')}
        onLoad={() => setShowFileBrowser(true)}
        onShowDrumpads={() => openModal('drumpads')}
      >
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
            <Button
              variant="primary"
              size="lg"
              onClick={handleStartAudio}
              icon={<Zap size={20} />}
              className="shadow-glow animate-pulse-glow"
            >
              Start Audio Engine
            </Button>

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
    <GlobalDragDropHandler onFileLoaded={handleFileDrop}>
      <AppLayout
        onShowExport={() => openModal('export')}
        onShowHelp={() => openModal('help')}
        onShowMasterFX={() => { const s = useUIStore.getState(); s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx'); }}
        onShowPatterns={() => togglePatterns()}
        onShowInstruments={() => openModal('instruments')}
        onLoad={() => setShowFileBrowser(true)}
        onShowDrumpads={() => openModal('drumpads')}
        onShowAuth={() => openModal('auth')}
      >
        <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-y-hidden">
        {/* Top: Main workspace */}
        <div className="flex flex-1 min-h-0 min-w-0 overflow-y-hidden">
          {/* Left side - Pattern Editor or Arrangement View */}
          <div className="flex flex-col min-h-0 min-w-0 flex-1">
            {/* Collab split view — takes over the tracker view when active */}
            {isCollabSplit && activeView === 'tracker' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Loading collab...</div>}>
                <CollaborationSplitView
                  onShowPatterns={() => togglePatterns()}
                  onShowExport={() => openModal('export')}
                  onShowHelp={(tab) => openModal('help', { initialTab: tab || 'shortcuts' })}
                  onShowMasterFX={() => { const s = useUIStore.getState(); s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx'); }}
                  onShowInstrumentFX={() => { const s = useUIStore.getState(); s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx'); }}
                  onShowInstruments={() => openModal('instruments')}
                  onShowDrumpads={() => openModal('drumpads')}
                  showPatterns={showPatterns}
                  showMasterFX={modalOpen === 'masterFx'}
                  showInstrumentFX={modalOpen === 'instrumentFx'}
                />
              </Suspense>
            )}

            {activeView === 'tracker' && !isCollabSplit && (
              <>
                {/* Pattern Management (optional) */}
                {showPatterns && (
                  <div className="h-48 border-b border-dark-border animate-fade-in">
                    <Suspense fallback={<div className="h-full flex items-center justify-center text-text-muted">Loading patterns...</div>}>
                      <PatternManagement />
                    </Suspense>
                  </div>
                )}
                {/* Pattern Editor */}
                <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                  <TrackerView
                    onShowPatterns={() => togglePatterns()}
                    onShowExport={() => openModal('export')}
                    onShowHelp={(tab) => openModal('help', { initialTab: tab || 'shortcuts' })}
                    onShowMasterFX={() => { const s = useUIStore.getState(); s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx'); }}
                    onShowInstrumentFX={() => { const s = useUIStore.getState(); s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx'); }}
                    onShowInstruments={() => openModal('instruments')}
                    onShowDrumpads={() => openModal('drumpads')}
                    showPatterns={showPatterns}
                    showMasterFX={modalOpen === 'masterFx'}
                    showInstrumentFX={modalOpen === 'instrumentFx'}
                  />
                </div>
              </>
            )}

            {activeView === 'arrangement' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Loading arrangement...</div>}>
                <ArrangementView />
              </Suspense>
            )}

            {(activeView === 'dj' || (activeView === 'vj' && djModeActive)) && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Loading DJ mode...</div>}>
                <div style={{ display: activeView === 'dj' ? 'contents' : 'none' }}>
                  <DJView onShowDrumpads={() => openModal('drumpads')} />
                </div>
              </Suspense>
            )}

            {activeView === 'drumpad' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Loading drum pads...</div>}>
                <DrumPadManager />
              </Suspense>
            )}

            {activeView === 'pianoroll' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Loading piano roll...</div>}>
                <PianoRoll />
              </Suspense>
            )}

            {activeView === 'vj' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted bg-black">Loading VJ...</div>}>
                <VJView />
              </Suspense>
            )}
          </div>

        </div>

        {/* Global Status Bar (includes MIDI Knob Bar) */}
        <StatusBar onShowTips={() => openModal('tips', { initialTab: 'tips' })} />
      </div>

      {/* Modals */}
      <Suspense fallback={null}>
        {modalOpen === 'settings' && <SettingsModal onClose={closeModal} />}
        {modalOpen === 'help' && <HelpModal isOpen={true} onClose={closeModal} initialTab={(modalData?.initialTab as any) || 'shortcuts'} />}
        {modalOpen === 'export' && <ExportDialog isOpen={true} onClose={closeModal} />}
        {modalOpen === 'instruments' && <EditInstrumentModal isOpen={true} onClose={closeModal} />}
        {modalOpen === 'masterFx' && <MasterEffectsModal isOpen={true} onClose={closeModal} />}
        {modalOpen === 'instrumentFx' && <InstrumentEffectsModal isOpen={true} onClose={closeModal} />}
        {showTD3Pattern && <TD3PatternDialog isOpen={showTD3Pattern} onClose={closePatternDialog} />}
        {modalOpen === 'drumpads' && <DrumPadManager onClose={closeModal} />}
        {modalOpen === 'midi-pads' && <DrumpadEditorModal isOpen={true} onClose={closeModal} />}
        {modalOpen === 'revisions' && <RevisionBrowserDialog isOpen={true} onClose={closeModal} />}
        {showFileBrowser && (
          <FileBrowser
            isOpen={showFileBrowser}
            onClose={() => setShowFileBrowser(false)}
            mode="load"
            onLoad={async (data: any, filename: string) => {
              setShowFileBrowser(false);
              // .dbx project files (JSON format) - validate and load via unified loader
              try {
                const file = new File([JSON.stringify(data)], filename, { type: 'application/json' });
                const result = await loadFile(file, { requireConfirmation: false });
                if (result.success === true) {
                  notify.success(result.message);
                } else if (result.success === false) {
                  notify.error(result.error);
                }
              } catch (error) {
                console.error('Failed to load project:', error);
                notify.error('Failed to load project');
              }
            }}
            onLoadTrackerModule={async (buffer: ArrayBuffer, filename: string) => {
              setShowFileBrowser(false);
              try {
                // All binary formats (.mid, .mod, .xm, .it, .fur, .hvl, .ahx, .sqs, .seq, etc.)
                const file = new File([buffer], filename);
                const result = await loadFile(file, { requireConfirmation: false });
                if (result.success === true) {
                  notify.success(result.message);
                } else if (result.success === false) {
                  notify.error(result.error);
                }
              } catch (error) {
                console.error('Failed to load tracker module:', error);
                notify.error('Failed to load file');
              }
            }}
          />
        )}
        {showSamplePackModal && <SamplePackBrowser onClose={() => setShowSamplePackModal(false)} />}
        {modalOpen === 'tips' && (
          <TipOfTheDay
            isOpen={true}
            onClose={closeModal}
            initialTab={(modalData?.initialTab as 'tips' | 'changelog') || 'tips'}
          />
        )}

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

        {/* Song Load Confirmation Dialog */}
        {showSongLoadConfirm && pendingSongFile && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-dark-bgPrimary border-2 border-accent-primary rounded-xl p-6 max-w-md mx-4 animate-slide-in-up shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-4">Load Song File?</h2>
              <p className="text-text-secondary mb-6">
                Loading <span className="text-accent-primary font-mono">{pendingSongFile.name}</span> will replace your current project.
              </p>
              <p className="text-text-muted text-sm mb-6">
                Make sure you've saved any unsaved changes before continuing.
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowSongLoadConfirm(false);
                    setPendingSongFile(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={async () => {
                    if (pendingSongFile) {
                      await loadSongFile(pendingSongFile);
                    }
                    setShowSongLoadConfirm(false);
                    setPendingSongFile(null);
                  }}
                >
                  Load File
                </Button>
              </div>
            </div>
          </div>
        )}
      </Suspense>

      {/* Popped-out Instrument Editor (rendered outside layout) */}
      {instrumentEditorPoppedOut && (
        <Suspense fallback={null}>
          <PopOutWindow
            isOpen={true}
            onClose={() => setInstrumentEditorPoppedOut(false)}
            title="DEViLBOX — Instrument Editor"
            width={1000}
            height={800}
          >
            <InstrumentEditorPopout />
          </PopOutWindow>
        </Suspense>
      )}

      {/* Popped-out Master Effects */}
      {masterEffectsPoppedOut && (
        <Suspense fallback={null}>
          <PopOutWindow
            isOpen={true}
            onClose={() => setMasterEffectsPoppedOut(false)}
            title="DEViLBOX — Master Effects"
            width={1000}
            height={800}
          >
            <MasterEffectsModal isOpen={true} onClose={() => setMasterEffectsPoppedOut(false)} />
          </PopOutWindow>
        </Suspense>
      )}

      {/* Popped-out Instrument Effects */}
      {instrumentEffectsPoppedOut && (
        <Suspense fallback={null}>
          <PopOutWindow
            isOpen={true}
            onClose={() => setInstrumentEffectsPoppedOut(false)}
            title="DEViLBOX — Instrument Effects"
            width={1000}
            height={800}
          >
            <InstrumentEffectsModal isOpen={true} onClose={() => setInstrumentEffectsPoppedOut(false)} />
          </PopOutWindow>
        </Suspense>
      )}

      {/* Popped-out Piano Roll */}
      {pianoRollPoppedOut && (
        <Suspense fallback={null}>
          <PopOutWindow
            isOpen={true}
            onClose={() => setPianoRollPoppedOut(false)}
            title="DEViLBOX — Piano Roll"
            width={1200}
            height={600}
          >
            <div className="h-screen w-screen bg-dark-bgSecondary">
              <PianoRoll />
            </div>
          </PopOutWindow>
        </Suspense>
      )}

      {/* Popped-out Arrangement View */}
      {arrangementPoppedOut && (
        <Suspense fallback={null}>
          <PopOutWindow
            isOpen={true}
            onClose={() => setArrangementPoppedOut(false)}
            title="DEViLBOX — Arrangement"
            width={1400}
            height={700}
          >
            <div className="h-screen w-screen bg-dark-bg">
              <ArrangementView />
            </div>
          </PopOutWindow>
        </Suspense>
      )}

      {/* Popped-out Oscilloscope/Visualizer */}
      {oscilloscopePoppedOut && (
        <Suspense fallback={null}>
          <PopOutWindow
            isOpen={true}
            onClose={() => setOscilloscopePoppedOut(false)}
            title="DEViLBOX — Visualizer"
            width={800}
            height={500}
          >
            <OscilloscopePopout />
          </PopOutWindow>
        </Suspense>
      )}

      {/* Peer mouse cursor — fixed overlay covering entire UI, visible when in shared collab mode */}
      <PeerMouseCursor />

      {/* Floating video chat window — visible when collaboration is connected */}
      <PeerVideoWindow />

      {/* Toast Notifications */}
      <ToastNotification />

      {/* Synth Error Dialog - Shows when synth initialization fails */}
      <SynthErrorDialog />

      {/* ROM Upload Dialog - Shows when ROM-dependent synths can't auto-load ROMs */}
      <RomUploadDialog />

      {/* Update Notification */}
      {updateAvailable && !updateDismissed && (
        <UpdateNotification
          onRefresh={refresh}
          onDismiss={() => setUpdateDismissed(true)}
          currentVersion={currentVersion.buildNumber}
          latestVersion={latestVersion?.buildNumber || 'unknown'}
        />
      )}

      {/* Auth Modal */}
      {modalOpen === 'auth' && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={true}
            onClose={closeModal}
          />
        </Suspense>
      )}
    </AppLayout>
    </GlobalDragDropHandler>
  );
}

export default App;
