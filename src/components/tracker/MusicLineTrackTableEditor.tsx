/**
 * MusicLineTrackTableEditor — Per-channel track table matrix view
 *
 * Shown instead of the standard pattern order list when the loaded song uses
 * per-channel independent track tables (MusicLine Editor and similar formats).
 *
 * Layout (Hively-style):
 *   Rows    = song positions (0..N) — shows VISIBLE_ROWS rows centered on current
 *   Columns = channels (Ch 1..numChannels)
 *   Cells   = pattern index at that channel × position
 *
 * Reads data from the tracker store so the matrix is visible even before
 * playback starts (the replayer only loads the song on first play).
 */

import React from 'react';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';

// Layout constants — matches PixiHivelyPositionEditor
const ROW_HEIGHT = 18;
const POS_COL_WIDTH = 36;
const CHAN_COL_WIDTH = 52;
const HEADER_HEIGHT = 20;
const VISIBLE_ROWS = 7;

// HivelyTracker palette
const HVL_BG = '#000000';
const HVL_HIGHLIGHT = '#780000';
const HVL_TEXT = '#ffffff';
const HVL_CURSOR = '#ffff88';
const HVL_DIM = '#808080';

interface MusicLineTrackTableEditorProps {
  /** Called when user clicks a position cell to navigate */
  onSeek?: (position: number) => void;
}

export const MusicLineTrackTableEditor: React.FC<MusicLineTrackTableEditorProps> = ({ onSeek }) => {
  const channelTrackTables = useTrackerStore((state) => state.channelTrackTables);
  const channelSpeeds = useTrackerStore((state) => state.channelSpeeds);
  const currentPos = useTrackerStore((state) => state.currentPositionIndex);
  const initialSpeed = useTransportStore((state) => state.speed);

  if (!channelTrackTables || channelTrackTables.length === 0) return null;

  const numChannels = channelTrackTables.length;
  const maxPositions = Math.max(0, ...channelTrackTables.map(t => t.length));

  // Center VISIBLE_ROWS rows around currentPos
  const halfVisible = Math.floor(VISIBLE_ROWS / 2);
  const startPos = Math.max(0, Math.min(currentPos - halfVisible, maxPositions - VISIBLE_ROWS));
  const endPos = Math.min(maxPositions, startPos + VISIBLE_ROWS);
  const visiblePositions = Array.from({ length: endPos - startPos }, (_, i) => startPos + i);

  const totalWidth = POS_COL_WIDTH + numChannels * CHAN_COL_WIDTH;
  const totalHeight = HEADER_HEIGHT + VISIBLE_ROWS * ROW_HEIGHT;

  return (
    <div
      style={{
        width: totalWidth,
        height: totalHeight,
        overflow: 'hidden',
        backgroundColor: HVL_BG,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        height: HEADER_HEIGHT,
        lineHeight: `${HEADER_HEIGHT}px`,
        borderBottom: '1px solid #333',
      }}>
        <div style={{ width: POS_COL_WIDTH, textAlign: 'center', color: HVL_DIM }}>
          Pos
        </div>
        {Array.from({ length: numChannels }, (_, ch) => {
          const chSpeed = channelSpeeds?.[ch];
          const showSpeed = chSpeed !== undefined && chSpeed !== initialSpeed;
          return (
            <div key={ch} style={{
              width: CHAN_COL_WIDTH,
              textAlign: 'center',
              color: HVL_DIM,
              borderLeft: '1px solid #333',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              lineHeight: 1.1,
              paddingTop: 1,
            }}>
              <span>CH{ch + 1}</span>
              {showSpeed && (
                <span style={{ fontSize: 9, color: '#fbbf24' }}>S:{chSpeed}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Position rows — exactly VISIBLE_ROWS rows */}
      {visiblePositions.map(pos => {
        const isCurrent = pos === currentPos;
        return (
          <div
            key={pos}
            onClick={() => onSeek?.(pos)}
            style={{
              display: 'flex',
              height: ROW_HEIGHT,
              lineHeight: `${ROW_HEIGHT}px`,
              backgroundColor: isCurrent ? HVL_HIGHLIGHT : 'transparent',
              cursor: 'pointer',
            }}
          >
            {/* Position number with > indicator */}
            <div style={{
              width: POS_COL_WIDTH,
              textAlign: 'right',
              paddingRight: 4,
              color: isCurrent ? HVL_CURSOR : HVL_DIM,
            }}>
              {isCurrent ? '>' : '\u00a0'}{pos.toString().padStart(2, '0')}
            </div>

            {/* Pattern index per channel */}
            {Array.from({ length: numChannels }, (_, ch) => {
              const patIdx = channelTrackTables[ch]?.[pos];
              const isEmpty = patIdx === undefined;
              return (
                <div key={ch} style={{
                  width: CHAN_COL_WIDTH,
                  textAlign: 'center',
                  borderLeft: '1px solid #222',
                  color: isEmpty ? HVL_DIM : HVL_TEXT,
                }}>
                  {isEmpty ? '···' : patIdx.toString().padStart(3, '0')}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
