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

  // PERFORMANCE: currentRow removed - now handled by RowDisplay component
  const {
    isPlaying,
    isLooping,
    bpm,
    setBPM, // Used for loading songs, not for user input
    setIsLooping,
    play,
    stop,
    smoothScrolling,
    setSmoothScrolling,
  } = useTransportStore();

  const { isDirty, setMetadata, metadata } = useProjectStore();
  useProjectPersistence(); // Keep hook for auto-save functionality
  const { instruments, loadInstruments } = useInstrumentStore();
  const { masterMuted, toggleMasterMute, masterEffects } = useAudioStore();
  const { compactToolbar, toggleCompactToolbar, oscilloscopeVisible } = useUIStore();
  const { curves } = useAutomationStore();

  const engine = getToneEngine();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Start with logo intro, then cycle through other visualizers
  const [vizMode, setVizMode] = useState<'waveform' | 'spectrum' | 'channels' | 'stereo' | 'logo' | 'envelope' | 'accent'>('logo');
  const [showModulesMenu, setShowModulesMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const modulesMenuRef = useRef<HTMLDivElement>(null);
  const modulesButtonRef = useRef<HTMLDivElement>(null);
  const [modulesMenuPosition, setModulesMenuPosition] = useState({ top: 0, left: 0 });

  // Bundled modules organized by category
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

  // Load bundled module from server
  const handleLoadModule = async (filename: string) => {
    setShowModulesMenu(false);

    // Stop playback before loading
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

      // Validate song format
      if (songData.format !== 'devilbox-dbox' && songData.format !== 'devilbox-song') {
        throw new Error(`Invalid format: expected "devilbox-dbox", got "${songData.format}"`);
      }

      // Migrate old format if needed
      const { needsMigration, migrateProject } = await import('@/lib/migration');
      let patterns = songData.patterns;
      let instruments = songData.instruments;

      if (needsMigration(patterns, instruments)) {
        const migrated = migrateProject(patterns, instruments);
        patterns = migrated.patterns;
        instruments = migrated.instruments;
      }

      // Load song data
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
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      notify.error(`Failed to load ${filename}: ${errorMsg}`, 10000);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate dropdown position when menu opens
  React.useEffect(() => {
    if (showModulesMenu && modulesButtonRef.current) {
      const rect = modulesButtonRef.current.getBoundingClientRect();
      setModulesMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [showModulesMenu]);

  // Close modules menu when clicking outside
  React.useEffect(() => {
    if (!showModulesMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modulesMenuRef.current && !modulesMenuRef.current.contains(e.target as Node)) {
        setShowModulesMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModulesMenu]);

  // Save to file handler (download to computer)
  const handleSave = () => {
    try {
      const sequence = patterns.map((p) => p.id);
      // Convert automation curves to export format
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

  // Handle module import from dialog
  const handleModuleImport = async (moduleInfo: ModuleInfo) => {
    // CRITICAL: Stop playback before loading new song to prevent audio glitches
    if (isPlaying) {
      stop();
      engine.releaseAll(); // Release any held notes
    }

    setIsLoading(true);
    try {
      let result;

      // Debug: Log what data we have
      console.log('[Import] moduleInfo:', {
        hasNativeData: !!moduleInfo.nativeData,
        nativeFormat: moduleInfo.nativeData?.format,
        hasNativePatterns: !!moduleInfo.nativeData?.patterns,
        nativePatternsLength: moduleInfo.nativeData?.patterns?.length,
        hasSong: !!moduleInfo.metadata.song,
        title: moduleInfo.metadata.title,
      });

      // Check if we have native parser data (MOD/XM files)
      if (moduleInfo.nativeData?.patterns) {
        const { format, patterns: nativePatterns, importMetadata, instruments: nativeInstruments } = moduleInfo.nativeData;
        const channelCount = importMetadata.originalChannelCount;
        const instrumentNames = nativeInstruments?.map(i => i.name) || [];

        if (format === 'XM') {
          result = convertXMModule(nativePatterns, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
        } else if (format === 'MOD') {
          result = convertMODModule(nativePatterns, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
        } else {
          notify.error(`Unsupported native format: ${format}`, 5000);
          return;
        }
      } else if (moduleInfo.metadata.song) {
        // Fall back to libopenmpt data
        result = convertModule(moduleInfo.metadata.song);
      } else {
        notify.error(`Module "${moduleInfo.metadata.title}" has no pattern data`, 5000);
        return;
      }

      if (result.patterns.length === 0) {
        notify.error(`Module "${moduleInfo.metadata.title}" contains no patterns`, 5000);
        return;
      }

      // Use the parsed instruments from the native parser, or create from pattern data
      let instruments: InstrumentConfig[];
      if (moduleInfo.nativeData?.instruments) {
        // Convert ParsedInstruments to InstrumentConfig
        const parsedInstruments = moduleInfo.nativeData.instruments;
        const format = moduleInfo.nativeData.format;
        instruments = parsedInstruments.flatMap((parsed, index) =>
          convertToInstrument(parsed, index + 1, format)
        );
      } else {
        instruments = createInstrumentsForModule(result.patterns, result.instrumentNames, undefined);
      }

      console.log('[Import]', instruments.length, 'instruments,', result.patterns.length, 'patterns');

      loadInstruments(instruments);
      loadPatterns(result.patterns);

      // Set pattern order from module
      if (result.order && result.order.length > 0) {
        setPatternOrder(result.order);
        console.log('[Import] Pattern order set:', result.order.length, 'positions');

        // CRITICAL: Set current pattern to the first pattern in the order (position 0)
        // This ensures playback starts from the beginning of the song
        const firstPatternIndex = result.order[0];
        setCurrentPattern(firstPatternIndex);
        console.log(`[Import] Set current pattern to position 0: pattern ${firstPatternIndex}`);
      }

      setMetadata({ name: moduleInfo.metadata.title, author: '', description: `Imported from ${moduleInfo.metadata.type}` });

      // Apply initial BPM from module metadata (if available)
      const initialBPM = moduleInfo.nativeData?.importMetadata.modData?.initialBPM;
      if (initialBPM) {
        setBPM(initialBPM);
      }

      notify.success(`Imported ${moduleInfo.metadata.type}: ${moduleInfo.metadata.title}`, 3000);

      // Preload samples
      console.log('[Import] Preloading samples...');
      await engine.preloadInstruments(instruments);
      console.log('[Import] Samples ready for playback');

    } catch (err) {
      notify.error(`Failed to import module: ${err instanceof Error ? err.message : String(err)}`, 8000);
    } finally {
      setIsLoading(false);
    }
  };

  // File load handler (like NavBar)
  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the file input so the same file can be selected again
    e.target.value = '';

    // For MOD/XM files, open the import dialog instead
    if (isSupportedModule(file.name)) {
      setShowImportDialog(true);
      // The dialog will handle the file selection
      return;
    }

    // CRITICAL: Stop playback before loading new song to prevent audio glitches
    if (isPlaying) {
      stop();
      engine.releaseAll(); // Release any held notes
    }

    setIsLoading(true);
    try {
      if (isMIDIFile(file.name)) {
        // MIDI file import
        const midiResult = await importMIDIFile(file, {
          quantize: 1,
          mergeChannels: false,
          velocityToVolume: true,
          defaultPatternLength: 64,
        });

        // Create instruments for MIDI (simple oscillators)
        const instruments = createInstrumentsForModule(midiResult.patterns, [], undefined);

        // Load patterns and instruments
        loadPatterns(midiResult.patterns);
        loadInstruments(instruments);
        setMetadata({
          name: midiResult.metadata.name,
          author: '',
          description: `Imported from ${file.name} (${midiResult.metadata.tracks} MIDI tracks)`,
        });
        setBPM(midiResult.bpm);

        notify.success(`Loaded MIDI: ${midiResult.metadata.name} (${midiResult.patterns.length} patterns)`, 3000);
      } else {
        // JSON song file
        const songData = await importSong(file);
        if (!songData) {
          notify.error('Failed to import song: Invalid or corrupted file', 8000);
          return;
        }

        // Validate song data
        if (!songData.patterns || !Array.isArray(songData.patterns)) {
          notify.error('Invalid song: Missing patterns array', 8000);
          return;
        }
        if (!songData.instruments || !Array.isArray(songData.instruments)) {
          notify.error('Invalid song: Missing instruments array', 8000);
          return;
        }

        // CRITICAL: Migrate old format song files to new XM format
        // User-saved songs may use old format (string notes, null values, old effects)
        // Must migrate before loading to avoid runtime errors
        const { needsMigration, migrateProject } = await import('@/lib/migration');
        let patterns = songData.patterns;
        let instruments = songData.instruments;

        if (needsMigration(patterns, instruments)) {
          console.log('[Import] Old format detected, migrating to XM format...');
          const migrated = migrateProject(patterns, instruments);
          patterns = migrated.patterns;
          instruments = migrated.instruments;
          console.log('[Import] Migration complete!');
        }

        // Load song data
        loadPatterns(patterns);

        // Convert sequence (pattern IDs) to pattern order (indices)
        if (songData.sequence && Array.isArray(songData.sequence)) {
          const patternIdToIndex = new Map(patterns.map((p: Pattern, i: number) => [p.id, i]));
          const order = songData.sequence
            .map((patternId: string) => patternIdToIndex.get(patternId))
            .filter((index: number | undefined): index is number => index !== undefined);

          if (order.length > 0) {
            setPatternOrder(order);
            console.log('[Import] Loaded pattern order:', order);
          }
        }

        if (instruments) loadInstruments(instruments);
        if (songData.masterEffects) useAudioStore.getState().setMasterEffects(songData.masterEffects);
        setBPM(songData.bpm);
        setMetadata(songData.metadata);
        notify.success(`Loaded: ${songData.metadata?.name || file.name}`, 2000);
      }
    } catch (error) {
      console.error('Failed to load file:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      notify.error(`Failed to load ${file.name}: ${errorMsg}`, 10000);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  const pattern = patterns[currentPatternIndex];
  const patternLength = pattern?.length || 64;
  const songLength = patterns.length;

  // Position controls
  const handlePositionChange = (newPos: number) => {
    if (newPos >= 0 && newPos < songLength) {
      setCurrentPattern(newPos);
    }
  };

  const handleInsertPosition = () => {
    duplicatePattern(currentPatternIndex);
  };

  const handleDeletePosition = () => {
    if (songLength > 1) {
      deletePattern(currentPatternIndex);
    }
  };

  // Pattern controls
  const handlePatternChange = (newPat: number) => {
    // In a full implementation, this would select from unique patterns
    // For now, it's the same as position
    handlePositionChange(newPat);
  };

  // Playback controls - dual state buttons
  const handlePlaySong = async () => {
    if (isPlaying && !isLooping) {
      // Currently playing song - stop
      stop();
    } else {
      // Start song playback (non-looping)
      if (isPlaying) stop(); // Stop pattern playback first
      setIsLooping(false);
      await engine.init();
      play();
    }
  };

  const handlePlayPattern = async () => {
    if (isPlaying && isLooping) {
      // Currently playing pattern - stop
      stop();
    } else {
      // Start pattern playback (looping)
      if (isPlaying) stop(); // Stop song playback first
      setIsLooping(true);
      await engine.init();
      play();
    }
  };

  // Derived state for button labels
  const isPlayingSong = isPlaying && !isLooping;
  const isPlayingPattern = isPlaying && isLooping;

  // Pattern edit controls
  const handleExpand = () => {
    expandPattern?.(currentPatternIndex);
  };

  const handleShrink = () => {
    shrinkPattern?.(currentPatternIndex);
  };

  // Pattern length change handler
  const handleLengthChange = (newLength: number) => {
    if (newLength >= 1 && newLength <= 256) {
      resizePattern(currentPatternIndex, newLength);
    }
  };

  return (
    <div
      className={`ft2-toolbar ${compactToolbar ? 'ft2-toolbar-compact' : ''}`}
      style={compactToolbar ? {
        maxHeight: '80px',
        minHeight: '80px',
        height: '80px',
        overflow: 'hidden'
      } : undefined}
    >
      {/* Toolbar Compact Toggle - consistent right-side position */}
      <button
        className="panel-collapse-toggle"
        onClick={toggleCompactToolbar}
        title={compactToolbar ? 'Expand toolbar' : 'Collapse toolbar'}
      >
        {compactToolbar ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>

      {/* Main toolbar content with oscilloscope on right */}
      <div className="flex">
        {/* Left: Toolbar controls - natural width */}
        <div className="flex-shrink-0">

      {/* Row 1: Position/BPM/Pattern/Playback */}
      <div className="ft2-toolbar-row">
        {/* Position Section */}
        <div className="ft2-section ft2-section-pos">
          <FT2NumericInput
            label="Position"
            value={currentPositionIndex}
            onChange={(pos) => {
              // When position changes, update both position and pattern
              setCurrentPosition(pos);
              const patternIdx = patternOrder[pos] ?? pos;
              setCurrentPattern(patternIdx);
            }}
            min={0}
            max={patternOrder.length - 1}
            format="hex"
          />
          <Button variant="default" size="sm" onClick={handleInsertPosition} title="Insert position (duplicate current)">
            Ins
          </Button>
          <Button variant="default" size="sm" onClick={handleDeletePosition} title="Delete position" disabled={songLength <= 1}>
            Del
          </Button>
        </div>

        {/* BPM Display - Read-only (controlled by F20+ effect commands) */}
        <div className="ft2-section ft2-section-tempo">
          <div className="ft2-numeric-group">
            <span className="ft2-numeric-label">BPM:</span>
            <span className="ft2-numeric-value" title="BPM is controlled via F20-FF effect commands in patterns">
              {bpm.toString().padStart(3, '0')}
            </span>
          </div>
        </div>

        {/* Pattern Section */}
        <div className="ft2-section ft2-section-pattern">
          <FT2NumericInput
            label="Pattern"
            value={patternOrder[currentPositionIndex] ?? currentPatternIndex}
            onChange={handlePatternChange}
            min={0}
            max={patterns.length - 1}
            format="hex"
          />
        </div>

        {/* Instrument Selector (FT2-style) */}
        <div className="ft2-section">
          <InstrumentSelector />
        </div>

        {/* Playback Section */}
        <div className="ft2-section ft2-section-playback">
          <Button
            variant={isPlayingSong ? 'danger' : 'primary'}
            size="sm"
            onClick={handlePlaySong}
            className="min-w-[72px]"
            title={isPlayingSong ? 'Stop song playback (F8 / Esc)' : 'Play song from start (F5)'}
          >
            {isPlayingSong ? 'Stop Song' : 'Play Song'}
          </Button>
          <Button
            variant={isPlayingPattern ? 'danger' : 'primary'}
            size="sm"
            onClick={handlePlayPattern}
            className="min-w-[88px]"
            title={isPlayingPattern ? 'Stop pattern playback (F8 / Esc)' : 'Play/loop current pattern (F6)'}
          >
            {isPlayingPattern ? 'Stop Pattern' : 'Play Pattern'}
          </Button>
          <Button
            variant={recordMode ? 'danger' : 'default'}
            size="sm"
            className="min-w-[48px]"
            onClick={toggleRecordMode}
            title={recordMode ? 'Disable record mode (Enter)' : 'Enable record mode - enter notes at playback position (Enter)'}
          >
            {recordMode ? '● Rec' : 'Rec'}
          </Button>
        </div>
      </div>

      {/* Row 2: Pattern/Speed/Length/Stop-Record (hidden in compact mode) */}
      {!compactToolbar && (
        <div className="ft2-toolbar-row">
          {/* Pattern display */}
          <div className="ft2-section ft2-section-pos">
            <FT2NumericInput
              label="Pattern"
              value={currentPatternIndex}
              onChange={handlePatternChange}
              min={0}
              max={songLength - 1}
              format="hex"
            />
          </div>

          {/* Speed Section - Read-only display (controlled by Fxx effect commands) */}
          <div className="ft2-section ft2-section-tempo">
            <FT2NumericInput
              label="Speed"
              value={6}
              onChange={() => {}} // Read-only: Speed is controlled via F01-F1F effect commands in patterns
              min={1}
              max={31}
              format="hex"
            />
          </div>

          {/* Length Section */}
          <div className="ft2-section ft2-section-pattern">
            <FT2NumericInput
              label="Length"
              value={patternLength}
              onChange={handleLengthChange}
              min={1}
              max={256}
              format="hex"
            />
          </div>
        </div>
      )}

      {/* Row 3: Song Length/Add/Expand-Shrink (hidden in compact mode) */}
      {!compactToolbar && (
        <div className="ft2-toolbar-row">
          {/* Song Length - Read-only display (add/delete patterns to change) */}
          <div className="ft2-section ft2-section-pos">
            <FT2NumericInput
              label="Song Len"
              value={songLength}
              onChange={() => {}} // Read-only: Use Ins/Del buttons to add/remove patterns
              min={1}
              max={256}
              format="hex"
            />
          </div>

          {/* Edit Step (rows to advance after note entry in record mode) */}
          <div className="ft2-section ft2-section-tempo">
            <FT2NumericInput
              label="Edit Step"
              value={editStep}
              onChange={setEditStep}
              min={0}
              max={16}
              format="hex"
            />
          </div>

          {/* Expand/Shrink */}
          <div className="ft2-section ft2-section-pattern">
            <Button variant="default" size="sm" onClick={handleExpand} title="Expand pattern (double rows)">
              Expand
            </Button>
            <Button variant="default" size="sm" onClick={handleShrink} title="Shrink pattern (halve rows)">
              Shrink
            </Button>
          </div>

          {/* Row indicator - separate component to avoid toolbar re-renders */}
          <RowDisplay />
        </div>
      )}

      {/* Row 4: File/Menu buttons */}
      <div className="ft2-toolbar-row ft2-toolbar-row-menu">
        <div className="ft2-section">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FORMATS}
            onChange={handleFileLoad}
            className="hidden"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFileBrowser(true)}
            disabled={isLoading}
            loading={isLoading}
            title="Load song or module (Ctrl+O)"
          >
            Load
          </Button>

          <Button variant="ghost" size="sm" onClick={handleSave} title="Download song file (Ctrl+S)">
            {isDirty ? 'Save*' : 'Save'}
          </Button>

          {/* Bundled Modules Dropdown */}
          <div ref={modulesButtonRef}>
            <Button
              variant={showModulesMenu ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setShowModulesMenu(!showModulesMenu)}
              disabled={isLoading}
              title="Load bundled example modules"
            >
              Modules
            </Button>
          </div>
          {showModulesMenu && (
            <div
              ref={modulesMenuRef}
              className="fixed flex flex-col bg-dark-bgTertiary border border-dark-border rounded shadow-lg z-[9999] min-w-[260px] max-h-[400px] overflow-y-auto"
              style={{
                top: `${modulesMenuPosition.top}px`,
                left: `${modulesMenuPosition.left}px`,
              }}
            >
              {/* Acid Modules */}
              <div className="px-3 py-1 text-xs font-bold text-text-muted border-b border-dark-border">
                Acid / 303
              </div>
              {BUNDLED_MODULES.acid.map((mod) => (
                <button
                  key={mod.file}
                  onClick={() => handleLoadModule(mod.file)}
                  className="w-full text-left px-3 py-2 text-sm font-mono text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-colors"
                >
                  {mod.name}
                </button>
              ))}

              {/* TB-303 Pattern Modules */}
              <div className="px-3 py-1 text-xs font-bold text-text-muted border-b border-dark-border mt-2">
                TB-303 Patterns
              </div>
              {BUNDLED_MODULES.tb303.map((mod) => (
                <button
                  key={mod.file}
                  onClick={() => handleLoadModule(mod.file)}
                  className="w-full text-left px-3 py-2 text-sm font-mono text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-colors"
                >
                  {mod.name}
                </button>
              ))}

              {/* General Modules */}
              <div className="px-3 py-1 text-xs font-bold text-text-muted border-b border-dark-border mt-2">
                General
              </div>
              {BUNDLED_MODULES.general.map((mod) => (
                <button
                  key={mod.file}
                  onClick={() => handleLoadModule(mod.file)}
                  className="w-full text-left px-3 py-2 text-sm font-mono text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-colors"
                >
                  {mod.name}
                </button>
              ))}
            </div>
          )}

          <Button variant={showPatterns ? 'primary' : 'ghost'} size="sm" onClick={onShowPatterns} title="Pattern list (Ctrl+Shift+P)">
            Patterns
          </Button>
          <Button variant="ghost" size="sm" onClick={onShowPatternOrder} title="Pattern order editor">
            Order
          </Button>
          <Button variant="ghost" size="sm" onClick={onShowInstruments} title="Instrument editor (Ctrl+I)">
            Instr
          </Button>
          <Button variant={showInstrumentFX ? 'primary' : 'ghost'} size="sm" onClick={onShowInstrumentFX} title="Instrument effects (Ctrl+Shift+F)">
            Instrument FX
          </Button>
          <Button variant="ghost" size="sm" onClick={onShowExport} title="Export dialog (Ctrl+Shift+E)">
            Export
          </Button>
          <Button variant={showMasterFX ? 'primary' : 'ghost'} size="sm" onClick={onShowMasterFX} title="Master effects (Ctrl+M)">
            Master FX
          </Button>
          <Button variant="ghost" size="sm" onClick={onShowHelp} title="Help & shortcuts (?)">
            Help
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)} title="Application settings">
            Settings
          </Button>
          <Button variant={masterMuted ? 'danger' : 'default'} size="sm" className="min-w-[52px]" onClick={toggleMasterMute} title="Toggle master mute (Ctrl+Shift+M)">
            {masterMuted ? 'Unmute' : 'Mute'}
          </Button>
          <Button
            variant={smoothScrolling ? 'primary' : 'default'}
            size="sm"
            className="min-w-[56px]"
            onClick={() => setSmoothScrolling(!smoothScrolling)}
            title={smoothScrolling ? 'Classic stepped scrolling' : 'Smooth DAW-style scrolling'}
          >
            {smoothScrolling ? 'Smooth' : 'Stepped'}
          </Button>
        </div>
      </div>

        </div>
        {/* End left toolbar controls */}

        {/* Right: Visualizer - cycles through waveform/spectrum/channels/stereo/logo/envelope/accent */}
        <div
          className="flex-1 min-w-[200px] flex items-center justify-center border-l border-dark-border px-2 cursor-pointer"
          onClick={() => {
            // Logo is intro-only, not in the cycle
            const modes: Array<'waveform' | 'spectrum' | 'channels' | 'stereo' | 'envelope' | 'accent'> = ['waveform', 'spectrum', 'channels', 'stereo', 'envelope', 'accent'];
            const currentIndex = modes.indexOf(vizMode as typeof modes[number]);
            setVizMode(modes[(currentIndex + 1) % modes.length]);
          }}
          title={`Click to cycle visualizer (${vizMode})`}
        >
          {oscilloscopeVisible && (
            <>
              {(vizMode === 'waveform' || vizMode === 'spectrum') && (
                <Oscilloscope width="auto" height={compactToolbar ? 70 : 100} mode={vizMode} />
              )}
              {vizMode === 'channels' && (
                <ChannelLevelsCompact height={compactToolbar ? 70 : 100} />
              )}
              {vizMode === 'stereo' && (
                <StereoField height={compactToolbar ? 70 : 100} />
              )}
              {vizMode === 'logo' && (
                <LogoAnimation
                  height={compactToolbar ? 70 : 100}
                  onComplete={() => setVizMode('waveform')}
                />
              )}
              {vizMode === 'envelope' && (
                <EnvelopeVisualizer
                  attack={3}
                  decay={(() => {
                    const tb303 = instruments.find(i => i.synthType === 'TB303');
                    return tb303?.parameters?.decay ?? 200;
                  })()}
                  sustain={0}
                  release={50}
                  envMod={(() => {
                    const tb303 = instruments.find(i => i.synthType === 'TB303');
                    return tb303?.parameters?.envMod ?? 60;
                  })()}
                  height={compactToolbar ? 70 : 100}
                  color="var(--color-synth-envelope)"
                  label="Filter Envelope"
                />
              )}
              {vizMode === 'accent' && (
                <AccentChargeVisualizer
                  charge={0}
                  sweepSpeed={(() => {
                    const tb303 = instruments.find(i => i.synthType === 'TB303');
                    return tb303?.parameters?.devilFish?.sweepSpeed ?? 'normal';
                  })()}
                  enabled={(() => {
                    const tb303 = instruments.find(i => i.synthType === 'TB303');
                    return tb303?.parameters?.devilFish?.accentSweepEnabled ?? true;
                  })()}
                  height={compactToolbar ? 70 : 100}
                  color="var(--color-synth-accent)"
                />
              )}
            </>
          )}
        </div>
      </div>
      {/* End main toolbar flex container */}

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* Import Module Dialog */}
      <ImportModuleDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={handleModuleImport}
      />

      {/* File Browser */}
      <FileBrowser
        isOpen={showFileBrowser}
        onClose={() => setShowFileBrowser(false)}
        onLoad={async (data: any, filename: string) => {
          // Stop playback before loading
          if (isPlaying) {
            stop();
            engine.releaseAll();
          }

          try {
            // Migrate old format if needed
            const { needsMigration, migrateProject } = await import('@/lib/migration');
            let patterns = data.patterns;
            let instruments = data.instruments;

            if (needsMigration(patterns, instruments)) {
              const migrated = migrateProject(patterns, instruments);
              patterns = migrated.patterns;
              instruments = migrated.instruments;
            }

            // Load song data
            if (patterns) {
              loadPatterns(patterns);
              if (data.sequence && Array.isArray(data.sequence)) {
                const patternIdToIndex = new Map(patterns.map((p: Pattern, i: number) => [p.id, i]));
                const order = data.sequence
                  .map((patternId: string) => patternIdToIndex.get(patternId))
                  .filter((index: number | undefined): index is number => index !== undefined);
                if (order.length > 0) setPatternOrder(order);
              }
            }
            if (instruments) loadInstruments(instruments);
            if (data.metadata) setMetadata(data.metadata);
            if (data.bpm) setBPM(data.bpm);

            notify.success(`Loaded: ${data.metadata?.name || filename}`, 2000);
          } catch (error) {
            console.error('Failed to load file:', error);
            notify.error(`Failed to load: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }}
        onLoadTrackerModule={async (buffer: ArrayBuffer, filename: string) => {
          // Stop playback before loading
          if (isPlaying) {
            stop();
            engine.releaseAll();
          }

          try {
            // Import the module loader
            const { loadModuleFile } = await import('@lib/import/ModuleLoader');
            const moduleInfo = await loadModuleFile(new File([buffer], filename));

            if (moduleInfo) {
              await handleModuleImport(moduleInfo);
            }
          } catch (error) {
            console.error('Failed to load tracker module:', error);
            notify.error(`Failed to load: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }}
      />
    </div>
  );
};
