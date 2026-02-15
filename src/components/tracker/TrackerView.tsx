/**
 * TrackerView - Main tracker container with pattern editor and controls
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PatternEditorCanvas } from './PatternEditorCanvas';
import { GridSequencer } from '@components/grid/GridSequencer';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore, useAudioStore, useUIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { GROOVE_TEMPLATES } from '@typedefs/audio';
import { useTrackerInput } from '@hooks/tracker/useTrackerInput';
import { useBlockOperations } from '@hooks/tracker/BlockOperations';
import { usePatternPlayback } from '@hooks/audio/usePatternPlayback';
import { useFPSMonitor } from '@hooks/useFPSMonitor';
import { InterpolateDialog } from '@components/dialogs/InterpolateDialog';
import { HumanizeDialog } from '@components/dialogs/HumanizeDialog';
import { FindReplaceDialog } from '@components/dialogs/FindReplaceDialog';
import { ImportModuleDialog, type ImportOptions } from '@components/dialogs/ImportModuleDialog';
import { ScaleVolumeDialog } from './ScaleVolumeDialog';
import { FadeVolumeDialog } from './FadeVolumeDialog';
import { RemapInstrumentDialog } from './RemapInstrumentDialog';
import { AcidPatternGeneratorDialog } from '@components/dialogs/AcidPatternGeneratorDialog';
import { PatternOrderModal } from '@components/dialogs/PatternOrderModal';
import { StrumDialog } from '@components/dialogs/StrumDialog';
import { AdvancedEditModal } from '@components/dialogs/AdvancedEditModal';
import { KeyboardShortcutSheet } from './KeyboardShortcutSheet';
import { EffectPicker } from './EffectPicker';
import { UndoHistoryPanel } from './UndoHistoryPanel';
import { PatternMatrix } from './PatternMatrix';
import { FT2Toolbar } from './FT2Toolbar';
import { TB303KnobPanel } from './TB303KnobPanel';
import { TB303View } from '@components/demo/TB303View';
import { MobileTrackerView } from './MobileTrackerView';
import { useResponsive } from '@hooks/useResponsive';
import { Music2, Eye, EyeOff, Zap, List, Grid3x3, Piano, Radio, Activity, LayoutGrid } from 'lucide-react';
import { InstrumentList } from '@components/instruments/InstrumentList';
import { GrooveSettingsModal } from '@components/dialogs/GrooveSettingsModal';
import { PianoRoll } from '../pianoroll';
import { AutomationPanel } from '@components/automation/AutomationPanel';
import { notify } from '@stores/useNotificationStore';
import type { ModuleInfo } from '@lib/import/ModuleLoader';
import { convertModule, convertXMModule, convertMODModule } from '@lib/import/ModuleConverter';
import type { XMNote } from '@lib/import/formats/XMParser';
import type { MODNote } from '@lib/import/formats/MODParser';
import { convertToInstrument } from '@lib/import/InstrumentConverter';
import { extractSamples, canExtractSamples } from '@lib/import/SampleExtractor';
import { encodeWav } from '@lib/import/WavEncoder';
import { getToneEngine } from '@engine/ToneEngine';
import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_OSCILLATOR, DEFAULT_ENVELOPE, DEFAULT_FILTER } from '@typedefs/instrument';
import type { Pattern } from '@typedefs';
import { downloadPattern } from '@lib/export/PatternExport';
import { downloadTrack } from '@lib/export/TrackExport';

// Create instruments for imported module, using samples if available
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

interface TrackerViewProps {
  onShowExport?: () => void;
  onShowHelp?: () => void;
  onShowMasterFX?: () => void;
  onShowInstrumentFX?: () => void;
  onShowInstruments?: () => void;
  onShowImportModule?: () => void;
  onShowPatterns?: () => void;
  onShowDrumpads?: () => void;
  showMasterFX?: boolean;
  showInstrumentFX?: boolean;
  showImportModule?: boolean;
  showPatterns?: boolean;
}

export const TrackerView: React.FC<TrackerViewProps> = ({
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowInstrumentFX,
  onShowInstruments,
  onShowImportModule,
  onShowDrumpads,
  showMasterFX,
  showInstrumentFX,
  showImportModule: externalShowImportModule,
}) => {
  const { isMobile, width: windowWidth } = useResponsive();

  // PERFORMANCE OPTIMIZATION: Group selectors with useShallow to reduce re-render overhead
  const { 
    patterns, 
    currentPatternIndex, 
    cursor, 
    showGhostPatterns,
    loadPatterns,
    setPatternOrder,
    setOriginalModuleData,
    setShowGhostPatterns,
    scaleVolume,
    fadeVolume,
    remapInstrument
  } = useTrackerStore(useShallow((state) => ({
    patterns: state.patterns,
    currentPatternIndex: state.currentPatternIndex,
    cursor: state.cursor,
    showGhostPatterns: state.showGhostPatterns,
    loadPatterns: state.loadPatterns,
    setPatternOrder: state.setPatternOrder,
    setOriginalModuleData: state.setOriginalModuleData,
    setShowGhostPatterns: state.setShowGhostPatterns,
    scaleVolume: state.scaleVolume,
    fadeVolume: state.fadeVolume,
    remapInstrument: state.remapInstrument,
  })));

  const { loadInstruments } = useInstrumentStore(useShallow(s => ({ loadInstruments: s.loadInstruments })));
  const { setMetadata } = useProjectStore(useShallow(s => ({ setMetadata: s.setMetadata })));
  const {
    setBPM,
    setSpeed,
    smoothScrolling,
    setSmoothScrolling,
    grooveTemplateId,
    swing,
    jitter,
    useMpcScale,
    stop
  } = useTransportStore(useShallow((state) => ({
    setBPM: state.setBPM,
    setSpeed: state.setSpeed,
    smoothScrolling: state.smoothScrolling,
    setSmoothScrolling: state.setSmoothScrolling,
    grooveTemplateId: state.grooveTemplateId,
    swing: state.swing,
    jitter: state.jitter,
    useMpcScale: state.useMpcScale,
    stop: state.stop,
  })));
  const { masterMuted, toggleMasterMute } = useAudioStore(useShallow((state) => ({
    masterMuted: state.masterMuted,
    toggleMasterMute: state.toggleMasterMute,
  })));
  const statusMessage = useUIStore((state) => state.statusMessage);
  const pendingModuleFile = useUIStore((state) => state.pendingModuleFile);
  const setPendingModuleFile = useUIStore((state) => state.setPendingModuleFile);
  const setActiveView = useUIStore((state) => state.setActiveView);

  // View mode state
  type ViewMode = 'tracker' | 'grid' | 'pianoroll' | 'tb303';
  const [viewMode, setViewMode] = useState<ViewMode>('tracker');
  const [gridChannelIndex, setGridChannelIndex] = useState(0);

  // Dialog state
  const [showInterpolate, setShowInterpolate] = useState(false);
  const [showHumanize, setShowHumanize] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showShortcutSheet, setShowShortcutSheet] = useState(false);
  const [showStrum, setShowStrum] = useState(false);
  const [showEffectPicker, setShowEffectPicker] = useState(false);
  const [showUndoHistory, setShowUndoHistory] = useState(false);
  const [showPatternMatrix, setShowPatternMatrix] = useState(false);
  const [showGrooveSettings, setShowGrooveSettings] = useState(false);
  const [internalShowImportModule, setInternalShowImportModule] = useState(false);
  // FT2 dialogs
  const [showScaleVolume, setShowScaleVolume] = useState(false);
  const [showFadeVolume, setShowFadeVolume] = useState(false);
  const [showRemapInstrument, setShowRemapInstrument] = useState(false);
  const [volumeOpScope, setVolumeOpScope] = useState<'block' | 'track' | 'pattern'>('block');
  const [remapOpScope, setRemapOpScope] = useState<'block' | 'track' | 'pattern' | 'song'>('block');
  // Acid generator dialog
  const [showAcidGenerator, setShowAcidGenerator] = useState(false);
  const [acidGeneratorChannel, setAcidGeneratorChannel] = useState(0);
  // Pattern order modal
  const [showPatternOrder, setShowPatternOrder] = useState(false);

  // Mobile swipe handlers for cursor navigation
  const handleSwipeLeft = useCallback(() => {
    if (!isMobile) return;
    const store = useTrackerStore.getState();
    store.moveCursor('left');
  }, [isMobile]);

  const handleSwipeRight = useCallback(() => {
    if (!isMobile) return;
    const store = useTrackerStore.getState();
    store.moveCursor('right');
  }, [isMobile]);

  // Use external or internal import state
  const showImportModule = externalShowImportModule ?? internalShowImportModule;
  const setShowImportModule = onShowImportModule ?? setInternalShowImportModule;

  // Instrument panel state
  const [showInstrumentPanel, setShowInstrumentPanel] = useState(true);
  const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);

  // FPS monitoring (simplified - no longer does active measurement)
  const { fps, averageFps, quality } = useFPSMonitor();

  // Sync grid channel with tracker cursor when switching views
  useEffect(() => {
    if (viewMode === 'grid') {
      requestAnimationFrame(() => {
        setGridChannelIndex(cursor.channelIndex);
      });
    }
  }, [viewMode, cursor.channelIndex]);

  // Keyboard shortcuts for dialogs
  const handleDialogShortcuts = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    // Ctrl+I: Interpolate
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setShowInterpolate(true);
      return;
    }

    // Ctrl+H: Humanize
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setShowHumanize(true);
      return;
    }

    // Ctrl+F: Find & Replace
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setShowFindReplace(true);
      return;
    }

    // Ctrl+O: Open/Import Module
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setShowImportModule(true);
      return;
    }

    // ?: Keyboard shortcut cheat sheet
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setShowShortcutSheet(prev => !prev);
      return;
    }

    // Ctrl+E: Effect picker popup
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setShowEffectPicker(prev => !prev);
      return;
    }

    // Ctrl+Shift+H: Undo history panel
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h' && e.shiftKey && !e.altKey) {
      e.preventDefault();
      setShowUndoHistory(prev => !prev);
      return;
    }

    // Ctrl+M: Pattern matrix
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setShowPatternMatrix(prev => !prev);
      return;
    }
  }, [
    setShowImportModule,
    setShowInterpolate,
    setShowHumanize,
    setShowFindReplace
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleDialogShortcuts);
    return () => window.removeEventListener('keydown', handleDialogShortcuts);
  }, [handleDialogShortcuts]);

  // React to pending module file (set by drag-drop in App.tsx)
  useEffect(() => {
    if (pendingModuleFile) {
      console.log('[TrackerView] Pending module file detected, opening import dialog:', pendingModuleFile.name);
      setShowImportModule(true);
      // Don't clear yet - ImportModuleDialog needs it
    }
  }, [pendingModuleFile, setShowImportModule]);

  // Enable keyboard input
  useTrackerInput();
  const blockOps = useBlockOperations();

  // Enable pattern playback
  usePatternPlayback();

  // Module import handler - used by both mobile and desktop views
  const handleModuleImport = useCallback(async (info: ModuleInfo, options: ImportOptions) => {
    const { useLibopenmpt } = options;

    // Always clean up engine state before import to prevent stale instruments/state
    getToneEngine().releaseAll();

    // Check if native parser data is available (XM/MOD)
    if (info.nativeData) {
      const { format, importMetadata, instruments: parsedInstruments, patterns } = info.nativeData;

      console.log(`[Import] Using native ${format} parser`);
      console.log(`[Import] ${parsedInstruments.length} instruments, ${patterns.length} patterns`);
      console.log(`[Import] libopenmpt playback mode: ${useLibopenmpt ? 'enabled' : 'disabled'}`);

      // Convert patterns using native converter
      // Pass original buffer for libopenmpt playback if enabled
      let result;
      if (format === 'XM') {
        result = convertXMModule(
          patterns as XMNote[][][],
          importMetadata.originalChannelCount,
          importMetadata,
          parsedInstruments.map(i => i.name),
          useLibopenmpt ? info.arrayBuffer : undefined
        );
      } else if (format === 'MOD') {
        result = convertMODModule(
          patterns as MODNote[][][],
          importMetadata.originalChannelCount,
          importMetadata,
          parsedInstruments.map(i => i.name),
          useLibopenmpt ? info.arrayBuffer : undefined
        );
      } else if (format === 'FUR' || format === 'DMF') {
        // Furnace and DefleMask patterns are already converted
        // Pattern data is [pattern][row][channel], need to convert to [pattern].channels[channel].rows[row]
        const patternOrder = importMetadata.modData?.patternOrderTable || [];
        const patLen = patterns[0]?.length || 64;
        const numChannels = importMetadata.originalChannelCount || (patterns[0]?.[0] as unknown[] | undefined)?.length || 4;
        console.log(`[Import] ${format} pattern structure: ${patterns.length} patterns, ${patLen} rows, ${numChannels} channels`);

        result = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          patterns: (patterns as any[]).map((pat: any[][], idx: number) => ({
            id: `pattern-${idx}`,
            name: `Pattern ${idx}`,
            length: patLen,
            importMetadata,
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
              rows: pat.map((row: any[]) => {
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
          })),
          order: patternOrder.length > 0 ? patternOrder : [0],
          instrumentNames: parsedInstruments.map(i => i.name),
        };
        console.log(`[Import] ${format} patterns converted:`, result.patterns.length, 'patterns, first pattern has', result.patterns[0]?.channels?.length, 'channels');
      } else {
        // Unknown format - try MOD conversion as fallback
        result = convertMODModule(
          patterns as MODNote[][][],
          importMetadata.originalChannelCount,
          importMetadata,
          parsedInstruments.map(i => i.name),
          useLibopenmpt ? info.arrayBuffer : undefined
        );
      }

      if (result.patterns.length === 0) {
        notify.error(`Module "${info.metadata.title}" contains no patterns to import.`);
        return;
      }

      // Convert instruments using native converter
      // Track next available ID to avoid duplicates when multi-sample instruments expand
      const instruments: InstrumentConfig[] = [];
      let nextId = 1;
      for (let i = 0; i < parsedInstruments.length; i++) {
        // Use nextId to ensure globally unique IDs (handles multi-sample Furnace instruments)
        const converted = convertToInstrument(parsedInstruments[i], nextId, format);
        instruments.push(...converted);
        nextId += converted.length; // Advance ID by number of instruments created
      }

      // Stop playback before loading to prevent STALE INSTRUMENT warnings
      stop();

      // Ensure audio context is running before loading instruments
      // This prevents InvalidStateError when worklets try to initialize
      try {
        const context = Tone.getContext();
        const rawContext = (context as any).rawContext || (context as any)._context;
        if (rawContext && rawContext.state !== 'running') {
          await context.resume();
          // Wait for context to actually transition to running state
          let attempts = 0;
          while (rawContext.state !== 'running' && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
          }
          console.log('[Import] Audio context resumed, state:', rawContext.state, 'after', attempts * 50, 'ms');
        }
      } catch (err) {
        console.warn('[Import] Failed to resume audio context:', err);
      }

      // Load instruments first, then patterns
      loadInstruments(instruments);
      loadPatterns(result.patterns);

      // Set pattern order from module (song position list)
      console.log('[Import] result.order:', result.order);
      if (result.order && result.order.length > 0) {
        setPatternOrder(result.order);
        console.log('[Import] Pattern order set:', result.order.length, 'positions, first 10:', result.order.slice(0, 10));
      } else {
        console.warn('[Import] No pattern order found in result!');
      }

      // Store original module data for libopenmpt playback if available
      if (result.originalModuleData) {
        setOriginalModuleData(result.originalModuleData);
        console.log('[Import] Original module data stored for libopenmpt playback');
      } else {
        setOriginalModuleData(null);
      }

      // Update project metadata
      setMetadata({
        name: info.metadata.title,
        author: '',
        description: `Imported from ${info.file?.name || 'module'} (${format})`,
      });

      // Set BPM from module (or default to 125)
      setBPM(importMetadata.modData?.initialBPM || 125);
      // Set Speed from module (or default to 6)
      setSpeed(importMetadata.modData?.initialSpeed || 6);

      const samplerCount = instruments.filter(i => i.synthType === 'Sampler').length;
      console.log('Imported module:', info.metadata.title, {
        format,
        patterns: result.patterns.length,
        channels: importMetadata.originalChannelCount,
        instruments: instruments.length,
        samplers: samplerCount,
      });

      // Pre-load all instruments (especially samplers) to ensure they're ready
      if (samplerCount > 0) {
        console.log('[Import] Preloading samples...');
        await getToneEngine().preloadInstruments(instruments);
        console.log('[Import] Samples ready for playback');
      }

      notify.success(`Imported "${info.metadata.title}" - ${result.patterns.length} patterns, ${instruments.length} instruments`);

      return;
    }

    // Fallback to libopenmpt path for other formats (IT, S3M, etc.)
    if (!info.metadata.song) {
      notify.error(`Module "${info.metadata.title}" loaded but no pattern data found.`);
      return;
    }

    console.log('[Import] Using libopenmpt fallback');

    // Convert the module data to our pattern format
    const result = convertModule(info.metadata.song);

    if (result.patterns.length === 0) {
      notify.error(`Module "${info.metadata.title}" contains no patterns to import.`);
      return;
    }

    // Try to extract samples if the original file is available
    let sampleUrls: Map<number, string> | undefined;
    if (info.file && canExtractSamples(info.file.name)) {
      try {
        console.log('[Import] Extracting samples from module...');
        const extraction = await extractSamples(info.file);
        sampleUrls = new Map();

        for (let i = 0; i < extraction.samples.length; i++) {
          const sample = extraction.samples[i];
          if (sample.pcmData.length > 0) {
            const wavUrl = encodeWav(sample);
            sampleUrls.set(i + 1, wavUrl);
            console.log(`[Import] Sample ${i + 1}: ${sample.name} (${sample.pcmData.length} samples)`);
          }
        }
        console.log(`[Import] Extracted ${sampleUrls.size} samples`);
      } catch (err) {
        console.warn('[Import] Could not extract samples, using synth fallback:', err);
      }
    }

    // Create instruments for the module (with samples if available)
    const instruments = createInstrumentsForModule(
      result.patterns,
      result.instrumentNames,
      sampleUrls
    );

    // Load instruments first, then patterns
    loadInstruments(instruments);
    loadPatterns(result.patterns);

    // Set pattern order from module (song position list)
    if (result.order && result.order.length > 0) {
      setPatternOrder(result.order);
      console.log('[Import] Pattern order set:', result.order.length, 'positions');
    }

    // Update project metadata
    setMetadata({
      name: info.metadata.title,
      author: '',
      description: `Imported from ${info.file?.name || 'module'}`,
    });

    // Set ProTracker default tempo (125 BPM)
    setBPM(125);

    const samplerCount = instruments.filter(i => i.synthType === 'Sampler').length;
    console.log('Imported module:', info.metadata.title, {
      patterns: result.patterns.length,
      channels: result.channelCount,
      instruments: instruments.length,
      samplers: samplerCount,
    });

    // Pre-load all instruments (especially samplers) to ensure they're ready
    if (samplerCount > 0) {
      console.log('[Import] Preloading samples...');
      await getToneEngine().preloadInstruments(instruments);
      console.log('[Import] Samples ready for playback');
    }

    notify.success(`Imported "${info.metadata.title}" - ${result.patterns.length} patterns, ${instruments.length} instruments`);
  }, [loadInstruments, loadPatterns, setMetadata, setBPM, setSpeed, setPatternOrder, setOriginalModuleData]);

  // Acid generator handler
  const handleAcidGenerator = useCallback((channelIndex: number) => {
    setAcidGeneratorChannel(channelIndex);
    setShowAcidGenerator(true);
  }, []);

  const pattern = patterns[currentPatternIndex];

  // Mobile view with tabbed interface
  if (isMobile) {
    return (
      <>
        <MobileTrackerView
          onShowExport={onShowExport}
          onShowHelp={onShowHelp}
          onShowMasterFX={onShowMasterFX}
          onShowInstruments={onShowInstruments}
          showMasterFX={showMasterFX}
        />
        {/* Dialogs still need to render */}
        <InterpolateDialog isOpen={showInterpolate} onClose={() => setShowInterpolate(false)} />
        <HumanizeDialog isOpen={showHumanize} onClose={() => setShowHumanize(false)} />
        <FindReplaceDialog isOpen={showFindReplace} onClose={() => setShowFindReplace(false)} />
        <KeyboardShortcutSheet isOpen={showShortcutSheet} onClose={() => setShowShortcutSheet(false)} />
      <StrumDialog isOpen={showStrum} onClose={() => setShowStrum(false)} />
      <EffectPicker
        isOpen={showEffectPicker}
        onSelect={(effTyp, eff) => {
          const { cursor, setCell } = useTrackerStore.getState();
          setCell(cursor.channelIndex, cursor.rowIndex, { effTyp, eff });
          setShowEffectPicker(false);
        }}
        onClose={() => setShowEffectPicker(false)}
        synthType={(() => {
          // Get synth type from current cell's instrument
          const { cursor, patterns, currentPatternIndex } = useTrackerStore.getState();
          const pattern = patterns[currentPatternIndex];
          if (!pattern) return undefined;
          const cell = pattern.channels[cursor.channelIndex]?.rows[cursor.rowIndex];
          if (!cell?.instrument) return undefined;
          const inst = useInstrumentStore.getState().getInstrument(cell.instrument);
          return inst?.synthType;
        })()}
      />
      <UndoHistoryPanel isOpen={showUndoHistory} onClose={() => setShowUndoHistory(false)} />
      <PatternMatrix isOpen={showPatternMatrix} onClose={() => setShowPatternMatrix(false)} />
        <ImportModuleDialog
          isOpen={showImportModule}
          onClose={() => {
            setShowImportModule(false);
            setPendingModuleFile(null); // Clear pending file on close
          }}
          onImport={handleModuleImport}
          initialFile={pendingModuleFile}
        />
        {/* FT2 Dialogs */}
        {showScaleVolume && (
          <ScaleVolumeDialog
            scope={volumeOpScope}
            onConfirm={(factor) => {
              scaleVolume(volumeOpScope, factor);
              setShowScaleVolume(false);
            }}
            onCancel={() => setShowScaleVolume(false)}
          />
        )}
        {showFadeVolume && (
          <FadeVolumeDialog
            scope={volumeOpScope}
            onConfirm={(startVol, endVol) => {
              fadeVolume(volumeOpScope, startVol, endVol);
              setShowFadeVolume(false);
            }}
            onCancel={() => setShowFadeVolume(false)}
          />
        )}
        {showRemapInstrument && (
          <RemapInstrumentDialog
            scope={remapOpScope}
            onConfirm={(source, dest) => {
              remapInstrument(source, dest, remapOpScope);
              setShowRemapInstrument(false);
            }}
            onCancel={() => setShowRemapInstrument(false)}
          />
        )}
        {showAcidGenerator && (
          <AcidPatternGeneratorDialog
            channelIndex={acidGeneratorChannel}
            onClose={() => setShowAcidGenerator(false)}
          />
        )}
      </>
    );
  }

  // Desktop view
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-dark-bg overflow-y-hidden">
      {/* FT2 Style Toolbar (shrinkable when space is limited) */}
      <div className="flex-shrink min-h-[80px]">
        <FT2Toolbar
          onShowExport={onShowExport}
          onShowHelp={onShowHelp}
          onShowMasterFX={onShowMasterFX}
          onShowInstrumentFX={onShowInstrumentFX}
          onShowInstruments={onShowInstruments}
          onShowPatternOrder={() => setShowPatternOrder(true)}
          onShowDrumpads={onShowDrumpads}
          showMasterFX={showMasterFX}
          showInstrumentFX={showInstrumentFX}
        />
      </div>

      {/* TB-303 Live Knobs - full height, panel has its own collapse toggle */}
      {viewMode !== 'tb303' && (
        <div className="flex-shrink-0">
          <TB303KnobPanel />
        </div>
      )}

      {/* Editor Controls Toolbar - Compact & Shrinkable */}
      <div className="flex-shrink flex items-center justify-between px-2 py-1 bg-dark-bgTertiary border-b border-dark-border min-h-[28px]">
        <div className="flex items-center gap-2">
          {/* View Mode Dropdown */}
          <div className="flex items-center gap-1">
            {viewMode === 'tracker' && <List size={14} className="text-text-secondary" />}
            {viewMode === 'grid' && <Grid3x3 size={14} className="text-text-secondary" />}
            {viewMode === 'pianoroll' && <Piano size={14} className="text-text-secondary" />}
            {viewMode === 'tb303' && <Radio size={14} className="text-text-secondary" />}
            <select
              value={viewMode}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'arrangement') {
                  setActiveView('arrangement');
                } else {
                  setViewMode(val as ViewMode);
                }
              }}
              className="px-2 py-1 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors"
              title="Select editor view"
            >
              <option value="tracker">Tracker</option>
              <option value="grid">Grid</option>
              <option value="pianoroll">Piano Roll</option>
              <option value="tb303">TB-303</option>
              <option value="arrangement">Arrangement</option>
            </select>
          </div>

          {/* Channel Selector (grid and piano roll views) */}
          {(viewMode === 'grid' || viewMode === 'pianoroll') && pattern && (
            <>
              <span className="text-text-secondary text-[10px] font-medium">CH:</span>
              <select
                value={gridChannelIndex}
                onChange={(e) => setGridChannelIndex(Number(e.target.value))}
                className="px-2 py-1 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors"
              >
                {pattern.channels.map((_, idx) => (
                  <option key={idx} value={idx}>
                    {(idx + 1).toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </>
          )}

          {/* Ghost Patterns Toggle (tracker view only) */}
          {viewMode === 'tracker' && (
            <button
              onClick={() => setShowGhostPatterns(!showGhostPatterns)}
              className={`
                flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors
                ${showGhostPatterns
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
                }
              `}
              title={showGhostPatterns ? "Hide ghost patterns" : "Show ghost patterns"}
            >
              {showGhostPatterns ? <Eye size={12} /> : <EyeOff size={12} />}
              <span>Ghosts</span>
            </button>
          )}

          {/* Advanced Edit Toggle (tracker view only) */}
          {viewMode === 'tracker' && (
            <button
              onClick={() => setShowAdvancedEdit(!showAdvancedEdit)}
              className={`
                flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors
                ${showAdvancedEdit
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
                }
              `}
              title="Toggle Advanced Edit Panel"
            >
              <Zap size={12} />
              <span>Edit</span>
            </button>
          )}

          {/* Automation Editor Toggle (tracker view only) */}
          {viewMode === 'tracker' && (
            <button
              onClick={() => setShowAutomation(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors bg-dark-bgSecondary text-text-secondary hover:text-text-primary"
              title="Open Automation Editor"
            >
              <Activity size={12} />
              <span>Auto</span>
            </button>
          )}

          {/* Drumpad Editor Toggle (any view) */}
          <button
            onClick={onShowDrumpads}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors bg-dark-bgSecondary text-text-secondary hover:text-text-primary"
            title="Open Drumpad Editor"
          >
            <LayoutGrid size={12} />
            <span>Pads</span>
          </button>

          {/* Separator */}
          <div className="w-px h-4 bg-border opacity-50 mx-1" />

          {/* Mute Button */}
          <button
            onClick={toggleMasterMute}
            className={`
              px-2 py-1 text-xs rounded font-medium transition-colors
              ${masterMuted
                ? 'bg-accent-error/20 text-accent-error'
                : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
              }
            `}
            title={masterMuted ? 'Unmute master output' : 'Mute master output'}
          >
            {masterMuted ? 'Unmute' : 'Mute'}
          </button>

          {/* Stepped/Smooth Scrolling Toggle */}
          <button
            onClick={() => setSmoothScrolling(!smoothScrolling)}
            className={`
              px-2 py-1 text-xs rounded font-medium transition-colors
              ${smoothScrolling
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
              }
            `}
            title={smoothScrolling ? 'Switch to stepped scrolling' : 'Switch to smooth scrolling'}
          >
            {smoothScrolling ? 'Smooth' : 'Stepped'}
          </button>

          {/* Groove Settings Button */}
          <div className="flex items-center gap-1 ml-1 pl-2 border-l border-dark-border">
            <button
              onClick={() => setShowGrooveSettings(true)}
              className={`px-2 py-1 text-[10px] rounded font-mono font-bold transition-colors ${
                grooveTemplateId !== 'straight' || swing !== (useMpcScale ? 50 : 100) || jitter > 0
                  ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50'
                  : 'bg-dark-bgSecondary text-text-secondary border border-dark-border hover:text-text-primary'
              }`}
              title={`Groove Settings (Current: ${GROOVE_TEMPLATES.find(g => g.id === grooveTemplateId)?.name || 'None'})`}
            >
              GROOVE
            </button>
            {showGrooveSettings && <GrooveSettingsModal onClose={() => setShowGrooveSettings(false)} />}
          </div>

          {/* Status Message (ProTracker Style) */}
          {statusMessage && (
            <div className="flex items-center px-3 ml-2 pl-3 border-l border-dark-border">
              <span className="text-accent-primary font-bold tracking-[0.3em] text-[11px] animate-pulse font-mono">
                {statusMessage.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* FPS / Quality Indicator - Compact */}
        <div
          className={`
            flex items-center gap-1 px-2 py-0.5 text-xs rounded font-mono
            ${quality === 'low'
              ? 'bg-accent-error/20 text-accent-error'
              : quality === 'medium'
              ? 'bg-orange-500/20 text-orange-400'
              : 'bg-green-500/20 text-green-400'
            }
          `}
          title={`Performance: ${quality.toUpperCase()} | Avg FPS: ${averageFps} | Current: ${fps}`}
        >
          <span className="font-bold">{averageFps}</span>
          <span className="text-[10px] opacity-70">FPS</span>
          <div className={`w-1.5 h-1.5 rounded-full ${
            quality === 'low' ? 'bg-accent-error' :
            quality === 'medium' ? 'bg-orange-400' :
            'bg-green-400'
          } animate-pulse`} />
        </div>
      </div>

      {/* Main Content Area with Pattern Editor and Instrument Panel - Flexbox Layout */}
      <div className="flex-1 min-h-0 min-w-0 relative z-10 flex overflow-hidden">
        {/* Pattern Editor / Grid Sequencer / Piano Roll / TB-303 Editor - Flex item 1 */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {viewMode === 'tracker' ? (
            <PatternEditorCanvas
              onAcidGenerator={handleAcidGenerator}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
            />
          ) : viewMode === 'grid' ? (
            <GridSequencer channelIndex={gridChannelIndex} />
          ) : viewMode === 'pianoroll' ? (
            <PianoRoll channelIndex={gridChannelIndex} />
          ) : (
            <div className="flex-1 w-full overflow-y-auto overflow-x-hidden bg-dark-bgPrimary">
              <TB303View channelIndex={gridChannelIndex} />
            </div>
          )}
        </div>

        {/* Instrument Panel Toggle Button - Flex item 2 - Hide on narrow windows */}
        {windowWidth >= 900 && (
          <button
            onClick={() => setShowInstrumentPanel(!showInstrumentPanel)}
            className={`
              flex-shrink-0 w-6 flex items-center justify-center
              bg-ft2-header border-l border-ft2-border
              hover:bg-ft2-border transition-colors
              ${showInstrumentPanel ? 'text-ft2-highlight' : 'text-ft2-textDim'}
            `}
            title={showInstrumentPanel ? 'Hide Instruments' : 'Show Instruments'}
          >
            <Music2 size={14} className={showInstrumentPanel ? '' : 'rotate-180'} />
          </button>
        )}

        {/* Instrument List Panel - Flex item 3 - Hide on narrow windows */}
        {windowWidth >= 900 && showInstrumentPanel && (
          <div className="flex-shrink-0 w-fit min-w-48 max-w-80 border-l border-ft2-border flex flex-col overflow-hidden animate-fade-in">
            <InstrumentList
              variant="ft2"
              showPreviewOnClick={true}
              showPresetButton={true}
              showSamplePackButton={true}
              showEditButton={true}
              onEditInstrument={onShowInstruments}
            />
          </div>
        )}
      </div>

      {/* Dialogs */}
      <InterpolateDialog isOpen={showInterpolate} onClose={() => setShowInterpolate(false)} />
      <HumanizeDialog isOpen={showHumanize} onClose={() => setShowHumanize(false)} />
      <FindReplaceDialog isOpen={showFindReplace} onClose={() => setShowFindReplace(false)} />
      <KeyboardShortcutSheet isOpen={showShortcutSheet} onClose={() => setShowShortcutSheet(false)} />
      <StrumDialog isOpen={showStrum} onClose={() => setShowStrum(false)} />
      <EffectPicker
        isOpen={showEffectPicker}
        onSelect={(effTyp, eff) => {
          const { cursor, setCell } = useTrackerStore.getState();
          setCell(cursor.channelIndex, cursor.rowIndex, { effTyp, eff });
          setShowEffectPicker(false);
        }}
        onClose={() => setShowEffectPicker(false)}
        synthType={(() => {
          // Get synth type from current cell's instrument
          const { cursor, patterns, currentPatternIndex } = useTrackerStore.getState();
          const pattern = patterns[currentPatternIndex];
          if (!pattern) return undefined;
          const cell = pattern.channels[cursor.channelIndex]?.rows[cursor.rowIndex];
          if (!cell?.instrument) return undefined;
          const inst = useInstrumentStore.getState().getInstrument(cell.instrument);
          return inst?.synthType;
        })()}
      />
      <UndoHistoryPanel isOpen={showUndoHistory} onClose={() => setShowUndoHistory(false)} />
      <PatternMatrix isOpen={showPatternMatrix} onClose={() => setShowPatternMatrix(false)} />
      <ImportModuleDialog
        isOpen={showImportModule}
        onClose={() => {
          setShowImportModule(false);
          setPendingModuleFile(null);
        }}
        onImport={handleModuleImport}
        initialFile={pendingModuleFile}
      />

      {/* FT2 Dialogs */}
      {showScaleVolume && (
        <ScaleVolumeDialog
          scope={volumeOpScope}
          onConfirm={(factor) => {
            scaleVolume(volumeOpScope, factor);
            setShowScaleVolume(false);
          }}
          onCancel={() => setShowScaleVolume(false)}
        />
      )}
      {showFadeVolume && (
        <FadeVolumeDialog
          scope={volumeOpScope}
          onConfirm={(startVol, endVol) => {
            fadeVolume(volumeOpScope, startVol, endVol);
            setShowFadeVolume(false);
          }}
          onCancel={() => setShowFadeVolume(false)}
        />
      )}
      {showRemapInstrument && (
        <RemapInstrumentDialog
          scope={remapOpScope}
          onConfirm={(source, dest) => {
            remapInstrument(source, dest, remapOpScope);
            setShowRemapInstrument(false);
          }}
          onCancel={() => setShowRemapInstrument(false)}
        />
      )}
      {showPatternOrder && (
        <PatternOrderModal onClose={() => setShowPatternOrder(false)} />
      )}
      {showAdvancedEdit && (
        <AdvancedEditModal
          onClose={() => setShowAdvancedEdit(false)}
          onShowScaleVolume={(scope) => {
            setVolumeOpScope(scope);
            setShowScaleVolume(true);
          }}
          onShowFadeVolume={(scope) => {
            setVolumeOpScope(scope);
            setShowFadeVolume(true);
          }}
          onShowRemapInstrument={(scope) => {
            setRemapOpScope(scope);
            setShowRemapInstrument(true);
          }}
          onExportPattern={() => {
            const pattern = patterns[currentPatternIndex];
            downloadPattern(pattern);
          }}
          onExportTrack={() => {
            const pattern = patterns[currentPatternIndex];
            downloadTrack(cursor.channelIndex, pattern);
          }}
          onReverse={blockOps.reverseBlock}
          onExpand={blockOps.expandBlock}
          onShrink={blockOps.shrinkBlock}
          onDuplicate={blockOps.duplicateBlock}
          onMath={blockOps.mathBlock}
        />
      )}
      {showAcidGenerator && (
        <AcidPatternGeneratorDialog
          channelIndex={acidGeneratorChannel}
          onClose={() => setShowAcidGenerator(false)}
        />
      )}
      {showAutomation && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-dark-bgPrimary border border-dark-border rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border bg-dark-bgSecondary">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Activity size={20} className="text-accent-primary" />
                Automation Editor
              </h2>
              <button
                onClick={() => setShowAutomation(false)}
                className="p-2 rounded hover:bg-dark-bgHover text-text-muted hover:text-text-primary transition-colors"
                title="Close"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-modern">
              <AutomationPanel />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
