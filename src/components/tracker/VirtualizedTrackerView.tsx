import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTrackerStore, useTransportStore, useInstrumentStore, useUIStore } from '@stores';
import { useAnimationFrame } from '@hooks/useAnimationCoordinator';
import { NoteCell } from './NoteCell';
import { InstrumentCell } from './InstrumentCell';
import { VolumeCell } from './VolumeCell';
import { EffectCell } from './EffectCell';
import { AccentCell } from './AccentCell';
import { SlideCell } from './SlideCell';
import { AutomationLanes } from './AutomationLanes';
import { ChannelVUMeters } from './ChannelVUMeters';
import { CellContextMenu } from './CellContextMenu';
import { VolumeX, Headphones, Circle } from 'lucide-react';
import { HumanizeDialog } from '@components/dialogs/HumanizeDialog';
import { InterpolateDialog } from '@components/dialogs/InterpolateDialog';

const ROW_HEIGHT = 24; // Modern height
const ROW_NUMBER_WIDTH = 48;
const HEADER_HEIGHT = 32;
const OVERSCAN_ROW_COUNT = 16;
const GHOST_ROWS = 16;

const COLUMN_WIDTH_BASE = 120;

const VirtualizedTrackerViewComponent: React.FC = () => {
  // PERFORMANCE OPTIMIZATION: Use individual selectors instead of destructuring
  // This prevents re-renders when unrelated state changes
  const pattern = useTrackerStore((state) => state.patterns[state.currentPatternIndex]);
  const currentPatternIndex = useTrackerStore((state) => state.currentPatternIndex);
  const patterns = useTrackerStore((state) => state.patterns);
  const cursor = useTrackerStore((state) => state.cursor);
  const columnVisibility = useTrackerStore((state) => state.columnVisibility);
  const showGhostPatterns = useTrackerStore((state) => state.showGhostPatterns);
  const selection = useTrackerStore((state) => state.selection);
  const recordMode = useTrackerStore((state) => state.recordMode);
  const editStep = useTrackerStore((state) => state.editStep);
  const followPlayback = useTrackerStore((state) => state.followPlayback);

  // Get actions (these don't cause re-renders)
  const setCell = useTrackerStore((state) => state.setCell);
  const toggleChannelMute = useTrackerStore((state) => state.toggleChannelMute);
  const toggleChannelSolo = useTrackerStore((state) => state.toggleChannelSolo);
  const startSelection = useTrackerStore((state) => state.startSelection);
  const updateSelection = useTrackerStore((state) => state.updateSelection);
  const endSelection = useTrackerStore((state) => state.endSelection);
  const clearSelection = useTrackerStore((state) => state.clearSelection);
  const selectChannel = useTrackerStore((state) => state.selectChannel);
  const moveCursorToChannel = useTrackerStore((state) => state.moveCursorToChannel);
  const moveCursorToRow = useTrackerStore((state) => state.moveCursorToRow);

  // Transport store selectors
  const currentRow = useTransportStore((state) => state.currentRow);
  const isPlaying = useTransportStore((state) => state.isPlaying);
  const smoothScrolling = useTransportStore((state) => state.smoothScrolling);
  const bpm = useTransportStore((state) => state.bpm);

  // Instrument store selector
  const instruments = useInstrumentStore((state) => state.instruments);

  const containerRef = useRef<HTMLDivElement>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowIndex: number; channelIndex: number } | null>(null);
  const [showInterpolate, setShowInterpolate] = useState(false);
  const [showHumanize, setShowHumanize] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const scrollIntervalRef = useRef<number | null>(null);
  const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);

  const [smoothOffset, setSmoothOffset] = useState(0);
  const startTimeRef = useRef<number>(0);

  // Sync cursor to playback
  useEffect(() => {
    if (isPlaying && followPlayback && currentRow !== cursor.rowIndex) {
      moveCursorToRow(currentRow);
    }
  }, [isPlaying, followPlayback, currentRow, cursor.rowIndex, moveCursorToRow]);

  // Check performance quality for smooth scrolling
  const performanceQuality = useUIStore((state) => state.performanceQuality);
  const smoothScrollingEnabled = smoothScrolling && performanceQuality === 'high';

  // Reset smooth scroll animation when currentRow changes
  useEffect(() => {
    if (isPlaying && smoothScrollingEnabled) {
      startTimeRef.current = performance.now();
      setSmoothOffset(0);
    } else {
      setSmoothOffset(0);
    }
  }, [currentRow, isPlaying, smoothScrollingEnabled]);

  // Centralized smooth scroll animation (only on high quality)
  useAnimationFrame(
    'pattern-smooth-scroll',
    isPlaying && smoothScrollingEnabled ? () => {
      const speed = 6;
      const secondsPerRow = (2.5 / bpm) * speed;
      const durationMs = secondsPerRow * 1000;
      const elapsed = performance.now() - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      setSmoothOffset(progress);
    } : null,
    [isPlaying, smoothScrollingEnabled, bpm]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setDimensions({ width: container.clientWidth, height: container.clientHeight });
    update();
    const obs = new ResizeObserver(update);
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        endSelection();
      }

      // Clean up scroll interval
      if (scrollIntervalRef.current) {
        window.clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }

      // Clean up mousemove listener
      if (mouseMoveHandlerRef.current) {
        window.removeEventListener('mousemove', mouseMoveHandlerRef.current);
        mouseMoveHandlerRef.current = null;
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      // Ensure cleanup happens even on unmount
      if (scrollIntervalRef.current) {
        window.clearInterval(scrollIntervalRef.current);
      }
      if (mouseMoveHandlerRef.current) {
        window.removeEventListener('mousemove', mouseMoveHandlerRef.current);
      }
    };
  }, [isDragging, endSelection]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => setScrollLeft(e.currentTarget.scrollLeft);

  const handleCellMouseDown = useCallback((channelIndex: number, rowIndex: number) => {
    moveCursorToChannel(channelIndex);
    moveCursorToRow(rowIndex);
    clearSelection();
    startSelection();
    setIsDragging(true);
  }, [moveCursorToChannel, moveCursorToRow, clearSelection, startSelection]);

  const handleCellMouseEnter = useCallback((channelIndex: number, rowIndex: number) => {
    if (!isDragging) return;
    updateSelection(channelIndex, rowIndex);
    const container = containerRef.current;
    if (!container) return;

    // Clean up previous scroll interval
    if (scrollIntervalRef.current) {
      window.clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    // Clean up previous mousemove listener to prevent memory leak
    if (mouseMoveHandlerRef.current) {
      window.removeEventListener('mousemove', mouseMoveHandlerRef.current);
      mouseMoveHandlerRef.current = null;
    }

    const rect = container.getBoundingClientRect();
    const threshold = 40;
    const checkScroll = (clientY: number) => {
      let speed = 0;
      if (clientY < rect.top + threshold) speed = -10;
      else if (clientY > rect.bottom - threshold) speed = 10;
      if (speed !== 0 && !scrollIntervalRef.current) {
        scrollIntervalRef.current = window.setInterval(() => { container.scrollTop += speed; }, 16);
      } else if (speed === 0 && scrollIntervalRef.current) {
        window.clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    };

    // Store the handler so we can clean it up later
    const move = (e: MouseEvent) => checkScroll(e.clientY);
    mouseMoveHandlerRef.current = move;
    window.addEventListener('mousemove', move);
  }, [isDragging, updateSelection]);

  const numRowsTotal = (pattern?.length || 64) + (showGhostPatterns ? GHOST_ROWS * 2 : 0);
  const getColumnWidth = useMemo(() => (index: number) =>
    index === 0 ? ROW_NUMBER_WIDTH : COLUMN_WIDTH_BASE,
  []);

  const rowVirtualizer = useVirtualizer({
    count: numRowsTotal, getScrollElement: () => containerRef.current, estimateSize: () => ROW_HEIGHT, overscan: OVERSCAN_ROW_COUNT,
  });
  const columnVirtualizer = useVirtualizer({
    count: (pattern?.channels.length || 0) + 1, getScrollElement: () => containerRef.current, estimateSize: getColumnWidth, horizontal: true,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualColumns = columnVirtualizer.getVirtualItems();

  useEffect(() => {
    if (isPlaying) {
      const baseIdx = showGhostPatterns ? currentRow + GHOST_ROWS : currentRow;
      if (smoothScrollingEnabled) {
        const offset = (baseIdx + smoothOffset) * ROW_HEIGHT - (dimensions.height / 2) + (ROW_HEIGHT / 2);
        containerRef.current?.scrollTo({ top: offset, behavior: 'auto' });
      } else {
        rowVirtualizer.scrollToIndex(baseIdx, { align: 'center', behavior: 'auto' });
      }
    } else {
      const idx = cursor.rowIndex;
      rowVirtualizer.scrollToIndex(showGhostPatterns ? idx + GHOST_ROWS : idx, { align: 'center' });
    }
  }, [cursor.rowIndex, currentRow, isPlaying, rowVirtualizer, showGhostPatterns, smoothScrollingEnabled, smoothOffset, dimensions.height]);

  if (!pattern) return <div className="flex-1 flex items-center justify-center text-text-muted font-mono">No pattern loaded</div>;

  const selectionInfo = selection ? { rows: Math.abs(selection.endRow - selection.startRow) + 1, channels: Math.abs(selection.endChannel - selection.startChannel) + 1 } : null;

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 relative overflow-auto bg-dark-bg font-mono text-sm scrollbar-modern" style={{ scrollBehavior: 'auto' }}>
      {/* 1. STICKY HEADER */}
      <div className="sticky top-0 z-50 flex items-center bg-dark-bgTertiary border-b-2 border-dark-border shadow-md" style={{ height: HEADER_HEIGHT, width: columnVirtualizer.getTotalSize(), transform: `translateX(${-scrollLeft}px)` }}>
        <div className="flex-shrink-0 px-2 py-1 text-text-primary text-xs font-bold text-center border-r border-dark-border bg-dark-bgTertiary" style={{ width: ROW_NUMBER_WIDTH, position: 'sticky', left: 0, zIndex: 60 }}>#</div>
        {virtualColumns.map((vCol) => {
          if (vCol.index === 0) return null;
          const chIdx = vCol.index - 1;
          const ch = pattern.channels[chIdx];
          if (!ch) return null;
          const isCurCh = cursor.channelIndex === chIdx;
          const inst = instruments.find((i: any) => i.id === ch.instrumentId);
          return (
            <div key={vCol.key} className={`flex flex-col border-r border-dark-border group transition-colors ${isCurCh ? 'bg-dark-bgActive/50' : 'bg-dark-bgTertiary'}`} style={{ width: vCol.size, height: HEADER_HEIGHT, transform: `translateX(${vCol.start}px)`, position: 'absolute', top: 0, left: 0, borderBottom: isCurCh ? '2px solid var(--color-accent)' : undefined }}>
              <div className="flex items-center justify-between px-2 h-1/2 overflow-hidden border-b border-white/5">
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`text-[10px] font-bold ${isCurCh ? 'text-accent-primary' : 'text-text-primary'}`}>{`CH${chIdx + 1}`}</span>
                  {inst && <span className="text-[8px] opacity-60 truncate font-mono uppercase tracking-tighter">{inst.name}</span>}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); toggleChannelMute(chIdx); }} className={`p-0.5 rounded ${ch.muted ? 'text-accent-error' : 'text-text-muted'}`}><VolumeX size={12} /></button>
                  <button onClick={(e) => { e.stopPropagation(); toggleChannelSolo(chIdx); }} className={`p-0.5 rounded ${ch.solo ? 'text-accent-primary' : 'text-text-muted'}`}><Headphones size={12} /></button>
                </div>
              </div>
              <div className="h-1/2 w-full relative bg-dark-bg/20 overflow-hidden">
                <div className="absolute inset-0 px-1 py-0.5 opacity-50">
                  <ChannelVUMeters />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. VIRTUALIZED AREA */}
      <div style={{ height: rowVirtualizer.getTotalSize(), width: columnVirtualizer.getTotalSize(), position: 'relative' }}>
        {/* Sticky Overlays Container */}
        <div className="sticky top-0 left-0 w-full h-0 z-30 pointer-events-none overflow-visible">
          {/* Edit Bar - Modern Cyan Highlight */}
          <div className="absolute z-10" style={{ top: (dimensions.height / 2) - (ROW_HEIGHT / 2) - (HEADER_HEIGHT / 2), width: columnVirtualizer.getTotalSize(), height: ROW_HEIGHT, backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', borderTop: '1px solid var(--color-accent)', borderBottom: '1px solid var(--color-accent)', boxShadow: '0 0 15px var(--color-accent-glow)', transform: `translateX(${-scrollLeft}px)` }} />
        </div>

        {/* HUD */}
        <div className="sticky bottom-0 w-full h-0 pointer-events-none z-50 overflow-visible" style={{ transform: `translateX(${scrollLeft}px)` }}>
          <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2" style={{ width: 'max-content' }}>
            {selection && selectionInfo && (
              <div className="px-3 py-1.5 rounded border border-accent-primary/50 bg-dark-bgSecondary/90 text-accent-primary flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-200 pointer-events-auto shadow-xl">
                <div className="flex flex-col"><span className="text-[10px] font-bold leading-none">BLOCK: {selectionInfo.rows}x{selectionInfo.channels}</span><span className="text-[8px] opacity-70 font-mono tracking-tight">R{Math.min(selection.startRow, selection.endRow)}-{Math.max(selection.startRow, selection.endRow)} | C{Math.min(selection.startChannel, selection.endChannel)}-{Math.max(selection.startChannel, selection.endChannel)}</span></div>
                <button onClick={(e) => { e.stopPropagation(); clearSelection(); }} className="p-1 hover:bg-accent-primary/20 rounded text-accent-primary"><Circle size={12} className="rotate-45" strokeWidth={3} /></button>
              </div>
            )}
            <div className="flex items-center gap-2 pointer-events-auto">
              <div className={`px-2 py-1 rounded border flex items-center gap-2 bg-dark-bgSecondary/80 ${recordMode ? 'border-accent-error/50 text-accent-error' : 'border-dark-border text-text-muted'}`}><Circle size={10} fill={recordMode ? 'currentColor' : 'transparent'} /><span className="text-[10px] font-bold tracking-wider uppercase">{recordMode ? 'REC' : 'EDIT'}</span></div>
              <div className="px-2 py-1 rounded border border-dark-border bg-dark-bgSecondary/80 text-text-muted"><span className="text-[10px] font-bold">STEP: {editStep}</span></div>
            </div>
          </div>
        </div>

        {/* Automation Overlay */}
        <div style={{ position: 'absolute', top: showGhostPatterns ? GHOST_ROWS * ROW_HEIGHT : 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 15 }}>
          <AutomationLanes patternId={pattern.id} patternLength={pattern.length} rowHeight={ROW_HEIGHT} channelCount={pattern.channels.length} channelWidth={COLUMN_WIDTH_BASE} rowNumWidth={ROW_NUMBER_WIDTH} scrollOffset={0} prevPatternId={currentPatternIndex > 0 ? patterns[currentPatternIndex - 1].id : undefined} nextPatternId={currentPatternIndex < patterns.length - 1 ? patterns[currentPatternIndex + 1].id : undefined} prevPatternLength={currentPatternIndex > 0 ? patterns[currentPatternIndex - 1].length : undefined} nextPatternLength={currentPatternIndex < patterns.length - 1 ? patterns[currentPatternIndex + 1].length : undefined} />
        </div>

        {/* Rows */}
        {virtualRows.map((vRow) => {
          const rIdx = showGhostPatterns ? vRow.index - GHOST_ROWS : vRow.index;
          let dPatt = pattern, dRIdx = rIdx, isG = false;
          
          if (rIdx < 0) {
            if (currentPatternIndex > 0) { 
              dPatt = patterns[currentPatternIndex - 1]; 
              dRIdx = dPatt.length + rIdx; 
              isG = true; 
            } else {
              return <div key={vRow.key} data-index={vRow.index} ref={rowVirtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: vRow.size, transform: `translateY(${vRow.start}px)`, borderBottom: '1px dashed rgba(255,255,255,0.05)' }} />;
            }
          } else if (rIdx >= pattern.length) {
            if (currentPatternIndex < patterns.length - 1) { 
              dPatt = patterns[currentPatternIndex + 1]; 
              dRIdx = rIdx - pattern.length; 
              isG = true; 
            } else {
              return <div key={vRow.key} data-index={vRow.index} ref={rowVirtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: vRow.size, transform: `translateY(${vRow.start}px)`, borderTop: '1px dashed rgba(255,255,255,0.05)' }} />;
            }
          }

          return (
            <div key={vRow.key} data-index={vRow.index} ref={rowVirtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: vRow.size, transform: `translateY(${vRow.start}px)`, display: 'flex', pointerEvents: isG ? 'none' : 'auto' }}>
              <div onClick={() => { if (!isG) moveCursorToRow(rIdx); }} className={`flex-shrink-0 flex items-center justify-center text-xs font-mono font-bold border-r border-dark-border cursor-pointer transition-colors ${!isG && isPlaying && currentRow === rIdx ? 'bg-accent-primary text-text-inverse' : 'bg-dark-bgSecondary text-text-muted'} ${!isG && cursor.rowIndex === rIdx ? 'ring-1 ring-inset ring-accent-primary/30 bg-dark-bgActive' : ''} ${isG ? 'opacity-20' : 'hover:bg-dark-border hover:text-text-primary'}`} style={{ width: ROW_NUMBER_WIDTH, height: vRow.size, position: 'sticky', left: 0, zIndex: 1 }}>{dRIdx.toString(16).toUpperCase().padStart(2, '0')}</div>
              {virtualColumns.map((vCol) => {
                if (vCol.index === 0) return null;
                const chIdx = vCol.index - 1;
                const ch = dPatt.channels[chIdx];
                if (!ch) return null;
                const cell = ch.rows[dRIdx];
                const isCurRow = !isG && cursor.rowIndex === rIdx;
                const isCurCh = !isG && cursor.channelIndex === chIdx;
                const isSel = !isG && selection && rIdx >= Math.min(selection.startRow, selection.endRow) && rIdx <= Math.max(selection.startRow, selection.endRow) && chIdx >= Math.min(selection.startChannel, selection.endChannel) && chIdx <= Math.max(selection.startChannel, selection.endChannel);
                
                // Use default time signature 4/16 (4 steps per beat, 16 steps per measure)
                const stepsPerBeat = 4;
                const stepsPerMeasure = stepsPerBeat * 4;
                
                const isRowHigh = dRIdx % stepsPerMeasure === 0;
                const isBeatHigh = dRIdx % stepsPerBeat === 0;
                
                const cellBg = isG 
                  ? 'bg-dark-bgTertiary/20' 
                  : isSel ? 'bg-accent-primary/20' 
                  : (!isG && isPlaying && currentRow === rIdx) ? 'bg-dark-bgActive' 
                  : isCurRow ? 'bg-dark-bgActive/30' 
                  : isCurCh ? 'bg-dark-bgActive/10' 
                  : isRowHigh ? 'bg-dark-bgSecondary/60' 
                  : isBeatHigh ? 'bg-dark-bgSecondary/30' 
                  : 'bg-dark-bg';

                return (
                  <div key={vCol.key} onMouseDown={() => handleCellMouseDown(chIdx, rIdx)} onMouseEnter={() => handleCellMouseEnter(chIdx, rIdx)} onDoubleClick={() => selectChannel(chIdx)} onContextMenu={(e) => { if (isG) return; e.preventDefault(); if (!isSel) { moveCursorToChannel(chIdx); moveCursorToRow(rIdx); clearSelection(); startSelection(); } setContextMenu({ x: e.clientX, y: e.clientY, rowIndex: rIdx, channelIndex: chIdx }); }} className={`flex items-center gap-0.5 px-2 border-r border-dark-border text-xs font-mono cursor-cell transition-colors ${cellBg} ${!isG && isCurRow && isCurCh ? 'ring-1 ring-inset ring-accent-primary z-10' : ''} ${isSel ? 'ring-1 ring-inset ring-accent-primary/50' : ''}`} style={{ width: vCol.size, height: vRow.size, transform: `translateX(${vCol.start}px)`, position: 'absolute', top: 0, left: 0, backgroundColor: !isG && !isSel && ch.color && !(!isG && isPlaying && currentRow === rIdx) ? `${ch.color}10` : undefined }}>
                    <div className={`flex items-center gap-0.5 w-full ${isG ? 'opacity-20 grayscale' : ''}`}>
                      {columnVisibility.note && <NoteCell value={cell?.note ?? 0} isActive={!isG && isCurRow && isCurCh && cursor.columnType === 'note'} isEmpty={!cell || cell.note === 0} isNoteOff={cell?.note === 97} />}
                      {columnVisibility.instrument && <InstrumentCell value={cell?.instrument ?? 0} isActive={!isG && isCurRow && isCurCh && cursor.columnType === 'instrument'} isEmpty={!cell || cell.instrument === 0} />}
                      {columnVisibility.volume && <VolumeCell value={cell?.volume ?? 0} isActive={!isG && isCurRow && isCurCh && cursor.columnType === 'volume'} isEmpty={!cell || cell.volume === 0 || cell.volume < 0x10} />}
                      {columnVisibility.effect && <EffectCell effTyp={cell?.effTyp ?? 0} eff={cell?.eff ?? 0} isActive={!isG && isCurRow && isCurCh && (cursor.columnType === 'effTyp' || cursor.columnType === 'effParam')} isEmpty={!cell || (cell.effTyp === 0 && cell.eff === 0)} />}
                      {columnVisibility.effect2 && <EffectCell value={cell?.effect2} isActive={!isG && isCurRow && isCurCh && cursor.columnType === 'effect2'} isEmpty={!cell || !cell.effect2} />}
                      {columnVisibility.accent && <AccentCell value={cell?.accent} isActive={!isG && isCurRow && isCurCh && cursor.columnType === 'accent'} onToggle={() => !isG && setCell(chIdx, dRIdx, { accent: !cell.accent })} />}
                      {columnVisibility.slide && <SlideCell value={cell?.slide} isActive={!isG && isCurRow && isCurCh && cursor.columnType === 'slide'} onToggle={() => !isG && setCell(chIdx, dRIdx, { slide: !cell.slide })} />}
                    </div>
                    {!isG && isCurRow && isCurCh && <div className="absolute inset-0 border-2 border-accent-primary z-10 pointer-events-none shadow-[0_0_8px_var(--color-accent)]" />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {contextMenu && <CellContextMenu position={{ x: contextMenu.x, y: contextMenu.y }} onClose={() => setContextMenu(null)} rowIndex={contextMenu.rowIndex} channelIndex={contextMenu.channelIndex} onInterpolate={() => { setContextMenu(null); setShowInterpolate(true); }} onHumanize={() => { setContextMenu(null); setShowHumanize(true); }} />}
      <InterpolateDialog isOpen={showInterpolate} onClose={() => setShowInterpolate(false)} />
      <HumanizeDialog isOpen={showHumanize} onClose={() => setShowHumanize(false)} />
    </div>
  );
};

// PERFORMANCE: Wrap in React.memo to prevent unnecessary re-renders
export const VirtualizedTrackerView = React.memo(VirtualizedTrackerViewComponent);