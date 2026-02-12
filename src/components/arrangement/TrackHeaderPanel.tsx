/**
 * TrackHeaderPanel - Left sidebar containing track headers
 * Scrolls vertically in sync with the main canvas.
 * 180px wide with "TRACKS" label at top.
 */

import React from 'react';
import { TrackHeader } from './TrackHeader';
import type { ArrangementTrack, TrackGroup } from '@/types/arrangement';
import type { TrackLayoutEntry } from './engine/TrackLayout';

const RULER_HEIGHT = 36;
const PANEL_WIDTH = 180;

interface TrackHeaderPanelProps {
  tracks: ArrangementTrack[];
  groups: TrackGroup[];
  entries: TrackLayoutEntry[];
  scrollY: number;
}

export const TrackHeaderPanel: React.FC<TrackHeaderPanelProps> = ({
  tracks,
  entries,
  scrollY,
}) => {
  const trackMap = new Map(tracks.map(t => [t.id, t]));
  const sortedEntries = [...entries].filter(e => e.visible).sort((a, b) => a.trackIndex - b.trackIndex);

  return (
    <div
      className="flex-shrink-0 overflow-hidden bg-dark-bgSecondary border-r border-dark-border flex flex-col"
      style={{ width: PANEL_WIDTH }}
    >
      {/* Top label aligned with ruler */}
      <div
        className="flex items-center px-3 border-b border-dark-border flex-shrink-0"
        style={{ height: RULER_HEIGHT }}
      >
        <span className="text-[10px] font-bold text-text-muted tracking-widest uppercase">
          Tracks
        </span>
      </div>

      {/* Scrollable track headers */}
      <div className="flex-1 overflow-hidden">
        <div
          style={{
            transform: `translateY(${-scrollY}px)`,
            willChange: 'transform',
          }}
        >
          {sortedEntries.map(entry => {
            const track = trackMap.get(entry.trackId);
            if (!track) return null;
            return (
              <TrackHeader
                key={track.id}
                track={track}
                height={entry.height}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
