/**
 * MobileTrackerView - Mobile-optimized tracker interface
 * Vivid Tracker-inspired mobile layout with context-aware bottom input
 */

import React, { useState, useCallback } from 'react';
import { MobileTabBar, type MobileTab } from '@components/layout/MobileTabBar';
import { PatternEditorCanvas } from './PatternEditorCanvas';
import { InstrumentList } from '@components/instruments/InstrumentList';
import { TB303KnobPanel } from './TB303KnobPanel';
import { FT2Toolbar } from './FT2Toolbar';
import { MobilePatternInput } from './mobile/MobilePatternInput';
import { Play, Square, ChevronLeft, ChevronRight, Settings, Music2, SlidersHorizontal } from 'lucide-react';
import { useTransportStore, useTrackerStore, useInstrumentStore } from '@stores';
import { useOrientation } from '@/hooks/useOrientation';
import { haptics } from '@/utils/haptics';
import { useMobilePatternGestures } from '@/hooks/useMobilePatternGestures';

interface MobileTrackerViewProps {
  onShowPatterns?: () => void;
  onShowExport?: () => void;
  onShowHelp?: () => void;
  onShowMasterFX?: () => void;
  onShowInstruments?: () => void;
  showPatterns?: boolean;
  showMasterFX?: boolean;
}

export const MobileTrackerView: React.FC<MobileTrackerViewProps> = ({
  onShowPatterns,
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowInstruments,
  showPatterns,
  showMasterFX,
}) => {
  const [activeTab, setActiveTab] = useState<'pattern' | 'instruments'>('pattern');
  const [mobileChannel, setMobileChannel] = useState(0); // For portrait mode: which channel to show
  const [isInputCollapsed, setIsInputCollapsed] = useState(false); // Track MobilePatternInput collapse state
  const { isPlaying, togglePlayPause } = useTransportStore();
  const { patterns, currentPatternIndex, cursor, setCell, moveCursor, copySelection, cutSelection, paste } = useTrackerStore();
  const { instruments, currentInstrumentId, setCurrentInstrument } = useInstrumentStore();
  const pattern = patterns[currentPatternIndex];
  const { isPortrait, isLandscape } = useOrientation();

  // Calculate visible channels based on orientation
  const visibleChannels = isLandscape ? 4 : 1;
  const startChannel = isPortrait ? mobileChannel : 0;

  // Handle channel navigation in portrait mode
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

  // Handle note input from mobile keyboard
  const handleNoteInput = useCallback((note: number) => {
    const currentInstrument = 1; // TODO: Get from instrument store
    setCell(cursor.channelIndex, cursor.rowIndex, {
      note,
      instrument: currentInstrument,
    });
    // Advance cursor if in record mode
    // TODO: Check recordMode and editStep from tracker store
  }, [cursor, setCell]);

  // Handle hex input (for effects, volume, instrument)
  const handleHexInput = useCallback((value: number) => {
    const { channelIndex, rowIndex, columnType } = cursor;

    switch (columnType) {
      case 'instrument':
        setCell(channelIndex, rowIndex, { instrument: value });
        break;
      case 'volume':
        setCell(channelIndex, rowIndex, { volume: value });
        break;
      case 'effTyp':
        setCell(channelIndex, rowIndex, { effTyp: value });
        break;
      case 'effParam':
        setCell(channelIndex, rowIndex, { eff: value });
        break;
    }

    // Move cursor right after input
    moveCursor('right');
  }, [cursor, setCell, moveCursor]);

  // Handle delete
  const handleDelete = useCallback(() => {
    const { channelIndex, rowIndex } = cursor;
    setCell(channelIndex, rowIndex, {
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
    });
  }, [cursor, setCell]);

  // Gesture handlers for channel header (portrait mode only)
  const channelHeaderGestures = useMobilePatternGestures({
    onSwipeLeft: handleChannelNext,
    onSwipeRight: handleChannelPrev,
    enabled: isPortrait,
  });

  // Clipboard handlers for mobile input context menu
  const handleCopy = useCallback(() => {
    haptics.success();
    copySelection();
  }, [copySelection]);

  const handleCut = useCallback(() => {
    haptics.success();
    cutSelection();
  }, [cutSelection]);

  const handlePaste = useCallback(() => {
    haptics.success();
    paste();
  }, [paste]);

  // Gesture handlers for pattern editor (cursor movement)
  // Note: Only horizontal swipes - vertical swipes reserved for scrolling
  const handlePatternSwipeLeft = useCallback(() => {
    moveCursor('left');
  }, [moveCursor]);

  const handlePatternSwipeRight = useCallback(() => {
    moveCursor('right');
  }, [moveCursor]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-dark-bg">
      {/* Fixed header with pattern info and transport */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-dark-bgSecondary border-b border-dark-border safe-area-top">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Transport controls - Moved to left to avoid hamburger menu overlap */}
          <div className="flex items-center gap-1 flex-shrink-0 mr-1">
            <button
              onClick={togglePlayPause}
              className={`
                p-2 rounded-lg transition-colors touch-target
                ${isPlaying
                  ? 'bg-accent-primary text-text-inverse'
                  : 'bg-dark-bgTertiary text-text-primary hover:bg-dark-bgHover'
                }
              `}
            >
              {isPlaying ? <Square size={18} /> : <Play size={18} />}
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-text-muted font-mono">PAT</span>
            <span className="text-sm font-bold text-accent-primary font-mono">
              {(currentPatternIndex + 1).toString().padStart(2, '0')}
            </span>
          </div>

          <span className="text-xs text-text-secondary truncate max-w-[40px] hidden sm:inline">
            {pattern?.name || 'Untitled'}
          </span>

          {/* Portrait mode: Channel selector */}
          {isPortrait && (
            <div
              className="flex items-center gap-1 ml-1 pl-1 border-l border-dark-border touch-none"
              {...channelHeaderGestures}
            >
              <button
                onClick={handleChannelPrev}
                disabled={mobileChannel === 0}
                className="p-1 rounded bg-dark-bgTertiary disabled:opacity-30 touch-target-sm"
                aria-label="Previous channel"
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
                aria-label="Next channel"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Instrument selector */}
          <div className="ml-1 pl-1 border-l border-dark-border flex-1 min-w-0">
            <select
              value={currentInstrumentId ?? 1}
              onChange={(e) => setCurrentInstrument(parseInt(e.target.value, 10))}
              className="w-full text-xs bg-dark-bgTertiary border border-dark-border rounded px-2 py-1 text-text-primary font-mono truncate"
              style={{ maxWidth: '120px' }}
            >
              {instruments.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name.substring(0, 20)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right spacer for the fixed hamburger menu button */}
        <div className="w-12 flex-shrink-0" />
      </div>

      {/* Main content area - Pattern/Instruments/Controls tabs */}
      <div className="flex-1 min-h-0 overflow-hidden" style={{ paddingBottom: activeTab === 'pattern' ? `calc(${isInputCollapsed ? '56px' : '180px'} + env(safe-area-inset-bottom, 0px))` : 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
        {activeTab === 'pattern' && (
          <div className="h-full flex flex-col">
            {/* Pattern editor canvas - scrollable */}
            <div className="flex-1 overflow-auto">
              <PatternEditorCanvas
                visibleChannels={visibleChannels}
                startChannel={startChannel}
                onSwipeLeft={handlePatternSwipeLeft}
                onSwipeRight={handlePatternSwipeRight}
              />
            </div>
          </div>
        )}

        {activeTab === 'instruments' && (
          <div className="h-full overflow-y-auto">
            {/* TB303 Knobs and Toolbar - Moved from 'controls' tab */}
            <div className="p-4 border-b border-dark-border bg-dark-bgSecondary">
              <div className="mb-4">
                <h3 className="text-xs font-bold text-text-muted uppercase mb-3 flex items-center gap-2">
                  <SlidersHorizontal size={14} className="text-accent-primary" />
                  Live Controls
                </h3>
                <TB303KnobPanel />
              </div>
              
              <div>
                <h3 className="text-xs font-bold text-text-muted uppercase mb-3 flex items-center gap-2">
                  <Settings size={14} className="text-accent-secondary" />
                  Tracker Actions
                </h3>
                <FT2Toolbar
                  onShowPatterns={onShowPatterns}
                  onShowExport={onShowExport}
                  onShowHelp={onShowHelp}
                  onShowMasterFX={onShowMasterFX}
                  onShowInstruments={onShowInstruments}
                  showPatterns={showPatterns}
                  showMasterFX={showMasterFX}
                />
              </div>
            </div>

            <div className="p-2">
              <h3 className="text-xs font-bold text-text-muted uppercase mb-3 px-2 flex items-center gap-2">
                <Music2 size={14} className="text-accent-primary" />
                Instrument List
              </h3>
              <InstrumentList
                variant="ft2"
                showPreviewOnClick={true}
                showPresetButton={true}
                showSamplePackButton={true}
                showEditButton={true}
                onEditInstrument={onShowInstruments}
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile pattern input - only shown in pattern view */}
      {activeTab === 'pattern' && (
        <MobilePatternInput
          onNoteInput={handleNoteInput}
          onHexInput={handleHexInput}
          onDelete={handleDelete}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onCollapseChange={setIsInputCollapsed}
        />
      )}

      {/* Bottom tab bar */}
      <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default MobileTrackerView;
