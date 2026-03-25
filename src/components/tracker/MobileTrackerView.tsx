/**
 * MobileTrackerView - Mobile-optimized tracker/pattern editor interface
 * Note: MobileTabBar is now in AppLayout (shared across all views).
 * This component focuses on the pattern editor only.
 */

import React, { useState, useCallback, Suspense, lazy } from 'react';
import { PatternEditorCanvas } from './PatternEditorCanvas';
import { MobilePatternInput } from './mobile/MobilePatternInput';
import { MobileTransportBar } from './mobile/MobileTransportBar';
import { ChevronLeft, ChevronRight, Cpu } from 'lucide-react';
import { useTrackerStore, useCursorStore, useInstrumentStore, useEditorStore } from '@stores';
import { useFormatStore } from '@stores/useFormatStore';
import { useShallow } from 'zustand/react/shallow';
import { getGroupedPresets } from '@/constants/systemPresets';
import { useOrientation } from '@/hooks/useOrientation';

// Lazy-load format-specific views
const FurnaceView = lazy(() => import('@/components/furnace/FurnaceView').then(m => ({ default: m.FurnaceView })));
const HivelyView = lazy(() => import('@/components/hively/HivelyView').then(m => ({ default: m.HivelyView })));
const GTUltraView = lazy(() => import('@/components/gtultra/GTUltraView').then(m => ({ default: m.GTUltraView })));
const KlysView = lazy(() => import('@/components/klystrack/KlysView').then(m => ({ default: m.KlysView })));
const JamCrackerView = lazy(() => import('@/components/jamcracker/JamCrackerView').then(m => ({ default: m.JamCrackerView })));
const Sc68Visualizer = lazy(() => import('@/components/tracker/Sc68Visualizer').then(m => ({ default: m.Sc68Visualizer })));
const MusicLinePatternViewer = lazy(() => import('@/components/tracker/MusicLinePatternViewer').then(m => ({ default: m.MusicLinePatternViewer })));
const MusicLineTrackTableEditor = lazy(() => import('@/components/tracker/MusicLineTrackTableEditor').then(m => ({ default: m.MusicLineTrackTableEditor })));
import { haptics } from '@/utils/haptics';
import { useMobilePatternGestures } from '@/hooks/useMobilePatternGestures';

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
  const [isInputCollapsed, setIsInputCollapsed] = useState(false);
  const cursor = useCursorStore((s) => s.cursor);
  const moveCursor = useCursorStore((s) => s.moveCursor);
  const moveCursorToRow = useCursorStore((s) => s.moveCursorToRow);
  const { patterns, currentPatternIndex, setCell, copySelection, cutSelection, paste, applySystemPreset } = useTrackerStore(useShallow((s) => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
    setCell: s.setCell,
    copySelection: s.copySelection,
    cutSelection: s.cutSelection,
    paste: s.paste,
    applySystemPreset: s.applySystemPreset,
  })));
  const { recordMode, editStep } = useEditorStore(useShallow((s) => ({
    recordMode: s.recordMode,
    editStep: s.editStep,
  })));
  const { instruments, currentInstrumentId, setCurrentInstrument } = useInstrumentStore(useShallow((s) => ({
    instruments: s.instruments,
    currentInstrumentId: s.currentInstrumentId,
    setCurrentInstrument: s.setCurrentInstrument,
  })));
  const pattern = patterns[currentPatternIndex];
  const editorMode = useFormatStore((s) => s.editorMode);
  const { isPortrait, isLandscape } = useOrientation();

  const isCustomFormat = ['goattracker', 'hively', 'klystrack', 'jamcracker', 'musicline', 'furnace', 'sc68'].includes(editorMode);
  const visibleChannels = isLandscape ? 4 : 1;
  const startChannel = isPortrait ? mobileChannel : 0;

  const handleChannelPrev = useCallback(() => {
    if (mobileChannel > 0) {
      haptics.selection();
      setMobileChannel(mobileChannel - 1);
    }
  }, [mobileChannel]);

  const handleChannelNext = useCallback(() => {
    const maxChannels = pattern?.channels.length || 8;
    if (mobileChannel < maxChannels - 1) {
      haptics.selection();
      setMobileChannel(mobileChannel + 1);
    }
  }, [mobileChannel, pattern]);

  const handleNoteInput = useCallback((note: number) => {
    setCell(cursor.channelIndex, cursor.rowIndex, {
      note,
      instrument: currentInstrumentId ?? 1,
    });
    if (recordMode && editStep > 0) {
      const patternLength = patterns[currentPatternIndex]?.length ?? 64;
      moveCursorToRow((cursor.rowIndex + editStep) % patternLength);
    }
  }, [cursor, setCell, currentInstrumentId, recordMode, editStep, patterns, currentPatternIndex, moveCursorToRow]);

  const handleHexInput = useCallback((value: number) => {
    const { channelIndex, rowIndex, columnType } = cursor;
    switch (columnType) {
      case 'instrument': setCell(channelIndex, rowIndex, { instrument: value }); break;
      case 'volume': setCell(channelIndex, rowIndex, { volume: value }); break;
      case 'effTyp': setCell(channelIndex, rowIndex, { effTyp: value }); break;
      case 'effParam': setCell(channelIndex, rowIndex, { eff: value }); break;
    }
    moveCursor('right');
  }, [cursor, setCell, moveCursor]);

  const handleDelete = useCallback(() => {
    const { channelIndex, rowIndex } = cursor;
    setCell(channelIndex, rowIndex, { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
  }, [cursor, setCell]);

  const channelHeaderGestures = useMobilePatternGestures({
    onSwipeLeft: handleChannelNext,
    onSwipeRight: handleChannelPrev,
    enabled: isPortrait,
  });

  const handleCopy = useCallback(() => { haptics.success(); copySelection(); }, [copySelection]);
  const handleCut = useCallback(() => { haptics.success(); cutSelection(); }, [cutSelection]);
  const handlePaste = useCallback(() => { haptics.success(); paste(); }, [paste]);

  const handlePatternSwipeLeft = useCallback(() => { moveCursor('left'); }, [moveCursor]);
  const handlePatternSwipeRight = useCallback(() => { moveCursor('right'); }, [moveCursor]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-dark-bg">
      {/* Header with channel nav and instrument selector */}
      <div className="flex-shrink-0 flex items-center justify-between px-2 py-1.5 bg-dark-bgSecondary border-b border-dark-border safe-area-top">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Portrait mode: Channel selector */}
          {isPortrait && !isCustomFormat && (
            <div
              className="flex items-center gap-1 touch-none"
              {...channelHeaderGestures}
            >
              <button
                onClick={handleChannelPrev}
                disabled={mobileChannel === 0}
                className="p-1 rounded bg-dark-bgTertiary disabled:opacity-30 touch-target-sm"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-mono text-accent-primary min-w-[28px] text-center">
                CH {(mobileChannel + 1).toString().padStart(2, '0')}
              </span>
              <button
                onClick={handleChannelNext}
                disabled={mobileChannel >= (pattern?.channels.length || 8) - 1}
                className="p-1 rounded bg-dark-bgTertiary disabled:opacity-30 touch-target-sm"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Format label for custom formats */}
          {isCustomFormat && (
            <span className="text-xs font-bold text-accent-primary uppercase tracking-wide">{editorMode}</span>
          )}

          {/* Instrument selector */}
          <div className="ml-auto flex items-center gap-1 min-w-0">
            <select
              value={currentInstrumentId ?? 1}
              onChange={(e) => setCurrentInstrument(parseInt(e.target.value, 10))}
              className="text-[10px] bg-dark-bgTertiary border border-dark-border rounded px-1.5 py-1 text-text-primary font-mono truncate"
              style={{ maxWidth: '100px' }}
            >
              {instruments.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name.substring(0, 15)}
                </option>
              ))}
            </select>

            <div className="flex items-center ml-1 pl-1 border-l border-dark-border">
              <Cpu size={12} className="text-accent-primary mr-1" />
              <select
                className="bg-dark-bgTertiary text-text-primary text-[10px] h-6 border border-dark-border rounded px-1 hover:border-accent-primary outline-none max-w-[70px]"
                onChange={(e) => applySystemPreset(e.target.value)}
                defaultValue="none"
              >
                <option value="none" disabled>HW...</option>
                {getGroupedPresets().map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.presets.map(preset => (
                      <option key={preset.id} value={preset.id}>{preset.name.split(' ')[0].toUpperCase()}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right spacer for the fixed hamburger menu button */}
        <div className="w-10 flex-shrink-0" />
      </div>

      {/* Transport bar — BPM, pattern, octave, step, play/record */}
      <MobileTransportBar />

      {/* Pattern editor — format-aware routing */}
      <div className="flex-1 min-h-0 relative">
        <div
          className="h-full flex flex-col"
          style={{
            paddingBottom: `calc(${isInputCollapsed ? '0px' : '124px'} + env(safe-area-inset-bottom, 0px))`
          }}
        >
          <div className="flex-1 overflow-auto">
            {isCustomFormat ? (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted text-xs">Loading format editor...</div>}>
                {editorMode === 'furnace' && <FurnaceView />}
                {editorMode === 'hively' && <HivelyView />}
                {editorMode === 'goattracker' && <GTUltraView />}
                {editorMode === 'klystrack' && <KlysView />}
                {editorMode === 'jamcracker' && <JamCrackerView />}
                {editorMode === 'sc68' && <Sc68Visualizer />}
                {editorMode === 'musicline' && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-shrink-0 border-b border-dark-border" style={{ maxHeight: 160, overflowY: 'auto' }}>
                      <MusicLineTrackTableEditor />
                    </div>
                    <div className="flex-1 min-h-0">
                      <MusicLinePatternViewer />
                    </div>
                  </div>
                )}
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

      {/* Mobile pattern input (piano keyboard + hex grid) */}
      <MobilePatternInput
        onNoteInput={handleNoteInput}
        onHexInput={handleHexInput}
        onDelete={handleDelete}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
        onCollapseChange={setIsInputCollapsed}
      />
    </div>
  );
};

export default MobileTrackerView;
