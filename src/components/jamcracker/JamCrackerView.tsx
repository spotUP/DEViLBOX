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

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { JamCrackerEngine } from '@engine/jamcracker/JamCrackerEngine';

const TOOLBAR_H = 36;
const ORDER_H = 120;
const ROW_H = 18;

// JamCracker note periods mapped to note names (1-36 = C-1 to B-3)
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteStr(period: number): string {
  if (!period) return '---';
  if (period < 1 || period > 36) return '???';
  const n = period - 1;
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) + 1);
}

function hexByte(val: number): string {
  return val ? val.toString(16).toUpperCase().padStart(2, '0') : '--';
}

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
  const jamCrackerFileData = useTrackerStore(s => s.jamCrackerFileData);
  const currentPos = useTrackerStore(s => s.currentPositionIndex);
  const currentRow = useTransportStore(s => s.currentRow);
  const speed = useTransportStore(s => s.currentSpeed);
  const isPlaying = useTransportStore(s => s.isPlaying);

  const [songInfo, setSongInfo] = useState<JCSongInfo | null>(null);
  const [patternData, setPatternData] = useState<JCPatternData | null>(null);
  const [editPos, setEditPos] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Auto-scroll pattern to current row
  useEffect(() => {
    if (!scrollRef.current || !isPlaying) return;
    const el = scrollRef.current;
    const targetScrollTop = currentRow * ROW_H - el.clientHeight / 2 + ROW_H / 2;
    el.scrollTop = Math.max(0, targetScrollTop);
  }, [currentRow, isPlaying]);

  // Auto-scroll order list to current position
  useEffect(() => {
    if (!orderRef.current || !isPlaying) return;
    const el = orderRef.current;
    const itemW = 44;
    const targetLeft = activePos * itemW - el.clientWidth / 2 + itemW / 2;
    el.scrollLeft = Math.max(0, targetLeft);
  }, [activePos, isPlaying]);

  if (!jamCrackerFileData) {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono items-center justify-center">
        <span className="text-ft2-textDim">No JamCracker module loaded</span>
      </div>
    );
  }

  const patIdx = songInfo ? songInfo.entries[activePos] ?? -1 : -1;
  const numRows = patternData?.numRows ?? 0;

  const toolbarInfo = [
    `Speed: ${speed ?? 6}`,
    `Patterns: ${songInfo?.numPats ?? '?'}`,
    `Instruments: ${songInfo?.numInst ?? '?'}`,
    `Pos: ${activePos}/${songInfo?.songLen ?? '?'}`,
    patIdx >= 0 ? `Pat: ${patIdx}` : '',
  ].filter(Boolean).join('  |  ');

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 border-b border-ft2-border bg-dark-bgSecondary" style={{ height: TOOLBAR_H }}>
        <span className="text-xs font-bold text-yellow-300">JAM</span>
        <span className="text-ft2-textDim">|</span>
        <span className="text-xs text-ft2-textDim">{toolbarInfo}</span>
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

      {/* Pattern viewer */}
      <div className="flex-1 min-h-0">
        <div
          ref={scrollRef}
          style={{
            width: '100%',
            height: '100%',
            overflowY: 'auto',
            overflowX: 'auto',
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: `${ROW_H}px`,
            backgroundColor: '#0d0d0d',
            color: '#888',
          }}
        >
          {/* Header */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              display: 'flex',
              backgroundColor: '#1a1a1a',
              borderBottom: '1px solid #333',
              height: ROW_H + 2,
              alignItems: 'center',
            }}
          >
            <span style={{ width: 36, flexShrink: 0, textAlign: 'right', paddingRight: 6, color: '#555' }}>
              ROW
            </span>
            {[0, 1, 2, 3].map(ch => (
              <span
                key={ch}
                style={{
                  width: 200,
                  flexShrink: 0,
                  textAlign: 'center',
                  color: '#aaa',
                  fontSize: 11,
                  borderLeft: '1px solid #333',
                }}
              >
                CH{ch + 1}
              </span>
            ))}
          </div>

          {/* Pattern rows */}
          {patternData ? Array.from({ length: numRows }, (_, rowIdx) => {
            const isPlayhead = isPlaying && rowIdx === currentRow;
            const isEvenGroup = Math.floor(rowIdx / 4) % 2 === 0;
            return (
              <div
                key={rowIdx}
                style={{
                  display: 'flex',
                  height: ROW_H,
                  alignItems: 'center',
                  backgroundColor: isPlayhead ? '#1a3a1a' : isEvenGroup ? 'transparent' : '#0a0a0a',
                  borderBottom: rowIdx % 4 === 3 ? '1px solid #1e1e1e' : undefined,
                }}
              >
                <span style={{ width: 36, flexShrink: 0, textAlign: 'right', paddingRight: 6, color: rowIdx % 4 === 0 ? '#555' : '#333', fontSize: 11 }}>
                  {rowIdx.toString().padStart(3, '0')}
                </span>
                {patternData.rows[rowIdx]?.map((cell, chIdx) => {
                  const hasNote = cell.period > 0;
                  const hasInstr = cell.instr > 0;
                  const hasFx = cell.speed || cell.arpeggio || cell.vibrato || cell.phase || cell.volume || cell.porta;
                  return (
                    <span
                      key={chIdx}
                      style={{
                        width: 200,
                        flexShrink: 0,
                        display: 'flex',
                        gap: 4,
                        paddingLeft: 4,
                        paddingRight: 4,
                        borderLeft: '1px solid #1e1e1e',
                        color: (hasNote || hasInstr || hasFx) ? (isPlayhead ? '#88ff88' : '#cccccc') : '#333',
                      }}
                    >
                      <span style={{ width: 28 }}>{noteStr(cell.period)}</span>
                      <span style={{ width: 18, color: hasInstr ? '#ffaa44' : '#333' }}>{hexByte(cell.instr)}</span>
                      <span style={{ width: 18, color: cell.speed ? '#44aaff' : '#333' }}>{hexByte(cell.speed)}</span>
                      <span style={{ width: 18, color: cell.arpeggio ? '#aa44ff' : '#333' }}>{hexByte(cell.arpeggio)}</span>
                      <span style={{ width: 18, color: cell.vibrato ? '#44ffaa' : '#333' }}>{hexByte(cell.vibrato)}</span>
                      <span style={{ width: 18, color: cell.phase ? '#ff4444' : '#333' }}>{hexByte(cell.phase)}</span>
                      <span style={{ width: 18, color: cell.volume ? '#ffff44' : '#333' }}>{hexByte(cell.volume)}</span>
                      <span style={{ width: 18, color: cell.porta ? '#ff44aa' : '#333' }}>{hexByte(cell.porta)}</span>
                    </span>
                  );
                })}
              </div>
            );
          }) : (
            <div className="p-4 text-ft2-textDim text-xs">Loading pattern data...</div>
          )}
        </div>
      </div>
    </div>
  );
};
