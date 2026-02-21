/**
 * RemotePatternView — Friend's tracker view for "Both"/"Theirs" collab modes.
 *
 * Replicates the visual structure of TrackerView (read-only FT2 toolbar +
 * channel headers + pattern grid) but read-only, showing the peer's current
 * pattern at peerPatternIndex.
 */

import React, { useMemo } from 'react';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { ReadOnlyPatternCanvas } from '@components/tracker/ReadOnlyPatternCanvas';
import { Users, Lock } from 'lucide-react';

const LINE_NUMBER_WIDTH = 40;
const CHAR_WIDTH = 10;

// ─── Read-only FT2 field (label + value display, no arrows) ──────────────────

const ROField: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="ft2-numeric-group">
    <span className="ft2-numeric-label">{label}:</span>
    <span className="ft2-numeric-value">{String(value).padStart(3, '0')}</span>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

export const RemotePatternView: React.FC = () => {
  const peerPatternIndex = useCollaborationStore((s) => s.peerPatternIndex);
  const patterns = useTrackerStore((s) => s.patterns);
  const columnVisibility = useTrackerStore((s) => s.columnVisibility);
  const patternOrder = useTrackerStore((s) => s.patternOrder);
  const currentPositionIndex = useTrackerStore((s) => s.currentPositionIndex);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const currentRow = useTransportStore((s) => s.currentRow);
  const bpm = useTransportStore((s) => s.bpm);
  const speed = useTransportStore((s) => s.speed);

  const pattern = patterns[peerPatternIndex] ?? null;
  const numChannels = pattern?.channels.length ?? 1;
  const patternLength = pattern?.length ?? 64;
  const songLength = patternOrder.length;

  // Match PatternEditorCanvas channel width formula exactly
  const { channelWidths, totalChannelsWidth } = useMemo(() => {
    if (!pattern) return { channelWidths: [] as number[], totalChannelsWidth: 0 };
    const noteWidth = CHAR_WIDTH * 3 + 4;
    const showAcid = columnVisibility.flag1 || columnVisibility.flag2;
    const showProb = columnVisibility.probability;
    const widths: number[] = [];
    let total = 0;
    for (let ch = 0; ch < pattern.channels.length; ch++) {
      const channel = pattern.channels[ch];
      if (channel?.collapsed) {
        const w = noteWidth + 40;
        widths.push(w);
        total += w;
      } else {
        const effectCols = channel?.channelMeta?.effectCols ?? 2;
        const effectWidth = effectCols * (CHAR_WIDTH * 3 + 4);
        const paramWidth = CHAR_WIDTH * 4 + 8 + effectWidth
          + (showAcid ? CHAR_WIDTH * 2 + 8 : 0)
          + (showProb ? CHAR_WIDTH * 2 + 4 : 0);
        const w = noteWidth + paramWidth + 60;
        widths.push(w);
        total += w;
      }
    }
    return { channelWidths: widths, totalChannelsWidth: total };
  }, [pattern, columnVisibility]);

  if (!pattern) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        <div className="text-center">
          <Users size={24} className="mx-auto mb-2 opacity-30" />
          <p>Waiting for friend's view...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Read-only FT2 Toolbar */}
      <div className="ft2-toolbar shrink-0">
        {/* Friend indicator */}
        <div className="flex items-center gap-2 mb-1">
          <Users size={12} className="text-accent-secondary" />
          <span className="text-[10px] font-bold text-accent-secondary uppercase tracking-wider">Friend's View</span>
          <Lock size={10} className="text-text-muted opacity-50" />
          <span className="text-[10px] text-text-muted">(read-only)</span>
        </div>

        {/* Row 1: Position, BPM, Pattern */}
        <div className="ft2-toolbar-row">
          <div className="ft2-section ft2-col-1">
            <ROField label="Position" value={currentPositionIndex} />
          </div>
          <div className="ft2-section ft2-col-2">
            <ROField label="BPM" value={bpm} />
          </div>
          <div className="ft2-section ft2-col-3">
            <ROField label="Pattern" value={peerPatternIndex} />
          </div>
          <div className="ft2-section ft2-col-4" />
        </div>

        {/* Row 2: Song Length, Speed, Pattern Length */}
        <div className="ft2-toolbar-row">
          <div className="ft2-section ft2-col-1">
            <ROField label="Song Len" value={songLength} />
          </div>
          <div className="ft2-section ft2-col-2">
            <ROField label="Speed" value={speed} />
          </div>
          <div className="ft2-section ft2-col-3">
            <ROField label="Pat Len" value={patternLength} />
          </div>
          <div className="ft2-section ft2-col-4" />
        </div>
      </div>

      {/* Channel headers — same height and style as PatternEditorCanvas */}
      <div className="flex-shrink-0 bg-dark-bgTertiary border-b border-dark-border h-[28px] flex">
        {/* ROW label column */}
        <div
          className="flex-shrink-0 flex items-center justify-center border-r border-dark-border text-text-muted text-xs font-medium"
          style={{ width: LINE_NUMBER_WIDTH }}
        >
          ROW
        </div>

        {/* Per-channel headers */}
        <div className="overflow-x-hidden overflow-y-hidden flex-1">
          <div className="flex h-full" style={{ width: totalChannelsWidth }}>
            {pattern.channels.map((channel, idx) => (
              <div
                key={channel.id}
                className={`flex-shrink-0 flex items-center gap-1.5 px-2 border-r border-dark-border h-full ${channel.muted ? 'opacity-50' : ''}`}
                style={{
                  width: channelWidths[idx],
                  backgroundColor: channel.color ? `${channel.color}15` : undefined,
                  boxShadow: channel.color ? `inset 2px 0 0 ${channel.color}` : undefined,
                }}
              >
                <span
                  className="font-bold font-mono text-[11px] flex-shrink-0 opacity-80"
                  style={{ color: channel.color || 'var(--color-accent)' }}
                >
                  {(idx + 1).toString().padStart(2, '0')}
                </span>
                <span className="font-mono text-[10px] font-bold text-text-primary uppercase truncate">
                  {channel.name || `CH${idx + 1}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pattern grid */}
      <div className="flex-1 min-h-0">
        <ReadOnlyPatternCanvas
          pattern={pattern}
          currentRow={currentRow}
          numChannels={numChannels}
          isPlaying={isPlaying}
        />
      </div>
    </div>
  );
};
