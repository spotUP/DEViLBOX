/**
 * PixiHivelyPositionEditor - Track Assignment + Transpose Editor
 *
 * Displays the HivelyTracker position table showing which track each
 * channel plays at each position, along with per-channel transpose.
 *
 * Layout:
 * ┌─────┬──────────┬──────────┬──────────┬──────────┐
 * │ Pos │  CH 0    │  CH 1    │  CH 2    │  CH 3    │
 * │     │ Trk  Trn │ Trk  Trn │ Trk  Trn │ Trk  Trn │
 * ├─────┼──────────┼──────────┼──────────┼──────────┤
 * │  00 │ 007  +00 │ 008  +00 │ 009  +03 │ 010  -05 │
 * │  01 │ 011  +00 │ 012  +00 │ 013  +00 │ 014  +00 │
 * │ >02 │ 015  +05 │ 016  +00 │ 017  -03 │ 018  +00 │
 * └─────┴──────────┴──────────┴──────────┴──────────┘
 */

import React, { useCallback, useState } from 'react';
import type { HivelyNativeData } from '@/types';

// Layout constants
const ROW_HEIGHT = 18;
const POS_COL_WIDTH = 32;
const CHAN_COL_WIDTH = 80; // Track(3 digits) + space + Transpose(3 chars)
const HEADER_HEIGHT = 20;
const VISIBLE_ROWS = 7; // Show 7 rows centered on current

// HivelyTracker palette
const HVL_BG = '#000000';
const HVL_HIGHLIGHT = '#780000';
const HVL_TEXT = '#ffffff';
const HVL_CURSOR = '#ffff88';
const HVL_DIM = '#808080';

function formatTranspose(val: number): string {
  if (val === 0) return '+00';
  if (val > 0) return `+${val.toString(16).toUpperCase().padStart(2, '0')}`;
  return `-${Math.abs(val).toString(16).toUpperCase().padStart(2, '0')}`;
}

interface PositionEditorProps {
  width: number;
  height: number;
  nativeData: HivelyNativeData;
  currentPosition: number;
  onPositionChange?: (position: number) => void;
  onFocusTrackEditor?: () => void;
}

export const PixiHivelyPositionEditor: React.FC<PositionEditorProps> = ({
  width,
  height,
  nativeData,
  currentPosition,
  onPositionChange,
  onFocusTrackEditor,
}) => {
  const numChannels = nativeData.channels;
  const numPositions = nativeData.positions.length;

  const [cursorChan, setCursorChan] = useState(0);
  const [cursorField, setCursorField] = useState<'track' | 'transpose'>('track');

  // Center display around current position
  const halfVisible = Math.floor(VISIBLE_ROWS / 2);
  const startPos = Math.max(0, currentPosition - halfVisible);
  const endPos = Math.min(numPositions, startPos + VISIBLE_ROWS);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        onPositionChange?.(Math.max(0, currentPosition - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        onPositionChange?.(Math.min(numPositions - 1, currentPosition + 1));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (cursorField === 'transpose') {
          setCursorField('track');
        } else if (cursorChan > 0) {
          setCursorChan(c => c - 1);
          setCursorField('transpose');
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (cursorField === 'track') {
          setCursorField('transpose');
        } else if (cursorChan < numChannels - 1) {
          setCursorChan(c => c + 1);
          setCursorField('track');
        }
        break;
      case 'Enter':
        e.preventDefault();
        onFocusTrackEditor?.();
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          setCursorChan(c => Math.max(0, c - 1));
        } else {
          setCursorChan(c => Math.min(numChannels - 1, c + 1));
        }
        break;
    }
  }, [currentPosition, cursorChan, cursorField, numChannels, numPositions, onPositionChange, onFocusTrackEditor]);

  return (
    <div
      style={{
        width,
        height,
        overflow: 'hidden',
        backgroundColor: HVL_BG,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        outline: 'none',
        userSelect: 'none',
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        height: HEADER_HEIGHT,
        lineHeight: `${HEADER_HEIGHT}px`,
        borderBottom: `1px solid #333`,
      }}>
        <div style={{ width: POS_COL_WIDTH, textAlign: 'center', color: HVL_DIM }}>
          Pos
        </div>
        {Array.from({ length: numChannels }, (_, ch) => (
          <div key={ch} style={{
            width: CHAN_COL_WIDTH,
            textAlign: 'center',
            color: HVL_DIM,
            borderLeft: '1px solid #333',
          }}>
            CH {ch}
          </div>
        ))}
      </div>

      {/* Position rows */}
      {Array.from({ length: endPos - startPos }, (_, i) => {
        const pos = startPos + i;
        const isCurrent = pos === currentPosition;
        const position = nativeData.positions[pos];

        return (
          <div
            key={pos}
            onClick={() => onPositionChange?.(pos)}
            style={{
              display: 'flex',
              height: ROW_HEIGHT,
              lineHeight: `${ROW_HEIGHT}px`,
              backgroundColor: isCurrent ? HVL_HIGHLIGHT : 'transparent',
              cursor: 'pointer',
            }}
          >
            {/* Position number */}
            <div style={{
              width: POS_COL_WIDTH,
              textAlign: 'center',
              color: isCurrent ? HVL_CURSOR : HVL_DIM,
            }}>
              {isCurrent ? '>' : ' '}{pos.toString().padStart(2, '0')}
            </div>

            {/* Channel cells: Track + Transpose */}
            {position && Array.from({ length: numChannels }, (_, ch) => {
              const trackIdx = position.track[ch] ?? 0;
              const transpose = position.transpose[ch] ?? 0;
              const isTrackCursor = isCurrent && ch === cursorChan && cursorField === 'track';
              const isTransposeCursor = isCurrent && ch === cursorChan && cursorField === 'transpose';

              return (
                <div key={ch} style={{
                  width: CHAN_COL_WIDTH,
                  display: 'flex',
                  borderLeft: '1px solid #222',
                  justifyContent: 'center',
                  gap: 4,
                }}>
                  <span style={{
                    color: HVL_TEXT,
                    backgroundColor: isTrackCursor ? HVL_CURSOR + '40' : 'transparent',
                    padding: '0 2px',
                  }}>
                    {trackIdx.toString().padStart(3, '0')}
                  </span>
                  <span style={{
                    color: transpose === 0 ? HVL_DIM : (transpose > 0 ? '#88ff88' : '#ff8888'),
                    backgroundColor: isTransposeCursor ? HVL_CURSOR + '40' : 'transparent',
                    padding: '0 2px',
                  }}>
                    {formatTranspose(transpose)}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
