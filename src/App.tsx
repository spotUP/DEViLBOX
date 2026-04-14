/**
 * App - Main application component
 */

import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AppLayout } from '@components/layout/AppLayout';
import { TrackerView } from '@components/tracker/TrackerView';
import { StatusBar } from '@components/layout/StatusBar';
import { useAudioStore, useTrackerStore, useUIStore } from './stores';
import { useMIDIStore } from './stores/useMIDIStore';
import { getMIDIManager } from './midi/MIDIManager';
import { useDJStore } from './stores/useDJStore';
import { useSettingsStore } from './stores/useSettingsStore';
import { useHistoryStore } from './stores/useHistoryStore';
import { useLiveModeStore } from './stores/useLiveModeStore';
import { useMixerStore } from './stores/useMixerStore';
import { useButtonMappings } from './hooks/midi/useButtonMappings';
import { useMIDIActions } from './hooks/useMIDIActions';
import { usePadTriggers } from './hooks/usePadTriggers';
import { useProjectPersistence } from './hooks/useProjectPersistence';
import { useGlobalKeyboardHandler } from './hooks/useGlobalKeyboardHandler';
import { initKeyboardRouter, destroyKeyboardRouter } from './engine/keyboard/KeyboardRouter';
import { useCloudSync } from './hooks/useCloudSync';
import { setupCloudSyncSubscribers } from './lib/cloudSyncSubscribers';
import { getToneEngine } from '@engine/ToneEngine';
import { getJingleEngine } from '@engine/jingle/JingleEngine';
import { injectMouthPatterns, teardownMouthPatterns } from '@engine/jingle/JinglePatterns';
import type { EffectConfig } from './types/instrument';
import { Zap, Music, Sliders, Download, List } from 'lucide-react';
import { ToastNotification } from '@components/ui/ToastNotification';
import { AIPanel } from '@components/ai/AIPanel';
import { PopOutWindow } from '@components/ui/PopOutWindow';
import { UpdateNotification } from '@components/ui/UpdateNotification';
import { SynthErrorDialog } from '@components/ui/SynthErrorDialog';
import { USBSIDWizard } from '@components/dialogs/USBSIDWizard';
import { MIDIControllerWizard } from '@components/dialogs/MIDIControllerWizard';
import { NKSSetupWizard } from '@components/dialogs/NKSSetupWizard';
import { RomUploadDialog } from '@components/ui/RomUploadDialog';
import { ModlandContributionModal } from '@components/modland/ModlandContributionModal';
import { PatternMatchModal } from '@components/modland/PatternMatchModal';
import { PatternMatchButton } from '@components/modland/PatternMatchButton';
import { useModlandContributionModal } from '@stores/useModlandContributionModal';
import { ImportDBXDialog } from '@components/dialogs/ImportDBXDialog';
import { ImportInstrumentDialog } from '@components/dialogs/ImportInstrumentDialog';
import { ImportTD3Dialog } from '@components/dialogs/ImportTD3Dialog';
import { Button } from '@components/ui/Button';
import { useVersionCheck } from '@hooks/useVersionCheck';
import { useDevServerStatus } from '@hooks/useDevServerStatus';
import { DevServerDownBanner } from '@components/ui/DevServerDownBanner';
import { MobileMenu } from '@components/layout/MobileMenu';
import { useResponsive } from '@contexts/ResponsiveContext';
import { usePatternPlayback } from '@hooks/audio/usePatternPlayback';
import { useGlobalPTT } from '@hooks/useGlobalPTT';
import { GlobalDragDropHandler } from '@components/ui/GlobalDragDropHandler';
import { notify } from '@stores/useNotificationStore';
import { loadFile } from '@lib/file/UnifiedFileLoader';
import { runPrefetchIfNeeded } from '@/lib/SamplePackPrefetcher';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { PeerMouseCursor } from '@components/collaboration/PeerMouseCursor';
import { PeerVideoWindow } from '@components/collaboration/PeerVideoWindow';
import { ExposeOverlay } from '@components/ui/ExposeOverlay';
import { GlobalConfirmDialog } from '@components/common/GlobalConfirmDialog';
import { showAlert } from '@stores/useConfirmStore';
import { DJErrorBoundary } from './components/dj/DJErrorBoundary';
import { TourOverlay } from './components/tour/TourOverlay';
import { useTourStore } from '@stores/useTourStore';

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
const SamplePackBrowser = lazy(() => import('@components/instruments/SamplePackBrowser').then(m => ({ default: m.SamplePackBrowser })));
const InstrumentEditorPopout = lazy(() => import('./components/instruments/InstrumentEditorPopout').then(m => ({ default: m.InstrumentEditorPopout })));
const HardwareUIPopout = lazy(() => import('./components/instruments/HardwareUIPopout').then(m => ({ default: m.HardwareUIPopout })));
const OscilloscopePopout = lazy(() => import('./components/visualization/OscilloscopePopout').then(m => ({ default: m.OscilloscopePopout })));
const DJView = lazy(() => import('./components/dj/DJView').then(m => ({ default: m.DJView })));
const VJView = lazy(() => import('./components/vj/VJView').then(m => ({ default: m.VJView })));
const FileBrowser = lazy(() => import('@components/dialogs/FileBrowser').then(m => ({ default: m.FileBrowser })));
const AuthModal = lazy(() => import('@components/dialogs/AuthModal').then(m => ({ default: m.AuthModal })));
const ModuleInfoModal = lazy(() => import('@components/dialogs/ModuleInfoModal').then(m => ({ default: m.ModuleInfoModal })));
const SettingsModal = lazy(() => import('@components/dialogs/SettingsModal').then(m => ({ default: m.SettingsModal })));
const RevisionBrowserDialog = lazy(() => import('@components/dialogs/RevisionBrowserDialog').then(m => ({ default: m.RevisionBrowserDialog })));
const PixiApp = lazy(() => import('./pixi/PixiApp').then(m => ({ default: m.PixiApp })));
const DJ3DOverlay = lazy(() => import('./components/dj/DJ3DOverlay').then(m => ({ default: m.DJ3DOverlay })));
const WebGLModalBridge = lazy(() => import('./pixi/WebGLModalBridge').then(m => ({ default: m.WebGLModalBridge })));
const MixerPanel = lazy(() => import('./components/panels/MixerPanel').then(m => ({ default: m.MixerPanel })));
const MixerView  = lazy(() => import('./components/panels/MixerPanel').then(m => ({ default: m.MixerView })));
const StudioCanvasView = lazy(() => import('./components/studio/StudioCanvasView').then(m => ({ default: m.StudioCanvasView })));

// Module-level flag — resets on every page load (sessionStorage persists through reloads)
let jinglePlayedThisLoad = false;

/** Play the startup jingle once per page load (no-op if disabled or already played). */
async function playStartupJingle(): Promise<void> {
  const settings = useSettingsStore.getState();
  if (!settings.welcomeJingleEnabled || jinglePlayedThisLoad) return;

  jinglePlayedThisLoad = true;
  const jingle = getJingleEngine();
  jingle.onEnd(() => {
    useUIStore.getState().setJingleActive(false);
    useUIStore.getState().setPostJingleActive(true);
    teardownMouthPatterns();
    useUIStore.getState().setStatusMessage('DEVILBOX READY', false, 3000);
  });
  try {
    await jingle.preload('/devilbox1.mp3');
    injectMouthPatterns();
    jingle.play();
    useUIStore.getState().setJingleActive(true);
  } catch {
    // Jingle load failed — silently skip; app continues normally
  }
}

const DesignSystemPage = lazy(() => import('./components/design-system/DesignSystemPage').then(m => ({ default: m.DesignSystemPage })));
const IsolatedComponent = lazy(() => import('./components/design-system/IsolatedComponent').then(m => ({ default: m.IsolatedComponent })));

/** Wrapper that intercepts #/design-system before App mounts its hooks.
 *  Also handles ?_renderMode=dom|webgl for split-screen comparison iframes. */
function AppRouter() {
  const [isDesignSystem, setIsDesignSystem] = useState(window.location.hash === '#/design-system');
  useEffect(() => {
    const handler = () => setIsDesignSystem(window.location.hash === '#/design-system');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // Handle ?_renderMode=dom|webgl from split-screen comparison iframes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forceMode = params.get('_renderMode');
    if (forceMode === 'dom' || forceMode === 'webgl') {
      useSettingsStore.getState().setRenderMode(forceMode);
    }
    // Handle ?view=xxx or #/_view=xxx to switch to a specific view
    const viewParam = params.get('view');
    const hashMatch = window.location.hash.match(/_view=(\w+)/);
    const requestedView = viewParam || hashMatch?.[1];
    if (requestedView) {
      setTimeout(() => {
        useUIStore.getState().setActiveView(requestedView as never);
      }, 500); // delay to let app initialize
    }
  }, []);

  if (isDesignSystem) {
    return <Suspense fallback={<div style={{ background: '#121218', color: '#6b6b80', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading design system...</div>}><DesignSystemPage /></Suspense>;
  }

  // Component isolation mode for split-screen comparison (DOM only — GL needs full app)
  const params = new URLSearchParams(window.location.search);
  const isolate = params.get('_isolate');
  const forceMode = params.get('_renderMode');
  if (isolate && forceMode !== 'webgl') {
    return <Suspense fallback={<div style={{ background: '#0d0d0d', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'monospace' }}>Loading {isolate}...</div>}><IsolatedComponent name={isolate} /></Suspense>;
  }
  return <App />;
}

function App() {
  // Check for application updates
  const { updateAvailable, latestVersion, currentVersion, refresh } = useVersionCheck();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const isDevServerDown = useDevServerStatus();
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
    hardwareUiPoppedOut, setHardwareUiPoppedOut,
    masterEffectsPoppedOut, setMasterEffectsPoppedOut,
    instrumentEffectsPoppedOut, setInstrumentEffectsPoppedOut,
    oscilloscopePoppedOut, setOscilloscopePoppedOut,
    vjPoppedOut, setVJPoppedOut,
    showFileBrowser, setShowFileBrowser,
  } = useUIStore();
  const [initError, setInitError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [editingEffect, setEditingEffect] = useState<{ effect: EffectConfig; channelIndex: number | null } | null>(null);
  const [pendingSongFile, setPendingSongFile]             = useState<File | null>(null);
  const [pendingInstrumentFile, setPendingInstrumentFile] = useState<File | null>(null);
  const djModeActive = useDJStore(s => s.djModeActive);
  const deckViewMode = useDJStore(s => s.deckViewMode);
  const pendingTD3File = useUIStore(s => s.pendingTD3File);

  // Modal state from store (single source of truth for DOM + WebGL)
  const modalOpen = useUIStore(s => s.modalOpen);
  const modalData = useUIStore(s => s.modalData);
  const showPatterns = useUIStore(s => s.showPatterns);
  const { openModal, closeModal, togglePatterns } = useUIStore();

  const { showPatternDialog: showTD3Pattern, closePatternDialog, showKnobBar, setShowKnobBar } = useMIDIStore();

  // Startup jingle: track whether the tips modal was shown and when it's dismissed
  const tipsModalWasShownRef = useRef(false);
  const prevModalOpenRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevModalOpenRef.current;
    prevModalOpenRef.current = modalOpen;

    if (modalOpen === 'tips') {
      tipsModalWasShownRef.current = true;
    }

    // Tips modal just dismissed → fire jingle now (audio context is guaranteed running
    // since the user had to click something to dismiss the dialog)
    if (prev === 'tips' && !modalOpen) {
      void playStartupJingle();
    }
  }, [modalOpen]);

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

  // Auto-join collab room from URL (e.g. ?collab=XXXXXX)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const collabCode = params.get('collab');
    if (collabCode && collabCode.length >= 6) {
      // Clean the URL so refreshing doesn't re-trigger
      const url = new URL(window.location.href);
      url.searchParams.delete('collab');
      window.history.replaceState({}, '', url.pathname + url.search);
      // Open the collab modal in join mode and auto-join
      openModal('collaboration');
      useCollaborationStore.getState().joinRoom(collabCode);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cloud sync: pull on login, push on local mutations
  useCloudSync();
  useEffect(() => { setupCloudSyncSubscribers(); }, []);

  // Auto-reconnect SID hardware (WebUSB/ASID) from saved settings
  useEffect(() => {
    import('@lib/sid/SIDHardwareManager').then(({ initSIDHardwareFromSettings }) => {
      initSIDHardwareFromSettings();
    });
  }, []);

  // Detect USB-SID-Pico plug-in and show setup wizard
  useEffect(() => {
    if (!navigator.usb) return;
    const handleConnect = (ev: USBConnectionEvent) => {
      const d = ev.device;
      if (d.vendorId === 0xCAFE && d.productId === 0x4011) {
        console.log('[USB-SID-Pico] Device plugged in:', d.productName);
        const settings = useSettingsStore.getState();
        // Only show wizard if not already configured for WebUSB
        if (settings.sidHardwareMode !== 'webusb') {
          useUIStore.getState().openModal('usb-sid-wizard');
        }
      }
    };
    navigator.usb.addEventListener('connect', handleConnect);
    return () => navigator.usb.removeEventListener('connect', handleConnect);
  }, []);

  // Detect new MIDI controller connection and show setup wizard
  useEffect(() => {
    const midiStore = useMIDIStore.getState();
    if (!midiStore.isInitialized) return;

    const manager = getMIDIManager();
    let prevInputCount = midiStore.inputDevices.length;

    const unsub = manager.onDeviceChange(() => {
      const state = useMIDIStore.getState();
      const newCount = state.inputDevices.length;
      // Show wizard when a new input device appears (not on disconnect)
      if (newCount > prevInputCount && newCount > 0) {
        const ui = useUIStore.getState();
        if (!ui.modalOpen) {
          ui.openModal('midi-wizard');
        }
      }
      prevInputCount = newCount;
    });

    return unsub;
  }, []);

  // Background sample pack download on first run
  useEffect(() => {
    runPrefetchIfNeeded((completed, total) => {
      if (completed === total) {
        // Done — let the status bar revert naturally
        useUIStore.getState().setStatusMessage('SAMPLES READY', false, 2000);
      } else {
        // Persistent message until complete (timeout = 0)
        useUIStore.getState().setStatusMessage(
          `SAMPLES ${completed}/${total}`,
          false,
          0
        );
      }
    });
  }, []);

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

  // Global push-to-talk (Cmd+Alt+Space) — works from any view
  useGlobalPTT();

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

        // Sync store volume/gain values to engine (store defaults may differ from engine constructor)
        const audioState = useAudioStore.getState();
        engine.setMasterVolume(audioState.masterVolume);
        engine.setSampleBusGain(audioState.sampleBusGain);
        engine.setSynthBusGain(audioState.synthBusGain);
        engine.setMasterMute(audioState.masterMuted);

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

  // Initialize ASID device manager only when ASID is enabled in settings
  // (requestMIDIAccess with sysex:true triggers a browser permission prompt)
  const asidEnabled = useSettingsStore(state => state.asidEnabled);
  useEffect(() => {
    if (!asidEnabled) return;
    if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) return;

    let unsubscribe: (() => void) | undefined;

    (async () => {
      const { getASIDDeviceManager } = await import('@lib/sid/ASIDDeviceManager');
      const mgr = getASIDDeviceManager();
      await mgr.init();

      // Auto-select first device if one is already connected
      const settings = useSettingsStore.getState();
      const devices = mgr.getDevices();
      if (devices.length > 0 && !settings.asidDeviceId) {
        settings.setAsidDeviceId(devices[0].id);
        mgr.selectDevice(devices[0].id);
      }

      // Listen for hot-plug events
      unsubscribe = mgr.onStateChange((state) => {
        const s = useSettingsStore.getState();
        if (state.devices.length > 0 && !s.asidDeviceId) {
          // Auto-select first ASID device on plug-in
          s.setAsidDeviceId(state.devices[0].id);
          mgr.selectDevice(state.devices[0].id);
          console.log('[ASID] Auto-selected device:', state.devices[0].name);
          useUIStore.getState().setStatusMessage(
            `USB-SID-Pico detected: ${state.devices[0].name}`, false, 5000
          );
        } else if (state.devices.length === 0 && s.asidDeviceId) {
          // Device unplugged
          s.setAsidDeviceId(null);
          if (s.asidEnabled) {
            useUIStore.getState().setStatusMessage('ASID device disconnected', false, 3000);
          }
        }
      });
    })();

    return () => { unsubscribe?.(); };
  }, [asidEnabled]);

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
        else if (state.activeView === 'vj' || state.activeView === 'drumpad' || state.activeView === 'mixer') state.setActiveView('tracker');
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

      // Ctrl+Shift+T: Start guided tour
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        import('@/engine/tour/TourEngine').then(({ getTourEngine }) => {
          const engine = getTourEngine();
          if (useTourStore.getState().isActive) engine.stop();
          else engine.start();
        });
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
        if (s.modalOpen === 'instruments') { s.closeModal(); } else { s.openModal('instruments'); }
        return;
      }

      // Ctrl+M: Toggle mixer DOM panel
      if ((e.ctrlKey || e.metaKey) && e.key === 'm' && !e.shiftKey) {
        e.preventDefault();
        useMixerStore.getState().toggleDomPanel();
        return;
      }

      // Ctrl+Shift+X: Master effects
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') {
        e.preventDefault();
        const s = useUIStore.getState();
        if (s.modalOpen === 'masterFx') { s.closeModal(); } else { s.openModal('masterFx'); }
        return;
      }

      // Ctrl+Shift+F: Instrument effects
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        const s = useUIStore.getState();
        if (s.modalOpen === 'instrumentFx') { s.closeModal(); } else { s.openModal('instrumentFx'); }
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

      // Fire jingle immediately only when the tips modal was never shown.
      // When tips IS shown, playStartupJingle() is called by the modalOpen watcher
      // (tips → null transition) so we don't double-fire here.
      if (!tipsModalWasShownRef.current) {
        void playStartupJingle();
      }
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
      void showAlert({ title: 'Load Failed', message: result.error || `Could not load ${file.name}` });
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

    // .dbi instrument files get a preview dialog before being added
    if (/\.dbi$/i.test(file.name)) {
      setPendingInstrumentFile(file);
      return;
    }

    // .dbx project files get a preview dialog showing song info before replacing
    if (/\.dbx$/i.test(file.name)) {
      setPendingSongFile(file);
      return;
    }

    // GoatTracker .sng files are auto-detected by loadFile() via magic bytes
    // and bypass confirmation — they route directly to the GTUltra engine.
    // Non-GT .sng files fall through to the default tracker module path below.

    // Read any pending companion files (set by folder/multi-file drops)
    const pendingCompanions = useUIStore.getState().pendingCompanionFiles;
    let companionFiles: Map<string, ArrayBuffer> | undefined;
    if (pendingCompanions.length > 0) {
      companionFiles = new Map();
      for (const cf of pendingCompanions) {
        companionFiles.set(cf.name, await cf.arrayBuffer());
      }
      useUIStore.getState().setPendingCompanionFiles([]);
    }

    const result = await loadFile(file, { requireConfirmation: true, companionFiles });

    if (result.success === 'pending-confirmation' || result.success === 'pending-import') {
      useUIStore.getState().setPendingModuleFile(result.file);
    } else if (result.success === true) {
      notify.success(result.message);
    } else if (result.success === false) {
      void showAlert({ title: 'Load Failed', message: result.error || `Could not load ${file.name}` });
    }
  }, []);

  // Folder/multi-file drop handler — stores companions then delegates to handleFileDrop
  const handleFolderDrop = useCallback(async (mainFile: File, companions: File[]) => {
    useUIStore.getState().setPendingCompanionFiles(companions);
    await handleFileDrop(mainFile);
  }, [handleFileDrop]);

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
  const { isMobile } = useResponsive();

  // Extract hook calls that appear in the webgl branch JSX — must be called
  // unconditionally to satisfy React's rules of hooks (same count every render).
  const modlandIsOpen = useModlandContributionModal((s) => s.isOpen);
  const modlandFilename = useModlandContributionModal((s) => s.filename);
  const modlandHash = useModlandContributionModal((s) => s.hash);

  // Disable WebGL/PixiJS on mobile — too heavy for phones, causes overheating.
  // Mobile gets the lighter DOM-based React UI instead.
  if (renderMode === 'webgl' && !isMobile) {
    return (
      <Suspense fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-dark-bg">
          <span className="text-text-muted font-mono text-sm">Loading WebGL UI...</span>
        </div>
      }>
        <GlobalDragDropHandler onFileLoaded={handleFileDrop} onFolderLoaded={handleFolderDrop}>
          <PixiApp />
          {/* DJ 3D overlay — Three.js rendered in DOM tree, on top of Pixi canvas */}
          {activeView === 'dj' && deckViewMode === '3d' && (
            <div className="fixed inset-0 z-10" style={{ top: 36, background: 'rgba(10,10,14,0.97)' }}>
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Loading 3D views...</div>}>
                <DJ3DOverlay />
              </Suspense>
            </div>
          )}
          {/* Mobile menu overlay for GL mode */}
          {isMobile && (
            <MobileMenu
              onShowSettings={() => openModal('settings')}
              onShowExport={() => openModal('export')}
              onShowHelp={() => openModal('help')}
              onShowMasterFX={() => { const s = useUIStore.getState(); if (s.modalOpen === 'masterFx') { s.closeModal(); } else { s.openModal('masterFx'); } }}
              onShowPatterns={() => togglePatterns()}
              onLoad={() => openModal('fileBrowser')}
              onSave={() => saveProject()}
              onNew={() => useUIStore.getState().openNewSongWizard()}
              onShowInstruments={() => openModal('instruments')}
              onShowPatternOrder={() => openModal('patternOrder')}
              onShowDrumpads={() => openModal('drumpads')}
              onShowGrooveSettings={() => openModal('grooveSettings')}
              onShowAuth={() => openModal('auth')}
            />
          )}
          {/* Store-driven overlays — render null when inactive */}
          <ToastNotification />
          <SynthErrorDialog />
          <RomUploadDialog />
          <USBSIDWizard />
          <MIDIControllerWizard />
          <NKSSetupWizard />
          <ModlandContributionModal
            isOpen={modlandIsOpen}
            onClose={() => useModlandContributionModal.getState().closeModal()}
            onDismiss={() => useModlandContributionModal.getState().dismissForFile()}
            filename={modlandFilename}
            hash={modlandHash}
          />
          <PatternMatchModal />
          <PatternMatchButton />
          {isDevServerDown && <DevServerDownBanner />}
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
          <AIPanel />

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

          {/* .dbx project preview dialog */}
          <ImportDBXDialog
            isOpen={pendingSongFile !== null}
            file={pendingSongFile}
            onCancel={() => setPendingSongFile(null)}
            onConfirm={async () => {
              if (pendingSongFile) await loadSongFile(pendingSongFile);
              setPendingSongFile(null);
            }}
          />

          {/* .dbi instrument preview dialog */}
          <ImportInstrumentDialog
            isOpen={pendingInstrumentFile !== null}
            file={pendingInstrumentFile}
            onCancel={() => setPendingInstrumentFile(null)}
            onConfirm={async () => {
              if (pendingInstrumentFile) await loadFile(pendingInstrumentFile);
              setPendingInstrumentFile(null);
            }}
          />

          {/* TD-3 pattern import dialog (replace/append choice) */}
          <ImportTD3Dialog
            isOpen={!!pendingTD3File}
            onClose={() => useUIStore.getState().setPendingTD3File(null)}
            initialFile={pendingTD3File}
            onImport={async (file, replacePatterns) => {
              useUIStore.getState().setPendingTD3File(null);
              const result = await loadFile(file, { requireConfirmation: false, replacePatterns });
              if (result.success === true) notify.success(result.message);
              else if (result.success === false) void showAlert({ title: 'Load Failed', message: result.error || 'Could not load file' });
            }}
          />

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
          {hardwareUiPoppedOut && (
            <Suspense fallback={null}>
              <PopOutWindow
                isOpen={true}
                onClose={() => setHardwareUiPoppedOut(false)}
                title="DEViLBOX — Hardware UI"
                width={800}
                height={600}
              >
                <HardwareUIPopout />
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
          {/* VJ Popout Window */}
          {vjPoppedOut && (
            <Suspense fallback={null}>
              <PopOutWindow
                isOpen={true}
                onClose={() => setVJPoppedOut(false)}
                title="DEViLBOX — VJ"
                width={1280}
                height={720}
              >
                <DJErrorBoundary viewName="VJ">
                  <div className="h-screen w-screen bg-black">
                    <VJView isPopout />
                  </div>
                </DJErrorBoundary>
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

  // Browser compatibility check
  const unsupportedBrowser = typeof WebAssembly === 'undefined' ||
    (typeof AudioContext === 'undefined' && typeof (window as unknown as Record<string, unknown>).webkitAudioContext === 'undefined');

  if (unsupportedBrowser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 bg-dark-bg text-text-primary min-h-screen">
        <div className="text-center max-w-lg">
          <h1 className="text-4xl font-bold mb-4">Unsupported Browser</h1>
          <p className="text-lg text-text-secondary mb-6">
            DEViLBOX requires WebAssembly and Web Audio API support.
          </p>
          <p className="text-sm text-text-muted">
            Please use a recent version of Chrome, Firefox, Edge, or Safari 15+.
          </p>
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
        onShowMasterFX={() => { const s = useUIStore.getState(); if (s.modalOpen === 'masterFx') { s.closeModal(); } else { s.openModal('masterFx'); } }}
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
            <p className="mt-3 text-sm text-text-muted">
              Press <kbd className="px-1.5 py-0.5 rounded bg-dark-bgTertiary border border-dark-border text-text-secondary font-mono text-xs">?</kbd> anytime for keyboard shortcuts and help
            </p>

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
    <GlobalDragDropHandler onFileLoaded={handleFileDrop} onFolderLoaded={handleFolderDrop}>
      <AppLayout
        onShowExport={() => openModal('export')}
        onShowHelp={() => openModal('help')}
        onShowMasterFX={() => { const s = useUIStore.getState(); if (s.modalOpen === 'masterFx') { s.closeModal(); } else { s.openModal('masterFx'); } }}
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
            {activeView === 'tracker' && (
              <>
                {/* Pattern Editor */}
                <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                  <TrackerView
                    onShowPatterns={() => togglePatterns()}
                    onShowExport={() => openModal('export')}
                    onShowHelp={(tab) => openModal('help', { initialTab: tab || 'shortcuts' })}
                    onShowMasterFX={() => { const s = useUIStore.getState(); if (s.modalOpen === 'masterFx') { s.closeModal(); } else { s.openModal('masterFx'); } }}
                    onShowInstrumentFX={() => { const s = useUIStore.getState(); if (s.modalOpen === 'instrumentFx') { s.closeModal(); } else { s.openModal('instrumentFx'); } }}
                    onShowInstruments={() => openModal('instruments')}
                    onShowDrumpads={() => openModal('drumpads')}
                    showPatterns={showPatterns}
                    showMasterFX={modalOpen === 'masterFx'}
                    showInstrumentFX={modalOpen === 'instrumentFx'}
                  />
                </div>
              </>
            )}

            {(activeView === 'dj' || djModeActive) && (
              <DJErrorBoundary viewName="DJ">
                <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Loading DJ mode...</div>}>
                  <div style={{ display: activeView === 'dj' ? 'contents' : 'none' }}>
                    <DJView />
                  </div>
                </Suspense>
              </DJErrorBoundary>
            )}

            {activeView === 'vj' && (
              <DJErrorBoundary viewName="VJ">
                <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted bg-black">Loading VJ...</div>}>
                  <VJView />
                </Suspense>
              </DJErrorBoundary>
            )}

            {activeView === 'mixer' && (
              <DJErrorBoundary viewName="Mixer">
                <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Loading mixer...</div>}>
                  <MixerView />
                </Suspense>
              </DJErrorBoundary>
            )}

            {activeView === 'drumpad' && (
              <DJErrorBoundary viewName="DrumPad">
                <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Loading drum pads...</div>}>
                  <DrumPadManager />
                </Suspense>
              </DJErrorBoundary>
            )}

            {activeView === 'studio' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Loading studio...</div>}>
                <StudioCanvasView />
              </Suspense>
            )}

          </div>

        </div>

        {/* Global Status Bar (includes MIDI Knob Bar) — hidden in VJ view */}
        {activeView !== 'vj' && (
          <StatusBar />
        )}
      </div>

      {/* Modals */}
      <Suspense fallback={null}>
        {modalOpen === 'moduleInfo' && <ModuleInfoModal isOpen={true} onClose={closeModal} />}
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
                  void showAlert({ title: 'Load Failed', message: result.error || 'Could not load project' });
                }
              } catch (error) {
                console.error('Failed to load project:', error);
                void showAlert({ title: 'Load Failed', message: 'Failed to load project' });
              }
            }}
            onLoadTrackerModule={async (buffer: ArrayBuffer, filename: string, companionFiles?: Map<string, ArrayBuffer>) => {
              setShowFileBrowser(false);
              try {
                const file = new File([buffer], filename);
                const result = await loadFile(file, { requireConfirmation: false, companionFiles });
                if (result.success === 'pending-import') {
                  // Auto-import without showing dialog — use parseModuleToSong
                  // which correctly routes UADE/TFMX formats with companion files
                  const { suppressFormatChecks: sfc, restoreFormatChecks: rfc } = await import('@/lib/formatCompatibility');
                  sfc();
                  try {
                  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
                  const song = await parseModuleToSong(file, 0, undefined, undefined, companionFiles);
                  const { useTrackerStore: ts } = await import('./stores/useTrackerStore');
                  const { useInstrumentStore: is } = await import('./stores/useInstrumentStore');
                  const { useTransportStore: trs } = await import('./stores/useTransportStore');
                  const { useProjectStore: ps } = await import('./stores/useProjectStore');
                  const { useFormatStore: fs } = await import('./stores/useFormatStore');
                  const { getToneEngine } = await import('./engine/ToneEngine');
                  const engine = getToneEngine();
                  if (trs.getState().isPlaying) trs.getState().stop();
                  engine.releaseAll();
                  trs.getState().reset();
                  ts.getState().reset();
                  is.getState().reset();
                  is.getState().loadInstruments(song.instruments);
                  ts.getState().loadPatterns(song.patterns);
                  if (song.songPositions) ts.getState().setPatternOrder(song.songPositions);
                  trs.getState().setBPM(song.initialBPM ?? 125);
                  ps.getState().setMetadata({ name: song.name });
                  fs.getState().applyEditorMode(song);
                  } finally { rfc(); }
                } else if (result.success === true) {
                  notify.success(result.message);
                } else if (result.success === false) {
                  void showAlert({ title: 'Load Failed', message: result.error || 'Could not load file' });
                }
              } catch (error) {
                console.error('Failed to load tracker module:', error);
                void showAlert({ title: 'Load Failed', message: 'Failed to load file' });
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

        {/* .dbx project preview dialog */}
        <ImportDBXDialog
          isOpen={pendingSongFile !== null}
          file={pendingSongFile}
          onCancel={() => setPendingSongFile(null)}
          onConfirm={async () => {
            if (pendingSongFile) await loadSongFile(pendingSongFile);
            setPendingSongFile(null);
          }}
        />

        {/* .dbi instrument preview dialog */}
        <ImportInstrumentDialog
          isOpen={pendingInstrumentFile !== null}
          file={pendingInstrumentFile}
          onCancel={() => setPendingInstrumentFile(null)}
          onConfirm={async () => {
            if (pendingInstrumentFile) await loadFile(pendingInstrumentFile);
            setPendingInstrumentFile(null);
          }}
        />

        {/* TD-3 pattern import dialog (replace/append choice) */}
        <ImportTD3Dialog
          isOpen={!!pendingTD3File}
          onClose={() => useUIStore.getState().setPendingTD3File(null)}
          initialFile={pendingTD3File}
          onImport={async (file, replacePatterns) => {
            useUIStore.getState().setPendingTD3File(null);
            const result = await loadFile(file, { requireConfirmation: false, replacePatterns });
            if (result.success === true) notify.success(result.message);
            else if (result.success === false) void showAlert({ title: 'Load Failed', message: result.error || 'Could not load file' });
          }}
        />
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

      {/* Popped-out Hardware UI (compact canvas-only window) */}
      {hardwareUiPoppedOut && (
        <Suspense fallback={null}>
          <PopOutWindow
            isOpen={true}
            onClose={() => setHardwareUiPoppedOut(false)}
            title="DEViLBOX — Hardware UI"
            width={900}
            height={750}
          >
            <HardwareUIPopout />
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

      {/* Popped-out VJ View */}
      {vjPoppedOut && (
        <Suspense fallback={null}>
          <PopOutWindow
            isOpen={true}
            onClose={() => setVJPoppedOut(false)}
            title="DEViLBOX — VJ"
            width={1280}
            height={720}
          >
            <DJErrorBoundary viewName="VJ">
              <div className="h-screen w-screen bg-black">
                <VJView isPopout />
              </div>
            </DJErrorBoundary>
          </PopOutWindow>
        </Suspense>
      )}

      {/* Floating DOM Mixer Panel — visibility controlled by useMixerStore.domPanelVisible */}
      <Suspense fallback={null}>
        <MixerPanel />
      </Suspense>

      {/* Peer mouse cursor — fixed overlay covering entire UI, visible when in shared collab mode */}
      <PeerMouseCursor />

      {/* Floating video chat window — visible when collaboration is connected */}
      <PeerVideoWindow />

      {/* AI Assistant Panel */}
      <AIPanel />

      {/* Toast Notifications */}
      <ToastNotification />

      {/* Synth Error Dialog - Shows when synth initialization fails */}
      <SynthErrorDialog />

      {/* USB-SID-Pico Setup Wizard */}
      <USBSIDWizard />

      {/* MIDI Controller Setup Wizard */}
      <MIDIControllerWizard />

      {/* NKS Performance Setup Wizard */}
      <NKSSetupWizard />

      {/* ROM Upload Dialog - Shows when ROM-dependent synths can't auto-load ROMs */}
      <RomUploadDialog />

      {/* Dev server down banner */}
      {isDevServerDown && <DevServerDownBanner />}

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

      {/* DOM Expose Overlay — view switcher (Mission Control style) */}
      <ExposeOverlay />

      {/* Global confirmation dialog — triggered by showConfirm() from any store */}
      <GlobalConfirmDialog />

      {/* Guided Tour overlay — subtitles + controls */}
      <TourOverlay />
    </AppLayout>
    </GlobalDragDropHandler>
  );
}

export default AppRouter;
