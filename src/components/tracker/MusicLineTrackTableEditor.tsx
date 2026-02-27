/**
 * MusicLineTrackTableEditor — Per-channel track table matrix view
 *
 * Shown instead of the standard pattern order list when the loaded song uses
 * per-channel independent track tables (MusicLine Editor and similar formats).
 *
 * Layout:
 *   Columns = song positions (0..N)
 *   Rows    = channels (Ch 1..numChannels)
 *   Cells   = pattern index at that channel × position
 *
 * Reads data from the tracker store so the matrix is visible even before
 * playback starts (the replayer only loads the song on first play).
 */

import React from 'react';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';

interface MusicLineTrackTableEditorProps {
  /** Called when user clicks a position cell to navigate */
  onSeek?: (position: number) => void;
}

export const MusicLineTrackTableEditor: React.FC<MusicLineTrackTableEditorProps> = ({ onSeek }) => {
  const channelTrackTables = useTrackerStore((state) => state.channelTrackTables);
  const channelSpeeds = useTrackerStore((state) => state.channelSpeeds);
  const patterns = useTrackerStore((state) => state.patterns);
  const currentPos = useTrackerStore((state) => state.currentPositionIndex);
  const initialSpeed = useTransportStore((state) => state.speed);

  if (!channelTrackTables || channelTrackTables.length === 0) return null;

  // Find the max positions across all channels (guard against empty tables)
  const maxPositions = Math.max(0, ...channelTrackTables.map(t => t.length));
  const positions = Array.from({ length: maxPositions }, (_, i) => i);

  // Build channel labels
  const channelLabels = Array.from({ length: channelTrackTables.length }, (_, i) => `Ch ${i + 1}`);

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="text-xs text-text-muted px-1">
        Per-channel track table — each channel sequences patterns independently
      </div>

      {/* Scrollable matrix */}
      <div className="overflow-x-auto overflow-y-auto max-h-80 scrollbar-ft2">
        <table className="text-[11px] font-mono border-collapse" style={{ minWidth: maxPositions * 42 + 64 }}>
          <thead>
            <tr className="sticky top-0 bg-dark-bgTertiary z-10">
              {/* Channel label column */}
              <th className="sticky left-0 bg-dark-bgTertiary border-r border-b border-dark-border px-2 py-1 text-text-muted font-medium text-left w-16 z-20">
                CH
              </th>
              {/* Position headers */}
              {positions.map(pos => (
                <th
                  key={pos}
                  className={`border-b border-dark-border px-1 py-1 text-center font-medium w-10 ${
                    pos === currentPos
                      ? 'text-accent-primary bg-accent-primary/10'
                      : 'text-text-muted'
                  }`}
                >
                  {pos}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {channelLabels.map((label, chIdx) => {
              const table = channelTrackTables[chIdx] ?? [];
              const chSpeed = channelSpeeds?.[chIdx];
              const showSpeedBadge = chSpeed !== undefined && chSpeed !== initialSpeed;

              return (
                <tr
                  key={chIdx}
                  className="border-b border-dark-border/50 hover:bg-dark-bgHover/30"
                >
                  {/* Channel label cell */}
                  <td className="sticky left-0 bg-dark-bgTertiary border-r border-dark-border px-2 py-0.5 text-text-secondary font-medium z-10">
                    <div className="flex items-center gap-1">
                      <span>{label}</span>
                      {showSpeedBadge && (
                        <span
                          className="text-[9px] px-0.5 rounded"
                          style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)' }}
                          title={`Speed: ${chSpeed} ticks/row`}
                        >
                          S:{chSpeed}
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Pattern cells */}
                  {positions.map(pos => {
                    const patIdx = table[pos];
                    const isActive = pos === currentPos;
                    const isEmpty = patIdx === undefined;

                    return (
                      <td
                        key={pos}
                        onClick={() => {
                          if (!isEmpty) onSeek?.(pos);
                        }}
                        className={`px-0.5 py-0.5 text-center border-r border-dark-border/30 transition-colors ${
                          isEmpty
                            ? 'text-text-disabled'
                            : isActive
                            ? 'bg-accent-primary/20 text-accent-primary font-bold cursor-pointer'
                            : 'text-text-secondary hover:bg-dark-bgHover cursor-pointer'
                        }`}
                        title={isEmpty ? '' : `Ch ${chIdx + 1} / Pos ${pos}: Pattern ${patIdx}\nPattern has ${patterns[patIdx]?.length ?? '?'} rows`}
                      >
                        {isEmpty ? '·' : `P${String(patIdx).padStart(2, '0')}`}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-text-muted px-1">
        {maxPositions} positions · {patterns.length} patterns · Click cell to navigate
      </div>
    </div>
  );
};
