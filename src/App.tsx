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
import { useGlobalKeyboardHandler } from './hooks/useGlobalKeyboardHandler';
import { getToneEngine } from '@engine/ToneEngine';
import type { EffectConfig, InstrumentConfig } from './types/instrument';
import { DEFAULT_OSCILLATOR, DEFAULT_ENVELOPE, DEFAULT_FILTER } from './types/instrument';
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
import { importMIDIFile } from '@lib/import/MIDIImporter';
import { importInstrument } from '@lib/export/exporters';
import { notify } from '@stores/useNotificationStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useProjectStore } from '@stores/useProjectStore';
import type { Pattern } from '@typedefs';

// Lazy-loaded components for better startup performance
const HelpModal = lazy(() => import('./components/help/HelpModal').then(m => ({ default: m.HelpModal })));
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
const InstrumentEditorPopout = lazy(() => import('./components/instruments/InstrumentEditorPopout').then(m => ({ default: m.InstrumentEditorPopout })));
const PianoRoll = lazy(() => import('./components/pianoroll/PianoRoll').then(m => ({ default: m.PianoRoll })));
const OscilloscopePopout = lazy(() => import('./components/visualization/OscilloscopePopout').then(m => ({ default: m.OscilloscopePopout })));
const ArrangementView = lazy(() => import('./components/arrangement').then(m => ({ default: m.ArrangementView })));
const FileBrowser = lazy(() => import('@components/dialogs/FileBrowser').then(m => ({ default: m.FileBrowser })));
const AuthModal = lazy(() => import('@components/dialogs/AuthModal').then(m => ({ default: m.AuthModal })));

// Helper function to create instruments from module patterns
function createInstrumentsForModule(
  patterns: Pattern[],
  instrumentNames: string[],
  sampleUrls?: Map<number, string>
): InstrumentConfig[] {
  const usedInstruments = new Set<number>();
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        if (cell.instrument !== null && cell.instrument > 0) {
          usedInstruments.add(cell.instrument);
        }
      }
    }
  }

  const instruments: InstrumentConfig[] = [];
  const oscillatorTypes: Array<'sine' | 'square' | 'sawtooth' | 'triangle'> =
    ['sawtooth', 'square', 'triangle', 'sine'];

  for (const instNum of Array.from(usedInstruments).sort((a, b) => a - b)) {
    const name = instrumentNames[instNum - 1] || `Instrument ${instNum}`;
    const sampleUrl = sampleUrls?.get(instNum);

    if (sampleUrl) {
      instruments.push({
        id: instNum,
        name: name.trim() || `Sample ${instNum}`,
        type: 'sample' as const,
        synthType: 'Sampler',
        effects: [],
        volume: -6,
        pan: 0,
        parameters: { sampleUrl },
      });
    } else {
      const oscType = oscillatorTypes[(instNum - 1) % oscillatorTypes.length];
      instruments.push({
        id: instNum,
        name: name.trim() || `Instrument ${instNum}`,
        type: 'synth' as const,
        synthType: 'Synth',
        oscillator: { ...DEFAULT_OSCILLATOR, type: oscType },
        envelope: { ...DEFAULT_ENVELOPE },
        filter: { ...DEFAULT_FILTER },
        effects: [],
        volume: -6,
        pan: 0,
      });
    }
  }

  // Ensure instruments 0 and 1 exist as defaults
  for (const defaultId of [0, 1]) {
    if (!usedInstruments.has(defaultId)) {
      const sampleUrl = sampleUrls?.get(defaultId);
      if (sampleUrl) {
        instruments.push({
          id: defaultId,
          name: defaultId === 0 ? 'Default' : 'Sample 01',
          type: 'sample' as const,
          synthType: 'Sampler',
          effects: [],
          volume: -6,
          pan: 0,
          parameters: { sampleUrl },
        });
      } else {
        instruments.push({
          id: defaultId,
          name: defaultId === 0 ? 'Default' : 'Instrument 01',
          type: 'synth' as const,
          synthType: 'Synth',
          oscillator: { ...DEFAULT_OSCILLATOR, type: 'sawtooth' },
          envelope: { ...DEFAULT_ENVELOPE },
          filter: { ...DEFAULT_FILTER },
          effects: [],
          volume: -6,
          pan: 0,
        });
      }
    }
  }

  instruments.sort((a, b) => a.id - b.id);
  return instruments;
}

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
  } = useUIStore();
  const [initError, setInitError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpInitialTab, setHelpInitialTab] = useState<'shortcuts' | 'effects' | 'chip-effects' | 'tutorial'>('shortcuts');
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
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

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

  // Pattern playback engine - mounted at App level so it persists across view switches
  // (tracker/grid/arrangement/303). Previously in TrackerView which caused audio cutoff
  // when switching views and inability to stop playback from other views.
  usePatternPlayback();

  // Register global keyboard shortcuts from active scheme
  useGlobalKeyboardHandler();

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
        
        // Show hardware preset notification
        useUIStore.getState().setStatusMessage('HARDWARE PRESETS READY', false, 5000);
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

      // Ctrl+Shift+A: Toggle Arrangement View
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        toggleActiveView();
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
  }, [showPatterns, showHelp, showExport, showInstrumentModal, showMasterFX, showInstrumentFX, handleUndo, handleRedo, saveProject, toggleActiveView]);

  const handleUpdateEffectParameter = (key: string, value: number | string) => {
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
          console.log('Audio engine resumed via first interaction');
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

  // Load song file after confirmation
  const loadSongFile = useCallback(async (file: File) => {
    const { loadPatterns, setPatternOrder, setCurrentPattern } = useTrackerStore.getState();
    const { loadInstruments } = useInstrumentStore.getState();
    const { setBPM, setGrooveTemplate } = useTransportStore.getState();
    const { setMetadata } = useProjectStore.getState();
    
    try {
      // === CRITICAL: Full state reset before loading new song ===
      // Following Furnace's pattern: stop → release → dispose → load
      // Without this, dirty state from the old song can break playback.
      const { isPlaying, stop: stopTransport, reset: resetTransport } = useTransportStore.getState();
      const engine = getToneEngine();
      
      // 1. Stop playback and release all active notes
      if (isPlaying) {
        stopTransport();
      }
      engine.releaseAll();
      
      // 2. Dispose all cached instruments (prevents stale synth instances)
      engine.disposeAllInstruments();
      
      // 3. Reset transport state (BPM, speed, row, groove — all to defaults)
      resetTransport();
      
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
          effects: [] as EffectConfig[],
          volume: -6,
          pan: 0,
        })) as InstrumentConfig[];
        loadInstruments(instruments);
        setMetadata({
          name: midiResult.metadata.name,
          author: '',
          description: `Imported from ${file.name} (${midiResult.metadata.tracks} tracks)`,
        });
        setBPM(midiResult.bpm);
        notify.success(`Loaded MIDI: ${midiResult.metadata.name}`);
        
      } else if (filename.endsWith('.fur') || filename.endsWith('.dmf')) {
        // Furnace/DefleMask - import directly (no libopenmpt dialog needed)
        const { parseFurnaceSong, convertFurnaceToDevilbox } = await import('@lib/import/formats/FurnaceSongParser');
        const { convertToInstrument } = await import('@lib/import/InstrumentConverter');
        
        const buffer = await file.arrayBuffer();
        const module = await parseFurnaceSong(buffer);
        const result = convertFurnaceToDevilbox(module);
        
        // Convert instruments — re-assign sequential IDs after flat() to prevent
        // duplicates when one source instrument produces multiple configs (chip + samples)
        const instruments = result.instruments.map((inst, idx) =>
          convertToInstrument(inst, idx + 1, 'FUR')
        ).flat().map((inst, i) => ({ ...inst, id: i + 1 }));
        
        // Convert patterns (already in [pattern][row][channel] format)
        const patternOrder = result.metadata.modData?.patternOrderTable || [];
        const patterns = result.patterns;
        const patLen = patterns[0]?.length || 64;
        const numChannels = patterns[0]?.[0]?.length || 4;
        
        interface FurnaceCell { note?: number; instrument?: number; volume?: number; effectType?: number; effectParam?: number; effectType2?: number; effectParam2?: number }
        const convertedPatterns = patterns.map((pat: FurnaceCell[][], idx: number) => ({
          id: `pattern-${idx}`,
          name: `Pattern ${idx}`,
          length: patLen,
          channels: Array.from({ length: numChannels }, (_, ch) => ({
            id: `channel-${ch}`,
            name: `Channel ${ch + 1}`,
            muted: false,
            solo: false,
            collapsed: false,
            volume: 100,
            pan: 0,
            instrumentId: null,
            color: null,
            rows: pat.map((row: FurnaceCell[]) => {
              const cell = row[ch] || {};
              return {
                note: cell.note || 0,
                instrument: cell.instrument || 0,
                volume: cell.volume || 0,
                effTyp: cell.effectType || 0,
                eff: cell.effectParam || 0,
                effTyp2: cell.effectType2 || 0,
                eff2: cell.effectParam2 || 0,
              };
            }),
          })),
        }));
        
        loadInstruments(instruments as InstrumentConfig[]);
        loadPatterns(convertedPatterns);
        if (patternOrder.length > 0) setPatternOrder(patternOrder);
        
        setBPM(result.metadata.modData?.initialBPM || 150);
        setMetadata({
          name: result.metadata.sourceFile.replace(/\.[^/.]+$/, ''),
          author: '',
          description: `Imported from ${file.name} (Furnace)`,
        });
        
        notify.success(`Loaded Furnace: ${file.name} (${instruments.length} instruments, ${convertedPatterns.length} patterns)`);
        
      } else if (filename.match(/\.(mod|xm|it|s3m|mptm|669|amf|ams|dbm|dsm|far|ftm|gdm|imf|mdl|med|mt2|mtm|okt|psm|ptm|sfx|stm|ult|umx)$/)) {
        // Tracker module - use native parser directly (no dialog)
        const { loadModuleFile } = await import('@lib/import/ModuleLoader');
        const { convertModule, convertXMModule, convertMODModule } = await import('@lib/import/ModuleConverter');
        const { convertToInstrument } = await import('@lib/import/InstrumentConverter');
        
        const buffer = await file.arrayBuffer();
        const moduleInfo = await loadModuleFile(new File([buffer], file.name));
        
        if (moduleInfo) {
          let result;
          let instruments: InstrumentConfig[] = [];

          // Convert native format data (XM, MOD, etc.)
          if (moduleInfo.nativeData?.patterns) {
            const { format, patterns: nativePatterns, importMetadata, instruments: nativeInstruments } = moduleInfo.nativeData;
            const channelCount = importMetadata.originalChannelCount;
            const instrumentNames = nativeInstruments?.map((i: any) => i.name) || [];
            
            if (format === 'XM') {
              result = convertXMModule(nativePatterns as any, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
            } else if (format === 'MOD') {
              result = convertMODModule(nativePatterns as any, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
            } else if (moduleInfo.metadata.song) {
              result = convertModule(moduleInfo.metadata.song);
            }

            // Create instruments from native data
            if (nativeInstruments) {
              let nextId = 1;
              for (const parsedInst of nativeInstruments) {
                const converted = convertToInstrument(parsedInst, nextId, format);
                instruments.push(...converted);
                nextId += converted.length;
              }
            }
          } else if (moduleInfo.metadata.song) {
            result = convertModule(moduleInfo.metadata.song);
          }

          if (result) {
            // If no instruments created from native data, create from pattern data
            if (instruments.length === 0) {
              instruments = createInstrumentsForModule(result.patterns, result.instrumentNames || [], undefined);
            }

            instruments.forEach((inst: InstrumentConfig) => loadInstruments([inst]));
            loadPatterns(result.patterns);
            setCurrentPattern(0);
            
            if (result.order && result.order.length > 0) {
              setPatternOrder(result.order);
            }
            
            notify.success(`Imported ${file.name}: ${result.patterns.length} patterns, ${instruments.length} instruments`);
          }
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
    console.log('[App] handleFileDrop called with file:', file.name, 'type:', file.type, 'size:', file.size);
    const { addInstrument } = useInstrumentStore.getState();
    
    try {
      const filename = file.name.toLowerCase();
      
      // Check if it's a song format that will replace current project
      const isSongFormat = filename.match(/\.(dbx|mid|midi|mod|xm|it|s3m|fur|mptm|669|amf|ams|dbm|dmf|dsm|far|ftm|gdm|imf|mdl|med|mt2|mtm|okt|psm|ptm|sfx|stm|ult|umx)$/);
      console.log('[App] isSongFormat:', isSongFormat, 'filename:', filename);
      
      if (isSongFormat) {
        // Show confirmation dialog for song formats
        console.log('[App] Setting pending song file and showing confirmation dialog');
        setPendingSongFile(file);
        setShowSongLoadConfirm(true);
        return;
      }
      
      // Handle non-song formats immediately
      if (filename.endsWith('.dbi')) {
        // DEViLBOX instrument file
        const instrumentData = await importInstrument(file);
        if (instrumentData?.instrument) {
          addInstrument(instrumentData.instrument);
          notify.success(`Loaded instrument: ${instrumentData.instrument.name || 'Untitled'}`);
        } else {
          notify.error(`Failed to load instrument: ${file.name}`);
        }
        
      } else if (filename.endsWith('.xml')) {
        // XML file - could be DB303 pattern or preset
        const text = await file.text();
        const isPreset = text.includes('<db303-preset');
        const isPattern = text.includes('<db303-pattern');
        
        if (isPreset) {
          // Import preset - find or create TB-303 instrument and apply
          const { parseDb303Preset } = await import('@lib/import/Db303PresetConverter');
          const { instruments, updateInstrument, addInstrument: addInst } = useInstrumentStore.getState();
          const presetConfig = parseDb303Preset(text);
          
          let tb303Instrument = instruments.find(inst => inst.synthType === 'TB303');
          if (!tb303Instrument) {
            // Auto-create TB-303 instrument
            const { createDefaultTB303Instrument } = await import('@lib/instrumentFactory');
            const newInst = createDefaultTB303Instrument();
            addInst(newInst);
            tb303Instrument = newInst;
            console.log('[FileDrop] Auto-created TB-303 instrument:', newInst.id);
          }
          
          updateInstrument(tb303Instrument.id, {
            tb303: { ...tb303Instrument.tb303, ...presetConfig }
          });
          
          notify.success(`Loaded DB303 preset: ${file.name}`);
          console.log('[FileDrop] Applied preset to instrument:', tb303Instrument.id, presetConfig);
          
        } else if (isPattern) {
          // Import pattern - find or create TB-303 instrument
          const { parseDb303Pattern } = await import('@lib/import/Db303PatternConverter');
          const { patterns, loadPatterns, setCurrentPattern, setPatternOrder } = useTrackerStore.getState();
          const { instruments, addInstrument: addInst } = useInstrumentStore.getState();
          const { setBPM } = useTransportStore.getState();
          
          let tb303Instrument = instruments.find(inst => inst.synthType === 'TB303');
          if (!tb303Instrument) {
            // Auto-create TB-303 instrument
            const { createDefaultTB303Instrument } = await import('@lib/instrumentFactory');
            const newInst = createDefaultTB303Instrument();
            addInst(newInst);
            tb303Instrument = newInst;
            console.log('[FileDrop] Auto-created TB-303 instrument:', newInst.id);
          }
          
          const patternName = file.name.replace('.xml', '') || 'Imported Pattern';
          const { pattern: importedPattern, tempo } = parseDb303Pattern(text, patternName, tb303Instrument.id);
          
          importedPattern.channels[0].instrumentId = tb303Instrument.id;
          
          const newPatterns = [...patterns, importedPattern];
          loadPatterns(newPatterns);
          setCurrentPattern(newPatterns.length - 1);
          setPatternOrder([newPatterns.length - 1]);
          
          if (tempo !== undefined) setBPM(tempo);
          // NOTE: We intentionally DO NOT apply swing from DB303 XML to avoid
          // double-swing with tracker's global groove/swing system.
          // Users can manually adjust swing via the tracker's transport settings.
          // The swing parameter in DB303 XML affects slide timing in the original,
          // but applying it here would conflict with tracker groove and cause
          // incorrect slide behavior.
          // Original code (now disabled):
          // if (swing !== undefined) {
          //   setSwing(100 + (swing * 100));
          //   setGrooveSteps(2);
          // }
          
          notify.success(`Loaded DB303 pattern: ${importedPattern.name}`);
          
        } else {
          notify.error('Unknown XML format. Expected db303-pattern or db303-preset.');
        }
        
      } else if (filename.endsWith('.sqs') || filename.endsWith('.seq')) {
        // Behringer TD-3 / Synthtribe pattern file (.sqs = single, .seq = sequence/multiple patterns)
        const { parseTD3File } = await import('@lib/import/TD3PatternLoader');
        const { td3StepsToTrackerCells } = await import('@/midi/sysex/TD3PatternTranslator');
        const { patterns, loadPatterns, setCurrentPattern, setPatternOrder } = useTrackerStore.getState();
        const { instruments, addInstrument: addInst } = useInstrumentStore.getState();
        
        // Find or create TB-303 instrument
        let tb303Instrument = instruments.find(inst => inst.synthType === 'TB303');
        if (!tb303Instrument) {
          const { createDefaultTB303Instrument } = await import('@lib/instrumentFactory');
          const newInst = createDefaultTB303Instrument();
          addInst(newInst);
          tb303Instrument = newInst;
          console.log('[FileDrop] Auto-created TB-303 instrument for SQS:', newInst.id);
        }
        
        const buffer = await file.arrayBuffer();
        const td3File = await parseTD3File(buffer);
        
        if (td3File.patterns.length === 0) {
          notify.error('No patterns found in SQS file');
          return;
        }
        
        // Get instrument index (1-based for tracker) - recalculate after potential add
        const currentInstruments = useInstrumentStore.getState().instruments;
        const instrumentIndex = currentInstruments.findIndex(i => i.id === tb303Instrument!.id) + 1 || 1;
        
        // Import all patterns from the file
        const importedPatterns: Pattern[] = td3File.patterns.map((td3Pattern, idx) => {
          // td3Pattern.steps is already in the correct format (TD3Step[])
          const cells = td3StepsToTrackerCells(td3Pattern.steps, 2); // Base octave 2
          const patternLength = td3Pattern.length || 16;
          
          // Create a new pattern
          const patternId = `td3-${Date.now()}-${idx}`;
          return {
            id: patternId,
            name: td3Pattern.name || `TD-3 Pattern ${idx + 1}`,
            length: patternLength,
            channels: [{
              id: `ch-${tb303Instrument!.id}-${idx}`,
              name: 'TB-303',
              muted: false,
              solo: false,
              collapsed: false,
              volume: 100,
              pan: 0,
              instrumentId: tb303Instrument!.id,
              color: '#ec4899',
              rows: cells.slice(0, patternLength).map(cell => ({
                ...cell,
                instrument: cell.note ? instrumentIndex : 0
              }))
            }]
          };
        });
        
        const newPatterns = [...patterns, ...importedPatterns];
        loadPatterns(newPatterns);
        setCurrentPattern(patterns.length); // First imported pattern
        setPatternOrder(importedPatterns.map((_, i) => patterns.length + i));
        
        notify.success(`Loaded ${importedPatterns.length} TD-3 pattern(s) from ${file.name}`);
        
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
      <AppLayout
        onShowExport={() => setShowExport(true)}
        onShowHelp={() => setShowHelp(true)}
        onShowMasterFX={() => setShowMasterFX(!showMasterFX)}
        onShowPatterns={() => setShowPatterns(!showPatterns)}
        onShowInstruments={() => setShowInstrumentModal(true)}
        onLoad={() => setShowFileBrowser(true)}
        onShowDrumpads={() => setShowDrumpads(true)}
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
        onShowExport={() => setShowExport(true)}
        onShowHelp={() => setShowHelp(true)}
        onShowMasterFX={() => setShowMasterFX(!showMasterFX)}
        onShowPatterns={() => setShowPatterns(!showPatterns)}
        onShowInstruments={() => setShowInstrumentModal(true)}
        onLoad={() => setShowFileBrowser(true)}
        onShowDrumpads={() => setShowDrumpads(true)}
        onShowAuth={() => setShowAuthModal(true)}
      >
        <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-y-hidden">
        {/* Top: Main workspace */}
        <div className="flex flex-1 min-h-0 min-w-0 overflow-y-hidden">
          {/* Left side - Pattern Editor or Arrangement View */}
          <div className="flex flex-col min-h-0 min-w-0 flex-1">
            {activeView === 'tracker' && (
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
                    onShowPatterns={() => setShowPatterns(!showPatterns)}
                    onShowExport={() => setShowExport(true)}
                    onShowHelp={(tab) => {
                      if (tab) setHelpInitialTab(tab as any);
                      else setHelpInitialTab('shortcuts');
                      setShowHelp(true);
                    }}
                    onShowMasterFX={() => setShowMasterFX(!showMasterFX)}
                    onShowInstrumentFX={() => setShowInstrumentFX(!showInstrumentFX)}
                    onShowInstruments={() => setShowInstrumentModal(true)}
                    onShowDrumpads={() => setShowDrumpads(true)}
                    showPatterns={showPatterns}
                    showMasterFX={showMasterFX}
                    showInstrumentFX={showInstrumentFX}
                  />
                </div>
              </>
            )}

            {activeView === 'arrangement' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Loading arrangement...</div>}>
                <ArrangementView />
              </Suspense>
            )}
          </div>

        </div>
        
        {/* Global Status Bar (includes MIDI Knob Bar) */}
        <StatusBar onShowTips={() => setShowTips(true)} />
      </div>

      {/* Modals */}
      <Suspense fallback={null}>
        {showHelp && <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} initialTab={helpInitialTab} />}
        {showExport && <ExportDialog isOpen={showExport} onClose={() => setShowExport(false)} />}
        {showInstrumentModal && <EditInstrumentModal isOpen={showInstrumentModal} onClose={() => setShowInstrumentModal(false)} />}
        {showMasterFX && <MasterEffectsModal isOpen={showMasterFX} onClose={() => setShowMasterFX(false)} />}
        {showInstrumentFX && <InstrumentEffectsModal isOpen={showInstrumentFX} onClose={() => setShowInstrumentFX(false)} />}
        {showTD3Pattern && <TD3PatternDialog isOpen={showTD3Pattern} onClose={closePatternDialog} />}
        {showDrumpads && <DrumpadEditorModal isOpen={showDrumpads} onClose={() => setShowDrumpads(false)} />}
        {showFileBrowser && (
          <FileBrowser
            isOpen={showFileBrowser}
            onClose={() => setShowFileBrowser(false)}
            mode="load"
            onLoad={async (data: any, filename: string) => {
              setShowFileBrowser(false);
              // Load the project data
              const { loadPatterns, setCurrentPattern } = useTrackerStore.getState();
              const { addInstrument } = useInstrumentStore.getState();

              try {
                if (data.patterns) {
                  loadPatterns(data.patterns);
                  if (data.patterns.length > 0) {
                    setCurrentPattern(0);
                  }
                }
                if (data.instruments && Array.isArray(data.instruments)) {
                  data.instruments.forEach((inst: InstrumentConfig) => addInstrument(inst));
                }
                notify.success(`Loaded: ${filename}`);
              } catch (error) {
                console.error('Failed to load project:', error);
                notify.error('Failed to load project');
              }
            }}
            onLoadTrackerModule={async (buffer: ArrayBuffer, filename: string) => {
              const { isPlaying, stop } = useTransportStore.getState();
              const engine = getToneEngine();
              if (isPlaying) { stop(); engine.releaseAll(); }

              try {
                const lower = filename.toLowerCase();
                if (lower.endsWith('.sqs') || lower.endsWith('.seq')) {
                  // Behringer TD-3 pattern file
                  const { parseTD3File } = await import('@lib/import/TD3PatternLoader');
                  const { td3StepsToTrackerCells } = await import('@/midi/sysex/TD3PatternTranslator');
                  const { loadPatterns, setCurrentPattern, setPatternOrder } = useTrackerStore.getState();
                  const { instruments, addInstrument: addInst } = useInstrumentStore.getState();

                  let tb303Instrument = instruments.find(inst => inst.synthType === 'TB303');
                  if (!tb303Instrument) {
                    const { createDefaultTB303Instrument } = await import('@lib/instrumentFactory');
                    const newInst = createDefaultTB303Instrument();
                    addInst(newInst);
                    tb303Instrument = newInst;
                  }

                  const td3File = await parseTD3File(buffer);
                  if (td3File.patterns.length === 0) {
                    notify.error('No patterns found in file');
                    return;
                  }

                  const currentInstruments = useInstrumentStore.getState().instruments;
                  const instrumentIndex = currentInstruments.findIndex(i => i.id === tb303Instrument!.id) + 1 || 1;

                  const importedPatterns = td3File.patterns.map((td3Pattern, idx) => {
                    const cells = td3StepsToTrackerCells(td3Pattern.steps, 2);
                    const patternLength = td3Pattern.length || 16;
                    const patternId = `td3-${Date.now()}-${idx}`;
                    return {
                      id: patternId,
                      name: td3Pattern.name || `TD-3 Pattern ${idx + 1}`,
                      length: patternLength,
                      channels: [{
                        id: `ch-${tb303Instrument!.id}-${idx}`,
                        name: 'TB-303',
                        muted: false,
                        solo: false,
                        collapsed: false,
                        volume: 100,
                        pan: 0,
                        instrumentId: tb303Instrument!.id,
                        color: '#ec4899',
                        rows: cells.slice(0, patternLength).map(cell => ({
                          ...cell,
                          instrument: cell.note ? instrumentIndex : 0
                        }))
                      }]
                    };
                  });

                  loadPatterns(importedPatterns);
                  setCurrentPattern(0);
                  setPatternOrder(importedPatterns.map((_, i) => i));
                  notify.success(`Imported ${importedPatterns.length} TD-3 pattern(s)`);
                } else {
                  // Load other tracker modules (.fur, .mod, .xm, etc.)
                  const { loadModuleFile } = await import('@lib/import/ModuleLoader');
                  const { convertModule, convertXMModule, convertMODModule } = await import('@lib/import/ModuleConverter');
                  const { convertToInstrument } = await import('@lib/import/InstrumentConverter');
                  const moduleInfo = await loadModuleFile(new File([buffer], filename));
                  
                  if (moduleInfo) {
                    let result;
                    let instruments: InstrumentConfig[] = [];

                    // Convert native format data (XM, MOD, FUR, etc.)
                    if (moduleInfo.nativeData?.patterns) {
                      const { format, patterns: nativePatterns, importMetadata, instruments: nativeInstruments } = moduleInfo.nativeData;
                      const channelCount = importMetadata.originalChannelCount;
                      const instrumentNames = nativeInstruments?.map((i: any) => i.name) || [];
                      
                      if (format === 'XM') {
                        result = convertXMModule(nativePatterns as any, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
                      } else if (format === 'MOD') {
                        result = convertMODModule(nativePatterns as any, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
                      } else if (moduleInfo.metadata.song) {
                        // FUR, DMF, etc.
                        result = convertModule(moduleInfo.metadata.song);
                      }

                      // Create instruments from native data
                      if (nativeInstruments) {
                        let nextId = 1;
                        for (const parsedInst of nativeInstruments) {
                          const converted = convertToInstrument(parsedInst, nextId, format);
                          instruments.push(...converted);
                          nextId += converted.length;
                        }
                      }
                    } else if (moduleInfo.metadata.song) {
                      // Convert from generic song data
                      result = convertModule(moduleInfo.metadata.song);
                    }

                    if (result) {
                      const { loadPatterns, setCurrentPattern, setPatternOrder } = useTrackerStore.getState();
                      const { addInstrument } = useInstrumentStore.getState();

                      // If no instruments created from native data, create from pattern data
                      if (instruments.length === 0) {
                        instruments = createInstrumentsForModule(result.patterns, result.instrumentNames || [], undefined);
                      }

                      instruments.forEach((inst: InstrumentConfig) => addInstrument(inst));
                      loadPatterns(result.patterns);
                      setCurrentPattern(0);
                      
                      if (result.order && result.order.length > 0) {
                        setPatternOrder(result.order);
                      }
                      
                      notify.success(`Imported ${filename}: ${result.patterns.length} patterns, ${instruments.length} instruments`);
                    }
                  }
                }
              } catch (error) {
                console.error('Failed to load tracker module:', error);
                notify.error('Failed to load file');
              }
            }}
          />
        )}
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
      <Suspense fallback={null}>
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </Suspense>
    </AppLayout>
    </GlobalDragDropHandler>
  );
}

export default App;
