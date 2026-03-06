/**
 * JamCrackerView — Pattern viewer for JamCracker Pro (.jam) files.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (format, speed, song position)           │
 * ├──────────────────────────────────────────────────┤
 * │ Song Order List (~120px)                         │
 * ├──────────────────────────────────────────────────┤
 * │ Pattern Viewer (4 channels, fills remaining)     │
 * └──────────────────────────────────────────────────┘
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTrackerStore , useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { FormatPatternEditor } from '@/components/shared/FormatPatternEditor';
import { JAMCRACKER_COLUMNS } from './jamcrackerAdapter';
import { JamCrackerEngine } from '@engine/jamcracker/JamCrackerEngine';

const TOOLBAR_H = 36;
const ORDER_H = 120;
const PATTERN_H_MIN = 200;

interface JCSongInfo {
  songLen: number;
  numPats: number;
  numInst: number;
  entries: number[];
}

interface JCPatternRow {
  period: number;
  instr: number;
  speed: number;
  arpeggio: number;
  vibrato: number;
  phase: number;
  volume: number;
  porta: number;
}

interface JCPatternData {
  numRows: number;
  rows: JCPatternRow[][];
}

export const JamCrackerView: React.FC = () => {
  const jamCrackerFileData = useFormatStore(s => s.jamCrackerFileData);
  const currentPos = useTrackerStore(s => s.currentPositionIndex);
  const currentRow = useTransportStore(s => s.currentRow);
  const speed = useTransportStore(s => s.speed);
  const isPlaying = useTransportStore(s => s.isPlaying);

  const [songInfo, setSongInfo] = useState<JCSongInfo | null>(null);
  const [patternData, setPatternData] = useState<JCPatternData | null>(null);
  const [editPos, setEditPos] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const containerRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef<HTMLDivElement>(null);

  const activePos = isPlaying ? currentPos : editPos;

  // Fetch song structure once loaded
  useEffect(() => {
    if (!jamCrackerFileData) { setSongInfo(null); return; }
    if (!JamCrackerEngine.hasInstance()) return;
    const engine = JamCrackerEngine.getInstance();
    engine.getSongStructure().then(setSongInfo);
  }, [jamCrackerFileData]);

  // Fetch pattern data when position changes
  useEffect(() => {
    if (!songInfo || !JamCrackerEngine.hasInstance()) return;
    const patIdx = songInfo.entries[activePos];
    if (patIdx === undefined) return;
    const engine = JamCrackerEngine.getInstance();
    engine.getPatternData(patIdx).then(setPatternData);
  }, [songInfo, activePos]);

  // FormatPatternEditor handles its own scrolling during playback

  // Measure container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 });
    return () => ro.disconnect();
  }, []);

  // Auto-scroll order list to current position
  useEffect(() => {
    if (!orderRef.current || !isPlaying) return;
    const el = orderRef.current;
    const itemW = 44;
    const targetLeft = activePos * itemW - el.clientWidth / 2 + itemW / 2;
    el.scrollLeft = Math.max(0, targetLeft);
  }, [activePos, isPlaying]);

  const patIdx = songInfo ? songInfo.entries[activePos] ?? -1 : -1;
  const numRows = patternData?.numRows ?? 0;

  // Compute format channels from pattern data
  const channels = useMemo(() => {
    if (!patternData) return [];
    // Convert JamCracker pattern rows to FormatChannel[]
    const patternArray = patternData.rows || [];
    const result = [];
    for (let ch = 0; ch < 4; ch++) {
      const rows = [];
      if (patternArray[ch]) {
        for (const cell of patternArray[ch]) {
          rows.push({
            period: cell?.period || 0,
            instrument: cell?.instr || 0,
            speed: cell?.speed || 0,
            arpeggio: cell?.arpeggio || 0,
            vibrato: cell?.vibrato || 0,
            volume: cell?.volume || 0,
            porta: cell?.porta || 0,
          });
        }
      }
      result.push({
        label: `CH${ch + 1}:P${patIdx.toString().padStart(2, '0')}`,
        patternLength: numRows || 32,
        rows,
      });
    }
    return result;
  }, [patternData, patIdx, numRows]);

  const handleCellChange = useCallback((channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
    if (!JamCrackerEngine.hasInstance() || patIdx < 0) return;
    const engine = JamCrackerEngine.getInstance();
    // Map column key to field index for setPatternCell
    const fieldMap: Record<string, number> = {
      period: 0,
      instrument: 1,
      speed: 2,
      arpeggio: 3,
      vibrato: 4,
      volume: 5,
      porta: 6,
    };
    const fieldIdx = fieldMap[columnKey] ?? 0;
    engine.setPatternCell(patIdx, rowIdx, channelIdx, fieldIdx, value);
    engine.getPatternData(patIdx).then(setPatternData);
  }, [patIdx]);

  const handleExport = useCallback(async () => {
    if (!JamCrackerEngine.hasInstance()) return;
    const engine = JamCrackerEngine.getInstance();
    const data = await engine.save();
    if (data.length === 0) return;
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.jam';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);


  if (!jamCrackerFileData) {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono items-center justify-center">
        <span className="text-ft2-textDim">No JamCracker module loaded</span>
      </div>
    );
  }

  const toolbarInfo = [
    `Speed: ${speed ?? 6}`,
    `Patterns: ${songInfo?.numPats ?? '?'}`,
    `Instruments: ${songInfo?.numInst ?? '?'}`,
    `Pos: ${activePos}/${songInfo?.songLen ?? '?'}`,
    patIdx >= 0 ? `Pat: ${patIdx}` : '',
  ].filter(Boolean).join('  |  ');

  const { w: width, h: height } = size;
  const editorH = Math.max(PATTERN_H_MIN, height - TOOLBAR_H - ORDER_H);

  return (
    <div
      ref={containerRef}
      className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 border-b border-ft2-border bg-dark-bgSecondary" style={{ height: TOOLBAR_H }}>
        <span className="text-xs font-bold text-yellow-300">JAM</span>
        <span className="text-ft2-textDim">|</span>
        <span className="text-xs text-ft2-textDim">{toolbarInfo}</span>
        <div className="flex-1" />
        <button
          className="px-2 py-0.5 text-xs bg-green-800 hover:bg-green-700 text-green-100 rounded border border-green-600"
          onClick={handleExport}
        >Export .jam</button>
      </div>

      {/* Song order list */}
      <div className="border-b border-ft2-border" style={{ height: ORDER_H }}>
        <div className="px-3 pt-2 pb-1">
          <span className="text-xs text-ft2-textDim">Song Order</span>
        </div>
        <div
          ref={orderRef}
          className="px-3 pb-2 flex gap-1 overflow-x-auto"
          style={{ maxHeight: ORDER_H - 30 }}
        >
          {songInfo?.entries.map((entry, idx) => (
            <button
              key={idx}
              onClick={() => { if (!isPlaying) setEditPos(idx); }}
              className={`flex-shrink-0 w-10 h-8 text-xs font-mono rounded border flex items-center justify-center ${
                idx === activePos
                  ? 'bg-accent-primary/20 border-accent-primary text-accent-primary font-bold'
                  : 'bg-dark-bgSecondary border-dark-border text-ft2-textDim hover:border-ft2-text/30'
              }`}
            >
              {entry.toString(16).toUpperCase().padStart(2, '0')}
            </button>
          )) ?? <span className="text-ft2-textDim text-xs">Loading...</span>}
        </div>
      </div>

      {/* Pattern editor */}
      <div className="flex-1 min-h-0">
        {patternData && channels.length > 0 ? (
          <FormatPatternEditor
            width={width}
            height={editorH}
            columns={JAMCRACKER_COLUMNS}
            channels={channels}
            currentRow={currentRow}
            isPlaying={isPlaying}
            onCellChange={handleCellChange}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-ft2-textDim text-xs">Loading pattern data...</span>
          </div>
        )}
      </div>
    </div>
  );
};
