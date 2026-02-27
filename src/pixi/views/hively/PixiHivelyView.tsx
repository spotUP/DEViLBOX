/**
 * PixiHivelyView - Top-level HivelyTracker Editor View
 *
 * Combines the position editor (top) with the track editor (bottom),
 * matching the original HivelyTracker two-panel paradigm.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (tempo, speed, octave, instrument)       │
 * ├──────────────────────────────────────────────────┤
 * │ Position Editor (compact, ~140px tall)           │
 * │ Shows track assignments per channel per position │
 * ├──────────────────────────────────────────────────┤
 * │ Track Editor (fills remaining space)             │
 * │ Shows pattern data for tracks at current pos     │
 * └──────────────────────────────────────────────────┘
 *
 * Enter key toggles focus between position editor and track editor.
 */

import React, { useCallback, useState, useRef } from 'react';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { exportAsHively } from '@lib/export/HivelyExporter';
import { PixiHivelyPositionEditor } from './PixiHivelyPositionEditor';
import { PixiHivelyTrackEditor } from './PixiHivelyTrackEditor';

const TOOLBAR_HEIGHT = 32;
const POSITION_EDITOR_HEIGHT = 160;

interface HivelyViewProps {
  width: number;
  height: number;
}

export const PixiHivelyView: React.FC<HivelyViewProps> = ({ width, height }) => {
  const nativeData = useTrackerStore(s => s.hivelyNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const isPlaying = useTransportStore(s => s.isPlaying);

  const handleExport = useCallback((format: 'hvl' | 'ahx') => {
    const song = getTrackerReplayer().getSong();
    if (!song) return;
    const result = exportAsHively(song, { format });
    const url = URL.createObjectURL(result.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (result.warnings.length > 0) {
      console.warn('[HivelyExport]', result.warnings.join('; '));
    }
  }, []);

  const [editPosition, setEditPosition] = useState(0);
  const [focusTarget, setFocusTarget] = useState<'position' | 'track'>('track');

  const posEditorRef = useRef<HTMLDivElement>(null);
  const trackEditorRef = useRef<HTMLDivElement>(null);

  // Use playback position when playing, edit position otherwise
  const activePosition = isPlaying ? currentPositionIndex : editPosition;

  const handlePositionChange = useCallback((pos: number) => {
    setEditPosition(pos);
    if (!isPlaying) {
      setCurrentPosition(pos);
    }
  }, [isPlaying, setCurrentPosition]);

  const handleFocusTrackEditor = useCallback(() => {
    setFocusTarget('track');
    // Focus the track editor's container div
    trackEditorRef.current?.querySelector<HTMLDivElement>('[tabindex]')?.focus();
  }, []);

  const handleFocusPositionEditor = useCallback(() => {
    setFocusTarget('position');
    posEditorRef.current?.querySelector<HTMLDivElement>('[tabindex]')?.focus();
  }, []);

  if (!nativeData) {
    return (
      <div style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#808080',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 13,
        backgroundColor: '#000000',
      }}>
        No HivelyTracker module loaded
      </div>
    );
  }

  const trackEditorHeight = height - TOOLBAR_HEIGHT - POSITION_EDITOR_HEIGHT;

  return (
    <div style={{
      width,
      height,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#000000',
    }}>
      {/* Toolbar */}
      <div style={{
        height: TOOLBAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 8px',
        backgroundColor: '#111111',
        borderBottom: '1px solid #333',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        color: '#ffffff',
      }}>
        <span style={{ color: '#ffff88', fontWeight: 'bold' }}>
          {nativeData.channels <= 4 ? 'AHX' : 'HVL'}
        </span>
        <span style={{ color: '#555' }}>|</span>
        <span>
          Tempo: {nativeData.tempo}
        </span>
        <span style={{ color: '#555' }}>|</span>
        <span>
          Speed: {nativeData.speedMultiplier}x
        </span>
        <span style={{ color: '#555' }}>|</span>
        <span>
          Tracks: {nativeData.tracks.length}
        </span>
        <span style={{ color: '#555' }}>|</span>
        <span>
          Positions: {nativeData.positions.length}
        </span>
        <span style={{ color: '#555' }}>|</span>
        <span>
          CH: {nativeData.channels}
        </span>
        <span style={{ color: '#555' }}>|</span>
        <span>
          Pos: {activePosition.toString().padStart(3, '0')}/{nativeData.positions.length.toString().padStart(3, '0')}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: '#555' }}>|</span>
        <button
          onClick={() => handleExport('hvl')}
          disabled={!nativeData}
          style={{
            background: 'none',
            border: '1px solid #444',
            color: '#88ff88',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            padding: '1px 6px',
            cursor: nativeData ? 'pointer' : 'default',
            opacity: nativeData ? 1 : 0.4,
          }}
          title="Export as HVL"
        >
          HVL↓
        </button>
        <button
          onClick={() => handleExport('ahx')}
          disabled={!nativeData}
          style={{
            background: 'none',
            border: '1px solid #444',
            color: '#88ff88',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            padding: '1px 6px',
            cursor: nativeData ? 'pointer' : 'default',
            opacity: nativeData ? 1 : 0.4,
          }}
          title="Export as AHX (4 channels max)"
        >
          AHX↓
        </button>
        <span style={{ color: '#555' }}>|</span>
        <span style={{
          color: focusTarget === 'position' ? '#ffff88' : '#808080',
          cursor: 'pointer',
        }} onClick={handleFocusPositionEditor}>
          [POS]
        </span>
        <span style={{
          color: focusTarget === 'track' ? '#ffff88' : '#808080',
          cursor: 'pointer',
        }} onClick={handleFocusTrackEditor}>
          [TRK]
        </span>
      </div>

      {/* Position Editor (top panel) */}
      <div ref={posEditorRef} style={{
        height: POSITION_EDITOR_HEIGHT,
        borderBottom: `2px solid ${focusTarget === 'position' ? '#ffff88' : '#333'}`,
      }}>
        <PixiHivelyPositionEditor
          width={width}
          height={POSITION_EDITOR_HEIGHT}
          nativeData={nativeData}
          currentPosition={activePosition}
          onPositionChange={handlePositionChange}
          onFocusTrackEditor={handleFocusTrackEditor}
        />
      </div>

      {/* Track Editor (bottom panel, fills remaining space) */}
      <div ref={trackEditorRef} style={{ flex: 1 }}>
        <PixiHivelyTrackEditor
          width={width}
          height={trackEditorHeight}
          nativeData={nativeData}
          currentPosition={activePosition}
          onFocusPositionEditor={handleFocusPositionEditor}
        />
      </div>
    </div>
  );
};
