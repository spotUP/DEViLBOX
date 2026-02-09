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
import { useHistoryStore } from './stores/useHistoryStore';
import { useLiveModeStore } from './stores/useLiveModeStore';
import { useButtonMappings } from './hooks/midi/useButtonMappings';
import { useMIDIActions } from './hooks/useMIDIActions';
import { usePadTriggers } from './hooks/usePadTriggers';
import { useProjectPersistence } from './hooks/useProjectPersistence';
import { useNKSAutoConnect } from './hooks/useNKSIntegration';
import { getToneEngine } from '@engine/ToneEngine';
import type { EffectConfig } from './types/instrument';
import { Zap, Music, Sliders, Download, List } from 'lucide-react';
import { ToastNotification } from '@components/ui/ToastNotification';
import { UpdateNotification } from '@components/ui/UpdateNotification';
import { SynthErrorDialog } from '@components/ui/SynthErrorDialog';
import { Button } from '@components/ui/Button';
import { useVersionCheck } from '@hooks/useVersionCheck';
import { GlobalDragDropHandler } from '@components/ui/GlobalDragDropHandler';
import { importMIDIFile } from '@lib/import/MIDIImporter';
import { importInstrument } from '@lib/export/exporters';
import { loadModuleFile } from '@lib/import/ModuleLoader';
import { notify } from '@stores/useNotificationStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useProjectStore } from '@stores/useProjectStore';
import type { Pattern } from '@typedefs';

// Lazy-loaded components for better startup performance
const HelpModal = lazy(() => import('@components/help/HelpModal').then(m => ({ default: m.HelpModal })));
const ExportDialog = lazy(() => import('@lib/export/ExportDialog').then(m => ({ default: m.ExportDialog })));
const EditInstrumentModal = lazy(() => import('@components/instruments/EditInstrumentModal').then(m => ({ default: m.EditInstrumentModal })));
const MasterEffectsModal = lazy(() => import('@components/effects').then(m => ({ default: m.MasterEffectsModal })));
const InstrumentEffectsModal = lazy(() => import('@components/effects').then(m => ({ default: m.InstrumentEffectsModal })));
const EffectParameterEditor = lazy(() => import('@components/effects').then(m => ({ default: m.EffectParameterEditor })));
const TD3PatternDialog = lazy(() => import('@components/midi/TD3PatternDialog').then(m => ({ default: m.TD3PatternDialog })));
const DrumpadEditorModal = lazy(() => import('@components/midi/DrumpadEditorModal').then(m => ({ default: m.DrumpadEditorModal })));
const TipOfTheDay = lazy(() => import('@components/dialogs/TipOfTheDay').then(m => ({ default: m.TipOfTheDay })));
const PatternManagement = lazy(() => import('@components/pattern/PatternManagement').then(m => ({ default: m.PatternManagement })));
const SamplePackBrowser = lazy(() => import('@components/instruments/SamplePackBrowser').then(m => ({ default: m.SamplePackBrowser })));

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
  const { showSamplePackModal, setShowSamplePackModal, applyAutoCompact } = useUIStore();
  const [initError, setInitError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);
  const [showMasterFX, setShowMasterFX] = useState(false);
  const [showInstrumentFX, setShowInstrumentFX] = useState(false);
  const [showDrumpads, setShowDrumpads] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [tipsInitialTab, setTipsInitialTab] = useState<'tips' | 'changelog'>('tips');
  const [editingEffect, setEditingEffect] = useState<{ effect: EffectConfig; channelIndex: number | null } | null>(null);
  const [showInstrumentModal, setShowInstrumentModal] = useState(false);
  const [pendingSongFile, setPendingSongFile] = useState<File | null>(null);
  const [showSongLoadConfirm, setShowSongLoadConfirm] = useState(false);

  const { showPatternDialog: showTD3Pattern, closePatternDialog, showKnobBar, setShowKnobBar } = useMIDIStore();

  // Unified startup logic: Show Tips or What's New
  useEffect(() => {
    const SEEN_VERSION_KEY = 'devilbox-seen-version';
    const seenVersion = localStorage.getItem(SEEN_VERSION_KEY);
    const showTipsAtStartup = localStorage.getItem('show-tips-at-startup') !== 'false';

    const hasNewVersion = seenVersion !== currentVersion.buildNumber;

    if (hasNewVersion) {
      // Prioritize Changelog for new versions
      setTipsInitialTab('changelog');
      setShowTips(true);
    } else if (showTipsAtStartup) {
      // Otherwise show Tips if enabled
      setTipsInitialTab('tips');
      setShowTips(true);
    }
  }, [currentVersion.buildNumber]);

  // Register MIDI button mappings for transport/navigation control
  useButtonMappings();

  // Register MIDI CC mappings for TB-303 parameters and tracker actions
  useMIDIActions();

  // Register MIDI Pad triggers
  usePadTriggers();

  // Auto-connect to paired NKS hardware (Komplete Kontrol, Maschine)
  useNKSAutoConnect();

  const { updateMasterEffect } = useAudioStore();

  // Apply auto-compact mode on small screens (runs once on mount)
  useEffect(() => {
    console.log('[App] Applying auto-compact, current tb303Collapsed:', useUIStore.getState().tb303Collapsed);
    applyAutoCompact();
    console.log('[App] After auto-compact, tb303Collapsed:', useUIStore.getState().tb303Collapsed);
  }, [applyAutoCompact]);

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

      // Ctrl+K: Toggle MIDI Knob Bar
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowKnobBar(!showKnobBar);
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

      // Ctrl+Shift+F: Instrument effects
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setShowInstrumentFX(!showInstrumentFX);
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
  }, [showPatterns, showHelp, showExport, showInstrumentModal, showMasterFX, showInstrumentFX, handleUndo, handleRedo, saveProject]);

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

  useEffect(() => {
    // Add a one-time global click listener to start audio if it hasn't been started
    const handleFirstInteraction = async () => {
      if (contextState !== 'running') {
        try {
          const engine = getToneEngine();
          await engine.init();
          setContextState(engine.getContextState() as 'suspended' | 'running' | 'closed');
          console.log('Audio engine resumed via first interaction');
        } catch (error) {
          console.error('Failed to resume audio engine:', error);
        }
      }
      // Remove listener after first interaction
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [contextState, setContextState]);

  // Load song file after confirmation
  const loadSongFile = useCallback(async (file: File) => {
    const { loadPatterns, setPatternOrder } = useTrackerStore.getState();
    const { loadInstruments } = useInstrumentStore.getState();
    const { setBPM, setGrooveTemplate } = useTransportStore.getState();
    const { setMetadata } = useProjectStore.getState();
    
    try {
      const filename = file.name.toLowerCase();
      
      if (filename.endsWith('.mid') || filename.endsWith('.midi')) {
        // MIDI file
        const midiResult = await importMIDIFile(file, {
          quantize: 1, 
          mergeChannels: false, 
          velocityToVolume: true, 
          defaultPatternLength: 64,
        });
        loadPatterns(midiResult.patterns);
        const instruments = midiResult.patterns.map((_, i) => ({
          id: i + 1,
          name: `Track ${i + 1}`,
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: -6,
          pan: 0,
        }));
        loadInstruments(instruments as any);
        setMetadata({
          name: midiResult.metadata.name,
          author: '',
          description: `Imported from ${file.name} (${midiResult.metadata.tracks} tracks)`,
        });
        setBPM(midiResult.bpm);
        notify.success(`Loaded MIDI: ${midiResult.metadata.name}`);
        
      } else if (filename.match(/\.(mod|xm|it|s3m|fur|mptm|669|amf|ams|dbm|dmf|dsm|far|ftm|gdm|imf|mdl|med|mt2|mtm|okt|psm|ptm|sfx|stm|ult|umx)$/)) {
        // Tracker module
        const moduleInfo = await loadModuleFile(file);
        
        if (moduleInfo) {
          notify.success(`Loaded module: ${moduleInfo.metadata.title || file.name}`, 3000);
        } else {
          notify.error(`Failed to load module: ${file.name}`);
        }
        
      } else if (filename.endsWith('.dbx')) {
        // DEViLBOX project file
        const text = await file.text();
        const songData = JSON.parse(text);
        
        const { needsMigration, migrateProject } = await import('@/lib/migration');
        let patterns = songData.patterns;
        let instruments = songData.instruments;
        
        if (needsMigration(patterns, instruments)) {
          const migrated = migrateProject(patterns, instruments);
          patterns = migrated.patterns;
          instruments = migrated.instruments;
        }
        
        loadPatterns(patterns);
        
        if (songData.sequence && Array.isArray(songData.sequence)) {
          const patternIdToIndex = new Map(patterns.map((p: Pattern, i: number) => [p.id, i]));
          const order = songData.sequence
            .map((patternId: string) => patternIdToIndex.get(patternId))
            .filter((index: number | undefined): index is number => index !== undefined);
          if (order.length > 0) setPatternOrder(order);
        }
        
        if (instruments) loadInstruments(instruments);
        if (songData.masterEffects) useAudioStore.getState().setMasterEffects(songData.masterEffects);
        setBPM(songData.bpm);
        setMetadata(songData.metadata);
        setGrooveTemplate(songData.grooveTemplateId || 'straight');
        notify.success(`Loaded: ${songData.metadata?.name || file.name}`);
      }
    } catch (error) {
      console.error('[FileDrop] Failed to load file:', error);
      notify.error(`Failed to load ${file.name}`);
    }
  }, []);

  // Unified file loading handler for drag and drop
  const handleFileDrop = useCallback(async (file: File) => {
    const { addInstrument } = useInstrumentStore.getState();
    
    try {
      const filename = file.name.toLowerCase();
      
      // Check if it's a song format that will replace current project
      const isSongFormat = filename.match(/\.(dbx|mid|midi|mod|xm|it|s3m|fur|mptm|669|amf|ams|dbm|dmf|dsm|far|ftm|gdm|imf|mdl|med|mt2|mtm|okt|psm|ptm|sfx|stm|ult|umx)$/);
      
      if (isSongFormat) {
        // Show confirmation dialog for song formats
        setPendingSongFile(file);
        setShowSongLoadConfirm(true);
        return;
      }
      
      // Handle non-song formats immediately
      if (filename.endsWith('.dbi')) {
        // DEViLBOX instrument file
        const instrumentData = await importInstrument(file);
        if (instrumentData?.instrument) {
          addInstrument(instrumentData.instrument as any);
          notify.success(`Loaded instrument: ${instrumentData.instrument.name || 'Untitled'}`);
        } else {
          notify.error(`Failed to load instrument: ${file.name}`);
        }
        
      } else if (filename.endsWith('.xml')) {
        // XML file - could be DB303 pattern or preset
        notify.info(`XML file detected: ${file.name}. Use Load button for pattern/preset import.`);
        
      } else if (filename.match(/\.(wav|mp3|ogg|flac|aiff|aif)$/)) {
        // Audio sample - create new instrument
        notify.info(`Audio sample: ${file.name}. Opening instrument editor...`);
        // TODO: Create new instrument with this sample
        // For now just show the instrument modal
        setShowInstrumentModal(true);
        
      } else {
        notify.warning(`Unsupported file format: ${file.name}`);
      }
      
    } catch (error) {
      console.error('[FileDrop] Failed to handle file:', error);
      notify.error(`Failed to handle ${file.name}`);
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
      <AppLayout>
        <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-y-hidden">
        {/* Top: Main workspace */}
        <div className="flex flex-1 min-h-0 min-w-0 overflow-y-hidden">
          {/* Left side - Pattern Editor (expands when instrument panel is hidden) */}
          <div className="flex flex-col min-h-0 min-w-0 flex-1">
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
                onShowPatterns={() => setShowPatterns(!showPatterns)}
                onShowExport={() => setShowExport(true)}
                onShowHelp={() => setShowHelp(true)}
                onShowMasterFX={() => setShowMasterFX(!showMasterFX)}
                onShowInstrumentFX={() => setShowInstrumentFX(!showInstrumentFX)}
                onShowInstruments={() => setShowInstrumentModal(true)}
                onShowDrumpads={() => setShowDrumpads(true)}
                showPatterns={showPatterns}
                showMasterFX={showMasterFX}
                showInstrumentFX={showInstrumentFX}
              />
            </div>
          </div>

        </div>
        
        {/* Global Status Bar (includes MIDI Knob Bar) */}
        <StatusBar onShowTips={() => setShowTips(true)} />
      </div>

      {/* Modals */}
      <Suspense fallback={null}>
        {showHelp && <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />}
        {showExport && <ExportDialog isOpen={showExport} onClose={() => setShowExport(false)} />}
        {showInstrumentModal && <EditInstrumentModal isOpen={showInstrumentModal} onClose={() => setShowInstrumentModal(false)} />}
        {showMasterFX && <MasterEffectsModal isOpen={showMasterFX} onClose={() => setShowMasterFX(false)} />}
        {showInstrumentFX && <InstrumentEffectsModal isOpen={showInstrumentFX} onClose={() => setShowInstrumentFX(false)} />}
        {showTD3Pattern && <TD3PatternDialog isOpen={showTD3Pattern} onClose={closePatternDialog} />}
        {showDrumpads && <DrumpadEditorModal isOpen={showDrumpads} onClose={() => setShowDrumpads(false)} />}
        {showSamplePackModal && <SamplePackBrowser onClose={() => setShowSamplePackModal(false)} />}
        {showTips && (
          <TipOfTheDay 
            isOpen={showTips} 
            onClose={() => setShowTips(false)} 
            initialTab={tipsInitialTab}
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

      {/* Toast Notifications */}
      <ToastNotification />

      {/* Synth Error Dialog - Shows when synth initialization fails */}
      <SynthErrorDialog />

      {/* Update Notification */}
      {updateAvailable && !updateDismissed && (
        <UpdateNotification
          onRefresh={refresh}
          onDismiss={() => setUpdateDismissed(true)}
          currentVersion={currentVersion.buildNumber}
          latestVersion={latestVersion?.buildNumber || 'unknown'}
        />
      )}
    </AppLayout>
    </GlobalDragDropHandler>
  );
}

export default App;
