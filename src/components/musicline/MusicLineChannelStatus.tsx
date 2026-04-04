/**
 * MusicLineChannelStatus — Per-channel status display for MusicLine editor.
 *
 * Shows tune position, part (pattern) number, and current row for each channel.
 * During playback, values update from useWasmPositionStore.
 * When stopped, shows the edit position.
 */

import React from 'react';
import { useWasmPositionStore } from '@/stores/useWasmPositionStore';
import { useFormatStore } from '@stores';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';

export const MusicLineChannelStatus: React.FC = () => {
  const channelTrackTables = useFormatStore((s) => s.channelTrackTables);
  const editPos = useTrackerStore((s) => s.currentPositionIndex);
  const isPlaying = useTransportStore((s) => s.isPlaying);

  const wasmActive = useWasmPositionStore((s) => s.active);
  const channelPositions = useWasmPositionStore((s) => s.channelPositions);
  const channelRows = useWasmPositionStore((s) => s.channelRows);

  if (!channelTrackTables || channelTrackTables.length === 0) return null;

  const numChannels = channelTrackTables.length;
  const useWasm = isPlaying && wasmActive;

  return (
    <div
      className="flex gap-0 border-b border-dark-border"
      style={{
        fontFamily: 'monospace',
        fontSize: '10px',
        lineHeight: '14px',
      }}
    >
      {/* Row label column */}
      <div
        className="flex-shrink-0 flex flex-col items-end pr-1"
        style={{
          width: 32,
          color: 'var(--color-text-muted)',
          borderRight: '1px solid var(--color-border)',
          padding: '2px 4px 2px 0',
        }}
      >
        <span>Pos</span>
        <span>Part</span>
        <span>Row</span>
      </div>
      {/* Per-channel values */}
      {Array.from({ length: numChannels }, (_, ch) => {
        const pos = useWasm && channelPositions.length > ch
          ? channelPositions[ch]
          : editPos;
        const track = channelTrackTables[ch];
        const clampedPos = Math.min(pos, track.length - 1);
        const part = track[clampedPos] ?? 0;
        const row = useWasm && channelRows.length > ch
          ? channelRows[ch]
          : 0;

        return (
          <div
            key={ch}
            className="flex-1 min-w-0 flex flex-col items-center"
            style={{
              borderRight: ch < numChannels - 1 ? '1px solid var(--color-border)' : undefined,
              padding: '2px 2px',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span>{String(clampedPos).padStart(2, '0')}</span>
            <span style={{ color: 'var(--color-accent-primary)' }}>
              {String(part).padStart(2, '0')}
            </span>
            <span>{String(row).padStart(2, '0')}</span>
          </div>
        );
      })}
    </div>
  );
};
