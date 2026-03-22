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
import * as Tone from 'tone';
import { Button } from '@components/ui/Button';
import { FT2NumericInput } from './FT2NumericInput';
import { useTrackerStore, useTransportStore, useProjectStore, useInstrumentStore, useAudioStore, useUIStore, useAutomationStore, useEditorStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { notify } from '@stores/useNotificationStore';
import { useTapTempo } from '@hooks/useTapTempo';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getTrackerScratchController } from '@engine/TrackerScratchController';
import { Maximize2, Minimize2, MousePointerClick, ExternalLink } from 'lucide-react';
import { focusPopout } from '@components/ui/PopOutWindow';
import { VisualizerFrame } from '@components/visualization/VisualizerFrame';
import { Oscilloscope } from '@components/visualization/Oscilloscope';
import { ChannelLevelsCompact } from '@components/visualization/ChannelLevelsCompact';
import { LogoAnimation } from '@components/visualization/LogoAnimation';
import { CustomBanner } from '@components/visualization/CustomBanner';
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
import { AudioMotionVisualizer } from '@components/visualization/AudioMotionVisualizer';
import { JingleVisualizer } from '@components/visualization/JingleVisualizer';
import { SettingsModal } from '@components/dialogs/SettingsModal';

import { ImportModuleDialog, type ImportOptions } from '@components/dialogs/ImportModuleDialog';
import { FileBrowser } from '@components/dialogs/FileBrowser';
import { importSong, exportSong, getOriginalModuleDataForExport } from '@lib/export/exporters';
import { isSupportedModule, getSupportedExtensions, type ModuleInfo } from '@lib/import/ModuleLoader';
import { useModuleImport } from '@hooks/tracker/useModuleImport';
import { importMIDIFile, isMIDIFile, getSupportedMIDIExtensions } from '@lib/import/MIDIImporter';
import { clearSavedProject, clearExplicitlySaved, saveProjectToStorage } from '@hooks/useProjectPersistence';
import { useHistoryStore } from '@stores/useHistoryStore';
import { parseDb303Pattern, exportCurrentPatternToDb303 } from '@lib/import/Db303PatternConverter';
import { getASIDDeviceManager } from '@lib/sid/ASIDDeviceManager';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useAIStore } from '@stores/useAIStore';
import type { TB303Config } from '@typedefs/instrument';
import type { Pattern } from '@typedefs';

import { CURRENT_VERSION } from '@generated/changelog';

// Build accept string for file input
const ACCEPTED_FORMATS = ['.json', '.dbx', '.xml', ...getSupportedExtensions(), ...getSupportedMIDIExtensions()].join(',');

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

export const FT2Toolbar: React.FC<FT2ToolbarProps> = React.memo(({
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowInstruments,
  onShowPatternOrder,
  onShowDrumpads,
  showMasterFX,
}) => {
  const {
    patterns,
    currentPatternIndex,
    setCurrentPattern,
    resizePattern,
    loadPatterns,
    setPatternOrder,
    patternOrder,
    currentPositionIndex,
    setCurrentPosition,
    reset: resetTracker,
    duplicatePosition,
    removeFromOrder,
    replacePattern,
  } = useTrackerStore(useShallow((s) => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
    setCurrentPattern: s.setCurrentPattern,
    resizePattern: s.resizePattern,
    loadPatterns: s.loadPatterns,
    setPatternOrder: s.setPatternOrder,
    patternOrder: s.patternOrder,
    currentPositionIndex: s.currentPositionIndex,
    setCurrentPosition: s.setCurrentPosition,
    reset: s.reset,
    duplicatePosition: s.duplicatePosition,
    removeFromOrder: s.removeFromOrder,
    replacePattern: s.replacePattern,
  })));

  const { undo, redo, canUndo, canRedo } = useHistoryStore(useShallow((s) => ({
    undo: s.undo, redo: s.redo, canUndo: s.canUndo, canRedo: s.canRedo,
  })));

  const handleUndo = useCallback(() => {
    if (!canUndo()) return;
    const pattern = undo();
    if (pattern) replacePattern(currentPatternIndex, pattern);
  }, [undo, canUndo, replacePattern, currentPatternIndex]);

  const handleRedo = useCallback(() => {
    if (!canRedo()) return;
    const pattern = redo();
    if (pattern) replacePattern(currentPatternIndex, pattern);
  }, [redo, canRedo, replacePattern, currentPatternIndex]);

  const {
    editStep,
    setEditStep,
  } = useEditorStore(useShallow((s) => ({
    editStep: s.editStep,
    setEditStep: s.setEditStep,
  })));

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
    reset: resetTransport,
  } = useTransportStore(useShallow((s) => ({
    isPlaying: s.isPlaying,
    isLooping: s.isLooping,
    bpm: s.bpm,
    setBPM: s.setBPM,
    speed: s.speed,
    setSpeed: s.setSpeed,
    setIsLooping: s.setIsLooping,
    play: s.play,
    stop: s.stop,
    setCurrentRow: s.setCurrentRow,
    grooveTemplateId: s.grooveTemplateId,
    setGrooveTemplate: s.setGrooveTemplate,
    reset: s.reset,
  })));

  const { isDirty, setMetadata, metadata } = useProjectStore(useShallow((s) => ({
    isDirty: s.isDirty,
    setMetadata: s.setMetadata,
    metadata: s.metadata,
  })));
  const { instruments, loadInstruments, updateInstrument, addInstrument, reset: resetInstruments } = useInstrumentStore(useShallow((s) => ({
    instruments: s.instruments,
    loadInstruments: s.loadInstruments,
    updateInstrument: s.updateInstrument,
    addInstrument: s.addInstrument,
    reset: s.reset,
  })));
  const { masterEffects } = useAudioStore(useShallow((s) => ({
    masterEffects: s.masterEffects,
  })));
  const { oscilloscopeVisible, modalOpen, jingleActive } = useUIStore(useShallow((s) => ({
    oscilloscopeVisible: s.oscilloscopeVisible,
    jingleActive: s.jingleActive,
    modalOpen: s.modalOpen,
  })));
  const { curves, reset: resetAutomation } = useAutomationStore(useShallow((s) => ({
    curves: s.curves,
    reset: s.reset,
  })));


  const { handleModuleImport: importModule } = useModuleImport();

  const engine = getToneEngine();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingCompanions, setPendingCompanions] = useState<File[]>([]);
  type VizMode = 'waveform' | 'spectrum' | 'channels' | 'logo' | 'customBanner' | 'circular' | 'bars' | 'particles' | 'chanWaves' | 'chanActivity' | 'chanSpectrum' | 'chanCircular' | 'chanParticles' | 'chanRings' | 'chanTunnel' | 'chanRadar' | 'chanNibbles' | 'sineScroll' | 'amLED' | 'amBars' | 'amMirror' | 'amRadial' | 'amGraph' | 'amRadialGraph' | 'amDualStereo' | 'amLumi' | 'amAlpha' | 'amOutline' | 'amDualV' | 'amDualOverlay' | 'amBark' | 'amMel' | 'amOctave' | 'amNotes' | 'amMirrorReflex' | 'amRadialInvert' | 'amRadialLED' | 'amLinear' | 'amAWeight' | 'amLumiMirror';
  const [vizMode, setVizMode] = useState<VizMode>('logo');

  // Tap Tempo
  const { tap: handleTapTempo, tapCount, isActive: tapActive } = useTapTempo(setBPM);

  // ASID hardware toggle
  const asidEnabled = useSettingsStore((s) => s.asidEnabled);
  const [asidReady, setAsidReady] = useState(false);

  const handleToggleASID = useCallback(async () => {
    const settings = useSettingsStore.getState();
    if (settings.asidEnabled) {
      settings.setAsidEnabled(false);
      setAsidReady(false);
      notify.info('ASID hardware output disabled');
    } else {
      try {
        const mgr = getASIDDeviceManager();
        await mgr.init();
        const devices = mgr.getDevices();
        if (devices.length === 0) {
          notify.warning('No ASID devices found. Connect USB-SID-Pico and retry.');
          return;
        }
        if (!settings.asidDeviceId && devices.length > 0) {
          settings.setAsidDeviceId(devices[0].id);
          mgr.selectDevice(devices[0].id);
        }
        settings.setAsidEnabled(true);
        setAsidReady(mgr.isDeviceReady());
        notify.success(`ASID enabled: ${devices[0]?.name || 'device'}`);
      } catch (err) {
        notify.error(`ASID init failed: ${err}`);
      }
    }
  }, []);
  
  const [showFxPresetsMenu, setShowFxPresetsMenu] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const aiOpen = useAIStore((s) => s.isOpen);
  const toggleAI = useAIStore((s) => s.toggle);

  // PERF: Memoize logo animation complete callback to prevent re-renders
  const handleLogoAnimationComplete = useCallback(() => {
    // Show custom banner after logo if one is set, otherwise cycle to next visualizer
    const hasBanner = useSettingsStore.getState().customBannerImage;
    if (hasBanner) {
      setVizMode('customBanner');
    } else {
      setVizMode('circular');
    }
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

  const handleSave = async () => {
    try {
      const saved = await saveProjectToStorage({ explicit: true });
      if (saved) {
        notify.success('Project saved!', 2000);
      } else {
        notify.error('Failed to save project');
      }
    } catch (error) {
      console.error('Failed to save project:', error);
      notify.error('Failed to save project');
    }
  };

  const handleDownload = () => {
    try {
      const { patternOrder } = useTrackerStore.getState();
      const sequence = patternOrder.map(idx => patterns[idx]?.id).filter(Boolean);
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
      const { speed } = useTransportStore.getState();
      const { linearPeriods } = useEditorStore.getState();
      const trackerFormat = patterns[0]?.importMetadata?.sourceFormat as string | undefined;
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
        grooveTemplateId,
        { speed, trackerFormat, linearPeriods },
        patternOrder,
        getOriginalModuleDataForExport(),
      );
      notify.success('Song downloaded!', 2000);
    } catch (error) {
      console.error('Failed to download file:', error);
      notify.error('Failed to download file');
    }
  };

  const handleModuleImport = async (moduleInfo: ModuleInfo, options: ImportOptions = { useLibopenmpt: true }) => {
    setIsLoading(true);
    try {
      await importModule(moduleInfo, options);
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
      setPendingFile(file);
      setShowImportDialog(true);
      return;
    }
    // Loading an external file — prevent auto-save from overwriting user's saved project
    clearExplicitlySaved();
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
        resetAutomation();
        resetTransport();
        resetInstruments();
        engine.disposeAllInstruments();
        loadPatterns(midiResult.patterns);
        if (midiResult.instruments.length > 0) {
          loadInstruments(midiResult.instruments);
        }
        setPatternOrder(midiResult.patterns.map((_, i) => i));
        setCurrentPattern(0);
        setMetadata({
          name: midiResult.metadata.name,
          author: '',
          description: `Imported from ${file.name} (${midiResult.metadata.tracks} tracks)`,
        });
        setBPM(midiResult.bpm);
        notify.success(
          `Imported: ${midiResult.metadata.name} — ${midiResult.instruments.length} instrument(s), BPM: ${midiResult.bpm}`
        );
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

  const handleFolderLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;
    const mainFile = files.find(f => isSupportedModule(f.name));
    if (!mainFile) return;
    const companions = files.filter(f => f !== mainFile);
    setPendingCompanions(companions);
    setPendingFile(mainFile);
    setShowImportDialog(true);
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
    // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
    // before any async work (engine.init fetches WASM). Fire-and-forget is fine.
    Tone.start();

    // Toggle: if already playing, stop only. If not playing, start from beginning.
    // This allows the "Stop Song" button to actually stop instead of always restarting.
    if (isPlaying) {
      getTrackerReplayer().stop();
      stop();
      engine.releaseAll();
      return;
    }
    setIsLooping(false);
    setCurrentRow(0); // Always start from first row of current pattern
    await engine.init();
    await play();
  };

  const handlePlayPattern = async () => {
    // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
    Tone.start();
    
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

  const handleLengthChange = (newLength: number) => {
    if (newLength >= 1 && newLength <= 256) resizePattern(currentPatternIndex, newLength);
  };

  return (
    <div className="ft2-toolbar">
      <div className="flex flex-1 min-w-0 overflow-hidden justify-between">
        <div className="flex-shrink min-w-0">
          <div className="ft2-toolbar-row">
            <div className="ft2-section ft2-col-1">
              <FT2NumericInput label="Position" value={currentPositionIndex} onChange={handlePositionChange} min={0} max={patternOrder.length - 1} />
              <div className="flex gap-1 ml-auto">
                <Button
                  variant={tapActive ? 'primary' : 'default'}
                  size="sm"
                  onClick={handleTapTempo}
                  title={`Tap Tempo (${tapCount} taps)`}
                  className="min-w-[32px]"
                >
                  <MousePointerClick size={14} />
                </Button>
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
            </div>
            <div className="ft2-section ft2-col-3">
              <FT2NumericInput label="Pattern" value={patternOrder[currentPositionIndex] ?? currentPatternIndex} onChange={handlePatternChange} min={0} max={patterns.length - 1} />
            </div>
            <div className="ft2-section ft2-col-4">
              <FT2NumericInput label="Edit Step" value={editStep} onChange={setEditStep} min={0} max={16} />
            </div>
            <div className="ft2-section ft2-section-playback">
              <Button variant={isPlayingSong ? 'danger' : 'primary'} size="sm"
                onClick={(e) => { if (isPlayingSong && e.shiftKey) { e.preventDefault(); getTrackerScratchController().triggerPowerCut(); } else { handlePlaySong(); } }}
                onContextMenu={(e) => {
                  if (isPlayingSong) { e.preventDefault(); getTrackerScratchController().triggerPowerCut(); }
                }}
                title={isPlayingSong ? 'Click: Stop · Shift+click/Right-click: Power off' : 'Play Song'}
                className="min-w-[72px]">{isPlayingSong ? 'Stop Song' : 'Play Song'}</Button>
              <Button variant={isPlayingPattern ? 'danger' : 'primary'} size="sm"
                onClick={(e) => { if (isPlayingPattern && e.shiftKey) { e.preventDefault(); getTrackerScratchController().triggerPowerCut(); } else { handlePlayPattern(); } }}
                onContextMenu={(e) => {
                  if (isPlayingPattern) { e.preventDefault(); getTrackerScratchController().triggerPowerCut(); }
                }}
                title={isPlayingPattern ? 'Click: Stop · Shift+click/Right-click: Power off' : 'Play Pattern'}
                className="min-w-[88px]">{isPlayingPattern ? 'Stop Pattern' : 'Play Pattern'}</Button>
              <Button
                variant={asidEnabled ? 'primary' : 'default'}
                size="sm"
                onClick={handleToggleASID}
                title={asidEnabled ? `ASID active${asidReady ? '' : ' (no device)'}` : 'Enable ASID hardware SID output'}
                className={`min-w-[44px] ${asidEnabled ? 'text-green-400 border-green-500/50' : 'text-text-muted'}`}
              >
                {asidEnabled ? '🔊 HW' : '🔇 HW'}
              </Button>
            </div>
          </div>

          <div className="ft2-toolbar-row">
              <div className="ft2-section ft2-col-1">
                <FT2NumericInput label="Song Len" value={songLength} onChange={handleSongLengthChange} min={1} max={256} />
              </div>
              <div className="ft2-section ft2-col-2">
                <FT2NumericInput label="Speed" value={speed} onChange={setSpeed} min={1} max={31} />
              </div>
              <div className="ft2-section ft2-col-3">
                <FT2NumericInput
                  label="Length"
                  value={patternLength}
                  onChange={handleLengthChange}
                  min={1}
                  max={256}
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
              <div className="ft2-section ft2-col-4">
                <FT2NumericInput label="Song Len" value={songLength} onChange={handleSongLengthChange} min={1} max={256} />
              </div>
            </div>
        </div>

        <VisualizerFrame variant="compact" className="min-w-[120px] max-w-[350px] flex-shrink-0 border-l border-dark-border cursor-pointer group ml-auto" style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}>
        <div className="relative w-full h-full flex items-center justify-center" onClick={() => {
          const modes: Array<VizMode> = ['waveform', 'spectrum', 'channels', 'logo', 'customBanner', 'circular', 'bars', 'particles', 'chanWaves', 'chanActivity', 'chanSpectrum', 'chanCircular', 'chanParticles', 'chanRings', 'chanTunnel', 'chanRadar', 'chanNibbles', 'sineScroll', 'amLED', 'amBars', 'amMirror', 'amRadial', 'amGraph', 'amRadialGraph', 'amDualStereo', 'amLumi', 'amAlpha', 'amOutline', 'amDualV', 'amDualOverlay', 'amBark', 'amMel', 'amOctave', 'amNotes', 'amMirrorReflex', 'amRadialInvert', 'amRadialLED', 'amLinear', 'amAWeight', 'amLumiMirror'];
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
            className="absolute top-1 right-1 p-0.5 rounded text-text-muted/0 group-hover:text-text-muted hover:!text-accent-highlight transition-all z-10"
            title="Pop out visualizer"
          >
            <ExternalLink size={12} />
          </button>
          {/* Version Number */}
          <div className="absolute bottom-1 right-2 text-[9px] font-mono text-text-muted opacity-40 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            v{CURRENT_VERSION}
          </div>

          {/* Jingle overlay — covers whatever viz is active during startup jingle */}
          {jingleActive && (
            <div className="absolute inset-0 z-20">
              <JingleVisualizer height={100} />
            </div>
          )}

          {oscilloscopeVisible && (
            <>
              {(vizMode === 'waveform' || vizMode === 'spectrum') && <Oscilloscope width="auto" height={100} mode={vizMode} />}
              {vizMode === 'channels' && <ChannelLevelsCompact height={100} />}
              {vizMode === 'logo' && <LogoAnimation height={100} onComplete={handleLogoAnimationComplete} />}
              {vizMode === 'customBanner' && <CustomBanner height={100} onComplete={() => setVizMode('circular')} />}
              {vizMode === 'circular' && <CircularVU height={100} />}
              {vizMode === 'bars' && <FrequencyBars height={100} />}
              {vizMode === 'particles' && <ParticleField height={100} />}
              {vizMode === 'chanWaves' && <ChannelWaveforms height={100} />}
              {vizMode === 'chanActivity' && <ChannelActivityGrid height={100} />}
              {vizMode === 'chanSpectrum' && <ChannelSpectrums height={100} />}
              {vizMode === 'chanCircular' && <ChannelCircularVU height={100} />}
              {vizMode === 'chanParticles' && <ChannelParticles height={100} />}
              {vizMode === 'chanRings' && <ChannelRings height={100} />}
              {vizMode === 'chanTunnel' && <ChannelTunnel height={100} />}
              {vizMode === 'chanRadar' && <ChannelRadar height={100} />}
              {vizMode === 'chanNibbles' && (
                <NibblesGame 
                  height={100} 
                  onExit={() => {
                    const modes: Array<VizMode> = ['waveform', 'spectrum', 'channels', 'logo', 'customBanner', 'circular', 'bars', 'particles', 'chanWaves', 'chanActivity', 'chanSpectrum', 'chanCircular', 'chanParticles', 'chanRings', 'chanTunnel', 'chanRadar', 'chanNibbles', 'sineScroll', 'amLED', 'amBars', 'amMirror', 'amRadial', 'amGraph', 'amRadialGraph', 'amDualStereo', 'amLumi', 'amAlpha', 'amOutline', 'amDualV', 'amDualOverlay', 'amBark', 'amMel', 'amOctave', 'amNotes', 'amMirrorReflex', 'amRadialInvert', 'amRadialLED', 'amLinear', 'amAWeight', 'amLumiMirror'];
                    const currentIndex = modes.indexOf('chanNibbles');
                    const nextIndex = (currentIndex + 1) % modes.length;
                    setVizMode(modes[nextIndex]);
                  }}
                />
              )}
              {vizMode === 'sineScroll' && <SineScroller height={100} />}
              {vizMode === 'amLED' && <AudioMotionVisualizer preset="ledBars" audioSource="master" height={100} />}
              {vizMode === 'amBars' && <AudioMotionVisualizer preset="smoothBars" audioSource="master" height={100} />}
              {vizMode === 'amMirror' && <AudioMotionVisualizer preset="mirrorBars" audioSource="master" height={100} />}
              {vizMode === 'amRadial' && <AudioMotionVisualizer preset="radialSpectrum" audioSource="master" height={100} />}
              {vizMode === 'amGraph' && <AudioMotionVisualizer preset="graphLine" audioSource="master" height={100} />}
              {vizMode === 'amRadialGraph' && <AudioMotionVisualizer preset="radialGraph" audioSource="master" height={100} />}
              {vizMode === 'amDualStereo' && <AudioMotionVisualizer preset="dualStereo" audioSource="master" height={100} />}
              {vizMode === 'amLumi' && <AudioMotionVisualizer preset="lumiBars" audioSource="master" height={100} />}
              {vizMode === 'amAlpha' && <AudioMotionVisualizer preset="alphaBars" audioSource="master" height={100} />}
              {vizMode === 'amOutline' && <AudioMotionVisualizer preset="outlineBars" audioSource="master" height={100} />}
              {vizMode === 'amDualV' && <AudioMotionVisualizer preset="dualVertical" audioSource="master" height={100} />}
              {vizMode === 'amDualOverlay' && <AudioMotionVisualizer preset="dualOverlay" audioSource="master" height={100} />}
              {vizMode === 'amBark' && <AudioMotionVisualizer preset="barkSpectrum" audioSource="master" height={100} />}
              {vizMode === 'amMel' && <AudioMotionVisualizer preset="melGraph" audioSource="master" height={100} />}
              {vizMode === 'amOctave' && <AudioMotionVisualizer preset="octaveBands" audioSource="master" height={100} />}
              {vizMode === 'amNotes' && <AudioMotionVisualizer preset="noteLabels" audioSource="master" height={100} />}
              {vizMode === 'amMirrorReflex' && <AudioMotionVisualizer preset="mirrorReflex" audioSource="master" height={100} />}
              {vizMode === 'amRadialInvert' && <AudioMotionVisualizer preset="radialInvert" audioSource="master" height={100} />}
              {vizMode === 'amRadialLED' && <AudioMotionVisualizer preset="radialLED" audioSource="master" height={100} />}
              {vizMode === 'amLinear' && <AudioMotionVisualizer preset="linearBars" audioSource="master" height={100} />}
              {vizMode === 'amAWeight' && <AudioMotionVisualizer preset="aWeighted" audioSource="master" height={100} />}
              {vizMode === 'amLumiMirror' && <AudioMotionVisualizer preset="lumiMirror" audioSource="master" height={100} />}
            </>
          )}
        </div>
        </VisualizerFrame>
      </div>

      <div className="flex items-center gap-1.5 py-1 w-full overflow-x-auto no-scrollbar">
        <input ref={fileInputRef} type="file" accept={ACCEPTED_FORMATS} onChange={handleFileLoad} className="hidden" />
        <input
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
          onChange={handleFolderLoad}
          className="hidden"
        />
        <Button variant="ghost" size="sm" onClick={() => setShowFileBrowser(true)} disabled={isLoading} loading={isLoading}>Load</Button>
        <Button variant="ghost" size="sm" onClick={handleSave}>{isDirty ? 'Save*' : 'Save'}</Button>
        <Button variant="ghost" size="sm" onClick={handleUndo} disabled={!canUndo()} title="Undo (Ctrl+Z)">Undo</Button>
        <Button variant="ghost" size="sm" onClick={handleRedo} disabled={!canRedo()} title="Redo (Ctrl+Shift+Z)">Redo</Button>
        <Button variant="ghost" size="sm" onClick={() => useUIStore.getState().openModal('revisions')}>Revisions</Button>
        <Button variant="ghost" size="sm" onClick={handleDownload} title="Download as .dbx file">Download</Button>
        <Button variant="ghost" size="sm" onClick={onShowExport} title="Export (Ctrl+Shift+E)">Export</Button>
        <Button variant="ghost" size="sm" onClick={() => useUIStore.getState().openNewSongWizard()} title="New song">New</Button>
        <Button variant="ghost" size="sm" onClick={() => setShowClearModal(true)} title="Clear all patterns">Clear</Button>
        <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} title="Import module file">Import</Button>
        <Button variant="ghost" size="sm" onClick={onShowPatternOrder} title="Pattern order list">Order</Button>
        <Button
          variant={modalOpen === 'findReplace' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => { const s = useUIStore.getState(); s.modalOpen === 'findReplace' ? s.closeModal() : s.openModal('findReplace'); }}
          title="Effect search & replace"
        >FX Search</Button>
        <Button variant="ghost" size="sm" onClick={onShowInstruments} title="Instrument editor">Instruments</Button>
        <Button variant="ghost" size="sm" onClick={onShowDrumpads} title="Drum pads">Pads</Button>
        <Button variant={showMasterFX ? 'primary' : 'ghost'} size="sm" onClick={onShowMasterFX} title="Master effects chain">Master FX</Button>
        <Button
          variant={modalOpen === 'instrumentFx' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => { const s = useUIStore.getState(); s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx'); }}
          title="Per-instrument effects"
        >Inst FX</Button>
        <Button variant={aiOpen ? 'primary' : 'ghost'} size="sm" onClick={toggleAI} title="AI composition tools">AI</Button>
        <Button variant="ghost" size="sm" onClick={() => onShowHelp?.('chip-effects')} title="Effect commands reference">Reference</Button>
        <Button variant="ghost" size="sm" onClick={() => onShowHelp?.('shortcuts')} title="Help & keyboard shortcuts (?)">Help</Button>
        <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)} title="Settings (Ctrl+,)">Settings</Button>
        <Button
          variant={isFullscreen ? 'primary' : 'ghost'}
          size="sm"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Enter Fullscreen (F11)'}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </Button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <ImportModuleDialog
        isOpen={showImportDialog}
        onClose={() => { setShowImportDialog(false); setPendingFile(null); setPendingCompanions([]); }}
        onImport={handleModuleImport}
        initialFile={pendingFile}
        companionFiles={pendingCompanions}
      />
      <FileBrowser isOpen={showFileBrowser} onClose={() => setShowFileBrowser(false)} mode="load" onLoad={async (data, filename) => {
        // Loading from file browser — prevent auto-save from overwriting user's saved project
        clearExplicitlySaved();
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
                }
                
                // Update the instrument with the preset using updateInstrument
                const mergedConfig = { ...tb303Instrument.tb303, ...presetConfig } as TB303Config;
                updateInstrument(tb303Instrument.id, { tb303: mergedConfig });
                
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

          // Handle MIDI files
          if (filename.toLowerCase().endsWith('.mid') || filename.toLowerCase().endsWith('.midi')) {
            try {
              // Import as MIDI file
              const { importMIDIFile } = await import('@lib/import/MIDIImporter');

              // Convert data to File object if it's ArrayBuffer
              const fileBlob = data instanceof ArrayBuffer
                ? new Blob([data], { type: 'audio/midi' })
                : data instanceof Blob
                ? data
                : new Blob([JSON.stringify(data)], { type: 'audio/midi' });

              const file = new File([fileBlob], filename, { type: 'audio/midi' });

              const result = await importMIDIFile(file, {
                quantize: 1,
                mergeChannels: false,
                velocityToVolume: true,
                defaultPatternLength: 64
              });

              console.log('[MIDI Import] Imported:', {
                patterns: result.patterns.length,
                bpm: result.bpm,
                tracks: result.metadata.tracks
              });

              resetAutomation();
              resetTransport();
              resetInstruments();
              engine.disposeAllInstruments();

              // Load patterns and set BPM
              loadPatterns(result.patterns);
              if (result.instruments.length > 0) {
                loadInstruments(result.instruments);
              }
              setBPM(result.bpm);
              setCurrentPattern(0);
              setPatternOrder(result.patterns.map((_, i) => i));
              setMetadata({
                name: result.metadata.name,
                author: '',
                description: `Imported from ${filename} (${result.metadata.tracks} track${result.metadata.tracks !== 1 ? 's' : ''})`,
              });

              notify.success(
                `Imported: ${result.metadata.name || filename} — ${result.instruments.length} instrument(s), BPM: ${result.bpm}`
              );
              return;
            } catch (midiError) {
              console.error('[MIDI Import] Failed:', midiError);
              notify.error(`Failed to import MIDI: ${midiError instanceof Error ? midiError.message : 'Unknown error'}`);
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
        const { loadFile } = await import('@lib/file/UnifiedFileLoader');
        const file = new File([buffer], filename);
        const result = await loadFile(file);
        if (result.success === 'pending-import') {
          setPendingFile(result.file);
          setShowImportDialog(true);
        } else if (result.success === true) {
          notify.success(result.message);
        } else if (result.success === false) {
          notify.error(result.error);
        }
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
                  void clearSavedProject();
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
});