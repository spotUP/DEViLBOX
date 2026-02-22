/**
 * PixiHivelyTrackEditor - Note/Instrument/Effects Track Editor
 *
 * Displays the track data for each channel at the current position.
 * Tracks are shared/reusable — editing one track affects all positions
 * that reference it.
 *
 * Layout:
 * ┌────┬──────────────────┬──────────────────┬─────
 * │ Row│ CH 0 (Track 007) │ CH 1 (Track 008) │ ...
 * ├────┼──────────────────┼──────────────────┤
 * │ 00 │ C-1 01 3C0 450   │ D-1 02 000 000   │
 * │ 01 │ --- -- 000 000   │ F-1 04 000 000   │
 * └────┴──────────────────┴──────────────────┘
 *        Note Ins FX1P FX2P
 */

import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useTransportStore } from '@/stores/useTransportStore';
import type { HivelyNativeData } from '@/types';

// Layout constants
const ROW_HEIGHT = 20;
const ROW_NUM_WIDTH = 28;
const CHAR_WIDTH = 8;
const NOTE_WIDTH = CHAR_WIDTH * 3 + 4;
const INS_WIDTH = CHAR_WIDTH * 2 + 4;
const FX_WIDTH = CHAR_WIDTH * 3 + 4;   // Effect type(1 hex) + param(2 hex)
const CHANNEL_WIDTH = NOTE_WIDTH + INS_WIDTH + FX_WIDTH * 2 + 8;
const HEADER_HEIGHT = 24;

// HivelyTracker palette
const HVL_BG = '#000000';
const HVL_HIGHLIGHT = '#780000';
const HVL_TEXT = '#ffffff';
const HVL_CURSOR = '#ffff88';
const HVL_DIM = '#808080';
const HVL_NOTE = '#ffffff';
const HVL_INST = '#aaffaa';
const HVL_FX = '#ffaa55';
const HVL_FX2 = '#55aaff';

// Note names for HVL (C-0 to B-4, 60 notes)
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function formatHvlNote(note: number, transpose: number): string {
  if (note === 0) return '---';
  const transposed = note + transpose;
  if (transposed < 1 || transposed > 60) return '???';
  const semitone = (transposed - 1) % 12;
  const octave = Math.floor((transposed - 1) / 12);
  return `${NOTE_NAMES[semitone]}${octave}`;
}

function formatHex(val: number, digits: number): string {
  if (val === 0 && digits <= 2) return '-'.repeat(digits);
  return val.toString(16).toUpperCase().padStart(digits, '0');
}

function formatEffect(fx: number, param: number): string {
  if (fx === 0 && param === 0) return '000';
  return `${fx.toString(16).toUpperCase()}${param.toString(16).toUpperCase().padStart(2, '0')}`;
}

interface TrackEditorProps {
  width: number;
  height: number;
  nativeData: HivelyNativeData;
  currentPosition: number;
  onFocusPositionEditor?: () => void;
}

export const PixiHivelyTrackEditor: React.FC<TrackEditorProps> = ({
  width,
  height,
  nativeData,
  currentPosition,
  onFocusPositionEditor,
}) => {
  const isPlaying = useTransportStore(s => s.isPlaying);
  const displayRow = useTransportStore(s => s.currentRow);
  const trackLength = nativeData.trackLength;
  const numChannels = nativeData.channels;

  const position = nativeData.positions[currentPosition];

  // Cursor state
  const [cursorRow, setCursorRow] = useState(0);
  const [cursorChan, setCursorChan] = useState(0);
  const [cursorCol, setCursorCol] = useState<'note' | 'ins' | 'fx' | 'fxb'>('note');

  // Scroll
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const visibleRows = Math.floor((height - HEADER_HEIGHT) / ROW_HEIGHT);

  // Auto-scroll to cursor/playback
  useEffect(() => {
    const targetRow = isPlaying ? displayRow : cursorRow;
    const scrollTop = scrollTopRef.current;
    const rowY = targetRow * ROW_HEIGHT;
    const viewHeight = visibleRows * ROW_HEIGHT;

    if (rowY < scrollTop || rowY >= scrollTop + viewHeight) {
      const newScroll = Math.max(0, rowY - Math.floor(visibleRows / 2) * ROW_HEIGHT);
      scrollTopRef.current = newScroll;
      if (containerRef.current) containerRef.current.scrollTop = newScroll;
    }
  }, [cursorRow, displayRow, isPlaying, visibleRows]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setCursorRow(r => Math.max(0, r - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setCursorRow(r => Math.min(trackLength - 1, r + 1));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (cursorCol === 'fxb') setCursorCol('fx');
        else if (cursorCol === 'fx') setCursorCol('ins');
        else if (cursorCol === 'ins') setCursorCol('note');
        else if (cursorChan > 0) {
          setCursorChan(c => c - 1);
          setCursorCol('fxb');
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (cursorCol === 'note') setCursorCol('ins');
        else if (cursorCol === 'ins') setCursorCol('fx');
        else if (cursorCol === 'fx') setCursorCol('fxb');
        else if (cursorChan < numChannels - 1) {
          setCursorChan(c => c + 1);
          setCursorCol('note');
        }
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          setCursorChan(c => Math.max(0, c - 1));
        } else {
          setCursorChan(c => Math.min(numChannels - 1, c + 1));
        }
        setCursorCol('note');
        break;
      case 'Enter':
        e.preventDefault();
        onFocusPositionEditor?.();
        break;
      case 'PageUp':
        e.preventDefault();
        setCursorRow(r => Math.max(0, r - 16));
        break;
      case 'PageDown':
        e.preventDefault();
        setCursorRow(r => Math.min(trackLength - 1, r + 16));
        break;
      case 'Home':
        e.preventDefault();
        setCursorRow(0);
        break;
      case 'End':
        e.preventDefault();
        setCursorRow(trackLength - 1);
        break;
    }
  }, [cursorCol, cursorChan, numChannels, trackLength, onFocusPositionEditor]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    scrollTopRef.current = (e.target as HTMLDivElement).scrollTop;
  }, []);

  // Visible row range
  const startRow = Math.floor(scrollTopRef.current / ROW_HEIGHT);
  const endRow = Math.min(trackLength, startRow + visibleRows + 2);

  const totalWidth = ROW_NUM_WIDTH + numChannels * CHANNEL_WIDTH;

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        overflow: 'auto',
        backgroundColor: HVL_BG,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        outline: 'none',
        userSelect: 'none',
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
    >
      {/* Channel headers showing track assignments */}
      <div style={{
        display: 'flex',
        position: 'sticky',
        top: 0,
        zIndex: 2,
        backgroundColor: '#111',
        borderBottom: '1px solid #333',
        height: HEADER_HEIGHT,
        lineHeight: `${HEADER_HEIGHT}px`,
      }}>
        <div style={{ width: ROW_NUM_WIDTH, textAlign: 'center', color: HVL_DIM }}>
          Row
        </div>
        {position && Array.from({ length: numChannels }, (_, ch) => {
          const trackIdx = position.track[ch] ?? 0;
          const transpose = position.transpose[ch] ?? 0;

          return (
            <div key={ch} style={{
              width: CHANNEL_WIDTH,
              textAlign: 'center',
              color: HVL_DIM,
              borderLeft: '1px solid #333',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}>
              CH{ch} <span style={{ color: HVL_TEXT }}>T{trackIdx.toString().padStart(3, '0')}</span>
              {transpose !== 0 && (
                <span style={{ color: transpose > 0 ? '#88ff88' : '#ff8888', marginLeft: 4 }}>
                  {transpose > 0 ? '+' : ''}{transpose}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Track rows */}
      <div style={{ height: trackLength * ROW_HEIGHT, position: 'relative' }}>
        {Array.from({ length: endRow - startRow }, (_, i) => {
          const row = startRow + i;
          const isPlayRow = isPlaying && row === displayRow;
          const isCursorRow = row === cursorRow;

          let bgColor = 'transparent';
          if (isPlayRow) bgColor = HVL_HIGHLIGHT;
          else if (isCursorRow) bgColor = '#1a1a00';

          return (
            <div
              key={row}
              style={{
                display: 'flex',
                position: 'absolute',
                top: row * ROW_HEIGHT,
                height: ROW_HEIGHT,
                width: totalWidth,
                lineHeight: `${ROW_HEIGHT}px`,
                backgroundColor: bgColor,
              }}
            >
              {/* Row number */}
              <div style={{
                width: ROW_NUM_WIDTH,
                textAlign: 'center',
                color: row % 16 === 0 ? HVL_TEXT : HVL_DIM,
              }}>
                {row.toString(16).toUpperCase().padStart(2, '0')}
              </div>

              {/* Channel data */}
              {position && Array.from({ length: numChannels }, (_, ch) => {
                const trackIdx = position.track[ch] ?? 0;
                const transpose = position.transpose[ch] ?? 0;
                const track = nativeData.tracks[trackIdx];
                const step = track?.steps[row];

                if (!step) {
                  return (
                    <div key={ch} style={{
                      width: CHANNEL_WIDTH,
                      textAlign: 'center',
                      color: HVL_DIM,
                      borderLeft: '1px solid #222',
                    }}>
                      --- -- 000 000
                    </div>
                  );
                }

                const isNoteCursor = isCursorRow && ch === cursorChan && cursorCol === 'note';
                const isInsCursor = isCursorRow && ch === cursorChan && cursorCol === 'ins';
                const isFxCursor = isCursorRow && ch === cursorChan && cursorCol === 'fx';
                const isFxbCursor = isCursorRow && ch === cursorChan && cursorCol === 'fxb';

                return (
                  <div key={ch} style={{
                    display: 'flex',
                    width: CHANNEL_WIDTH,
                    borderLeft: '1px solid #222',
                    justifyContent: 'center',
                    gap: 2,
                  }}>
                    {/* Note */}
                    <span
                      onClick={() => { setCursorRow(row); setCursorChan(ch); setCursorCol('note'); }}
                      style={{
                        width: NOTE_WIDTH,
                        textAlign: 'center',
                        cursor: 'pointer',
                        color: step.note > 0 ? HVL_NOTE : HVL_DIM,
                        backgroundColor: isNoteCursor ? HVL_CURSOR + '30' : 'transparent',
                      }}
                    >
                      {formatHvlNote(step.note, transpose)}
                    </span>

                    {/* Instrument */}
                    <span
                      onClick={() => { setCursorRow(row); setCursorChan(ch); setCursorCol('ins'); }}
                      style={{
                        width: INS_WIDTH,
                        textAlign: 'center',
                        cursor: 'pointer',
                        color: step.instrument > 0 ? HVL_INST : HVL_DIM,
                        backgroundColor: isInsCursor ? HVL_CURSOR + '30' : 'transparent',
                      }}
                    >
                      {step.instrument > 0 ? formatHex(step.instrument, 2) : '--'}
                    </span>

                    {/* Primary effect */}
                    <span
                      onClick={() => { setCursorRow(row); setCursorChan(ch); setCursorCol('fx'); }}
                      style={{
                        width: FX_WIDTH,
                        textAlign: 'center',
                        cursor: 'pointer',
                        color: (step.fx > 0 || step.fxParam > 0) ? HVL_FX : HVL_DIM,
                        backgroundColor: isFxCursor ? HVL_CURSOR + '30' : 'transparent',
                      }}
                    >
                      {formatEffect(step.fx, step.fxParam)}
                    </span>

                    {/* Secondary effect */}
                    <span
                      onClick={() => { setCursorRow(row); setCursorChan(ch); setCursorCol('fxb'); }}
                      style={{
                        width: FX_WIDTH,
                        textAlign: 'center',
                        cursor: 'pointer',
                        color: (step.fxb > 0 || step.fxbParam > 0) ? HVL_FX2 : HVL_DIM,
                        backgroundColor: isFxbCursor ? HVL_CURSOR + '30' : 'transparent',
                      }}
                    >
                      {formatEffect(step.fxb, step.fxbParam)}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
