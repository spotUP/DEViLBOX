/**
 * FT2Toolbar - FastTracker II style toolbar with all controls
 *
 * Layout (based on original FT2):
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Pos:[00] [Ins][Del] │ BPM:[125] │ Ptn:[00] │ [Play sng.] [Play ptn.] │
 * │ Pat:[00]            │ Spd:[06]  │ Ln.:[64] │ [Stop]      [Rec.]      │
 * │ Len:[01]            │ Add:[01]  │ [Expd][Srnk]                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import React, { useRef, useState, useCallback } from 'react';
import { Button } from '@components/ui/Button';
import { FT2NumericInput } from './FT2NumericInput';
import { useTrackerStore, useTransportStore, useProjectStore, useInstrumentStore, useAudioStore, useUIStore, useAutomationStore, useTabsStore } from '@stores';
import { notify } from '@stores/useNotificationStore';
import { useTapTempo } from '@hooks/useTapTempo';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { ChevronDown, ChevronUp, FilePlus, Maximize2, Minimize2, MousePointerClick, ExternalLink } from 'lucide-react';
import { focusPopout } from '@components/ui/PopOutWindow';
import { VisualizerFrame } from '@components/visualization/VisualizerFrame';
import { Oscilloscope } from '@components/visualization/Oscilloscope';
import { ChannelLevelsCompact } from '@components/visualization/ChannelLevelsCompact';
import { LogoAnimation } from '@components/visualization/LogoAnimation';
import { CircularVU } from '@components/visualization/CircularVU';
import { FrequencyBars } from '@components/visualization/FrequencyBars';
import { ParticleField } from '@components/visualization/ParticleField';
import { ChannelWaveforms } from '@components/visualization/ChannelWaveforms';
import { ChannelActivityGrid } from '@components/visualization/ChannelActivityGrid';
import { ChannelSpectrums } from '@components/visualization/ChannelSpectrums';
import { ChannelCircularVU } from '@components/visualization/ChannelCircularVU';
import { ChannelParticles } from '@components/visualization/ChannelParticles';
import { ChannelRings } from '@components/visualization/ChannelRings';
import { ChannelTunnel } from '@components/visualization/ChannelTunnel';
import { ChannelRadar } from '@components/visualization/ChannelRadar';
import { NibblesGame } from '@components/visualization/NibblesGame';
import { SineScroller } from '@components/visualization/SineScroller';
import { SettingsModal } from '@components/dialogs/SettingsModal';
import { GrooveSettingsModal } from '@components/dialogs/GrooveSettingsModal';
import { ImportModuleDialog } from '@components/dialogs/ImportModuleDialog';
import { FileBrowser } from '@components/dialogs/FileBrowser';
import { importSong, exportSong } from '@lib/export/exporters';
import { isSupportedModule, getSupportedExtensions, type ModuleInfo } from '@lib/import/ModuleLoader';
import { convertModule, convertXMModule, convertMODModule } from '@lib/import/ModuleConverter';
import type { XMNote } from '@lib/import/formats/XMParser';
import type { MODNote } from '@lib/import/formats/MODParser';
import { convertToInstrument } from '@lib/import/InstrumentConverter';
import { importMIDIFile, isMIDIFile, getSupportedMIDIExtensions } from '@lib/import/MIDIImporter';
import { parseDb303Pattern, exportCurrentPatternToDb303 } from '@lib/import/Db303PatternConverter';
import type { InstrumentConfig, TB303Config } from '@typedefs/instrument';
import { DEFAULT_OSCILLATOR, DEFAULT_ENVELOPE, DEFAULT_FILTER } from '@typedefs/instrument';
import type { Pattern } from '@typedefs';
import { GROOVE_TEMPLATES } from '@typedefs/audio';
import { SYSTEM_PRESETS } from '@/constants/systemPresets';
import { CURRENT_VERSION } from '@generated/changelog';

// Build accept string for file input
const ACCEPTED_FORMATS = ['.json', '.dbx', '.xml', ...getSupportedExtensions(), ...getSupportedMIDIExtensions()].join(',');

// Create instruments for imported module
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

  // Ensure default instruments exist
  for (const defaultId of [0, 1]) {
    if (!usedInstruments.has(defaultId)) {
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

  instruments.sort((a, b) => a.id - b.id);
  return instruments;
}

interface FT2ToolbarProps {
  onShowPatterns?: () => void;
  onShowExport?: () => void;
  onShowHelp?: (tab?: string) => void;
  onShowMasterFX?: () => void;
  onShowInstrumentFX?: () => void;
  onShowInstruments?: () => void;
  onShowPatternOrder?: () => void;
  onShowDrumpads?: () => void;
  showPatterns?: boolean;
  showMasterFX?: boolean;
  showInstrumentFX?: boolean;
  compact?: boolean;
}

export const FT2Toolbar: React.FC<FT2ToolbarProps> = ({
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowInstruments,
  onShowPatternOrder,
  onShowDrumpads,
  showMasterFX,
  compact: compactProp,
}) => {
  const {
    patterns,
    currentPatternIndex,
    setCurrentPattern,
    expandPattern,
    shrinkPattern,
    resizePattern,
    loadPatterns,
    setPatternOrder,
    patternOrder,
    currentPositionIndex,
    setCurrentPosition,
    editStep,
    setEditStep,
    reset: resetTracker,
    duplicatePosition,
    removeFromOrder,
    applySystemPreset,
  } = useTrackerStore();

  const {
    isPlaying,
    isLooping,
    bpm,
    setBPM,
    speed,
    setSpeed,
    setIsLooping,
    play,
    stop,
    setCurrentRow,
    grooveTemplateId,
    setGrooveTemplate,
    swing,
    jitter,
    useMpcScale,
    reset: resetTransport,
  } = useTransportStore();

  const { isDirty, setMetadata, metadata } = useProjectStore();
  const { instruments, loadInstruments, updateInstrument, addInstrument, reset: resetInstruments } = useInstrumentStore();
  const { masterEffects } = useAudioStore();
  const { compactToolbar: compactState, toggleCompactToolbar, oscilloscopeVisible } = useUIStore();
  const compactToolbar = compactProp ?? compactState;
  const { curves, reset: resetAutomation } = useAutomationStore();
  const addTab = useTabsStore((state) => state.addTab);

  const engine = getToneEngine();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [vizMode, setVizMode] = useState<'waveform' | 'spectrum' | 'channels' | 'logo' | 'circular' | 'bars' | 'particles' | 'chanWaves' | 'chanActivity' | 'chanSpectrum' | 'chanCircular' | 'chanParticles' | 'chanRings' | 'chanTunnel' | 'chanRadar' | 'chanNibbles' | 'sineScroll'>('logo');

  // Tap Tempo
  const { tap: handleTapTempo, tapCount, isActive: tapActive } = useTapTempo(setBPM);
  
  const [showFxPresetsMenu, setShowFxPresetsMenu] = useState(false);
  const [showGrooveSettings, setShowGrooveSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  // PERF: Memoize logo animation complete callback to prevent re-renders
  const handleLogoAnimationComplete = useCallback(() => {
    // Auto-cycle to next visualizer after logo animation completes
    const modes: Array<'waveform' | 'spectrum' | 'channels' | 'logo' | 'circular' | 'bars' | 'particles' | 'chanWaves' | 'chanActivity' | 'chanSpectrum' | 'chanCircular' | 'chanParticles' | 'chanRings' | 'chanTunnel' | 'chanRadar' | 'chanNibbles' | 'sineScroll'> = ['waveform', 'spectrum', 'channels', 'logo', 'circular', 'bars', 'particles', 'chanWaves', 'chanActivity', 'chanSpectrum', 'chanCircular', 'chanParticles', 'chanRings', 'chanTunnel', 'chanRadar', 'chanNibbles', 'sineScroll'];
    const currentIndex = modes.indexOf('logo');
    const nextIndex = (currentIndex + 1) % modes.length;
    setVizMode(modes[nextIndex]);
  }, []);

  // Handle fullscreen changes from keyboard (F11) or other sources
  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Register db303 export function for console access
  React.useEffect(() => {
    // Reference the function to prevent tree-shaking
    void exportCurrentPatternToDb303;
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Failed to toggle fullscreen:', err);
    }
  };
  
  const fxPresetsMenuRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showFxPresetsMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (showFxPresetsMenu && fxPresetsMenuRef.current && !fxPresetsMenuRef.current.contains(e.target as Node)) {
        setShowFxPresetsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFxPresetsMenu]);

  const handleSave = () => {
    try {
      const sequence = patterns.map((p) => p.id);
      const automationData: Record<string, Record<number, Record<string, unknown>>> = {};
      patterns.forEach((pattern) => {
        pattern.channels.forEach((_channel, channelIndex) => {
          const channelCurves = curves.filter(
            (c) => c.patternId === pattern.id && c.channelIndex === channelIndex
          );
          if (channelCurves.length > 0) {
            if (!automationData[pattern.id]) {
              automationData[pattern.id] = {};
            }
            automationData[pattern.id][channelIndex] = channelCurves.reduce(
              (acc, curve) => {
                acc[curve.parameter] = curve;
                return acc;
              },
              {} as Record<string, unknown>
            );
          }
        });
      });
      exportSong(
        metadata,
        bpm,
        instruments,
        patterns,
        sequence,
        Object.keys(automationData).length > 0 ? automationData : undefined,
        masterEffects.length > 0 ? masterEffects : undefined,
        curves.length > 0 ? curves : undefined,
        { prettify: true },
        grooveTemplateId
      );
      notify.success('Song downloaded!', 2000);
    } catch (error) {
      console.error('Failed to save file:', error);
      notify.error('Failed to download file');
    }
  };

  const handleModuleImport = async (moduleInfo: ModuleInfo) => {
    // Always clean up before import to prevent stale state from previous imports
    if (isPlaying) stop();
    engine.releaseAll();

    // Reset all stores to prevent stale data from previous imports
    resetAutomation();
    resetTransport();
    resetInstruments();

    // Dispose ALL existing engine instruments (not just matching IDs)
    engine.disposeAllInstruments();

    setIsLoading(true);
    try {
      let result;
      if (moduleInfo.nativeData?.patterns) {
        const { format, patterns: nativePatterns, importMetadata, instruments: nativeInstruments } = moduleInfo.nativeData;
        const channelCount = importMetadata.originalChannelCount;
        const instrumentNames = nativeInstruments?.map(i => i.name) || [];
        if (format === 'XM') {
          result = convertXMModule(nativePatterns as XMNote[][][], channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
        } else if (format === 'MOD') {
          result = convertMODModule(nativePatterns as MODNote[][][], channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
        } else if (format === 'FUR' || format === 'DMF') {
          // Furnace and DefleMask patterns are already converted
          // Pattern data is [pattern][row][channel], need to convert to [pattern].channels[channel].rows[row]
          const patternOrder = importMetadata.modData?.patternOrderTable || [];
          const patLen = nativePatterns[0]?.length || 64;
          const numChannels = importMetadata.originalChannelCount || (nativePatterns[0]?.[0] as unknown[] | undefined)?.length || 4;
          console.log(`[Import] ${format} pattern structure: ${nativePatterns.length} patterns, ${patLen} rows, ${numChannels} channels`);

          result = {
            patterns: (nativePatterns as Record<string, unknown>[][][]).map((pat, idx) => ({
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
                rows: pat.map((row: Record<string, unknown>[]) => {
                  const cell = (row[ch] || {}) as Record<string, number>;
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
            instrumentNames,
          };
          console.log(`[Import] ${format} patterns converted:`, result.patterns.length, 'patterns, first pattern has', result.patterns[0]?.channels?.length, 'channels');
          
          // Debug: Check if notes are on different channels
          const firstPattern = result.patterns[0];
          if (firstPattern) {
            console.log(`[Import] DEBUG Pattern 0 channel 0 notes:`, firstPattern.channels[0]?.rows.filter(r => r.note > 0).length, 'notes');
            console.log(`[Import] DEBUG Pattern 0 channel 1 notes:`, firstPattern.channels[1]?.rows.filter(r => r.note > 0).length, 'notes');
            console.log(`[Import] DEBUG Pattern 0 channel 2 notes:`, firstPattern.channels[2]?.rows.filter(r => r.note > 0).length, 'notes');
            console.log(`[Import] DEBUG First 5 notes on ch0:`, firstPattern.channels[0]?.rows.filter(r => r.note > 0).slice(0, 5).map(r => r.note));
            console.log(`[Import] DEBUG First 5 notes on ch1:`, firstPattern.channels[1]?.rows.filter(r => r.note > 0).slice(0, 5).map(r => r.note));
            console.log(`[Import] DEBUG First 5 notes on ch2:`, firstPattern.channels[2]?.rows.filter(r => r.note > 0).slice(0, 5).map(r => r.note));
          }
        } else {
          notify.error(`Unsupported native format: ${format}`);
          return;
        }
      } else if (moduleInfo.metadata.song) {
        result = convertModule(moduleInfo.metadata.song);
      } else {
        notify.error(`Module "${moduleInfo.metadata.title}" has no pattern data`);
        return;
      }
      let instruments: InstrumentConfig[];
      if (moduleInfo.nativeData?.instruments) {
        const parsedInstruments = moduleInfo.nativeData.instruments;
        const format = moduleInfo.nativeData.format;
        // Track next available ID to avoid duplicates when multi-sample instruments expand
        let nextId = 1;
        instruments = [];
        for (const parsed of parsedInstruments) {
          const converted = convertToInstrument(parsed, nextId, format);
          instruments.push(...converted);
          nextId += converted.length; // Advance ID by number of instruments created
        }
      } else {
        instruments = createInstrumentsForModule(result.patterns, result.instrumentNames, undefined);
      }
      loadInstruments(instruments);
      loadPatterns(result.patterns);
      if (result.order && result.order.length > 0) {
        setPatternOrder(result.order);
        setCurrentPattern(result.order[0]);
      }
      setMetadata({ name: moduleInfo.metadata.title, author: '', description: `Imported from ${moduleInfo.metadata.type}` });
      const initialBPM = moduleInfo.nativeData?.importMetadata.modData?.initialBPM;
      if (initialBPM) setBPM(initialBPM);
      const initialSpeed = moduleInfo.nativeData?.importMetadata.modData?.initialSpeed;
      if (initialSpeed) setSpeed(initialSpeed);
      notify.success(`Imported ${moduleInfo.metadata.type}: ${moduleInfo.metadata.title}`, 3000);
      await engine.preloadInstruments(instruments);
    } catch {
      notify.error(`Failed to import module`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (isSupportedModule(file.name)) {
      setShowImportDialog(true);
      return;
    }
    if (isPlaying) {
      stop();
      engine.releaseAll();
    }
    setIsLoading(true);
    try {
      // DB303 XML pattern?
      if (file.name.toLowerCase().endsWith('.xml')) {
        const xmlString = await file.text();
        const patternName = file.name.replace('.xml', '') || 'Imported Pattern';
        const { pattern: importedPattern } = parseDb303Pattern(xmlString, patternName);
        const newPatterns = [...patterns, importedPattern];
        loadPatterns(newPatterns);
        setCurrentPattern(newPatterns.length - 1);
        notify.success(`Loaded DB303 pattern: ${importedPattern.name}`);
        setIsLoading(false);
        return;
      }

      if (isMIDIFile(file.name)) {
        const midiResult = await importMIDIFile(file, {
          quantize: 1, mergeChannels: false, velocityToVolume: true, defaultPatternLength: 64,
        });
        const instruments = createInstrumentsForModule(midiResult.patterns, [], undefined);
        loadPatterns(midiResult.patterns);
        loadInstruments(instruments);
        setMetadata({
          name: midiResult.metadata.name,
          author: '',
          description: `Imported from ${file.name} (${midiResult.metadata.tracks} tracks)`,
        });
        setBPM(midiResult.bpm);
        notify.success(`Loaded MIDI: ${midiResult.metadata.name}`);
      } else {
        const songData = await importSong(file);
        if (!songData) {
          notify.error('Failed to import song');
          return;
        }
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
      console.error('Failed to load file:', error);
      notify.error(`Failed to load ${file.name}`);
    } finally {
      setIsLoading(false);
    }
  };

  const pattern = patterns[currentPatternIndex];
  const patternLength = pattern?.length || 64;
  const songLength = patternOrder.length;

  const handlePositionChange = (newPos: number) => {
    setCurrentPosition(newPos);
  };

  const handleInsertPosition = () => duplicatePosition(currentPositionIndex);
  const handleDeletePosition = () => { if (patternOrder.length > 1) removeFromOrder(currentPositionIndex); };
  const handlePatternChange = (newPat: number) => {
    // Update the pattern index at the current order position
    const newOrder = [...patternOrder];
    newOrder[currentPositionIndex] = newPat;
    setPatternOrder(newOrder);
    setCurrentPattern(newPat);
  };

  // Handle song length changes (add/remove from pattern order)
  const handleSongLengthChange = (newLength: number) => {
    const currentLength = patternOrder.length;
    if (newLength > currentLength) {
      // Add more pattern slots to the order
      const newOrder = [...patternOrder];
      for (let i = currentLength; i < newLength; i++) {
        // Add the last pattern in the order, or pattern 0 if order is empty
        newOrder.push(patternOrder[patternOrder.length - 1] ?? 0);
      }
      setPatternOrder(newOrder);
    } else if (newLength < currentLength && newLength >= 1) {
      // Remove positions from the end of the order
      const newOrder = patternOrder.slice(0, newLength);
      setPatternOrder(newOrder);
      // Ensure current position is valid
      if (currentPositionIndex >= newLength) {
        setCurrentPosition(newLength - 1);
      }
    }
  };

  const handlePlaySong = async () => {
    // Toggle: if already playing song, stop. Otherwise start song.
    if (isPlaying && !isLooping) { getTrackerReplayer().stop(); stop(); engine.releaseAll(); }
    else {
      if (isPlaying) { getTrackerReplayer().stop(); stop(); engine.releaseAll(); }
      setIsLooping(false);
      setCurrentRow(0); // Always start from first row of current pattern
      await engine.init();
      await play();
    }
  };

  const handlePlayPattern = async () => {
    // Toggle: if already playing pattern, stop. Otherwise start pattern.
    if (isPlaying && isLooping) { getTrackerReplayer().stop(); stop(); engine.releaseAll(); }
    else {
      if (isPlaying) { getTrackerReplayer().stop(); stop(); engine.releaseAll(); }
      setIsLooping(true);
      setCurrentRow(0); // Always start from first row of current pattern
      await engine.init();
      await play();
    }
  };

  const isPlayingSong = isPlaying && !isLooping;
  const isPlayingPattern = isPlaying && isLooping;

  const handleExpand = () => expandPattern?.(currentPatternIndex);
  const handleShrink = () => shrinkPattern?.(currentPatternIndex);
  const handleLengthChange = (newLength: number) => {
    if (newLength >= 1 && newLength <= 256) resizePattern(currentPatternIndex, newLength);
  };

  return (
    <div className={`ft2-toolbar ${compactToolbar ? 'ft2-toolbar-compact' : ''}`}>
      <button className="panel-collapse-toggle" onClick={toggleCompactToolbar}>
        {compactToolbar ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>

      <div className="flex flex-1 min-w-0 overflow-hidden min-h-[120px]">
        <div className="flex-shrink min-w-0">
          <div className="ft2-toolbar-row">
            <div className="ft2-section ft2-col-1">
              <FT2NumericInput label="Position" value={currentPositionIndex} onChange={handlePositionChange} min={0} max={patternOrder.length - 1} format="hex" />
              <div className="flex gap-1 ml-auto">
                <Button variant="default" size="sm" onClick={handleInsertPosition} className="min-w-[32px]">Ins</Button>
                <Button variant="default" size="sm" onClick={handleDeletePosition} disabled={patternOrder.length <= 1} className="min-w-[32px]">Del</Button>
              </div>
            </div>
            <div className="ft2-section ft2-col-2">
              <FT2NumericInput
                label="BPM"
                value={bpm}
                onChange={setBPM}
                min={32}
                max={255}
                throttleMs={50}
              />
              <Button
                variant={tapActive ? 'primary' : 'default'}
                size="sm"
                onClick={handleTapTempo}
                title={`Tap Tempo (${tapCount} taps)`}
                className="min-w-[40px] ml-1"
              >
                <MousePointerClick size={14} />
              </Button>

              <div className="flex items-center ml-2 pl-2 h-7 gap-1.5">
                <span className="text-[9px] font-black text-accent-primary uppercase tracking-tighter">HW:</span>
                <select
                  className="bg-dark-bgPrimary text-text-primary text-[10px] font-bold h-6 border border-accent-primary/30 rounded px-1.5 hover:border-accent-primary transition-colors cursor-pointer outline-none min-w-[110px] shadow-glow-sm"
                  onChange={(e) => applySystemPreset(e.target.value)}
                  defaultValue="none"
                  title="Apply Hardware System Preset"
                >
                  <option value="none" disabled>HARDWARE...</option>
                  {SYSTEM_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>{preset.name.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="ft2-section ft2-col-3">
              <FT2NumericInput label="Pattern" value={patternOrder[currentPositionIndex] ?? currentPatternIndex} onChange={handlePatternChange} min={0} max={patterns.length - 1} format="hex" />
            </div>
            <div className="ft2-section ft2-section-playback">
              <Button variant={isPlayingSong ? 'danger' : 'primary'} size="sm" onClick={handlePlaySong} className="min-w-[72px]">{isPlayingSong ? 'Stop Song' : 'Play Song'}</Button>
              <Button variant={isPlayingPattern ? 'danger' : 'primary'} size="sm" onClick={handlePlayPattern} className="min-w-[88px]">{isPlayingPattern ? 'Stop Pattern' : 'Play Pattern'}</Button>
            </div>
          </div>

          {!compactToolbar && (
            <div className="ft2-toolbar-row">
              <div className="ft2-section ft2-col-1">
                <FT2NumericInput label="Song Len" value={songLength} onChange={handleSongLengthChange} min={1} max={256} format="hex" />
              </div>
              <div className="ft2-section ft2-col-2">
                <FT2NumericInput label="Speed" value={speed} onChange={setSpeed} min={1} max={31} format="hex" />
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowGrooveSettings(true)}
                  title={`Groove & Swing Settings (Current: ${GROOVE_TEMPLATES.find(g => g.id === grooveTemplateId)?.name || 'None'})`}
                  className={`min-w-[32px] ml-1 ${grooveTemplateId !== 'straight' || swing !== (useMpcScale ? 50 : 100) || jitter > 0 ? 'text-accent-primary font-bold shadow-glow-sm border-accent-primary/50' : ''}`}
                >
                  Groove
                </Button>
                {showGrooveSettings && <GrooveSettingsModal onClose={() => setShowGrooveSettings(false)} />}
              </div>
              <div className="ft2-section ft2-col-3">
                <FT2NumericInput
                  label="Length"
                  value={patternLength}
                  onChange={handleLengthChange}
                  min={1}
                  max={256}
                  format="hex"
                  presets={[
                    { label: '16 rows', value: 16 },
                    { label: '32 rows', value: 32 },
                    { label: '48 rows', value: 48 },
                    { label: '64 rows (default)', value: 64 },
                    { label: '96 rows', value: 96 },
                    { label: '128 rows', value: 128 },
                    { label: '192 rows', value: 192 },
                    { label: '256 rows (max)', value: 256 },
                  ]}
                />
              </div>
              <div className="ft2-section ft2-col-4"></div>
            </div>
          )}

          {!compactToolbar && (
            <div className="ft2-toolbar-row">
              <div className="ft2-section ft2-col-1">
                <FT2NumericInput label="Edit Step" value={editStep} onChange={setEditStep} min={0} max={16} format="hex" />
              </div>
              <div className="ft2-section ft2-col-2">
                <div className="ft2-numeric-group">
                  <span className="ft2-numeric-label">Modify:</span>
                  <div className="flex gap-1 ml-1">
                    <Button variant="default" size="sm" onClick={handleExpand} className="min-w-[48px] text-[10px] py-0 h-5">Expand</Button>
                    <Button variant="default" size="sm" onClick={handleShrink} className="min-w-[48px] text-[10px] py-0 h-5">Shrink</Button>
                  </div>
                </div>
              </div>
              <div className="ft2-section ft2-col-3">
              </div>
              <div className="ft2-section ft2-col-4">
              </div>
            </div>
          )}

          <div className="ft2-toolbar-row ft2-toolbar-row-menu">
            <div className="ft2-section">
              <input ref={fileInputRef} type="file" accept={ACCEPTED_FORMATS} onChange={handleFileLoad} className="hidden" />
              <Button variant="ghost" size="sm" onClick={() => setShowFileBrowser(true)} disabled={isLoading} loading={isLoading}>Load</Button>
              <Button variant="ghost" size="sm" onClick={handleSave}>{isDirty ? 'Save*' : 'Save'}</Button>
              <Button variant="ghost" size="sm" onClick={handleSave}>Download</Button>
              <Button variant="ghost" size="sm" onClick={onShowExport}>Export</Button>
              <Button variant="ghost" size="sm" onClick={() => addTab()} icon={<FilePlus size={14} />} iconPosition="left">New</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowClearModal(true)}>Clear</Button>
              <Button variant="ghost" size="sm" onClick={onShowPatternOrder}>Order</Button>
              <Button variant="ghost" size="sm" onClick={onShowInstruments}>Instruments</Button>
              <Button variant="ghost" size="sm" onClick={onShowDrumpads}>Pads</Button>                        
              <Button variant={showMasterFX ? 'primary' : 'ghost'} size="sm" onClick={onShowMasterFX}>Master FX</Button>
              
              <Button variant="ghost" size="sm" onClick={() => onShowHelp?.('chip-effects')}>Reference</Button>
              <Button variant="ghost" size="sm" onClick={() => onShowHelp?.('shortcuts')}>Help</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>Settings</Button>
              <Button
                variant={isFullscreen ? 'primary' : 'ghost'}
                size="sm"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Enter Fullscreen (F11)'}
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </Button>
            </div>
          </div>
        </div>

        <VisualizerFrame variant="compact" className="min-w-[120px] max-w-[400px] flex-shrink-0 flex-grow border-l border-dark-border cursor-pointer group" style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}>
        <div className="relative w-full h-full flex items-center justify-center" onClick={() => {
          const modes: Array<'waveform' | 'spectrum' | 'channels' | 'logo' | 'circular' | 'bars' | 'particles' | 'chanWaves' | 'chanActivity' | 'chanSpectrum' | 'chanCircular' | 'chanParticles' | 'chanRings' | 'chanTunnel' | 'chanRadar' | 'chanNibbles' | 'sineScroll'> = ['waveform', 'spectrum', 'channels', 'logo', 'circular', 'bars', 'particles', 'chanWaves', 'chanActivity', 'chanSpectrum', 'chanCircular', 'chanParticles', 'chanRings', 'chanTunnel', 'chanRadar', 'chanNibbles', 'sineScroll'];
          const currentIndex = modes.indexOf(vizMode);
          const nextIndex = (currentIndex + 1) % modes.length;
          setVizMode(modes[nextIndex]);
        }}>
          {/* Pop out button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const already = useUIStore.getState().oscilloscopePoppedOut;
              if (already) {
                focusPopout('DEViLBOX — Visualizer');
              } else {
                useUIStore.getState().setOscilloscopePoppedOut(true);
              }
            }}
            className="absolute top-1 right-1 p-0.5 rounded text-text-muted/0 group-hover:text-text-muted hover:!text-cyan-400 transition-all z-10"
            title="Pop out visualizer"
          >
            <ExternalLink size={12} />
          </button>
          {/* Version Number */}
          <div className="absolute bottom-1 right-2 text-[9px] font-mono text-text-muted opacity-40 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            v{CURRENT_VERSION}
          </div>

          {oscilloscopeVisible && (
            <>
              {(vizMode === 'waveform' || vizMode === 'spectrum') && <Oscilloscope width="auto" height={compactToolbar ? 70 : 100} mode={vizMode} />}
              {vizMode === 'channels' && <ChannelLevelsCompact height={compactToolbar ? 70 : 100} />}
              {vizMode === 'logo' && <LogoAnimation height={compactToolbar ? 70 : 100} onComplete={handleLogoAnimationComplete} />}
              {vizMode === 'circular' && <CircularVU height={compactToolbar ? 70 : 100} />}
              {vizMode === 'bars' && <FrequencyBars height={compactToolbar ? 70 : 100} />}
              {vizMode === 'particles' && <ParticleField height={compactToolbar ? 70 : 100} />}
              {vizMode === 'chanWaves' && <ChannelWaveforms height={compactToolbar ? 70 : 100} />}
              {vizMode === 'chanActivity' && <ChannelActivityGrid height={compactToolbar ? 70 : 100} />}
              {vizMode === 'chanSpectrum' && <ChannelSpectrums height={compactToolbar ? 70 : 100} />}
              {vizMode === 'chanCircular' && <ChannelCircularVU height={compactToolbar ? 70 : 100} />}
              {vizMode === 'chanParticles' && <ChannelParticles height={compactToolbar ? 70 : 100} />}
              {vizMode === 'chanRings' && <ChannelRings height={compactToolbar ? 70 : 100} />}
              {vizMode === 'chanTunnel' && <ChannelTunnel height={compactToolbar ? 70 : 100} />}
              {vizMode === 'chanRadar' && <ChannelRadar height={compactToolbar ? 70 : 100} />}
              {vizMode === 'chanNibbles' && (
                <NibblesGame 
                  height={compactToolbar ? 70 : 100} 
                  onExit={() => {
                    const modes: Array<'waveform' | 'spectrum' | 'channels' | 'logo' | 'circular' | 'bars' | 'particles' | 'chanWaves' | 'chanActivity' | 'chanSpectrum' | 'chanCircular' | 'chanParticles' | 'chanRings' | 'chanTunnel' | 'chanRadar' | 'chanNibbles' | 'sineScroll'> = ['waveform', 'spectrum', 'channels', 'logo', 'circular', 'bars', 'particles', 'chanWaves', 'chanActivity', 'chanSpectrum', 'chanCircular', 'chanParticles', 'chanRings', 'chanTunnel', 'chanRadar', 'chanNibbles', 'sineScroll'];
                    const currentIndex = modes.indexOf('chanNibbles');
                    const nextIndex = (currentIndex + 1) % modes.length;
                    setVizMode(modes[nextIndex]);
                  }}
                />
              )}
              {vizMode === 'sineScroll' && <SineScroller height={compactToolbar ? 70 : 100} />}
            </>
          )}
        </div>
        </VisualizerFrame>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <ImportModuleDialog isOpen={showImportDialog} onClose={() => setShowImportDialog(false)} onImport={handleModuleImport} />
      <FileBrowser isOpen={showFileBrowser} onClose={() => setShowFileBrowser(false)} mode="load" onLoad={async (data, filename) => {
        if (isPlaying) { stop(); engine.releaseAll(); }
        try {
          // Handle XML files (DB303 patterns or presets)
          const dataStr = typeof (data as unknown) === 'string' ? (data as unknown as string) : null;
          if (dataStr && filename.toLowerCase().endsWith('.xml')) {
            try {
              // Detect XML type
              const isPreset = dataStr.includes('<db303-preset');
              const isPattern = dataStr.includes('<db303-pattern');
              
              if (isPreset) {
                // Import as TB-303 preset
                const { parseDb303Preset } = await import('@lib/import/Db303PresetConverter');
                const presetConfig = parseDb303Preset(dataStr);
                
                // Find or create TB-303 instrument and apply preset
                let tb303Instrument = instruments.find(inst => inst.synthType === 'TB303');
                if (!tb303Instrument) {
                  // Auto-create TB-303 instrument
                  const { createDefaultTB303Instrument } = await import('@lib/instrumentFactory');
                  const newInst = createDefaultTB303Instrument();
                  addInstrument(newInst);
                  tb303Instrument = newInst;
                  console.log('[XML Import] Auto-created TB-303 instrument:', newInst.id);
                }
                
                // Update the instrument with the preset using updateInstrument
                const mergedConfig = { ...tb303Instrument.tb303, ...presetConfig } as TB303Config;
                console.log('[XML Import] Before update - tb303Instrument.tb303:', JSON.stringify(tb303Instrument.tb303, null, 2));
                console.log('[XML Import] Parsed presetConfig:', JSON.stringify(presetConfig, null, 2));
                console.log('[XML Import] Merged config:', JSON.stringify(mergedConfig, null, 2));
                
                updateInstrument(tb303Instrument.id, { tb303: mergedConfig });
                
                // Verify the update worked
                const updatedInstrument = instruments.find(inst => inst.id === tb303Instrument.id);
                console.log('[XML Import] After update - instrument.tb303:', JSON.stringify(updatedInstrument?.tb303, null, 2));
                
                notify.success(`Loaded DB303 preset: ${filename.replace('.xml', '')}`);
                console.log('[XML Import] Applied preset to instrument:', tb303Instrument.id, presetConfig);
                return;
              } else if (isPattern) {
                // Import as TB-303 pattern
                const patternName = filename.replace('.xml', '') || 'Imported Pattern';
                
                // Find or create TB-303 instrument
                let tb303Instrument = instruments.find(inst => inst.synthType === 'TB303');
                if (!tb303Instrument) {
                  // Auto-create TB-303 instrument
                  const { createDefaultTB303Instrument } = await import('@lib/instrumentFactory');
                  const newInst = createDefaultTB303Instrument();
                  addInstrument(newInst);
                  tb303Instrument = newInst;
                  console.log('[XML Import] Auto-created TB-303 instrument:', newInst.id);
                }
                
                // Parse pattern with instrument ID
                const { pattern: importedPattern, tempo } = parseDb303Pattern(dataStr, patternName, tb303Instrument.id);
                
                console.log('[XML Import] Parsed pattern:', {
                  name: importedPattern.name,
                  length: importedPattern.length,
                  channels: importedPattern.channels.length,
                  rows: importedPattern.channels[0]?.rows.length,
                  instrumentId: tb303Instrument.id,
                  tempo
                });
                
                // Assign instrument to channel
                importedPattern.channels[0].instrumentId = tb303Instrument.id;
                console.log('[XML Import] Assigned TB-303 instrument:', tb303Instrument.id);
                
                const newPatterns = [...patterns, importedPattern];
                loadPatterns(newPatterns);
                setCurrentPattern(newPatterns.length - 1);
                
                // Set pattern order to loop the imported pattern
                setPatternOrder([newPatterns.length - 1]);
                
                // Apply tempo and swing if specified
                if (tempo !== undefined) {
                  setBPM(tempo);
                  console.log('[XML Import] Set tempo to:', tempo);
                }
                // NOTE: We intentionally DO NOT apply swing from DB303 XML to avoid
                // double-swing with tracker's global groove/swing system.
                // Users can manually adjust swing via the tracker's transport settings.
                // The swing parameter in DB303 XML affects slide timing in the original,
                // but applying it here would conflict with tracker groove and cause
                // incorrect slide behavior.
                // Original code (now disabled):
                // if (swing !== undefined) {
                //   const swingValue = 100 + (swing * 100);
                //   setSwing(swingValue);
                //   setGrooveSteps(2);
                //   console.log('[XML Import] Set swing:', swing, '→', swingValue);
                // }
                
                
                notify.success(`Loaded DB303 pattern: ${importedPattern.name} (${importedPattern.length} steps${tempo ? `, ${tempo} BPM` : ''})`);
                return;
              } else {
                notify.error('Unknown XML format. Expected db303-pattern or db303-preset.');
                return;
              }
            } catch (xmlError) {
              console.error('[XML Import] Parse error:', xmlError);
              notify.error(`Failed to parse XML: ${xmlError instanceof Error ? xmlError.message : 'Unknown error'}`);
              return;
            }
          }

          // Handle JSON project files
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const proj = data as any;
          const { needsMigration, migrateProject } = await import('@/lib/migration');
          let projectPatterns = proj.patterns, projectInstruments = proj.instruments;
          if (needsMigration(projectPatterns, projectInstruments)) {
            const migrated = migrateProject(projectPatterns, projectInstruments);
            projectPatterns = migrated.patterns; projectInstruments = migrated.instruments;
          }
          if (projectPatterns) {
            loadPatterns(projectPatterns);
            if (proj.sequence && Array.isArray(proj.sequence)) {
              const patternIdToIndex = new Map((projectPatterns as Array<{ id: string }>).map((p, i) => [p.id, i]));
              const order = (proj.sequence as string[]).map((id: string) => patternIdToIndex.get(id)).filter((idx: unknown): idx is number => idx !== undefined);
              if (order.length > 0) setPatternOrder(order);
            }
          }
          if (projectInstruments) loadInstruments(projectInstruments);
          if (proj.metadata) setMetadata(proj.metadata);
          if (proj.bpm) setBPM(proj.bpm);
          setGrooveTemplate(proj.grooveTemplateId || 'straight');
          notify.success(`Loaded: ${proj.metadata?.name || filename}`);
        } catch { notify.error('Failed to load file'); }
      }} onLoadTrackerModule={async (buffer: ArrayBuffer, filename: string) => {
        if (isPlaying) { stop(); engine.releaseAll(); }
        try {
          const lower = filename.toLowerCase();
          if (lower.endsWith('.sqs') || lower.endsWith('.seq')) {
            // Behringer TD-3 / Synthtribe pattern file
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

            // Get 1-based instrument index for tracker display
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
            const { loadModuleFile } = await import('@lib/import/ModuleLoader');
            const moduleInfo = await loadModuleFile(new File([buffer], filename));
            if (moduleInfo) await handleModuleImport(moduleInfo);
          }
        } catch { notify.error('Failed to load file'); }
      }} />

      {/* Clear Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
          <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h2 className="text-lg font-bold text-text-primary mb-4">Clear Project</h2>
            <p className="text-sm text-text-secondary mb-6">What would you like to clear?</p>
            <div className="flex flex-col gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  if (isPlaying) { stop(); engine.releaseAll(); }
                  resetInstruments();
                  setShowClearModal(false);
                  notify.success('Instruments cleared');
                }}
              >
                Clear Instruments
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  if (isPlaying) { stop(); engine.releaseAll(); }
                  resetTracker();
                  setShowClearModal(false);
                  notify.success('Song data cleared');
                }}
              >
                Clear Song Data
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  if (isPlaying) { stop(); engine.releaseAll(); }
                  resetInstruments();
                  resetTracker();
                  setShowClearModal(false);
                  notify.success('Project cleared');
                }}
              >
                Clear Both
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (isPlaying) { stop(); engine.releaseAll(); }
                  resetInstruments();
                  resetTracker();
                  resetTransport();
                  setShowClearModal(false);
                  notify.success('Reset to defaults');
                }}
              >
                Reset to Defaults
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowClearModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};