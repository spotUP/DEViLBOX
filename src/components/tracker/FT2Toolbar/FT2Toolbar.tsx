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

import React, { useRef, useState } from 'react';
import { Button } from '@components/ui/Button';
import { FT2NumericInput } from './FT2NumericInput';
import { InstrumentSelector } from './InstrumentSelector';
import { useTrackerStore, useTransportStore, useProjectStore, useInstrumentStore, useAudioStore, useUIStore, useAutomationStore } from '@stores';
import { notify } from '@stores/useNotificationStore';
import { useProjectPersistence } from '@hooks/useProjectPersistence';
import { getToneEngine } from '@engine/ToneEngine';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Oscilloscope } from '@components/visualization/Oscilloscope';
import { ChannelLevelsCompact } from '@components/visualization/ChannelLevelsCompact';
import { StereoField } from '@components/visualization/StereoField';
import { LogoAnimation } from '@components/visualization/LogoAnimation';
import { EnvelopeVisualizer } from '@components/ui/EnvelopeVisualizer';
import { AccentChargeVisualizer } from '@components/ui/AccentChargeVisualizer';
import { SettingsModal } from '@components/dialogs/SettingsModal';
import { ImportModuleDialog } from '@components/dialogs/ImportModuleDialog';
import { FileBrowser } from '@components/dialogs/FileBrowser';
import { importSong, exportSong } from '@lib/export/exporters';
import { isSupportedModule, getSupportedExtensions, type ModuleInfo } from '@lib/import/ModuleLoader';
import { convertModule, convertXMModule, convertMODModule } from '@lib/import/ModuleConverter';
import { convertToInstrument } from '@lib/import/InstrumentConverter';
import { importMIDIFile, isMIDIFile, getSupportedMIDIExtensions } from '@lib/import/MIDIImporter';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_OSCILLATOR, DEFAULT_ENVELOPE, DEFAULT_FILTER } from '@typedefs/instrument';
import type { Pattern } from '@typedefs';
import { MASTER_PRESETS, type MasterPreset } from '@constants/masterPresets';
import { MASTER_FX_PRESETS, type MasterFxPreset } from '@constants/masterFxPresets';

// Build accept string for file input
const ACCEPTED_FORMATS = ['.json', '.song.json', '.dbox', ...getSupportedExtensions(), ...getSupportedMIDIExtensions()].join(',');

// PERFORMANCE: Separate component for row display to isolate currentRow subscription
// This prevents the entire toolbar from re-rendering on every row change (~12x/sec during playback)
const RowDisplay: React.FC = React.memo(() => {
  const currentRow = useTransportStore((state) => state.currentRow);
  const useHexNumbers = useUIStore((state) => state.useHexNumbers);

  return (
    <div className="ft2-section ft2-section-playback">
      <span className="ft2-row-display">
        Row: <span className="ft2-row-value">
          {useHexNumbers
            ? currentRow.toString(16).toUpperCase().padStart(2, '0')
            : currentRow.toString(10).padStart(2, '0')
          }
        </span>
      </span>
    </div>
  );
});

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
  onShowHelp?: () => void;
  onShowMasterFX?: () => void;
  onShowInstrumentFX?: () => void;
  onShowInstruments?: () => void;
  onShowPatternOrder?: () => void;
  showPatterns?: boolean;
  showMasterFX?: boolean;
  showInstrumentFX?: boolean;
}

export const FT2Toolbar: React.FC<FT2ToolbarProps> = ({
  onShowPatterns,
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowInstrumentFX,
  onShowInstruments,
  onShowPatternOrder,
  showPatterns,
  showMasterFX,
  showInstrumentFX,
}) => {
  const {
    patterns,
    currentPatternIndex,
    setCurrentPattern,
    duplicatePattern,
    deletePattern,
    expandPattern,
    shrinkPattern,
    resizePattern,
    loadPatterns,
    setPatternOrder,
    patternOrder,
    currentPositionIndex,
    setCurrentPosition,
    recordMode,
    editStep,
    toggleRecordMode,
    setEditStep,
  } = useTrackerStore();

  const {
    isPlaying,
    isLooping,
    bpm,
    setBPM,
    setIsLooping,
    play,
    stop,
    smoothScrolling,
    setSmoothScrolling,
  } = useTransportStore();

  const { isDirty, setMetadata, metadata } = useProjectStore();
  useProjectPersistence();
  const { instruments, loadInstruments } = useInstrumentStore();
  const { masterMuted, toggleMasterMute, masterEffects } = useAudioStore();
  const { compactToolbar, toggleCompactToolbar, oscilloscopeVisible } = useUIStore();
  const { curves } = useAutomationStore();

  const engine = getToneEngine();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [vizMode, setVizMode] = useState<'waveform' | 'spectrum' | 'channels' | 'stereo' | 'logo' | 'envelope' | 'accent'>('logo');
  
  const [showModulesMenu, setShowModulesMenu] = useState(false);
  const [showPresetsMenu, setShowPresetsMenu] = useState(false);
  const [showFxPresetsMenu, setShowFxPresetsMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  
  const modulesMenuRef = useRef<HTMLDivElement>(null);
  const modulesButtonRef = useRef<HTMLDivElement>(null);
  const presetsMenuRef = useRef<HTMLDivElement>(null);
  const presetsButtonRef = useRef<HTMLDivElement>(null);
  const fxPresetsMenuRef = useRef<HTMLDivElement>(null);
  const fxPresetsButtonRef = useRef<HTMLDivElement>(null);
  
  const [modulesMenuPosition, setModulesMenuPosition] = useState({ top: 0, left: 0 });
  const [presetsMenuPosition, setPresetsMenuPosition] = useState({ top: 0, left: 0 });
  const [fxPresetsMenuPosition, setFxPresetsMenuPosition] = useState({ top: 0, left: 0 });

  const BUNDLED_MODULES = {
    acid: [
      { file: 'phuture-acid-tracks.dbox', name: 'Phuture - Acid Tracks' },
      { file: 'hardfloor-funalogue.dbox', name: 'Hardfloor - Funalogue' },
      { file: 'josh-wink-higher-state.dbox', name: 'Josh Wink - Higher State' },
      { file: 'dittytoy-303.dbox', name: 'Dittytoy 303' },
      { file: 'fatboy-slim-everyone-needs-303_.dbox', name: 'Fatboy Slim - Everyone Needs a 303' },
      { file: 'fast-eddie-acid-thunder.dbox', name: 'Fast Eddie - Acid Thunder' },
      { file: 'dj-tim-misjah-access.dbox', name: 'DJ Tim & Misjah - Access' },
      { file: 'samplab-mathew-303.dbox', name: 'Samplab Mathew 303' },
      { file: 'samplab-mathew-full.dbox', name: 'Samplab Mathew (Full)' },
      { file: 'slow-creaky-acid-authentic.dbox', name: 'Slow Creaky (Authentic)' },
      { file: 'slow-creaky-acid-tempo-relative.dbox', name: 'Slow Creaky (Tempo-Relative)' },
    ],
    tb303: [
      { file: 'fatboy-slim-everybody-needs-a-303.dbox', name: 'Fatboy Slim - Everybody needs a 303' },
      { file: 'josh-wink-high-state-of-consciousness.dbox', name: 'Josh Wink - High State of Consciousness' },
      { file: 'christophe-just-i-m-a-disco-dancer-part-1-.dbox', name: 'Christophe Just - Disco Dancer (Part 1)' },
      { file: 'christophe-just-i-m-a-disco-dancer-part-2-.dbox', name: 'Christophe Just - Disco Dancer (Part 2)' },
      { file: 'claustrophobic-sting-the-prodigy.dbox', name: 'Claustrophobic Sting - The Prodigy' },
      { file: 'josh-wink-are-you-there.dbox', name: 'Josh Wink - Are You There' },
      { file: 'cut-paste-forget-it-part-1-.dbox', name: 'Cut Paste - Forget It (Part 1)' },
      { file: 'paste-forget-it-part-2-.dbox', name: 'Cut Paste - Forget It (Part 2)' },
      { file: 'public-energy-three-o-three-part-1-.dbox', name: 'Public Energy - Three O Three (Part 1)' },
      { file: 'public-energy-three-o-three-part-2-.dbox', name: 'Public Energy - Three O Three (Part 2)' },
    ],
    general: [
      { file: 'new-order-confusion.dbox', name: 'New Order - Confusion' },
      { file: 'edge-of-motion-setup-707.dbox', name: 'Edge of Motion - 707 Setup' },
    ],
  };

  const handleLoadModule = async (filename: string) => {
    setShowModulesMenu(false);
    if (isPlaying) {
      stop();
      engine.releaseAll();
    }
    setIsLoading(true);
    try {
      const basePath = import.meta.env.BASE_URL || '/';
      const response = await fetch(`${basePath}modules/${filename}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const songData = await response.json();
      const { needsMigration, migrateProject } = await import('@/lib/migration');
      let patterns = songData.patterns;
      let instruments = songData.instruments;
      if (needsMigration(patterns, instruments)) {
        const migrated = migrateProject(patterns, instruments);
        patterns = migrated.patterns;
        instruments = migrated.instruments;
      }
      if (patterns) {
        loadPatterns(patterns);
        if (songData.sequence && Array.isArray(songData.sequence)) {
          const patternIdToIndex = new Map(patterns.map((p: Pattern, i: number) => [p.id, i]));
          const order = songData.sequence
            .map((patternId: string) => patternIdToIndex.get(patternId))
            .filter((index: number | undefined): index is number => index !== undefined);
          if (order.length > 0) setPatternOrder(order);
        }
      }
      if (instruments) loadInstruments(instruments);
      if (songData.metadata) setMetadata(songData.metadata);
      if (songData.bpm) setBPM(songData.bpm);
      notify.success(`Loaded: ${songData.metadata?.name || filename}`, 2000);
    } catch (error) {
      console.error('Failed to load module:', error);
      notify.error(`Failed to load ${filename}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMasterPreset = async (preset: MasterPreset) => {
    setShowPresetsMenu(false);
    if (isPlaying) {
      stop();
      engine.releaseAll();
    }
    try {
      loadInstruments(preset.instruments);
      if (preset.bpm) setBPM(preset.bpm);
      if (preset.patterns) loadPatterns(preset.patterns);
      await engine.preloadInstruments(preset.instruments);
      notify.success(`Loaded Preset: ${preset.name}`);
    } catch (error) {
      notify.error('Failed to load preset');
    }
  };

  const handleLoadMasterFxPreset = (preset: MasterFxPreset) => {
    setShowFxPresetsMenu(false);
    const effects = preset.effects.map((fx, index) => ({
      ...fx,
      id: `master-fx-${Date.now()}-${index}`,
    }));
    useAudioStore.getState().setMasterEffects(effects as any);
    notify.success(`Applied FX: ${preset.name}`);
  };

  React.useEffect(() => {
    if (showModulesMenu && modulesButtonRef.current) {
      const rect = modulesButtonRef.current.getBoundingClientRect();
      setModulesMenuPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [showModulesMenu]);

  React.useEffect(() => {
    if (showPresetsMenu && presetsButtonRef.current) {
      const rect = presetsButtonRef.current.getBoundingClientRect();
      setPresetsMenuPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [showPresetsMenu]);

  React.useEffect(() => {
    if (showFxPresetsMenu && fxPresetsButtonRef.current) {
      const rect = fxPresetsButtonRef.current.getBoundingClientRect();
      setFxPresetsMenuPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [showFxPresetsMenu]);

  React.useEffect(() => {
    if (!showModulesMenu && !showPresetsMenu && !showFxPresetsMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (showModulesMenu && modulesMenuRef.current && !modulesMenuRef.current.contains(e.target as Node)) {
        setShowModulesMenu(false);
      }
      if (showPresetsMenu && presetsMenuRef.current && !presetsMenuRef.current.contains(e.target as Node)) {
        setShowPresetsMenu(false);
      }
      if (showFxPresetsMenu && fxPresetsMenuRef.current && !fxPresetsMenuRef.current.contains(e.target as Node)) {
        setShowFxPresetsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModulesMenu, showPresetsMenu, showFxPresetsMenu]);

  const handleSave = () => {
    try {
      const sequence = patterns.map((p) => p.id);
      const automationData: Record<string, any> = {};
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
              {} as Record<string, any>
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
        { prettify: true }
      );
      notify.success('Song downloaded!', 2000);
    } catch (error) {
      console.error('Failed to save file:', error);
      notify.error('Failed to download file');
    }
  };

  const handleModuleImport = async (moduleInfo: ModuleInfo) => {
    if (isPlaying) {
      stop();
      engine.releaseAll();
    }
    setIsLoading(true);
    try {
      let result;
      if (moduleInfo.nativeData?.patterns) {
        const { format, patterns: nativePatterns, importMetadata, instruments: nativeInstruments } = moduleInfo.nativeData;
        const channelCount = importMetadata.originalChannelCount;
        const instrumentNames = nativeInstruments?.map(i => i.name) || [];
        if (format === 'XM') {
          result = convertXMModule(nativePatterns, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
        } else if (format === 'MOD') {
          result = convertMODModule(nativePatterns, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
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
        // Use original instrument ID from parsed data (1-31 for MOD, 1-128 for XM)
        // NOT array index, which would renumber after filtering empty samples
        instruments = parsedInstruments.flatMap((parsed) =>
          convertToInstrument(parsed, parsed.id, format)
        );
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
      notify.success(`Imported ${moduleInfo.metadata.type}: ${moduleInfo.metadata.title}`, 3000);
      await engine.preloadInstruments(instruments);
    } catch (err) {
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
  const songLength = patterns.length;

  const handlePositionChange = (newPos: number) => {
    if (newPos >= 0 && newPos < songLength) setCurrentPattern(newPos);
  };

  const handleInsertPosition = () => duplicatePattern(currentPatternIndex);
  const handleDeletePosition = () => { if (songLength > 1) deletePattern(currentPatternIndex); };
  const handlePatternChange = (newPat: number) => handlePositionChange(newPat);

  const handlePlaySong = async () => {
    if (isPlaying && !isLooping) stop();
    else {
      if (isPlaying) stop();
      setIsLooping(false);
      await engine.init();
      play();
    }
  };

  const handlePlayPattern = async () => {
    if (isPlaying && isLooping) stop();
    else {
      if (isPlaying) stop();
      setIsLooping(true);
      await engine.init();
      play();
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

      <div className="flex">
        <div className="flex-shrink-0">
          <div className="ft2-toolbar-row">
            <div className="ft2-section ft2-section-pos">
              <FT2NumericInput label="Position" value={currentPositionIndex} onChange={(pos) => {
                setCurrentPosition(pos);
                setCurrentPattern(patternOrder[pos] ?? pos);
              }} min={0} max={patternOrder.length - 1} format="hex" />
              <Button variant="default" size="sm" onClick={handleInsertPosition}>Ins</Button>
              <Button variant="default" size="sm" onClick={handleDeletePosition} disabled={songLength <= 1}>Del</Button>
            </div>
            <div className="ft2-section ft2-section-tempo">
              <div className="ft2-numeric-group">
                <span className="ft2-numeric-label">BPM:</span>
                <span className="ft2-numeric-value">{bpm.toString().padStart(3, '0')}</span>
              </div>
            </div>
            <div className="ft2-section ft2-section-pattern">
              <FT2NumericInput label="Pattern" value={patternOrder[currentPositionIndex] ?? currentPatternIndex} onChange={handlePatternChange} min={0} max={patterns.length - 1} format="hex" />
            </div>
            <div className="ft2-section"><InstrumentSelector /></div>
            <div className="ft2-section ft2-section-playback">
              <Button variant={isPlayingSong ? 'danger' : 'primary'} size="sm" onClick={handlePlaySong} className="min-w-[72px]">{isPlayingSong ? 'Stop Song' : 'Play Song'}</Button>
              <Button variant={isPlayingPattern ? 'danger' : 'primary'} size="sm" onClick={handlePlayPattern} className="min-w-[88px]">{isPlayingPattern ? 'Stop Pattern' : 'Play Pattern'}</Button>
              <Button variant={recordMode ? 'danger' : 'default'} size="sm" className="min-w-[48px]" onClick={toggleRecordMode}>{recordMode ? '● Rec' : 'Rec'}</Button>
            </div>
          </div>

          {!compactToolbar && (
            <div className="ft2-toolbar-row">
              <div className="ft2-section ft2-section-pos">
                <FT2NumericInput label="Pattern" value={currentPatternIndex} onChange={handlePatternChange} min={0} max={songLength - 1} format="hex" />
              </div>
              <div className="ft2-section ft2-section-tempo">
                <FT2NumericInput label="Speed" value={6} onChange={() => {}} min={1} max={31} format="hex" />
              </div>
              <div className="ft2-section ft2-section-pattern">
                <FT2NumericInput label="Length" value={patternLength} onChange={handleLengthChange} min={1} max={256} format="hex" />
              </div>
            </div>
          )}

          {!compactToolbar && (
            <div className="ft2-toolbar-row">
              <div className="ft2-section ft2-section-pos">
                <FT2NumericInput label="Song Len" value={songLength} onChange={() => {}} min={1} max={256} format="hex" />
              </div>
              <div className="ft2-section ft2-section-tempo">
                <FT2NumericInput label="Edit Step" value={editStep} onChange={setEditStep} min={0} max={16} format="hex" />
              </div>
              <div className="ft2-section ft2-section-pattern">
                <Button variant="default" size="sm" onClick={handleExpand}>Expand</Button>
                <Button variant="default" size="sm" onClick={handleShrink}>Shrink</Button>
              </div>
              <RowDisplay />
            </div>
          )}

          <div className="ft2-toolbar-row ft2-toolbar-row-menu">
            <div className="ft2-section">
              <input ref={fileInputRef} type="file" accept={ACCEPTED_FORMATS} onChange={handleFileLoad} className="hidden" />
              <Button variant="ghost" size="sm" onClick={() => setShowFileBrowser(true)} disabled={isLoading} loading={isLoading}>Load</Button>
              <Button variant="ghost" size="sm" onClick={handleSave}>{isDirty ? 'Save*' : 'Save'}</Button>
              
              <div ref={presetsButtonRef}>
                <Button variant={showPresetsMenu ? 'primary' : 'ghost'} size="sm" onClick={() => setShowPresetsMenu(!showPresetsMenu)} disabled={isLoading}>Presets</Button>
              </div>
              {showPresetsMenu && (
                <div ref={presetsMenuRef} className="fixed flex flex-col bg-dark-bgTertiary border border-dark-border rounded shadow-lg z-[9999] min-w-[260px] max-h-[400px] overflow-y-auto" style={{ top: `${presetsMenuPosition.top}px`, left: `${presetsMenuPosition.left}px` }}>
                  <div className="px-3 py-1 text-xs font-bold text-text-muted border-b border-dark-border">Master Presets</div>
                  {MASTER_PRESETS.map((preset) => (
                    <button key={preset.id} onClick={() => handleLoadMasterPreset(preset)} className="w-full text-left px-3 py-2 text-sm font-mono text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-colors flex flex-col">
                      <span className="font-bold">{preset.name}</span>
                      <span className="text-[10px] opacity-60">{preset.description}</span>
                    </button>
                  ))}
                </div>
              )}

              <div ref={modulesButtonRef}>
                <Button variant={showModulesMenu ? 'primary' : 'ghost'} size="sm" onClick={() => setShowModulesMenu(!showModulesMenu)} disabled={isLoading}>Modules</Button>
              </div>
              {showModulesMenu && (
                <div ref={modulesMenuRef} className="fixed flex flex-col bg-dark-bgTertiary border border-dark-border rounded shadow-lg z-[9999] min-w-[260px] max-h-[400px] overflow-y-auto" style={{ top: `${modulesMenuPosition.top}px`, left: `${modulesMenuPosition.left}px` }}>
                  <div className="px-3 py-1 text-xs font-bold text-text-muted border-b border-dark-border">Acid / 303</div>
                  {BUNDLED_MODULES.acid.map((mod) => (<button key={mod.file} onClick={() => handleLoadModule(mod.file)} className="w-full text-left px-3 py-2 text-sm font-mono text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-colors">{mod.name}</button>))}
                  <div className="px-3 py-1 text-xs font-bold text-text-muted border-b border-dark-border mt-2">TB-303 Patterns</div>
                  {BUNDLED_MODULES.tb303.map((mod) => (<button key={mod.file} onClick={() => handleLoadModule(mod.file)} className="w-full text-left px-3 py-2 text-sm font-mono text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-colors">{mod.name}</button>))}
                  <div className="px-3 py-1 text-xs font-bold text-text-muted border-b border-dark-border mt-2">General</div>
                  {BUNDLED_MODULES.general.map((mod) => (<button key={mod.file} onClick={() => handleLoadModule(mod.file)} className="w-full text-left px-3 py-2 text-sm font-mono text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-colors">{mod.name}</button>))}
                </div>
              )}

              <Button variant={showPatterns ? 'primary' : 'ghost'} size="sm" onClick={onShowPatterns}>Patterns</Button>
              <Button variant="ghost" size="sm" onClick={onShowPatternOrder}>Order</Button>
              <Button variant="ghost" size="sm" onClick={onShowInstruments}>Instr</Button>
              <Button variant={showInstrumentFX ? 'primary' : 'ghost'} size="sm" onClick={onShowInstrumentFX}>Instrument FX</Button>
                        <Button variant="ghost" size="sm" onClick={onShowExport}>Export</Button>
                        
                        <div ref={fxPresetsButtonRef}>
                          <Button variant={showFxPresetsMenu ? 'primary' : 'ghost'} size="sm" onClick={() => setShowFxPresetsMenu(!showFxPresetsMenu)}>FX Presets</Button>
                        </div>
                        {showFxPresetsMenu && (
                          <div ref={fxPresetsMenuRef} className="fixed flex flex-col bg-dark-bgTertiary border border-dark-border rounded shadow-lg z-[9999] min-w-[260px] max-h-[400px] overflow-y-auto" style={{ top: `${fxPresetsMenuPosition.top}px`, left: `${fxPresetsMenuPosition.left}px` }}>
                            <div className="px-3 py-1 text-xs font-bold text-text-muted border-b border-dark-border">Master FX Presets</div>
                            {MASTER_FX_PRESETS.map((preset) => (
                              <button key={preset.name} onClick={() => handleLoadMasterFxPreset(preset)} className="w-full text-left px-3 py-2 text-sm font-mono text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-colors flex flex-col">
                                <span className="font-bold">{preset.name}</span>
                                <span className="text-[10px] opacity-60">{preset.description}</span>
                              </button>
                            ))}
                          </div>
                        )}
              
                        <Button variant={showMasterFX ? 'primary' : 'ghost'} size="sm" onClick={onShowMasterFX}>Master FX</Button>
              
              <Button variant="ghost" size="sm" onClick={onShowHelp}>Help</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>Settings</Button>
              <Button variant={masterMuted ? 'danger' : 'default'} size="sm" className="min-w-[52px]" onClick={toggleMasterMute}>{masterMuted ? 'Unmute' : 'Mute'}</Button>
              <Button variant={smoothScrolling ? 'primary' : 'default'} size="sm" className="min-w-[56px]" onClick={() => setSmoothScrolling(!smoothScrolling)}>{smoothScrolling ? 'Smooth' : 'Stepped'}</Button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-[200px] flex items-center justify-center border-l border-dark-border px-2 cursor-pointer" onClick={() => {
          const modes: Array<'waveform' | 'spectrum' | 'channels' | 'stereo' | 'envelope' | 'accent'> = ['waveform', 'spectrum', 'channels', 'stereo', 'envelope', 'accent'];
          setVizMode(modes[(modes.indexOf(vizMode as any) + 1) % modes.length]);
        }}>
          {oscilloscopeVisible && (
            <>
              {(vizMode === 'waveform' || vizMode === 'spectrum') && <Oscilloscope width="auto" height={compactToolbar ? 70 : 100} mode={vizMode} />}
              {vizMode === 'channels' && <ChannelLevelsCompact height={compactToolbar ? 70 : 100} />}
              {vizMode === 'stereo' && <StereoField height={compactToolbar ? 70 : 100} />}
              {vizMode === 'logo' && <LogoAnimation height={compactToolbar ? 70 : 100} onComplete={() => setVizMode('waveform')} />}
              {vizMode === 'envelope' && <EnvelopeVisualizer attack={3} decay={instruments.find(i => i.synthType === 'TB303')?.parameters?.decay ?? 200} sustain={0} release={50} envMod={instruments.find(i => i.synthType === 'TB303')?.parameters?.envMod ?? 60} height={compactToolbar ? 70 : 100} color="var(--color-synth-envelope)" label="Filter Envelope" />}
              {vizMode === 'accent' && <AccentChargeVisualizer charge={0} sweepSpeed={instruments.find(i => i.synthType === 'TB303')?.parameters?.devilFish?.sweepSpeed ?? 'normal'} enabled={instruments.find(i => i.synthType === 'TB303')?.parameters?.devilFish?.accentSweepEnabled ?? true} height={compactToolbar ? 70 : 100} color="var(--color-synth-accent)" />}
            </>
          )}
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <ImportModuleDialog isOpen={showImportDialog} onClose={() => setShowImportDialog(false)} onImport={handleModuleImport} />
      <FileBrowser isOpen={showFileBrowser} onClose={() => setShowFileBrowser(false)} onLoad={async (data: any, filename: string) => {
        if (isPlaying) { stop(); engine.releaseAll(); }
        try {
          const { needsMigration, migrateProject } = await import('@/lib/migration');
          let patterns = data.patterns, instruments = data.instruments;
          if (needsMigration(patterns, instruments)) {
            const migrated = migrateProject(patterns, instruments);
            patterns = migrated.patterns; instruments = migrated.instruments;
          }
          if (patterns) {
            loadPatterns(patterns);
            if (data.sequence && Array.isArray(data.sequence)) {
              const patternIdToIndex = new Map(patterns.map((p: any, i: any) => [p.id, i]));
              const order = data.sequence.map((id: any) => patternIdToIndex.get(id)).filter((idx: any) => idx !== undefined);
              if (order.length > 0) setPatternOrder(order);
            }
          }
          if (instruments) loadInstruments(instruments);
          if (data.metadata) setMetadata(data.metadata);
          if (data.bpm) setBPM(data.bpm);
          notify.success(`Loaded: ${data.metadata?.name || filename}`);
        } catch (error) { notify.error('Failed to load file'); }
      }} onLoadTrackerModule={async (buffer: ArrayBuffer, filename: string) => {
        if (isPlaying) { stop(); engine.releaseAll(); }
        try {
          const { loadModuleFile } = await import('@lib/import/ModuleLoader');
          const moduleInfo = await loadModuleFile(new File([buffer], filename));
          if (moduleInfo) await handleModuleImport(moduleInfo);
        } catch (error) { notify.error('Failed to load module'); }
      }} />
    </div>
  );
};