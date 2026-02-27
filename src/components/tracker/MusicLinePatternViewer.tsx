/**
 * MusicLinePatternViewer — Read-only multi-channel pattern view for MusicLine mode.
 *
 * Shows all channels' note data simultaneously for the current song position.
 * Each channel plays a different "part" (1-channel pattern) at each position;
 * this viewer assembles them into a familiar side-by-side tracker grid.
 */

import React, { useRef, useEffect } from 'react';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteStr(note: number): string {
  if (!note) return '---';
  if (note === 97) return '===';
  const n = note - 1;
  return NOTE_NAMES[n % 12] + Math.floor(n / 12);
}

function instrStr(instr: number): string {
  return instr ? instr.toString(16).toUpperCase().padStart(2, '0') : '--';
}

const ROW_H = 18; // px per row — must match CSS

export const MusicLinePatternViewer: React.FC = () => {
  const channelTrackTables = useTrackerStore((s) => s.channelTrackTables);
  const patterns = useTrackerStore((s) => s.patterns);
  const currentPos = useTrackerStore((s) => s.currentPositionIndex);
  const currentRow = useTransportStore((s) => s.currentRow);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep current row in view during playback
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const targetScrollTop = currentRow * ROW_H - el.clientHeight / 2 + ROW_H / 2;
    el.scrollTop = Math.max(0, targetScrollTop);
  }, [currentRow]);

  if (!channelTrackTables || channelTrackTables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-xs">
        No channel data
      </div>
    );
  }

  // Resolve each channel's pattern for the current position
  const channelPatterns = channelTrackTables.map((table) => {
    const patIdx = table[currentPos] ?? 0;
    return patterns[patIdx] ?? null;
  });

  // All parts are 128 rows
  const numRows = channelPatterns[0]?.length ?? 128;
  const rows = Array.from({ length: numRows }, (_, i) => i);

  return (
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
      {/* Sticky header row */}
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
        {/* Row number column */}
        <span style={{ width: 36, flexShrink: 0, textAlign: 'right', paddingRight: 6, color: '#555' }}>
          ROW
        </span>
        {channelTrackTables.map((table, chIdx) => {
          const partIdx = table[currentPos] ?? 0;
          const pat = patterns[partIdx];
          return (
            <span
              key={chIdx}
              style={{
                width: 80,
                flexShrink: 0,
                textAlign: 'center',
                color: '#aaa',
                fontSize: 11,
                letterSpacing: 0.5,
              }}
            >
              CH{chIdx + 1} {pat ? `P:${partIdx.toString().padStart(2, '0')}` : '???'}
            </span>
          );
        })}
      </div>

      {/* Pattern rows */}
      {rows.map((rowIdx) => {
        const isPlayhead = rowIdx === currentRow;
        const isEvenGroup = Math.floor(rowIdx / 4) % 2 === 0;
        return (
          <div
            key={rowIdx}
            style={{
              display: 'flex',
              height: ROW_H,
              alignItems: 'center',
              backgroundColor: isPlayhead
                ? '#1a3a1a'
                : isEvenGroup
                ? 'transparent'
                : '#0a0a0a',
              borderBottom: rowIdx % 4 === 3 ? '1px solid #1e1e1e' : undefined,
            }}
          >
            {/* Row number */}
            <span
              style={{
                width: 36,
                flexShrink: 0,
                textAlign: 'right',
                paddingRight: 6,
                color: rowIdx % 4 === 0 ? '#555' : '#333',
                fontSize: 11,
              }}
            >
              {rowIdx.toString().padStart(3, '0')}
            </span>

            {/* Each channel's cell */}
            {channelPatterns.map((pat, chIdx) => {
              const cell = pat?.channels[0]?.rows[rowIdx];
              const hasNote = cell && cell.note > 0;
              return (
                <span
                  key={chIdx}
                  style={{
                    width: 80,
                    flexShrink: 0,
                    display: 'flex',
                    gap: 2,
                    paddingLeft: 4,
                    paddingRight: 4,
                    borderLeft: '1px solid #1e1e1e',
                    color: hasNote
                      ? isPlayhead
                        ? '#88ff88'
                        : '#cccccc'
                      : '#333',
                  }}
                >
                  <span style={{ width: 28, letterSpacing: 0 }}>
                    {cell ? noteStr(cell.note) : '---'}
                  </span>
                  <span style={{ width: 20, color: hasNote && cell.instrument ? '#ffaa44' : '#333' }}>
                    {cell ? instrStr(cell.instrument) : '--'}
                  </span>
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
