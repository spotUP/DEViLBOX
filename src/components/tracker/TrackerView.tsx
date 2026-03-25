/**
 * TrackerView - Main tracker container with pattern editor and controls
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PatternEditorCanvas } from './PatternEditorCanvas';
import { GridSequencer } from '@components/grid/GridSequencer';
import { useTrackerStore, useCursorStore, useInstrumentStore, useUIStore , useFormatStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useTrackerView } from '@hooks/views/useTrackerView';
import { useModuleImport } from '@hooks/tracker/useModuleImport';
import { InterpolateDialog } from '@components/dialogs/InterpolateDialog';
import { HumanizeDialog } from '@components/dialogs/HumanizeDialog';
import { FindReplaceDialog } from '@components/dialogs/FindReplaceDialog';
import { ImportModuleDialog } from '@components/dialogs/ImportModuleDialog';
import { ImportFurnaceDialog } from '@components/dialogs/ImportFurnaceDialog';
import { ImportMIDIDialog } from '@components/dialogs/ImportMIDIDialog';
import { ImportAudioDialog } from '@components/dialogs/ImportAudioDialog';
import { SunVoxImportDialog } from '@components/instruments/SunVoxImportDialog';
import { ScaleVolumeDialog } from './ScaleVolumeDialog';
import { FadeVolumeDialog } from './FadeVolumeDialog';
import { RemapInstrumentDialog } from './RemapInstrumentDialog';
import { AcidPatternGeneratorDialog } from '@components/dialogs/AcidPatternGeneratorDialog';
import { RandomizeDialog } from '@components/dialogs/RandomizeDialog';
import { PatternOrderModal } from '@components/dialogs/PatternOrderModal';
import { StrumDialog } from '@components/dialogs/StrumDialog';
import { AdvancedEditModal } from '@components/dialogs/AdvancedEditModal';
import { NonEditableDialog } from '@components/dialogs/NonEditableDialog';
import { NewSongWizard } from '@components/dialogs/NewSongWizard';
import { KeyboardShortcutSheet } from './KeyboardShortcutSheet';
import { EffectPicker } from './EffectPicker';
import { UndoHistoryPanel } from './UndoHistoryPanel';
import { FT2Toolbar } from './FT2Toolbar';
import { InstrumentKnobPanel } from './InstrumentKnobPanel';
import { EditorControlsBar } from './EditorControlsBar';
import { TB303View } from '@components/demo/TB303View';
import { MobileTrackerView } from './MobileTrackerView';
import { useResponsive } from '@hooks/useResponsive';
import { Music2, Activity, ExternalLink, Undo2 } from 'lucide-react';
import { PopOutWindow } from '@components/ui/PopOutWindow';
import { InstrumentList } from '@components/instruments/InstrumentList';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { MusicLineTrackTableEditor } from './MusicLineTrackTableEditor';
import { MusicLinePatternViewer } from './MusicLinePatternViewer';
import { downloadPattern } from '@lib/export/PatternExport';
import { downloadTrack } from '@lib/export/TrackExport';
import { DJPitchSlider } from '@components/transport/DJPitchSlider';
import { PatternMinimap } from './PatternMinimap';
import { PianoRoll } from '../pianoroll';
import { AutomationPanel } from '@components/automation/AutomationPanel';
import { GTUltraView } from '@components/gtultra/GTUltraView';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { HivelyView } from '@components/hively/HivelyView';
import { TFMXView } from '@components/tfmx/TFMXView';
import { KlysView } from '@components/klystrack/KlysView';
import { JamCrackerView } from '@components/jamcracker/JamCrackerView';
import { FurnaceView } from '@components/furnace/FurnaceView';
import { Sc68Visualizer } from './Sc68Visualizer';

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
  // Shared logic: keyboard hooks, view mode, grid channel, editor mode, ML export
  const {
    viewMode,
    setViewMode,
    gridChannelIndex,
    setGridChannelIndex,
    editorMode,
    blockOps,
    handleExportML,
  } = useTrackerView();

  const {
    patterns,
    currentPatternIndex,
    scaleVolume,
    fadeVolume,
    remapInstrument,
  } = useTrackerStore(useShallow((state) => ({
    patterns: state.patterns,
    currentPatternIndex: state.currentPatternIndex,
    scaleVolume: state.scaleVolume,
    fadeVolume: state.fadeVolume,
    remapInstrument: state.remapInstrument,
  })));
  // Fine-grained selector for cursor.channelIndex only — avoids re-rendering
  // the entire TrackerView on every cursor row/column move
  const cursorChannelIndex = useCursorStore((state) => state.cursor.channelIndex);

  const pendingModuleFile = useUIStore((state) => state.pendingModuleFile);
  const setPendingModuleFile = useUIStore((state) => state.setPendingModuleFile);
  const pendingCompanionFiles = useUIStore((state) => state.pendingCompanionFiles);
  const pendingAudioFile = useUIStore((state) => state.pendingAudioFile);
  const setPendingAudioFile = useUIStore((state) => state.setPendingAudioFile);
  const pendingSunVoxFile = useUIStore((state) => state.pendingSunVoxFile);
  const setPendingSunVoxFile = useUIStore((state) => state.setPendingSunVoxFile);
  const dialogOpen = useUIStore((state) => state.dialogOpen);
  const closeDialogCommand = useUIStore((state) => state.closeDialogCommand);
  const patternEditorPoppedOut = useUIStore((state) => state.patternEditorPoppedOut);
  const setPatternEditorPoppedOut = useUIStore((state) => state.setPatternEditorPoppedOut);

  // Import handlers (extracted to hook)
  const { handleModuleImport, handleSunVoxImport } = useModuleImport();

  // GT Ultra DAW mode — hook must be called before any early returns (rules of hooks)
  const gtViewMode = useGTUltraStore((s) => s.viewMode);

  // Dialog state
  const [showInterpolate, setShowInterpolate] = useState(false);
  const [showHumanize, setShowHumanize] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showShortcutSheet, setShowShortcutSheet] = useState(false);
  const [showStrum, setShowStrum] = useState(false);
  const [showEffectPicker, setShowEffectPicker] = useState(false);
  const [showUndoHistory, setShowUndoHistory] = useState(false);
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
  const channelTrackTables = useFormatStore((state) => state.channelTrackTables);

  // Mobile swipe handlers for cursor navigation
  const handleSwipeLeft = useCallback(() => {
    if (!isMobile) return;
    useCursorStore.getState().moveCursor('left');
  }, [isMobile]);

  const handleSwipeRight = useCallback(() => {
    if (!isMobile) return;
    useCursorStore.getState().moveCursor('right');
  }, [isMobile]);

  // Use external or internal import state
  const showImportModule = externalShowImportModule ?? internalShowImportModule;
  const setShowImportModule = onShowImportModule ?? setInternalShowImportModule;

  // Close pattern editor pop-out when editor mode changes
  useEffect(() => {
    setPatternEditorPoppedOut(false);
  }, [editorMode, setPatternEditorPoppedOut]);

  // Instrument panel state (shared with GL via store)
  const showInstrumentPanel = useUIStore((s) => s.showInstrumentPanel);
  const setShowInstrumentPanel = useUIStore((s) => s.setShowInstrumentPanel);
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
      setShowImportModule(true);
      // Don't clear yet - ImportModuleDialog needs it
    }
  }, [pendingModuleFile, setShowImportModule]);

  // NOTE: usePatternPlayback() is called in App.tsx so it persists across view switches

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
      <NonEditableDialog />
      <NewSongWizard />
      <EffectPicker
        isOpen={showEffectPicker}
        onSelect={(effTyp, eff) => {
          const { setCell } = useTrackerStore.getState();
          const { cursor } = useCursorStore.getState();
          setCell(cursor.channelIndex, cursor.rowIndex, { effTyp, eff });
          setShowEffectPicker(false);
        }}
        onClose={() => setShowEffectPicker(false)}
        synthType={(() => {
          // Get synth type from current cell's instrument
          const { cursor } = useCursorStore.getState();
          const { patterns, currentPatternIndex } = useTrackerStore.getState();
          const pattern = patterns[currentPatternIndex];
          if (!pattern) return undefined;
          const cell = pattern.channels[cursor.channelIndex]?.rows[cursor.rowIndex];
          if (!cell?.instrument) return undefined;
          const inst = useInstrumentStore.getState().getInstrument(cell.instrument);
          return inst?.synthType;
        })()}
      />
      <UndoHistoryPanel isOpen={showUndoHistory} onClose={() => setShowUndoHistory(false)} />
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
            onClose={() => { setShowImportModule(false); setPendingModuleFile(null); useUIStore.getState().setPendingCompanionFiles([]); }}
            onImport={handleModuleImport}
            initialFile={pendingModuleFile}
            companionFiles={pendingCompanionFiles}
          />
        )}
        {/* Audio sample import dialog */}
        <ImportAudioDialog
          isOpen={!!pendingAudioFile}
          onClose={() => setPendingAudioFile(null)}
          initialFile={pendingAudioFile}
        />
        {/* SunVox patch/song import dialog */}
        {pendingSunVoxFile && (
          <SunVoxImportDialog
            onClose={() => setPendingSunVoxFile(null)}
            onImport={handleSunVoxImport}
            initialFile={pendingSunVoxFile}
          />
        )}
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

  // GT Ultra DAW mode flag (gtViewMode hook is called above, before mobile early return)
  const isGTDAWMode = editorMode === 'goattracker' && gtViewMode === 'daw';

  // Desktop view (GT Ultra DAW mode uses a simplified layout)
  return isGTDAWMode ? (
    <div className="flex-1 min-h-0 flex flex-col bg-dark-bg overflow-hidden">
      <GTUltraView />
    </div>
  ) : (
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

      {/* Instrument Knob Panel - follows cursor channel, adapts to synth type */}
      {viewMode !== 'tb303' && (
        <div className="flex-shrink-0">
          <InstrumentKnobPanel />
        </div>
      )}

      {/* Editor Controls Toolbar - Compact & Shrinkable */}
      <EditorControlsBar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        gridChannelIndex={gridChannelIndex}
        onGridChannelChange={setGridChannelIndex}
        showAdvancedEdit={showAdvancedEdit}
        onToggleAdvancedEdit={() => setShowAdvancedEdit(!showAdvancedEdit)}
        onShowAutomation={() => setShowAutomation(true)}
        onShowDrumpads={onShowDrumpads}
      />

      {/* Main Content Area with Pattern Editor and Instrument Panel - Flexbox Layout */}
      <div className="flex-1 min-h-0 min-w-0 relative z-10 flex overflow-hidden">
        {/* Pattern Editor / Grid Sequencer / Piano Roll / TB-303 Editor - Flex item 1 */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {viewMode === 'tracker' ? (
            (() => {
              // Determine if this is a custom format editor that can be popped out
              const isCustomFormat = ['goattracker', 'hively', 'klystrack', 'jamcracker', 'musicline', 'furnace', 'tfmx'].includes(editorMode);
              const formatLabels: Record<string, string> = {
                goattracker: 'GoatTracker', hively: 'AHX / Hively', klystrack: 'Klystrack',
                jamcracker: 'JamCracker', musicline: 'MusicLine', furnace: 'Furnace', tfmx: 'TFMX',
              };

              // Build the editor content
              const editorContent = editorMode === 'goattracker' ? (
                <GTUltraView />
              ) : editorMode === 'hively' ? (
                <HivelyView />
              ) : editorMode === 'klystrack' ? (
                <KlysView />
              ) : editorMode === 'jamcracker' ? (
                <JamCrackerView />
              ) : editorMode === 'furnace' ? (
                <FurnaceView />
              ) : editorMode === 'tfmx' ? (
                <TFMXView />
              ) : editorMode === 'sc68' ? (
                <Sc68Visualizer />
              ) : editorMode === 'musicline' ? (
                <div className="flex-1 flex flex-col min-h-0 bg-dark-bgPrimary">
                  {/* Per-channel track table matrix */}
                  <div className="flex-shrink-0 border-b border-dark-border" style={{ maxHeight: 220, overflowY: 'auto' }}>
                    <div className="px-3 pt-3 pb-1 flex items-center gap-2">
                      <span className="text-sm font-bold text-ft2-text">MusicLine Editor</span>
                      <span className="text-xs text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded border border-accent-primary/30">
                        per-channel
                      </span>
                      <span className="text-xs text-ft2-textDim ml-auto mr-2">
                        {channelTrackTables?.length ?? 0} channels · {patterns.length} parts
                      </span>
                      <button
                        className="px-2 py-0.5 text-xs bg-green-800 hover:bg-green-700 text-green-100 rounded border border-green-600"
                        onClick={handleExportML}
                      >Export .ml</button>
                    </div>
                    <div className="px-3 pb-3">
                      <MusicLineTrackTableEditor
                        onSeek={(pos) => {
                          useTrackerStore.getState().setCurrentPosition(pos);
                          getTrackerReplayer().jumpToPosition(pos, 0);
                        }}
                      />
                    </div>
                  </div>
                  {/* Multi-channel note viewer */}
                  <div className="flex-1 min-h-0">
                    <MusicLinePatternViewer />
                  </div>
                </div>
              ) : (
                <PatternEditorCanvas
                  onAcidGenerator={handleAcidGenerator}
                  onRandomize={handleRandomize}
                  onSwipeLeft={handleSwipeLeft}
                  onSwipeRight={handleSwipeRight}
                />
              );

              // Custom format: support pop-out
              if (isCustomFormat && patternEditorPoppedOut) {
                return (
                  <>
                    <PopOutWindow
                      isOpen={true}
                      onClose={() => setPatternEditorPoppedOut(false)}
                      title={`DEViLBOX — ${formatLabels[editorMode] || editorMode} Editor`}
                      width={1100}
                      height={700}
                    >
                      <div className="flex flex-col h-screen w-screen bg-dark-bgPrimary">
                        <div className="flex items-center gap-2 px-3 py-1 bg-dark-bgSecondary border-b border-dark-border shrink-0">
                          <span className="text-xs font-bold text-accent-primary">{formatLabels[editorMode]}</span>
                          <span className="text-xs text-ft2-textDim">Pattern Editor — Popped Out</span>
                          <div className="flex-1" />
                          <button
                            className="flex items-center gap-1 px-2 py-0.5 text-xs bg-dark-bg hover:bg-dark-bgTertiary text-text-muted hover:text-text-primary rounded border border-dark-border transition-colors"
                            onClick={() => setPatternEditorPoppedOut(false)}
                            title="Restore to main window"
                          >
                            <Undo2 size={12} />
                            Restore
                          </button>
                        </div>
                        <div className="flex-1 min-h-0">
                          {editorContent}
                        </div>
                      </div>
                    </PopOutWindow>

                    {/* Placeholder in main window */}
                    <div className="flex-1 flex items-center justify-center bg-dark-bgPrimary">
                      <div className="text-center">
                        <ExternalLink size={32} className="mx-auto mb-2 text-accent-primary opacity-50" />
                        <p className="text-sm text-ft2-textDim">{formatLabels[editorMode]} Editor — Popped Out</p>
                        <button
                          className="mt-2 px-3 py-1 text-xs bg-dark-bgSecondary hover:bg-dark-bgTertiary text-text-primary rounded border border-dark-border transition-colors"
                          onClick={() => setPatternEditorPoppedOut(false)}
                        >
                          Restore
                        </button>
                      </div>
                    </div>
                  </>
                );
              }

              // Custom format: show with pop-out button overlay
              if (isCustomFormat) {
                return (
                  <div className="relative flex-1 min-h-0 flex flex-col">
                    {editorContent}
                    <button
                      className="absolute bottom-1 right-1 z-[99990] p-1 rounded bg-dark-bg/80 hover:bg-dark-bgTertiary text-text-muted hover:text-accent-primary border border-dark-border/50 transition-colors"
                      onClick={() => setPatternEditorPoppedOut(true)}
                      title="Pop out editor to separate window"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </div>
                );
              }

              // Standard format (PatternEditorCanvas)
              return editorContent;
            })()
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
              showHivelyImport={editorMode === 'hively'}
              showSunVoxImport={true}
              showFurnaceBrowser={true}
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
      <NonEditableDialog />
      <NewSongWizard />
      <EffectPicker
        isOpen={showEffectPicker}
        onSelect={(effTyp, eff) => {
          const { setCell } = useTrackerStore.getState();
          const { cursor } = useCursorStore.getState();
          setCell(cursor.channelIndex, cursor.rowIndex, { effTyp, eff });
          setShowEffectPicker(false);
        }}
        onClose={() => setShowEffectPicker(false)}
        synthType={(() => {
          // Get synth type from current cell's instrument
          const { cursor } = useCursorStore.getState();
          const { patterns, currentPatternIndex } = useTrackerStore.getState();
          const pattern = patterns[currentPatternIndex];
          if (!pattern) return undefined;
          const cell = pattern.channels[cursor.channelIndex]?.rows[cursor.rowIndex];
          if (!cell?.instrument) return undefined;
          const inst = useInstrumentStore.getState().getInstrument(cell.instrument);
          return inst?.synthType;
        })()}
      />
      <UndoHistoryPanel isOpen={showUndoHistory} onClose={() => setShowUndoHistory(false)} />
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
          onClose={() => { setShowImportModule(false); setPendingModuleFile(null); useUIStore.getState().setPendingCompanionFiles([]); }}
          onImport={handleModuleImport}
          initialFile={pendingModuleFile}
          companionFiles={pendingCompanionFiles}
        />
      )}

      {/* Audio sample import dialog */}
      <ImportAudioDialog
        isOpen={!!pendingAudioFile}
        onClose={() => setPendingAudioFile(null)}
        initialFile={pendingAudioFile}
      />
      {/* SunVox patch/song import dialog */}
      {pendingSunVoxFile && (
        <SunVoxImportDialog
          onClose={() => setPendingSunVoxFile(null)}
          onImport={handleSunVoxImport}
          initialFile={pendingSunVoxFile}
        />
      )}

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
            downloadTrack(useCursorStore.getState().cursor.channelIndex, pattern);
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
        <div className="fixed inset-0 z-[99990] flex items-center justify-center p-4 bg-black/50 animate-fade-in">
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
