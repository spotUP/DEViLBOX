/**
 * MobileTrackerView - Mobile-optimized tracker/pattern editor interface
 * Single combined header+transport bar, format-aware editor, 3-state piano input.
 */

import React, { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import { PatternEditorCanvas } from './PatternEditorCanvas';
import { useMusicLineFormatData } from '@/components/musicline/useMusicLineFormatData';
import { MUSICLINE_COLUMNS } from '@/components/musicline/musiclineAdapter';
import { MobilePatternInput } from './mobile/MobilePatternInput';
import { MobileTransportBar } from './mobile/MobileTransportBar';
import { useTransportStore, useTrackerStore, useCursorStore, useInstrumentStore, useEditorStore } from '@stores';
import { useFormatStore } from '@stores/useFormatStore';
import { useGTUltraStore } from '@stores/useGTUltraStore';
import { useShallow } from 'zustand/react/shallow';
import { useOrientation } from '@/hooks/useOrientation';
import { haptics } from '@/utils/haptics';

// Lazy-load format-specific views
const FurnaceView = lazy(() => import('@/components/furnace/FurnaceView').then(m => ({ default: m.FurnaceView })));
const HivelyView = lazy(() => import('@/components/hively/HivelyView').then(m => ({ default: m.HivelyView })));
const TFMXView = lazy(() => import('@/components/tfmx/TFMXView').then(m => ({ default: m.TFMXView })));
const GTUltraView = lazy(() => import('@/components/gtultra/GTUltraView').then(m => ({ default: m.GTUltraView })));
const GTDAWView = lazy(() => import('@/components/gtultra/daw/GTDAWView').then(m => ({ default: m.GTDAWView })));
const KlysView = lazy(() => import('@/components/klystrack/KlysView').then(m => ({ default: m.KlysView })));
const JamCrackerView = lazy(() => import('@/components/jamcracker/JamCrackerView').then(m => ({ default: m.JamCrackerView })));
const Sc68Visualizer = lazy(() => import('@/components/tracker/Sc68Visualizer').then(m => ({ default: m.Sc68Visualizer })));
// MusicLinePatternViewer replaced by PatternEditorCanvas
const MusicLineTrackTableEditor = lazy(() => import('@/components/tracker/MusicLineTrackTableEditor').then(m => ({ default: m.MusicLineTrackTableEditor })));

// Piano input collapse states
type PianoState = 'full' | 'compact' | 'hidden';
const PIANO_HEIGHTS: Record<PianoState, number> = { full: 240, compact: 80, hidden: 0 };
const AUTO_COMPACT_MS = 4000; // Auto-collapse to compact after 4s idle

interface MobileTrackerViewProps {
  onShowPatterns?: () => void;
  onShowExport?: () => void;
  onShowHelp?: (tab?: string) => void;
  onShowMasterFX?: () => void;
  onShowInstruments?: () => void;
  showPatterns?: boolean;
  showMasterFX?: boolean;
}

export const MobileTrackerView: React.FC<MobileTrackerViewProps> = () => {
  const [mobileChannel, setMobileChannel] = useState(0);
  const [pianoState, setPianoState] = useState<PianoState>('compact');
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mlFormatData = useMusicLineFormatData();
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const cursor = useCursorStore((s) => s.cursor);
  const moveCursor = useCursorStore((s) => s.moveCursor);
  const moveCursorToRow = useCursorStore((s) => s.moveCursorToRow);
  const { patterns, currentPatternIndex, setCell, copySelection, cutSelection, paste } = useTrackerStore(useShallow((s) => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
    setCell: s.setCell,
    copySelection: s.copySelection,
    cutSelection: s.cutSelection,
    paste: s.paste,
  })));
  const { recordMode, editStep } = useEditorStore(useShallow((s) => ({
    recordMode: s.recordMode,
    editStep: s.editStep,
  })));
  const currentInstrumentId = useInstrumentStore((s) => s.currentInstrumentId);

  const pattern = patterns[currentPatternIndex];
  const editorMode = useFormatStore((s) => s.editorMode);
  const hasC64Sid = useFormatStore((s) => s.c64SidFileData !== null);
  const gtViewMode = useGTUltraStore((s) => s.viewMode);
  const { isPortrait, isLandscape } = useOrientation();

  // GoatTracker in DAW mode renders the full DAW view
  const isGTDAWMode = editorMode === 'goattracker' && gtViewMode === 'daw';
  const isCustomFormat = ['goattracker', 'hively', 'klystrack', 'jamcracker', 'musicline', 'furnace', 'sc68', 'tfmx'].includes(editorMode);
  const visibleChannels = isLandscape ? 4 : 1;
  const startChannel = isPortrait ? mobileChannel : 0;

  // Auto-hide piano during playback (when not in record mode)
  useEffect(() => {
    if (isPlaying && !recordMode) {
      setPianoState('hidden');
    } else if (!isPlaying && pianoState === 'hidden') {
      setPianoState('compact');
    }
  }, [isPlaying, recordMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-collapse from full → compact after idle
  const resetAutoCollapse = useCallback(() => {
    if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current);
    autoCollapseTimer.current = setTimeout(() => {
      setPianoState(prev => prev === 'full' ? 'compact' : prev);
    }, AUTO_COMPACT_MS);
  }, []);

  // Channel navigation
  const handleChannelPrev = useCallback(() => {
    if (mobileChannel > 0) { haptics.selection(); setMobileChannel(mobileChannel - 1); }
  }, [mobileChannel]);

  const handleChannelNext = useCallback(() => {
    const maxChannels = pattern?.channels.length || 8;
    if (mobileChannel < maxChannels - 1) { haptics.selection(); setMobileChannel(mobileChannel + 1); }
  }, [mobileChannel, pattern]);

  // Note input — expand piano on use, auto-collapse after idle
  const handleNoteInput = useCallback((note: number) => {
    haptics.medium();
    setCell(cursor.channelIndex, cursor.rowIndex, { note, instrument: currentInstrumentId ?? 1 });
    if (recordMode && editStep > 0) {
      const patternLength = patterns[currentPatternIndex]?.length ?? 64;
      moveCursorToRow((cursor.rowIndex + editStep) % patternLength);
    }
    resetAutoCollapse();
  }, [cursor, setCell, currentInstrumentId, recordMode, editStep, patterns, currentPatternIndex, moveCursorToRow, resetAutoCollapse]);

  const handleHexInput = useCallback((value: number) => {
    haptics.medium();
    const { channelIndex, rowIndex, columnType } = cursor;
    switch (columnType) {
      case 'instrument': setCell(channelIndex, rowIndex, { instrument: value }); break;
      case 'volume': setCell(channelIndex, rowIndex, { volume: value }); break;
      case 'effTyp': setCell(channelIndex, rowIndex, { effTyp: value }); break;
      case 'effParam': setCell(channelIndex, rowIndex, { eff: value }); break;
    }
    moveCursor('right');
    resetAutoCollapse();
  }, [cursor, setCell, moveCursor, resetAutoCollapse]);

  const handleDelete = useCallback(() => {
    haptics.rigid();
    const { channelIndex, rowIndex } = cursor;
    setCell(channelIndex, rowIndex, { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
  }, [cursor, setCell]);

  const handleCopy = useCallback(() => { haptics.success(); copySelection(); }, [copySelection]);
  const handleCut = useCallback(() => { haptics.success(); cutSelection(); }, [cutSelection]);
  const handlePaste = useCallback(() => { haptics.success(); paste(); }, [paste]);

  const handlePatternSwipeLeft = useCallback(() => { moveCursor('left'); }, [moveCursor]);
  const handlePatternSwipeRight = useCallback(() => { moveCursor('right'); }, [moveCursor]);

  // Tap piano area to expand from compact → full
  const handlePianoExpand = useCallback(() => {
    if (pianoState === 'compact') {
      setPianoState('full');
      resetAutoCollapse();
    } else if (pianoState === 'full') {
      setPianoState('compact');
    }
  }, [pianoState, resetAutoCollapse]);

  // Collapse callback for MobilePatternInput
  const handleCollapseChange = useCallback((collapsed: boolean) => {
    setPianoState(collapsed ? 'compact' : 'full');
    if (!collapsed) resetAutoCollapse();
  }, [resetAutoCollapse]);

  const pianoHeight = PIANO_HEIGHTS[pianoState];

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-dark-bg">
      {/* Combined header + transport bar (single 40px bar) */}
      <MobileTransportBar
        mobileChannel={mobileChannel}
        onChannelPrev={handleChannelPrev}
        onChannelNext={handleChannelNext}
        maxChannels={pattern?.channels.length || 8}
        showChannelNav={isPortrait && !isCustomFormat}
        formatLabel={isCustomFormat ? editorMode : undefined}
      />

      {/* Pattern editor — format-aware routing */}
      <div className="flex-1 min-h-0 relative">
        <div
          className="h-full flex flex-col"
          style={{
            paddingBottom: `calc(${pianoHeight + 44}px + env(safe-area-inset-bottom, 0px))`
          }}
        >
          <div className="flex-1 overflow-hidden">
            {isCustomFormat ? (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted text-xs">Loading format editor...</div>}>
                {editorMode === 'furnace' && <FurnaceView />}
                {editorMode === 'hively' && <HivelyView />}
                {editorMode === 'goattracker' && (isGTDAWMode ? <GTDAWView /> : <GTUltraView />)}
                {editorMode === 'klystrack' && <KlysView />}
                {editorMode === 'jamcracker' && <JamCrackerView />}
                {editorMode === 'sc68' && <Sc68Visualizer />}
                {editorMode === 'tfmx' && <TFMXView />}
                {editorMode === 'musicline' && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-shrink-0 border-b border-dark-border" style={{ maxHeight: 160, overflowY: 'auto' }}>
                      <MusicLineTrackTableEditor />
                    </div>
                    <div className="flex-1 min-h-0">
                      <PatternEditorCanvas
                        formatColumns={MUSICLINE_COLUMNS}
                        formatChannels={mlFormatData.channels}
                        formatCurrentRow={mlFormatData.currentRow}
                        formatIsPlaying={mlFormatData.isPlaying}
                        onFormatCellChange={mlFormatData.handleCellChange}
                      />
                    </div>
                  </div>
                )}
              </Suspense>
            ) : hasC64Sid ? (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted text-xs">Loading visualizer...</div>}>
                <Sc68Visualizer />
              </Suspense>
            ) : (
              <PatternEditorCanvas
                visibleChannels={visibleChannels}
                startChannel={startChannel}
                onSwipeLeft={handlePatternSwipeLeft}
                onSwipeRight={handlePatternSwipeRight}
              />
            )}
          </div>
        </div>
      </div>

      {/* Piano input — 3 states: full / compact / hidden */}
      {pianoState !== 'hidden' && (
        <MobilePatternInput
          onNoteInput={handleNoteInput}
          onHexInput={handleHexInput}
          onDelete={handleDelete}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onCollapseChange={handleCollapseChange}
          compact={pianoState === 'compact'}
          onExpandToggle={handlePianoExpand}
        />
      )}
    </div>
  );
};

export default MobileTrackerView;
