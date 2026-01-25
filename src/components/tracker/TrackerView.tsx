/**
 * TrackerView - Main tracker container with pattern editor and controls
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PatternEditorCanvas } from './PatternEditorCanvas';
import { GridSequencer } from '@components/grid/GridSequencer';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore } from '@stores';
import { useTrackerInput } from '@hooks/tracker/useTrackerInput';
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
import { AdvancedEditModal } from '@components/dialogs/AdvancedEditModal';
import { FT2Toolbar } from './FT2Toolbar';
import { TB303KnobPanel } from './TB303KnobPanel';
import { TB303View } from '@components/demo/TB303View';
import { MobileTrackerView } from './MobileTrackerView';
import { useResponsive } from '@hooks/useResponsive';
import { Music2, Eye, EyeOff, Zap, List, Grid3x3, Piano, Radio, Menu, Activity } from 'lucide-react';
import { InstrumentListPanel } from '@components/instruments/InstrumentListPanel';
import { PianoRoll } from '../pianoroll';
import { AutomationPanel } from '@components/automation/AutomationPanel';
import type { ModuleInfo } from '@lib/import/ModuleLoader';
import { convertModule, convertXMModule, convertMODModule } from '@lib/import/ModuleConverter';
import { convertToInstrument } from '@lib/import/InstrumentConverter';
import { extractSamples, canExtractSamples } from '@lib/import/SampleExtractor';
import { encodeWav } from '@lib/import/WavEncoder';
import { getToneEngine } from '@engine/ToneEngine';
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
  showMasterFX,
  showInstrumentFX,
  showImportModule: externalShowImportModule,
}) => {
  const { isMobile, width: windowWidth } = useResponsive();

  // PERFORMANCE OPTIMIZATION: Use individual selectors to prevent unnecessary re-renders
  const patterns = useTrackerStore((state) => state.patterns);
  const currentPatternIndex = useTrackerStore((state) => state.currentPatternIndex);
  const cursor = useTrackerStore((state) => state.cursor);
  const showGhostPatterns = useTrackerStore((state) => state.showGhostPatterns);

  // Get actions (these don't cause re-renders)
  const loadPatterns = useTrackerStore((state) => state.loadPatterns);
  const setPatternOrder = useTrackerStore((state) => state.setPatternOrder);
  const setOriginalModuleData = useTrackerStore((state) => state.setOriginalModuleData);
  const setShowGhostPatterns = useTrackerStore((state) => state.setShowGhostPatterns);
  const scaleVolume = useTrackerStore((state) => state.scaleVolume);
  const fadeVolume = useTrackerStore((state) => state.fadeVolume);
  const remapInstrument = useTrackerStore((state) => state.remapInstrument);

  const loadInstruments = useInstrumentStore((state) => state.loadInstruments);
  const setMetadata = useProjectStore((state) => state.setMetadata);
  const setBPM = useTransportStore((state) => state.setBPM);

  // View mode state
  type ViewMode = 'tracker' | 'grid' | 'pianoroll' | 'tb303';
  const [viewMode, setViewMode] = useState<ViewMode>('tracker');
  const [gridChannelIndex, setGridChannelIndex] = useState(0);

  // Dialog state
  const [showInterpolate, setShowInterpolate] = useState(false);
  const [showHumanize, setShowHumanize] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
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
  const handleModuleImport = useCallback(async (info: ModuleInfo, options: ImportOptions) => {
    const { useLibopenmpt } = options;

    // Check if native parser data is available (XM/MOD)
    if (info.nativeData) {
      const { format, importMetadata, instruments: parsedInstruments, patterns } = info.nativeData;

      console.log(`[Import] Using native ${format} parser`);
      console.log(`[Import] ${parsedInstruments.length} instruments, ${patterns.length} patterns`);
      console.log(`[Import] libopenmpt playback mode: ${useLibopenmpt ? 'enabled' : 'disabled'}`);

      // Convert patterns using native converter
      // Pass original buffer for libopenmpt playback if enabled
      const result = format === 'XM'
        ? convertXMModule(
            patterns,
            importMetadata.originalChannelCount,
            importMetadata,
            parsedInstruments.map(i => i.name),
            useLibopenmpt ? info.arrayBuffer : undefined
          )
        : convertMODModule(
            patterns,
            importMetadata.originalChannelCount,
            importMetadata,
            parsedInstruments.map(i => i.name),
            useLibopenmpt ? info.arrayBuffer : undefined
          );

      if (result.patterns.length === 0) {
        alert(`Module "${info.metadata.title}" contains no patterns to import.`);
        return;
      }

      // Convert instruments using native converter
      // Preserve original instrument IDs from MOD/XM (already 1-indexed)
      const instruments: InstrumentConfig[] = [];
      for (let i = 0; i < parsedInstruments.length; i++) {
        // Use the original instrument ID from the parsed data (already correct: 1-31 for MOD, 1-128 for XM)
        const converted = convertToInstrument(parsedInstruments[i], parsedInstruments[i].id, format);
        instruments.push(...converted);
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

      const libopenmptNote = result.originalModuleData
        ? `\n\n🎵 libopenmpt playback available - sample-accurate effects!`
        : '';

      alert(`Module "${info.metadata.title}" imported!\n\n` +
        `Format: ${format}\n` +
        `Patterns: ${result.patterns.length}\n` +
        `Channels: ${importMetadata.originalChannelCount}\n` +
        `Instruments: ${instruments.length}\n` +
        `Samplers: ${samplerCount}\n\n` +
        `✨ Native parser used - full sample extraction and FT2 effects preserved!${libopenmptNote}`);

      return;
    }

    // Fallback to libopenmpt path for other formats (IT, S3M, etc.)
    if (!info.metadata.song) {
      alert(`Module "${info.metadata.title}" loaded but no pattern data found.\n\nThe module metadata was extracted but pattern data is not available.`);
      return;
    }

    console.log('[Import] Using libopenmpt fallback');

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

    alert(`Module "${info.metadata.title}" imported!\n\n` +
      `Patterns: ${result.patterns.length}\n` +
      `Channels: ${result.channelCount}\n` +
      `Instruments: ${instruments.length}\n` +
      `Samplers: ${samplerCount}`);
  }, [loadInstruments, loadPatterns, setMetadata, setBPM, setPatternOrder, setOriginalModuleData]);

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
        <ImportModuleDialog
          isOpen={showImportModule}
          onClose={() => setShowImportModule(false)}
          onImport={handleModuleImport}
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
      {/* Top Control Bar - Simple pattern info */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-dark-bgSecondary border-b border-dark-border relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-accent-primary font-bold font-mono text-xs whitespace-nowrap">
            {pattern?.name || 'Untitled'}
          </span>
        </div>
      </div>

      {/* FT2 Style Toolbar */}
      <div className="flex-shrink-0">
        <FT2Toolbar
          onShowExport={onShowExport}
          onShowHelp={onShowHelp}
          onShowMasterFX={onShowMasterFX}
          onShowInstrumentFX={onShowInstrumentFX}
          onShowInstruments={onShowInstruments}
          onShowPatternOrder={() => setShowPatternOrder(true)}
          showMasterFX={showMasterFX}
          showInstrumentFX={showInstrumentFX}
        />
      </div>

      {/* TB-303 Live Knobs (compact view when not in TB-303 editor mode) */}
      {viewMode !== 'tb303' && (
        <div className="flex-shrink-0 max-h-[120px] overflow-y-auto">
          <TB303KnobPanel />
        </div>
      )}

      {/* Editor Controls Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-dark-bgTertiary border-b border-dark-border">
        <div className="flex items-center gap-3">
          {/* Menu icon */}
          <Menu size={16} className="text-text-muted" />

          {/* View Mode Dropdown */}
          <div className="flex items-center gap-1.5">
            {viewMode === 'tracker' && <List size={16} className="text-text-secondary" />}
            {viewMode === 'grid' && <Grid3x3 size={16} className="text-text-secondary" />}
            {viewMode === 'pianoroll' && <Piano size={16} className="text-text-secondary" />}
            {viewMode === 'tb303' && <Radio size={16} className="text-text-secondary" />}
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              className="px-3 py-1.5 text-sm bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors"
              title="Select editor view"
            >
              <option value="tracker">Tracker</option>
              <option value="grid">Grid</option>
              <option value="pianoroll">Piano Roll</option>
              <option value="tb303">TB-303</option>
            </select>
          </div>

          {/* Channel Selector (grid and piano roll views) */}
          {(viewMode === 'grid' || viewMode === 'pianoroll') && pattern && (
            <>
              <span className="text-text-secondary text-xs font-medium">CH:</span>
              <select
                value={gridChannelIndex}
                onChange={(e) => setGridChannelIndex(Number(e.target.value))}
                className="px-3 py-1.5 text-sm bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors"
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
                flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors
                ${showGhostPatterns
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
                }
              `}
              title={showGhostPatterns ? "Hide ghost patterns" : "Show ghost patterns"}
            >
              {showGhostPatterns ? <Eye size={16} /> : <EyeOff size={16} />}
              <span>Ghosts</span>
            </button>
          )}

          {/* Advanced Edit Toggle (tracker view only) */}
          {viewMode === 'tracker' && (
            <button
              onClick={() => setShowAdvancedEdit(!showAdvancedEdit)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors
                ${showAdvancedEdit
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
                }
              `}
              title="Toggle Advanced Edit Panel"
            >
              <Zap size={16} />
              <span>Adv Edit</span>
            </button>
          )}

          {/* Automation Editor Toggle (tracker view only) */}
          {viewMode === 'tracker' && (
            <button
              onClick={() => setShowAutomation(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors bg-dark-bgSecondary text-text-secondary hover:text-text-primary"
              title="Open Automation Editor"
            >
              <Activity size={16} />
              <span>Automation</span>
            </button>
          )}
        </div>

        {/* FPS / Quality Indicator */}
        <div
          className={`
            flex items-center gap-1.5 px-3 py-1.5 text-sm rounded font-mono
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
          <span className="text-xs opacity-70">FPS</span>
          <div className={`w-2 h-2 rounded-full ${
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
            <PatternEditorCanvas onAcidGenerator={handleAcidGenerator} />
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
          <div className="flex-shrink-0 w-64 border-l border-ft2-border flex flex-col overflow-hidden animate-fade-in">
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
