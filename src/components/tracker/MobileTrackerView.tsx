/**
 * MobileTrackerView - Mobile-optimized tracker interface
 * Vivid Tracker-inspired mobile layout with context-aware bottom input
 */

import React, { useState, useCallback } from 'react';
import * as Tone from 'tone';
import { MobileTabBar } from '@components/layout/MobileTabBar';
import { PatternEditorCanvas } from './PatternEditorCanvas';
import { InstrumentList } from '@components/instruments/InstrumentList';
import { TB303KnobPanel } from './TB303KnobPanel';
import { FT2Toolbar } from './FT2Toolbar';
import { MobilePatternInput } from './mobile/MobilePatternInput';
import { Play, Square, ChevronLeft, ChevronRight, Music2, SlidersHorizontal, Cpu } from 'lucide-react';
import { useTransportStore, useTrackerStore, useInstrumentStore } from '@stores';
import { SYSTEM_PRESETS } from '@/constants/systemPresets';
import { useOrientation } from '@/hooks/useOrientation';
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
  const { patterns, currentPatternIndex, cursor, setCell, moveCursor, moveCursorToRow, recordMode, editStep, copySelection, cutSelection, paste, applySystemPreset } = useTrackerStore();
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
    setCell(cursor.channelIndex, cursor.rowIndex, {
      note,
      instrument: currentInstrumentId ?? 1,
    });
    // Advance cursor by editStep rows when in record mode
    if (recordMode && editStep > 0) {
      const patternLength = patterns[currentPatternIndex]?.length ?? 64;
      moveCursorToRow((cursor.rowIndex + editStep) % patternLength);
    }
  }, [cursor, setCell, currentInstrumentId, recordMode, editStep, patterns, currentPatternIndex, moveCursorToRow]);

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
              onClick={() => { Tone.start(); togglePlayPause().catch(console.error); }}
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
          <div className="ml-1 pl-1 border-l border-dark-border flex items-center gap-1 min-w-0">
            <select
              value={currentInstrumentId ?? 1}
              onChange={(e) => setCurrentInstrument(parseInt(e.target.value, 10))}
              className="text-[10px] bg-dark-bgTertiary border border-dark-border rounded px-1.5 py-1 text-text-primary font-mono truncate"
              style={{ maxWidth: '80px' }}
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
                {SYSTEM_PRESETS.map(preset => (
                  <option key={preset.id} value={preset.id}>{preset.name.split(' ')[0].toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right spacer for the fixed hamburger menu button */}
        <div className="w-12 flex-shrink-0" />
      </div>

      {/* Main content area - Pattern/Instruments/Controls tabs */}
      <div className="flex-1 min-h-0 relative">
        {activeTab === 'pattern' && (
          <div 
            className="h-full flex flex-col"
            style={{ 
              paddingBottom: `calc(${isInputCollapsed ? '56px' : '180px'} + env(safe-area-inset-bottom, 0px))` 
            }}
          >
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
          <div className="h-full flex flex-col">
            {/* Sticky Header for Instruments Tab */}
            <div className="flex-shrink-0 sticky top-0 z-10 bg-dark-bg/95 backdrop-blur-md border-b border-dark-border shadow-lg">
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-1.5">
                    <SlidersHorizontal size={12} className="text-accent-primary" />
                    Live Ops
                  </h3>
                  <div className="h-px flex-1 bg-dark-border mx-3 opacity-30" />
                </div>
                <div className="overflow-x-auto pb-1 no-scrollbar">
                  <FT2Toolbar
                    onShowPatterns={onShowPatterns}
                    onShowExport={onShowExport}
                    onShowHelp={onShowHelp}
                    onShowMasterFX={onShowMasterFX}
                    onShowInstruments={onShowInstruments}
                    showPatterns={showPatterns}
                    showMasterFX={showMasterFX}
                    compact={true}
                  />
                </div>
              </div>
            </div>

            {/* Scrollable Instrument List */}
            <div 
              className="flex-1 overflow-y-auto p-2"
              style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
            >
              <div className="mb-4">
                <TB303KnobPanel />
              </div>
              
              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3 px-2 flex items-center gap-1.5">
                <Music2 size={12} className="text-accent-primary" />
                Instruments
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
