/**
 * TrackerView - Main tracker container with pattern editor and controls
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PatternEditorCanvas } from './PatternEditorCanvas';
import { GridSequencer } from '@components/grid/GridSequencer';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore, useAudioStore, useUIStore } from '@stores';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';
import { GROOVE_TEMPLATES } from '@typedefs/audio';
import { useTrackerInput } from '@hooks/tracker/useTrackerInput';
import { useBlockOperations } from '@hooks/tracker/BlockOperations';
import { useFPSMonitor } from '@hooks/useFPSMonitor';
import { InterpolateDialog } from '@components/dialogs/InterpolateDialog';
import { HumanizeDialog } from '@components/dialogs/HumanizeDialog';
import { FindReplaceDialog } from '@components/dialogs/FindReplaceDialog';
import { ImportModuleDialog, type ImportOptions } from '@components/dialogs/ImportModuleDialog';
import { ImportFurnaceDialog } from '@components/dialogs/ImportFurnaceDialog';
import { ImportMIDIDialog } from '@components/dialogs/ImportMIDIDialog';
import { ImportAudioDialog } from '@components/dialogs/ImportAudioDialog';
import { ImportTD3Dialog } from '@components/dialogs/ImportTD3Dialog';
import { ScaleVolumeDialog } from './ScaleVolumeDialog';
import { FadeVolumeDialog } from './FadeVolumeDialog';
import { RemapInstrumentDialog } from './RemapInstrumentDialog';
import { AcidPatternGeneratorDialog } from '@components/dialogs/AcidPatternGeneratorDialog';
import { RandomizeDialog } from '@components/dialogs/RandomizeDialog';
import { PatternOrderModal } from '@components/dialogs/PatternOrderModal';
import { SYSTEM_PRESETS, DivChanType, getGroupedPresets } from '@/constants/systemPresets';
import { CHANNEL_COLORS } from '@typedefs';
import { StrumDialog } from '@components/dialogs/StrumDialog';
import { AdvancedEditModal } from '@components/dialogs/AdvancedEditModal';
import { KeyboardShortcutSheet } from './KeyboardShortcutSheet';
import { EffectPicker } from './EffectPicker';
import { UndoHistoryPanel } from './UndoHistoryPanel';
import { PatternMatrix } from './PatternMatrix';
import { FT2Toolbar } from './FT2Toolbar';
import { TB303KnobPanel } from './TB303KnobPanel';
import { SubsongSelector } from './SubsongSelector';
import { TB303View } from '@components/demo/TB303View';
import { MobileTrackerView } from './MobileTrackerView';
import { useResponsive } from '@hooks/useResponsive';
import { Music2, Eye, EyeOff, Zap, List, Grid3x3, Piano, Radio, Activity, LayoutGrid, Cpu, SlidersHorizontal } from 'lucide-react';
import { InstrumentList } from '@components/instruments/InstrumentList';
import { GrooveSettingsModal } from '@components/dialogs/GrooveSettingsModal';
import { PianoRoll } from '../pianoroll';
import { AutomationPanel } from '@components/automation/AutomationPanel';
import { notify } from '@stores/useNotificationStore';
import type { TrackerSong } from '@engine/TrackerReplayer';
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
import { DJPitchSlider } from '@components/transport/DJPitchSlider';
import { PatternMinimap } from './PatternMinimap';

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

/**
 * Generate channel metadata from Furnace system presets
 * Maps each channel to its corresponding system/chip and applies preset names/types/colors
 */
function getChannelMetadataFromFurnace(
  systems: number[],
  systemChans: number[],
  totalChannels: number,
  channelShortNames?: string[],
  effectColumns?: number[]
): Array<{
  name: string;
  shortName: string;
  color: string | null;
  channelMeta: {
    importedFromMOD: boolean;
    furnaceType: number;
    hardwareName: string;
    shortName: string;
    systemId: number;
    channelType: 'sample' | 'synth';
    effectCols?: number;
  };
}> {
  const result: Array<{
    name: string;
    shortName: string;
    color: string | null;
    channelMeta: {
      importedFromMOD: boolean;
      furnaceType: number;
      hardwareName: string;
      shortName: string;
      systemId: number;
      channelType: 'sample' | 'synth';
      effectCols?: number;
    };
  }> = [];

  // Map DivChanType to color indices using CHANNEL_COLORS
  const getColorForType = (type: DivChanType): string | null => {
    switch (type) {
      case DivChanType.FM: return CHANNEL_COLORS[7]; // Blue
      case DivChanType.PULSE: return CHANNEL_COLORS[1]; // Red
      case DivChanType.WAVE: return CHANNEL_COLORS[3]; // Yellow
      case DivChanType.NOISE: return CHANNEL_COLORS[10]; // Gray
      case DivChanType.PCM: return CHANNEL_COLORS[4]; // Green
      case DivChanType.OP: return CHANNEL_COLORS[6]; // Cyan
      default: return null;
    }
  };

  let channelIndex = 0;
  
  // Iterate through each system and its channels
  for (let sysIdx = 0; sysIdx < systems.length && channelIndex < totalChannels; sysIdx++) {
    const systemId = systems[sysIdx];
    const numChansForSystem = systemChans[sysIdx] || 0;
    
    // Find the matching system preset by fileID
    const preset = SYSTEM_PRESETS.find(p => p.fileID === systemId);
    
    for (let localCh = 0; localCh < numChansForSystem && channelIndex < totalChannels; localCh++) {
      if (preset && localCh < preset.channelDefs.length) {
        const chDef = preset.channelDefs[localCh];
        result.push({
          name: chDef.name,
          shortName: channelShortNames?.[channelIndex] || chDef.shortName,
          color: getColorForType(chDef.type),
          channelMeta: {
            importedFromMOD: false,  // Furnace import, not MOD
            furnaceType: chDef.type,
            hardwareName: preset.name,
            shortName: channelShortNames?.[channelIndex] || chDef.shortName,
            systemId: systemId,
            channelType: chDef.type === DivChanType.PCM ? 'sample' : 'synth',
            effectCols: effectColumns?.[channelIndex] || 1,
          },
        });
      } else {
        // Fallback for unknown system or channel beyond preset definition
        result.push({
          name: `Channel ${channelIndex + 1}`,
          shortName: channelShortNames?.[channelIndex] || `${channelIndex + 1}`,
          color: null,
          channelMeta: {
            importedFromMOD: false,  // Furnace import, not MOD
            furnaceType: DivChanType.PULSE,
            hardwareName: preset?.name || 'Unknown',
            shortName: channelShortNames?.[channelIndex] || `${channelIndex + 1}`,
            systemId: systemId,
            channelType: 'synth',
            effectCols: effectColumns?.[channelIndex] || 1,
          },
        });
      }
      channelIndex++;
    }
  }

  // Fill any remaining channels with defaults
  while (result.length < totalChannels) {
    const ch = result.length;
    result.push({
      name: `Channel ${ch + 1}`,
      shortName: channelShortNames?.[ch] || `${ch + 1}`,
      color: null,
      channelMeta: {
        importedFromMOD: false,  // Furnace import, not MOD
        furnaceType: DivChanType.PULSE,
        hardwareName: 'Unknown',
        shortName: channelShortNames?.[ch] || `${ch + 1}`,
        systemId: 0,
        channelType: 'synth',
        effectCols: effectColumns?.[ch] || 1,
      },
    });
  }

  return result;
}

interface TrackerViewProps {
  onShowExport?: () => void;
  onShowHelp?: (tab?: string) => void;
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

/** Wrapper that measures its own height and passes it to PatternMinimap */
const MinimapWrapper: React.FC = () => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [h, setH] = React.useState(400);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) setH(entry.contentRect.height);
    });
    obs.observe(el);
    setH(el.clientHeight);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className="flex-shrink-0 self-stretch border-l border-ft2-border">
      <PatternMinimap height={h} />
    </div>
  );
};

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
    showGhostPatterns,
    loadPatterns,
    setPatternOrder,
    setOriginalModuleData,
    setShowGhostPatterns,
    scaleVolume,
    fadeVolume,
    remapInstrument,
    applySystemPreset,
    editorMode
  } = useTrackerStore(useShallow((state) => ({
    patterns: state.patterns,
    currentPatternIndex: state.currentPatternIndex,
    showGhostPatterns: state.showGhostPatterns,
    loadPatterns: state.loadPatterns,
    setPatternOrder: state.setPatternOrder,
    setOriginalModuleData: state.setOriginalModuleData,
    setShowGhostPatterns: state.setShowGhostPatterns,
    scaleVolume: state.scaleVolume,
    fadeVolume: state.fadeVolume,
    remapInstrument: state.remapInstrument,
    applySystemPreset: state.applySystemPreset,
    editorMode: state.editorMode
  })));
  // Fine-grained selector for cursor.channelIndex only — avoids re-rendering
  // the entire TrackerView on every cursor row/column move
  const cursorChannelIndex = useTrackerStore((state) => state.cursor.channelIndex);

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
  const pendingAudioFile = useUIStore((state) => state.pendingAudioFile);
  const setPendingAudioFile = useUIStore((state) => state.setPendingAudioFile);
  const pendingTD3File = useUIStore((state) => state.pendingTD3File);
  const setPendingTD3File = useUIStore((state) => state.setPendingTD3File);
  const setActiveView = useUIStore((state) => state.setActiveView);
  const dialogOpen = useUIStore((state) => state.dialogOpen);
  const closeDialogCommand = useUIStore((state) => state.closeDialogCommand);

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
  // Randomize dialog
  const [showRandomize, setShowRandomize] = useState(false);
  const [randomizeChannel, setRandomizeChannel] = useState(0);
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

  // Merge keyboard-triggered dialog commands into local dialog state
  useEffect(() => {
    if (!dialogOpen) return;
    switch (dialogOpen) {
      case 'interpolate-volume':
      case 'interpolate-effect':
        setShowInterpolate(true);
        break;
      case 'humanize':
        setShowHumanize(true);
        break;
      case 'find-replace':
        setShowFindReplace(true);
        break;
      case 'groove-settings':
        setShowGrooveSettings(true);
        break;
      case 'scale-volume-block':
        setVolumeOpScope('block');
        setShowScaleVolume(true);
        break;
      case 'scale-volume-track':
        setVolumeOpScope('track');
        setShowScaleVolume(true);
        break;
      case 'scale-volume-pattern':
        setVolumeOpScope('pattern');
        setShowScaleVolume(true);
        break;
      case 'keyboard-help':
        setShowShortcutSheet(true);
        break;
    }
    closeDialogCommand();
  }, [dialogOpen, closeDialogCommand]);

  // FPS monitoring (simplified - no longer does active measurement)
  const { fps, averageFps, quality } = useFPSMonitor();

  // Sync grid channel with tracker cursor when switching views
  useEffect(() => {
    if (viewMode === 'grid') {
      requestAnimationFrame(() => {
        setGridChannelIndex(cursorChannelIndex);
      });
    }
  }, [viewMode, cursorChannelIndex]);

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

  // NOTE: usePatternPlayback() is called in App.tsx so it persists across view switches

  // TD-3 pattern import handler
  const handleTD3Import = useCallback(async (file: File, replacePatterns: boolean) => {
    const { loadFile } = await import('@lib/file/UnifiedFileLoader');
    const result = await loadFile(file, { requireConfirmation: false, replacePatterns });
    if (result.success === true) notify.success(result.message);
    else if (result.success === false) notify.error(result.error);
  }, []);

  // Module import handler - used by both mobile and desktop views
  const handleModuleImport = useCallback(async (info: ModuleInfo, options: ImportOptions) => {
    const { useLibopenmpt } = options;
    let format = info.metadata.type; // Default from metadata

    // Always clean up engine state before import to prevent stale instruments/state
    getToneEngine().releaseAll();

    // Check if native parser data is available (XM/MOD)
    if (info.nativeData) {
      const { format: nativeFormat, importMetadata, instruments: parsedInstruments, patterns } = info.nativeData;
      format = nativeFormat; // Use specific native format string

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

        // Apply system preset channel metadata from Furnace
        const furnaceData = importMetadata.furnaceData;
        const channelMetadata = (furnaceData?.systems && furnaceData?.systemChans)
          ? getChannelMetadataFromFurnace(
              furnaceData.systems,
              furnaceData.systemChans,
              numChannels,
              furnaceData.channelShortNames,
              furnaceData.effectColumns
            )
          : null;
        
        if (channelMetadata) {
          console.log(`[Import] Applied system preset: ${furnaceData?.systemName}, systems: [${furnaceData?.systems?.map((s: number) => '0x' + s.toString(16)).join(', ')}]`);
        }

        result = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          patterns: (patterns as any[]).map((pat: any[][], idx: number) => ({
            id: `pattern-${idx}`,
            name: `Pattern ${idx}`,
            length: patLen,
            importMetadata,
            channels: Array.from({ length: numChannels }, (_, ch) => {
              const meta = channelMetadata?.[ch];
              return {
                id: `channel-${ch}`,
                name: meta?.name || `Channel ${ch + 1}`,
                shortName: meta?.shortName,
                muted: false,
                solo: false,
                collapsed: false,
                volume: 100,
                pan: 0,
                instrumentId: null,
                color: meta?.color || null,
                channelMeta: meta?.channelMeta,
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
                    // Include all effects from Furnace (1-8 per channel)
                    effects: cell.effects?.map((e: { type: number; param: number }) => ({ 
                      type: e.type, 
                      param: e.param 
                    })),
                  };
                }),
              };
            }),
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
        const converted = convertToInstrument(parsedInstruments[i], nextId, format as any);
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

    // UADE / exotic Amiga path — no native parser data, no libopenmpt song data
    // (UADE-exclusive formats produce a synthetic ModuleInfo with no metadata.song)
    if (!info.metadata.song) {
      if (!info.file) {
        notify.error('File reference lost — cannot import');
        return;
      }
      const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
      let song: TrackerSong;
      try {
        song = await parseModuleToSong(info.file, options.subsong ?? 0, options.uadeMetadata, options.midiOptions);
      } catch (err) {
        notify.error(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return;
      }
      stop();
      loadInstruments(song.instruments);
      loadPatterns(song.patterns);
      if (song.songPositions.length > 0) setPatternOrder(song.songPositions);
      setOriginalModuleData(null);
      setBPM(song.initialBPM);
      setSpeed(song.initialSpeed);
      setMetadata({ name: song.name, author: '', description: `Imported from ${info.file?.name || 'module'}` });
      useTrackerStore.getState().applyEditorMode(song);
      const samplerCount = song.instruments.filter(i => i.synthType === 'Sampler').length;
      if (samplerCount > 0) {
        await getToneEngine().preloadInstruments(song.instruments);
      }
      notify.success(`Imported "${song.name}" — ${song.patterns.length} patterns, ${song.instruments.length} instruments`);
      return;
    }

    // Fallback to libopenmpt path for other formats (IT, S3M, etc.)

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
      format,
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

  // Randomize handler
  const handleRandomize = useCallback((channelIndex: number) => {
    setRandomizeChannel(channelIndex);
    setShowRandomize(true);
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
        {/\.(fur|dmf)$/i.test(pendingModuleFile?.name ?? '') ? (
          <ImportFurnaceDialog
            isOpen={showImportModule}
            onClose={() => { setShowImportModule(false); setPendingModuleFile(null); }}
            onImport={handleModuleImport}
            initialFile={pendingModuleFile}
          />
        ) : /\.(mid|midi)$/i.test(pendingModuleFile?.name ?? '') ? (
          <ImportMIDIDialog
            isOpen={showImportModule}
            onClose={() => { setShowImportModule(false); setPendingModuleFile(null); }}
            onImport={handleModuleImport}
            initialFile={pendingModuleFile}
          />
        ) : (
          <ImportModuleDialog
            isOpen={showImportModule}
            onClose={() => { setShowImportModule(false); setPendingModuleFile(null); }}
            onImport={handleModuleImport}
            initialFile={pendingModuleFile}
          />
        )}
        {/* Audio sample import dialog */}
        <ImportAudioDialog
          isOpen={!!pendingAudioFile}
          onClose={() => setPendingAudioFile(null)}
          initialFile={pendingAudioFile}
        />
        {/* TD-3 / TB-303 pattern import dialog */}
        <ImportTD3Dialog
          isOpen={!!pendingTD3File}
          onClose={() => setPendingTD3File(null)}
          initialFile={pendingTD3File}
          onImport={handleTD3Import}
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
        {showRandomize && (
          <RandomizeDialog
            channelIndex={randomizeChannel}
            onClose={() => setShowRandomize(false)}
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
                } else if (val === 'dj') {
                  setActiveView('dj');
                } else if (val === 'drumpad') {
                  setActiveView('drumpad');
                } else if (val === 'vj') {
                  setActiveView('vj');
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
              <option value="dj">DJ Mixer</option>
              <option value="drumpad">Drum Pads</option>
              <option value="vj">VJ View</option>
            </select>
          </div>

          {/* Hardware System Preset Selector - High Visibility */}
          <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-dark-border">
            <Cpu size={14} className="text-text-secondary" />
            <select
              className="px-2 py-1 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer outline-none"
              onChange={(e) => {
                applySystemPreset(e.target.value);
                notify.success(`Hardware System: ${SYSTEM_PRESETS.find(p => p.id === e.target.value)?.name.toUpperCase()}`);
              }}
              defaultValue="none"
              title="Select Hardware System Preset (NES, SMS, Genesis, etc.)"
            >
              <option value="none" disabled>SELECT HARDWARE...</option>
              {getGroupedPresets().map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.presets.map(preset => (
                    <option key={preset.id} value={preset.id} className="bg-dark-bgPrimary text-text-primary">{preset.name.toUpperCase()}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Subsong Selector (Furnace multi-subsong modules) */}
          <SubsongSelector />

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

          {/* Rec Button (with settings access) */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => useTrackerStore.getState().toggleRecordMode()}
              className={`
                px-2 py-1 text-xs rounded font-medium transition-colors flex items-center gap-1
                ${useTrackerStore.getState().recordMode
                  ? 'bg-accent-error text-white animate-pulse'
                  : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
                }
              `}
              title="Toggle Recording Mode (Space)"
            >
              <div className={`w-2 h-2 rounded-full ${useTrackerStore.getState().recordMode ? 'bg-white' : 'bg-accent-error'}`} />
              REC
            </button>
            <button
              onClick={() => useUIStore.getState().openModal('settings')}
              className="p-1 rounded bg-dark-bgSecondary text-text-secondary hover:text-text-primary transition-colors"
              title="Recording Settings (Quantize, Edit Step...)"
            >
              <SlidersHorizontal size={12} />
            </button>
          </div>

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
            (editorMode === 'hively' || editorMode === 'furnace') ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-dark-bgPrimary p-8 text-center">
                <div className="max-w-md space-y-4">
                  <div className="text-4xl mb-4">
                    {editorMode === 'hively' ? '🎵' : '🎹'}
                  </div>
                  <h2 className="text-xl font-bold text-text-primary mb-2">
                    {editorMode === 'hively' ? 'HivelyTracker/AHX' : 'Furnace'} Editor Mode
                  </h2>
                  <p className="text-text-secondary mb-4">
                    This file uses a specialized {editorMode === 'hively' ? 'track-based' : 'multi-chip'} pattern editor that's only available in WebGL mode.
                  </p>
                  <button
                    onClick={() => {
                      useSettingsStore.getState().setRenderMode('webgl');
                      notify.success('Switched to WebGL mode');
                    }}
                    className="px-6 py-3 bg-accent-primary hover:bg-accent-primary/80 text-white font-semibold rounded-lg transition-colors"
                  >
                    Switch to WebGL Mode
                  </button>
                  <p className="text-xs text-text-muted mt-4">
                    You can change this anytime in Settings → Display → Render Mode
                  </p>
                </div>
              </div>
            ) : (
              <PatternEditorCanvas
                onAcidGenerator={handleAcidGenerator}
                onRandomize={handleRandomize}
                onSwipeLeft={handleSwipeLeft}
                onSwipeRight={handleSwipeRight}
              />
            )
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

        {/* Pattern Minimap - Flex item 2 */}
        {viewMode === 'tracker' && (
          <MinimapWrapper />
        )}

        {/* DJ Pitch Slider - Flex item 3 */}
        <div className="flex-shrink-0 self-stretch border-l border-ft2-border bg-ft2-header">
          <DJPitchSlider className="h-full" />
        </div>

        {/* Instrument Panel Toggle Button - Flex item 3 - Hide on narrow windows */}
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
      {/\.(fur|dmf)$/i.test(pendingModuleFile?.name ?? '') ? (
        <ImportFurnaceDialog
          isOpen={showImportModule}
          onClose={() => { setShowImportModule(false); setPendingModuleFile(null); }}
          onImport={handleModuleImport}
          initialFile={pendingModuleFile}
        />
      ) : /\.(mid|midi)$/i.test(pendingModuleFile?.name ?? '') ? (
        <ImportMIDIDialog
          isOpen={showImportModule}
          onClose={() => { setShowImportModule(false); setPendingModuleFile(null); }}
          onImport={handleModuleImport}
          initialFile={pendingModuleFile}
        />
      ) : (
        <ImportModuleDialog
          isOpen={showImportModule}
          onClose={() => { setShowImportModule(false); setPendingModuleFile(null); }}
          onImport={handleModuleImport}
          initialFile={pendingModuleFile}
        />
      )}

      {/* Audio sample import dialog */}
      <ImportAudioDialog
        isOpen={!!pendingAudioFile}
        onClose={() => setPendingAudioFile(null)}
        initialFile={pendingAudioFile}
      />
      {/* TD-3 / TB-303 pattern import dialog */}
      <ImportTD3Dialog
        isOpen={!!pendingTD3File}
        onClose={() => setPendingTD3File(null)}
        initialFile={pendingTD3File}
        onImport={handleTD3Import}
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
            downloadTrack(useTrackerStore.getState().cursor.channelIndex, pattern);
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
      {showRandomize && (
        <RandomizeDialog
          channelIndex={randomizeChannel}
          onClose={() => setShowRandomize(false)}
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
