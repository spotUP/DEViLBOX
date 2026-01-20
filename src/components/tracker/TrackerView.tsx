/**
 * TrackerView - Main tracker container with pattern editor and controls
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PatternEditor } from './PatternEditor';
import { GridSequencer } from '@components/grid/GridSequencer';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore } from '@stores';
import { useTrackerInput } from '@hooks/tracker/useTrackerInput';
import { usePatternPlayback } from '@hooks/audio/usePatternPlayback';
import { InterpolateDialog } from '@components/dialogs/InterpolateDialog';
import { HumanizeDialog } from '@components/dialogs/HumanizeDialog';
import { FindReplaceDialog } from '@components/dialogs/FindReplaceDialog';
import { ImportModuleDialog } from '@components/dialogs/ImportModuleDialog';
import { FT2Toolbar } from './FT2Toolbar';
import { TB303KnobPanel } from './TB303KnobPanel';
import { AdvancedEditPanel } from './AdvancedEditPanel';
import { MobileTrackerView } from './MobileTrackerView';
import { LiveModeToggle } from './LiveModeIndicator';
import { useResponsive } from '@hooks/useResponsive';
import { List, Grid3X3, Piano, Music2, Eye, EyeOff, Zap } from 'lucide-react';
import { InstrumentListPanel } from '@components/instruments/InstrumentListPanel';
import { PianoRoll } from '../pianoroll';
import type { ModuleInfo } from '@lib/import/ModuleLoader';
import { convertModule } from '@lib/import/ModuleConverter';
import { extractSamples, canExtractSamples } from '@lib/import/SampleExtractor';
import { encodeWav } from '@lib/import/WavEncoder';
import { getToneEngine } from '@engine/ToneEngine';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_OSCILLATOR, DEFAULT_ENVELOPE, DEFAULT_FILTER } from '@typedefs/instrument';
import type { Pattern } from '@typedefs';

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

  // Ensure instruments 0 and 1 exist as defaults
  for (const defaultId of [0, 1]) {
    if (!usedInstruments.has(defaultId)) {
      const sampleUrl = sampleUrls?.get(defaultId);
      if (sampleUrl) {
        instruments.push({
          id: defaultId,
          name: defaultId === 0 ? 'Default' : 'Sample 01',
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
  onShowInstruments?: () => void;
  onShowImportModule?: () => void;
  showMasterFX?: boolean;
  showImportModule?: boolean;
}

export const TrackerView: React.FC<TrackerViewProps> = ({
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowInstruments,
  onShowImportModule,
  showMasterFX,
  showImportModule: externalShowImportModule,
}) => {
  const { isMobile } = useResponsive();
  const { 
    patterns, currentPatternIndex, currentOctave, loadPatterns, 
    cursor, showGhostPatterns, setShowGhostPatterns,
    resizePattern, updateTimeSignature
  } = useTrackerStore();
  const { loadInstruments } = useInstrumentStore();
  const { setMetadata } = useProjectStore();
  const { setBPM } = useTransportStore();

  // View mode state
  type ViewMode = 'tracker' | 'grid' | 'pianoroll';
  const [viewMode, setViewMode] = useState<ViewMode>('tracker');
  const [gridChannelIndex, setGridChannelIndex] = useState(0);

  // Dialog state
  const [showInterpolate, setShowInterpolate] = useState(false);
  const [showHumanize, setShowHumanize] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [internalShowImportModule, setInternalShowImportModule] = useState(false);

  // Use external or internal import state
  const showImportModule = externalShowImportModule ?? internalShowImportModule;
  const setShowImportModule = onShowImportModule ?? setInternalShowImportModule;

  // Instrument panel state
  const [showInstrumentPanel, setShowInstrumentPanel] = useState(true);
  const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);

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

  // Enable keyboard input
  useTrackerInput();

  // Enable pattern playback
  usePatternPlayback();

  // Module import handler - used by both mobile and desktop views
  const handleModuleImport = useCallback(async (info: ModuleInfo) => {
    if (!info.metadata.song) {
      alert(`Module "${info.metadata.title}" loaded but no pattern data found.\n\nThe module metadata was extracted but pattern data is not available.`);
      return;
    }

    // Convert the module data to our pattern format
    const result = convertModule(info.metadata.song);

    if (result.patterns.length === 0) {
      alert(`Module "${info.metadata.title}" contains no patterns to import.`);
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

    alert(`Module "${info.metadata.title}" imported!\n\n` +
      `Patterns: ${result.patterns.length}\n` +
      `Channels: ${result.channelCount}\n` +
      `Instruments: ${instruments.length}\n` +
      `Samplers: ${samplerCount}`);
  }, [loadInstruments, loadPatterns, setMetadata, setBPM]);

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
        <ImportModuleDialog
          isOpen={showImportModule}
          onClose={() => setShowImportModule(false)}
          onImport={handleModuleImport}
        />
      </>
    );
  }

  // Desktop view
  return (
    <div className="flex-1 flex flex-col bg-dark-bg overflow-hidden">
      {/* Top Control Bar - Fixed position to prevent being pushed off-screen */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-dark-bgSecondary border-b border-dark-border relative z-10">
        <div className="flex items-center gap-6 flex-shrink min-w-0">
          {/* Pattern Info */}
          <div className="flex items-center gap-3">
            <LiveModeToggle />
            <div className="w-px h-4 bg-dark-border mx-1" />
            <span className="text-text-muted text-xs font-mono">PATTERN</span>
            <span className="text-accent-primary font-bold font-mono text-sm">
              {pattern?.name || 'Untitled'}
            </span>
          </div>

          {/* Separator */}
          <div className="w-px h-4 bg-dark-border" />

          {/* Quick Stats */}
          <div className="hidden lg:flex items-center gap-4 text-[10px] font-mono">
            <div className="flex items-center gap-1">
              <span className="text-text-muted uppercase font-bold">Len:</span>
              <input 
                type="number" min="1" max="256"
                value={pattern?.length || 64}
                onChange={(e) => resizePattern(currentPatternIndex, parseInt(e.target.value) || 1)}
                className="w-8 bg-dark-bgTertiary text-text-primary border border-dark-border px-1 focus:outline-none focus:border-accent-primary rounded"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-text-muted uppercase font-bold">Sig:</span>
              <div className="flex items-center bg-dark-bgTertiary border border-dark-border rounded px-1">
                <input 
                  type="number" min="1" max="32"
                  value={pattern?.timeSignature?.beatsPerMeasure || 4}
                  onChange={(e) => updateTimeSignature(currentPatternIndex, { beatsPerMeasure: parseInt(e.target.value) || 1 })}
                  className="w-5 bg-transparent text-accent-primary focus:outline-none text-center"
                />
                <span className="text-text-muted">/</span>
                <input 
                  type="number" min="1" max="32"
                  value={pattern?.timeSignature?.stepsPerBeat || 4}
                  onChange={(e) => updateTimeSignature(currentPatternIndex, { stepsPerBeat: parseInt(e.target.value) || 1 })}
                  className="w-5 bg-transparent text-accent-primary focus:outline-none text-center"
                />
              </div>
            </div>
            <span className="text-text-muted uppercase font-bold">
              Oct: <span className="text-accent-secondary">F{currentOctave}</span>
            </span>
          </div>
        </div>

        {/* View Mode Toggle + Channel Selector - Never shrink, always visible */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Channel Selector (grid view only) */}
          {viewMode === 'grid' && pattern && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">CH</span>
              <select
                value={gridChannelIndex}
                onChange={(e) => setGridChannelIndex(Number(e.target.value))}
                className="px-2 py-1 text-xs bg-dark-bgTertiary border border-dark-border rounded text-text-primary"
              >
                {pattern.channels.map((_, idx) => (
                  <option key={idx} value={idx}>
                    {(idx + 1).toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Separator */}
          {viewMode === 'grid' && <div className="w-px h-4 bg-dark-border" />}

          {/* View Toggle */}
          <div className="flex items-center bg-dark-bgTertiary rounded-md p-0.5">
            <button
              onClick={() => setViewMode('tracker')}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors
                ${viewMode === 'tracker'
                  ? 'bg-accent-primary text-text-inverse'
                  : 'text-text-secondary hover:text-text-primary'
                }
              `}
              title="Tracker View"
            >
              <List size={14} />
              <span className="hidden sm:inline">Tracker</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors
                ${viewMode === 'grid'
                  ? 'bg-accent-primary text-text-inverse'
                  : 'text-text-secondary hover:text-text-primary'
                }
              `}
              title="Grid View (303-style)"
            >
              <Grid3X3 size={14} />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              onClick={() => setViewMode('pianoroll')}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors
                ${viewMode === 'pianoroll'
                  ? 'bg-accent-primary text-text-inverse'
                  : 'text-text-secondary hover:text-text-primary'
                }
              `}
              title="Piano Roll View"
            >
              <Piano size={14} />
              <span className="hidden sm:inline">Piano</span>
            </button>
          </div>

          {/* Ghost Patterns Toggle (tracker view only) */}
          {viewMode === 'tracker' && (
            <>
              <div className="w-px h-4 bg-dark-border" />
              <button
                onClick={() => setShowGhostPatterns(!showGhostPatterns)}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors
                  ${showGhostPatterns
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'bg-dark-bgTertiary text-text-secondary hover:text-text-primary'
                  }
                `}
                title={showGhostPatterns ? "Hide ghost patterns" : "Show ghost patterns"}
              >
                {showGhostPatterns ? <Eye size={14} /> : <EyeOff size={14} />}
                <span className="hidden sm:inline">Ghosts</span>
              </button>
              <div className="w-px h-4 bg-dark-border" />
              <button
                onClick={() => setShowAdvancedEdit(!showAdvancedEdit)}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors
                  ${showAdvancedEdit
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'bg-dark-bgTertiary text-text-secondary hover:text-text-primary'
                  }
                `}
                title="Toggle Advanced Edit Panel"
              >
                <Zap size={14} />
                <span className="hidden sm:inline">Adv Edit</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* FT2 Style Toolbar */}
      <FT2Toolbar
        onShowExport={onShowExport}
        onShowHelp={onShowHelp}
        onShowMasterFX={onShowMasterFX}
        onShowInstruments={onShowInstruments}
        onImport={() => setShowImportModule(true)}
        showMasterFX={showMasterFX}
      />

      {/* TB-303 Live Knobs (includes Devil Fish controls) */}
      <TB303KnobPanel />

      {/* Main Content Area with Pattern Editor and Instrument Panel */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative z-10">
        {/* Pattern Editor / Grid Sequencer / Piano Roll - Takes remaining space */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {viewMode === 'tracker' ? (
            <PatternEditor />
          ) : viewMode === 'grid' ? (
            <GridSequencer channelIndex={gridChannelIndex} />
          ) : (
            <PianoRoll channelIndex={gridChannelIndex} />
          )}
        </div>

        {/* Advanced Edit Panel */}
        {showAdvancedEdit && (
          <AdvancedEditPanel />
        )}

        {/* Instrument Panel Toggle Button */}
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

        {/* Instrument List Panel */}
        {showInstrumentPanel && (
          <div className="flex-shrink-0 w-64 border-l border-ft2-border animate-fade-in h-full flex flex-col overflow-hidden">
            <InstrumentListPanel onEditInstrument={onShowInstruments} />
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts Help - Collapsible on mobile */}
      <div className="flex-shrink-0 hidden md:flex px-4 py-1.5 bg-dark-bgTertiary border-t border-dark-border text-[10px] text-text-muted font-mono items-center justify-center gap-4 flex-wrap">
        <span><kbd className="text-text-secondary">↑↓←→</kbd> Navigate</span>
        <span><kbd className="text-text-secondary">Tab</kbd> Next Ch</span>
        <span><kbd className="text-text-secondary">A-Z</kbd> Notes</span>
        <span><kbd className="text-text-secondary">Ctrl+↑↓</kbd> Transpose</span>
        <span><kbd className="text-text-secondary">Ctrl+I</kbd> Interpolate</span>
        <span><kbd className="text-text-secondary">Ctrl+F</kbd> Find</span>
        <span><kbd className="text-text-secondary">Del</kbd> Clear</span>
        <span><kbd className="text-text-secondary">Space</kbd> Edit Mode</span>
      </div>

      {/* Dialogs */}
      <InterpolateDialog isOpen={showInterpolate} onClose={() => setShowInterpolate(false)} />
      <HumanizeDialog isOpen={showHumanize} onClose={() => setShowHumanize(false)} />
      <FindReplaceDialog isOpen={showFindReplace} onClose={() => setShowFindReplace(false)} />
      <ImportModuleDialog
        isOpen={showImportModule}
        onClose={() => setShowImportModule(false)}
        onImport={handleModuleImport}
      />
    </div>
  );
};
