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
import { useTrackerStore, useTransportStore, useProjectStore, useInstrumentStore, useAudioStore, useUIStore } from '@stores';
import { notify } from '@stores/useNotificationStore';
import { useProjectPersistence } from '@hooks/useProjectPersistence';
import { getToneEngine } from '@engine/ToneEngine';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { importSong } from '@lib/export/exporters';
import { loadModuleFile, isSupportedModule, getSupportedExtensions } from '@lib/import/ModuleLoader';
import { convertModule } from '@lib/import/ModuleConverter';
import { extractSamples, canExtractSamples } from '@lib/import/SampleExtractor';
import { encodeWav } from '@lib/import/WavEncoder';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_OSCILLATOR, DEFAULT_ENVELOPE, DEFAULT_FILTER } from '@typedefs/instrument';
import type { Pattern } from '@typedefs';

// Build accept string for file input
const ACCEPTED_FORMATS = ['.json', '.song.json', ...getSupportedExtensions()].join(',');

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
  onShowInstruments?: () => void;
  onImport?: () => void;
  showPatterns?: boolean;
  showMasterFX?: boolean;
}

export const FT2Toolbar: React.FC<FT2ToolbarProps> = ({
  onShowPatterns,
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowInstruments,
  onImport,
  showPatterns,
  showMasterFX,
}) => {
  const {
    patterns,
    currentPatternIndex,
    setCurrentPattern,
    duplicatePattern,
    deletePattern,
    expandPattern,
    shrinkPattern,
    loadPatterns,
  } = useTrackerStore();

  const {
    isPlaying,
    isLooping,
    bpm,
    setBPM,
    setIsLooping,
    play,
    stop,
    currentRow,
    smoothScrolling,
    setSmoothScrolling,
  } = useTransportStore();

  const { isDirty, setMetadata } = useProjectStore();
  const { save: saveProject } = useProjectPersistence();
  const { loadInstruments } = useInstrumentStore();
  const { masterMuted, toggleMasterMute } = useAudioStore();
  const { compactToolbar, toggleCompactToolbar } = useUIStore();

  const engine = getToneEngine();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDemoMenu, setShowDemoMenu] = useState(false);
  const demoMenuRef = useRef<HTMLDivElement>(null);

  // Demo songs available on the server
  const DEMO_SONGS = [
    { file: 'acid-banger.song.json', name: 'Acid Banger' },
    { file: 'phuture-acid-tracks.song.json', name: 'Phuture - Acid Tracks' },
    { file: 'hardfloor-funalogue.song.json', name: 'Hardfloor - Funalogue' },
    { file: 'josh-wink-higher-state.song.json', name: 'Josh Wink - Higher State' },
    { file: 'dittytoy-303.song.json', name: 'Dittytoy 303' },
    { file: 'new-order-confusion.song.json', name: 'New Order - Confusion' },
    { file: 'fatboy-slim-everyone-needs-303.song.json', name: 'Fatboy Slim - Everyone Needs a 303' },
    { file: 'fast-eddie-acid-thunder.song.json', name: 'Fast Eddie - Acid Thunder' },
    { file: 'dj-tim-misjah-access.song.json', name: 'DJ Tim & Misjah - Access' },
    { file: 'edge-of-motion-setup-707.song.json', name: 'Edge of Motion - 707 Setup' },
  ];

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
      const response = await fetch(`${basePath}songs/${filename}`);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

      const songData = await response.json();

      if (songData.patterns) loadPatterns(songData.patterns);
      if (songData.instruments) loadInstruments(songData.instruments);
      if (songData.metadata) setMetadata(songData.metadata);
      if (songData.bpm) setBPM(songData.bpm);

      console.log(`[Demo] Loaded: ${filename}`);
    } catch (error) {
      console.error('Failed to load demo:', error);
      alert(`Failed to load demo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

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

  // Save handler with feedback
  const handleSave = () => {
    const success = saveProject();
    if (success) {
      notify.success('Project saved to browser storage', 2000);
    } else {
      notify.error('Failed to save project');
    }
  };

  // File load handler (like NavBar)
  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // CRITICAL: Stop playback before loading new song to prevent audio glitches
    if (isPlaying) {
      stop();
      engine.releaseAll(); // Release any held notes
    }

    setIsLoading(true);
    try {
      if (isSupportedModule(file.name)) {
        const moduleInfo = await loadModuleFile(file);

        if (!moduleInfo.metadata.song) {
          alert(`Module "${moduleInfo.metadata.title}" loaded but no pattern data found.`);
          return;
        }

        const result = convertModule(moduleInfo.metadata.song);

        if (result.patterns.length === 0) {
          alert(`Module "${moduleInfo.metadata.title}" contains no patterns to import.`);
          return;
        }

        // Try to extract samples
        let sampleUrls: Map<number, string> | undefined;
        if (canExtractSamples(file.name)) {
          try {
            const extraction = await extractSamples(file);
            sampleUrls = new Map();
            for (let i = 0; i < extraction.samples.length; i++) {
              const sample = extraction.samples[i];
              if (sample.pcmData.length > 0) {
                const wavUrl = encodeWav(sample);
                sampleUrls.set(i + 1, wavUrl);
              }
            }
          } catch (err) {
            console.warn('[Import] Could not extract samples:', err);
          }
        }

        const instruments = createInstrumentsForModule(result.patterns, result.instrumentNames, sampleUrls);
        loadInstruments(instruments);
        loadPatterns(result.patterns);
        setMetadata({ name: moduleInfo.metadata.title, author: '', description: `Imported from ${file.name}` });
        setBPM(125);

        const samplerCount = instruments.filter(i => i.synthType === 'Sampler').length;
        if (samplerCount > 0) {
          await engine.preloadInstruments(instruments);
        }
      } else {
        // JSON song file
        const songData = await importSong(file);
        if (songData) {
          loadPatterns(songData.patterns);
          if (songData.instruments) loadInstruments(songData.instruments);
          if (songData.masterEffects) useAudioStore.getState().setMasterEffects(songData.masterEffects);
          setBPM(songData.bpm);
          setMetadata(songData.metadata);
        }
      }
    } catch (error) {
      console.error('Failed to load file:', error);
      alert(`Failed to load: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  return (
    <div className={`ft2-toolbar ${compactToolbar ? 'ft2-toolbar-compact' : ''}`}>
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
            value={currentPatternIndex}
            onChange={handlePositionChange}
            min={0}
            max={songLength - 1}
            format="hex"
          />
          <FT2Button onClick={handleInsertPosition} small title="Insert position">
            Ins
          </FT2Button>
          <FT2Button onClick={handleDeletePosition} small title="Delete position" disabled={songLength <= 1}>
            Del
          </FT2Button>
        </div>

        {/* Tempo Section */}
        <div className="ft2-section ft2-section-tempo">
          <FT2NumericInput
            label="BPM"
            value={bpm}
            onChange={setBPM}
            min={32}
            max={255}
            throttleMs={50}
          />
        </div>

        {/* Pattern Section */}
        <div className="ft2-section ft2-section-pattern">
          <FT2NumericInput
            label="Pattern"
            value={currentPatternIndex}
            onChange={handlePatternChange}
            min={0}
            max={songLength - 1}
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
            title={isPlayingSong ? 'Stop playback' : 'Play song from start'}
          >
            {isPlayingSong ? 'Stop' : 'Play Song'}
          </FT2Button>
          <FT2Button
            onClick={handlePlayPattern}
            active={isPlayingPattern}
            colorAccent={isPlayingPattern ? 'red' : 'green'}
            title={isPlayingPattern ? 'Stop playback' : 'Play/loop current pattern'}
          >
            {isPlayingPattern ? 'Stop' : 'Play Pattern'}
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

          {/* Speed Section */}
          <div className="ft2-section ft2-section-tempo">
            <FT2NumericInput
              label="Speed"
              value={6}
              onChange={() => {}}
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
              onChange={() => {}}
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
          {/* Song Length */}
          <div className="ft2-section ft2-section-pos">
            <FT2NumericInput
              label="Song Len"
              value={songLength}
              onChange={() => {}}
              min={1}
              max={256}
              format="hex"
            />
          </div>

          {/* Add Step */}
          <div className="ft2-section ft2-section-tempo">
            <FT2NumericInput
              label="Add"
              value={1}
              onChange={() => {}}
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

          {/* Row indicator */}
          <div className="ft2-section ft2-section-playback">
            <span className="ft2-row-display">
              Row: <span className="ft2-row-value">{currentRow.toString(16).toUpperCase().padStart(2, '0')}</span>
            </span>
          </div>
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
            onClick={() => fileInputRef.current?.click()}
            small
            disabled={isLoading}
            title="Load song or module (Ctrl+O)"
          >
            {isLoading ? 'Loading...' : 'Load'}
          </FT2Button>

          {/* Demo Songs Dropdown */}
          <div className="relative" ref={demoMenuRef}>
            <FT2Button
              onClick={() => setShowDemoMenu(!showDemoMenu)}
              small
              active={showDemoMenu}
              disabled={isLoading}
              title="Load example songs"
            >
              Demos ▾
            </FT2Button>
            {showDemoMenu && (
              <div className="absolute top-full left-0 mt-1 bg-dark-bgTertiary border border-dark-border rounded shadow-lg z-50 min-w-[220px] max-h-[300px] overflow-y-auto">
                {DEMO_SONGS.map((demo) => (
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
          </div>

          <FT2Button onClick={handleSave} small title="Save project (Ctrl+S)">
            {isDirty ? 'Save*' : 'Save'}
          </FT2Button>
          <FT2Button onClick={onImport} small title="Import module dialog">
            Import
          </FT2Button>
          <FT2Button onClick={onShowPatterns} small active={showPatterns} title="Pattern list">
            Patterns
          </FT2Button>
          <FT2Button onClick={onShowInstruments} small title="Instrument editor">
            Instr
          </FT2Button>
          <FT2Button onClick={onShowExport} small title="Export (Ctrl+Shift+E)">
            Export
          </FT2Button>
          <FT2Button onClick={onShowMasterFX} small active={showMasterFX} title="Master effects">
            Master FX
          </FT2Button>
          <FT2Button onClick={onShowHelp} small title="Help (?)">
            Help
          </FT2Button>
          <FT2Button onClick={toggleMasterMute} small active={masterMuted} title="Toggle master mute">
            {masterMuted ? 'Unmute' : 'Mute'}
          </FT2Button>
          <FT2Button
            onClick={() => setSmoothScrolling(!smoothScrolling)}
            small
            active={smoothScrolling}
            title={smoothScrolling ? 'Switch to stepped scrolling (classic tracker)' : 'Switch to smooth scrolling (DAW-style)'}
          >
            {smoothScrolling ? 'Smooth' : 'Stepped'}
          </FT2Button>
        </div>
      </div>
    </div>
  );
};
