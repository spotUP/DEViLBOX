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
import { FT2Button } from './FT2Button';
import { FT2NumericInput } from './FT2NumericInput';
import { InstrumentSelector } from './InstrumentSelector';
import { useTrackerStore, useTransportStore, useProjectStore, useInstrumentStore, useAudioStore, useUIStore, useAutomationStore } from '@stores';
import { notify } from '@stores/useNotificationStore';
import { useProjectPersistence } from '@hooks/useProjectPersistence';
import { getToneEngine } from '@engine/ToneEngine';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SettingsModal } from '@components/dialogs/SettingsModal';
import { ImportModuleDialog } from '@components/dialogs/ImportModuleDialog';
import { importSong, exportSong } from '@lib/export/exporters';
import { isSupportedModule, getSupportedExtensions, type ModuleInfo } from '@lib/import/ModuleLoader';
import { convertModule } from '@lib/import/ModuleConverter';
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
  onImport?: () => void;
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
  onImport,
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
  const { save: saveProject } = useProjectPersistence();
  const { instruments, loadInstruments } = useInstrumentStore();
  const { masterMuted, toggleMasterMute, masterEffects } = useAudioStore();
  const { compactToolbar, toggleCompactToolbar } = useUIStore();
  const { curves } = useAutomationStore();

  const engine = getToneEngine();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDemoMenu, setShowDemoMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const demoMenuRef = useRef<HTMLDivElement>(null);
  const demoButtonRef = useRef<HTMLDivElement>(null);
  const [demoMenuPosition, setDemoMenuPosition] = useState({ top: 0, left: 0 });

  // Demo songs organized by category
  const DEMO_SONGS = {
    acid: [
      { file: 'acid/classic-303-acid-demo.dbox', name: '🎛️ Classic 303 Acid Demo' },
      { file: 'acid/phuture-acid-tracks.dbox', name: 'Phuture - Acid Tracks' },
      { file: 'acid/hardfloor-funalogue.dbox', name: 'Hardfloor - Funalogue' },
      { file: 'acid/josh-wink-higher-state.dbox', name: 'Josh Wink - Higher State' },
      { file: 'acid/dittytoy-303.dbox', name: 'Dittytoy 303' },
      { file: 'acid/fatboy-slim-everyone-needs-303.dbox', name: 'Fatboy Slim - Everyone Needs a 303' },
      { file: 'acid/fast-eddie-acid-thunder.dbox', name: 'Fast Eddie - Acid Thunder' },
      { file: 'acid/dj-tim-misjah-access.dbox', name: 'DJ Tim & Misjah - Access' },
      { file: 'acid/samplab-mathew-303.dbox', name: '🎹 Samplab Mathew 303' },
      { file: 'acid/samplab-mathew-full.dbox', name: '🎹 Samplab Mathew (Full)' },
      { file: 'acid/slow-creaky-acid-authentic.dbox', name: '🐌 Slow Creaky (Authentic)' },
      { file: 'acid/slow-creaky-acid-tempo-relative.dbox', name: '🐌 Slow Creaky (Tempo-Relative)' },
    ],
    tb303: [
      { file: 'tb303/1-fatboy-slim-everybody-needs-a-303.dbox', name: 'Fatboy Slim - Everybody needs a 303' },
      { file: 'tb303/2-josh-wink-high-state-of-consciousness.dbox', name: 'Josh Wink - High State of Consciousness' },
      { file: 'tb303/3-christophe-just-i-m-a-disco-dancer-part-1-.dbox', name: 'Christophe Just - I\'m a Disco Dancer (Part 1)' },
      { file: 'tb303/4-christophe-just-i-m-a-disco-dancer-part-2-.dbox', name: 'Christophe Just - I\'m a Disco Dancer (Part 2)' },
      { file: 'tb303/5-claustrophobic-sting-the-prodigy.dbox', name: 'Claustrophobic Sting - The Prodigy' },
      { file: 'tb303/6-josh-wink-are-you-there.dbox', name: 'Josh Wink - Are You There' },
      { file: 'tb303/7-cut-paste-forget-it-part-1-.dbox', name: 'Cut Paste - Forget It (Part 1)' },
      { file: 'tb303/8-cut-paste-forget-it-part-2-.dbox', name: 'Cut Paste - Forget It (Part 2)' },
      { file: 'tb303/9-public-energy-three-o-three-part-1-.dbox', name: 'Public Energy - Three O Three (Part 1)' },
      { file: 'tb303/10-public-energy-three-o-three-part-2-.dbox', name: 'Public Energy - Three O Three (Part 2)' },
    ],
    general: [
      { file: 'general/new-order-confusion.dbox', name: 'New Order - Confusion' },
      { file: 'general/edge-of-motion-setup-707.dbox', name: 'Edge of Motion - 707 Setup' },
    ],
  };

  // Load demo song from server
  const handleLoadDemo = async (filename: string) => {
    setShowDemoMenu(false);

    // Stop playback before loading
    if (isPlaying) {
      stop();
      engine.releaseAll();
    }

    setIsLoading(true);
    try {
      // Use import.meta.env.BASE_URL for correct path on GitHub Pages
      const basePath = import.meta.env.BASE_URL || '/';
      const response = await fetch(`${basePath}demos/${filename}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const songData = await response.json();

      // Validate song format (support both .dbox and .song.json formats)
      if (songData.format !== 'devilbox-dbox' && songData.format !== 'devilbox-song') {
        throw new Error(`Invalid format: expected "devilbox-dbox" or "devilbox-song", got "${songData.format}"`);
      }

      // Validate required fields
      if (!songData.patterns || !Array.isArray(songData.patterns)) {
        throw new Error('Missing or invalid "patterns" array');
      }
      if (!songData.instruments || !Array.isArray(songData.instruments)) {
        throw new Error('Missing or invalid "instruments" array');
      }
      if (!songData.sequence || !Array.isArray(songData.sequence)) {
        throw new Error('Missing or invalid "sequence" array');
      }

      // CRITICAL: Migrate old format demo songs to new XM format
      // Demo songs use old format (string notes, null values, old effects)
      // Must migrate before loading to avoid runtime errors
      const { needsMigration, migrateProject } = await import('@/lib/migration');
      let patterns = songData.patterns;
      let instruments = songData.instruments;

      if (needsMigration(patterns, instruments)) {
        console.log('[Demo] Old format detected, migrating to XM format...');
        const migrated = migrateProject(patterns, instruments);
        patterns = migrated.patterns;
        instruments = migrated.instruments;
        console.log('[Demo] Migration complete!');
      }

      // Load song data
      if (patterns) {
        loadPatterns(patterns);

        // Convert sequence (pattern IDs) to pattern order (indices)
        if (songData.sequence && Array.isArray(songData.sequence)) {
          const patternIdToIndex = new Map(patterns.map((p: Pattern, i: number) => [p.id, i]));
          const order = songData.sequence
            .map((patternId: string) => patternIdToIndex.get(patternId))
            .filter((index: number | undefined): index is number => index !== undefined);

          if (order.length > 0) {
            setPatternOrder(order);
            console.log('[Demo] Loaded pattern order:', order);
          }
        }
      }
      if (instruments) loadInstruments(instruments);
      if (songData.metadata) setMetadata(songData.metadata);
      if (songData.bpm) setBPM(songData.bpm);

      notify.success(`Loaded: ${songData.metadata?.name || filename}`, 2000);
      console.log(`[Demo] Loaded: ${filename}`);
    } catch (error) {
      console.error('Failed to load demo:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      notify.error(`Failed to load ${filename}: ${errorMsg}`, 10000);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate dropdown position when menu opens
  React.useEffect(() => {
    if (showDemoMenu && demoButtonRef.current) {
      const rect = demoButtonRef.current.getBoundingClientRect();
      setDemoMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [showDemoMenu]);

  // Close demo menu when clicking outside
  React.useEffect(() => {
    if (!showDemoMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (demoMenuRef.current && !demoMenuRef.current.contains(e.target as Node)) {
        setShowDemoMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDemoMenu]);

  // Save handler with feedback (browser storage)
  const handleSave = () => {
    const success = saveProject();
    if (success) {
      notify.success('Project saved to browser storage', 2000);
    } else {
      notify.error('Failed to save project');
    }
  };

  // Save to file handler (download to computer)
  const handleSaveFile = () => {
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
      if (!moduleInfo.metadata.song) {
        notify.error(`Module "${moduleInfo.metadata.title}" has no pattern data`, 5000);
        return;
      }

      const result = convertModule(moduleInfo.metadata.song);

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
          <FT2Button onClick={handleInsertPosition} small title="Insert position (duplicate current)">
            Ins
          </FT2Button>
          <FT2Button onClick={handleDeletePosition} small title="Delete position" disabled={songLength <= 1}>
            Del
          </FT2Button>
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
          <FT2Button
            onClick={handlePlaySong}
            active={isPlayingSong}
            colorAccent={isPlayingSong ? 'red' : 'green'}
            title={isPlayingSong ? 'Stop playback (F8 / Esc)' : 'Play song from start (F5)'}
          >
            {isPlayingSong ? 'Stop' : 'Play Song'}
          </FT2Button>
          <FT2Button
            onClick={handlePlayPattern}
            active={isPlayingPattern}
            colorAccent={isPlayingPattern ? 'red' : 'green'}
            title={isPlayingPattern ? 'Stop playback (F8 / Esc)' : 'Play/loop current pattern (F6)'}
          >
            {isPlayingPattern ? 'Stop' : 'Play Pattern'}
          </FT2Button>
          <FT2Button
            onClick={toggleRecordMode}
            active={recordMode}
            colorAccent={recordMode ? 'red' : undefined}
            title={recordMode ? 'Disable record mode (Enter)' : 'Enable record mode - enter notes at playback position (Enter)'}
          >
            {recordMode ? '● Rec' : 'Rec'}
          </FT2Button>
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
            <FT2Button onClick={handleExpand} small title="Expand pattern (double rows)">
              Expand
            </FT2Button>
            <FT2Button onClick={handleShrink} small title="Shrink pattern (halve rows)">
              Shrink
            </FT2Button>
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
          <FT2Button
            onClick={() => setShowImportDialog(true)}
            small
            disabled={isLoading}
            title="Load song or module (Ctrl+O)"
          >
            {isLoading ? 'Loading...' : 'Load'}
          </FT2Button>

          {/* Demo Songs Dropdown */}
          <div ref={demoButtonRef}>
            <FT2Button
              onClick={() => setShowDemoMenu(!showDemoMenu)}
              small
              active={showDemoMenu}
              disabled={isLoading}
              title="Load example songs"
            >
              Demos ▾
            </FT2Button>
          </div>
          {showDemoMenu && (
            <div
              ref={demoMenuRef}
              className="fixed flex flex-col bg-dark-bgTertiary border border-dark-border rounded shadow-lg z-[9999] min-w-[220px] max-h-[300px] overflow-y-auto"
              style={{
                top: `${demoMenuPosition.top}px`,
                left: `${demoMenuPosition.left}px`,
              }}
            >
              {/* Acid Demos */}
              <div className="px-3 py-1 text-xs font-bold text-text-muted border-b border-dark-border">
                🎛️ Acid / 303
              </div>
              {DEMO_SONGS.acid.map((demo) => (
                <button
                  key={demo.file}
                  onClick={() => handleLoadDemo(demo.file)}
                  className="w-full text-left px-3 py-2 text-sm font-mono text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-colors"
                >
                  {demo.name}
                </button>
              ))}

              {/* TB-303 Pattern Demos */}
              <div className="px-3 py-1 text-xs font-bold text-text-muted border-b border-dark-border mt-2">
                🎹 TB-303 Patterns
              </div>
              {DEMO_SONGS.tb303.map((demo) => (
                <button
                  key={demo.file}
                  onClick={() => handleLoadDemo(demo.file)}
                  className="w-full text-left px-3 py-2 text-sm font-mono text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-colors"
                >
                  {demo.name}
                </button>
              ))}

              {/* General Demos */}
              <div className="px-3 py-1 text-xs font-bold text-text-muted border-b border-dark-border mt-2">
                🎵 General
              </div>
              {DEMO_SONGS.general.map((demo) => (
                <button
                  key={demo.file}
                  onClick={() => handleLoadDemo(demo.file)}
                  className="w-full text-left px-3 py-2 text-sm font-mono text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-colors"
                >
                  {demo.name}
                </button>
              ))}
            </div>
          )}

          <FT2Button onClick={handleSave} small title="Save to browser storage (Ctrl+S)">
            {isDirty ? 'Save*' : 'Save'}
          </FT2Button>
          <FT2Button onClick={handleSaveFile} small title="Download song file to computer">
            Download
          </FT2Button>
          <FT2Button onClick={onImport} small title="Import module dialog">
            Import
          </FT2Button>
          <FT2Button onClick={onShowPatterns} small active={showPatterns} title="Pattern list (Ctrl+Shift+P)">
            Patterns
          </FT2Button>
          <FT2Button onClick={onShowPatternOrder} small title="Pattern order editor">
            Order
          </FT2Button>
          <FT2Button onClick={onShowInstruments} small title="Instrument editor (Ctrl+I)">
            Instr
          </FT2Button>
          <FT2Button onClick={onShowInstrumentFX} small active={showInstrumentFX} title="Instrument effects (Ctrl+Shift+F)">
            Instrument FX
          </FT2Button>
          <FT2Button onClick={onShowExport} small title="Export dialog (Ctrl+Shift+E)">
            Export
          </FT2Button>
          <FT2Button onClick={onShowMasterFX} small active={showMasterFX} title="Master effects (Ctrl+M)">
            Master FX
          </FT2Button>
          <FT2Button onClick={onShowHelp} small title="Help & shortcuts (?)">
            Help
          </FT2Button>
          <FT2Button onClick={() => setShowSettings(true)} small title="Application settings">
            Settings
          </FT2Button>
          <FT2Button onClick={toggleMasterMute} small active={masterMuted} title="Toggle master mute (Ctrl+Shift+M)">
            {masterMuted ? 'Unmute' : 'Mute'}
          </FT2Button>
          <FT2Button
            onClick={() => setSmoothScrolling(!smoothScrolling)}
            small
            active={smoothScrolling}
            title={smoothScrolling ? 'Classic stepped scrolling' : 'Smooth DAW-style scrolling'}
          >
            {smoothScrolling ? 'Smooth' : 'Stepped'}
          </FT2Button>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* Import Module Dialog */}
      <ImportModuleDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={handleModuleImport}
      />
    </div>
  );
};
