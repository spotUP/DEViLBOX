/**
 * MusicLineTrackTableEditor — Editable per-channel track table matrix view.
 * Simple HTML table — no PatternEditorCanvas (avoids RAF/worker/wasmPos interference).
 *
 * Layout:
 *   Rows    = song positions (0..N)
 *   Columns = channels (Ch 1..numChannels)
 *   Cells   = pattern index at that channel x position (hex, 2 nibbles)
 */

import React from 'react';
import { useTrackerStore, useFormatStore } from '@stores';
import { useWasmPositionStore } from '@/stores/useWasmPositionStore';
import { useTransportStore } from '@stores/useTransportStore';

function hex2(val: number): string {
  return val.toString(16).toUpperCase().padStart(2, '0');
}

interface MusicLineTrackTableEditorProps {
  onSeek?: (position: number) => void;
}

export const MusicLineTrackTableEditor: React.FC<MusicLineTrackTableEditorProps> = ({ onSeek }) => {
  const channelTrackTables = useFormatStore((state) => state.channelTrackTables);
  const editPos = useTrackerStore((state) => state.currentPositionIndex);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const wasmSongPos = useWasmPositionStore((s) => s.songPos);
  const wasmActive = useWasmPositionStore((s) => s.active);

  if (!channelTrackTables || channelTrackTables.length === 0) return null;

  const numChannels = channelTrackTables.length;
  const maxPositions = Math.max(0, ...channelTrackTables.map(t => t.length));
  const activePos = (isPlaying && wasmActive) ? Math.min(wasmSongPos, maxPositions - 1) : editPos;

  return (
    <div style={{ width: '100%', maxHeight: 160, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, backgroundColor: 'var(--color-bg-tertiary)', zIndex: 1 }}>
            <th style={{ padding: '2px 4px', borderBottom: '1px solid var(--color-border)', textAlign: 'right', color: 'var(--color-text-muted)', width: 32 }}>Pos</th>
            {Array.from({ length: numChannels }, (_, ch) => (
              <th key={ch} style={{ padding: '2px 6px', borderBottom: '1px solid var(--color-border)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                C{ch + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxPositions }, (_, pos) => {
            const isCurrent = pos === activePos;
            return (
              <tr
                key={pos}
                onClick={() => onSeek?.(pos)}
                style={{
                  cursor: 'pointer',
                  backgroundColor: isCurrent ? 'rgba(59, 130, 246, 0.15)' : pos % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                }}
              >
                <td style={{ padding: '1px 4px', textAlign: 'right', color: isCurrent ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                  {hex2(pos)}
                </td>
                {Array.from({ length: numChannels }, (_, ch) => {
                  const patIdx = channelTrackTables[ch]?.[pos];
                  return (
                    <td
                      key={ch}
                      style={{
                        padding: '1px 6px',
                        textAlign: 'center',
                        color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        fontWeight: isCurrent ? 'bold' : 'normal',
                      }}
                    >
                      {patIdx !== undefined ? hex2(patIdx) : '..'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
